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
      expect.stringContaining('#28412'),
      expect.objectContaining({ reply_markup: expect.anything() })
    )
    const text = notify.mock.calls[0][2] as string
    expect(text).toContain('€89.90')
    expect(text).toContain('NL')
    expect(text).not.toMatch(/jan|@/i) // no PII in pushes
    const kb = JSON.stringify(notify.mock.calls[0][3])
    expect(kb).toContain('lbl:order_1') // N1 action buttons (phase 2)
    expect(kb).toContain('det:28412')
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

  // The customer note is a DELIBERATE exception to the no-PII-in-push rule
  // (operator decision, 2026-07-24). See format.ts / the telegram-ops skill.
  describe('customer note', () => {
    // Adds the order/cart/link resolution the note helper needs on top of the
    // notification container.
    const withNote = (opts: { orderNote?: string; cartNote?: string }) => {
      const notify = jest.fn().mockResolvedValue(true)
      const graph = jest.fn(async ({ entity }: { entity: string }) =>
        entity === 'order_cart'
          ? { data: [{ cart_id: 'cart_1' }] }
          : { data: [paidOrder] }
      )
      const container = {
        resolve: jest.fn((key: string) => {
          if (key === 'telegram_ops') return { notify, isConfigured: () => true }
          if (key === 'query') return { graph }
          if (key === 'order')
            return {
              retrieveOrder: async () => ({
                id: 'order_1',
                metadata: opts.orderNote ? { customer_note: opts.orderNote } : null,
              }),
            }
          if (key === 'cart')
            return {
              retrieveCart: async () => ({
                id: 'cart_1',
                metadata: opts.cartNote ? { customer_note: opts.cartNote } : null,
              }),
            }
          if (key === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
          return undefined
        }),
      } as any
      return { container, notify }
    }

    it('includes the note text in the push', async () => {
      const { container, notify } = withNote({ orderNote: 'Graag zonder bel bezorgen' })
      await notifyOrderPaidOnTelegram(container, 'order_1')
      const text = notify.mock.calls[0][2] as string
      expect(text).toContain('Customer note')
      expect(text).toContain('Graag zonder bel bezorgen')
    })

    it('falls back to the cart when the order copy has not landed yet', async () => {
      const { container, notify } = withNote({ cartNote: 'nog op de cart' })
      await notifyOrderPaidOnTelegram(container, 'order_1')
      expect(notify.mock.calls[0][2] as string).toContain('nog op de cart')
    })

    it('truncates a long note and escapes markup', async () => {
      const { container, notify } = withNote({ orderNote: `<b>${'x'.repeat(400)}` })
      await notifyOrderPaidOnTelegram(container, 'order_1')
      const text = notify.mock.calls[0][2] as string
      expect(text).toContain('&lt;b&gt;')
      expect(text).not.toContain('<b>x')
      expect(text).toContain('…')
      expect(text.length).toBeLessThan(600)
    })

    it('adds no note block when the customer left none', async () => {
      const { container, notify } = withNote({})
      await notifyOrderPaidOnTelegram(container, 'order_1')
      expect(notify.mock.calls[0][2] as string).not.toContain('Customer note')
    })
  })
})
