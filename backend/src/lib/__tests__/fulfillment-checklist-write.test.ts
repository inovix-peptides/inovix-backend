import { applyChecklistUpdate } from '../fulfillment-checklist-write'

function makeContainer(initialMetadata: Record<string, unknown> = {}) {
  // In-memory order store so concurrent updates exercise the write queue.
  let metadata: Record<string, unknown> = initialMetadata
  const retrieveOrder = jest.fn(async () => ({ id: 'ord_1', metadata }))
  const updateOrders = jest.fn(async (updates: Array<{ id: string; metadata: Record<string, unknown> }>) => {
    metadata = updates[0].metadata
  })
  return {
    getMetadata: () => metadata,
    retrieveOrder,
    updateOrders,
    resolve: jest.fn((key: string) => {
      if (key === 'order') return { retrieveOrder, updateOrders }
      if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      return undefined
    }),
  }
}

const actor = { by_id: 'tg:8842061517', by_name: 'Sam' }

describe('applyChecklistUpdate', () => {
  it('applies a tick and persists merged metadata', async () => {
    const c = makeContainer({ other_key: 'kept' })
    const r = await applyChecklistUpdate(c as never, 'ord_1', { action: 'tick_item', item_id: 'item_1', checked: true }, actor)
    expect('next' in r && r.next.items.item_1.by_name).toBe('Sam')
    const meta = c.getMetadata() as Record<string, unknown>
    expect(meta.other_key).toBe('kept')
    expect((meta.fulfillment_checklist as { items: Record<string, unknown> }).items.item_1).toBeTruthy()
  })

  it('serializes concurrent writes so no tick is lost', async () => {
    const c = makeContainer({})
    await Promise.all([
      applyChecklistUpdate(c as never, 'ord_1', { action: 'tick_item', item_id: 'item_1', checked: true }, actor),
      applyChecklistUpdate(c as never, 'ord_1', { action: 'tick_item', item_id: 'item_2', checked: true }, actor),
    ])
    const items = (c.getMetadata().fulfillment_checklist as { items: Record<string, unknown> }).items
    expect(Object.keys(items).sort()).toEqual(['item_1', 'item_2'])
  })

  it('returns the validation error without writing', async () => {
    const c = makeContainer({})
    const r = await applyChecklistUpdate(c as never, 'ord_1', { action: 'override', step: 'items', reason: 'short' }, actor)
    expect('error' in r).toBe(true)
    expect(c.updateOrders).not.toHaveBeenCalled()
  })

  it('untick removes the item', async () => {
    const c = makeContainer({})
    await applyChecklistUpdate(c as never, 'ord_1', { action: 'tick_item', item_id: 'item_1', checked: true }, actor)
    await applyChecklistUpdate(c as never, 'ord_1', { action: 'tick_item', item_id: 'item_1', checked: false }, actor)
    const items = (c.getMetadata().fulfillment_checklist as { items: Record<string, unknown> }).items
    expect(items.item_1).toBeUndefined()
  })
})
