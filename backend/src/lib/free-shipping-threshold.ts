// Pure, framework-free helpers for the free-shipping threshold. No Medusa
// imports so they can be unit-tested and shared by the admin route, the store
// route, the price-sync helper, and the settings validator.

/**
 * Normalize a threshold to a positive number, or null when free shipping should
 * be OFF (null / undefined / empty / non-numeric / <= 0). Accepts both `,` and
 * `.` as the decimal separator.
 */
export function normalizeThreshold(value: unknown): number | null {
  if (value === undefined || value === null) return null
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace(",", ".")
    if (trimmed === "") return null
    const n = Number(trimmed)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

/**
 * Validates a free-shipping threshold value. Returns [] when it is absent/empty
 * (meaning "no free shipping") or a valid non-negative number; otherwise a
 * single error message.
 */
export function validateFreeShippingThreshold(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return []
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim().replace(",", "."))
        : NaN
  if (!Number.isFinite(n) || n < 0) {
    return [
      'Field "free_shipping_threshold" must be a non-negative number (EUR), or empty to disable free shipping',
    ]
  }
  return []
}
