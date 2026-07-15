import { parseCommand, handleUpdate, COMMANDS } from '../commands/router'

describe('parseCommand', () => {
  it('parses command and args', () => {
    expect(parseCommand('/orders 5')).toEqual({ command: 'orders', args: ['5'] })
    expect(parseCommand('/order 28412')).toEqual({ command: 'order', args: ['28412'] })
  })
  it('strips the @BotName suffix and lowercases', () => {
    expect(parseCommand('/Orders@InovixOpsBot 3')).toEqual({ command: 'orders', args: ['3'] })
  })
  it('returns null for non-commands', () => {
    expect(parseCommand('hello')).toBeNull()
    expect(parseCommand('')).toBeNull()
  })
})

describe('handleUpdate', () => {
  const makeSvc = (chatIds: string[]) => ({
    allowedChatIds: jest.fn(() => chatIds),
    sendTo: jest.fn().mockResolvedValue(undefined),
  })
  const makeContainer = (svc: unknown) => ({
    resolve: jest.fn((key: string) => {
      if (key === 'telegram_ops') return svc
      if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      return undefined
    }),
  })
  const msgUpdate = (chatId: number, text: string) => ({
    message: { chat: { id: chatId }, from: { id: chatId, first_name: 'Sam' }, text },
  })

  it('answers /help for an allowlisted chat', async () => {
    const svc = makeSvc(['111'])
    await handleUpdate(makeContainer(svc) as any, msgUpdate(111, '/help') as any)
    expect(svc.sendTo).toHaveBeenCalledWith('111', expect.stringContaining('/orders'))
  })

  it('ignores non-allowlisted chats when an allowlist exists', async () => {
    const svc = makeSvc(['111'])
    await handleUpdate(makeContainer(svc) as any, msgUpdate(999, '/help') as any)
    expect(svc.sendTo).not.toHaveBeenCalledWith('999', expect.anything())
  })

  it('bootstrap mode: empty allowlist replies ONLY with the chat id', async () => {
    const svc = makeSvc([])
    await handleUpdate(makeContainer(svc) as any, msgUpdate(555, '/start') as any)
    expect(svc.sendTo).toHaveBeenCalledTimes(1)
    expect(svc.sendTo).toHaveBeenCalledWith('555', expect.stringContaining('555'))
  })

  it('unknown command answers with help hint', async () => {
    const svc = makeSvc(['111'])
    await handleUpdate(makeContainer(svc) as any, msgUpdate(111, '/frobnicate') as any)
    expect(svc.sendTo).toHaveBeenCalledWith('111', expect.stringContaining('/help'))
  })

  it('a handler is looked up in COMMANDS', () => {
    expect(Object.keys(COMMANDS)).toEqual(expect.arrayContaining(['help', 'start']))
  })
})
