import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import type { MedusaContainer } from '@medusajs/framework/types'
import { customerNoteBlock, eur, headline, line } from '../../modules/telegram-ops/format'
import { itemQuantity, orderTotal } from '../../modules/telegram-ops/commands/order-data'
import { TELEGRAM_OPS_MODULE } from '../../modules/telegram-ops'
import type TelegramOpsService from '../../modules/telegram-ops/service'
import { resolveOrderCustomerNote, truncateCustomerNote } from '../../lib/customer-note'
import { Sentry } from '../../lib/instrument'

/** Push budget for the note. The full text is one tap away under /order. */
const PUSH_NOTE_MAX = 300

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
        'id', 'display_id', 'total', 'currency_code', 'summary.*',
        'payment_collections.status', 'payment_collections.captured_amount',
        'shipping_address.country_code', 'shipping_methods.name',
        'items.quantity', 'items.raw_quantity', 'items.detail.quantity', 'items.detail.raw_quantity',
      ],
    })
    const order = data?.[0]
    if (!order) return
    const pc = order.payment_collections?.[0]
    const paid = pc?.status === 'completed' || Number(pc?.captured_amount ?? 0) > 0
    if (!paid) return

    // itemQuantity/orderTotal: live query.graph returns bigNumber columns as
    // raw { value, precision } objects and puts quantity on items.detail.
    const itemCount = (order.items ?? []).reduce(
      (n: number, i: unknown) => n + (i ? itemQuantity(i as never) ?? 0 : 0),
      0
    )
    // Resolved (not read off order.metadata) because the copy subscriber fires
    // on the same event as this one: the cart fallback removes the race.
    const note = await resolveOrderCustomerNote(container, orderId)

    const text = [
      headline('🛒', `New order #${order.display_id}`),
      line('Total', eur(orderTotal(order as never))),
      line('Items', String(itemCount)),
      line('Country', (order.shipping_address?.country_code ?? '?').toUpperCase()),
      ...(order.shipping_methods?.[0]?.name ? [line('Shipping', order.shipping_methods[0].name)] : []),
      ...(note ? [customerNoteBlock(truncateCustomerNote(note, PUSH_NOTE_MAX))] : []),
    ].join('\n')
    await svc.notify(`tg-order-${order.id}`, 'order_paid', text, {
      reply_markup: { inline_keyboard: [[
        { text: '📋 Checklist', callback_data: `chk:${order.id}` },
        { text: '📦 Create label', callback_data: `lbl:${order.id}` },
        { text: 'Details', callback_data: `det:${order.display_id}` },
      ]] },
    })
  } catch (e) {
    const logger = container.resolve('logger')
    logger.error(`telegram-order-paid: failed for order ${orderId}: ${(e as Error).message}`)
    Sentry.captureException(e, { tags: { subscriber: 'telegram-order-paid' }, extra: { orderId } })
  }
}
