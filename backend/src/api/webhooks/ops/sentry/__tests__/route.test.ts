import crypto from 'crypto'
import { POST } from '../route'

const SECRET = 'sentry-shared-secret'

const FIXTURE = {
  action: 'triggered',
  data: {
    event: {
      title: 'TypeError: x is not a function',
      culprit: 'app/checkout/route',
      web_url: 'https://inovix.sentry.io/issues/4508123/events/abc/',
      issue_id: '4508123',
    },
  },
}

const makeRes = () => {
  const res: any = { statusCode: 0 }
  res.status = jest.fn((c: number) => ((res.statusCode = c), res))
  res.json = jest.fn(() => res)
  res.sendStatus = jest.fn((c: number) => ((res.statusCode = c), res))
  return res
}

const notify = jest.fn().mockResolvedValue(true)
const touchEvent = jest.fn().mockResolvedValue(undefined)

const makeReq = (body: unknown, signature: string | undefined) => {
  const raw = Buffer.from(JSON.stringify(body))
  return {
    headers: signature === undefined ? {} : { 'sentry-hook-signature': signature },
    rawBody: raw,
    body,
    scope: {
      resolve: jest.fn((key: string) => {
        if (key === 'telegram_ops') return { notify, touchEvent }
        if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        return undefined
      }),
    },
  }
}

const sign = (body: unknown, secret: string) =>
  crypto.createHmac('sha256', secret).update(Buffer.from(JSON.stringify(body))).digest('hex')

describe('POST /webhooks/ops/sentry', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.SENTRY_WEBHOOK_SECRET = SECRET
  })
  afterAll(() => {
    delete process.env.SENTRY_WEBHOOK_SECRET
  })

  it('accepts a valid HMAC, answers 200, and notifies with the dedup key', async () => {
    const res = makeRes()
    await POST(makeReq(FIXTURE, sign(FIXTURE, SECRET)) as any, res)
    expect(res.statusCode).toBe(200)
    expect(notify).toHaveBeenCalledTimes(1)
    const [key, kind, text] = notify.mock.calls[0]
    expect(key).toBe('tg-sentry-4508123')
    expect(kind).toBe('ops_sentry')
    expect(text).toContain('🐞')
    expect(text).toContain('TypeError: x is not a function')
    expect(text).toContain('app/checkout/route')
    expect(text).toContain('https://inovix.sentry.io/issues/4508123/events/abc/')
    expect(touchEvent).toHaveBeenCalledWith(
      'tg-opsstate-sentry',
      'ops_state',
      expect.objectContaining({ payload: expect.objectContaining({ title: 'TypeError: x is not a function' }) })
    )
  })

  it('falls back to data.issue.id for the key', async () => {
    const body = { action: 'created', data: { issue: { id: '999', title: 'Boom' } } }
    const res = makeRes()
    await POST(makeReq(body, sign(body, SECRET)) as any, res)
    expect(res.statusCode).toBe(200)
    expect(notify.mock.calls[0][0]).toBe('tg-sentry-999')
    expect(notify.mock.calls[0][2]).toContain('Boom')
  })

  it('rejects a wrong signature with 401 and does not process', async () => {
    const res = makeRes()
    await POST(makeReq(FIXTURE, sign(FIXTURE, 'wrong-secret')) as any, res)
    expect(res.statusCode).toBe(401)
    expect(notify).not.toHaveBeenCalled()
    expect(touchEvent).not.toHaveBeenCalled()
  })

  it('rejects a missing signature header with 401', async () => {
    const res = makeRes()
    await POST(makeReq(FIXTURE, undefined) as any, res)
    expect(res.statusCode).toBe(401)
    expect(notify).not.toHaveBeenCalled()
  })

  it('rejects when no secret is configured', async () => {
    delete process.env.SENTRY_WEBHOOK_SECRET
    const res = makeRes()
    await POST(makeReq(FIXTURE, sign(FIXTURE, SECRET)) as any, res)
    expect(res.statusCode).toBe(401)
    expect(notify).not.toHaveBeenCalled()
  })

  it('answers 200 on an unknown payload shape without notifying', async () => {
    const body = { hello: 'world' }
    const res = makeRes()
    await POST(makeReq(body, sign(body, SECRET)) as any, res)
    expect(res.statusCode).toBe(200)
    expect(notify).not.toHaveBeenCalled()
  })
})
