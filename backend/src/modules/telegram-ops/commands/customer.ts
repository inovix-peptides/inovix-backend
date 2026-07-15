import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { escapeHtml, eur, orderGlyphs, whenAms } from '../format'
import { deriveStatus, orderTotal, type RawOrder } from './order-data'
import type { CommandHandler } from './router'

const SCAN_TAKE = 1000

type CustomerOrder = RawOrder & { created_at: string }

// /customer <email or name> | order history + lifetime value. PII is fine
// here: this is an explicit on-demand lookup (same rule as /order detail).
export const customerCommand: CommandHandler = async ({ container, args }) => {
  const needle = args.join(' ').trim().toLowerCase()
  if (!needle) return 'Usage: /customer &lt;email or name&gt;, e.g. /customer jan@x.nl'

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'order',
    fields: [
      'id', 'display_id', 'created_at', 'canceled_at', 'email', 'total', 'currency_code',
      'summary.*',
      'payment_collections.status', 'payment_collections.captured_amount',
      'fulfillments.packed_at', 'fulfillments.shipped_at', 'fulfillments.canceled_at',
      'shipping_address.first_name', 'shipping_address.last_name', 'shipping_address.city', 'shipping_address.country_code',
    ],
    pagination: { take: SCAN_TAKE, skip: 0, order: { created_at: 'DESC' } },
  })
  const matches = ((data ?? []) as Array<CustomerOrder | null>)
    .filter(Boolean)
    .map((o) => o as CustomerOrder)
    .filter((o) => {
      const name = `${o.shipping_address?.first_name ?? ''} ${o.shipping_address?.last_name ?? ''}`.toLowerCase()
      return (o.email ?? '').toLowerCase().includes(needle) || name.includes(needle)
    })

  if (!matches.length) return `No customer found for "${escapeHtml(needle)}".`

  const active = matches.filter((o) => !o.canceled_at)
  const ltv = active.reduce((n, o) => n + orderTotal(o), 0)
  const latest = matches[0]
  const name = `${latest.shipping_address?.first_name ?? ''} ${latest.shipping_address?.last_name ?? ''}`.trim() || latest.email || '?'
  const orderLines = matches.slice(0, 10).map((o) =>
    `#${o.display_id} ${orderGlyphs(deriveStatus(o))} ${eur(orderTotal(o))} | ${whenAms(o.created_at)}`
  )
  return [
    `👤 <b>${escapeHtml(name)}</b>${latest.email ? ` | ${escapeHtml(latest.email)}` : ''}`,
    `${matches.length} order${matches.length === 1 ? '' : 's'} | lifetime ${eur(ltv)}`,
    '',
    ...orderLines,
    ...(matches.length > 10 ? [`... and ${matches.length - 10} more`] : []),
  ].join('\n')
}
