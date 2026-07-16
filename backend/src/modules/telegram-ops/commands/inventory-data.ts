import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import type { MedusaContainer } from '@medusajs/framework/types'

// Inventory rows with HUMAN names. inventory_item.title on live data is the
// packaging ("Vial", "Bottle"), not the product; the real name lives on the
// linked variant + product. The variant->inventory link is resolvable via
// query.graph on product_variant (same pattern as
// src/jobs/check-variant-inventory-levels.ts, verified in prod).

export type InventoryRow = {
  id: string
  name: string
  stocked: number
  reserved: number
  available: number
  locationId: string | null
}

type VariantRow = {
  id: string
  title?: string | null
  sku?: string | null
  product?: { title?: string | null } | null
  inventory_items?: Array<{ inventory_item_id?: string | null } | null> | null
}

// "BPC-157 10mg" from product + variant title; a lone default variant adds
// no information, so it is dropped. Falls back to sku, then the raw
// inventory title.
export function inventoryDisplayName(v: VariantRow | undefined, fallback: string): string {
  if (!v) return fallback
  const product = (v.product?.title ?? '').trim()
  const variantTitle = (v.title ?? '').trim()
  const meaningfulVariant = variantTitle && !/^default variant$/i.test(variantTitle) ? variantTitle : ''
  const combined = `${product} ${meaningfulVariant}`.trim()
  return combined || (v.sku ?? '').trim() || fallback
}

async function variantByInventoryItem(container: MedusaContainer): Promise<Map<string, VariantRow>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const map = new Map<string, VariantRow>()
  try {
    const { data } = await query.graph({
      entity: 'product_variant',
      fields: ['id', 'title', 'sku', 'product.title', 'inventory_items.inventory_item_id'],
    })
    for (const v of (data ?? []) as Array<VariantRow | null>) {
      if (!v) continue
      for (const link of v.inventory_items ?? []) {
        const invId = link?.inventory_item_id
        if (invId) map.set(String(invId), v)
      }
    }
  } catch {
    // Naming is cosmetic: a failing variant lookup must never break a stock
    // surface. Callers fall back to the raw inventory titles.
  }
  return map
}

export async function fetchInventoryRows(container: MedusaContainer): Promise<InventoryRow[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data }, names] = await Promise.all([
    query.graph({
      entity: 'inventory_item',
      fields: ['id', 'sku', 'title', 'location_levels.location_id', 'location_levels.stocked_quantity', 'location_levels.reserved_quantity'],
    }),
    variantByInventoryItem(container),
  ])
  return ((data ?? []) as Array<{ id: string; sku?: string | null; title?: string | null; location_levels?: Array<{ location_id?: string; stocked_quantity?: number | string; reserved_quantity?: number | string }> } | null>)
    .filter(Boolean)
    .map((i) => {
      const stocked = (i!.location_levels ?? []).reduce((n, l) => n + Number(l?.stocked_quantity ?? 0), 0)
      const reserved = (i!.location_levels ?? []).reduce((n, l) => n + Number(l?.reserved_quantity ?? 0), 0)
      const fallback = String(i!.title || i!.sku || i!.id)
      return {
        id: String(i!.id),
        name: inventoryDisplayName(names.get(String(i!.id)), fallback),
        stocked,
        reserved,
        available: stocked - reserved,
        locationId: (i!.location_levels ?? [])[0]?.location_id ?? null,
      }
    })
}

// Single item by inventory_item id, same naming.
export async function fetchInventoryRow(container: MedusaContainer, invItemId: string): Promise<InventoryRow | null> {
  const rows = await fetchInventoryRows(container)
  return rows.find((r) => r.id === invItemId) ?? null
}
