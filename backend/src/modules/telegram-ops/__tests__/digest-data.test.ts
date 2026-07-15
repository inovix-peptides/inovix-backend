import { buildDigest, buildWeekly, lowStockThreshold } from '../commands/digest-data'
import { fetchUmamiStats } from '../commands/umami'

// Unconfigured Umami by default (fetchUmamiStats resolves null), so the
// "Visitors: n/a" assertions below keep testing the real degrade path.
jest.mock('../commands/umami', () => ({
  umamiConfig: jest.fn(() => null),
  fetchUmamiStats: jest.fn(async () => null),
  fetchTopPages: jest.fn(async () => null),
}))

const umamiStatsMock = fetchUmamiStats as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  umamiStatsMock.mockResolvedValue(null)
})

const NOW = new Date('2026-07-15T16:00:00Z') // Wed 18:00 Amsterdam

const paidOrder = (created: string, total: number, items: Array<{ title: string; qty: number; price: number }> = []) => ({
  id: `ord_${created}`,
  display_id: 28412,
  status: 'pending',
  created_at: created,
  canceled_at: null,
  metadata: {},
  summary: { raw_current_order_total: { value: String(total) } },
  payment_collections: [{
    status: 'completed',
    captured_amount: total,
    payments: [{ provider_id: 'pp_via_broker_via_broker', amount: total, captures: [{ amount: total }], refunds: [], canceled_at: null }],
  }],
  shipping_address: { first_name: 'Jan', last_name: 'J', country_code: 'nl' },
  items: items.map((i, n) => ({ id: `item_${n}`, title: i.title, quantity: i.qty, unit_price: i.price })),
  fulfillments: [],
  email: 'jan@x.nl',
})

const invItem = (title: string, stocked: number, reserved: number) => ({
  id: `iitem_${title}`,
  sku: title,
  title,
  location_levels: [{ location_id: 'sloc_1', stocked_quantity: stocked, reserved_quantity: reserved }],
})

function makeContainer(orders: unknown[], inventory: unknown[]) {
  return {
    resolve: jest.fn((key: string) => {
      if (key === 'query') return {
        graph: jest.fn(async ({ entity }: { entity: string }) => ({
          data: entity === 'order' ? orders : entity === 'inventory_item' ? inventory : [],
        })),
      }
      return undefined
    }),
  }
}

describe('lowStockThreshold', () => {
  afterEach(() => { delete process.env.OPS_LOW_STOCK_THRESHOLD })
  it('defaults to 5 and reads the env override', () => {
    expect(lowStockThreshold()).toBe(5)
    process.env.OPS_LOW_STOCK_THRESHOLD = '3'
    expect(lowStockThreshold()).toBe(3)
    process.env.OPS_LOW_STOCK_THRESHOLD = 'garbage'
    expect(lowStockThreshold()).toBe(5)
  })
})

describe('buildDigest', () => {
  it('reports today revenue, queues, and low stock', async () => {
    const orders = [
      paidOrder('2026-07-15T10:00:00Z', 89.9),   // today -> revenue + to_process
      paidOrder('2026-07-14T10:00:00Z', 50),      // yesterday -> not in revenue, still queue
    ]
    const inventory = [invItem('BPC-157 10mg', 6, 2), invItem('TB-500 5mg', 50, 0)]
    const text = await buildDigest(makeContainer(orders, inventory) as never, NOW)
    expect(text).toContain('Daily digest')
    expect(text).toContain('€89.90')
    expect(text).toContain('1 order')
    expect(text).toContain('To process: 2')
    expect(text).toContain('To ship: 0')
    expect(text).toContain('BPC-157 10mg (4)')
    expect(text).not.toContain('TB-500 5mg (')
    expect(text).toContain('Visitors: n/a')
  })

  it('empty day still renders', async () => {
    const text = await buildDigest(makeContainer([], []) as never, NOW)
    expect(text).toContain('€0.00')
    expect(text).toContain('0 orders')
    expect(text).toContain('Visitors: n/a')
  })

  it('shows real visitor numbers when Umami answers, over the today range', async () => {
    umamiStatsMock.mockResolvedValue({ visitors: 123, pageviews: 456 })
    const text = await buildDigest(makeContainer([], []) as never, NOW)
    expect(text).toContain('Visitors: 123 | 456 pageviews')
    expect(text).not.toContain('n/a')
    const [range] = umamiStatsMock.mock.calls[0]
    expect(range.startAt).toBe(new Date('2026-07-14T22:00:00Z').getTime()) // Ams midnight
    expect(range.endAt).toBe(NOW.getTime())
  })
})

describe('buildWeekly', () => {
  it('compares this week to last week and lists top products', async () => {
    const orders = [
      paidOrder('2026-07-14T10:00:00Z', 100, [{ title: 'BPC-157 10mg', qty: 3, price: 30 }]), // this week (Mon 13 Jul)
      paidOrder('2026-07-15T10:00:00Z', 60, [{ title: 'TB-500 5mg', qty: 1, price: 60 }]),    // this week
      paidOrder('2026-07-09T10:00:00Z', 80, [{ title: 'BPC-157 10mg', qty: 2, price: 40 }]),  // last week
    ]
    const text = await buildWeekly(makeContainer(orders, []) as never, NOW)
    expect(text).toContain('Weekly summary')
    expect(text).toContain('€160.00')
    expect(text).toContain('2 orders')
    expect(text).toContain('€80.00')
    expect(text).toContain('BPC-157 10mg')
    expect(text.indexOf('BPC-157 10mg')).toBeLessThan(text.indexOf('TB-500 5mg'))
    expect(text).toContain('Visitors: n/a')
  })

  it('shows real visitor numbers when Umami answers, over the week range', async () => {
    umamiStatsMock.mockResolvedValue({ visitors: 900, pageviews: 2500 })
    const text = await buildWeekly(makeContainer([], []) as never, NOW)
    expect(text).toContain('Visitors: 900 | 2500 pageviews')
    expect(text).not.toContain('n/a')
    const [range] = umamiStatsMock.mock.calls[0]
    expect(range.startAt).toBe(new Date('2026-07-12T22:00:00Z').getTime()) // Mon 13 Jul 00:00 CEST
    expect(range.endAt).toBe(NOW.getTime())
  })
})
