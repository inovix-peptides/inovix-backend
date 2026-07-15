import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { notifyOrderPaidOnTelegram } from './_helpers/telegram-order-paid'

export default async function tgOrderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  await notifyOrderPaidOnTelegram(container, data.id)
}

export const config: SubscriberConfig = { event: 'order.placed' }
