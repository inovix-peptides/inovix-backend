export type BrokerOptions = {
  brokerUrl: string
  clientId: string
  hmacSecret: string
  // Tolerance window for callback timestamps in seconds (default 300).
  callbackToleranceSeconds?: number
  // Base URL of the neutral relay. The broker initiate flow sends
  // `<relayBaseUrl>/r/<token>` as the returnUrl so Mollie never sees
  // the Inovix domain. Example: "https://payments-relay.nl".
  relayBaseUrl: string
  // Cloudflare KV credentials used to provision the redirect token.
  cfKvAccountId: string
  cfKvNamespaceId: string
  cfKvApiToken: string
  // Optional TTL (seconds) on the KV entry. Default 3600.
  returnTokenTtlSeconds?: number
}

export type CreateBrokerPaymentInput = {
  ref: string
  amountMinor: number
  currencyCode: string
  returnUrl: string
  locale?: string
  metadata?: Record<string, unknown>
  idempotencyKey?: string
}

export type CreateBrokerPaymentResult = {
  ref: string
  checkoutUrl: string
  status: BrokerStatus
}

export type BrokerStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "refunded"

export type BrokerPayment = {
  ref: string
  status: BrokerStatus
  brokerPaymentId: string | null
  capturedAt: string | null
}

export type BrokerCallbackBody = {
  ref: string
  status: BrokerStatus
  captured_at?: string
  failure_reason?: string
}
