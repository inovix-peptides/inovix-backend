import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { headline, line } from '../modules/telegram-ops/format'
import { TELEGRAM_OPS_MODULE } from '../modules/telegram-ops'
import type TelegramOpsService from '../modules/telegram-ops/service'
import { Sentry } from '../lib/instrument'

// Mirrors src/subscribers/order-shipped.ts / _helpers/send-order-shipped.ts:
// event `shipment.created`, event.data.id is the fulfillment id, order +
// tracking number resolved via the same `fulfillments.id` filter and
// `fulfillments.labels.tracking_number` field path.
export default async function tgShipmentCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  const fulfillmentId = data.id
  try {
    const svc = container.resolve(TELEGRAM_OPS_MODULE) as TelegramOpsService
    if (!svc.isConfigured()) return

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: 'order',
      filters: { 'fulfillments.id': fulfillmentId },
      fields: [
        'id',
        'display_id',
        'fulfillments.id',
        'fulfillments.labels.tracking_number',
      ],
    })
    const order = orders?.[0]
    if (!order) return

    const fulfillment = order.fulfillments?.find((f: { id: string }) => f.id === fulfillmentId)
    const trackingNumber = fulfillment?.labels?.[0]?.tracking_number

    const text = [
      headline('🚚', `Shipped #${order.display_id}`),
      ...(trackingNumber ? [line('Tracking', trackingNumber)] : []),
    ].join('\n')
    await svc.notify(`tg-shipped-${fulfillmentId}`, 'shipment_created', text)
  } catch (e) {
    Sentry.captureException(e, { tags: { subscriber: 'tg-shipment-created' }, extra: { fulfillmentId } })
  }
}

export const config: SubscriberConfig = {
  event: 'shipment.created',
}
