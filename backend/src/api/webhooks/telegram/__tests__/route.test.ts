jest.mock('../../../../modules/telegram-ops/commands/router', () => ({
  handleUpdate: jest.fn().mockResolvedValue(undefined),
}))

import { POST } from '../route'
import { handleUpdate } from '../../../../modules/telegram-ops/commands/router'

const makeRes = () => {
  const res: any = { statusCode: 0 }
  res.status = jest.fn((c: number) => ((res.statusCode = c), res))
  res.json = jest.fn(() => res)
  res.sendStatus = jest.fn((c: number) => ((res.statusCode = c), res))
  return res
}

const makeReq = (secretHeader: string | undefined, body: unknown) => ({
  headers: { 'x-telegram-bot-api-secret-token': secretHeader },
  body,
  scope: {
    resolve: jest.fn((key: string) => {
      if (key === 'telegram_ops') return { webhookSecret: () => 'GOOD' }
      if (key === 'logger') return { warn: jest.fn(), error: jest.fn() }
      return undefined
    }),
  },
})

describe('POST /webhooks/telegram', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects a wrong secret with 401 and does not process', async () => {
    const res = makeRes()
    await POST(makeReq('BAD', { message: {} }) as any, res)
    expect(res.statusCode).toBe(401)
    expect(handleUpdate).not.toHaveBeenCalled()
  })

  it('accepts the correct secret, returns 200, and dispatches', async () => {
    const res = makeRes()
    await POST(makeReq('GOOD', { message: { chat: { id: 1 }, text: '/help' } }) as any, res)
    expect(res.statusCode).toBe(200)
    expect(handleUpdate).toHaveBeenCalled()
  })

  it('rejects when no secret is configured (empty secret)', async () => {
    const res = makeRes()
    const req = makeReq(undefined, {})
    ;(req.scope.resolve as jest.Mock).mockImplementation((key: string) =>
      key === 'telegram_ops' ? { webhookSecret: () => '' } : { warn: jest.fn(), error: jest.fn() }
    )
    await POST(req as any, res)
    expect(res.statusCode).toBe(401)
  })
})
