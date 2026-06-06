import crypto from "node:crypto"

import { MedusaError } from "@medusajs/framework/utils"

import type {
  BrokerOptions,
  BrokerPayment,
  BrokerStatus,
  CreateBrokerPaymentInput,
  CreateBrokerPaymentResult,
} from "./types"

// Generic external payments broker client. The broker is intentionally
// brand-neutral on this side: env values name the URL but the code only
// references it as "broker".

export class BrokerClient {
  private readonly options: BrokerOptions

  constructor(options: BrokerOptions) {
    if (!options.brokerUrl || !options.clientId || !options.hmacSecret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "BrokerClient: brokerUrl, clientId, hmacSecret are required"
      )
    }
    this.options = options
  }

  async createPayment(
    input: CreateBrokerPaymentInput
  ): Promise<CreateBrokerPaymentResult> {
    const body = JSON.stringify({
      ref: input.ref,
      amount: input.amountMinor,
      currency: input.currencyCode.toUpperCase(),
      return_url: input.returnUrl,
      locale: input.locale,
      metadata: input.metadata ?? {},
    })

    const data = await this.fetchJson<{
      ref: string
      checkout_url: string
      status: BrokerStatus
    }>("/external-payments", {
      method: "POST",
      body,
      idempotencyKey: input.idempotencyKey,
    })

    if (!data.ref || !data.checkout_url) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "broker createPayment: response missing ref or checkout_url"
      )
    }
    return {
      ref: data.ref,
      checkoutUrl: data.checkout_url,
      status: data.status ?? "pending",
    }
  }

  async getPayment(ref: string): Promise<BrokerPayment> {
    const data = await this.fetchJson<{
      ref: string
      status: BrokerStatus
      mollie_payment_id?: string | null
      captured_at?: string | null
    }>(`/external-payments/${encodeURIComponent(ref)}`, { method: "GET" })

    return {
      ref: data.ref,
      status: data.status,
      brokerPaymentId: data.mollie_payment_id ?? null,
      capturedAt: data.captured_at ?? null,
    }
  }

  async refundPayment(ref: string, amountMinor: number, currencyCode: string): Promise<void> {
    const body = JSON.stringify({
      amount: amountMinor,
      currency: currencyCode.toUpperCase(),
    })
    await this.fetchJson<unknown>(
      `/external-payments/${encodeURIComponent(ref)}/refund`,
      { method: "POST", body }
    )
  }

  // Verify a callback the broker POSTs to us. Same scheme as the outbound
  // signing scheme: hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`)).
  verifyCallback(input: {
    rawBody: string
    signatureHeader: string | undefined | null
    timestampHeader: string | undefined | null
    nowUnix?: number
  }): { ok: boolean; reason?: string } {
    const sig = (input.signatureHeader ?? "").trim()
    const tsRaw = (input.timestampHeader ?? "").trim()
    if (!sig) return { ok: false, reason: "missing x-signature" }
    if (!tsRaw) return { ok: false, reason: "missing x-timestamp" }

    const ts = Number(tsRaw)
    if (!Number.isFinite(ts)) return { ok: false, reason: "x-timestamp not numeric" }
    const tolerance = this.options.callbackToleranceSeconds ?? 300
    const now = input.nowUnix ?? Math.floor(Date.now() / 1000)
    if (Math.abs(now - ts) > tolerance) {
      return { ok: false, reason: "x-timestamp out of tolerance" }
    }

    const expected = crypto
      .createHmac("sha256", this.options.hmacSecret)
      .update(`${tsRaw}.${input.rawBody}`)
      .digest("hex")
    const a = Buffer.from(expected, "utf8")
    const b = Buffer.from(sig.toLowerCase(), "utf8")
    if (a.length !== b.length) return { ok: false, reason: "signature length mismatch" }
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: "signature mismatch" }
    return { ok: true }
  }

  private async fetchJson<T>(
    path: string,
    init: RequestInit & { idempotencyKey?: string }
  ): Promise<T> {
    const rawBody =
      typeof init.body === "string"
        ? init.body
        : init.body
          ? String(init.body)
          : ""

    const timestamp = Math.floor(Date.now() / 1000)
    const signature = crypto
      .createHmac("sha256", this.options.hmacSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex")

    const headers = new Headers(init.headers)
    if (!headers.has("Content-Type") && rawBody) {
      headers.set("Content-Type", "application/json")
    }
    // Generic UA. Don't leak which merchant is calling.
    headers.set("User-Agent", "payments-client/1.0")
    headers.set("x-client-id", this.options.clientId)
    headers.set("x-signature", signature)
    headers.set("x-timestamp", String(timestamp))
    if (init.idempotencyKey) {
      headers.set("Idempotency-Key", init.idempotencyKey)
    }

    const url = `${this.options.brokerUrl.replace(/\/$/, "")}${path}`
    const res = await fetch(url, { ...init, headers, body: rawBody || undefined })
    const text = await res.text()
    let parsed: unknown
    try {
      parsed = text ? JSON.parse(text) : undefined
    } catch {
      parsed = undefined
    }

    if (!res.ok) {
      const detail =
        (parsed as { error?: string } | undefined)?.error ?? text.slice(0, 500)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `broker ${init.method ?? "GET"} ${path} failed: ${res.status} ${detail}`
      )
    }
    return parsed as T
  }
}
