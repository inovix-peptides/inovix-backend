import { logCommand } from '../commands/log'

describe('logCommand', () => {
  const rows = [
    { kind: 'act_restock', sent_at: '2026-07-15T12:32:00Z', actor_name: 'Sam', payload: { qty: 25, name: 'BPC-157 10mg' } },
    { kind: 'act_label', sent_at: '2026-07-15T11:00:00Z', actor_name: 'Sam', payload: { display_id: 28412, override: true } },
    { kind: 'act_label', sent_at: '2026-07-15T10:30:00Z', actor_name: 'Sam', payload: { display_id: 28410, override: false } },
    { kind: 'act_ship', sent_at: '2026-07-15T10:00:00Z', actor_name: 'Sam', payload: { display_id: 28411 } },
  ]
  const makeSvc = (r: unknown[]) => ({ listRecentActions: jest.fn().mockResolvedValue(r) })

  it('formats one line per action with actor and Amsterdam time', async () => {
    const svc = makeSvc(rows)
    const out = String(await logCommand({ container: {} as never, svc: svc as never, chatId: '111', args: [] }))
    expect(svc.listRecentActions).toHaveBeenCalledWith(20)
    expect(out).toContain('+25 BPC-157 10mg')
    expect(out).toContain('#28412')
    expect(out).toContain('(override)')
    expect(out).toContain('Label #28410')
    expect(out).not.toContain('#28410 (override)')
    expect(out).toContain('Shipped #28411')
    expect(out).toContain('Sam')
  })

  it('caps n at 50 and handles an empty log', async () => {
    const svc = makeSvc([])
    const out = String(await logCommand({ container: {} as never, svc: svc as never, chatId: '111', args: ['200'] }))
    expect(svc.listRecentActions).toHaveBeenCalledWith(50)
    expect(out).toContain('No bot actions')
  })
})
