jest.mock('../../../modules/email-notifications/templates', () => ({
  EmailTemplates: {
    ORDER_SHIPPED: 'order-shipped',
  },
}))

jest.mock('@medusajs/framework/utils', () => ({
  ContainerRegistrationKeys: {
    QUERY: 'query',
  },
  Modules: {
    NOTIFICATION: 'notificationModuleService',
  },
}))

import { sendOrderShippedNotification } from '../send-order-shipped'

const FULFILLMENT_ID = 'ful_abc123'
const ORDER_ID = 'order_xyz'

const mockFulfillment = {
  id: FULFILLMENT_ID,
  shipped_at: '2026-06-06T10:00:00Z',
  labels: [
    {
      tracking_number: 'JVGL01234567890',
      tracking_url: 'https://track.dhl.com/?trackingNumber=JVGL01234567890',
      label_url: 'https://r2.example.com/label.pdf',
    },
  ],
  items: [{ id: 'fi_1', line_item_id: 'item_1', quantity: 2 }],
}

const mockOrder = {
  id: ORDER_ID,
  display_id: 'INV-001',
  email: 'buyer@example.com',
  currency_code: 'EUR',
  shipping_address: {
    first_name: 'Jan',
    last_name: 'de Vries',
    address_1: 'Kerkstraat 1',
    city: 'Amsterdam',
    postal_code: '1012AA',
    country_code: 'NL',
  },
  items: [
    {
      id: 'item_1',
      product_title: 'BPC-157',
      variant_title: '5mg',
      title: 'BPC-157 5mg',
    },
  ],
  fulfillments: [mockFulfillment],
}

function makeContainer(overrides: Record<string, any> = {}) {
  const notificationService = {
    createNotifications: jest.fn().mockResolvedValue(undefined),
    ...overrides.notificationService,
  }
  const query = {
    graph: jest
      .fn()
      .mockResolvedValue({ data: [mockOrder] }),
    ...overrides.query,
  }
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    ...overrides.logger,
  }

  return {
    resolve: jest.fn((key: string) => {
      if (key === 'notificationModuleService') return notificationService
      if (key === 'query') return query
      if (key === 'logger') return logger
      throw new Error(`Unknown key: ${key}`)
    }),
    _notificationService: notificationService,
    _query: query,
    _logger: logger,
  }
}

describe('sendOrderShippedNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.SUPPORT_EMAIL
    delete process.env.CONTACT_EMAIL
  })

  it('calls createNotifications with ORDER_SHIPPED template and correct data', async () => {
    const container = makeContainer()
    const result = await sendOrderShippedNotification(container, FULFILLMENT_ID)

    expect(result).toEqual({ sent: true })
    expect(container._notificationService.createNotifications).toHaveBeenCalledTimes(1)

    const call = container._notificationService.createNotifications.mock.calls[0][0]
    expect(call.template).toBe('order-shipped')
    expect(call.to).toBe('buyer@example.com')
    expect(call.channel).toBe('email')
  })

  it('uses the idempotency_key order-shipped-<fulfillmentId>', async () => {
    const container = makeContainer()
    await sendOrderShippedNotification(container, FULFILLMENT_ID)

    const call = container._notificationService.createNotifications.mock.calls[0][0]
    expect(call.idempotency_key).toBe(`order-shipped-${FULFILLMENT_ID}`)
  })

  it('passes the correct labels to the notification data', async () => {
    const container = makeContainer()
    await sendOrderShippedNotification(container, FULFILLMENT_ID)

    const call = container._notificationService.createNotifications.mock.calls[0][0]
    expect(call.data.labels).toEqual([
      {
        tracking_number: 'JVGL01234567890',
        tracking_url: 'https://track.dhl.com/?trackingNumber=JVGL01234567890',
        label_url: 'https://r2.example.com/label.pdf',
      },
    ])
  })

  it('assembles shipmentItems from the fulfillment items', async () => {
    const container = makeContainer()
    await sendOrderShippedNotification(container, FULFILLMENT_ID)

    const call = container._notificationService.createNotifications.mock.calls[0][0]
    expect(call.data.items).toEqual([
      { id: 'item_1', title: 'BPC-157 | 5mg', quantity: 2 },
    ])
  })

  it('returns { sent: false } and skips send when noNotification is true', async () => {
    const container = makeContainer()
    const result = await sendOrderShippedNotification(container, FULFILLMENT_ID, {
      noNotification: true,
    })

    expect(result).toEqual({ sent: false })
    expect(container._notificationService.createNotifications).not.toHaveBeenCalled()
    expect(container._logger.info).toHaveBeenCalledWith(
      expect.stringContaining('no_notification flag set')
    )
  })

  it('returns { sent: false } when no order is found for the fulfillment', async () => {
    const container = makeContainer({
      query: { graph: jest.fn().mockResolvedValue({ data: [] }) },
    })
    const result = await sendOrderShippedNotification(container, FULFILLMENT_ID)

    expect(result).toEqual({ sent: false })
    expect(container._notificationService.createNotifications).not.toHaveBeenCalled()
    expect(container._logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no order found')
    )
  })

  it('returns { sent: false } when the order has no email', async () => {
    const orderWithoutEmail = { ...mockOrder, email: undefined }
    const container = makeContainer({
      query: {
        graph: jest.fn().mockResolvedValue({ data: [orderWithoutEmail] }),
      },
    })
    const result = await sendOrderShippedNotification(container, FULFILLMENT_ID)

    expect(result).toEqual({ sent: false })
    expect(container._notificationService.createNotifications).not.toHaveBeenCalled()
    expect(container._logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('has no email')
    )
  })

  it('returns { sent: false } when the order has no shipping_address', async () => {
    const orderWithoutAddress = { ...mockOrder, shipping_address: null }
    const container = makeContainer({
      query: {
        graph: jest.fn().mockResolvedValue({ data: [orderWithoutAddress] }),
      },
    })
    const result = await sendOrderShippedNotification(container, FULFILLMENT_ID)

    expect(result).toEqual({ sent: false })
    expect(container._notificationService.createNotifications).not.toHaveBeenCalled()
    expect(container._logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('has no shipping_address')
    )
  })

  it('returns { sent: false } when the fulfillment is not found on the order', async () => {
    const orderDifferentFulfillment = {
      ...mockOrder,
      fulfillments: [{ ...mockFulfillment, id: 'ful_other' }],
    }
    const container = makeContainer({
      query: {
        graph: jest
          .fn()
          .mockResolvedValue({ data: [orderDifferentFulfillment] }),
      },
    })
    const result = await sendOrderShippedNotification(container, FULFILLMENT_ID)

    expect(result).toEqual({ sent: false })
    expect(container._notificationService.createNotifications).not.toHaveBeenCalled()
    expect(container._logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not found on order')
    )
  })

  it('includes replyTo from SUPPORT_EMAIL env when set', async () => {
    process.env.SUPPORT_EMAIL = 'support@inovix-peptides.nl'
    const container = makeContainer()
    await sendOrderShippedNotification(container, FULFILLMENT_ID)

    const call = container._notificationService.createNotifications.mock.calls[0][0]
    expect(call.data.emailOptions.replyTo).toBe('support@inovix-peptides.nl')
    delete process.env.SUPPORT_EMAIL
  })

  it('sets the Dutch subject line with display_id', async () => {
    const container = makeContainer()
    await sendOrderShippedNotification(container, FULFILLMENT_ID)

    const call = container._notificationService.createNotifications.mock.calls[0][0]
    expect(call.data.emailOptions.subject).toBe(
      'Uw bestelling is onderweg | Inovix INV-001'
    )
  })
})
