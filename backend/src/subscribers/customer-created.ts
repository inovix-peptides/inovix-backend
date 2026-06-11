import { Modules } from '@medusajs/framework/utils'
import {
  ICustomerModuleService,
  INotificationModuleService,
  Logger,
} from '@medusajs/framework/types'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { EmailTemplates } from '../modules/email-notifications/templates'
import { Sentry } from '../lib/instrument'
import { resolveCustomerEmailLocale } from '../lib/email-locale'
import {
  CUSTOMER_WELCOME_I18N,
  FOOTER,
} from '../modules/email-notifications/templates/email-i18n'

const STOREFRONT_URL =
  process.env.STOREFRONT_URL?.replace(/\/$/, '') ?? 'https://inovix-peptides.nl'

export default async function customerCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const notificationModuleService: INotificationModuleService =
    container.resolve(Modules.NOTIFICATION)
  const customerModuleService: ICustomerModuleService = container.resolve(
    Modules.CUSTOMER
  )
  const logger: Logger = container.resolve('logger')

  try {
    const customer = await customerModuleService.retrieveCustomer(data.id)

    if (!customer.email) {
      logger.warn(
        `customer.created: customer ${data.id} has no email; skipping notification`
      )
      return
    }

    const locale = await resolveCustomerEmailLocale(container, customer.id)
    const t = CUSTOMER_WELCOME_I18N[locale] ?? CUSTOMER_WELCOME_I18N.nl
    const f = FOOTER[locale] ?? FOOTER.nl
    const replyTo = process.env.SUPPORT_EMAIL || process.env.CONTACT_EMAIL
    const greetingName = customer.first_name?.trim() || customer.email
    const productsUrl = `${STOREFRONT_URL}/products`
    const accountUrl = `${STOREFRONT_URL}/account`

    const textBody =
      `${t.heading}\n\n` +
      `${t.greeting} ${greetingName},\n\n` +
      `${t.body}\n\n` +
      `${t.howToOrder}:\n` +
      `${t.step1}\n` +
      `${t.step2}\n` +
      `${t.step3}\n\n` +
      `${t.shippingNote}\n\n` +
      `${t.browseButton}: ${productsUrl}\n` +
      `${t.accountNotePre}${accountUrl}${t.accountNotePost}\n\n` +
      `${f.disclaimerLead}${f.disclaimerBody}`

    await notificationModuleService.createNotifications({
      to: customer.email,
      channel: 'email',
      template: EmailTemplates.CUSTOMER_WELCOME,
      data: {
        emailOptions: {
          ...(replyTo ? { replyTo } : {}),
          subject: t.subject,
          text: textBody,
        },
        firstName: customer.first_name ?? null,
        email: customer.email,
        storefrontUrl: STOREFRONT_URL,
        locale,
        preview: t.preview,
      },
    })
  } catch (error) {
    logger.error(
      `customer.created: failed to send notification for ${data.id}: ${(error as Error).message}`
    )
    Sentry.captureException(error, {
      tags: { subscriber: 'customer.created' },
      extra: { customerId: data.id },
    })
  }
}

export const config: SubscriberConfig = {
  event: 'customer.created',
}
