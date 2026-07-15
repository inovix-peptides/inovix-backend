// Tiny Umami API client for visitor stats (/visitors + the digest lines).
// Umami is aggregate + cookieless: nothing here is PII. Every function
// degrades to null (unconfigured, HTTP error, timeout, bad body) | a
// visitor-stats hiccup must never fail a digest or a command.

export type UmamiRange = { startAt: number; endAt: number }
export type UmamiStats = { visitors: number; pageviews: number }
export type UmamiTopPage = { path: string; views: number }

const FETCH_TIMEOUT_MS = 5_000

export function umamiConfig(): { url: string; token: string; websiteId: string } | null {
  const url = process.env.UMAMI_API_URL
  const token = process.env.UMAMI_API_TOKEN
  const websiteId = process.env.UMAMI_WEBSITE_ID
  if (!url || !token || !websiteId) return null
  return { url: url.replace(/\/+$/, ''), token, websiteId }
}

async function umamiGet(path: string, token: string): Promise<unknown | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctl.signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Umami stats values come back as { value, prev } objects on v2 and plain
// numbers on some older builds; accept both.
function metricNumber(v: unknown): number | null {
  const n = typeof v === 'object' && v !== null ? (v as { value?: unknown }).value : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export async function fetchUmamiStats(range: UmamiRange): Promise<UmamiStats | null> {
  const cfg = umamiConfig()
  if (!cfg) return null
  const body = await umamiGet(
    `${cfg.url}/api/websites/${cfg.websiteId}/stats?startAt=${range.startAt}&endAt=${range.endAt}`,
    cfg.token
  )
  if (!body || typeof body !== 'object') return null
  const b = body as { visitors?: unknown; uniques?: unknown; pageviews?: unknown }
  const visitors = metricNumber(b.visitors) ?? metricNumber(b.uniques)
  const pageviews = metricNumber(b.pageviews)
  if (visitors === null || pageviews === null) return null
  return { visitors, pageviews }
}

export async function fetchTopPages(range: UmamiRange, limit = 5): Promise<UmamiTopPage[] | null> {
  const cfg = umamiConfig()
  if (!cfg) return null
  // Umami v3 renamed the metrics type from `url` to `path` (verified against
  // the live instance: type=url answers 400 there). Try path first, fall back
  // to url so an older v2 instance still works.
  let body: unknown | null = null
  for (const type of ['path', 'url']) {
    body = await umamiGet(
      `${cfg.url}/api/websites/${cfg.websiteId}/metrics?type=${type}&startAt=${range.startAt}&endAt=${range.endAt}`,
      cfg.token
    )
    if (Array.isArray(body)) break
  }
  if (!Array.isArray(body)) return null
  return (body as Array<{ x?: unknown; y?: unknown } | null>)
    .filter((r): r is { x?: unknown; y?: unknown } => !!r && typeof r.x === 'string')
    .map((r) => ({ path: String(r.x), views: Number(r.y ?? 0) }))
    .slice(0, limit)
}
