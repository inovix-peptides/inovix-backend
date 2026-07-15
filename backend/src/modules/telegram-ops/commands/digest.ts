import { buildDigest } from './digest-data'
import type { CommandHandler } from './router'

// /digest | the daily digest on demand (same content as the 18:00 push).
export const digestCommand: CommandHandler = async ({ container }) => {
  const text = await buildDigest(container, new Date())
  return {
    text,
    reply_markup: { inline_keyboard: [[{ text: '📝 Todo', callback_data: 'tdo' }]] },
  }
}
