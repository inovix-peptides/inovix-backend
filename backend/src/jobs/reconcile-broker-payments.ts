import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"

import { Sentry } from "../lib/instrument"

const PROVIDER_ID = "pp_via_broker_via_broker"
// Only look back a few hours: a paid order is recovered within one job tick of
// payment, and an unpaid pending session's Mollie payment expires well before
// this, so older sessions are abandoned carts not worth re-polling.
const LOOKBACK_MS = 3 * 60 * 60 * 1000

type BrokerSession = {
  data?: { cart_id?: string } | null
  created_at?: string | Date | null
}

/**
 * Pure selection: the deduped cart ids of recent broker sessions that carry a
 * cart_id. Exported for unit testing the filtering without a live container.
 */
export function selectRecentBrokerCartIds(
  sessions: BrokerSession[],
  nowMs: number,
  lookbackMs: number = LOOKBACK_MS
): string[] {
  const ids = sessions
    .filter((s) => {
      const t = s.created_at ? new Date(s.created_at).getTime() : 0
      return Number.isFinite(t) && nowMs - t < lookbackMs
    })
    .map((s) => s.data?.cart_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
  return [...new Set(ids)]
}

/**
 * Safety net for the redirect-payment race: a customer can pay at Mollie and
 * then never land back on /checkout/return (closes the tab, the iDEAL app drops
 * the redirect, etc.), leaving a paid Mollie payment with no Inovix order. The
 * browser is the only thing that calls cart.complete, so without this the order
 * is lost even though the money was taken.
 *
 * This job finds recent broker carts that are not completed and attempts
 * completeCartWorkflow on each. That workflow live-polls the broker via the
 * provider's authorizePayment, so it ONLY creates an order when the payment is
 * genuinely paid | unpaid / mid-payment / expired carts are skipped. It is also
 * idempotent (Medusa returns the existing order if the browser already
 * completed the cart), so it cannot create duplicate orders or race the return.
 * Completing the cart fires the normal order-placed flow, so the customer still
 * gets their confirmation email.
 *
 * Nothing here is sent to Mollie | the broker poll only carries the opaque ref.
 */
export default async function reconcileBrokerPayments(
  container: MedusaContainer
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as {
    info: (m: string) => void
    warn: (m: string) => void
  }
  const paymentModule = container.resolve(Modules.PAYMENT)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const sessions = await paymentModule.listPaymentSessions(
    { provider_id: PROVIDER_ID },
    { select: ["id", "data", "created_at"], take: 300, order: { created_at: "DESC" } }
  )

  const cartIds = selectRecentBrokerCartIds(
    (sessions ?? []) as BrokerSession[],
    Date.now()
  )

  if (cartIds.length === 0) {
    logger.info("[reconcile-broker-payments] no recent broker carts to check")
    return
  }

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "completed_at"],
    filters: { id: cartIds },
  })
  const incomplete = (carts as Array<{ id: string; completed_at: string | null }>)
    .filter((c) => !c.completed_at)
    .map((c) => c.id)

  let reconciled = 0
  for (const id of incomplete) {
    try {
      const { result, errors } = await completeCartWorkflow(container).run({
        input: { id },
        throwOnError: false,
      })
      if (!errors?.length) {
        const orderId = (result as { id?: string } | undefined)?.id
        if (orderId) {
          reconciled++
          logger.info(
            `[reconcile-broker-payments] recovered paid-but-orphaned cart ${id} -> order ${orderId}`
          )
        }
      }
      // errors present => not paid yet / expired / already completed: skip
    } catch (err) {
      logger.warn(
        `[reconcile-broker-payments] cart ${id} completion attempt errored (non-fatal): ${(err as Error).message}`
      )
    }
  }

  if (reconciled > 0) {
    const msg = `[reconcile-broker-payments] recovered ${reconciled} paid order(s) the browser return did not finalise`
    logger.warn(msg)
    Sentry.captureMessage(msg, {
      level: "info",
      tags: { job: "reconcile-broker-payments" },
    })
  }
}

export const config = {
  name: "reconcile-broker-payments",
  // every 5 minutes
  schedule: "*/5 * * * *",
}
