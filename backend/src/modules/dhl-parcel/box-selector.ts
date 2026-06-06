/**
 * Pure weight and box-preset selection helpers for DHL Parcel fulfillment.
 * No Medusa imports, no DB access, no unit conversion (weights are grams as-is).
 */

/**
 * Sums the total order weight in grams across all line items.
 *
 * @throws Error if any item is missing a usable product weight.
 */
export function sumOrderWeightGrams(
  items: Array<{ quantity: number; product?: { weight?: number | null } }>
): number {
  if (items.length === 0) return 0

  let total = 0
  for (const item of items) {
    const w = item.product?.weight
    if (w == null || !Number.isFinite(w)) {
      throw new Error(
        'Cannot compute shipment weight: an order item is missing a product weight'
      )
    }
    total += item.quantity * w
  }
  return total
}

/**
 * Selects the best-fit box preset for a given total unit count.
 *
 * - Picks the smallest preset whose `max_items >= totalUnits` (overflow: false).
 * - If no preset fits, returns the largest preset (overflow: true).
 * - Throws if `presets` is empty.
 */
export function suggestBoxPreset<T extends { max_items: number }>(
  presets: T[],
  totalUnits: number
): { preset: T; overflow: boolean } {
  if (presets.length === 0) {
    throw new Error('Cannot select a box preset: no presets provided')
  }

  // Candidates that can fit the order (sorted ascending by max_items so we get smallest first)
  const fitting = presets.filter((p) => p.max_items >= totalUnits)

  if (fitting.length > 0) {
    // Stable: sort ascending and take first; ties go to first encountered (presets order preserved for equal max_items)
    const sorted = [...fitting].sort((a, b) => a.max_items - b.max_items)
    return { preset: sorted[0], overflow: false }
  }

  // No preset fits — return the largest
  const sorted = [...presets].sort((a, b) => b.max_items - a.max_items)
  return { preset: sorted[0], overflow: true }
}
