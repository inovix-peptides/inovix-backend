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

describe('phase 2 service additions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('notify forwards extra (reply_markup) to every send', async () => {
    const svc = makeService()
    ;(svc as any).createTelegramOpsEvents = jest.fn().mockResolvedValue({ id: 'evt_1' })
    const kb = { inline_keyboard: [[{ text: 'x', callback_data: 'det:1' }]] }
    await svc.notify('k1', 'order_paid', 'hello', { reply_markup: kb })
    expect(sendTelegramRequest).toHaveBeenCalledWith('TOKEN', 'sendMessage',
      expect.objectContaining({ chat_id: '111', text: 'hello', reply_markup: kb }))
  })

  it('editMessage calls editMessageText and never throws on failure', async () => {
    ;(sendTelegramRequest as jest.Mock).mockResolvedValue({ ok: false, description: 'message not found' })
    const logger = { error: jest.fn() }
    const svc = new (TelegramOpsService as any)({ logger }, OPTS) as TelegramOpsService
    await expect(svc.editMessage('111', 42, 'new text')).resolves.toBeUndefined()
    expect(sendTelegramRequest).toHaveBeenCalledWith('TOKEN', 'editMessageText',
      expect.objectContaining({ chat_id: '111', message_id: 42, text: 'new text', parse_mode: 'HTML' }))
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('message not found'))
  })

  it('editMessage removes the keyboard unless extra provides one', async () => {
    const svc = makeService()
    await svc.editMessage('111', 42, 'plain')
    const payload = (sendTelegramRequest as jest.Mock).mock.calls[0][2]
    expect(payload.reply_markup).toBeUndefined()
  })

  it('answerCallback calls answerCallbackQuery with optional text', async () => {
    const svc = makeService()
    await svc.answerCallback('cbq-1', 'Done')
    expect(sendTelegramRequest).toHaveBeenCalledWith('TOKEN', 'answerCallbackQuery',
      expect.objectContaining({ callback_query_id: 'cbq-1', text: 'Done' }))
    await svc.answerCallback('cbq-2')
    const payload = (sendTelegramRequest as jest.Mock).mock.calls[1][2]
    expect(payload).toEqual({ callback_query_id: 'cbq-2' })
  })

  it('claimAction returns false on a unique violation, true otherwise, and records the actor', async () => {
    const svc = makeService()
    ;(svc as any).createTelegramOpsEvents = jest.fn()
      .mockResolvedValueOnce({ id: 'evt_1' })
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }))
    const actor = { id: '8842061517', name: 'Sam' }
    await expect(svc.claimAction('tg-act-shp-ord_1', 'act_ship', actor, { order_id: 'ord_1' })).resolves.toBe(true)
    await expect(svc.claimAction('tg-act-shp-ord_1', 'act_ship', actor, { order_id: 'ord_1' })).resolves.toBe(false)
    expect((svc as any).createTelegramOpsEvents).toHaveBeenCalledWith(expect.objectContaining({
      key: 'tg-act-shp-ord_1', kind: 'act_ship', actor_id: '8842061517', actor_name: 'Sam',
      payload: { order_id: 'ord_1' },
    }))
  })

  it('releaseAction deletes the row for the key and swallows errors', async () => {
    const svc = makeService()
    ;(svc as any).listTelegramOpsEvents = jest.fn().mockResolvedValue([{ id: 'evt_1' }])
    ;(svc as any).deleteTelegramOpsEvents = jest.fn().mockResolvedValue(undefined)
    await svc.releaseAction('tg-act-shp-ord_1')
    expect((svc as any).deleteTelegramOpsEvents).toHaveBeenCalledWith('evt_1')

    const failing = makeService()
    ;(failing as any).listTelegramOpsEvents = jest.fn().mockRejectedValue(new Error('db down'))
    await expect(failing.releaseAction('k')).resolves.toBeUndefined()
  })

  it('listRecentActions filters to action kinds, newest first', async () => {
    const svc = makeService()
    const list = jest.fn().mockResolvedValue([])
    ;(svc as any).listTelegramOpsEvents = list
    await svc.listRecentActions(20)
    expect(list).toHaveBeenCalledWith(
      { kind: ['act_label', 'act_ship', 'act_restock'] },
      expect.objectContaining({ take: 20, order: { sent_at: 'DESC' } })
    )
  })
})
