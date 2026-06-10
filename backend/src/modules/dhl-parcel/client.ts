import {
  DhlParcelApiError,
  DhlParcelCreateLabelInput,
  DhlParcelLabelResponse,
  DhlParcelServicePoint,
} from "./types"

export interface DhlTokenProvider {
  getToken(): Promise<string>
  getAccountNumbers(): Promise<string[]>
  invalidate(): void
}

interface RequestOpts {
  body?: unknown
  accept?: string
  query?: Record<string, string | number | boolean>
}

export class DhlParcelClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenCache: DhlTokenProvider,
    private readonly retryDelayMs: number = 250,
  ) {}

  // ─── Public methods ────────────────────────────────────────────────────────

  async createLabel(input: DhlParcelCreateLabelInput): Promise<DhlParcelLabelResponse> {
    return this.request<DhlParcelLabelResponse>("POST", "/labels", { body: input })
  }

  async getLabelPdf(labelId: string): Promise<string> {
    return this.requestPdf(`/labels/${labelId}`)
  }

  async getLabel(labelId: string): Promise<DhlParcelLabelResponse> {
    // GET /labels/{id} returns the full label JSON (trackerCode, pdf, routingCode,
    // ...), verified live. Used to recover the already-created label when
    // createLabel returns 409 shipment_already_exists (idempotent retry).
    return this.request<DhlParcelLabelResponse>("GET", `/labels/${labelId}`)
  }

  async listServicePoints(
    countryCode: string,
    opts: { postalCode?: string; city?: string; q?: string; limit?: number },
  ): Promise<DhlParcelServicePoint[]> {
    const query: Record<string, string | number | boolean> = {}
    // IMPORTANT: DHL's parameter for postcode is `zipCode`, NOT `postalCode`
    if (opts.postalCode !== undefined) query["zipCode"] = opts.postalCode
    if (opts.city !== undefined) query["city"] = opts.city
    if (opts.q !== undefined) query["q"] = opts.q
    if (opts.limit !== undefined) query["limit"] = opts.limit

    return this.request<DhlParcelServicePoint[]>(
      "GET",
      `/parcel-shop-locations/${countryCode}`,
      { query },
    )
  }

  async getServicePoint(countryCode: string, id: string): Promise<DhlParcelServicePoint> {
    return this.request<DhlParcelServicePoint>("GET", `/parcel-shop-locations/${countryCode}/${id}`)
  }

  async getCapabilities(query: {
    fromCountry: string
    toCountry: string
    toBusiness: boolean
  }): Promise<unknown> {
    return this.request<unknown>("GET", "/capabilities/business", {
      query: {
        fromCountry: query.fromCountry,
        toCountry: query.toCountry,
        toBusiness: query.toBusiness,
      },
    })
  }

  async tryCancelLabel(labelId: string): Promise<{ cancelled: boolean }> {
    const url = this.buildUrl(`/labels/${labelId}`)
    const token = await this.tokenCache.getToken()
    const headers = new Headers({
      Authorization: `Bearer ${token}`,
    })

    // Best-effort: no re-auth or 5xx retry | a failed cancel is non-fatal.
    const res = await fetch(url.href, { method: "DELETE", headers })

    if (res.status === 404 || res.status === 405) {
      return { cancelled: false }
    }

    if (res.ok) {
      return { cancelled: true }
    }

    // For other unexpected non-ok statuses, use the standard error path
    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = null
    }
    throw new DhlParcelApiError(
      `DHL Parcel DELETE /labels/${labelId} failed with ${res.status}`,
      res.status,
      body,
      url.origin + url.pathname,
    )
  }

  async getAccountNumbers(): Promise<string[]> {
    return this.tokenCache.getAccountNumbers()
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private buildUrl(path: string, query?: Record<string, string | number | boolean>): URL {
    const url = new URL(`${this.baseUrl}${path}`)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        url.searchParams.set(k, String(v))
      }
    }
    return url
  }

  /**
   * Handles the PDF case separately: reads ArrayBuffer, converts to base64.
   * Re-auth and 5xx retry logic mirrored from `request`.
   */
  private async requestPdf(path: string): Promise<string> {
    const url = this.buildUrl(path)
    const plainUrl = url.origin + url.pathname

    const doFetch = async (token: string): Promise<Response> => {
      const headers = new Headers({
        Authorization: `Bearer ${token}`,
        Accept: "application/pdf",
      })
      return fetch(url.href, { method: "GET", headers })
    }

    let token = await this.tokenCache.getToken()
    let res = await doFetch(token)

    // Re-auth on 401 (once)
    if (res.status === 401) {
      this.tokenCache.invalidate()
      token = await this.tokenCache.getToken()
      res = await doFetch(token)
      if (!res.ok) {
        // After re-auth we throw on any non-ok response; the 5xx single-retry only applies to the initial request.
        let body: unknown
        try { body = await res.json() } catch { body = null }
        throw new DhlParcelApiError(
          `DHL Parcel GET ${path} failed with ${res.status} after re-auth`,
          res.status,
          body,
          plainUrl,
        )
      }
    }

    // 5xx retry (once)
    if (res.status >= 500) {
      if (this.retryDelayMs > 0) await sleep(this.retryDelayMs)
      res = await doFetch(token)
      if (!res.ok) {
        let body: unknown
        try { body = await res.json() } catch { body = null }
        throw new DhlParcelApiError(
          `DHL Parcel GET ${path} failed with ${res.status} after retry`,
          res.status,
          body,
          plainUrl,
        )
      }
    }

    if (!res.ok) {
      let body: unknown
      try {
        body = await res.json()
      } catch {
        body = null
      }
      throw new DhlParcelApiError(
        `DHL Parcel GET ${path} failed with ${res.status}`,
        res.status,
        body,
        plainUrl,
      )
    }

    const buf = await res.arrayBuffer()
    return Buffer.from(buf).toString("base64")
  }

  private async request<T>(
    method: string,
    path: string,
    opts: RequestOpts = {},
  ): Promise<T> {
    const url = this.buildUrl(path, opts.query)
    // Strip query from error URLs to avoid leaking sensitive params
    const plainUrl = url.origin + url.pathname

    const doFetch = async (token: string): Promise<Response> => {
      const headers = new Headers({
        Authorization: `Bearer ${token}`,
        Accept: opts.accept ?? "application/json",
      })
      if (opts.body !== undefined) {
        headers.set("Content-Type", "application/json")
      }

      return fetch(url.href, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      })
    }

    let token = await this.tokenCache.getToken()
    let res = await doFetch(token)

    // Re-auth on 401 (one retry only)
    if (res.status === 401) {
      this.tokenCache.invalidate()
      token = await this.tokenCache.getToken()
      res = await doFetch(token)
      if (res.status === 401) {
        throw new DhlParcelApiError(
          `DHL Parcel ${method} ${path} failed with 401 after re-auth`,
          401,
          null,
          plainUrl,
        )
      }
    }

    // 5xx retry (one retry only, after delay)
    if (res.status >= 500) {
      if (this.retryDelayMs > 0) await sleep(this.retryDelayMs)
      res = await doFetch(token)
      if (res.status >= 500) {
        let body: unknown
        try {
          body = await res.json()
        } catch {
          body = null
        }
        throw new DhlParcelApiError(
          `DHL Parcel ${method} ${path} failed with ${res.status} after retry`,
          res.status,
          body,
          plainUrl,
        )
      }
    }

    // Any other non-OK: throw immediately with verbatim body
    if (!res.ok) {
      let body: unknown
      try {
        body = await res.json()
      } catch {
        body = null
      }
      throw new DhlParcelApiError(
        `DHL Parcel ${method} ${path} failed with ${res.status}`,
        res.status,
        body,
        plainUrl,
      )
    }

    return res.json() as Promise<T>
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
