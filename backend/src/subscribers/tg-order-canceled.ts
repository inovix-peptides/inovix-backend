import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { headline } from '../modules/telegram-ops/format'
import { TELEGRAM_OPS_MODULE } from '../modules/telegram-ops'
import type TelegramOpsService from '../modules/telegram-ops/service'
import { Sentry } from '../lib/instrument'

// Mirrors src/subscribers/order-cancelled.ts's event name (`order.canceled`,
// despite the file being named order-cancelled.ts) and event.data.id being
// the order id. Only the display_id is needed for the push, so this uses a
// minimal query.graph lookup instead of the email subscriber's heavier
// retrieveOrder(relations: items/summary/shipping_address).
export default async function tgOrderCanceledHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id
  try {
    const svc = container.resolve(TELEGRAM_OPS_MODULE) as TelegramOpsService
    if (!svc.isConfigured()) return

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: 'order',
      filters: { id: orderId },
      fields: ['id', 'display_id'],
    })
    const order = orders?.[0]
    if (!order) return

    const text = headline('❌', `Order #${order.display_id} canceled`)
    await svc.notify(`tg-cancel-${order.id}`, 'order_canceled', text)
  } catch (e) {
    Sentry.captureException(e, { tags: { subscriber: 'tg-order-canceled' }, extra: { orderId } })
  }
}

export const config: SubscriberConfig = {
  event: 'order.canceled',
}
