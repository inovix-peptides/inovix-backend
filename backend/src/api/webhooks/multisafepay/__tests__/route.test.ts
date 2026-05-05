import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"

jest.mock("@medusajs/framework/utils", () => ({
  Modules: {
    PAYMENT: "paymentModuleService",
    NOTIFICATION: "notificationModuleService",
    EVENT_BUS: "eventBusModuleService",
  },
  ContainerRegistrationKeys: { QUERY: "query" },
}))

jest.mock("../../../../lib/instrument", () => ({
  Sentry: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  },
}))

// Lets each test override what getOrder returns by mutating this ref.
const mockGetOrder = jest.fn()
jest.mock("../../../../modules/payment-multisafepay/client", () => ({
  MultisafepayClient: jest.fn().mockImplementation(() => ({
    getOrder: mockGetOrder,
  })),
}))

// Avoid pulling react-email through email-notifications/templates,
// which trips Jest's moduleNameMapper inside htmlparser2.
jest.mock("../../../../modules/email-notifications/templates", () => ({
  EmailTemplates: { ABANDONED_CART_PAID: "abandoned-cart-paid" },
}))

import { POST, __resetIdempotencyCacheForTests } from "../route"

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}

function mockRequest(
  paymentModule: unknown,
  body: unknown = {},
  extras: { query?: unknown; notification?: unknown; eventBus?: unknown } = {}
) {
  return {
    body,
    rawBody: Buffer.from(JSON.stringify(body)),
    headers: {},
    scope: {
      resolve: jest.fn((key: string) => {
        if (key === "logger") return mockLogger
        if (key === "paymentModuleService") return paymentModule
        if (key === "query") return extras.query
        if (key === "notificationModuleService") return extras.notification
        if (key === "eventBusModuleService") return extras.eventBus
        return undefined
      }),
    },
  } as unknown as MedusaRequest
}

function mockResponse() {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.type = jest.fn().mockReturnValue(res)
  res.send = jest.fn().mockReturnValue(res)
  return res as MedusaResponse & {
    status: jest.Mock
    type: jest.Mock
    send: jest.Mock
  }
}

