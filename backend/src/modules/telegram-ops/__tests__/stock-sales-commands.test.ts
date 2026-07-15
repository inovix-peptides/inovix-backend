import { COMMANDS } from '../commands/router'
import { periodBounds } from '../commands/sales'

const graph = jest.fn()
const container = { resolve: jest.fn(() => ({ graph })) } as any
const svc = {} as any
const run = (cmd: string, args: string[] = []) => COMMANDS[cmd]({ container, svc, chatId: '1', args })

beforeEach(() => jest.clearAllMocks())

describe('/stock', () => {
  const items = [
    { id: 'ii_1', sku: 'BPC-10', title: 'BPC-157 10mg', location_levels: [{ stocked_quantity: 10, reserved_quantity: 4 }] },
    { id: 'ii_2', sku: 'TB-5', title: 'TB-500 5mg', location_levels: [{ stocked_quantity: 100, reserved_quantity: 0 }] },
  ]
  it('shows available = stocked minus reserved, lowest first', async () => {
    graph.mockResolvedValue({ data: items })
    const reply = await run('stock')
    expect(reply).toContain('BPC-157 10mg')
    expect(reply).toContain('6 available')
    expect(reply.indexOf('BPC-157')).toBeLessThan(reply.indexOf('TB-500'))
  })
  it('filters by search term across sku and title', async () => {
    graph.mockResolvedValue({ data: items })
    const reply = await run('stock', ['tb'])
    expect(reply).toContain('TB-500')
    expect(reply).not.toContain('BPC-157')
  })
  it('reports no matches', async () => {
    graph.mockResolvedValue({ data: items })
    const reply = await run('stock', ['xyz'])
    expect(reply).toContain('No inventory')
  })
})

describe('/find', () => {
  it('finds products by title and shows status + sku', async () => {
    graph.mockResolvedValue({ data: [
      { id: 'p1', title: 'BPC-157', status: 'published', variants: [{ sku: 'BPC-10', title: '10mg' }] },
      { id: 'p2', title: 'Retatrutide', status: 'draft', variants: [{ sku: 'RETA-10', title: '10mg' }] },
    ] })
    const reply = await run('find', ['reta'])
    expect(reply).toContain('Retatrutide')
    expect(reply).toContain('draft')
    expect(reply).not.toContain('BPC-157')
  })
  it('requires a search term', async () => {
    const reply = await run('find')
    expect(reply).toContain('Usage')
  })
})

describe('periodBounds', () => {
  // now = Tuesday 2026-07-14 13:00 Amsterdam (11:00 UTC)
  const now = new Date('2026-07-14T11:00:00Z')
  it('today starts at Amsterdam midnight', () => {
    const { start } = periodBounds('today', now)
    expect(start.toISOString()).toBe('2026-07-13T22:00:00.000Z') // 00:00 CEST
  })
  it('week starts Monday Amsterdam midnight', () => {
    const { start } = periodBounds('week', now)
    expect(start.toISOString()).toBe('2026-07-12T22:00:00.000Z') // Mon 13 Jul 00:00 CEST
  })
  it('prevStart is one period earlier', () => {
    const { start, prevStart } = periodBounds('today', now)
    expect(start.getTime() - prevStart.getTime()).toBe(24 * 3600 * 1000)
  })
  // DST-regime crossings: the boundary instant must use the offset of the
  // boundary date itself, not the offset at `now`.
  it('month prevStart crossing CEST->CET back into March 1 00:00 CET', () => {
    const { prevStart } = periodBounds('month', new Date('2026-04-15T11:00:00Z'))
    expect(prevStart.toISOString()).toBe('2026-02-28T23:00:00.000Z') // Mar 1 00:00 CET
  })
  it('month prevStart crossing CET->CEST back into October 1 00:00 CEST', () => {
    const { prevStart } = periodBounds('month', new Date('2026-11-15T11:00:00Z'))
    expect(prevStart.toISOString()).toBe('2026-09-30T22:00:00.000Z') // Oct 1 00:00 CEST
  })
  it('today around the spring-forward day has a 23h previous day', () => {
    const { start, prevStart } = periodBounds('today', new Date('2026-03-30T11:00:00Z'))
    expect(start.toISOString()).toBe('2026-03-29T22:00:00.000Z') // Mon 30 Mar 00:00 CEST
    expect(prevStart.toISOString()).toBe('2026-03-28T23:00:00.000Z') // Sun 29 Mar 00:00 CET
    // no fixed 24h delta assertion: Mar 29 is the 23-hour spring-forward day
  })
})

describe('/sales', () => {
  it('sums paid non-canceled orders and compares periods', async () => {
    graph.mockResolvedValue({ data: [
      { created_at: new Date(Date.now() - 3600e3).toISOString(), total: 100, canceled_at: null, payment_collections: [{ status: 'completed', captured_amount: 100 }] },
      { created_at: new Date(Date.now() - 3600e3).toISOString(), total: 50, canceled_at: 'x', payment_collections: [{ status: 'completed', captured_amount: 50 }] },
    ] })
    const reply = await run('sales', ['today'])
    expect(reply).toContain('€100.00')
    expect(reply).toContain('1 order')
  })
})
