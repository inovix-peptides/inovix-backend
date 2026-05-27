export type OrderLineForWeight = {
  quantity: number
  product: { id?: string; title?: string; weight: number | null }
}

export function sumOrderWeightKg(items: OrderLineForWeight[]): number {
  let totalGrams = 0
  for (const item of items) {
    if (item.product.weight == null) {
      throw new Error(
        `Line item is missing weight on product ${item.product.title ?? item.product.id ?? "?"}`,
      )
    }
    totalGrams += item.product.weight * item.quantity
  }
  return totalGrams / 1000
}

export type BoxPreset = {
  id: string
  name: string
  lengthCm: number
  widthCm: number
  heightCm: number
  maxItems: number
}

export type BoxSuggestion = BoxPreset & { overflow: boolean }

export function suggestBox(presets: BoxPreset[], totalUnits: number): BoxSuggestion {
  if (presets.length === 0) {
    throw new Error("No box presets configured")
  }
  const sorted = [...presets].sort((a, b) => a.maxItems - b.maxItems)
  const fitting = sorted.find((p) => p.maxItems >= totalUnits)
  if (fitting) return { ...fitting, overflow: false }
  return { ...sorted[sorted.length - 1]!, overflow: true }
}
