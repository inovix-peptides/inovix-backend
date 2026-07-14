import { POST } from "../route"

function makeRes() {
  const res: any = { statusCode: 0, body: null }
  res.status = (c: number) => ((res.statusCode = c), res)
  res.json = (b: unknown) => ((res.body = b), res)
  return res
}

function makeReq(overrides: Partial<Record<string, unknown>> = {}) {
  const updateOrders = jest.fn().mockResolvedValue([])
  const orderModule = {
    retrieveOrder: jest.fn().mockResolvedValue({
      id: "order_1",
      metadata: { existing_key: "keep-me" },
    }),
    updateOrders,
  }
  const userModule = {
    retrieveUser: jest.fn().mockResolvedValue({
      id: "user_1",
      first_name: "Anna",
      last_name: "Test",
      email: "anna@example.com",
    }),
  }
  const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
  const req: any = {
    params: { id: "order_1" },
    auth_context: { actor_id: "user_1" },
    body: { action: "tick_item", item_id: "item_1", checked: true },
    scope: {
      resolve: (key: string) => {
        if (key === "order") return orderModule
        if (key === "user") return userModule
        if (key === "logger") return logger
        throw new Error(`unexpected resolve: ${key}`)
      },
    },
    ...overrides,
  }
  return { req, orderModule, userModule, updateOrders }
}

describe("POST /admin/orders/:id/fulfillment-checklist", () => {
  it("stamps the authenticated user and merges into existing metadata", async () => {
    const { req, updateOrders } = makeReq()
    const res = makeRes()
    await POST(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.fulfillment_checklist.items.item_1.by_name).toBe("Anna Test")
    expect(res.body.fulfillment_checklist.items.item_1.by_id).toBe("user_1")

    const [updates] = updateOrders.mock.calls[0]
    expect(updates[0].id).toBe("order_1")
    expect(updates[0].metadata.existing_key).toBe("keep-me")
    expect(updates[0].metadata.fulfillment_checklist.items.item_1).toBeDefined()
  })

  it("401s without an authenticated actor", async () => {
    const { req } = makeReq({ auth_context: {} })
    const res = makeRes()
    await POST(req, res)
    expect(res.statusCode).toBe(401)
  })

  it("400s on an invalid action without writing", async () => {
    const { req, updateOrders } = makeReq({
      body: { action: "override", step: "items", reason: "kort" },
    })
    const res = makeRes()
    await POST(req, res)
    expect(res.statusCode).toBe(400)
    expect(updateOrders).not.toHaveBeenCalled()
  })

  it("falls back to the actor id when the user lookup fails", async () => {
    const { req, userModule } = makeReq()
    userModule.retrieveUser.mockRejectedValue(new Error("gone"))
    const res = makeRes()
    await POST(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.fulfillment_checklist.items.item_1.by_name).toBe("user_1")
  })

  it("500s in Dutch when the order module throws", async () => {
    const { req, orderModule } = makeReq()
    orderModule.retrieveOrder.mockRejectedValue(new Error("db down"))
    const res = makeRes()
    await POST(req, res)
    expect(res.statusCode).toBe(500)
    expect(res.body.message).toBe("Opslaan mislukt.")
  })
})
