import { lblAction, lbloAction } from '../actions/create-label'

jest.mock('../../../lib/dhl-label', () => ({ createDhlLabelForOrder: jest.fn() }))
import { createDhlLabelForOrder } from '../../../lib/dhl-label'

jest.mock('../commands/checklist-data', () => ({ loadChecklistView: jest.fn() }))
import { loadChecklistView } from '../commands/checklist-data'

const makeCtx = () => ({
  container: { resolve: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
  svc: {
    editMessage: jest.fn().mockResolvedValue(undefined),
    claimAction: jest.fn().mockResolvedValue(true),
    releaseAction: jest.fn().mockResolvedValue(undefined),
  },
  chatId: '111', messageId: 42, originalText: '🛒 New order #28412',
  actor: { id: '8842061517', name: 'Sam' },
}) as never

describe('lblAction', () => {
  beforeEach(() => jest.clearAllMocks())

  it('created: edits the host with the result and writes an audit row', async () => {
    ;(createDhlLabelForOrder as jest.Mock).mockResolvedValue({
      status: 'created', fulfillment_id: 'ful_1', display_id: 28412, tracking_number: '3S1',
      label_pdf_url: null, shipment_tracking_url: null,
    })
    const ctx = makeCtx()
    const toast = await lblAction(ctx, ['ord_1'])
    expect((ctx as any).svc.claimAction).toHaveBeenCalledWith(
      'tg-act-lbl-ful_1', 'act_label', { id: '8842061517', name: 'Sam' },
      expect.objectContaining({ order_id: 'ord_1', display_id: 28412, tracking_number: '3S1', override: false })
    )
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('Label created'))
    expect(toast).toContain('Label')
  })

  it('created without override: no pick-skipped warning', async () => {
    ;(createDhlLabelForOrder as jest.Mock).mockResolvedValue({
      status: 'created', fulfillment_id: 'ful_1', display_id: 28412, tracking_number: '3S1',
      label_pdf_url: null, shipment_tracking_url: null,
    })
    const ctx = makeCtx()
    await lblAction(ctx, ['ord_1'])
    const [, , text] = (ctx as any).svc.editMessage.mock.calls[0]
    expect(text).not.toContain('Pick check skipped')
    expect(loadChecklistView).not.toHaveBeenCalled()
  })

  it('checklist_blocked: edits into an override confirm with lblo/dis buttons', async () => {
    ;(createDhlLabelForOrder as jest.Mock).mockResolvedValue({
      status: 'checklist_blocked', order_id: 'ord_1', display_id: 28412, ticked: 0, total: 2,
    })
    const ctx = makeCtx()
    await lblAction(ctx, ['ord_1'])
    const [, , text, extra] = (ctx as any).svc.editMessage.mock.calls[0]
    expect(text).toContain('0/2')
    expect(JSON.stringify(extra)).toContain('lblo:ord_1')
    expect(JSON.stringify(extra)).toContain('dis')
    expect((ctx as any).svc.claimAction).not.toHaveBeenCalled()
  })

  it('exists: reports the existing label without an audit row', async () => {
    ;(createDhlLabelForOrder as jest.Mock).mockResolvedValue({
      status: 'exists', fulfillment_id: 'ful_1', display_id: 28412, tracking_number: '3S1',
      label_pdf_url: null, shipment_tracking_url: null,
    })
    const ctx = makeCtx()
    await lblAction(ctx, ['ord_1'])
    expect((ctx as any).svc.claimAction).not.toHaveBeenCalled()
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('already'))
  })

  it('error: edits in the failure so the operator sees it', async () => {
    ;(createDhlLabelForOrder as jest.Mock).mockResolvedValue({ status: 'error', message: 'boom' })
    const ctx = makeCtx()
    const toast = await lblAction(ctx, ['ord_1'])
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('boom'))
    expect(toast).toContain('failed')
  })

  it('invalid (workflow gate): edits in the Dutch gate message', async () => {
    ;(createDhlLabelForOrder as jest.Mock).mockResolvedValue({
      status: 'invalid', httpStatus: 400, message: 'De betaling is nog niet (volledig) ontvangen', details: 'not_allowed',
    })
    const ctx = makeCtx()
    await lblAction(ctx, ['ord_1'])
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('betaling'))
  })

  it('not_found: toast only, no edit', async () => {
    ;(createDhlLabelForOrder as jest.Mock).mockResolvedValue({ status: 'not_found' })
    const ctx = makeCtx()
    const toast = await lblAction(ctx, ['ord_1'])
    expect(toast).toContain('not found')
    expect((ctx as any).svc.editMessage).not.toHaveBeenCalled()
  })
})

describe('lbloAction', () => {
  beforeEach(() => jest.clearAllMocks())

  it('passes the actor-attributed Dutch override reason and audits override: true', async () => {
    ;(createDhlLabelForOrder as jest.Mock).mockResolvedValue({
      status: 'created', fulfillment_id: 'ful_2', display_id: 28412, tracking_number: '3S2',
      label_pdf_url: null, shipment_tracking_url: null,
    })
    const ctx = makeCtx()
    await lbloAction(ctx, ['ord_1'])
    expect(createDhlLabelForOrder).toHaveBeenCalledWith((ctx as any).container, 'ord_1', {
      itemsOverride: {
        byId: 'tg:8842061517', byName: 'Sam',
        reason: 'Label aangemaakt via Telegram-bot door Sam',
      },
    })
    expect((ctx as any).svc.claimAction).toHaveBeenCalledWith(
      'tg-act-lbl-ful_2', 'act_label', expect.anything(), expect.objectContaining({ override: true })
    )
  })

  it('created via override: warns that the pick check was skipped and lists the unticked items', async () => {
    ;(createDhlLabelForOrder as jest.Mock).mockResolvedValue({
      status: 'created', fulfillment_id: 'ful_2', display_id: 28413, tracking_number: '3S2',
      label_pdf_url: null, shipment_tracking_url: null,
    })
    ;(loadChecklistView as jest.Mock).mockResolvedValue({
      orderId: 'ord_1', displayId: 28413,
      items: [
        { id: 'ordli_1', title: 'Retatrutide 30mg', qty: 2, ticked: false },
        { id: 'ordli_2', title: 'BPC-157 <10mg>', qty: 1, ticked: true },
      ],
    })
    const ctx = makeCtx()
    const toast = await lbloAction(ctx, ['ord_1'])
    const [, , text] = (ctx as any).svc.editMessage.mock.calls[0]
    expect(text).toContain('Label created')
    expect(text).toContain('Pick check skipped')
    expect(text).toContain('2x Retatrutide 30mg')
    expect(text).not.toContain('BPC-157')
    expect(toast).toContain('pick check skipped')
  })

  it('created via override: warning survives a checklist-view load failure', async () => {
    ;(createDhlLabelForOrder as jest.Mock).mockResolvedValue({
      status: 'created', fulfillment_id: 'ful_2', display_id: 28413, tracking_number: '3S2',
      label_pdf_url: null, shipment_tracking_url: null,
    })
    ;(loadChecklistView as jest.Mock).mockRejectedValue(new Error('graph down'))
    const ctx = makeCtx()
    await lbloAction(ctx, ['ord_1'])
    const [, , text] = (ctx as any).svc.editMessage.mock.calls[0]
    expect(text).toContain('Label created')
    expect(text).toContain('Pick check skipped')
  })
})
