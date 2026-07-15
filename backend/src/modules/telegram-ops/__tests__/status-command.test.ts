import { statusCommand } from '../commands/status'
import { COMMANDS } from '../commands/router'

const NOW = new Date('2026-07-16T10:00:00Z')

const graph = jest.fn()
const container = { resolve: jest.fn(() => ({ graph })) } as any

const paidOrder = (over: Record<string, unknown> = {}) => ({
  id: 'ord_1',
  display_id: 28412,
  created_at: '2026-07-16T08:00:00Z',
  total: 100,
  currency_code: 'eur',
  canceled_at: null,
  summary: { raw_current_order_total: { value: 100 } },
  payment_collections: [{ status: 'completed', captured_amount: 100 }],
  fulfillments: [],
  ...over,
})

const makeSvc = (over: Record<string, unknown> = {}) => ({
  findEvent: jest.fn(async (key: string) => {
    if (key === 'tg-opsstate-railway')
      return { key, kind: 'ops_state', sent_at: '2026-07-16T09:00:00Z', snoozed_until: null, payload: { status: 'SUCCESS', at: '2026-07-16T09:00:00Z' } }
    if (key === 'tg-opsstate-vercel') return null
    if (key === 'tg-opsstate-sentry')
      return { key, kind: 'ops_state', sent_at: '2026-07-16T07:00:00Z', snoozed_until: null, payload: { title: 'TypeError: boom', at: '2026-07-16T07:00:00Z' } }
    return null
  }),
  listTelegramOpsEvents: jest.fn(async () => [
    { key: 'tg-sentry-1', kind: 'ops_sentry', sent_at: '2026-07-16T07:00:00Z' },
    { key: 'tg-sentry-2', kind: 'ops_sentry', sent_at: '2026-07-10T07:00:00Z' }, // older than 24h
  ]),
  ...over,
})

describe('/status', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(NOW)
    originalFetch = globalThis.fetch
    globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200 })) as any
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    jest.useRealTimers()
  })

  it('is registered as a command', () => {
    expect(COMMANDS.status).toBeDefined()
  })

  it('renders site check, deploy state, sentry count, and todo counts', async () => {
    graph.mockResolvedValue({
      data: [
        paidOrder(), // paid, no label -> needs label
        paidOrder({ id: 'ord_2', display_id: 28413, fulfillments: [{ packed_at: '2026-07-16T09:00:00Z', shipped_at: null, canceled_at: null }] }), // needs shipping
        paidOrder({ id: 'ord_3', display_id: 28414, fulfillments: [{ packed_at: '2026-07-15T09:00:00Z', shipped_at: '2026-07-15T10:00:00Z', canceled_at: null }] }), // done
      ],
    })
    const svc = makeSvc()
    const reply = await statusCommand({ container, svc: svc as any, chatId: '1', args: [] })
    const text = typeof reply === 'string' ? reply : reply.text
    expect(text).toContain('inovix.nl: up')
    expect(text).toContain('Backend: up (this reply proves it)')
    expect(text).toContain('Railway: SUCCESS')
    expect(text).toContain('Vercel: n/a')
    expect(text).toContain('Sentry (24h): 1')
    expect(text).toContain('TypeError: boom')
    expect(text).toContain('1 need label')
    expect(text).toContain('1 need shipping')
  })

  it('reports the site down when the fetch fails', async () => {
    ;(globalThis.fetch as jest.Mock).mockRejectedValue(new Error('network'))
    graph.mockResolvedValue({ data: [] })
    const svc = makeSvc()
    const reply = await statusCommand({ container, svc: svc as any, chatId: '1', args: [] })
    const text = typeof reply === 'string' ? reply : reply.text
    expect(text).toContain('inovix.nl: DOWN')
  })

  it('reports the site down on a non-200 response', async () => {
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 })
    graph.mockResolvedValue({ data: [] })
    const svc = makeSvc()
    const reply = await statusCommand({ container, svc: svc as any, chatId: '1', args: [] })
    const text = typeof reply === 'string' ? reply : reply.text
    expect(text).toContain('inovix.nl: DOWN (HTTP 503)')
  })

  it('degrades gracefully when ops state rows are absent', async () => {
    graph.mockResolvedValue({ data: [] })
    const svc = makeSvc({
      findEvent: jest.fn(async () => null),
      listTelegramOpsEvents: jest.fn(async () => []),
    })
    const reply = await statusCommand({ container, svc: svc as any, chatId: '1', args: [] })
    const text = typeof reply === 'string' ? reply : reply.text
    expect(text).toContain('Railway: n/a')
    expect(text).toContain('Vercel: n/a')
    expect(text).toContain('Sentry (24h): 0')
    expect(text).toContain('Nothing to do')
  })
})
