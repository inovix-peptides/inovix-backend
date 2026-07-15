import { MedusaService } from '@medusajs/framework/utils'
import { TelegramOpsEvent } from './models/ops-event-log'
import { sendTelegramRequest } from './telegram-client'
import { Sentry } from '../../lib/instrument'

export type TelegramOpsOptions = {
  botToken?: string
  webhookSecret?: string
  allowedChatIds?: string
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { name?: string; code?: string; message?: string }
  return (
    err?.name === 'UniqueConstraintViolationException' ||
    err?.code === '23505' ||
    /unique|duplicate/i.test(err?.message ?? '')
  )
}

class TelegramOpsService extends MedusaService({ TelegramOpsEvent }) {
  protected options_: TelegramOpsOptions
  protected logger_: { error?: (...args: unknown[]) => void } | undefined

  constructor(container: Record<string, unknown>, options: TelegramOpsOptions = {}) {
    super(...arguments)
    this.options_ = options
    this.logger_ = (container as { logger?: { error?: (...args: unknown[]) => void } })?.logger
  }

  botToken(): string {
    return this.options_.botToken ?? ''
  }

  webhookSecret(): string {
    return this.options_.webhookSecret ?? ''
  }

  allowedChatIds(): string[] {
    return (this.options_.allowedChatIds ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  isConfigured(): boolean {
    return Boolean(this.botToken()) && this.allowedChatIds().length > 0
  }

  async sendTo(chatId: string, text: string, extra: Record<string, unknown> = {}): Promise<void> {
    if (!this.botToken()) return
    const res = await sendTelegramRequest(this.botToken(), 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...extra,
    })
    if (!res.ok) {
      // Never let a failed-send report itself throw: sendTo must never throw,
      // callers treat notifications as fire-and-forget.
      try {
        const message = `telegram-ops: sendMessage to chat ${chatId} failed: ${res.description ?? 'unknown error'}`
        this.logger_?.error?.(message)
        // No message body: text can contain order data, only description + metadata.
        Sentry.captureMessage(message, {
          level: 'warning',
          tags: { module: 'telegram-ops' },
          extra: { chatId, description: res.description ?? null },
        })
      } catch {
        /* logging must never break sendTo */
      }
    }
  }

  async sendToAll(text: string, extra: Record<string, unknown> = {}): Promise<void> {
    if (!this.isConfigured()) return
    for (const chatId of this.allowedChatIds()) {
      await this.sendTo(chatId, text, extra)
    }
  }

  /**
   * Idempotent notification: claims `key` in telegram_ops_event first
   * (unique index), then sends. A concurrent duplicate (e.g. the
   * order.placed + payment.captured pair) loses the insert race and skips.
   * Claim-then-send means a Telegram outage can drop one message but never
   * double-send; notifications are advisory, orders are the record.
   */
  async notify(key: string, kind: string, text: string): Promise<boolean> {
    try {
      await this.createTelegramOpsEvents({ key, kind, sent_at: new Date(), payload: { text } })
    } catch (e) {
      if (isUniqueViolation(e)) return false
      throw e
    }
    await this.sendToAll(text)
    return true
  }
}

export default TelegramOpsService
