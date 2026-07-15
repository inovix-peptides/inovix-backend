import { eur, whenAms } from '../format'
import { deriveStatus, fetchRecentOrders, orderTotal } from './order-data'
import type { CommandHandler } from './router'

export const todoCommand: CommandHandler = async ({ container }) => {
  const orders = await fetchRecentOrders(container, 50)
  const needsLabel: string[] = []
  const needsShipping: string[] = []
  for (const o of orders) {
    const st = deriveStatus(o)
    if (st.canceled || !st.paid) continue
    const row = `#${o.display_id} ${eur(orderTotal(o))} | ${whenAms(o.created_at)}`
    if (!st.hasLabel) needsLabel.push(row)
    else if (!st.shipped) needsShipping.push(row)
  }
  if (!needsLabel.length && !needsShipping.length) return '🎉 Nothing to do. All orders handled.'
  return [
    '<b>To do</b>',
    ...(needsLabel.length ? ['', `📦 Needs label (${needsLabel.length})`, ...needsLabel] : []),
    ...(needsShipping.length ? ['', `🚚 Needs shipping (${needsShipping.length})`, ...needsShipping] : []),
  ].join('\n')
}
