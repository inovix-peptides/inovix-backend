import { runStockWatch } from '../telegram-stock-watch'

const invItem = (id: string, title: string, stocked: number, reserved: number) => ({
  id, sku: title, title,
  location_levels: [{ location_id: 'sloc_1', stocked_quantity: stocked, reserved_quantity: reserved }],
})

function makeContainer(inventory: unknown[], states: Record<string, { state: string }> = {}) {
  // In-memory event-log rows keyed by event key.
  const rows = new Map(Object.entries(states).map(([k, p]) => [k, { id: `evt_${k}`, key: k, kind: 'stock_state', payload: p }]))
  const svc = {
    isConfigured: jest.fn(() => true),
    sendToAll: jest.fn().mockResolvedValue(undefined),
    findEvent: jest.fn(async (key: string) => rows.get(key) ?? null),
    touchEvent: jest.fn(async (key: string, kind: string, data: { payload?: { state: string } }) => {
      rows.set(key, { id: `evt_${key}`, key, kind, payload: data.payload as never })
    }),
    releaseAction: jest.fn(async (key: string) => { rows.delete(key) }),
  }
  return {
    svc, rows,
    resolve: jest.fn((key: string) => {
      if (key === 'telegram_ops') return svc
      if (key === 'query') return { graph: jest.fn().mockResolvedValue({ data: inventory }) }
      if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      return undefined
    }),
  }
}

describe('runStockWatch', () => {
  beforeEach(() => { delete process.env.OPS_LOW_STOCK_THRESHOLD })

  it('N7 on ok->low crossing, with Restock/Stock buttons, once', async () => {
    const c = makeContainer([invItem('iitem_1', 'BPC-157 10mg', 6, 2)]) // available 4 <= 5
    await runStockWatch(c as never)
    expect(c.svc.sendToAll).toHaveBeenCalledTimes(1)
    const [text, extra] = c.svc.sendToAll.mock.calls[0]
    expect(text).toContain('Low stock')
    expect(text).toContain('4 left')
    expect(JSON.stringify(extra)).toContain('rsk:iitem_1')
    expect(JSON.stringify(extra)).toContain('stk')
    // second run: state stored, no new alert
    await runStockWatch(c as never)
    expect(c.svc.sendToAll).toHaveBeenCalledTimes(1)
  })

  it('N8 on ok->oos, and low->oos escalates', async () => {
    const oos = makeContainer([invItem('iitem_1', 'X', 2, 2)]) // available 0
    await runStockWatch(oos as never)
    expect(oos.svc.sendToAll.mock.calls[0][0]).toContain('OUT of stock')

    const escalate = makeContainer([invItem('iitem_1', 'X', 2, 2)], { 'tg-stockstate-iitem_1': { state: 'low' } })
    await runStockWatch(escalate as never)
    expect(escalate.svc.sendToAll.mock.calls[0][0]).toContain('OUT of stock')
  })

  it('recovery above the threshold deletes the state row (re-arms)', async () => {
    const c = makeContainer([invItem('iitem_1', 'X', 50, 0)], { 'tg-stockstate-iitem_1': { state: 'low' } })
    await runStockWatch(c as never)
    expect(c.svc.sendToAll).not.toHaveBeenCalled()
    expect(c.svc.releaseAction).toHaveBeenCalledWith('tg-stockstate-iitem_1')
  })

  it('does nothing when the bot is unconfigured', async () => {
    const c = makeContainer([invItem('iitem_1', 'X', 0, 0)])
    c.svc.isConfigured.mockReturnValue(false)
    await runStockWatch(c as never)
    expect(c.svc.sendToAll).not.toHaveBeenCalled()
  })
})
