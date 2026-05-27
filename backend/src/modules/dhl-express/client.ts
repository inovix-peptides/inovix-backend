import { DhlExpressOptions } from "./types"

export class DhlExpressClient {
  constructor(private readonly options: DhlExpressOptions) {}

  authHeader(): string {
    const raw = `${this.options.apiKey}:${this.options.apiSecret}`
    return "Basic " + Buffer.from(raw).toString("base64")
  }
}
