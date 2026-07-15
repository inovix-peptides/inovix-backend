import { POST } from '../route'

const SECRET = 'railway-path-secret'

const deployPayload = (status: string, id = 'dep_123') => ({
  type: 'DEPLOY',
  status,
  project: { name: 'stalwart' },
  environment: { name: 'production' },
  service: { name: 'backend-service' },
  deployment: { id },
})

const makeRes = () => {
  const res: any = { statusCode: 0 }
  res.status = jest.fn((c: number) => ((res.statusCode = c), res))
  res.json = jest.fn(() => res)
  res.sendStatus = jest.fn((c: number) => ((res.statusCode = c), res))
  return res
}

const notify = jest.fn().mockResolvedValue(true)
const touchEvent = jest.fn().mockResolvedValue(undefined)

const makeReq = (body: unknown, pathSecret: string) => ({
  params: { secret: pathSecret },
  headers: {},
  body,
  scope: {
    resolve: jest.fn((key: string) => {
      if (key === 'telegram_ops') return { notify, touchEvent }
      if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      return undefined
    }),
  },
})

describe('POST /webhooks/ops/railway/[secret]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPS_WEBHOOK_SECRET = SECRET
  })
  afterAll(() => {
    delete process.env.OPS_WEBHOOK_SECRET
  })

  it('notifies loudly on FAILED with the right path secret', async () => {
    const res = makeRes()
    await POST(makeReq(deployPayload('FAILED'), SECRET) as any, res)
    expect(res.statusCode).toBe(200)
    expect(notify).toHaveBeenCalledTimes(1)
    const [key, kind, text] = notify.mock.calls[0]
    expect(key).toBe('tg-rw-dep_123-FAILED')
    expect(kind).toBe('ops_deploy')
    expect(text).toContain('❌')
    expect(text).toContain('backend-service')
    expect(text).toContain('FAILED')
    expect(touchEvent).toHaveBeenCalledWith(
      'tg-opsstate-railway',
      'ops_state',
      expect.objectContaining({ payload: expect.objectContaining({ status: 'FAILED' }) })
    )
  })

  it('notifies loudly on CRASHED', async () => {
    const res = makeRes()
    await POST(makeReq(deployPayload('CRASHED', 'dep_9'), SECRET) as any, res)
    expect(notify.mock.calls[0][0]).toBe('tg-rw-dep_9-CRASHED')
    expect(notify.mock.calls[0][2]).toContain('❌')
  })

  it('sends a quiet one-liner on SUCCESS', async () => {
    const res = makeRes()
    await POST(makeReq(deployPayload('SUCCESS', 'dep_2'), SECRET) as any, res)
    expect(res.statusCode).toBe(200)
    expect(notify).toHaveBeenCalledTimes(1)
    const [key, , text] = notify.mock.calls[0]
    expect(key).toBe('tg-rw-dep_2-SUCCESS')
    expect(text).toContain('✅ Railway deploy ok')
  })

  it('rejects a wrong path secret with 401 and does not process', async () => {
    const res = makeRes()
    await POST(makeReq(deployPayload('FAILED'), 'nope') as any, res)
    expect(res.statusCode).toBe(401)
    expect(notify).not.toHaveBeenCalled()
  })

  it('rejects when OPS_WEBHOOK_SECRET is unset', async () => {
    delete process.env.OPS_WEBHOOK_SECRET
    const res = makeRes()
    await POST(makeReq(deployPayload('FAILED'), '') as any, res)
    expect(res.statusCode).toBe(401)
    expect(notify).not.toHaveBeenCalled()
  })

  it('answers 200 on unknown payload shapes without notifying', async () => {
    const res = makeRes()
    await POST(makeReq({ type: 'SOMETHING_ELSE' }, SECRET) as any, res)
    expect(res.statusCode).toBe(200)
    expect(notify).not.toHaveBeenCalled()
  })

  it('ignores intermediate deploy statuses quietly', async () => {
    const res = makeRes()
    await POST(makeReq(deployPayload('BUILDING'), SECRET) as any, res)
    expect(res.statusCode).toBe(200)
    expect(notify).not.toHaveBeenCalled()
  })
})
