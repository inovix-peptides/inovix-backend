import { escapeHtml, whenAms } from '../format'
import type { CommandHandler } from './router'

type ActionRow = { kind: string; sent_at: Date | string | null; actor_name: string | null; payload: Record<string, unknown> | null }

function describeAction(r: ActionRow): string {
  const p = r.payload ?? {}
  if (r.kind === 'act_restock') return `➕ +${p.qty ?? '?'} ${escapeHtml(String(p.name ?? '?'))}`
  if (r.kind === 'act_label') return `📦 Label #${p.display_id ?? '?'}${p.override ? ' (override)' : ''}`
  if (r.kind === 'act_ship') return `🚚 Shipped #${p.display_id ?? '?'}`
  if (r.kind === 'act_email') return `✉️ Resent email${p.template ? ` ${escapeHtml(String(p.template))}` : ''}`
  return escapeHtml(r.kind)
}

// Audit readback: telegram_ops_event is the system of record for bot-made
// changes (Medusa itself has no audit trail for inventory adjustments).
export const logCommand: CommandHandler = async ({ svc, args }) => {
  const n = Math.min(Math.max(parseInt(args[0] ?? '', 10) || 20, 1), 50)
  const rows = (await svc.listRecentActions(n)) as ActionRow[]
  if (!rows.length) return 'No bot actions recorded yet.'
  const lines = rows.map((r) =>
    `${describeAction(r)} | ${escapeHtml(r.actor_name ?? '?')}, ${r.sent_at ? whenAms(r.sent_at as never) : '?'}`
  )
  return [`<b>Bot actions | last ${rows.length}</b>`, '', ...lines].join('\n')
}
