import { visitorsCommand } from '../commands/visitors'
import { COMMANDS } from '../commands/router'
import { helpText } from '../commands/help'
import { fetchUmamiStats, fetchTopPages } from '../commands/umami'

jest.mock('../commands/umami', () => ({
  umamiConfig: jest.fn(() => null),
  fetchUmamiStats: jest.fn(async () => null),
  fetchTopPages: jest.fn(async () => null),
}))

const statsMock = fetchUmamiStats as jest.Mock
const pagesMock = fetchTopPages as jest.Mock

const NOW = new Date('2026-07-15T16:00:00Z') // Wed 18:00 Amsterdam
const container = { resolve: jest.fn() } as any
const svc = {} as any
const run = (args: string[] = []) => visitorsCommand({ container, svc, chatId: '1', args })

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(NOW)
})

afterEach(() => jest.useRealTimers())

describe('/visitors', () => {
  it('is registered as a command and listed in /help', () => {
    expect(COMMANDS.visitors).toBeDefined()
    expect(helpText()).toContain('/visitors')
  })

  it('says n/a when Umami is unconfigured or unreachable', async () => {
    statsMock.mockResolvedValue(null)
    const reply = await run()
    const text = typeof reply === 'string' ? reply : reply.text
    expect(text).toContain('Visitors: n/a (Umami not configured or unreachable)')
  })

  it('renders visitors, pageviews, and top pages for today', async () => {
    statsMock.mockResolvedValue({ visitors: 123, pageviews: 456 })
    pagesMock.mockResolvedValue([
      { path: '/', views: 40 },
      { path: '/producten', views: 30 },
    ])
    const reply = await run()
    const text = typeof reply === 'string' ? reply : reply.text
    expect(text).toContain('Today')
    expect(text).toContain('Visitors: 123')
    expect(text).toContain('Pageviews: 456')
    expect(text).toContain('/producten | 30')
    expect(text.indexOf('/ | 40')).toBeLessThan(text.indexOf('/producten | 30'))
    // Amsterdam midnight today (00:00 CEST) -> now
    const [range] = statsMock.mock.calls[0]
    expect(range.startAt).toBe(new Date('2026-07-14T22:00:00Z').getTime())
    expect(range.endAt).toBe(NOW.getTime())
  })

  it('supports the week period', async () => {
    statsMock.mockResolvedValue({ visitors: 900, pageviews: 2500 })
    pagesMock.mockResolvedValue([])
    const reply = await run(['week'])
    const text = typeof reply === 'string' ? reply : reply.text
    expect(text).toContain('This week')
    expect(text).toContain('Visitors: 900')
    // Monday 13 Jul 00:00 CEST
    const [range] = statsMock.mock.calls[0]
    expect(range.startAt).toBe(new Date('2026-07-12T22:00:00Z').getTime())
  })

  it('falls back to today on an unknown period', async () => {
    statsMock.mockResolvedValue({ visitors: 1, pageviews: 2 })
    pagesMock.mockResolvedValue(null)
    const reply = await run(['garbage'])
    const text = typeof reply === 'string' ? reply : reply.text
    expect(text).toContain('Today')
  })

  it('still renders the stats when top pages fail', async () => {
    statsMock.mockResolvedValue({ visitors: 7, pageviews: 20 })
    pagesMock.mockResolvedValue(null)
    const reply = await run()
    const text = typeof reply === 'string' ? reply : reply.text
    expect(text).toContain('Visitors: 7')
    expect(text).not.toContain('Top pages')
  })

  it('escapes HTML in page paths', async () => {
    statsMock.mockResolvedValue({ visitors: 1, pageviews: 1 })
    pagesMock.mockResolvedValue([{ path: '/a<b>', views: 1 }])
    const reply = await run()
    const text = typeof reply === 'string' ? reply : reply.text
    expect(text).toContain('/a&lt;b&gt;')
  })
})
