import { escapeHtml, whenAms } from '../format'
import { deriveStatus, fetchRecentOrders } from './order-data'
import type { CommandHandler } from './router'

// /status: one screen | live site check, last deploy per service (from the
// tg-opsstate-* rows the ops webhooks maintain), Sentry alerts in the last
// 24h, and the /todo counts. The backend line needs no check: this reply
// being delivered proves the backend is up.

const SITE_URL = 'https://inovix.nl'
const SITE_TIMEOUT_MS = 5_000
const TODO_SCAN = 50 // same documented cap as /todo
const SENTRY_SCAN = 500

async function checkSite(): Promise<string> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), SITE_TIMEOUT_MS)
  try {
    const res = await fetch(SITE_URL, { signal: ctl.signal })
    return res.ok ? 'up' : `DOWN (HTTP ${res.status})`
  } catch {
    return 'DOWN (unreachable)'
  } finally {
    clearTimeout(timer)
  }
}

type OpsStateRow = {
  sent_at: Date | string | null
  payload: Record<string, unknown> | null
} | null

function deployLine(row: OpsStateRow): string {
  if (!row) return 'n/a'
  const status = row.payload?.status
  const at = (row.payload?.at as string | undefined) ?? row.sent_at
  const when = at ? ` | ${whenAms(at as string)}` : ''
  return `${escapeHtml(String(status ?? 'unknown'))}${when}`
}

export const statusCommand: CommandHandler = async ({ container, svc }) => {
  const site = await checkSite()

  const [railway, vercel, sentryState] = await Promise.all([
    svc.findEvent('tg-opsstate-railway'),
    svc.findEvent('tg-opsstate-vercel'),
    svc.findEvent('tg-opsstate-sentry'),
  ])

  const dayAgo = Date.now() - 24 * 3600 * 1000
  let sentryCount = 0
  try {
    const rows = await svc.listTelegramOpsEvents(
      { kind: 'ops_sentry' },
      { take: SENTRY_SCAN, order: { sent_at: 'DESC' } }
    )
    sentryCount = (rows as Array<{ sent_at?: Date | string | null } | null>).filter(
      (r) => r?.sent_at && new Date(r.sent_at as string).getTime() >= dayAgo
    ).length
  } catch {
    /* the count line degrades to 0; /status must always answer */
  }
  const lastSentryTitle = (sentryState?.payload as { title?: string } | null)?.title

  const orders = await fetchRecentOrders(container, TODO_SCAN)
  let needLabel = 0
  let needShipping = 0
  for (const o of orders) {
    const st = deriveStatus(o)
    if (st.canceled || !st.paid) continue
    if (!st.hasLabel) needLabel++
    else if (!st.shipped) needShipping++
  }

  return [
    '🩺 <b>Status</b>',
    `Site inovix.nl: ${site}`,
    'Backend: up (this reply proves it)',
    '',
    '<b>Last deploys</b>',
    `Railway: ${deployLine(railway)}`,
    `Vercel: ${deployLine(vercel)}`,
    '',
    `Sentry (24h): ${sentryCount}${lastSentryTitle ? ` | last: ${escapeHtml(lastSentryTitle)}` : ''}`,
    needLabel || needShipping
      ? `Todo: ${needLabel} need label, ${needShipping} need shipping`
      : 'Todo: Nothing to do',
  ].join('\n')
}
