jest.mock('../telegram-client', () => ({
  sendTelegramRequest: jest.fn().mockResolvedValue({ ok: true }),
}))

import TelegramOpsService from '../service'
import { sendTelegramRequest } from '../telegram-client'

const OPTS = {
  botToken: 'TOKEN',
  webhookSecret: 'SECRET',
  allowedChatIds: ' 111 , 222 ',
}

function makeService(opts = OPTS) {
  // MedusaService constructor tolerates a bare container object in unit tests.
  const svc = new (TelegramOpsService as any)({}, opts) as TelegramOpsService
  return svc
}

describe('TelegramOpsService', () => {
  beforeEach(() => jest.clearAllMocks())

  it('parses the allowlist and trims whitespace', () => {
    expect(makeService().allowedChatIds()).toEqual(['111', '222'])
  })

  it('is unconfigured without token or allowlist', () => {
    expect(makeService({ ...OPTS, botToken: '' }).isConfigured()).toBe(false)
    expect(makeService({ ...OPTS, allowedChatIds: '' }).isConfigured()).toBe(false)
    expect(makeService().isConfigured()).toBe(true)
  })

  it('sendToAll sends HTML messages to every allowlisted chat', async () => {
    await makeService().sendToAll('<b>hi</b>')
    expect(sendTelegramRequest).toHaveBeenCalledTimes(2)
    expect(sendTelegramRequest).toHaveBeenCalledWith('TOKEN', 'sendMessage', {
      chat_id: '111',
      text: '<b>hi</b>',
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })
  })

  it('sendToAll is a no-op when unconfigured', async () => {
    await makeService({ ...OPTS, botToken: '' }).sendToAll('hi')
    expect(sendTelegramRequest).not.toHaveBeenCalled()
  })

  it('sendTo/sendToAll never throws when the Telegram API reports a failed send, and logs it', async () => {
    ;(sendTelegramRequest as jest.Mock).mockResolvedValue({ ok: false, description: 'chat not found' })
    const logger = { error: jest.fn() }
    const svc = new (TelegramOpsService as any)({ logger }, OPTS) as TelegramOpsService

    await expect(svc.sendToAll('<b>hi</b>')).resolves.toBeUndefined()
    expect(sendTelegramRequest).toHaveBeenCalledTimes(2) // 2 chats
    expect(logger.error).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('chat not found')
    )
  })

  it('notify sends when the key is fresh and skips when already claimed', async () => {
    const svc = makeService()
    ;(svc as any).createTelegramOpsEvents = jest
      .fn()
      .mockResolvedValueOnce({ id: 'evt_1' })
      .mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), { name: 'UniqueConstraintViolationException' })
      )
    await expect(svc.notify('k1', 'order_paid', 'msg')).resolves.toBe(true)
    await expect(svc.notify('k1', 'order_paid', 'msg')).resolves.toBe(false)
    expect(sendTelegramRequest).toHaveBeenCalledTimes(2) // 1 send x 2 chats
  })

  it('notify rethrows non-unique-violation errors', async () => {
    const svc = makeService()
    ;(svc as any).createTelegramOpsEvents = jest.fn().mockRejectedValue(new Error('db down'))
    await expect(svc.notify('k', 'x', 'msg')).rejects.toThrow('db down')
  })
})
