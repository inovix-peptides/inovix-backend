import { umamiConfig, fetchUmamiStats, fetchTopPages } from '../commands/umami'

const RANGE = { startAt: 1752530400000, endAt: 1752595200000 }

const ENV_KEYS = ['UMAMI_API_URL', 'UMAMI_API_TOKEN', 'UMAMI_WEBSITE_ID'] as const

function setEnv() {
  process.env.UMAMI_API_URL = 'https://umami.example.app'
  process.env.UMAMI_API_TOKEN = 'api_token_123'
  process.env.UMAMI_WEBSITE_ID = 'site-uuid-1'
}

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  jest.clearAllMocks()
  for (const k of ENV_KEYS) delete process.env[k]
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const k of ENV_KEYS) delete process.env[k]
  jest.useRealTimers()
})

describe('umamiConfig', () => {
  it('returns null when nothing is set', () => {
    expect(umamiConfig()).toBeNull()
  })

  it('returns null when any of the three vars is missing', () => {
    for (const missing of ENV_KEYS) {
      setEnv()
      delete process.env[missing]
      expect(umamiConfig()).toBeNull()
    }
  })

  it('returns the config when all three are set, with a trailing slash stripped', () => {
    setEnv()
    process.env.UMAMI_API_URL = 'https://umami.example.app/'
    expect(umamiConfig()).toEqual({
      url: 'https://umami.example.app',
      token: 'api_token_123',
      websiteId: 'site-uuid-1',
    })
  })
})

describe('fetchUmamiStats', () => {
  it('returns null without config and never calls fetch', async () => {
    const fetchMock = jest.fn()
    globalThis.fetch = fetchMock as never
    expect(await fetchUmamiStats(RANGE)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls the stats endpoint with bearer auth and parses {value} shapes', async () => {
    setEnv()
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        pageviews: { value: 456, prev: 400 },
        visitors: { value: 123, prev: 100 },
        visits: { value: 130, prev: 110 },
      }),
    }))
    globalThis.fetch = fetchMock as never
    expect(await fetchUmamiStats(RANGE)).toEqual({ visitors: 123, pageviews: 456 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      `https://umami.example.app/api/websites/site-uuid-1/stats?startAt=${RANGE.startAt}&endAt=${RANGE.endAt}`
    )
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer api_token_123')
  })

  it('parses plain-number shapes too', async () => {
    setEnv()
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ pageviews: 9, visitors: 4 }),
    })) as never
    expect(await fetchUmamiStats(RANGE)).toEqual({ visitors: 4, pageviews: 9 })
  })

  it('returns null on a non-ok response', async () => {
    setEnv()
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as never
    expect(await fetchUmamiStats(RANGE)).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    setEnv()
    globalThis.fetch = jest.fn(async () => {
      throw new Error('network down')
    }) as never
    expect(await fetchUmamiStats(RANGE)).toBeNull()
  })

  it('returns null on malformed JSON', async () => {
    setEnv()
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => {
        throw new Error('bad json')
      },
    })) as never
    expect(await fetchUmamiStats(RANGE)).toBeNull()
  })

  it('aborts after the 5s timeout and returns null', async () => {
    setEnv()
    jest.useFakeTimers()
    // A fetch that never resolves on its own but rejects when the signal aborts,
    // like a hung upstream would.
    globalThis.fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    ) as never
    const pending = fetchUmamiStats(RANGE)
    await jest.advanceTimersByTimeAsync(5_000)
    expect(await pending).toBeNull()
  })
})

describe('fetchTopPages', () => {
  it('returns null without config', async () => {
    expect(await fetchTopPages(RANGE)).toBeNull()
  })

  it('calls the path metrics endpoint (Umami v3) and maps + limits rows', async () => {
    setEnv()
    const rows = [
      { x: '/', y: 40 },
      { x: '/producten', y: 30 },
      { x: '/producten/bpc-157', y: 20 },
      { x: '/over-ons', y: 10 },
      { x: '/contact', y: 5 },
      { x: '/juridisch', y: 1 },
    ]
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => rows }))
    globalThis.fetch = fetchMock as never
    expect(await fetchTopPages(RANGE)).toEqual([
      { path: '/', views: 40 },
      { path: '/producten', views: 30 },
      { path: '/producten/bpc-157', views: 20 },
      { path: '/over-ons', views: 10 },
      { path: '/contact', views: 5 },
    ])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      `https://umami.example.app/api/websites/site-uuid-1/metrics?type=path&startAt=${RANGE.startAt}&endAt=${RANGE.endAt}`
    )
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer api_token_123')
    expect(fetchMock).toHaveBeenCalledTimes(1) // no fallback needed when path answers
  })

  it('falls back to type=url when type=path is rejected (Umami v2)', async () => {
    setEnv()
    const fetchMock = jest.fn(async (url: string) => {
      if (String(url).includes('type=path')) return { ok: false, status: 400, json: async () => ({}) }
      return { ok: true, json: async () => [{ x: '/legacy', y: 7 }] }
    })
    globalThis.fetch = fetchMock as never
    expect(await fetchTopPages(RANGE)).toEqual([{ path: '/legacy', views: 7 }])
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls[0]).toContain('type=path')
    expect(urls[1]).toContain('type=url')
  })

  it('respects a custom limit', async () => {
    setEnv()
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => [
        { x: '/a', y: 3 },
        { x: '/b', y: 2 },
        { x: '/c', y: 1 },
      ],
    })) as never
    expect(await fetchTopPages(RANGE, 2)).toEqual([
      { path: '/a', views: 3 },
      { path: '/b', views: 2 },
    ])
  })

  it('returns null on failure and on a non-array body', async () => {
    setEnv()
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as never
    expect(await fetchTopPages(RANGE)).toBeNull()
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ nope: true }) })) as never
    expect(await fetchTopPages(RANGE)).toBeNull()
  })
})
