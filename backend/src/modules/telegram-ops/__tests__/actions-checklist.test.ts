import { chkAction, tckAction, clsAction } from '../actions/checklist'

jest.mock('../commands/checklist-data', () => {
  const actual = jest.requireActual('../commands/checklist-data')
  return { ...actual, loadChecklistView: jest.fn() }
})
jest.mock('../../../lib/fulfillment-checklist-write', () => ({
  applyChecklistUpdate: jest.fn().mockResolvedValue({ next: {} }),
}))
import { loadChecklistView } from '../commands/checklist-data'
import { applyChecklistUpdate } from '../../../lib/fulfillment-checklist-write'

const view = (over: Record<string, unknown> = {}) => ({
  orderId: 'ord_1',
  displayId: 28412,
  items: [
    { id: 'item_a', title: 'BPC-157 10mg', qty: 2, ticked: false },
    { id: 'item_b', title: 'TB-500 5mg', qty: 1, ticked: true },
  ],
  paymentOk: true,
  packageClosed: false,
  hasLabel: false,
  shipped: false,
  canceled: false,
  steps: { payment: 'done', pick: 'active', label: 'locked', close: 'locked', ship: 'locked' },
  ...over,
})

const makeCtx = () => ({
  container: { resolve: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
  svc: {
    sendTo: jest.fn().mockResolvedValue(undefined),
    editMessage: jest.fn().mockResolvedValue(undefined),
  },
  chatId: '111', messageId: 42, originalText: 'whatever',
  actor: { id: '8842061517', name: 'Sam' },
}) as never

describe('chkAction', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends the rendered checklist as a NEW message', async () => {
    ;(loadChecklistView as jest.Mock).mockResolvedValue(view())
    const ctx = makeCtx()
    await chkAction(ctx, ['ord_1'])
    const [chatId, text, extra] = (ctx as any).svc.sendTo.mock.calls[0]
    expect(chatId).toBe('111')
    expect(text).toContain('#28412')
    expect(JSON.stringify(extra)).toContain('tck:ord_1:0')
    expect((ctx as any).svc.editMessage).not.toHaveBeenCalled()
  })

  it('missing order: toast only', async () => {
    ;(loadChecklistView as jest.Mock).mockResolvedValue(null)
    const toast = await chkAction(makeCtx(), ['ord_x'])
    expect(toast).toContain('not found')
  })
})

describe('tckAction', () => {
  beforeEach(() => jest.clearAllMocks())

  it('toggles the indexed item via the serialized writer and re-renders in place', async () => {
    ;(loadChecklistView as jest.Mock)
      .mockResolvedValueOnce(view()) // before toggle
      .mockResolvedValueOnce(view({ items: [
        { id: 'item_a', title: 'BPC-157 10mg', qty: 2, ticked: true },
        { id: 'item_b', title: 'TB-500 5mg', qty: 1, ticked: true },
      ] })) // after toggle
    const ctx = makeCtx()
    await tckAction(ctx, ['ord_1', '0'])
    expect(applyChecklistUpdate).toHaveBeenCalledWith(
      (ctx as any).container, 'ord_1',
      { action: 'tick_item', item_id: 'item_a', checked: true },
      { by_id: 'tg:8842061517', by_name: 'Sam' }
    )
    const [, messageId, text] = (ctx as any).svc.editMessage.mock.calls[0]
    expect(messageId).toBe(42)
    expect(text).toContain('2/2')
  })

  it('unticks a ticked item', async () => {
    ;(loadChecklistView as jest.Mock).mockResolvedValue(view())
    const ctx = makeCtx()
    await tckAction(ctx, ['ord_1', '1'])
    expect(applyChecklistUpdate).toHaveBeenCalledWith(
      expect.anything(), 'ord_1',
      { action: 'tick_item', item_id: 'item_b', checked: false },
      expect.anything()
    )
  })

  it('index out of range: toast, no write', async () => {
    ;(loadChecklistView as jest.Mock).mockResolvedValue(view())
    const toast = await tckAction(makeCtx(), ['ord_1', '9'])
    expect(toast).toContain('changed')
    expect(applyChecklistUpdate).not.toHaveBeenCalled()
  })
})

describe('clsAction', () => {
  beforeEach(() => jest.clearAllMocks())

  it('closes the package and re-renders', async () => {
    ;(loadChecklistView as jest.Mock).mockResolvedValue(view({ hasLabel: true, steps: { payment: 'done', pick: 'done', label: 'done', close: 'active', ship: 'locked' } }))
    const ctx = makeCtx()
    await clsAction(ctx, ['ord_1'])
    expect(applyChecklistUpdate).toHaveBeenCalledWith(
      expect.anything(), 'ord_1',
      { action: 'package_closed', checked: true },
      { by_id: 'tg:8842061517', by_name: 'Sam' }
    )
    expect((ctx as any).svc.editMessage).toHaveBeenCalled()
  })

  it('reopens a closed package', async () => {
    ;(loadChecklistView as jest.Mock).mockResolvedValue(view({ packageClosed: true, hasLabel: true }))
    await clsAction(makeCtx(), ['ord_1'])
    expect(applyChecklistUpdate).toHaveBeenCalledWith(
      expect.anything(), 'ord_1',
      { action: 'package_closed', checked: false },
      expect.anything()
    )
  })
})
