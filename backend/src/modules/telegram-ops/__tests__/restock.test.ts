import { restockCommand } from '../commands/restock'
import { rskAction, rspAction, rstAction } from '../actions/restock'

const item = (id: string, title: string, opts: Partial<{ sku: string; stocked: number; reserved: number; noLocation: boolean }> = {}) => ({
  id, title, sku: opts.sku ?? title,
  location_levels: opts.noLocation ? [] : [{
    location_id: 'sloc_1',
    stocked_quantity: opts.stocked ?? 10,
    reserved_quantity: opts.reserved ?? 2,
  }],
})

const makeContainer = (items: unknown[], inventoryService: unknown = {}) => ({
  resolve: jest.fn((key: string) => {
    if (key === 'query') return { graph: jest.fn().mockResolvedValue({ data: items }) }
    if (key === 'inventory') return inventoryService
    if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    return undefined
  }),
})

const textOf = (r: unknown): string => (typeof r === 'string' ? r : (r as { text: string }).text)

describe('restockCommand', () => {
  const svc = {} as never

  it('rejects a missing or non-positive quantity', async () => {
    const c = makeContainer([item('iitem_1', 'BPC-157 10mg')])
    expect(textOf(await restockCommand({ container: c as never, svc, chatId: '111', args: ['bpc'] }))).toContain('Usage')
    expect(textOf(await restockCommand({ container: c as never, svc, chatId: '111', args: ['bpc', '+0'] }))).toContain('Usage')
    expect(textOf(await restockCommand({ container: c as never, svc, chatId: '111', args: ['bpc', '25'] }))).toContain('Usage')
    expect(textOf(await restockCommand({ container: c as never, svc, chatId: '111', args: ['+25'] }))).toContain('Usage')
  })

  it('one match: returns a confirm prompt with the rst callback', async () => {
    const c = makeContainer([item('iitem_1', 'BPC-157 10mg'), item('iitem_2', 'TB-500 5mg')])
    const r = await restockCommand({ container: c as never, svc, chatId: '111', args: ['bpc', '+25'] })
    expect(typeof r).toBe('object')
    const obj = r as { text: string; reply_markup?: unknown }
    expect(obj.text).toContain('BPC-157 10mg')
    expect(obj.text).toContain('+25')
    expect(obj.text).toContain('8 available')
    expect(JSON.stringify(obj.reply_markup)).toContain('rst:iitem_1:25')
    expect(JSON.stringify(obj.reply_markup)).toContain('dis')
  })

  it('multiple matches: lists candidates instead of a confirm', async () => {
    const c = makeContainer([item('iitem_1', 'BPC-157 5mg'), item('iitem_2', 'BPC-157 10mg')])
    const out = textOf(await restockCommand({ container: c as never, svc, chatId: '111', args: ['bpc', '+25'] }))
    expect(out).toContain('Narrow')
    expect(out).toContain('BPC-157 5mg')
  })

  it('no match reports it', async () => {
    const c = makeContainer([item('iitem_1', 'TB-500 5mg')])
    expect(textOf(await restockCommand({ container: c as never, svc, chatId: '111', args: ['bpc', '+25'] }))).toContain('No inventory')
  })

  it('item without a stock location is refused', async () => {
    const c = makeContainer([item('iitem_1', 'BPC-157 10mg', { noLocation: true })])
    expect(textOf(await restockCommand({ container: c as never, svc, chatId: '111', args: ['bpc', '+25'] }))).toContain('location')
  })
})

