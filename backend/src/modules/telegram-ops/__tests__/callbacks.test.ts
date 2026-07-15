import { parseCallbackData, stripConfirm, handleCallback, CALLBACKS } from '../commands/callbacks'

describe('parseCallbackData', () => {
  it('splits action and args on colons', () => {
    expect(parseCallbackData('det:28412')).toEqual({ action: 'det', args: ['28412'] })
    expect(parseCallbackData('rst:iitem_1:25')).toEqual({ action: 'rst', args: ['iitem_1', '25'] })
    expect(parseCallbackData('dis')).toEqual({ action: 'dis', args: [] })
    expect(parseCallbackData('')).toBeNull()
  })
})

describe('stripConfirm', () => {
  it('removes an appended confirm block, keeps the original', () => {
    expect(stripConfirm('order text\n\n⚠️ Confirm?')).toBe('order text')
    expect(stripConfirm('order text')).toBe('order text')
  })
})

describe('handleCallback', () => {
  const makeSvc = () => ({
    allowedChatIds: jest.fn(() => ['111']),
    sendTo: jest.fn().mockResolvedValue(undefined),
    editMessage: jest.fn().mockResolvedValue(undefined),
  })
  const makeContainer = (svc: unknown) => ({
    resolve: jest.fn((key: string) => {
      if (key === 'telegram_ops') return svc
      if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      return undefined
    }),
  })
  const cb = (data: string) => ({
    id: 'cbq-1',
    from: { id: 8842061517, first_name: 'Sam' },
    message: { message_id: 42, chat: { id: 111 }, text: 'original' },
    data,
  })

  it('dis restores the original text without keyboard', async () => {
    const svc = makeSvc()
    await handleCallback(makeContainer(svc) as never, svc as never, cb('dis') as never)
    expect(svc.editMessage).toHaveBeenCalledWith('111', 42, expect.stringContaining('Canceled'))
  })

  it('dis strips a pending confirm block from the text', async () => {
    const svc = makeSvc()
    const query = { ...cb('dis'), message: { message_id: 42, chat: { id: 111 }, text: 'original\n\n⚠️ Confirm?' } }
    await handleCallback(makeContainer(svc) as never, svc as never, query as never)
    const text = svc.editMessage.mock.calls[0][2]
    expect(text).not.toContain('Confirm?')
    expect(text).toContain('original')
  })

  it('unknown action returns a toast and does nothing else', async () => {
    const svc = makeSvc()
    const toast = await handleCallback(makeContainer(svc) as never, svc as never, cb('zzz:1') as never)
    expect(toast).toContain('Unknown')
    expect(svc.editMessage).not.toHaveBeenCalled()
  })

  it('det sends the order detail as a NEW message', async () => {
    const svc = makeSvc()
    const container = {
      resolve: jest.fn((key: string) => {
        if (key === 'telegram_ops') return svc
        if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        if (key === 'query') return { graph: jest.fn().mockResolvedValue({ data: [] }) }
        return undefined
      }),
    }
    await handleCallback(container as never, svc as never, cb('det:28412') as never)
    expect(svc.sendTo).toHaveBeenCalledWith('111', expect.stringContaining('28412'), expect.anything())
    expect(svc.editMessage).not.toHaveBeenCalled()
  })

  it('registry has det and dis registered', () => {
    expect(Object.keys(CALLBACKS)).toEqual(expect.arrayContaining(['det', 'dis']))
  })
})
