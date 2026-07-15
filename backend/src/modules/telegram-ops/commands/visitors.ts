import { escapeHtml } from '../format'
import { periodBounds } from './sales'
import { fetchTopPages, fetchUmamiStats } from './umami'
import type { CommandHandler } from './router'

// /visitors [today|week] | Umami visitor stats: visitors, pageviews, top 5
// pages. Degrades to a single n/a line when Umami is unconfigured or down.

export const visitorsCommand: CommandHandler = async ({ args }) => {
  const period = args[0] === 'week' ? 'week' : 'today'
  const now = new Date()
  const { start } = periodBounds(period, now)
  const range = { startAt: start.getTime(), endAt: now.getTime() }
  const label = period === 'week' ? 'This week' : 'Today'

  const [stats, pages] = await Promise.all([fetchUmamiStats(range), fetchTopPages(range, 5)])
  if (!stats) {
    return [`👀 <b>${label}</b>`, 'Visitors: n/a (Umami not configured or unreachable)'].join('\n')
  }

  return [
    `👀 <b>${label}</b>`,
    `Visitors: ${stats.visitors}`,
    `Pageviews: ${stats.pageviews}`,
    ...(pages && pages.length
      ? ['', '<b>Top pages</b>', ...pages.map((p) => `${escapeHtml(p.path)} | ${p.views}`)]
      : []),
  ].join('\n')
}
