import crypto from 'crypto'
import { POST } from '../route'

const SECRET = 'vercel-webhook-secret'

const errorEvent = {
  id: 'evt_err_1',
  type: 'deployment.error',
  createdAt: 1752570000000,
  payload: {
    deployment: { id: 'dpl_1', name: 'inovix-store', url: 'inovix-store-abc123.vercel.app' },
    links: { deployment: 'https://vercel.com/acme/inovix-store/dpl_1' },
    project: { id: 'prj_1' },
  },
}

const successEvent = {
  id: 'evt_ok_1',
  type: 'deployment.succeeded',
  createdAt: 1752570100000,
  payload: {
    deployment: { id: 'dpl_2', name: 'inovix-store', url: 'inovix-store-def456.vercel.app' },
    links: { deployment: 'https://vercel.com/acme/inovix-store/dpl_2' },
    project: { id: 'prj_1' },
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
    headers: signature === undefined ? {} : { 'x-vercel-signature': signature },
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
  crypto.createHmac('sha1', secret).update(Buffer.from(JSON.stringify(body))).digest('hex')

describe('POST /webhooks/ops/vercel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.VERCEL_WEBHOOK_SECRET = SECRET
  })
  afterAll(() => {
    delete process.env.VERCEL_WEBHOOK_SECRET
  })

  it('accepts a valid sha1 HMAC and notifies loudly on deployment.error', async () => {
    const res = makeRes()
    await POST(makeReq(errorEvent, sign(errorEvent, SECRET)) as any, res)
    expect(res.statusCode).toBe(200)
    expect(notify).toHaveBeenCalledTimes(1)
    const [key, kind, text] = notify.mock.calls[0]
    expect(key).toBe('tg-vc-evt_err_1')
    expect(kind).toBe('ops_deploy')
    expect(text).toContain('❌')
    expect(text).toContain('inovix-store')
    expect(text).toContain('https://vercel.com/acme/inovix-store/dpl_1')
    expect(touchEvent).toHaveBeenCalledWith(
      'tg-opsstate-vercel',
      'ops_state',
      expect.objectContaining({ payload: expect.objectContaining({ status: 'deployment.error' }) })
    )
  })

  it('notifies loudly on deployment.canceled', async () => {
    const body = { ...errorEvent, id: 'evt_cx_1', type: 'deployment.canceled' }
    const res = makeRes()
    await POST(makeReq(body, sign(body, SECRET)) as any, res)
    expect(notify.mock.calls[0][0]).toBe('tg-vc-evt_cx_1')
    expect(notify.mock.calls[0][2]).toContain('❌')
  })

  it('sends a quiet one-liner on deployment.succeeded', async () => {
    const res = makeRes()
    await POST(makeReq(successEvent, sign(successEvent, SECRET)) as any, res)
    expect(res.statusCode).toBe(200)
    const [key, , text] = notify.mock.calls[0]
    expect(key).toBe('tg-vc-evt_ok_1')
    expect(text).toContain('✅ Vercel deploy ok')
  })

  it('rejects a wrong signature with 401 and does not process', async () => {
    const res = makeRes()
    await POST(makeReq(errorEvent, sign(errorEvent, 'other')) as any, res)
    expect(res.statusCode).toBe(401)
    expect(notify).not.toHaveBeenCalled()
  })

  it('rejects a missing signature header with 401', async () => {
    const res = makeRes()
    await POST(makeReq(errorEvent, undefined) as any, res)
    expect(res.statusCode).toBe(401)
    expect(notify).not.toHaveBeenCalled()
  })

  it('rejects when VERCEL_WEBHOOK_SECRET is unset', async () => {
    delete process.env.VERCEL_WEBHOOK_SECRET
    const res = makeRes()
    await POST(makeReq(errorEvent, sign(errorEvent, SECRET)) as any, res)
    expect(res.statusCode).toBe(401)
    expect(notify).not.toHaveBeenCalled()
  })

  it('answers 200 on other event types without notifying', async () => {
    const body = { id: 'evt_x', type: 'project.created', payload: {} }
    const res = makeRes()
    await POST(makeReq(body, sign(body, SECRET)) as any, res)
    expect(res.statusCode).toBe(200)
    expect(notify).not.toHaveBeenCalled()
  })
})
