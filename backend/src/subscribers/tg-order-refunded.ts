import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { IPaymentModuleService } from '@medusajs/framework/types'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { eur, headline, line } from '../modules/telegram-ops/format'
import { TELEGRAM_OPS_MODULE } from '../modules/telegram-ops'
import type TelegramOpsService from '../modules/telegram-ops/service'
import { Sentry } from '../lib/instrument'

// Mirrors src/subscribers/order-refunded.ts: despite the file name, the
// actual event is `payment.refunded` and event.data.id is the payment id
// (verified from the email subscriber, not guessed). Same
// retrievePayment(relations: ['refunds', 'payment_collection']) lookup is
// reused here since it's the cheapest way to get the refund amount, which
// this push includes.
//
// Idempotency key: the brief's suggested `tg-refund-<order_id>-<amount>`
// would incorrectly collapse two distinct same-amount refunds on the same
// order into a single push. Since retrievePayment already returns the
// refund id at no extra query cost, we key on that instead:
// `tg-refund-<order_id>-<refund_id>`, which uniquely dedupes retries of the
// same refunded event without hiding a second genuine refund.
type RefundEventData = {
  id: string
}

export default async function tgOrderRefundedHandler({
  event: { data },
  container,
}: SubscriberArgs<RefundEventData>) {
  const paymentId = data.id
  try {
    const svc = container.resolve(TELEGRAM_OPS_MODULE) as TelegramOpsService
    if (!svc.isConfigured()) return

    const paymentModuleService: IPaymentModuleService = container.resolve(Modules.PAYMENT)
    const payment = await paymentModuleService.retrievePayment(paymentId, {
      relations: ['refunds', 'payment_collection'],
    })

    const refunds = (payment.refunds ?? []).slice().sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
      return bTime - aTime
    })
    const latestRefund = refunds[0]
    if (!latestRefund) return

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: 'order',
      filters: { 'payment_collections.payments.id': paymentId },
      fields: ['id', 'display_id'],
    })
    const order = orders?.[0]
    if (!order) return

    const refundAmount = Number(latestRefund.amount ?? 0)
    const text = [
      headline('↩️', 'Refund sent'),
      line('Order', `#${order.display_id}`),
      line('Amount', eur(refundAmount)),
    ].join('\n')
    await svc.notify(`tg-refund-${order.id}-${latestRefund.id}`, 'order_refunded', text)
  } catch (e) {
    Sentry.captureException(e, { tags: { subscriber: 'tg-order-refunded' }, extra: { paymentId } })
  }
}

export const config: SubscriberConfig = {
  event: 'payment.refunded',
}
