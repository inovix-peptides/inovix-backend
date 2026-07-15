import { config as tgOrderPlacedConfig } from '../tg-order-placed'
import { config as tgPaymentCapturedConfig } from '../tg-payment-captured'
import { config as tgPaymentFailedConfig } from '../tg-payment-failed'
import { config as tgOrderRefundedConfig } from '../tg-order-refunded'
import { config as tgOrderCanceledConfig } from '../tg-order-canceled'
import { config as tgShipmentCreatedConfig } from '../tg-shipment-created'

import { config as orderPlacedConfig } from '../order-placed'
import { config as paymentCapturedConfig } from '../payment-captured'
import { config as paymentFailedConfig } from '../payment-failed'
import { config as orderRefundedConfig } from '../order-refunded'
import { config as orderCancelledConfig } from '../order-cancelled'
import { config as orderShippedConfig } from '../order-shipped'

describe('tg-* subscriber event names mirror their email counterparts', () => {
  it('tg-order-placed matches order-placed', () => {
    expect(tgOrderPlacedConfig.event).toBe(orderPlacedConfig.event)
  })

  it('tg-payment-captured matches payment-captured', () => {
    expect(tgPaymentCapturedConfig.event).toBe(paymentCapturedConfig.event)
  })

  it('tg-payment-failed matches payment-failed', () => {
    expect(tgPaymentFailedConfig.event).toBe(paymentFailedConfig.event)
  })

  it('tg-order-refunded matches order-refunded', () => {
    expect(tgOrderRefundedConfig.event).toBe(orderRefundedConfig.event)
  })

  it('tg-order-canceled matches order-cancelled', () => {
    expect(tgOrderCanceledConfig.event).toBe(orderCancelledConfig.event)
  })

  it('tg-shipment-created matches order-shipped', () => {
    expect(tgShipmentCreatedConfig.event).toBe(orderShippedConfig.event)
  })
})
