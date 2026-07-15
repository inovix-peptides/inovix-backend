import type { MedusaContainer } from '@medusajs/framework/types'
import { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import type TelegramOpsService from '../../../../modules/telegram-ops/service'
import { escapeHtml } from '../../../../modules/telegram-ops/format'
import { Sentry } from '../../../../lib/instrument'
import { hmacHex, safeEqualHex } from '../verify'

// Vercel deployment webhook -> Telegram ops feed (N13/N14). Vercel signs the
// RAW request body with hex HMAC-SHA1 in `x-vercel-signature`; the raw body is
// preserved via src/api/middlewares.ts. 401 BEFORE parsing on bad auth, 200
// BEFORE async processing.

type VercelWebhookBody = {
  id?: string
  type?: string
  payload?: {
    deployment?: { id?: string; name?: string; url?: string }
    links?: { deployment?: string }
    project?: { id?: string; name?: string }
  }
}

const LOUD_TYPES = new Set(['deployment.error', 'deployment.canceled'])

async function processVercelEvent(scope: MedusaContainer, body: VercelWebhookBody): Promise<void> {
  const svc = scope.resolve('telegram_ops') as TelegramOpsService
  const logger = scope.resolve('logger') as { warn: (m: string) => void }

  const type = body?.type ?? ''
  const id = body?.id ?? body?.payload?.deployment?.id
  if (!type || !id) {
    logger.warn('telegram-ops: vercel webhook with unrecognized shape, skipped')
    return
  }

  const loud = LOUD_TYPES.has(type)
  if (!loud && type !== 'deployment.succeeded') return // other event types stay silent

  const deployment = body.payload?.deployment
  const link = body.payload?.links?.deployment ?? (deployment?.url ? `https://${deployment.url}` : undefined)
  const text = loud
    ? [
        `❌ Vercel deploy ${escapeHtml(deployment?.name ?? body.payload?.project?.name ?? 'unknown project')}: ${escapeHtml(type)}`,
        ...(link ? [escapeHtml(link)] : []),
      ].join('\n')
    : '✅ Vercel deploy ok'

  await svc.notify(`tg-vc-${id}`, 'ops_deploy', text)
  await svc.touchEvent('tg-opsstate-vercel', 'ops_state', {
    sent_at: new Date(),
    payload: { status: type, at: new Date().toISOString() },
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const secret = process.env.VERCEL_WEBHOOK_SECRET ?? ''
  const signature = req.headers['x-vercel-signature']
  const raw = (req.rawBody as Buffer | undefined) ?? Buffer.alloc(0)

  if (!secret || typeof signature !== 'string' || !safeEqualHex(signature, hmacHex('sha1', secret, raw))) {
    res.sendStatus(401)
    return
  }

  res.sendStatus(200)

  try {
    await processVercelEvent(req.scope, (req.body ?? {}) as VercelWebhookBody)
  } catch (e) {
    Sentry.captureException(e, { tags: { route: 'webhooks/ops/vercel' } })
  }
}
