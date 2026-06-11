import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import {
  INotificationModuleService,
  Logger,
} from '@medusajs/framework/types'
import { EmailTemplates } from '../../modules/email-notifications/templates'
import { resolveOrderEmailLocale } from '../../lib/email-locale'
import { ORDER_SHIPPED_I18N } from '../../modules/email-notifications/templates/email-i18n'

export async function sendOrderShippedNotification(
  container: any,
  fulfillmentId: string,
  opts?: { noNotification?: boolean }
): Promise<{ sent: boolean }> {
  const notificationModuleService: INotificationModuleService =
    container.resolve(Modules.NOTIFICATION)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger: Logger = container.resolve('logger')

  if (opts?.noNotification) {
    logger.info(
      `sendOrderShippedNotification: no_notification flag set for fulfillment ${fulfillmentId}; skipping`
    )
    return { sent: false }
  }

  const { data: orders } = await query.graph({
    entity: 'order',
    filters: { 'fulfillments.id': fulfillmentId },
    fields: [
      'id',
      'display_id',
      'email',
      'currency_code',
      'shipping_address.*',
      'items.id',
      'items.title',
      'items.product_title',
      'items.variant_title',
      'fulfillments.id',
      'fulfillments.shipped_at',
      'fulfillments.labels.tracking_number',
      'fulfillments.labels.tracking_url',
      'fulfillments.labels.label_url',
      'fulfillments.items.id',
      'fulfillments.items.line_item_id',
      'fulfillments.items.quantity',
    ],
  })

  const order = orders?.[0]

  if (!order) {
    logger.warn(
      `sendOrderShippedNotification: no order found for fulfillment ${fulfillmentId}; skipping notification`
    )
    return { sent: false }
  }

  if (!order.email) {
    logger.warn(
      `sendOrderShippedNotification: order ${order.id} has no email; skipping notification`
    )
    return { sent: false }
  }

  if (!order.shipping_address) {
    logger.warn(
      `sendOrderShippedNotification: order ${order.id} has no shipping_address; skipping notification`
    )
    return { sent: false }
  }

  const fulfillment = order.fulfillments?.find(
    (f: { id: string }) => f.id === fulfillmentId
  )

  if (!fulfillment) {
    logger.warn(
      `sendOrderShippedNotification: fulfillment ${fulfillmentId} not found on order ${order.id}; skipping`
    )
    return { sent: false }
  }

  const fulfillmentLineItemIds = new Set(
    (fulfillment.items ?? [])
      .map((fi: { line_item_id?: string | null }) => fi.line_item_id)
      .filter((id: string | null | undefined): id is string => Boolean(id))
  )

  const shipmentItems = (order.items ?? [])
    .filter((item: { id: string }) => fulfillmentLineItemIds.has(item.id))
    .map(
      (item: {
        id: string
        product_title?: string | null
        variant_title?: string | null
        title?: string | null
      }) => {
        const fItem = (fulfillment.items ?? []).find(
          (fi: { line_item_id?: string | null }) =>
            fi.line_item_id === item.id
        )
        const title = item.product_title
          ? item.variant_title
            ? `${item.product_title} | ${item.variant_title}`
            : item.product_title
          : item.title ?? 'Artikel'
        return {
          id: item.id,
          title,
          quantity: fItem?.quantity ?? 0,
        }
      }
    )

  const labels = (fulfillment.labels ?? []).map(
    (l: {
      tracking_number?: string | null
      tracking_url?: string | null
      label_url?: string | null
    }) => ({
      tracking_number: l.tracking_number ?? null,
      tracking_url: l.tracking_url ?? null,
      label_url: l.label_url ?? null,
    })
  )

  const locale = await resolveOrderEmailLocale(container, order.id)
  const t = ORDER_SHIPPED_I18N[locale]
  const replyTo = process.env.SUPPORT_EMAIL || process.env.CONTACT_EMAIL

  await notificationModuleService.createNotifications({
    to: order.email,
    channel: 'email',
    template: EmailTemplates.ORDER_SHIPPED,
    idempotency_key: `order-shipped-${fulfillmentId}`,
    data: {
      emailOptions: {
        ...(replyTo ? { replyTo } : {}),
        subject: t.subject(order.display_id),
      },
      order: {
        id: order.id,
        display_id: order.display_id,
        email: order.email,
        currency_code: order.currency_code,
      },
      shippingAddress: order.shipping_address,
      labels,
      items: shipmentItems,
      shippedAt: fulfillment.shipped_at ?? null,
      locale,
      preview: t.preview,
    },
  })

  return { sent: true }
}
