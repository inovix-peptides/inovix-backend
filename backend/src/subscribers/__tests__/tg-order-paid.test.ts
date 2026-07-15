jest.mock('../../lib/instrument', () => ({ Sentry: { captureException: jest.fn() } }))

import { notifyOrderPaidOnTelegram } from '../_helpers/telegram-order-paid'

const paidOrder = {
  id: 'order_1',
  display_id: 28412,
  total: 89.9,
  currency_code: 'eur',
  created_at: '2026-07-14T10:00:00Z',
  payment_collections: [{ status: 'completed', captured_amount: 89.9 }],
  shipping_address: { country_code: 'nl' },
  items: [{ quantity: 3 }],
  shipping_methods: [{ name: 'DHL Thuisbezorgd' }],
}

const makeContainer = (order: unknown, notify = jest.fn().mockResolvedValue(true)) => {
  const graph = jest.fn().mockResolvedValue({ data: order ? [order] : [] })
  return {
    notify,
    container: {
      resolve: jest.fn((key: string) => {
        if (key === 'telegram_ops') return { notify, isConfigured: () => true }
        if (key === 'query') return { graph }
        if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        return undefined
      }),
    } as any,
  }
}

describe('notifyOrderPaidOnTelegram', () => {
  it('sends an idempotent notification for a paid order (no customer name)', async () => {
    const { container, notify } = makeContainer(paidOrder)
    await notifyOrderPaidOnTelegram(container, 'order_1')
    expect(notify).toHaveBeenCalledWith(
      'tg-order-order_1',
      'order_paid',
      expect.stringContaining('#28412')
    )
    const text = notify.mock.calls[0][2] as string
    expect(text).toContain('€89.90')
    expect(text).toContain('NL')
    expect(text).not.toMatch(/jan|@/i) // no PII in pushes
  })

  it('does nothing when the order is not paid yet', async () => {
    const { container, notify } = makeContainer({
      ...paidOrder,
      payment_collections: [{ status: 'pending', captured_amount: 0 }],
    })
    await notifyOrderPaidOnTelegram(container, 'order_1')
    expect(notify).not.toHaveBeenCalled()
  })

  it('never throws when telegram fails (fire and forget)', async () => {
    const { container } = makeContainer(paidOrder, jest.fn().mockRejectedValue(new Error('tg down')))
    await expect(notifyOrderPaidOnTelegram(container, 'order_1')).resolves.toBeUndefined()
  })
})
