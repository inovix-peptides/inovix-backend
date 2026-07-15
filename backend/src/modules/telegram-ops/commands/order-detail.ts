import { escapeHtml, eur, line, orderGlyphs, whenAms } from '../format'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { deriveStatus, orderTotal, RawOrder } from './order-data'
import type { CommandHandler } from './router'

const DETAIL_FIELDS = [
  'id', 'display_id', 'created_at', 'total', 'currency_code', 'canceled_at', 'email',
  'summary.*',
  'payment_collections.status', 'payment_collections.captured_amount',
  'fulfillments.packed_at', 'fulfillments.shipped_at', 'fulfillments.canceled_at',
  'fulfillments.labels.tracking_number', 'fulfillments.labels.tracking_url',
  'shipping_address.country_code', 'shipping_address.city',
  'shipping_address.first_name', 'shipping_address.last_name',
  'items.title', 'items.quantity', 'items.unit_price',
]

export const orderDetailCommand: CommandHandler = async ({ container, args }) => {
  const displayId = parseInt(args[0] ?? '', 10)
  if (!displayId) return 'Usage: /order &lt;order number&gt;, e.g. /order 28412'
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'order',
    fields: DETAIL_FIELDS,
    filters: { display_id: displayId },
  })
  const o = (data?.[0] ?? null) as RawOrder | null
  if (!o) return `Order #${displayId} not found.`

  const st = deriveStatus(o)
  const addr = o.shipping_address
  const name = [addr?.first_name, addr?.last_name].filter(Boolean).join(' ')
  const items = (o.items ?? [])
    .filter((i) => !!i)
    .map((i) => `  ${i?.quantity ?? '?'}x ${escapeHtml(i?.title ?? '?')} (${eur(i?.unit_price)})`)
  const tracking = (o.fulfillments ?? [])
    .flatMap((f) => f?.labels ?? [])
    .map((l) => l?.tracking_url ? `<a href="${escapeHtml(l.tracking_url)}">${escapeHtml(l.tracking_number ?? 'track')}</a>` : escapeHtml(l?.tracking_number ?? ''))
    .filter(Boolean)

  return [
    `📄 <b>Order #${o.display_id}</b> ${orderGlyphs(st)}`,
    line('Placed', whenAms(o.created_at)),
    line('Total', `${eur(orderTotal(o))} ${o.currency_code?.toUpperCase() ?? ''}`),
    line('Customer', `${name || '?'}${o.email ? `, ${o.email}` : ''}`),
    line('Where', `${addr?.city ?? '?'}, ${(addr?.country_code ?? '?').toUpperCase()}`),
    '',
    '<b>Items</b>',
    ...items,
    ...(tracking.length ? ['', `Tracking: ${tracking.join(', ')}`] : []),
  ].join('\n')
}
