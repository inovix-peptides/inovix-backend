import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { Sentry } from '../lib/instrument'
import { notifyOrderPaidOnTelegram } from './_helpers/telegram-order-paid'

// Mirrors src/subscribers/payment-captured.ts: resolve the order id from the
// capture payload (event.data.id is the payment id, not the order id) via
// payment.payment_collection.order.id, then delegate to the shared helper.
export default async function tgPaymentCapturedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const paymentId = data.id
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: payments } = await query.graph({
      entity: 'payment',
      filters: { id: paymentId },
      fields: ['id', 'payment_collection.order.id'],
    })
    const orderId = payments?.[0]?.payment_collection?.order?.id
    if (!orderId) return
    await notifyOrderPaidOnTelegram(container, orderId)
  } catch (e) {
    Sentry.captureException(e, { tags: { subscriber: 'tg-payment-captured' }, extra: { paymentId } })
  }
}

export const config: SubscriberConfig = {
  event: 'payment.captured',
}
