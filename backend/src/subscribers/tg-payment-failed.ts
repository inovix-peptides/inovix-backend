import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { eur, headline, line } from '../modules/telegram-ops/format'
import { TELEGRAM_OPS_MODULE } from '../modules/telegram-ops'
import type TelegramOpsService from '../modules/telegram-ops/service'
import { Sentry } from '../lib/instrument'

// Mirrors src/subscribers/payment-failed.ts for the event name and payload
// shape (session_id/transaction_id/amount/currency_code). No customer email
// or name is included in the push (privacy rule).
type PaymentFailedData = {
  session_id?: string | null
  transaction_id?: string | null
  amount?: number | null
  currency_code?: string | null
}

export default async function tgPaymentFailedHandler({
  event: { data },
  container,
}: SubscriberArgs<PaymentFailedData>) {
  // Mirror the email subscriber's idempotency fallback: when both ids are
  // absent, use a unique component so distinct failures still notify instead
  // of collapsing onto one key and being silently skipped.
  const dedupeId = data.transaction_id ?? data.session_id ?? `unknown-${Date.now()}`
  try {
    const svc = container.resolve(TELEGRAM_OPS_MODULE) as TelegramOpsService
    if (!svc.isConfigured()) return

    const text = [
      headline('⚠️', 'Payment failed'),
      ...(data.amount != null ? [line('Amount', eur(data.amount))] : []),
    ].join('\n')
    await svc.notify(`tg-payfail-${dedupeId}`, 'payment_failed', text)
  } catch (e) {
    const logger = container.resolve('logger')
    logger.error(
      `tg-payment-failed: failed for session ${data.session_id ?? 'unknown'}: ${(e as Error).message}`
    )
    Sentry.captureException(e, {
      tags: { subscriber: 'tg-payment-failed' },
      extra: { sessionId: data.session_id, transactionId: data.transaction_id },
    })
  }
}

export const config: SubscriberConfig = {
  event: 'payment.failed',
}
