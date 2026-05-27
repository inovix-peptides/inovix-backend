export type BrokerOptions = {
  brokerUrl: string
  clientId: string
  hmacSecret: string
  // Tolerance window for callback timestamps in seconds (default 300).
  callbackToleranceSeconds?: number
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
