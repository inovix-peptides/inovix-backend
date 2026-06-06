import { DhlParcelClient, DhlTokenProvider } from "../client"
import {
  DhlParcelApiError,
  DhlParcelCreateLabelInput,
  DhlParcelLabelResponse,
  DhlParcelServicePoint,
} from "../types"

// Minimal stub matching the DhlTokenProvider interface the client uses
function makeTokenCache(token = "test-bearer-token", accountNumbers = ["12345678"]): DhlTokenProvider {
  return {
    getToken: jest.fn(async () => token),
    getAccountNumbers: jest.fn(async () => accountNumbers),
    invalidate: jest.fn(() => undefined as void),
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const BASE = "https://api.dhl-parcel.test"

const SAMPLE_LABEL_INPUT: DhlParcelCreateLabelInput = {
  labelId: "550e8400-e29b-41d4-a716-446655440000",
  parcelTypeKey: "MEDIUM",
  accountId: "12345678",
  options: [{ key: "DOOR" }],
  receiver: {
    name: { firstName: "Jan", lastName: "Jansen" },
    address: {
      countryCode: "NL",
      postalCode: "1011AB",
      city: "Amsterdam",
      street: "Damrak",
      number: "1",
    },
  },
  shipper: {
    name: { companyName: "Inovix Research B.V." },
    address: {
      countryCode: "NL",
      postalCode: "1234AB",
      city: "Utrecht",
      street: "Kantoorstraat",
      number: "10",
    },
  },
}

const SAMPLE_LABEL_RESPONSE: DhlParcelLabelResponse = {
  shipmentId: "shipment-abc",
  shipmentTrackerCode: "JVGL123456789NL",
  pieces: [
    {
      labelId: "label-piece-1",
      trackerCode: "JVGL123456789NL",
      parcelType: "MEDIUM",
      pieceNumber: 1,
    },
  ],
}

const SAMPLE_SERVICE_POINTS: DhlParcelServicePoint[] = [
  {
    id: "sp-001",
    name: "Albert Heijn Damrak",
    address: {
      countryCode: "NL",
      zipCode: "1011AB",
      city: "Amsterdam",
      street: "Damrak",
      number: "1",
    },
    geoLocation: { latitude: 52.374, longitude: 4.896 },
  },
]

describe("DhlParcelClient", () => {
  let originalFetch: typeof globalThis.fetch
  let mockFetch: jest.Mock

  beforeEach(() => {
    originalFetch = globalThis.fetch
    mockFetch = jest.fn()
    globalThis.fetch = mockFetch as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    jest.clearAllMocks()
  })

  // ─── Required test 1: createLabel POSTs correctly ────────────────────────────
  test("createLabel POSTs to /labels with Authorization header and parses 201 response", async () => {
    mockFetch.mockResolvedValue(jsonResponse(SAMPLE_LABEL_RESPONSE, 201))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)
    const result = await client.createLabel(SAMPLE_LABEL_INPUT)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/labels`)
    expect(init.method).toBe("POST")

    const headers = new Headers(init.headers as HeadersInit)
    expect(headers.get("Authorization")).toBe("Bearer test-bearer-token")
    expect(headers.get("Content-Type")).toBe("application/json")

    const sentBody = JSON.parse(init.body as string)
    expect(sentBody).toEqual(SAMPLE_LABEL_INPUT)

    expect(result).toEqual(SAMPLE_LABEL_RESPONSE)
  })

  // ─── Required test 2: 401 re-auth + retry ────────────────────────────────────
  test("createLabel on 401 calls invalidate once, retries, and returns the successful response", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse(SAMPLE_LABEL_RESPONSE, 201))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)
    const result = await client.createLabel(SAMPLE_LABEL_INPUT)

    expect(tokenCache.invalidate).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result).toEqual(SAMPLE_LABEL_RESPONSE)
  })

  // ─── Required test 3: 5xx retries once then throws DhlParcelApiError ─────────
  test("createLabel on 5xx retries once and throws DhlParcelApiError when still failing", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ error: "server error" }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: "server error" }, 500))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)

    await expect(client.createLabel(SAMPLE_LABEL_INPUT)).rejects.toThrow(DhlParcelApiError)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  // ─── Required test 4: 400 throws immediately with verbatim body ──────────────
  test("createLabel on 400 throws DhlParcelApiError immediately with verbatim response body", async () => {
    const errorBody = { title: "Bad Request", violations: [{ field: "labelId", message: "invalid uuid" }] }
    mockFetch.mockResolvedValue(jsonResponse(errorBody, 400))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)

    let thrown: unknown
    try {
      await client.createLabel(SAMPLE_LABEL_INPUT)
    } catch (e) {
      thrown = e
    }

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(thrown).toBeInstanceOf(DhlParcelApiError)
    const err = thrown as DhlParcelApiError
    expect(err.status).toBe(400)
    expect(err.body).toEqual(errorBody)
  })

  // ─── Required test 5: listServicePoints maps postalCode → zipCode ─────────────
  test("listServicePoints maps postalCode to zipCode query param and parses returned array", async () => {
    mockFetch.mockResolvedValue(jsonResponse(SAMPLE_SERVICE_POINTS, 200))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)
    const result = await client.listServicePoints("NL", { postalCode: "1011AB", limit: 10 })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0] as [string]
    const parsedUrl = new URL(url)
    expect(parsedUrl.pathname).toBe("/parcel-shop-locations/NL")
    expect(parsedUrl.searchParams.get("zipCode")).toBe("1011AB")
    expect(parsedUrl.searchParams.has("postalCode")).toBe(false)
    expect(parsedUrl.searchParams.get("limit")).toBe("10")

    expect(result).toEqual(SAMPLE_SERVICE_POINTS)
  })

  // ─── Required test 6: tryCancelLabel returns {cancelled:false} on 404 ────────
  test("tryCancelLabel returns { cancelled: false } on 404 without throwing", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "not found" }, 404))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)
    const result = await client.tryCancelLabel("label-xyz")

    expect(result).toEqual({ cancelled: false })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  // ─── Extra: tryCancelLabel returns {cancelled:false} on 405 without throwing ──
  test("tryCancelLabel returns { cancelled: false } on 405 without throwing", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "method not allowed" }, 405))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)
    const result = await client.tryCancelLabel("label-xyz")

    expect(result).toEqual({ cancelled: false })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  // ─── Extra: tryCancelLabel returns {cancelled:true} on 2xx ───────────────────
  test("tryCancelLabel returns { cancelled: true } on successful 200 deletion", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 200))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)
    const result = await client.tryCancelLabel("label-xyz")

    expect(result).toEqual({ cancelled: true })
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/labels/label-xyz`)
    expect(init.method).toBe("DELETE")
    const headers = new Headers(init.headers as HeadersInit)
    expect(headers.get("Authorization")).toBe("Bearer test-bearer-token")
  })

  // ─── Extra: getLabelPdf sends Accept: application/pdf and returns base64 ──────
  test("getLabelPdf sends Accept: application/pdf and returns the body as base64 string", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 fake pdf content")
    const pdfResponse = new Response(pdfBytes, {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    })
    mockFetch.mockResolvedValue(pdfResponse)

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)
    const result = await client.getLabelPdf("label-xyz")

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/labels/label-xyz`)
    expect(init.method).toBe("GET")

    const headers = new Headers(init.headers as HeadersInit)
    expect(headers.get("Accept")).toBe("application/pdf")

    const expectedBase64 = pdfBytes.toString("base64")
    expect(result).toBe(expectedBase64)
  })

  // ─── Extra: getAccountNumbers delegates to tokenCache ────────────────────────
  test("getAccountNumbers delegates to tokenCache.getAccountNumbers", async () => {
    const tokenCache = makeTokenCache("token", ["ACC001", "ACC002"])
    const client = new DhlParcelClient(BASE, tokenCache, 0)
    const result = await client.getAccountNumbers()

    expect(tokenCache.getAccountNumbers).toHaveBeenCalledTimes(1)
    expect(result).toEqual(["ACC001", "ACC002"])
    // Should not hit the network at all
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ─── Extra: re-auth still-401 throws DhlParcelApiError ───────────────────────
  test("createLabel on persistent 401 (second attempt also 401) throws DhlParcelApiError", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)

    await expect(client.createLabel(SAMPLE_LABEL_INPUT)).rejects.toThrow(DhlParcelApiError)
    expect(tokenCache.invalidate).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  // ─── Extra: error URL strips query string ────────────────────────────────────
  test("DhlParcelApiError on listServicePoints has URL with query string stripped", async () => {
    const errorBody = { error: "not found" }
    mockFetch.mockResolvedValue(jsonResponse(errorBody, 400))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)

    let thrown: unknown
    try {
      await client.listServicePoints("NL", { postalCode: "1011AB" })
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeInstanceOf(DhlParcelApiError)
    const err = thrown as DhlParcelApiError
    expect(err.url).not.toContain("?")
    expect(err.url).not.toContain("zipCode")
    expect(err.url).toContain("/parcel-shop-locations/NL")
  })

  // ─── Extra: getServicePoint calls correct URL ─────────────────────────────────
  test("getServicePoint fetches GET /parcel-shop-locations/{countryCode}/{id}", async () => {
    const sp = SAMPLE_SERVICE_POINTS[0]
    mockFetch.mockResolvedValue(jsonResponse(sp, 200))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)
    const result = await client.getServicePoint("NL", "sp-001")

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/parcel-shop-locations/NL/sp-001`)
    expect((init as RequestInit).method).toBe("GET")
    expect(result).toEqual(sp)
  })

  // ─── Extra: getCapabilities calls correct URL with query params ───────────────
  test("getCapabilities fetches GET /capabilities/business with correct query params", async () => {
    const capsResponse = { capabilities: ["DOOR", "PS"] }
    mockFetch.mockResolvedValue(jsonResponse(capsResponse, 200))

    const tokenCache = makeTokenCache()
    const client = new DhlParcelClient(BASE, tokenCache, 0)
    const result = await client.getCapabilities({ fromCountry: "NL", toCountry: "NL", toBusiness: false })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0] as [string]
    const parsedUrl = new URL(url)
    expect(parsedUrl.pathname).toBe("/capabilities/business")
    expect(parsedUrl.searchParams.get("fromCountry")).toBe("NL")
    expect(parsedUrl.searchParams.get("toCountry")).toBe("NL")
    expect(parsedUrl.searchParams.get("toBusiness")).toBe("false")
    expect(result).toEqual(capsResponse)
  })
})
