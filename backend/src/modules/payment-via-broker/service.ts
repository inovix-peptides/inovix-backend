import {
  AbstractPaymentProvider,
  BigNumber,
  MedusaError,
} from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"

import { BrokerClient } from "./client"
import { generateToken, writeReturnToken } from "./return-token"
import type {
  BrokerCallbackBody,
  BrokerOptions,
  BrokerStatus,
} from "./types"

type InjectedDependencies = { logger: Logger }

type SessionData = {
  ref?: string
  checkoutUrl?: string
  status?: BrokerStatus
  amountMinor?: number
  currency?: string
}

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
  "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
])
const THREE_DECIMAL_CURRENCIES = new Set([
  "BHD", "IQD", "JOD", "KWD", "OMR", "TND",
])

function decimalsForCurrency(currencyCode: string): number {
  const upper = currencyCode.toUpperCase()
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) return 0
  if (THREE_DECIMAL_CURRENCIES.has(upper)) return 3
  return 2
}

class PaymentViaBrokerProviderService extends AbstractPaymentProvider<BrokerOptions> {
  // Used in the Medusa provider id: pp_<config-id>_<identifier>. We pick
  // a brand-neutral identifier because the provider id surfaces on payment
  // session rows that operators see in admin.
  static identifier = "via_broker"

  protected readonly logger_: Logger
  protected readonly options_: BrokerOptions
  protected readonly client_: BrokerClient

  constructor(container: InjectedDependencies, options: BrokerOptions) {
    super(container, options)
    this.logger_ = container.logger
    this.options_ = options
    this.client_ = new BrokerClient(options)
  }

