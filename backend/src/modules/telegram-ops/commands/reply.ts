// Command reply shape shared by the command router and the callback router
// (own module so callbacks.ts and router.ts never value-import each other).
export type CommandReply = string | { text: string; reply_markup?: Record<string, unknown> }

export function normalizeReply(reply: CommandReply): { text: string; extra: Record<string, unknown> } {
  if (typeof reply === 'string') return { text: reply, extra: {} }
  return { text: reply.text, extra: reply.reply_markup ? { reply_markup: reply.reply_markup } : {} }
}
