import { loadChecklistView, renderChecklist, type ChecklistView } from '../commands/checklist-data'

const tick = { at: '2026-07-15T10:00:00Z', by_id: 'u1', by_name: 'Sam' }

const paidPayment = {
  provider_id: 'pp_via_broker_via_broker',
  amount: 89.9,
  captures: [{ amount: 89.9 }],
  refunds: [],
  canceled_at: null,
}

const baseOrder = (over: Record<string, unknown> = {}) => ({
  id: 'ord_1',
  display_id: 28412,
  status: 'pending',
  canceled_at: null,
  metadata: {},
  items: [
    { id: 'item_b', title: 'TB-500 5mg', quantity: 1 },
    { id: 'item_a', title: 'BPC-157 10mg', quantity: 2 },
  ],
  fulfillments: [],
  payment_collections: [{ payments: [paidPayment] }],
  ...over,
})

function makeContainer(order: unknown) {
  return {
    resolve: jest.fn((key: string) => {
      if (key === 'query') return { graph: jest.fn().mockResolvedValue({ data: order ? [order] : [] }) }
      return undefined
    }),
  }
}

describe('loadChecklistView', () => {
  it('sorts items by id (stable index addressing) and derives step states', async () => {
    const view = await loadChecklistView(makeContainer(baseOrder()) as never, 'ord_1')
    expect(view).not.toBeNull()
    expect(view!.items.map((i) => i.id)).toEqual(['item_a', 'item_b'])
    expect(view!.items[0]).toMatchObject({ title: 'BPC-157 10mg', qty: 2, ticked: false })
    expect(view!.paymentOk).toBe(true)
    expect(view!.steps.pick).toBe('active')
    expect(view!.steps.label).toBe('locked')
  })

  it('reads ticks and package_closed from the checklist metadata', async () => {
    const order = baseOrder({
      metadata: { fulfillment_checklist: { version: 1, items: { item_a: tick }, package_closed: tick, overrides: [] } },
    })
    const view = await loadChecklistView(makeContainer(order) as never, 'ord_1')
    expect(view!.items.find((i) => i.id === 'item_a')!.ticked).toBe(true)
    expect(view!.packageClosed).toBe(true)
  })

  it('unpaid order locks the pick step', async () => {
    const order = baseOrder({ payment_collections: [{ payments: [{ ...paidPayment, captures: [] }] }] })
    const view = await loadChecklistView(makeContainer(order) as never, 'ord_1')
    expect(view!.paymentOk).toBe(false)
    expect(view!.steps.payment).toBe('blocked')
    expect(view!.steps.pick).toBe('locked')
  })

  it('returns null for a missing order', async () => {
    await expect(loadChecklistView(makeContainer(null) as never, 'ord_x')).resolves.toBeNull()
  })

  it('null relation elements are tolerated (live query.graph shape)', async () => {
    const order = baseOrder({ items: [null, { id: 'item_a', title: 'X', quantity: 1 }], fulfillments: [null] })
    const view = await loadChecklistView(makeContainer(order) as never, 'ord_1')
    expect(view!.items).toHaveLength(1)
  })
})

describe('renderChecklist', () => {
  const view = (over: Partial<ChecklistView> = {}): ChecklistView => ({
    orderId: 'ord_1',
    displayId: 28412,
    items: [
      { id: 'item_a', title: 'BPC-157 10mg', qty: 2, ticked: false },
      { id: 'item_b', title: 'TB-500 5mg', qty: 1, ticked: true },
    ],
    paymentOk: true,
    packageClosed: false,
    hasLabel: false,
    shipped: false,
    canceled: false,
    steps: { payment: 'done', pick: 'active', label: 'locked', close: 'locked', ship: 'locked' },
    ...over,
  })

  it('renders item tick buttons with index-based callback data', () => {
    const r = renderChecklist(view())
    const kb = JSON.stringify(r.reply_markup)
    expect(r.text).toContain('#28412')
    expect(r.text).toContain('1/2')
    expect(kb).toContain('tck:ord_1:0')
    expect(kb).toContain('tck:ord_1:1')
    expect(kb).toContain('☐ 2x BPC-157 10mg')
    expect(kb).toContain('☑ 1x TB-500 5mg')
  })

  it('all ticked + payment ok surfaces the Create label button', () => {
    const r = renderChecklist(view({
      items: [{ id: 'item_a', title: 'X', qty: 1, ticked: true }],
      steps: { payment: 'done', pick: 'done', label: 'active', close: 'locked', ship: 'locked' },
    }))
    expect(JSON.stringify(r.reply_markup)).toContain('lbl:ord_1')
  })

  it('label done shows close-package toggle; closed shows Mark shipped + reopen', () => {
    const withLabel = renderChecklist(view({
      hasLabel: true,
      steps: { payment: 'done', pick: 'done', label: 'done', close: 'active', ship: 'locked' },
    }))
    expect(JSON.stringify(withLabel.reply_markup)).toContain('cls:ord_1')

    const closed = renderChecklist(view({
      hasLabel: true, packageClosed: true,
      steps: { payment: 'done', pick: 'done', label: 'done', close: 'done', ship: 'active' },
    }))
    const kb = JSON.stringify(closed.reply_markup)
    expect(kb).toContain('shp:ord_1:28412')
    expect(kb).toContain('cls:ord_1') // reopen
  })

  it('shipped or canceled renders without buttons', () => {
    const shipped = renderChecklist(view({ shipped: true, steps: { payment: 'done', pick: 'done', label: 'done', close: 'done', ship: 'done' } }))
    expect(shipped.reply_markup).toBeUndefined()
    const canceled = renderChecklist(view({ canceled: true }))
    expect(canceled.reply_markup).toBeUndefined()
    expect(canceled.text).toContain('canceled')
  })

  it('blocked payment renders the warning and no pick buttons', () => {
    const r = renderChecklist(view({
      paymentOk: false,
      steps: { payment: 'blocked', pick: 'locked', label: 'locked', close: 'locked', ship: 'locked' },
    }))
    expect(r.text).toContain('⛔')
    expect(JSON.stringify(r.reply_markup ?? {})).not.toContain('tck:')
  })
})
