import { deriveStatus } from '../commands/order-data'
import { COMMANDS } from '../commands/router'

const rawOrder = (over: Record<string, unknown> = {}) => ({
  id: 'order_1',
  display_id: 28412,
  created_at: '2026-07-14T10:00:00Z',
  total: 89.9,
  currency_code: 'eur',
  canceled_at: null,
  payment_collections: [{ status: 'completed', captured_amount: 89.9 }],
  fulfillments: [],
  shipping_address: { country_code: 'nl' },
  items: [{ quantity: 2 }, { quantity: 1 }],
  ...over,
})

describe('deriveStatus', () => {
  it('paid, no label', () => {
    expect(deriveStatus(rawOrder() as any)).toEqual({
      paid: true, hasLabel: false, shipped: false, canceled: false,
    })
  })
  it('label + shipped', () => {
    const o = rawOrder({
      fulfillments: [{ packed_at: 'x', shipped_at: 'y', canceled_at: null }],
    })
    expect(deriveStatus(o as any)).toEqual({ paid: true, hasLabel: true, shipped: true, canceled: false })
  })
  it('canceled fulfillment does not count as label', () => {
    const o = rawOrder({ fulfillments: [{ packed_at: 'x', shipped_at: null, canceled_at: 'z' }] })
    expect(deriveStatus(o as any).hasLabel).toBe(false)
  })
  it('unpaid', () => {
    const o = rawOrder({ payment_collections: [{ status: 'pending', captured_amount: 0 }] })
    expect(deriveStatus(o as any).paid).toBe(false)
  })
  it('tolerates null elements inside relation arrays (live query.graph shape)', () => {
    const o = rawOrder({ fulfillments: [null, { packed_at: 'x', shipped_at: null, canceled_at: null }] })
    expect(deriveStatus(o as any)).toEqual({ paid: true, hasLabel: true, shipped: false, canceled: false })
  })
})

describe('command handlers', () => {
  const graph = jest.fn()
  const container = { resolve: jest.fn(() => ({ graph })) } as any
  const svc = {} as any

  beforeEach(() => {
    jest.clearAllMocks()
    graph.mockResolvedValue({ data: [rawOrder()] })
  })

  it('/orders lists one line per order with glyphs and total', async () => {
    const reply = await COMMANDS.orders({ container, svc, chatId: '1', args: [] })
    expect(reply).toContain('#28412')
    expect(reply).toContain('€89.90')
    expect(reply).toContain('✅')
  })

  it('/orders survives null elements in items and fulfillments (prod regression)', async () => {
    graph.mockResolvedValue({
      data: [rawOrder({ items: [null, { quantity: 2 }], fulfillments: [null] })],
    })
    const reply = await COMMANDS.orders({ container, svc, chatId: '1', args: [] })
    expect(reply).toContain('#28412')
    expect(reply).toContain('2 items')
  })

  it('/order requires a number', async () => {
    const reply = await COMMANDS.order({ container, svc, chatId: '1', args: [] })
    expect(reply).toContain('Usage')
  })

  it('/order shows items and customer city', async () => {
    graph.mockResolvedValue({
      data: [rawOrder({
        items: [{ title: 'BPC-157 10mg', quantity: 2, unit_price: 30 }],
        shipping_address: { country_code: 'nl', city: 'Utrecht', first_name: 'Jan', last_name: 'J' },
        email: 'jan@x.nl',
      })],
    })
    const reply = await COMMANDS.order({ container, svc, chatId: '1', args: ['28412'] })
    expect(reply).toContain('BPC-157 10mg')
    expect(reply).toContain('Utrecht')
  })

  it('/order says not found for unknown ids', async () => {
    graph.mockResolvedValue({ data: [] })
    const reply = await COMMANDS.order({ container, svc, chatId: '1', args: ['1'] })
    expect(reply).toContain('not found')
  })

  it('/todo lists paid-unfulfilled and packed-unshipped orders', async () => {
    graph.mockResolvedValue({
      data: [
        rawOrder(), // paid, no fulfillment -> needs label
        rawOrder({
          display_id: 28413,
          fulfillments: [{ packed_at: 'x', shipped_at: null, canceled_at: null }],
        }), // -> needs shipping
        rawOrder({
          display_id: 28414,
          fulfillments: [{ packed_at: 'x', shipped_at: 'y', canceled_at: null }],
        }), // done -> excluded
      ],
    })
    const reply = await COMMANDS.todo({ container, svc, chatId: '1', args: [] })
    expect(reply).toContain('#28412')
    expect(reply).toContain('#28413')
    expect(reply).not.toContain('#28414')
  })

  it('/todo reports an empty queue', async () => {
    graph.mockResolvedValue({ data: [] })
    const reply = await COMMANDS.todo({ container, svc, chatId: '1', args: [] })
    expect(reply).toContain('Nothing')
  })
})
