import { shpAction, shpcAction } from '../actions/mark-shipped'

jest.mock('../../../lib/mark-dhl-shipped', () => ({ markDhlOrderShipped: jest.fn() }))
import { markDhlOrderShipped } from '../../../lib/mark-dhl-shipped'

const makeCtx = (claim = true) => ({
  container: { resolve: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
  svc: {
    editMessage: jest.fn().mockResolvedValue(undefined),
    claimAction: jest.fn().mockResolvedValue(claim),
    releaseAction: jest.fn().mockResolvedValue(undefined),
  },
  chatId: '111', messageId: 42, originalText: '📦 Label ready #28412',
  actor: { id: '8842061517', name: 'Sam' },
}) as never

describe('shpAction (confirm prompt)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('edits the host into a confirm with shpc/dis buttons | does NOT execute', async () => {
    const ctx = makeCtx()
    await shpAction(ctx, ['ord_1', '28412'])
    expect(markDhlOrderShipped).not.toHaveBeenCalled()
    const [, , text, extra] = (ctx as any).svc.editMessage.mock.calls[0]
    expect(text).toContain('28412')
    expect(text).toContain('email')
    expect(JSON.stringify(extra)).toContain('shpc:ord_1:28412')
    expect(JSON.stringify(extra)).toContain('dis')
  })
})

describe('shpcAction (execute)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('claims first, executes, edits in the result', async () => {
    ;(markDhlOrderShipped as jest.Mock).mockResolvedValue({ ok: true, fulfillment_id: 'ful_1', already_shipped: false })
    const ctx = makeCtx()
    const toast = await shpcAction(ctx, ['ord_1', '28412'])
    expect((ctx as any).svc.claimAction).toHaveBeenCalledWith(
      'tg-act-shp-ord_1', 'act_ship', { id: '8842061517', name: 'Sam' }, { order_id: 'ord_1', display_id: 28412 }
    )
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('Shipped #28412'))
    expect(toast).toContain('Shipped')
  })

  it('already shipped: reports the resend', async () => {
    ;(markDhlOrderShipped as jest.Mock).mockResolvedValue({ ok: true, fulfillment_id: 'ful_1', already_shipped: true })
    const ctx = makeCtx()
    await shpcAction(ctx, ['ord_1', '28412'])
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('already'))
  })

  it('double-tap: claim fails, nothing executes', async () => {
    const ctx = makeCtx(false)
    const toast = await shpcAction(ctx, ['ord_1', '28412'])
    expect(markDhlOrderShipped).not.toHaveBeenCalled()
    expect(toast).toContain('Already')
  })

  it('email failure (throw): releases the claim so a retry is possible', async () => {
    ;(markDhlOrderShipped as jest.Mock).mockRejectedValue(new Error('resend down'))
    const ctx = makeCtx()
    await shpcAction(ctx, ['ord_1', '28412'])
    expect((ctx as any).svc.releaseAction).toHaveBeenCalledWith('tg-act-shp-ord_1')
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('resend down'))
  })

  it('no_dhl_label: releases the claim and reports it', async () => {
    ;(markDhlOrderShipped as jest.Mock).mockResolvedValue({ ok: false, reason: 'no_dhl_label' })
    const ctx = makeCtx()
    await shpcAction(ctx, ['ord_1', '28412'])
    expect((ctx as any).svc.releaseAction).toHaveBeenCalledWith('tg-act-shp-ord_1')
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('No DHL label'))
  })

  it('order_not_found: releases the claim, toast only', async () => {
    ;(markDhlOrderShipped as jest.Mock).mockResolvedValue({ ok: false, reason: 'order_not_found' })
    const ctx = makeCtx()
    const toast = await shpcAction(ctx, ['ord_1', '28412'])
    expect((ctx as any).svc.releaseAction).toHaveBeenCalledWith('tg-act-shp-ord_1')
    expect(toast).toContain('not found')
  })
})
