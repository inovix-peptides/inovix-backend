import { selectRecentBrokerCarts } from "../reconcile-broker-payments"

const NOW = 1_000_000_000_000
const HOUR = 60 * 60 * 1000

describe("selectRecentBrokerCarts", () => {
  it("returns {cartId, ref} for recent sessions that carry both", () => {
    const out = selectRecentBrokerCarts(
      [
        { data: { cart_id: "cart_a", ref: "pay_a" }, created_at: new Date(NOW - HOUR) },
        { data: { cart_id: "cart_b", ref: "pay_b" }, created_at: new Date(NOW - 2 * HOUR) },
      ],
      NOW
    )
    expect(out).toEqual([
      { cartId: "cart_a", ref: "pay_a" },
      { cartId: "cart_b", ref: "pay_b" },
    ])
  })

  it("drops sessions older than the lookback window", () => {
    const out = selectRecentBrokerCarts(
      [
        { data: { cart_id: "fresh", ref: "pay_f" }, created_at: new Date(NOW - HOUR) },
        { data: { cart_id: "stale", ref: "pay_s" }, created_at: new Date(NOW - 5 * HOUR) },
      ],
      NOW
    )
    expect(out).toEqual([{ cartId: "fresh", ref: "pay_f" }])
  })

  it("drops sessions missing a cart_id or ref", () => {
    const out = selectRecentBrokerCarts(
      [
        { data: { ref: "pay_x" }, created_at: new Date(NOW) },
        { data: { cart_id: "cart_y" }, created_at: new Date(NOW) },
        { data: null, created_at: new Date(NOW) },
        { data: { cart_id: "cart_ok", ref: "pay_ok" }, created_at: new Date(NOW) },
      ],
      NOW
    )
    expect(out).toEqual([{ cartId: "cart_ok", ref: "pay_ok" }])
  })

  it("dedupes per cart, keeping the newest ref (input ordered newest-first)", () => {
    const out = selectRecentBrokerCarts(
      [
        { data: { cart_id: "cart_dup", ref: "pay_new" }, created_at: new Date(NOW) },
        { data: { cart_id: "cart_dup", ref: "pay_old" }, created_at: new Date(NOW - HOUR) },
      ],
      NOW
    )
    expect(out).toEqual([{ cartId: "cart_dup", ref: "pay_new" }])
  })

  it("treats a missing created_at as out of window", () => {
    const out = selectRecentBrokerCarts(
      [{ data: { cart_id: "no_ts", ref: "pay_n" }, created_at: null }],
      NOW
    )
    expect(out).toEqual([])
  })
})
