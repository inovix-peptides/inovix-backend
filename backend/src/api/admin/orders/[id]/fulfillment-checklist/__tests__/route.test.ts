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

  it("serializes concurrent writes for the same order so neither tick is lost", async () => {
    // Fake order module backed by a mutable store, standing in for the DB
    // row. retrieveOrder waits ~10ms before returning a snapshot of the
    // store, and updateOrders writes the store's metadata. Without the
    // per-order write queue, two concurrent POSTs both read the same
    // pre-write snapshot and the second updateOrders silently clobbers the
    // first tick (lost update).
    const store = { metadata: { existing_key: "keep-me" } as Record<string, unknown> }

    const orderModule = {
      // Snapshot is captured synchronously at call time (mirroring a real DB
      // read that starts immediately but takes ~10ms to come back), so two
      // calls issued back to back both see the pre-write state.
      retrieveOrder: jest.fn().mockImplementation(async () => {
        const snapshot = { ...store.metadata }
        await new Promise((resolve) => setTimeout(resolve, 10))
        return { id: "order_1", metadata: snapshot }
      }),
      updateOrders: jest.fn().mockImplementation(async (updates: any[]) => {
        store.metadata = updates[0].metadata
        return []
      }),
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

    const makeConcurrentReq = (itemId: string) => ({
      params: { id: "order_1" },
      auth_context: { actor_id: "user_1" },
      body: { action: "tick_item", item_id: itemId, checked: true },
      scope: {
        resolve: (key: string) => {
          if (key === "order") return orderModule
          if (key === "user") return userModule
          if (key === "logger") return logger
          throw new Error(`unexpected resolve: ${key}`)
        },
      },
    })

    const res1 = makeRes()
    const res2 = makeRes()

    await Promise.all([
      POST(makeConcurrentReq("item_1") as any, res1),
      POST(makeConcurrentReq("item_2") as any, res2),
    ])

    expect(res1.statusCode).toBe(200)
    expect(res2.statusCode).toBe(200)

    const items = (store.metadata.fulfillment_checklist as any).items
    expect(items.item_1).toBeDefined()
    expect(items.item_2).toBeDefined()
  })
})
