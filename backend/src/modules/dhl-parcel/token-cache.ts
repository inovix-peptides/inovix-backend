import { DhlParcelAuthError, DhlParcelAuthResponse } from "./types"

type CachedEntry = {
  token: string
  expiresAt: number  // unix seconds
  accountNumbers: string[]
}

export class TokenCache {
  private cached?: CachedEntry
  private inflight?: Promise<CachedEntry>

  constructor(
    private readonly baseUrl: string,
    private readonly userId: string,
    private readonly key: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getToken(): Promise<string> {
    const entry = await this.ensureFresh()
    return entry.token
  }

  async getAccountNumbers(): Promise<string[]> {
    const entry = await this.ensureFresh()
    return entry.accountNumbers
  }

  invalidate(): void {
    this.cached = undefined
  }

  private async ensureFresh(): Promise<CachedEntry> {
    const nowSec = Math.floor(this.now() / 1000)
    if (this.cached && this.cached.expiresAt - nowSec > 60) return this.cached
    if (this.inflight) return this.inflight
    this.inflight = this.refresh().finally(() => {
      this.inflight = undefined
    })
    return this.inflight
  }

  private async refresh(): Promise<CachedEntry> {
    const res = await fetch(`${this.baseUrl}/authenticate/api-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: this.userId, key: this.key }),
    })
    if (!res.ok) throw new DhlParcelAuthError(`auth failed: ${res.status}`)
    const body = (await res.json()) as DhlParcelAuthResponse
    this.cached = {
      token: body.accessToken,
      expiresAt: body.accessTokenExpiration,
      accountNumbers: body.accountNumbers,
    }
    return this.cached
  }
}
