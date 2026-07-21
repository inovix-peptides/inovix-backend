import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { autoCompleteOrderIfDone } from '../lib/auto-complete-order'
import { Sentry } from '../lib/instrument'

// Covers Medusa's NATIVE mark-shipped path only. The operator flows (admin
// checklist widget, Telegram bot, auto-mark-shipped cron) all go through
// markDhlOrderShipped, which calls the module services directly and never
// emits shipment.created; that path invokes autoCompleteOrderIfDone itself.
export default async function orderAutoCompleteHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  const fulfillmentId = data.id
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    // Resolve the order via the order_fulfillment link entity; filtering
    // orders on fulfillments.id generates broken SQL on Medusa 2.12 (see
    // tg-shipment-created.ts / Sentry INOVIX-BACKEND-B).
    const { data: links } = await query.graph({
      entity: 'order_fulfillment',
      filters: { fulfillment_id: fulfillmentId },
      fields: ['order_id'],
    })
    const orderId = (links?.[0] as { order_id?: string } | undefined)?.order_id
    if (!orderId) return

    await autoCompleteOrderIfDone(container, orderId, 'shipment.created')
  } catch (e) {
    const logger = container.resolve('logger')
    logger.error(
      `order-auto-complete: failed for fulfillment ${fulfillmentId}: ${(e as Error).message}`
    )
    Sentry.captureException(e, {
      tags: { subscriber: 'order-auto-complete' },
      extra: { fulfillmentId },
    })
  }
}

export const config: SubscriberConfig = {
  event: 'shipment.created',
}
