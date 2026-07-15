import { runDailyDigest, amsClock } from '../telegram-daily-digest'
import { runWeeklySummary, isoWeekKey } from '../telegram-weekly-summary'

jest.mock('../../modules/telegram-ops/commands/digest-data', () => ({
  buildDigest: jest.fn().mockResolvedValue('DIGEST'),
  buildWeekly: jest.fn().mockResolvedValue('WEEKLY'),
}))

function makeContainer() {
  const svc = {
    isConfigured: jest.fn(() => true),
    notify: jest.fn().mockResolvedValue(true),
  }
  return {
    svc,
    resolve: jest.fn((key: string) => {
      if (key === 'telegram_ops') return svc
      if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      return undefined
    }),
  }
}

describe('amsClock', () => {
  it('derives Amsterdam hour, weekday, and date key (CEST in July)', () => {
    const c = amsClock(new Date('2026-07-15T16:05:00Z')) // Wed 18:05 Amsterdam
    expect(c).toMatchObject({ hour: 18, weekday: 3, dateKey: '2026-07-15' })
  })
})

describe('isoWeekKey', () => {
  it('formats the ISO week of the Amsterdam date', () => {
    expect(isoWeekKey(new Date('2026-07-15T16:00:00Z'))).toBe('2026-W29')
    // Wednesday 30 Dec 2026 falls in ISO week 53 of 2026
    expect(isoWeekKey(new Date('2026-12-30T12:00:00Z'))).toBe('2026-W53')
  })
})

describe('runDailyDigest', () => {
  beforeEach(() => { jest.clearAllMocks(); delete process.env.OPS_DIGEST_HOUR })

  it('sends at the digest hour with a per-day idempotency key', async () => {
    const c = makeContainer()
    await runDailyDigest(c as never, new Date('2026-07-15T16:05:00Z')) // 18:05 Amsterdam
    expect(c.svc.notify).toHaveBeenCalledWith('tg-digest-2026-07-15', 'digest', 'DIGEST', expect.objectContaining({ reply_markup: expect.anything() }))
  })

  it('stays silent at other hours and honors OPS_DIGEST_HOUR', async () => {
    const c = makeContainer()
    await runDailyDigest(c as never, new Date('2026-07-15T10:05:00Z')) // 12:05 Amsterdam
    expect(c.svc.notify).not.toHaveBeenCalled()

    process.env.OPS_DIGEST_HOUR = '12'
    await runDailyDigest(c as never, new Date('2026-07-15T10:05:00Z'))
    expect(c.svc.notify).toHaveBeenCalled()
  })
})

describe('runWeeklySummary', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends Monday 09:00 Amsterdam with a per-week key', async () => {
    const c = makeContainer()
    await runWeeklySummary(c as never, new Date('2026-07-13T07:10:00Z')) // Mon 09:10 Amsterdam
    expect(c.svc.notify).toHaveBeenCalledWith('tg-week-2026-W29', 'weekly', 'WEEKLY')
  })

  it('stays silent on other days/hours', async () => {
    const c = makeContainer()
    await runWeeklySummary(c as never, new Date('2026-07-15T07:10:00Z')) // Wednesday
    await runWeeklySummary(c as never, new Date('2026-07-13T12:10:00Z')) // Monday 14:10
    expect(c.svc.notify).not.toHaveBeenCalled()
  })
})
