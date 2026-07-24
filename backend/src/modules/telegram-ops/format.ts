export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function eur(n: number | string | null | undefined): string {
  const v = Number(n)
  return `€${(Number.isFinite(v) ? v : 0).toFixed(2)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function whenAms(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')} ${MONTHS[Number(get('month')) - 1]} ${get('hour')}:${get('minute')}`
}

export type GlyphInput = { paid: boolean; hasLabel: boolean; shipped: boolean; canceled: boolean }

export function orderGlyphs(o: GlyphInput): string {
  if (o.canceled) return '❌'
  return `${o.paid ? '✅' : '⏳'}${o.hasLabel ? '📦' : ''}${o.shipped ? '🚚' : ''}`
}

export function headline(emoji: string, text: string): string {
  return `${emoji} <b>${escapeHtml(text)}</b>`
}

export function line(label: string, value: string): string {
  return `${label}: ${escapeHtml(value)}`
}

/**
 * The customer's free-text order remark, as its own block.
 *
 * DELIBERATE EXCEPTION to the "no customer PII in pushed notifications" rule:
 * the operator chose full note text in the push over a presence flag on
 * 2026-07-24, because a note is only worth pushing if it can be acted on
 * without opening the app. See the inovix-telegram-ops skill.
 */
export function customerNoteBlock(note: string): string {
  return `\n📝 <b>Customer note</b>\n${escapeHtml(note)}`
}
