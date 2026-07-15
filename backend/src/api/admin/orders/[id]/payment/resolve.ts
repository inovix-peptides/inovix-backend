import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { BrokerClient } from "../../../../../modules/payment-via-broker/client"
import {
  BROKER_URL,
  BROKER_CLIENT_ID,
  BROKER_HMAC_SECRET,
  RELAY_BASE_URL,
  CF_KV_ACCOUNT_ID,
  CF_KV_NAMESPACE_ID,
  CF_KV_API_TOKEN,
} from "../../../../../lib/constants"
import {
  normalizeBrokerPayment,
  type BrokerLive,
  type RawMedusaPayment,
} from "../../../../../admin/widgets/order-payment-broker.logic"

// The Medusa provider id for the broker payment provider
// (pp_<config-id>_<identifier>). Payments created through any other provider
// are ignored | only the broker one can be inspected/refunded via Mollie.
export const PROVIDER_ID = "pp_via_broker_via_broker"

// The fields the GET/refund routes need off the order's broker payment.
// NOTE: payment has NO captured_amount/refunded_amount fields (query.graph
// silently returns undefined for unknown fields | that bug shipped as
// "Bedrag 0,00" in the admin and a wrongly-blocked checklist payment gate).
// The real sources are the capture/refund rows, summed by
// normalizeBrokerPayment below.
const PAYMENT_FIELDS = [
  "id",
  "provider_id",
  "currency_code",
  "amount",
  "raw_amount",
  "created_at",
  "captured_at",
  "canceled_at",
  "data",
  "captures.id",
  "captures.amount",
  "captures.created_at",
  "refunds.id",
  "refunds.amount",
  "refunds.created_at",
  "refunds.note",
  "refunds.refund_reason.label",
]

type QueryLike = {
  graph: (config: {
    entity: string
    fields: string[]
    filters: Record<string, unknown>
  }) => Promise<{ data: unknown[] }>
}

type OrderGraphRow = {
  id: string
  payment_collections?: Array<{
    payments?: RawMedusaPayment[] | null
  }> | null
}

// Resolve the single broker payment attached to an order, or null if the order
// has no payment that went through the broker provider.
export async function resolveBrokerPayment(
  query: QueryLike,
  orderId: string
): Promise<RawMedusaPayment | null> {
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      ...PAYMENT_FIELDS.map((f) => `payment_collections.payments.${f}`),
    ],
    filters: { id: orderId },
  })

  const order = (data as OrderGraphRow[])[0]
  if (!order) return null

  for (const collection of order.payment_collections ?? []) {
    for (const payment of collection.payments ?? []) {
      if (payment?.provider_id === PROVIDER_ID) {
        return normalizeBrokerPayment(payment)
      }
    }
  }
  return null
}

// Minimal shape we need from a broker client | lets tests inject a fake.
type BrokerLikeClient = {
  getPayment: (ref: string) => Promise<{
    status: string
    brokerPaymentId: string | null
    capturedAt: string | null
    method?: string | null
    paidAt?: string | null
    providerStatus?: string | null
  }>
}

function buildBrokerClient(): BrokerLikeClient | null {
  if (!BROKER_URL || !BROKER_CLIENT_ID || !BROKER_HMAC_SECRET) return null
  return new BrokerClient({
    brokerUrl: BROKER_URL,
    clientId: BROKER_CLIENT_ID,
    hmacSecret: BROKER_HMAC_SECRET,
    relayBaseUrl: RELAY_BASE_URL,
    cfKvAccountId: CF_KV_ACCOUNT_ID ?? "",
    cfKvNamespaceId: CF_KV_NAMESPACE_ID ?? "",
    cfKvApiToken: CF_KV_API_TOKEN ?? "",
  })
}

// Poll the broker (NOT Mollie directly) for the live payment status. Returns
// null when the broker is unconfigured or unreachable, so the caller can
// degrade to Medusa-side data instead of erroring. Only the opaque ref crosses
// the wire | no Inovix-identifying data.
export async function fetchBrokerLive(
  ref: string,
  deps?: {
    client?: BrokerLikeClient
    logger?: { warn: (m: string) => void }
  }
): Promise<BrokerLive> {
  const client = deps?.client ?? buildBrokerClient()
  if (!client) return null
  try {
    const payment = await client.getPayment(ref)
    return {
      status: payment.status,
      mollie_payment_id: payment.brokerPaymentId ?? null,
      captured_at: payment.capturedAt ?? null,
      method: payment.method ?? null,
      paid_at: payment.paidAt ?? null,
      mollie_status: payment.providerStatus ?? null,
    }
  } catch (err) {
    deps?.logger?.warn(
      `[admin payment] broker status poll failed for ${ref}: ${(err as Error).message}`
    )
    return null
  }
}

export const QUERY_KEY = ContainerRegistrationKeys.QUERY
