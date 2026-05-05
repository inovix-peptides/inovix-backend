import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"

jest.mock("@medusajs/framework/utils", () => ({
  Modules: { PAYMENT: "paymentModuleService" },
  ContainerRegistrationKeys: { QUERY: "query" },
}))

import { POST } from "../route"

const mockLogger = { error: jest.fn() }

function mockResponse() {
  const res: Partial<MedusaResponse> & {
    status: jest.Mock
    json: jest.Mock
  } = {
    status: jest.fn().mockReturnThis() as jest.Mock,
    json: jest.fn().mockReturnThis() as jest.Mock,
  }
  return res as MedusaResponse & { status: jest.Mock; json: jest.Mock }
}

function mockRequest(
  body: unknown,
  graphData: unknown,
  paymentModule: unknown
) {
  return {
    body,
    scope: {
      resolve: (key: string) => {
        if (key === "query") return { graph: jest.fn().mockResolvedValue({ data: graphData }) }
        if (key === "paymentModuleService") return paymentModule
        if (key === "logger") return mockLogger
        throw new Error(`unexpected resolve(${key})`)
      },
    },
  } as unknown as MedusaRequest
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("POST /store/multisafepay/authorize", () => {
  it("rejects when cart_id is missing", async () => {
    const res = mockResponse()
    const req = mockRequest({ order_id: "tnc_x" }, [], {})
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: "cart_id and order_id are required",
    })
  })

  it("rejects when order_id is missing", async () => {
    const res = mockResponse()
    const req = mockRequest({ cart_id: "cart_1" }, [], {})
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 404 when no MSP payment session exists for the cart", async () => {
    const res = mockResponse()
    const req = mockRequest(
      { cart_id: "cart_1", order_id: "tnc_x" },
      [{ payment_collection: { payment_sessions: [] } }],
      {}
    )
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it("returns 400 when session mspOrderId does not match request order_id", async () => {
    const res = mockResponse()
    const req = mockRequest(
      { cart_id: "cart_1", order_id: "tnc_other" },
      [
        {
          payment_collection: {
            payment_sessions: [
              {
                id: "ps_1",
                provider_id: "pp_multisafepay_multisafepay",
                data: { mspOrderId: "tnc_real" },
                amount: 1000,
                currency_code: "EUR",
              },
            ],
          },
        },
      ],
      { updatePaymentSession: jest.fn() }
    )
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: "order_id mismatch" })
  })

  it("returns 400 when session has no mspOrderId yet", async () => {
    const res = mockResponse()
    const req = mockRequest(
      { cart_id: "cart_1", order_id: "tnc_x" },
      [
        {
          payment_collection: {
            payment_sessions: [
              {
                id: "ps_1",
                provider_id: "pp_multisafepay_multisafepay",
                data: {},
                amount: 1000,
                currency_code: "EUR",
              },
            ],
          },
        },
      ],
      { updatePaymentSession: jest.fn() }
    )
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: "order_id mismatch" })
  })

  it("returns 200 and skips updatePaymentSession when transaction_id is omitted", async () => {
    const updatePaymentSession = jest.fn()
    const res = mockResponse()
    const req = mockRequest(
      { cart_id: "cart_1", order_id: "tnc_x" },
      [
        {
          payment_collection: {
            payment_sessions: [
              {
                id: "ps_1",
                provider_id: "pp_multisafepay_multisafepay",
                data: { mspOrderId: "tnc_x", paymentUrl: "https://x" },
                amount: 1000,
                currency_code: "EUR",
              },
            ],
          },
        },
      ],
      { updatePaymentSession }
    )
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
    expect(updatePaymentSession).not.toHaveBeenCalled()
  })

  it("writes transactionId to session when transaction_id is provided", async () => {
    const updatePaymentSession = jest.fn().mockResolvedValue(undefined)
    const res = mockResponse()
    const req = mockRequest(
      { cart_id: "cart_1", order_id: "tnc_x", transaction_id: "1234567890" },
      [
        {
          payment_collection: {
            payment_sessions: [
              {
                id: "ps_1",
                provider_id: "pp_multisafepay_multisafepay",
                data: { mspOrderId: "tnc_x", paymentUrl: "https://x" },
                amount: 1000,
                currency_code: "EUR",
              },
            ],
          },
        },
      ],
      { updatePaymentSession }
    )
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(updatePaymentSession).toHaveBeenCalledWith({
      id: "ps_1",
      data: expect.objectContaining({
        mspOrderId: "tnc_x",
        transactionId: "1234567890",
      }),
      amount: 1000,
      currency_code: "EUR",
    })
  })

  it("returns 500 when an unexpected error is thrown", async () => {
    const res = mockResponse()
    const req = {
      body: { cart_id: "cart_1", order_id: "tnc_x" },
      scope: {
        resolve: (key: string) => {
          if (key === "query") {
            return {
              graph: jest.fn().mockRejectedValue(new Error("boom")),
            }
          }
          if (key === "paymentModuleService") return {}
          if (key === "logger") return mockLogger
          throw new Error(`unexpected resolve(${key})`)
        },
      },
    } as unknown as MedusaRequest
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
