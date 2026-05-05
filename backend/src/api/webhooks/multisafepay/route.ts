import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import type {
  IEventBusModuleService,
  INotificationModuleService,
  IPaymentModuleService,
  Logger,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { MultisafepayClient } from "../../../modules/payment-multisafepay/client"
import type {
  MultisafepayEnvironment,
  MultisafepayOrder,
  MultisafepayWebhookPayload,
} from "../../../modules/payment-multisafepay/types"
import { Sentry } from "../../../lib/instrument"
import { EmailTemplates } from "../../../modules/email-notifications/templates"

const PROVIDER_ID = "pp_multisafepay_multisafepay"
const PAID_STATUSES = ["completed"] as const
const FAILED_STATUSES = [
  "declined",
  "expired",
  "cancelled",
  "void",
] as const

// MSP fires the webhook within ~2s of payment, but the customer's redirect
// back to the storefront + cart.complete round-trip can easily take 10-30s.
// Suppress the abandoned-cart alert during that race window | only flag
// genuinely stuck carts that have had time to complete and didn't.
const ABANDONED_CART_GRACE_MS = 10 * 60 * 1000

// MSP retries up to 3x at 15-min intervals on non-200, and may also fire
// legitimate state-change webhooks (e.g. uncleared -> completed). To stop
// admin emails, payment.failed events, and Sentry captures from doubling
// up, dedupe successful side-effect runs in-memory by (mspOrderId:status)
// for a window that comfortably covers MSP's retry envelope.
const IDEMPOTENCY_TTL_MS = 30 * 60 * 1000
const idempotencyCache = new Map<string, number>()

function sweepIdempotencyCache(now: number): void {
  for (const [key, ts] of idempotencyCache) {
    if (now - ts >= IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key)
    }
  }
}

function hasRecentlyProcessed(key: string, now: number): boolean {
  const ts = idempotencyCache.get(key)
  if (ts === undefined) return false
  return now - ts < IDEMPOTENCY_TTL_MS
}

// Exposed for tests; not part of the public route contract.
export function __resetIdempotencyCacheForTests(): void {
  idempotencyCache.clear()
}

function getClient(): MultisafepayClient | null {
  const apiKey = process.env.MULTISAFEPAY_API_KEY
  if (!apiKey) return null
  return new MultisafepayClient({
    apiKey,
    environment:
      (process.env.MULTISAFEPAY_ENVIRONMENT as MultisafepayEnvironment | undefined) ??
      "production",
  })
}

