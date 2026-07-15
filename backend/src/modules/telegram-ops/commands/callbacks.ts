import type { MedusaContainer } from '@medusajs/framework/types'
import type TelegramOpsService from '../service'
import { escapeHtml } from '../format'
import { orderDetailCommand } from './order-detail'
import { todoCommand } from './todo'
import { stockCommand } from './stock'
import { normalizeReply } from './reply'

// Confirm prompts are appended to the host message with this prefix; the
// final edit strips the suffix so stacked confirm/execute edits stay clean.
export const CONFIRM_PREFIX = '\n\n⚠️ '

export type CallbackQuery = {
  id: string
  from?: { id: number | string; first_name?: string; username?: string }
  message?: { message_id: number; chat: { id: number | string }; text?: string }
  data?: string
}

export type CallbackCtx = {
  container: MedusaContainer
  svc: TelegramOpsService
  chatId: string
  messageId: number
  originalText: string
  actor: { id: string; name: string }
}

// Return value = optional toast shown via answerCallbackQuery.
export type CallbackHandler = (ctx: CallbackCtx, args: string[]) => Promise<string | void>

export function parseCallbackData(data: string): { action: string; args: string[] } | null {
  if (!data) return null
  const [action, ...args] = data.split(':')
  if (!action) return null
  return { action, args }
}

export function stripConfirm(text: string): string {
  return text.split(CONFIRM_PREFIX)[0]
}

const detAction: CallbackHandler = async (ctx, args) => {
  // A new message, not an edit: Details must never destroy the host message.
  const reply = await orderDetailCommand({ container: ctx.container, svc: ctx.svc, chatId: ctx.chatId, args })
  const { text, extra } = normalizeReply(reply)
  await ctx.svc.sendTo(ctx.chatId, text, extra)
}

const disAction: CallbackHandler = async (ctx) => {
  await ctx.svc.editMessage(ctx.chatId, ctx.messageId, `${escapeHtml(stripConfirm(ctx.originalText))}\n\nCanceled.`)
}

// Read-only drill-ins from notification buttons (digest -> todo, stock
// alert -> stock levels). Both send NEW messages, never edit the host.
const tdoAction: CallbackHandler = async (ctx) => {
  const reply = await todoCommand({ container: ctx.container, svc: ctx.svc, chatId: ctx.chatId, args: [] })
  const { text, extra } = normalizeReply(reply)
  await ctx.svc.sendTo(ctx.chatId, text, extra)
}

const stkAction: CallbackHandler = async (ctx) => {
  const reply = await stockCommand({ container: ctx.container, svc: ctx.svc, chatId: ctx.chatId, args: [] })
  const { text, extra } = normalizeReply(reply)
  await ctx.svc.sendTo(ctx.chatId, text, extra)
}

export const CALLBACKS: Record<string, CallbackHandler> = {
  det: detAction,
  dis: disAction,
  tdo: tdoAction,
  stk: stkAction,
}

// Action handlers live in ../actions/ and register themselves here at load
// time (registerActions is imported by the router, which every entrypoint
// loads). Registration lives outside this module so callbacks.ts never
// value-imports the actions (they import CallbackCtx/stripConfirm from here).

export async function handleCallback(
  container: MedusaContainer,
  svc: TelegramOpsService,
  cb: CallbackQuery
): Promise<string | void> {
  const parsed = parseCallbackData(cb.data ?? '')
  if (!parsed) return
  const handler = CALLBACKS[parsed.action]
  if (!handler) return 'Unknown action. Update pending?'
  const from = cb.from
  const ctx: CallbackCtx = {
    container,
    svc,
    chatId: String(cb.message?.chat.id ?? ''),
    messageId: cb.message?.message_id ?? 0,
    originalText: cb.message?.text ?? '',
    actor: { id: String(from?.id ?? ''), name: from?.first_name || from?.username || 'operator' },
  }
  return handler(ctx, parsed.args)
}
