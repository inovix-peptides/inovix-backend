export type TelegramResult = {
  ok: boolean
  description?: string
  result?: unknown
  parameters?: { retry_after?: number }
}

const MAX_ATTEMPTS = 3
const BACKOFF_MS = [0, 500, 1500]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Minimal Telegram Bot API client. Never throws on transport/API failure:
 * callers treat notifications as fire-and-forget and must not let a
 * Telegram outage break an order flow.
 */
export async function sendTelegramRequest(
  token: string,
  method: string,
  payload: Record<string, unknown>
): Promise<TelegramResult> {
  if (!token || !method) throw new Error('telegram-client: token and method are required')

  let last: TelegramResult = { ok: false, description: 'not attempted' }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt])
    let status: number
    let body: TelegramResult
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      status = res.status
      body = (await res.json().catch(() => ({ ok: false, description: 'invalid json' }))) as TelegramResult
    } catch (e) {
      last = { ok: false, description: (e as Error).message }
      continue // network error: retry
    }
    if (body.ok) return body
    last = body
    if (status === 429) {
      const wait = Math.min((body.parameters?.retry_after ?? 1) * 1000, 5000)
      await sleep(wait)
      continue
    }
    if (status >= 500) continue // server error: retry
    return body // 4xx other than 429: permanent, do not retry
  }
  return last
}
