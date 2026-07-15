import { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import { handleUpdate, TelegramUpdate } from '../../../modules/telegram-ops/commands/router'
import type TelegramOpsService from '../../../modules/telegram-ops/service'
import { Sentry } from '../../../lib/instrument'

// No AUTHENTICATE flag: this mirrors src/api/payments/broker-callback/route.ts,
// which declares no such export either. Routes outside /admin and /store are
// public by default, and the shared secret header below is the real gate.

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const svc = req.scope.resolve('telegram_ops') as TelegramOpsService
  const secret = svc.webhookSecret()
  const header = req.headers['x-telegram-bot-api-secret-token']

  // Constant secret comparison is not needed here (single operator, random
  // 32-byte secret), but the secret MUST be configured and match exactly.
  if (!secret || header !== secret) {
    res.sendStatus(401)
    return
  }

  // Acknowledge immediately: Telegram retries slow/failed webhooks, which
  // would double-process commands.
  res.sendStatus(200)

  try {
    await handleUpdate(req.scope, req.body as TelegramUpdate)
  } catch (e) {
    Sentry.captureException(e, { tags: { route: 'webhooks/telegram' } })
  }
}
