import { formatAge } from "../logic"

const NOW = new Date("2026-07-14T12:00:00.000Z").getTime()

describe("formatAge", () => {
  it("formats minutes, hours and days in Dutch", () => {
    expect(formatAge("2026-07-14T11:55:00.000Z", NOW)).toBe("5 min geleden")
    expect(formatAge("2026-07-14T09:00:00.000Z", NOW)).toBe("3 uur geleden")
    expect(formatAge("2026-07-12T12:00:00.000Z", NOW)).toBe("2 dagen geleden")
    expect(formatAge("2026-07-13T11:00:00.000Z", NOW)).toBe("1 dag geleden")
  })
  it("degrades gracefully on null or garbage", () => {
    expect(formatAge(null, NOW)).toBe("")
    expect(formatAge("garbage", NOW)).toBe("")
  })
})
