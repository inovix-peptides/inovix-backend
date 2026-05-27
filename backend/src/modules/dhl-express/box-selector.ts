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
