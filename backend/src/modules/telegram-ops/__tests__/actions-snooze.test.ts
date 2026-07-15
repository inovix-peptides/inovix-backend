import { snzAction } from '../actions/snooze'

const makeCtx = () => ({
  container: { resolve: jest.fn() },
  svc: {
    touchEvent: jest.fn().mockResolvedValue(undefined),
    editMessage: jest.fn().mockResolvedValue(undefined),
  },
  chatId: '111', messageId: 42, originalText: '⏰ Slipping: #28412 paid 26h ago, no label',
  actor: { id: '8842061517', name: 'Sam' },
}) as never

describe('snzAction', () => {
  it('sets snoozed_until on the reminder row and edits the message', async () => {
    const ctx = makeCtx()
    const toast = await snzAction(ctx, ['tg-slip-ord_1', '1'])
    const [key, kind, data] = (ctx as any).svc.touchEvent.mock.calls[0]
    expect(key).toBe('tg-slip-ord_1')
    expect(kind).toBe('reminder')
    const until = data.snoozed_until as Date
    expect(until.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000)
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('Snoozed until'))
    expect(toast).toContain('Snoozed')
  })

  it('rejects garbage days', async () => {
    const ctx = makeCtx()
    await expect(snzAction(ctx, ['tg-slip-ord_1', '0'])).resolves.toContain('Invalid')
    await expect(snzAction(ctx, ['tg-slip-ord_1', '99'])).resolves.toContain('Invalid')
    expect((ctx as any).svc.touchEvent).not.toHaveBeenCalled()
  })
})
