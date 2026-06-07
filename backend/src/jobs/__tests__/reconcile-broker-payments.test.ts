import { selectRecentBrokerCartIds } from "../reconcile-broker-payments"

const NOW = 1_000_000_000_000
const HOUR = 60 * 60 * 1000

describe("selectRecentBrokerCartIds", () => {
  it("returns cart ids of recent sessions that carry a cart_id", () => {
    const ids = selectRecentBrokerCartIds(
      [
        { data: { cart_id: "cart_a" }, created_at: new Date(NOW - HOUR) },
        { data: { cart_id: "cart_b" }, created_at: new Date(NOW - 2 * HOUR) },
      ],
      NOW
    )
    expect(ids.sort()).toEqual(["cart_a", "cart_b"])
  })

  it("drops sessions older than the lookback window", () => {
    const ids = selectRecentBrokerCartIds(
      [
        { data: { cart_id: "fresh" }, created_at: new Date(NOW - HOUR) },
        { data: { cart_id: "stale" }, created_at: new Date(NOW - 5 * HOUR) },
      ],
      NOW
    )
    expect(ids).toEqual(["fresh"])
  })

  it("drops sessions without a cart_id (pre-fix sessions)", () => {
    const ids = selectRecentBrokerCartIds(
      [
        { data: { ref: "pay_x" } as { cart_id?: string }, created_at: new Date(NOW) },
        { data: null, created_at: new Date(NOW) },
        { data: { cart_id: "cart_ok" }, created_at: new Date(NOW) },
      ],
      NOW
    )
    expect(ids).toEqual(["cart_ok"])
  })

  it("dedupes repeated cart ids (multiple sessions per cart from re-init)", () => {
    const ids = selectRecentBrokerCartIds(
      [
        { data: { cart_id: "cart_dup" }, created_at: new Date(NOW) },
        { data: { cart_id: "cart_dup" }, created_at: new Date(NOW - HOUR) },
      ],
      NOW
    )
    expect(ids).toEqual(["cart_dup"])
  })

  it("treats a missing created_at as out of window", () => {
    const ids = selectRecentBrokerCartIds(
      [{ data: { cart_id: "no_ts" }, created_at: null }],
      NOW
    )
    expect(ids).toEqual([])
  })
})
