import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import type { MedusaContainer } from '@medusajs/framework/types'
import { eur, headline, line } from '../../modules/telegram-ops/format'
import { TELEGRAM_OPS_MODULE } from '../../modules/telegram-ops'
import type TelegramOpsService from '../../modules/telegram-ops/service'
import { Sentry } from '../../lib/instrument'

/**
 * N1: "new paid order". Called from BOTH tg-order-placed and
 * tg-payment-captured (whichever fires second sees the payment as captured);
 * the `tg-order-<id>` idempotency key makes the pair send exactly once.
 * Push contains NO customer name/email/address (privacy rule): only order
 * number, total, item count, country, shipping option.
 */
export async function notifyOrderPaidOnTelegram(container: MedusaContainer, orderId: string): Promise<void> {
  try {
    const svc = container.resolve(TELEGRAM_OPS_MODULE) as TelegramOpsService
    if (!svc.isConfigured()) return
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: 'order',
      filters: { id: orderId },
      fields: [
        'id', 'display_id', 'total', 'currency_code',
        'payment_collections.status', 'payment_collections.captured_amount',
        'shipping_address.country_code', 'items.quantity', 'shipping_methods.name',
      ],
    })
    const order = data?.[0]
    if (!order) return
    const pc = order.payment_collections?.[0]
    const paid = pc?.status === 'completed' || Number(pc?.captured_amount ?? 0) > 0
    if (!paid) return

    const itemCount = (order.items ?? []).reduce((n: number, i: { quantity?: number | string }) => n + Number(i?.quantity ?? 0), 0)
    const text = [
      headline('🛒', `New order #${order.display_id}`),
      line('Total', eur(order.total)),
      line('Items', String(itemCount)),
      line('Country', (order.shipping_address?.country_code ?? '?').toUpperCase()),
      ...(order.shipping_methods?.[0]?.name ? [line('Shipping', order.shipping_methods[0].name)] : []),
    ].join('\n')
    await svc.notify(`tg-order-${order.id}`, 'order_paid', text)
  } catch (e) {
    Sentry.captureException(e, { tags: { subscriber: 'telegram-order-paid' }, extra: { orderId } })
  }
}
