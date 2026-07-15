import type { MedusaContainer } from '@medusajs/framework/types'
import type TelegramOpsService from '../service'
import { TELEGRAM_OPS_MODULE } from '../index'
import { helpText } from './help'
import { ordersCommand } from './orders'
import { orderDetailCommand } from './order-detail'
import { todoCommand } from './todo'
import { stockCommand } from './stock'
import { findCommand } from './find'
import { salesCommand } from './sales'

export type TelegramUpdate = {
  message?: {
    chat: { id: number | string }
    from?: { id: number | string; first_name?: string; username?: string }
    text?: string
  }
}

export type CommandCtx = {
  container: MedusaContainer
  svc: TelegramOpsService
  chatId: string
  args: string[]
}

export type CommandHandler = (ctx: CommandCtx) => Promise<string>

type OpsLogger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }

export function parseCommand(text: string): { command: string; args: string[] } | null {
  if (!text?.startsWith('/')) return null
  const [head, ...args] = text.trim().split(/\s+/)
  const command = head.slice(1).split('@')[0].toLowerCase()
  if (!command) return null
  return { command, args }
}

export const COMMANDS: Record<string, CommandHandler> = {
  help: async () => helpText(),
  start: async () => helpText(),
  orders: ordersCommand,
  order: orderDetailCommand,
  todo: todoCommand,
  stock: stockCommand,
  find: findCommand,
  sales: salesCommand,
}

export async function handleUpdate(container: MedusaContainer, update: TelegramUpdate): Promise<void> {
  const svc = container.resolve(TELEGRAM_OPS_MODULE) as TelegramOpsService
  const logger = container.resolve('logger') as OpsLogger

  const msg = update.message
  if (!msg?.text) return
  const chatId = String(msg.chat.id)
  const allowed = svc.allowedChatIds()

  // Bootstrap mode: no allowlist configured yet. Reply with the chat id so
  // the operator can put it in TELEGRAM_ALLOWED_CHAT_IDS, and do NOTHING else.
  if (allowed.length === 0) {
    await svc.sendTo(chatId, `Your chat id is <b>${chatId}</b>. Add it to TELEGRAM_ALLOWED_CHAT_IDS to activate the bot.`)
    return
  }

  if (!allowed.includes(chatId)) {
    logger.warn(`telegram-ops: ignored update from non-allowlisted chat ${chatId}`)
    return
  }

  const parsed = parseCommand(msg.text)
  if (!parsed) {
    await svc.sendTo(chatId, 'I only speak commands. Try /help.')
    return
  }

  const handler = COMMANDS[parsed.command]
  if (!handler) {
    await svc.sendTo(chatId, `Unknown command /${parsed.command}. Try /help.`)
    return
  }

  try {
    const reply = await handler({ container, svc, chatId, args: parsed.args })
    await svc.sendTo(chatId, reply)
  } catch (e) {
    logger.error(`telegram-ops: /${parsed.command} failed: ${(e as Error).message}`)
    await svc.sendTo(chatId, `Something went wrong running /${parsed.command}. Check the logs.`)
  }
}