  static validateOptions(options: Record<string, unknown>) {
    for (const key of [
      "brokerUrl",
      "clientId",
      "hmacSecret",
      "relayBaseUrl",
      "cfKvAccountId",
      "cfKvNamespaceId",
      "cfKvApiToken",
    ] as const) {
      if (!options[key]) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `payment-via-broker: missing required option '${key}'`
        )
      }
    }
  }

  // Exposed so the route can verify callbacks without rebuilding the client.
  verifyCallback(input: {
    rawBody: string
    signatureHeader: string | undefined | null
    timestampHeader: string | undefined | null
  }) {
    return this.client_.verifyCallback(input)
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const amountMinor = this.toMinorUnit(input.amount, input.currency_code)
    const ref = `pay_${randomToken()}`
    const storefrontUrl = process.env.STOREFRONT_URL
    const inovixReturn = storefrontUrl
      ? `${storefrontUrl.replace(/\/$/, "")}/checkout/return?ref=${ref}`
      : "https://invalid.example/return"

    const token = generateToken()
    await writeReturnToken({
      token,
      target: inovixReturn,
      ttlSeconds: this.options_.returnTokenTtlSeconds ?? 3600,
      accountId: this.options_.cfKvAccountId,
      namespaceId: this.options_.cfKvNamespaceId,
      apiToken: this.options_.cfKvApiToken,
    })

    const relayBase = this.options_.relayBaseUrl.replace(/\/$/, "")
    const returnUrl = `${relayBase}/r/${token}`

    const created = await this.client_.createPayment({
      ref,
      amountMinor,
      currencyCode: input.currency_code,
      returnUrl,
      idempotencyKey: input.context?.idempotency_key,
    })

    const data: SessionData = {
      ref: created.ref,
      checkoutUrl: created.checkoutUrl,
      status: created.status,
      amountMinor,
      currency: input.currency_code,
    }
    return {
      id: created.ref,
      data: data as unknown as Record<string, unknown>,
    }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    const incoming = (input.data as SessionData | undefined) ?? {}
    const incomingAmount = this.toMinorUnit(
      input.amount,
      input.currency_code
    )
    if (
      incoming.ref &&
      incoming.checkoutUrl &&
      incoming.amountMinor === incomingAmount &&
      incoming.currency === input.currency_code
    ) {
      return { data: incoming as Record<string, unknown> }
    }
    // Amount changed: just initiate a fresh broker payment. The previous
    // ref will be left dangling; the broker's Mollie payment for it expires.
    const reinit = await this.initiatePayment({
      amount: input.amount,
      currency_code: input.currency_code,
      context: input.context,
    } as InitiatePaymentInput)
    return { data: reinit.data }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const data = input.data as SessionData | undefined
    if (!data?.ref) {
      return { data: (data ?? {}) as Record<string, unknown>, status: "pending" }
    }
    try {
      const payment = await this.client_.getPayment(data.ref)
      const next: SessionData = {
        ...data,
        status: payment.status,
      }
      return {
        data: next as Record<string, unknown>,
        status: this.mapStatus(payment.status),
      }
    } catch (err) {
      this.logger_.warn(
        `payment-via-broker authorize: ${data.ref} lookup failed: ${(err as Error).message}`
      )
      return { data: (data ?? {}) as Record<string, unknown>, status: "pending" }
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const data = input.data as SessionData | undefined
    if (!data?.ref) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "payment-via-broker: cannot capture without ref"
      )
    }
    const payment = await this.client_.getPayment(data.ref)
    return {
      data: { ...data, status: payment.status } as Record<string, unknown>,
    }
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    const data = input.data as SessionData | undefined
    if (!data?.ref || !data.currency) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "payment-via-broker: cannot refund without ref/currency"
      )
    }
    const amount = this.toMinorUnit(input.amount, data.currency)
    await this.client_.refundPayment(data.ref, amount, data.currency)
    return { data: input.data }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const data = input.data as SessionData | undefined
    if (!data?.ref) return { data: input.data ?? {} }
    const payment = await this.client_.getPayment(data.ref)
    return {
      data: { ...data, status: payment.status } as Record<string, unknown>,
    }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const data = input.data as SessionData | undefined
    if (!data?.ref) return { status: "pending" }
    const payment = await this.client_.getPayment(data.ref)
    return { status: this.mapStatus(payment.status) }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const headers = (payload.headers ?? {}) as Record<string, string | string[]>
    const sig = pickHeader(headers, "x-signature")
    const ts = pickHeader(headers, "x-timestamp")
    const rawBody =
      payload.rawData instanceof Buffer
        ? payload.rawData.toString("utf8")
        : typeof payload.rawData === "string"
          ? payload.rawData
          : ""

    const verification = this.client_.verifyCallback({
      rawBody,
      signatureHeader: sig,
      timestampHeader: ts,
    })
    if (!verification.ok) {
      this.logger_.warn(
        `payment-via-broker webhook signature rejected: ${verification.reason}`
      )
      return this.notSupported()
    }

    const body = (payload.data ?? {}) as BrokerCallbackBody
    const ref = body.ref
    const status = body.status
    if (!ref || !status) return this.notSupported()

    const session_id = ref
    if (status === "captured") {
      return {
        action: "captured",
        data: { session_id, amount: new BigNumber(0) },
      }
    }
    if (status === "authorized") {
      return {
        action: "authorized",
        data: { session_id, amount: new BigNumber(0) },
      }
    }
    if (status === "failed" || status === "cancelled") {
      return {
        action: "failed",
        data: { session_id, amount: new BigNumber(0) },
      }
    }
    return this.notSupported()
  }

  private mapStatus(
    status: BrokerStatus
  ): "captured" | "authorized" | "canceled" | "pending" | "error" {
    if (status === "captured") return "captured"
    if (status === "authorized") return "authorized"
    if (status === "failed" || status === "cancelled") return "canceled"
    return "pending"
  }

  private notSupported(): WebhookActionResult {
    return {
      action: "not_supported",
      data: { session_id: "", amount: new BigNumber(0) },
    }
  }

  private toMinorUnit(amount: unknown, currencyCode: string): number {
    const decimal = this.amountToNumeric(amount)
    return Math.round(decimal * Math.pow(10, decimalsForCurrency(currencyCode)))
  }

  private amountToNumeric(amount: unknown): number {
    if (typeof amount === "number") return amount
    if (typeof amount === "bigint") return Number(amount)
    if (amount && typeof amount === "object" && "numeric" in amount) {
      const n = (amount as { numeric: unknown }).numeric
      if (typeof n === "number") return n
      if (typeof n === "string") return Number(n)
    }
    if (typeof amount === "string") return Number(amount)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `payment-via-broker: cannot interpret amount ${JSON.stringify(amount)}`
    )
  }
}

function pickHeader(
  headers: Record<string, string | string[]>,
  name: string
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()]
  if (Array.isArray(value)) return value[0]
  return value
}

function randomToken(): string {
  const buf = new Uint8Array(16)
  const c = (globalThis.crypto ?? require("node:crypto").webcrypto) as Crypto
  c.getRandomValues(buf)
  let s = ""
  for (const byte of buf) s += byte.toString(16).padStart(2, "0")
  return s.slice(0, 22)
}

export default PaymentViaBrokerProviderService
