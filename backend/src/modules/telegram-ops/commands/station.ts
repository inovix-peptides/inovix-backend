import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import {
  buildVerzendstationQueues,
  QUEUE_ORDER_FIELDS,
  type QueueEntry,
  type QueueOrderRow,
} from '../../../lib/verzendstation-queues'
import { escapeHtml, whenAms } from '../format'

import type { CommandHandler } from './router'

const SCAN_LIMIT = 100

function queueLines(entries: QueueEntry[]): string[] {
  return entries.map((e) => {
    const when = e.packed_at ?? e.created_at
    return `#${e.display_id ?? '?'} ${escapeHtml(e.customer_name || '?')} | ${e.item_count} items | ${when ? whenAms(when) : '?'}`
  })
}

// /station | the Verzendstation queues (same derivation as /app/verzendstation):
// paid orders waiting for a label, and packed orders waiting to ship.
export const stationCommand: CommandHandler = async ({ container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'order',
    fields: QUEUE_ORDER_FIELDS,
    pagination: { take: SCAN_LIMIT, skip: 0, order: { created_at: 'DESC' } },
  })
  const queues = buildVerzendstationQueues(((data ?? []) as Array<QueueOrderRow | null>).filter(Boolean) as QueueOrderRow[])

  if (!queues.to_process.length && !queues.to_ship.length) {
    return '🎉 Nothing at the station. All orders handled.'
  }
  return [
    '<b>Verzendstation</b>',
    ...(queues.to_process.length
      ? ['', `📦 To process (${queues.to_process.length})`, ...queueLines(queues.to_process)]
      : []),
    ...(queues.to_ship.length
      ? ['', `🚚 To ship (${queues.to_ship.length})`, ...queueLines(queues.to_ship)]
      : []),
    '',
    'Open one with /order &lt;number&gt; for the checklist and actions.',
  ].join('\n')
}
