import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"

// Mock the refund workflow so we never boot the real Medusa workflow engine.
const runMock = jest.fn().mockResolvedValue({ result: {}, errors: [] })
const workflowFactory = jest.fn().mockReturnValue({ run: runMock })
jest.mock("@medusajs/core-flows", () => ({
  refundPaymentWorkflow: (...args: unknown[]) => workflowFactory(...args),
}))

import { POST } from "../route"
import { PROVIDER_ID } from "../../resolve"

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() }

function brokerPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay_broker",
    provider_id: PROVIDER_ID,
    currency_code: "eur",
    amount: 100,
    captured_amount: 100,
    refunded_amount: 30,
    captured_at: "2026-06-01T10:00:00.000Z",
    canceled_at: null,
    data: { ref: "pay_abc" },
    refunds: [],
    ...overrides,
  }
}

function mockRequest(body: unknown, paymentOverrides?: Record<string, unknown>, orderId = "order_1") {
  const graphResult = {
    data: [
      {
        id: "order_1",
        payment_collections: [{ payments: [brokerPayment(paymentOverrides)] }],
      },
    ],
  }
  const query = { graph: jest.fn().mockResolvedValue(graphResult) }
  return {
    params: { id: orderId },
    body,
    auth_context: { actor_id: "user_admin" },
    scope: {
      resolve: jest.fn((key: string) => {
        if (key === "logger") return mockLogger
        if (key === "query") return query
        return undefined
      }),
    },
  } as unknown as MedusaRequest
}

function mockResponse() {
  const res: any = {}
  res.json = jest.fn().mockReturnValue(res)
  res.status = jest.fn().mockReturnValue(res)
  return res as MedusaResponse & { json: jest.Mock; status: jest.Mock }
}

describe("POST /admin/orders/:id/payment/refund", () => {
  beforeEach(() => jest.clearAllMocks())

  it("runs the refund workflow with the payment id, amount and actor", async () => {
    const req = mockRequest({ amount: 20, note: "klant retour" })
    const res = mockResponse()

    await POST(req, res)

    expect(workflowFactory).toHaveBeenCalledTimes(1)
    expect(runMock).toHaveBeenCalledTimes(1)
    const input = runMock.mock.calls[0][0].input
    expect(input.payment_id).toBe("pay_broker")
    expect(input.amount).toBe(20)
    expect(input.created_by).toBe("user_admin")
    expect(input.note).toBe("klant retour")
    expect(res.status).toHaveBeenCalledWith(200)
    // Returns a refreshed payment view.
    expect(res.json.mock.calls[0][0].payment).toBeDefined()
  })

  it("rejects an amount over the remaining refundable without calling the workflow", async () => {
    // captured 100, already refunded 30 -> only 70 left.
    const req = mockRequest({ amount: 80 })
    const res = mockResponse()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(runMock).not.toHaveBeenCalled()
  })

  it("rejects a zero/negative amount", async () => {
    const req = mockRequest({ amount: 0 })
    const res = mockResponse()
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(runMock).not.toHaveBeenCalled()
  })

  it("rejects a non-numeric amount", async () => {
    const req = mockRequest({ amount: "lots" })
    const res = mockResponse()
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(runMock).not.toHaveBeenCalled()
  })

  it("404s when the order has no broker payment", async () => {
    const req = {
      params: { id: "order_1" },
      body: { amount: 10 },
      auth_context: { actor_id: "user_admin" },
      scope: {
        resolve: jest.fn((key: string) => {
          if (key === "logger") return mockLogger
          if (key === "query")
            return {
              graph: jest.fn().mockResolvedValue({
                data: [{ id: "order_1", payment_collections: [{ payments: [] }] }],
              }),
            }
          return undefined
        }),
      },
    } as unknown as MedusaRequest
    const res = mockResponse()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(runMock).not.toHaveBeenCalled()
  })

  it("500s and does not crash when the workflow throws", async () => {
    runMock.mockRejectedValueOnce(new Error("mollie refused"))
    const req = mockRequest({ amount: 10 })
    const res = mockResponse()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
  })
})
