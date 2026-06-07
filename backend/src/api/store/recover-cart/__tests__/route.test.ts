import { Modules } from "@medusajs/framework/utils"
import { GET } from "../route"

type Session = { id: string; data?: Record<string, unknown> }

function makeReq(query: Record<string, unknown>, sessions: Session[]) {
  return {
    query,
    scope: {
      resolve: (key: string) =>
        key === Modules.PAYMENT
          ? { listPaymentSessions: jest.fn().mockResolvedValue(sessions) }
          : { warn: jest.fn() },
    },
  } as never
}

function makeRes() {
  const res = { statusCode: 200 } as {
    statusCode: number
    body?: unknown
    status: (c: number) => typeof res
    json: (b: unknown) => typeof res
  }
  res.status = jest.fn((c: number) => {
    res.statusCode = c
    return res
  }) as never
  res.json = jest.fn((b: unknown) => {
    res.body = b
    return res
  }) as never
  return res
}

describe("GET /store/recover-cart", () => {
  it("400 on a missing ref", async () => {
    const res = makeRes()
    await GET(makeReq({}, []) as never, res as never)
    expect(res.statusCode).toBe(400)
  })

  it("400 on a non-broker ref", async () => {
    const res = makeRes()
    await GET(makeReq({ ref: "not_a_ref" }, []) as never, res as never)
    expect(res.statusCode).toBe(400)
  })

  it("404 when no session matches the ref", async () => {
    const res = makeRes()
    await GET(
      makeReq({ ref: "pay_x" }, [
        { id: "ps1", data: { ref: "pay_other", cart_id: "cart_1" } },
      ]) as never,
      res as never
    )
    expect(res.statusCode).toBe(404)
  })

  it("404 when the matching session has no cart_id", async () => {
    const res = makeRes()
    await GET(
      makeReq({ ref: "pay_x" }, [{ id: "ps1", data: { ref: "pay_x" } }]) as never,
      res as never
    )
    expect(res.statusCode).toBe(404)
  })

  it("returns the cart_id for a matching ref", async () => {
    const res = makeRes()
    await GET(
      makeReq({ ref: "pay_x" }, [
        { id: "ps0", data: { ref: "pay_other", cart_id: "cart_0" } },
        { id: "ps1", data: { ref: "pay_x", cart_id: "cart_42" } },
      ]) as never,
      res as never
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ cart_id: "cart_42" })
  })
})
