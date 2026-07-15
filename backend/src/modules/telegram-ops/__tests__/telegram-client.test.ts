import { sendTelegramRequest } from '../telegram-client'

describe('sendTelegramRequest', () => {
  const okResponse = (body: unknown, status = 200) =>
    ({ status, json: async () => body }) as Response

  afterEach(() => jest.restoreAllMocks())

  it('POSTs to the bot API and returns the parsed body', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(okResponse({ ok: true, result: { message_id: 1 } }))
    const res = await sendTelegramRequest('TOKEN', 'sendMessage', { chat_id: '1', text: 'hi' })
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botTOKEN/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: '1', text: 'hi' }),
      })
    )
  })

  it('retries on 429 honoring retry_after, then succeeds', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        okResponse({ ok: false, parameters: { retry_after: 0 } }, 429)
      )
      .mockResolvedValueOnce(okResponse({ ok: true }))
    const res = await sendTelegramRequest('T', 'sendMessage', {})
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after 3 attempts on 500 and reports ok=false', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(okResponse({ ok: false, description: 'boom' }, 500))
    const res = await sendTelegramRequest('T', 'sendMessage', {})
    expect(res.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry a 400 (bad request is permanent)', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(okResponse({ ok: false, description: 'chat not found' }, 400))
    const res = await sendTelegramRequest('T', 'sendMessage', {})
    expect(res.ok).toBe(false)
    expect(res.description).toBe('chat not found')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports ok=false when fetch itself rejects (network down)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'))
    const res = await sendTelegramRequest('T', 'sendMessage', {})
    expect(res.ok).toBe(false)
  })
})
