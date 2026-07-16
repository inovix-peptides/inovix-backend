import { fetchInventoryRows, inventoryDisplayName } from '../commands/inventory-data'

const variant = (invId: string, productTitle: string, variantTitle: string, sku?: string) => ({
  id: `var_${invId}`,
  title: variantTitle,
  sku: sku ?? null,
  product: { title: productTitle },
  inventory_items: [{ inventory_item_id: invId }],
})

const invItem = (id: string, title: string, stocked = 10, reserved = 2) => ({
  id, sku: title, title,
  location_levels: [{ location_id: 'sloc_1', stocked_quantity: stocked, reserved_quantity: reserved }],
})

function makeContainer(inventory: unknown[], variants: unknown[]) {
  return {
    resolve: jest.fn((key: string) => {
      if (key === 'query') return {
        graph: jest.fn(async ({ entity }: { entity: string }) => ({
          data: entity === 'inventory_item' ? inventory : entity === 'product_variant' ? variants : [],
        })),
      }
      return undefined
    }),
  }
}

describe('fetchInventoryRows', () => {
  it('names rows via product + variant title, not the generic inventory title', async () => {
    const c = makeContainer(
      [invItem('iitem_1', 'Vial', 6, 2)],
      [variant('iitem_1', 'BPC-157', '10mg')]
    )
    const rows = await fetchInventoryRows(c as never)
    expect(rows).toEqual([expect.objectContaining({
      id: 'iitem_1', name: 'BPC-157 10mg', stocked: 6, reserved: 2, available: 4,
    })])
  })

  it('falls back to variant sku, then the inventory title, when product data is missing', async () => {
    const c = makeContainer(
      [invItem('iitem_1', 'Bottle'), invItem('iitem_2', 'Vial')],
      [{ id: 'v1', title: null, sku: 'TB-500-5MG', product: null, inventory_items: [{ inventory_item_id: 'iitem_1' }] }]
    )
    const rows = await fetchInventoryRows(c as never)
    expect(rows.find((r) => r.id === 'iitem_1')!.name).toBe('TB-500-5MG')
    expect(rows.find((r) => r.id === 'iitem_2')!.name).toBe('Vial')
  })

  it('a failing variant lookup degrades to inventory titles instead of throwing', async () => {
    const query = {
      graph: jest.fn(async ({ entity }: { entity: string }) => {
        if (entity === 'product_variant') throw new Error('link down')
        return { data: [invItem('iitem_1', 'Vial')] }
      }),
    }
    const c = { resolve: jest.fn(() => query) }
    const rows = await fetchInventoryRows(c as never)
    expect(rows[0].name).toBe('Vial')
  })

  it('skips the default-variant title suffix ("Default variant")', () => {
    expect(inventoryDisplayName({ product: { title: 'BPC-157' }, title: 'Default variant', sku: null } as never, 'Vial')).toBe('BPC-157')
    expect(inventoryDisplayName({ product: { title: 'BPC-157' }, title: '10mg', sku: null } as never, 'Vial')).toBe('BPC-157 10mg')
  })
})
