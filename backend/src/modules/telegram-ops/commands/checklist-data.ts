import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import type { MedusaContainer } from '@medusajs/framework/types'
import {
  allItemsTicked,
  deriveStepStates,
  evaluatePaymentGate,
  hasOverride,
  parseChecklist,
  type StepId,
  type StepState,
} from '../../../admin/widgets/order-fulfillment-checklist.logic'
import { customerNoteFromOrder } from '../../../admin/widgets/customer-note.logic'
import { normalizeBrokerPayment } from '../../../admin/widgets/order-payment-broker.logic'
import { customerNoteBlock, escapeHtml } from '../format'
import { itemQuantity } from './order-data'

const BROKER_PROVIDER_ID = 'pp_via_broker_via_broker'

// Same payment shape the Verzendstation queue derivation reads: query.graph
// has no captured_amount/refunded_amount on payments (unknown fields return
// undefined SILENTLY); the real amounts are the capture/refund rows.
export const CHECKLIST_ORDER_FIELDS = [
  'id',
  'display_id',
  'status',
  'canceled_at',
  'metadata',
  'items.id',
  'items.title',
  'items.quantity',
  'items.raw_quantity',
  'items.detail.quantity',
  'items.detail.raw_quantity',
  'fulfillments.packed_at',
  'fulfillments.shipped_at',
  'fulfillments.canceled_at',
  'payment_collections.payments.provider_id',
  'payment_collections.payments.amount',
  'payment_collections.payments.raw_amount',
  'payment_collections.payments.canceled_at',
  'payment_collections.payments.captures.amount',
  'payment_collections.payments.refunds.amount',
]

export type ChecklistViewItem = { id: string; title: string; qty: number; ticked: boolean }

export type ChecklistView = {
  orderId: string
  displayId: number
  items: ChecklistViewItem[]
  paymentOk: boolean
  packageClosed: boolean
  hasLabel: boolean
  shipped: boolean
  canceled: boolean
  steps: Record<StepId, StepState>
  /** The customer's checkout remark, null when they left none. */
  customerNote: string | null
}

