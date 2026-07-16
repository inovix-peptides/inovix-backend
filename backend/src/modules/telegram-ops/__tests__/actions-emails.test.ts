import { emlAction, emrAction, emrcAction } from '../actions/emails'

jest.mock('../../../lib/order-notifications', () => ({
  listOrderEmails: jest.fn(),
  getNotification: jest.fn(),
  resendOrderEmail: jest.fn(),
}))
import { listOrderEmails, getNotification, resendOrderEmail } from '../../../lib/order-notifications'

const makeCtx = (claim = true) => ({
  container: { resolve: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
  svc: {
    sendTo: jest.fn().mockResolvedValue(undefined),
    editMessage: jest.fn().mockResolvedValue(undefined),
    claimAction: jest.fn().mockResolvedValue(claim),
    releaseAction: jest.fn().mockResolvedValue(undefined),
  },
  chatId: '111', messageId: 42, originalText: 'whatever',
  actor: { id: '8842061517', name: 'Sam' },
}) as never

const email = (id: string, template: string, at: string) => ({
  id, template, to: 'jan@x.nl', status: 'success', created_at: at, idempotency_key: 'k',
})

describe('emlAction (list emails)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('lists sent emails as a NEW message with per-email resend buttons', async () => {
    ;(listOrderEmails as jest.Mock).mockResolvedValue({
      email: 'jan@x.nl',
      notifications: [
        email('noti_1', 'order-placed', '2026-07-15T10:00:00Z'),
        email('noti_2', 'order-shipped', '2026-07-16T09:00:00Z'),
      ],
    })
    const ctx = makeCtx()
    await emlAction(ctx, ['ord_1'])
    const [chatId, text, extra] = (ctx as any).svc.sendTo.mock.calls[0]
    expect(chatId).toBe('111')
    expect(text).toContain('order-placed')
    expect(text).toContain('jan@x.nl')
    const kb = JSON.stringify(extra)
    expect(kb).toContain('emr:noti_1')
    expect(kb).toContain('emr:noti_2')
  })

  it('no emails: plain message, no keyboard', async () => {
    ;(listOrderEmails as jest.Mock).mockResolvedValue({ email: 'jan@x.nl', notifications: [] })
    const ctx = makeCtx()
    await emlAction(ctx, ['ord_1'])
    const [, text, extra] = (ctx as any).svc.sendTo.mock.calls[0]
    expect(text).toContain('No emails')
    expect(extra).toEqual({})
  })
})

describe('emrAction (confirm prompt)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends a NEW confirm message | never resends directly', async () => {
    ;(getNotification as jest.Mock).mockResolvedValue(email('noti_1', 'order-shipped', '2026-07-16T09:00:00Z'))
    const ctx = makeCtx()
    await emrAction(ctx, ['noti_1'])
    expect(resendOrderEmail).not.toHaveBeenCalled()
    const [, text, extra] = (ctx as any).svc.sendTo.mock.calls[0]
    expect(text).toContain('Resend')
    expect(text).toContain('order-shipped')
    expect(text).toContain('jan@x.nl')
    const kb = JSON.stringify(extra)
    expect(kb).toContain('emrc:noti_1')
    expect(kb).toContain('dis')
  })

  it('unknown notification: toast only', async () => {
    ;(getNotification as jest.Mock).mockResolvedValue(null)
    const toast = await emrAction(makeCtx(), ['noti_x'])
    expect(toast).toContain('not found')
  })
})

describe('emrcAction (execute resend)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('claims first, resends, edits the confirm message, audits act_email', async () => {
    ;(resendOrderEmail as jest.Mock).mockResolvedValue({ ok: true, template: 'order-shipped', to: 'jan@x.nl' })
    const ctx = makeCtx()
    const toast = await emrcAction(ctx, ['noti_1'])
    expect((ctx as any).svc.claimAction).toHaveBeenCalledWith(
      'tg-act-eml-111-42', 'act_email', { id: '8842061517', name: 'Sam' },
      expect.objectContaining({ notification_id: 'noti_1' })
    )
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('Resent'))
    expect(toast).toContain('Resent')
  })

  it('double-tap: claim fails, nothing resent', async () => {
    const ctx = makeCtx(false)
    const toast = await emrcAction(ctx, ['noti_1'])
    expect(resendOrderEmail).not.toHaveBeenCalled()
    expect(toast).toContain('Already')
  })

  it('failure releases the claim and reports', async () => {
    ;(resendOrderEmail as jest.Mock).mockResolvedValue({ ok: false, reason: 'error', message: 'resend down' })
    const ctx = makeCtx()
    await emrcAction(ctx, ['noti_1'])
    expect((ctx as any).svc.releaseAction).toHaveBeenCalledWith('tg-act-eml-111-42')
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('failed'))
  })
})
