import { topCommand, aggregateTopItems } from '../commands/top'
import { customerCommand } from '../commands/customer'

const order = (over: Record<string, unknown> = {}) => ({
  id: 'ord_1',
  display_id: 28412,
  created_at: '2026-07-14T10:00:00Z',
  canceled_at: null,
  email: 'jan@x.nl',
  summary: { raw_current_order_total: { value: '89.90' } },
  payment_collections: [{ status: 'completed', captured_amount: 89.9 }],
  shipping_address: { first_name: 'Jan', last_name: 'Jansen', country_code: 'nl' },
  fulfillments: [],
  items: [{ id: 'i1', title: 'BPC-157 10mg', quantity: 2, unit_price: 30 }],
  ...over,
})

const makeContainer = (orders: unknown[]) => ({
  resolve: jest.fn((key: string) => {
    if (key === 'query') return { graph: jest.fn().mockResolvedValue({ data: orders }) }
    return undefined
  }),
})

describe('aggregateTopItems', () => {
  it('sums quantity and revenue per title, sorted by quantity', () => {
    const rows = aggregateTopItems([
      order({ items: [{ id: 'i1', title: 'A', quantity: 1, unit_price: 10 }] }),
      order({ items: [{ id: 'i2', title: 'B', quantity: 5, unit_price: 20 }, { id: 'i3', title: 'A', quantity: 2, unit_price: 10 }] }),
    ] as never)
    expect(rows[0]).toMatchObject({ title: 'B', qty: 5, revenue: 100 })
    expect(rows[1]).toMatchObject({ title: 'A', qty: 3, revenue: 30 })
  })

  it('guards null items (live query.graph shape)', () => {
    const rows = aggregateTopItems([order({ items: [null, { id: 'i1', title: 'A', quantity: 1, unit_price: 10 }] })] as never)
    expect(rows).toHaveLength(1)
  })
})

describe('topCommand', () => {
  it('lists best sellers for the period', async () => {
    const out = String(await topCommand({ container: makeContainer([order()]) as never, svc: {} as never, chatId: '1', args: ['week'] }))
    expect(out).toContain('Top products')
    expect(out).toContain('BPC-157 10mg')
    expect(out).toContain('2x')
  })

  it('reports an empty period', async () => {
    const out = String(await topCommand({ container: makeContainer([]) as never, svc: {} as never, chatId: '1', args: [] }))
    expect(out).toContain('No sales')
  })
})

describe('customerCommand', () => {
  it('matches by email and aggregates lifetime value', async () => {
    const orders = [
      order(),
      order({ id: 'ord_2', display_id: 28413, created_at: '2026-07-10T10:00:00Z', summary: { raw_current_order_total: { value: '50' } } }),
    ]
    const out = String(await customerCommand({ container: makeContainer(orders) as never, svc: {} as never, chatId: '1', args: ['jan@x.nl'] }))
    expect(out).toContain('Jan Jansen')
    expect(out).toContain('2 orders')
    expect(out).toContain('€139.90')
    expect(out).toContain('#28412')
  })

  it('matches by name substring, case-insensitive', async () => {
    const out = String(await customerCommand({ container: makeContainer([order()]) as never, svc: {} as never, chatId: '1', args: ['jansen'] }))
    expect(out).toContain('1 order')
  })

  it('requires an argument and reports no match', async () => {
    expect(String(await customerCommand({ container: makeContainer([]) as never, svc: {} as never, chatId: '1', args: [] }))).toContain('Usage')
    expect(String(await customerCommand({ container: makeContainer([]) as never, svc: {} as never, chatId: '1', args: ['nobody'] }))).toContain('No customer')
  })
})