describe('rstAction', () => {
  const makeCtx = (container: unknown, claim = true) => ({
    container,
    svc: {
      editMessage: jest.fn().mockResolvedValue(undefined),
      claimAction: jest.fn().mockResolvedValue(claim),
      releaseAction: jest.fn().mockResolvedValue(undefined),
    },
    chatId: '111', messageId: 42, originalText: '⚠️ Restock BPC-157 10mg: +25. Confirm?',
    actor: { id: '8842061517', name: 'Sam' },
  }) as never

  beforeEach(() => jest.clearAllMocks())

  it('claims, adjusts inventory, edits in the result', async () => {
    const adjustInventory = jest.fn().mockResolvedValue(undefined)
    const c = makeContainer([item('iitem_1', 'BPC-157 10mg', { stocked: 10, reserved: 2 })], { adjustInventory })
    const ctx = makeCtx(c)
    const toast = await rstAction(ctx, ['iitem_1', '25'])
    expect((ctx as any).svc.claimAction).toHaveBeenCalledWith(
      'tg-act-rst-111-42', 'act_restock', { id: '8842061517', name: 'Sam' },
      expect.objectContaining({ inventory_item_id: 'iitem_1', qty: 25, name: 'BPC-157 10mg' })
    )
    expect(adjustInventory).toHaveBeenCalledWith([{ inventoryItemId: 'iitem_1', locationId: 'sloc_1', adjustment: 25 }])
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('33 available'))
    expect(toast).toContain('Stock')
  })

  it('double-tap: claim fails, no adjustment', async () => {
    const adjustInventory = jest.fn()
    const c = makeContainer([item('iitem_1', 'BPC-157 10mg')], { adjustInventory })
    const ctx = makeCtx(c, false)
    const toast = await rstAction(ctx, ['iitem_1', '25'])
    expect(adjustInventory).not.toHaveBeenCalled()
    expect(toast).toContain('Already')
  })

  it('adjust failure: releases the claim and reports', async () => {
    const adjustInventory = jest.fn().mockRejectedValue(new Error('db down'))
    const c = makeContainer([item('iitem_1', 'BPC-157 10mg')], { adjustInventory })
    const ctx = makeCtx(c)
    await rstAction(ctx, ['iitem_1', '25'])
    expect((ctx as any).svc.releaseAction).toHaveBeenCalledWith('tg-act-rst-111-42')
    expect((ctx as any).svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('failed'))
  })

  it('rejects an out-of-range quantity', async () => {
    const c = makeContainer([item('iitem_1', 'BPC-157 10mg')], { adjustInventory: jest.fn() })
    const ctx = makeCtx(c)
    await expect(rstAction(ctx, ['iitem_1', '0'])).resolves.toContain('quantity')
    await expect(rstAction(ctx, ['iitem_1', '1000'])).resolves.toContain('quantity')
  })

  it('missing item or location: toast, no claim', async () => {
    const c = makeContainer([], { adjustInventory: jest.fn() })
    const ctx = makeCtx(c)
    const toast = await rstAction(ctx, ['iitem_x', '5'])
    expect(toast).toContain('not found')
    expect((ctx as any).svc.claimAction).not.toHaveBeenCalled()
  })
})

describe('rsk picker + rsp confirm (accident safety)', () => {
  const makeCtx = (container: unknown) => ({
    container,
    svc: {
      sendTo: jest.fn().mockResolvedValue(undefined),
      editMessage: jest.fn().mockResolvedValue(undefined),
      claimAction: jest.fn().mockResolvedValue(true),
      releaseAction: jest.fn().mockResolvedValue(undefined),
    },
    chatId: '111', messageId: 42, originalText: '⚠️ Low stock: BPC-157 10mg',
    actor: { id: '8842061517', name: 'Sam' },
  }) as never

  it('picker buttons go to the rsp confirm step, never straight to rst', async () => {
    const c = makeContainer([item('iitem_1', 'BPC-157 10mg')])
    const ctx = makeCtx(c)
    await rskAction(ctx, ['iitem_1'])
    const kb = JSON.stringify((ctx as any).svc.sendTo.mock.calls[0][2])
    expect(kb).toContain('rsp:iitem_1:10')
    expect(kb).toContain('rsp:iitem_1:25')
    expect(kb).toContain('rsp:iitem_1:50')
    expect(kb).not.toContain('rst:')
  })

  it('rsp renders the confirm prompt whose Confirm button is rst', async () => {
    const c = makeContainer([item('iitem_1', 'BPC-157 10mg')])
    const ctx = makeCtx(c)
    await rspAction(ctx, ['iitem_1', '25'])
    const [, , text, extra] = (ctx as any).svc.editMessage.mock.calls[0]
    expect(text).toContain('Confirm?')
    expect(text).toContain('+25')
    const kb = JSON.stringify(extra)
    expect(kb).toContain('rst:iitem_1:25')
    expect(kb).toContain('dis')
    expect((ctx as any).svc.claimAction).not.toHaveBeenCalled()
  })

  it('rsp refuses items without a stock location', async () => {
    const c = makeContainer([item('iitem_1', 'BPC-157 10mg', { noLocation: true })])
    const ctx = makeCtx(c)
    await expect(rspAction(ctx, ['iitem_1', '25'])).resolves.toContain('location')
  })
})
