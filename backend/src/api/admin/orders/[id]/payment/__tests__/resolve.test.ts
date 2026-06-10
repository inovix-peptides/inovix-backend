import {
  resolveBrokerPayment,
  fetchBrokerLive,
  PROVIDER_ID,
} from "../resolve"

function mockQuery(graphResult: unknown) {
  return {
    graph: jest.fn().mockResolvedValue(graphResult),
  }
}

describe("resolveBrokerPayment", () => {
  it("picks the payment whose provider_id is the broker provider", async () => {
    const brokerPayment = {
      id: "pay_broker",
      provider_id: PROVIDER_ID,
      data: { ref: "pay_abc" },
    }
    const query = mockQuery({
      data: [
        {
          id: "order_1",
          payment_collections: [
            {
              payments: [
                { id: "pay_other", provider_id: "pp_stripe_stripe" },
                brokerPayment,
              ],
            },
          ],
        },
      ],
    })

    const result = await resolveBrokerPayment(query as never, "order_1")
    expect(result?.id).toBe("pay_broker")
    expect(query.graph).toHaveBeenCalledTimes(1)
  })

  it("returns null when the order has no broker payment", async () => {
    const query = mockQuery({
      data: [
        {
          id: "order_1",
          payment_collections: [
            { payments: [{ id: "pay_other", provider_id: "pp_stripe_stripe" }] },
          ],
        },
      ],
    })
    expect(await resolveBrokerPayment(query as never, "order_1")).toBeNull()
  })

  it("returns null when the order is not found", async () => {
    const query = mockQuery({ data: [] })
    expect(await resolveBrokerPayment(query as never, "missing")).toBeNull()
  })

  it("returns null when there are no payment collections", async () => {
    const query = mockQuery({ data: [{ id: "order_1", payment_collections: null }] })
    expect(await resolveBrokerPayment(query as never, "order_1")).toBeNull()
  })
})

describe("fetchBrokerLive", () => {
  it("maps an injected broker client's payment into the live shape", async () => {
    const client = {
      getPayment: jest.fn().mockResolvedValue({
        ref: "pay_abc",
        status: "captured",
        brokerPaymentId: "tr_123",
        capturedAt: "2026-06-01T10:00:00.000Z",
      }),
    }
    const live = await fetchBrokerLive("pay_abc", { client })
    expect(client.getPayment).toHaveBeenCalledWith("pay_abc")
    expect(live).toEqual({
      status: "captured",
      mollie_payment_id: "tr_123",
      captured_at: "2026-06-01T10:00:00.000Z",
    })
  })

  it("returns null and warns when the broker call throws", async () => {
    const warn = jest.fn()
    const client = {
      getPayment: jest.fn().mockRejectedValue(new Error("broker down")),
    }
    const live = await fetchBrokerLive("pay_abc", { client, logger: { warn } })
    expect(live).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it("returns null when no client is injected and the broker is unconfigured", async () => {
    // No BROKER_URL etc in the test env -> cannot build a client.
    const live = await fetchBrokerLive("pay_abc")
    expect(live).toBeNull()
  })
})
