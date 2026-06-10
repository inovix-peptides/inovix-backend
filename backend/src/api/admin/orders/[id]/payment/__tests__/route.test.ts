import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"

import { GET } from "../route"
import { PROVIDER_ID } from "../resolve"

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() }

function mockRequest(graphResult: unknown, orderId = "order_1") {
  const query = { graph: jest.fn().mockResolvedValue(graphResult) }
  return {
    params: { id: orderId },
    scope: {
      resolve: jest.fn((key: string) => {
        if (key === "logger") return mockLogger
        // ContainerRegistrationKeys.QUERY resolves to "query"
        if (key === "query") return query
        return undefined
      }),
    },
  } as unknown as MedusaRequest & { __query: typeof query }
}

function mockResponse() {
  const res: any = {}
  res.json = jest.fn().mockReturnValue(res)
  res.status = jest.fn().mockReturnValue(res)
  return res as MedusaResponse & { json: jest.Mock; status: jest.Mock }
}

function orderWithBrokerPayment() {
  return {
    data: [
      {
        id: "order_1",
        payment_collections: [
          {
            payments: [
              {
                id: "pay_broker",
                provider_id: PROVIDER_ID,
                currency_code: "eur",
                amount: 100,
                captured_amount: 100,
                refunded_amount: 0,
                captured_at: "2026-06-01T10:00:00.000Z",
                canceled_at: null,
                data: { ref: "pay_abc" },
                refunds: [],
              },
            ],
          },
        ],
      },
    ],
  }
}

describe("GET /admin/orders/:id/payment", () => {
  beforeEach(() => jest.clearAllMocks())

  it("returns the merged payment view for an order with a broker payment", async () => {
    const req = mockRequest(orderWithBrokerPayment())
    const res = mockResponse()

    await GET(req, res)

    expect(res.json).toHaveBeenCalledTimes(1)
    const body = res.json.mock.calls[0][0]
    expect(body.payment.ref).toBe("pay_abc")
    expect(body.payment.amount).toBe(100)
    expect(body.payment.remaining_refundable).toBe(100)
    // No broker configured in the test env -> degraded, not an error.
    expect(body.payment.broker_unavailable).toBe(true)
    expect(body.payment.status).toBe("captured")
  })

  it("404s when the order has no broker payment", async () => {
    const req = mockRequest({
      data: [{ id: "order_1", payment_collections: [{ payments: [] }] }],
    })
    const res = mockResponse()

    await GET(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it("400s when the order id is missing", async () => {
    const req = mockRequest(orderWithBrokerPayment(), "")
    const res = mockResponse()

    await GET(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })
})
