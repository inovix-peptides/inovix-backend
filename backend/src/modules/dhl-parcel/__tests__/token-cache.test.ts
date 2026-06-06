import { TokenCache } from "../token-cache"
import { DhlParcelAuthError } from "../types"

// Default TTL the DHL auth endpoint returns (15 min)
const DEFAULT_TTL_SEC = 900
// Must match the stale threshold in token-cache.ts (tokens with less than this
// many seconds remaining are considered stale and will be refreshed)
const STALE_THRESHOLD_SEC = 60

describe("TokenCache", () => {
  const BASE_URL = "https://api.dhl-parcel.test"
  const USER_ID = "test-user"
  const KEY = "test-key"

  // nowMs is in milliseconds, accessTokenExpiration is unix seconds
  const makeNow = (nowMs: number) => () => nowMs

  const makeAuthResponse = (nowSec: number, ttlSec = DEFAULT_TTL_SEC) => ({
    accessToken: "jwt-token-abc",
    accessTokenExpiration: nowSec + ttlSec,  // unix seconds
    refreshToken: "refresh-xyz",
    refreshTokenExpiration: nowSec + 86400,
    accountNumbers: ["12345678", "87654321"],
  })

  const mockFetchOk = (body: object) =>
    jest.fn(async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

  const mockFetchFail = (status: number) =>
    jest.fn(async () =>
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    )

  test("first getToken() calls fetch exactly once and returns the access token", async () => {
    const nowMs = 1_700_000_000_000  // arbitrary ms timestamp
    const nowSec = Math.floor(nowMs / 1000)
    const authBody = makeAuthResponse(nowSec)

    const fetchMock = mockFetchOk(authBody)
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch
    try {
      const cache = new TokenCache(BASE_URL, USER_ID, KEY, makeNow(nowMs))
      const token = await cache.getToken()

      expect(token).toBe("jwt-token-abc")
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/authenticate/api-key`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ userId: USER_ID, key: KEY }),
        })
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("second getToken() within freshness window does NOT call fetch again and returns same token", async () => {
    const nowMs = 1_700_000_000_000
    const nowSec = Math.floor(nowMs / 1000)
    const authBody = makeAuthResponse(nowSec, DEFAULT_TTL_SEC)  // expires in 15 min

    const fetchMock = mockFetchOk(authBody)
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch
    try {
      const cache = new TokenCache(BASE_URL, USER_ID, KEY, makeNow(nowMs))

      const token1 = await cache.getToken()
      const token2 = await cache.getToken()

      expect(token1).toBe("jwt-token-abc")
      expect(token2).toBe("jwt-token-abc")
      // Only one fetch total - second call hits cache
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("getToken() re-authenticates when within 60 seconds of expiry", async () => {
    const nowMs = 1_700_000_000_000
    const nowSec = Math.floor(nowMs / 1000)
    // Token expires in STALE_THRESHOLD_SEC - 5 seconds - within stale threshold, so it's stale
    const authBody = makeAuthResponse(nowSec, STALE_THRESHOLD_SEC - 5)

    const fetchMock = mockFetchOk(authBody)
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch
    try {
      const cache = new TokenCache(BASE_URL, USER_ID, KEY, makeNow(nowMs))

      // First call: no cache, fetches
      await cache.getToken()
      // The token returned has expiresAt = nowSec + (STALE_THRESHOLD_SEC - 5),
      // so expiresAt - nowSec < STALE_THRESHOLD_SEC -> refresh on next call
      // Second call: cached token is near expiry, should re-fetch
      await cache.getToken()

      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("concurrent getToken() calls during initial refresh trigger exactly ONE fetch (in-flight dedup)", async () => {
    const nowMs = 1_700_000_000_000
    const nowSec = Math.floor(nowMs / 1000)
    const authBody = makeAuthResponse(nowSec)

    // Slow fetch to ensure both calls are in-flight simultaneously
    const fetchMock = jest.fn(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(
            () =>
              resolve(
                new Response(JSON.stringify(authBody), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                })
              ),
            10
          )
        )
    )

    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch
    try {
      const cache = new TokenCache(BASE_URL, USER_ID, KEY, makeNow(nowMs))

      // Fire both without awaiting the first
      const [token1, token2] = await Promise.all([cache.getToken(), cache.getToken()])

      expect(token1).toBe("jwt-token-abc")
      expect(token2).toBe("jwt-token-abc")
      // Only ONE fetch should have happened - dedup in-flight
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("getToken() rejects with DhlParcelAuthError when fetch returns non-OK status", async () => {
    const nowMs = 1_700_000_000_000

    const fetchMock = mockFetchFail(401)
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch
    try {
      const cache = new TokenCache(BASE_URL, USER_ID, KEY, makeNow(nowMs))

      await expect(cache.getToken()).rejects.toThrow(DhlParcelAuthError)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("getAccountNumbers() returns cached account numbers from auth response", async () => {
    const nowMs = 1_700_000_000_000
    const nowSec = Math.floor(nowMs / 1000)
    const authBody = makeAuthResponse(nowSec)

    const fetchMock = mockFetchOk(authBody)
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch
    try {
      const cache = new TokenCache(BASE_URL, USER_ID, KEY, makeNow(nowMs))

      const accountNumbers = await cache.getAccountNumbers()

      expect(accountNumbers).toEqual(["12345678", "87654321"])
      // No extra fetch - same underlying ensureFresh call
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("invalidate() clears cached entry so the next getToken() re-fetches", async () => {
    const nowMs = 1_700_000_000_000
    const nowSec = Math.floor(nowMs / 1000)
    const authBody = makeAuthResponse(nowSec)

    const fetchMock = mockFetchOk(authBody)
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch
    try {
      const cache = new TokenCache(BASE_URL, USER_ID, KEY, makeNow(nowMs))

      // First call - populates cache (1 fetch)
      const token1 = await cache.getToken()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(token1).toBe("jwt-token-abc")

      // Invalidate wipes the cached entry
      cache.invalidate()

      // Second call - cache is gone, must re-fetch (2nd fetch)
      const token2 = await cache.getToken()
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(token2).toBe("jwt-token-abc")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("a fetch rejection clears in-flight so a subsequent getToken() can succeed", async () => {
    const nowMs = 1_700_000_000_000
    const nowSec = Math.floor(nowMs / 1000)
    const authBody = makeAuthResponse(nowSec)

    const fetchMock = jest.fn()
    // First call rejects (network error)
    fetchMock.mockRejectedValueOnce(new Error("network"))
    // Second call resolves normally
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify(authBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch
    try {
      const cache = new TokenCache(BASE_URL, USER_ID, KEY, makeNow(nowMs))

      // First getToken() must reject
      await expect(cache.getToken()).rejects.toThrow("network")
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // After rejection the in-flight promise is cleared; a second call must
      // trigger a new fetch and succeed
      const token = await cache.getToken()
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(token).toBe("jwt-token-abc")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
