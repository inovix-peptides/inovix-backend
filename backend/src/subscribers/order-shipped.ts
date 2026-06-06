import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { Sentry } from '../lib/instrument'
import { sendOrderShippedNotification } from './_helpers/send-order-shipped'

type ShipmentCreatedEventData = {
  id: string
  no_notification?: boolean
}

export default async function orderShippedHandler({
  event: { data },
  container,
}: SubscriberArgs<ShipmentCreatedEventData>) {
  const fulfillmentId = data.id

  try {
    await sendOrderShippedNotification(container, fulfillmentId, {
      noNotification: data.no_notification,
    })
  } catch (error) {
    const logger = container.resolve('logger')
    logger.error(
      `shipment.created: failed to send notification for fulfillment ${fulfillmentId}: ${(error as Error).message}`
    )
    Sentry.captureException(error, {
      tags: { subscriber: 'shipment.created' },
      extra: { fulfillmentId },
    })
  }
}

export const config: SubscriberConfig = {
  event: 'shipment.created',
}