// Load everything the phone checklist needs for one order. Items are sorted
// by id so tck:<order>:<index> callbacks resolve deterministically (line-item
// ids are too long for Telegram's 64-byte callback_data).
export async function loadChecklistView(container: MedusaContainer, orderId: string): Promise<ChecklistView | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'order',
    filters: { id: orderId },
    fields: CHECKLIST_ORDER_FIELDS,
  })
  const o = (data ?? [])[0] as {
    id: string
    display_id: number
    status?: string | null
    canceled_at?: string | null
    metadata?: Record<string, unknown> | null
    items?: Array<{ id: string; title?: string | null; quantity?: unknown; raw_quantity?: unknown; detail?: { quantity?: unknown; raw_quantity?: unknown } | null } | null> | null
    fulfillments?: Array<{ packed_at?: string | null; shipped_at?: string | null; canceled_at?: string | null } | null> | null
    payment_collections?: Array<{ payments?: Array<Record<string, unknown> | null> | null } | null> | null
  } | undefined
  if (!o) return null

  const checklist = parseChecklist(o.metadata)

  const items: ChecklistViewItem[] = (o.items ?? [])
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .map((i) => ({
      id: String(i.id),
      title: String(i.title ?? '?'),
      qty: itemQuantity(i as never) ?? 1,
      ticked: Boolean(checklist.items[String(i.id)]),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const activeFulfillments = (o.fulfillments ?? []).filter((f) => !!f && !f.canceled_at)
  const hasLabel = activeFulfillments.some((f) => f?.packed_at)
  const shipped = activeFulfillments.some((f) => f?.shipped_at)

  const payment = (o.payment_collections ?? [])
    .filter(Boolean)
    .flatMap((c) => c!.payments ?? [])
    .filter(Boolean)
    .find((p) => (p as { provider_id?: string }).provider_id === BROKER_PROVIDER_ID)
  const paymentOk = evaluatePaymentGate(
    payment ? (normalizeBrokerPayment(payment as never) as never) : null
  ).ok

  const steps = deriveStepStates({
    paymentOk,
    paymentOverridden: hasOverride(checklist, 'payment'),
    itemsTicked: allItemsTicked(items.map((i) => i.id), checklist),
    itemsOverridden: hasOverride(checklist, 'items'),
    hasLabel,
    packageClosed: Boolean(checklist.package_closed),
    shipped,
  })

  return {
    orderId: o.id,
    displayId: o.display_id,
    items,
    paymentOk,
    packageClosed: Boolean(checklist.package_closed),
    hasLabel,
    shipped,
    canceled: Boolean(o.canceled_at) || o.status === 'canceled',
    steps,
    // Read straight off the order: by the time a human opens a checklist the
    // order.placed copy has long landed. The N1 push is the only reader that
    // races the copy, and it uses resolveOrderCustomerNote instead.
    customerNote: customerNoteFromOrder(o),
  }
}

const STEP_GLYPH: Record<StepState, string> = {
  done: '✅',
  active: '⏳',
  locked: '🔒',
  blocked: '⛔',
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

export function renderChecklist(view: ChecklistView): { text: string; reply_markup?: Record<string, unknown> } {
  const ticked = view.items.filter((i) => i.ticked).length
  const lines = [
    `📋 <b>Checklist #${view.displayId}</b>${view.canceled ? ' | canceled' : ''}`,
    `${STEP_GLYPH[view.steps.payment]} Payment`,
    `${STEP_GLYPH[view.steps.pick]} Pick items (${ticked}/${view.items.length})`,
    `${STEP_GLYPH[view.steps.label]} DHL label`,
    `${STEP_GLYPH[view.steps.close]} Package closed`,
    `${STEP_GLYPH[view.steps.ship]} Shipped`,
    // Below the steps so it is the last thing read before packing starts.
    ...(view.customerNote ? [customerNoteBlock(view.customerNote)] : []),
  ]
  const text = lines.join('\n')

  if (view.canceled || view.shipped) return { text }

  const rows: Array<Array<{ text: string; callback_data: string }>> = []

  // Pick buttons only when the pick step is workable (payment done, not yet
  // superseded by a label) | mirrors the widget's sequential unlock.
  if (view.steps.pick === 'active') {
    view.items.forEach((item, idx) => {
      rows.push([{
        text: `${item.ticked ? '☑' : '☐'} ${item.qty}x ${truncate(item.title, 24)}`,
        callback_data: `tck:${view.orderId}:${idx}`,
      }])
    })
  }

  const actionRow: Array<{ text: string; callback_data: string }> = []
  if (view.steps.label === 'active') {
    actionRow.push({ text: '📦 Create label', callback_data: `lbl:${view.orderId}` })
  }
  if (view.steps.close === 'active') {
    actionRow.push({ text: '📦 Close package', callback_data: `cls:${view.orderId}` })
  } else if (view.packageClosed && !view.shipped) {
    actionRow.push({ text: '↩️ Reopen package', callback_data: `cls:${view.orderId}` })
  }
  if (view.steps.ship === 'active') {
    actionRow.push({ text: '🚚 Mark shipped', callback_data: `shp:${view.orderId}:${view.displayId}` })
  }
  if (actionRow.length) rows.push(actionRow)

  if (!rows.length) return { text }
  return { text, reply_markup: { inline_keyboard: rows } }
}

// One-line summary for /order detail.
export function checklistSummaryLine(view: ChecklistView): string {
  const ticked = view.items.filter((i) => i.ticked).length
  const parts = [
    `payment ${STEP_GLYPH[view.steps.payment]}`,
    `pick ${ticked}/${view.items.length}`,
    `label ${STEP_GLYPH[view.steps.label]}`,
    `closed ${STEP_GLYPH[view.steps.close]}`,
    `shipped ${STEP_GLYPH[view.steps.ship]}`,
  ]
  return `Checklist: ${escapeHtml(parts.join(' | '))}`
}