function formatAmount(amount: number, currency: string): string {
  const locale = currency?.toLowerCase() === "eur" ? "nl-NL" : "en-US"
  try {
    return new Intl.NumberFormat(locale, {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount / 100)
  } catch {
    return (amount / 100).toFixed(2)
  }
}

// MSP retries 3x at 15-min intervals on a non-200 response, with the same
// signed timestamp. Always reply 200 + plain text "OK" to acknowledge per
// https://docs.multisafepay.com/docs/webhook so MSP doesn't keep retrying.
function ackOk(res: MedusaResponse): void {
  res.status(200).type("text/plain").send("OK")
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const paymentModule = req.scope.resolve(Modules.PAYMENT)
  const logger = req.scope.resolve("logger") as Logger

  try {
    // Medusa's getWebhookActionAndData prepends `pp_` to `provider`, so pass
    // the bare identifier (without the prefix that PROVIDER_ID carries).
    // Always run this regardless of dedupe state | Medusa's session-state
    // update is idempotent on its own and we want it to keep up with any
    // legitimate state changes MSP delivers.
    await paymentModule.getWebhookActionAndData({
      provider: PROVIDER_ID.replace(/^pp_/, ""),
      payload: {
        data: (req.body ?? {}) as Record<string, unknown>,
        rawData: req.rawBody as Buffer,
        headers: req.headers as Record<string, string>,
      },
    })

    // Fetch the MSP order once and share it across both side-effect helpers
    // (cuts MSP API calls in half and lets us dedupe on a single status).
    const body = req.body as MultisafepayWebhookPayload | undefined
    const order = await fetchOrderFromWebhook(body).catch((err) => {
      logger.error(
        `MultiSafepay webhook order lookup failed: ${(err as Error).message}`
      )
      return null
    })

    const now = Date.now()
    sweepIdempotencyCache(now)

    const idempotencyKey = order
      ? `${order.orderId}:${order.status}`
      : null
    const alreadyProcessed =
      idempotencyKey !== null && hasRecentlyProcessed(idempotencyKey, now)

    if (order && !alreadyProcessed) {
      let abandonedFailed = false
      let paymentFailedFailed = false

      await checkAbandonedCartPaid(req, logger, order).catch((err) => {
        abandonedFailed = true
        logger.error(
          `MultiSafepay webhook abandoned-cart check failed: ${(err as Error).message}`
        )
        Sentry.captureException(err, {
          tags: { route: "multisafepay-webhook-abandoned-cart" },
        })
      })

      await emitPaymentFailed(req, logger, order).catch((err) => {
        paymentFailedFailed = true
        logger.error(
          `MultiSafepay webhook payment-failed emit failed: ${(err as Error).message}`
        )
        Sentry.captureException(err, {
          tags: { route: "multisafepay-webhook-payment-failed" },
        })
      })

      // Only stamp the dedupe cache when BOTH side effects succeeded.
      // Otherwise a transient Resend/EventBus failure would silently mute
      // the next ~30min of retries for the same (orderId, status), and
      // we'd never recover until the next status transition.
      if (idempotencyKey && !abandonedFailed && !paymentFailedFailed) {
        idempotencyCache.set(idempotencyKey, now)
      }
    } else if (alreadyProcessed) {
      logger.info(
        `MultiSafepay webhook: skipping side effects, already processed ${idempotencyKey} within ${IDEMPOTENCY_TTL_MS / 60000}m`
      )
    }

    ackOk(res)
  } catch (err) {
    logger.error(
      `MultiSafepay webhook handling failed: ${(err as Error).message}`
    )
    Sentry.captureException(err, {
      tags: { route: "multisafepay-webhook-post" },
    })
    // Still ack | retries don't fix application bugs and just amplify them.
    ackOk(res)
  }
}

// MSP also supports GET notifications (?transactionid=...&timestamp=...).
// We don't subscribe to GET, but accept and ack one to be defensive in case
// a manual "Resend webhook" from the MSP dashboard fires GET.
export async function GET(
  _req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  ackOk(res)
}

type SessionDataShape = {
  mspOrderId?: string
  transactionId?: string
}

async function fetchOrderFromWebhook(
  body: MultisafepayWebhookPayload | undefined
): Promise<MultisafepayOrder | null> {
  if (!body?.order_id) return null
  const client = getClient()
  if (!client) return null
  return client.getOrder(body.order_id)
}

async function checkAbandonedCartPaid(
  req: MedusaRequest,
  logger: Logger,
  order: MultisafepayOrder
): Promise<void> {
  if (!PAID_STATUSES.includes(order.status as (typeof PAID_STATUSES)[number])) return

  const paymentModule = req.scope.resolve(Modules.PAYMENT) as IPaymentModuleService
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  const sessions = await paymentModule.listPaymentSessions(
    {
      provider_id: PROVIDER_ID,
      created_at: { $gte: cutoff },
    },
    { take: 500 }
  )

  const session = sessions.find(
    (s) =>
      String((s.data as SessionDataShape | undefined)?.mspOrderId ?? "") ===
      String(order.orderId)
  )

  if (!session?.payment_collection_id) {
    logger.warn(
      `abandoned-cart check: no Medusa payment session for MSP order ${order.orderId}`
    )
    Sentry.captureMessage(
      "multisafepay webhook: paid order with no matching Medusa payment session",
      {
        level: "warning",
        tags: { route: "multisafepay-webhook-abandoned-cart", kind: "no-session" },
        extra: {
          orderId: order.orderId,
          transactionId: order.transactionId,
          amount: order.amountCents,
        },
      }
    )
    return
  }

  // Cart has no direct `payment_collection_id` column; the link is on
  // payment_collection. Traverse from there to reach the cart.
  const { data: collections } = await query.graph({
    entity: "payment_collection",
    fields: [
      "id",
      "cart.id",
      "cart.email",
      "cart.completed_at",
      "cart.currency_code",
    ],
    filters: { id: session.payment_collection_id },
  })

  const cart = (collections?.[0] as { cart?: unknown } | undefined)?.cart as
    | {
        id: string
        email?: string | null
        completed_at?: string | null
        currency_code?: string | null
      }
    | undefined

  if (cart?.completed_at) return

  // Don't fire during the normal redirect race | if the session was just
  // created, the storefront probably hasn't called cart.complete yet.
  const sessionCreatedAt = (session as { created_at?: string | Date | null })
    .created_at
  if (sessionCreatedAt) {
    const ageMs = Date.now() - new Date(sessionCreatedAt).getTime()
    if (ageMs >= 0 && ageMs < ABANDONED_CART_GRACE_MS) {
      logger.info(
        `abandoned-cart check: skipping for MSP order ${order.orderId} (session ${Math.round(ageMs / 1000)}s old, within grace)`
      )
      return
    }
  }

  const amount = order.amountCents
  const currency = order.currencyCode || cart?.currency_code || "EUR"
  const amountFormatted = formatAmount(amount, currency)

  Sentry.captureMessage(
    "multisafepay webhook: paid but no Medusa order (abandoned cart)",
    {
      level: "error",
      tags: { route: "multisafepay-webhook-abandoned-cart", kind: "abandoned-paid" },
      extra: {
        orderId: order.orderId,
        transactionId: order.transactionId,
        amount,
        currency,
        customerEmail: order.customerEmail ?? cart?.email ?? null,
        cartId: cart?.id ?? null,
        paymentSessionId: session.id,
        paymentCollectionId: session.payment_collection_id,
      },
    }
  )

  const adminEmail = process.env.SUPPORT_EMAIL || process.env.CONTACT_EMAIL
  if (!adminEmail) {
    logger.warn(
      "abandoned-cart-paid detected but SUPPORT_EMAIL/CONTACT_EMAIL not set; skipping admin email"
    )
    return
  }

  const notificationModule = req.scope.resolve(
    Modules.NOTIFICATION
  ) as INotificationModuleService

  await notificationModule.createNotifications({
    to: adminEmail,
    channel: "email",
    template: EmailTemplates.ABANDONED_CART_PAID,
    // Belt-and-braces dedupe key: the in-memory cache muffles same-process
    // duplicates, this catches anything that slips through after a restart.
    idempotency_key: `abandoned-cart-paid-${order.orderId}`,
    data: {
      emailOptions: {
        subject: `[Inovix] Abandoned cart paid | MSP ${order.orderId}`,
      },
      transactionId: order.transactionId ?? "",
      orderCode: order.orderId,
      amountFormatted,
      currency,
      customerEmail: order.customerEmail ?? null,
      cartId: cart?.id ?? null,
      cartEmail: cart?.email ?? null,
      paymentMethod: order.paymentMethod ?? null,
      detectedAt: new Date().toISOString(),
      preview: "Betaling ontvangen maar geen order in Medusa",
    },
  })

  logger.warn(
    `abandoned-cart-paid alert sent for MSP order ${order.orderId}, cart ${cart?.id ?? "unknown"}`
  )
}

async function emitPaymentFailed(
  req: MedusaRequest,
  logger: Logger,
  order: MultisafepayOrder
): Promise<void> {
  if (!FAILED_STATUSES.includes(order.status as (typeof FAILED_STATUSES)[number])) return

  const eventBus = req.scope.resolve(Modules.EVENT_BUS) as IEventBusModuleService

  await eventBus.emit({
    name: "payment.failed",
    data: {
      session_id: order.orderId,
      transaction_id: order.transactionId ?? null,
      amount: order.amountCents,
      currency_code: order.currencyCode,
      customer_email: order.customerEmail ?? null,
      customer_name: order.customerFullName ?? null,
      status_id: order.status,
    },
  })

  logger.info(
    `payment.failed emitted for MSP order ${order.orderId}, status ${order.status}`
  )
}
