import { eur, orderGlyphs, whenAms } from '../format'
import { deriveStatus, fetchRecentOrders, itemQuantity, orderTotal } from './order-data'
import type { CommandHandler } from './router'

export const ordersCommand: CommandHandler = async ({ container, args }) => {
  const take = Math.min(Math.max(parseInt(args[0] ?? '10', 10) || 10, 1), 25)
  const orders = await fetchRecentOrders(container, take)
  if (!orders.length) return 'No orders yet.'
  const lines = orders.map((o) => {
    const itemCount = (o.items ?? []).reduce((n, i) => n + (i ? itemQuantity(i) ?? 0 : 0), 0)
    const cc = (o.shipping_address?.country_code ?? '?').toUpperCase()
    return `#${o.display_id} ${orderGlyphs(deriveStatus(o))} ${eur(orderTotal(o))} | ${itemCount} items | ${cc} | ${whenAms(o.created_at)}`
  })
  return [`<b>Last ${orders.length} orders</b>`, '', ...lines, '', 'Legend: ✅ paid 📦 label 🚚 shipped ❌ canceled'].join('\n')
}
