import { deriveStatus, itemQuantity, orderTotal } from '../commands/order-data'
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

describe('orderTotal', () => {
  it('prefers the summary over a bogus order.total (prod regression: total showed shipping cost)', () => {
    const o = rawOrder({ total: 6.95, summary: { raw_current_order_total: { value: '34.95' } } })
    expect(orderTotal(o as any)).toBe(34.95)
  })
  it('falls back to plain current_order_total, then captured amount, then total', () => {
    expect(orderTotal(rawOrder({ total: 6.95, summary: { current_order_total: 34.95 } }) as any)).toBe(34.95)
    expect(orderTotal(rawOrder({ total: 6.95, summary: null }) as any)).toBe(89.9) // captured_amount from fixture
    expect(orderTotal(rawOrder({ total: 12, summary: null, payment_collections: [{ status: 'pending', captured_amount: 0 }] }) as any)).toBe(12)
  })
  it('returns 0 when nothing is numeric', () => {
    expect(orderTotal(rawOrder({ total: { value: 'x' }, summary: null, payment_collections: [] }) as any)).toBe(0)
  })
})

describe('itemQuantity', () => {
  it('reads all live shapes: plain, raw bigNumber object, detail row (prod regression: ?x)', () => {
    expect(itemQuantity({ quantity: 2 } as any)).toBe(2)
    expect(itemQuantity({ quantity: { value: '3', precision: 20 } } as any)).toBe(3)
    expect(itemQuantity({ detail: { quantity: 1 } } as any)).toBe(1)
    expect(itemQuantity({ detail: { raw_quantity: { value: '4' } } } as any)).toBe(4)
    expect(itemQuantity({} as any)).toBeNull()
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

  const textOf = (r: unknown): string => (typeof r === 'string' ? r : (r as { text: string }).text)

  it('/order shows items and customer city', async () => {
    graph.mockResolvedValue({
      data: [rawOrder({
        items: [{ title: 'BPC-157 10mg', quantity: 2, unit_price: 30 }],
        shipping_address: { country_code: 'nl', city: 'Utrecht', first_name: 'Jan', last_name: 'J' },
        email: 'jan@x.nl',
      })],
    })
    const reply = await COMMANDS.order({ container, svc, chatId: '1', args: ['28412'] })
    expect(textOf(reply)).toContain('BPC-157 10mg')
    expect(textOf(reply)).toContain('Utrecht')
  })

  it('/order on a paid order without a label offers a Create label button', async () => {
    const reply = await COMMANDS.order({ container, svc, chatId: '1', args: ['28412'] })
    expect(typeof reply).toBe('object')
    const kb = JSON.stringify((reply as { reply_markup?: unknown }).reply_markup)
    expect(kb).toContain('lbl:order_1')
    expect(kb).not.toContain('shp:')
  })

  it('/order includes the checklist summary line and a Checklist button', async () => {
    const reply = await COMMANDS.order({ container, svc, chatId: '1', args: ['28412'] })
    expect(textOf(reply)).toContain('Checklist:')
    expect(JSON.stringify((reply as { reply_markup?: unknown }).reply_markup)).toContain('chk:order_1')
  })

  it('/order on a labeled, unshipped order offers a Mark shipped button', async () => {
    graph.mockResolvedValue({
      data: [rawOrder({ fulfillments: [{ packed_at: 'x', shipped_at: null, canceled_at: null }] })],
    })
    const reply = await COMMANDS.order({ container, svc, chatId: '1', args: ['28412'] })
    const kb = JSON.stringify((reply as { reply_markup?: unknown }).reply_markup)
    expect(kb).toContain('shp:order_1:28412')
    expect(kb).not.toContain('lbl:')
  })

  it('/order on a shipped or canceled order has no keyboard', async () => {
    graph.mockResolvedValue({
      data: [rawOrder({ fulfillments: [{ packed_at: 'x', shipped_at: 'y', canceled_at: null }] })],
    })
    const shipped = await COMMANDS.order({ container, svc, chatId: '1', args: ['28412'] })
    expect(typeof shipped).toBe('string')
    graph.mockResolvedValue({ data: [rawOrder({ canceled_at: '2026-07-15T10:00:00Z' })] })
    const canceled = await COMMANDS.order({ container, svc, chatId: '1', args: ['28412'] })
    expect(typeof canceled).toBe('string')
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
