import type { MedusaContainer } from '@medusajs/framework/types'
import { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import type TelegramOpsService from '../../../../../modules/telegram-ops/service'
import { escapeHtml } from '../../../../../modules/telegram-ops/format'
import { Sentry } from '../../../../../lib/instrument'

// Railway deployment webhook -> Telegram ops feed (N13/N14). Railway sends NO
// signature header, so the URL itself carries the secret as a path segment:
// /webhooks/ops/railway/<OPS_WEBHOOK_SECRET>. 401 before parsing on mismatch,
// 200 before async processing. Exact-match compare is fine here (random
// 32-byte secret, single operator | same reasoning as webhooks/telegram).

type RailwayWebhookBody = {
  type?: string
  status?: string
  project?: { name?: string }
  environment?: { name?: string }
  service?: { name?: string }
  deployment?: { id?: string }
}

const LOUD_STATUSES = new Set(['FAILED', 'CRASHED'])

async function processRailwayEvent(scope: MedusaContainer, body: RailwayWebhookBody): Promise<void> {
  const svc = scope.resolve('telegram_ops') as TelegramOpsService
  const logger = scope.resolve('logger') as { warn: (m: string) => void }

  if (body?.type !== 'DEPLOY' || !body.status || !body.deployment?.id) {
    logger.warn(`telegram-ops: railway webhook with unrecognized shape (type=${String(body?.type)}), skipped`)
    return
  }

  const status = body.status.toUpperCase()
  const loud = LOUD_STATUSES.has(status)
  if (!loud && status !== 'SUCCESS') return // intermediate statuses (BUILDING, DEPLOYING, ...) stay silent

  const text = loud
    ? `❌ Railway deploy ${escapeHtml(body.service?.name ?? 'unknown service')}: ${escapeHtml(status)}`
    : '✅ Railway deploy ok'

  await svc.notify(`tg-rw-${body.deployment.id}-${status}`, 'ops_deploy', text)
  await svc.touchEvent('tg-opsstate-railway', 'ops_state', {
    sent_at: new Date(),
    payload: { status, at: new Date().toISOString() },
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const secret = process.env.OPS_WEBHOOK_SECRET ?? ''
  const provided = (req.params?.secret as string | undefined) ?? ''

  if (!secret || provided !== secret) {
    res.sendStatus(401)
    return
  }

  res.sendStatus(200)

  try {
    await processRailwayEvent(req.scope, (req.body ?? {}) as RailwayWebhookBody)
  } catch (e) {
    Sentry.captureException(e, { tags: { route: 'webhooks/ops/railway' } })
  }
}
