import { Modules } from '@medusajs/framework/utils'
import {
  INotificationModuleService,
  IOrderModuleService,
  Logger,
} from '@medusajs/framework/types'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { EmailTemplates } from '../modules/email-notifications/templates'
import { Sentry } from '../lib/instrument'
import { resolveOrderEmailLocale } from '../lib/email-locale'
import { ORDER_CANCELLED_I18N } from '../modules/email-notifications/templates/email-i18n'

export default async function orderCancelledHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const notificationModuleService: INotificationModuleService = container.resolve(
    Modules.NOTIFICATION
  )
  const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)
  const logger: Logger = container.resolve('logger')

  try {
    const order = await orderModuleService.retrieveOrder(data.id, {
      relations: ['items', 'summary', 'shipping_address'],
    })

    if (!order.email) {
      logger.warn(
        `order.canceled: order ${data.id} has no email; skipping notification`
      )
      return
    }

    if (!order.shipping_address) {
      logger.warn(
        `order.canceled: order ${data.id} has no shipping_address; skipping notification`
      )
      return
    }

    const locale = await resolveOrderEmailLocale(container, order.id)
    const t = ORDER_CANCELLED_I18N[locale] ?? ORDER_CANCELLED_I18N.nl
    const replyTo = process.env.SUPPORT_EMAIL || process.env.CONTACT_EMAIL
    const addr = order.shipping_address
    const currency = (order.currency_code ?? 'EUR').toUpperCase()
    const itemsText = (order.items ?? [])
      .map((item: any) => {
        const variant = item.variant_title ? ` | ${item.variant_title}` : ''
        const lineTotal = ((item.unit_price ?? 0) * (item.quantity ?? 0)).toFixed(2)
        return `- ${item.product_title}${variant} × ${item.quantity} (${lineTotal} ${currency})`
      })
      .join('\n')
    const refundValue = order.summary?.raw_current_order_total?.value
    const refundText =
      refundValue != null ? `${Number(refundValue).toFixed(2)} ${currency}` : ''

    const textBody =
      `${t.heading}\n` +
      `${t.orderNumber} #${order.display_id}\n\n` +
      `${t.greeting} ${addr.first_name} ${addr.last_name},\n\n` +
      `${t.body(order.display_id)}\n\n` +
      `${t.cancelledItems}:\n${itemsText}\n\n` +
      (refundText
        ? `${t.refundAmount}: ${refundText} (${t.inclVat})\n\n`
        : '') +
      `${t.whenHeading}\n` +
      `${t.whenBody1}\n` +
      `${t.whenBody2}`

    await notificationModuleService.createNotifications({
      to: order.email,
      channel: 'email',
      template: EmailTemplates.ORDER_CANCELLED,
      data: {
        emailOptions: {
          ...(replyTo ? { replyTo } : {}),
          subject: t.subject(order.display_id),
          text: textBody,
        },
        order,
        shippingAddress: order.shipping_address,
        locale,
        preview: t.preview,
      },
    })
  } catch (error) {
    logger.error(
      `order.canceled: failed to send notification for ${data.id}: ${(error as Error).message}`
    )
    Sentry.captureException(error, {
      tags: { subscriber: 'order.canceled' },
      extra: { orderId: data.id },
    })
  }
}

export const config: SubscriberConfig = {
  event: 'order.canceled',
}
