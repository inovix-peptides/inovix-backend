import type { MedusaContainer } from '@medusajs/framework/types'
import { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import type TelegramOpsService from '../../../../modules/telegram-ops/service'
import { escapeHtml } from '../../../../modules/telegram-ops/format'
import { Sentry } from '../../../../lib/instrument'
import { hmacHex, safeEqualHex } from '../verify'

// Sentry issue-alert webhook -> Telegram ops feed (N12). Sentry signs the RAW
// request body with hex HMAC-SHA256 in `sentry-hook-signature`; the raw body
// is preserved via src/api/middlewares.ts. 401 BEFORE parsing on bad auth,
// 200 BEFORE async processing (mirrors src/api/webhooks/telegram/route.ts).

type SentryWebhookBody = {
  data?: {
    event?: {
      title?: string
      culprit?: string | null
      web_url?: string
      url?: string
      issue_id?: string | number
      event_id?: string
    }
    issue?: {
      id?: string | number
      title?: string
      culprit?: string | null
      web_url?: string
    }
  }
}

async function processSentryEvent(scope: MedusaContainer, body: SentryWebhookBody): Promise<void> {
  const svc = scope.resolve('telegram_ops') as TelegramOpsService
  const logger = scope.resolve('logger') as { warn: (m: string) => void }

  const event = body?.data?.event
  const issue = body?.data?.issue
  const title = event?.title ?? issue?.title
  const id = issue?.id ?? event?.issue_id ?? event?.event_id
  if (!title || id == null) {
    logger.warn('telegram-ops: sentry webhook with unrecognized shape, skipped')
    return
  }

  const culprit = event?.culprit ?? issue?.culprit
  const link = event?.web_url ?? event?.url ?? issue?.web_url
  const lines = [`🐞 <b>Sentry: ${escapeHtml(title)}</b>`]
  if (culprit) lines.push(`Culprit: ${escapeHtml(culprit)}`)
  if (link) lines.push(escapeHtml(link))

  await svc.notify(`tg-sentry-${id}`, 'ops_sentry', lines.join('\n'))
  await svc.touchEvent('tg-opsstate-sentry', 'ops_state', {
    sent_at: new Date(),
    payload: { title, at: new Date().toISOString() },
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const secret = process.env.SENTRY_WEBHOOK_SECRET ?? ''
  const signature = req.headers['sentry-hook-signature']
  const raw = (req.rawBody as Buffer | undefined) ?? Buffer.alloc(0)

  if (!secret || typeof signature !== 'string' || !safeEqualHex(signature, hmacHex('sha256', secret, raw))) {
    res.sendStatus(401)
    return
  }

  // Acknowledge before processing: a slow Telegram send must never make
  // Sentry retry (and double-notify).
  res.sendStatus(200)

  try {
    await processSentryEvent(req.scope, (req.body ?? {}) as SentryWebhookBody)
  } catch (e) {
    Sentry.captureException(e, { tags: { route: 'webhooks/ops/sentry' } })
  }
}