describe("POST /webhooks/multisafepay", () => {
  const ORIGINAL_SUPPORT_EMAIL = process.env.SUPPORT_EMAIL
  const ORIGINAL_API_KEY = process.env.MULTISAFEPAY_API_KEY

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetOrder.mockReset()
    __resetIdempotencyCacheForTests()
    process.env.SUPPORT_EMAIL = "ops@example.test"
    process.env.MULTISAFEPAY_API_KEY = "test-key"
  })

  afterAll(() => {
    if (ORIGINAL_SUPPORT_EMAIL === undefined) delete process.env.SUPPORT_EMAIL
    else process.env.SUPPORT_EMAIL = ORIGINAL_SUPPORT_EMAIL
    if (ORIGINAL_API_KEY === undefined) delete process.env.MULTISAFEPAY_API_KEY
    else process.env.MULTISAFEPAY_API_KEY = ORIGINAL_API_KEY
  })

  it("calls getWebhookActionAndData with the bare provider id (no pp_ prefix)", async () => {
    // Regression: Medusa's payment module prepends `pp_` to `provider`
    // (payment-module.js: `const providerId = pp_${eventData.provider}`).
    // Passing the already-prefixed id produced `pp_pp_multisafepay_multisafepay`
    // and threw "Unable to retrieve the payment provider" on every webhook.
    const paymentModule = {
      getWebhookActionAndData: jest.fn().mockResolvedValue(undefined),
    }
    const req = mockRequest(paymentModule)
    const res = mockResponse()

    await POST(req, res)

    expect(paymentModule.getWebhookActionAndData).toHaveBeenCalledTimes(1)
    const arg = paymentModule.getWebhookActionAndData.mock.calls[0][0]
    expect(arg.provider).toBe("multisafepay_multisafepay")
    expect(arg.provider).not.toMatch(/^pp_/)
  })

  it("acks 200 OK even when getWebhookActionAndData throws", async () => {
    const paymentModule = {
      getWebhookActionAndData: jest
        .fn()
        .mockRejectedValue(new Error("provider lookup failed")),
    }
    const req = mockRequest(paymentModule)
    const res = mockResponse()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith("OK")
  })

  it("suppresses abandoned-cart alert during the redirect race window", async () => {
    // Repro of the 2026-05-02 false positive: webhook arrives 5s after the
    // user pays, but the storefront's cart.complete round-trip is still in
    // flight. The session is fresh, so we should NOT email ops.
    const paymentModule = {
      getWebhookActionAndData: jest.fn().mockResolvedValue(undefined),
      listPaymentSessions: jest.fn().mockResolvedValue([
        {
          id: "ps_1",
          payment_collection_id: "paycol_1",
          created_at: new Date().toISOString(),
          data: { mspOrderId: "tnc_abc" },
        },
      ]),
    }
    const notification = { createNotifications: jest.fn() }
    const query = {
      graph: jest.fn().mockResolvedValue({
        data: [{ cart: { id: "cart_1", completed_at: null } }],
      }),
    }
    mockGetOrder.mockResolvedValue({
      orderId: "tnc_abc",
      status: "completed",
      amountCents: 1000,
      currencyCode: "EUR",
    })

    const req = mockRequest(
      paymentModule,
      { order_id: "tnc_abc" },
      { query, notification }
    )
    await POST(req, mockResponse())

    expect(notification.createNotifications).not.toHaveBeenCalled()
  })

  it("fires abandoned-cart alert once the grace period has elapsed", async () => {
    // Same shape but with a 30-minute-old session | the cart should have
    // completed by now, so the alert is genuinely warranted.
    const paymentModule = {
      getWebhookActionAndData: jest.fn().mockResolvedValue(undefined),
      listPaymentSessions: jest.fn().mockResolvedValue([
        {
          id: "ps_1",
          payment_collection_id: "paycol_1",
          created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          data: { mspOrderId: "tnc_abc" },
        },
      ]),
    }
    const notification = { createNotifications: jest.fn().mockResolvedValue(undefined) }
    const query = {
      graph: jest.fn().mockResolvedValue({
        data: [
          {
            cart: {
              id: "cart_1",
              email: "u@example.test",
              completed_at: null,
              currency_code: "EUR",
            },
          },
        ],
      }),
    }
    mockGetOrder.mockResolvedValue({
      orderId: "tnc_abc",
      status: "completed",
      amountCents: 1000,
      currencyCode: "EUR",
      customerEmail: "u@example.test",
    })

    const req = mockRequest(
      paymentModule,
      { order_id: "tnc_abc" },
      { query, notification }
    )
    await POST(req, mockResponse())

    expect(notification.createNotifications).toHaveBeenCalledTimes(1)
  })

  describe("idempotency", () => {
    function buildAbandonedScenario() {
      const paymentModule = {
        getWebhookActionAndData: jest.fn().mockResolvedValue(undefined),
        listPaymentSessions: jest.fn().mockResolvedValue([
          {
            id: "ps_1",
            payment_collection_id: "paycol_1",
            created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            data: { mspOrderId: "tnc_abc" },
          },
        ]),
      }
      const notification = {
        createNotifications: jest.fn().mockResolvedValue(undefined),
      }
      const query = {
        graph: jest.fn().mockResolvedValue({
          data: [
            {
              cart: {
                id: "cart_1",
                email: "u@example.test",
                completed_at: null,
                currency_code: "EUR",
              },
            },
          ],
        }),
      }
      return { paymentModule, notification, query }
    }

    it("fires side effects on the first webhook for (orderId, completed)", async () => {
      const { paymentModule, notification, query } = buildAbandonedScenario()
      mockGetOrder.mockResolvedValue({
        orderId: "tnc_abc",
        status: "completed",
        amountCents: 1000,
        currencyCode: "EUR",
      })

      const req = mockRequest(
        paymentModule,
        { order_id: "tnc_abc" },
        { query, notification }
      )
      await POST(req, mockResponse())

      expect(notification.createNotifications).toHaveBeenCalledTimes(1)
    })

    it("skips side effects on a duplicate webhook within the TTL window", async () => {
      const { paymentModule, notification, query } = buildAbandonedScenario()
      mockGetOrder.mockResolvedValue({
        orderId: "tnc_abc",
        status: "completed",
        amountCents: 1000,
        currencyCode: "EUR",
      })

      const req1 = mockRequest(
        paymentModule,
        { order_id: "tnc_abc" },
        { query, notification }
      )
      await POST(req1, mockResponse())
      const req2 = mockRequest(
        paymentModule,
        { order_id: "tnc_abc" },
        { query, notification }
      )
      await POST(req2, mockResponse())

      // Side effects fire once, but Medusa's session-state update keeps running.
      expect(notification.createNotifications).toHaveBeenCalledTimes(1)
      expect(paymentModule.getWebhookActionAndData).toHaveBeenCalledTimes(2)
    })

    it("fires for a different status on the same orderId (uncleared then completed)", async () => {
      const eventBus = { emit: jest.fn().mockResolvedValue(undefined) }
      const { paymentModule, notification, query } = buildAbandonedScenario()

      // First delivery: uncleared (does not trigger paid OR failed side effects)
      mockGetOrder.mockResolvedValueOnce({
        orderId: "tnc_abc",
        status: "uncleared",
        amountCents: 1000,
        currencyCode: "EUR",
      })
      const req1 = mockRequest(
        paymentModule,
        { order_id: "tnc_abc" },
        { query, notification, eventBus }
      )
      await POST(req1, mockResponse())
      expect(notification.createNotifications).not.toHaveBeenCalled()

      // Second delivery: completed (different status, should NOT be deduped)
      mockGetOrder.mockResolvedValueOnce({
        orderId: "tnc_abc",
        status: "completed",
        amountCents: 1000,
        currencyCode: "EUR",
      })
      const req2 = mockRequest(
        paymentModule,
        { order_id: "tnc_abc" },
        { query, notification, eventBus }
      )
      await POST(req2, mockResponse())

      expect(notification.createNotifications).toHaveBeenCalledTimes(1)
    })

    it("re-fires after the TTL window elapses (cache sweep)", async () => {
      const { paymentModule, notification, query } = buildAbandonedScenario()
      mockGetOrder.mockResolvedValue({
        orderId: "tnc_abc",
        status: "completed",
        amountCents: 1000,
        currencyCode: "EUR",
      })

      const realDateNow = Date.now
      try {
        const t0 = realDateNow()
        Date.now = jest.fn(() => t0)

        const req1 = mockRequest(
          paymentModule,
          { order_id: "tnc_abc" },
          { query, notification }
        )
        await POST(req1, mockResponse())
        expect(notification.createNotifications).toHaveBeenCalledTimes(1)

        // Advance clock just past TTL (30 min) so the sweep evicts the entry.
        Date.now = jest.fn(() => t0 + 31 * 60 * 1000)

        const req2 = mockRequest(
          paymentModule,
          { order_id: "tnc_abc" },
          { query, notification }
        )
        await POST(req2, mockResponse())
        expect(notification.createNotifications).toHaveBeenCalledTimes(2)
      } finally {
        Date.now = realDateNow
      }
    })

    it("does NOT stamp the cache when the side effect throws, so the next delivery retries", async () => {
      const { paymentModule, query } = buildAbandonedScenario()
      const notification = {
        createNotifications: jest
          .fn()
          .mockRejectedValueOnce(new Error("transient resend failure"))
          .mockResolvedValueOnce(undefined),
      }
      mockGetOrder.mockResolvedValue({
        orderId: "tnc_abc",
        status: "completed",
        amountCents: 1000,
        currencyCode: "EUR",
      })

      const req1 = mockRequest(
        paymentModule,
        { order_id: "tnc_abc" },
        { query, notification }
      )
      await POST(req1, mockResponse())

      // First delivery threw inside the side effect, so the cache should NOT
      // have been stamped. A retry within the TTL window must run again.
      const req2 = mockRequest(
        paymentModule,
        { order_id: "tnc_abc" },
        { query, notification }
      )
      await POST(req2, mockResponse())

      expect(notification.createNotifications).toHaveBeenCalledTimes(2)
    })

    it("passes idempotency_key to createNotifications for cross-restart dedupe", async () => {
      const { paymentModule, notification, query } = buildAbandonedScenario()
      mockGetOrder.mockResolvedValue({
        orderId: "tnc_abc",
        status: "completed",
        amountCents: 1000,
        currencyCode: "EUR",
      })

      const req = mockRequest(
        paymentModule,
        { order_id: "tnc_abc" },
        { query, notification }
      )
      await POST(req, mockResponse())

      const arg = notification.createNotifications.mock.calls[0][0]
      expect(arg.idempotency_key).toBe("abandoned-cart-paid-tnc_abc")
    })
  })
})
