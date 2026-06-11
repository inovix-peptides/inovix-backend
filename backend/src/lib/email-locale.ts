import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'

/**
 * Locale resolution for transactional emails.
 *
 * The storefront stores the visitor's UI language (NEXT_LOCALE cookie) on the
 * cart as `cart.metadata.locale` during checkout, and on the customer as
 * `customer.metadata.locale` at registration. Orders do NOT inherit cart
 * metadata (Medusa v2 creates orders with `metadata: null`), so order-scoped
 * emails resolve the original cart through the order<->cart link module and
 * read the locale from there. Everything defaults to Dutch.
 */

export type EmailLocale = 'nl' | 'de' | 'en'

export const EMAIL_LOCALES: readonly EmailLocale[] = ['nl', 'de', 'en'] as const

export const DEFAULT_EMAIL_LOCALE: EmailLocale = 'nl'

export function normalizeEmailLocale(value: unknown): EmailLocale {
  return typeof value === 'string' &&
    (EMAIL_LOCALES as readonly string[]).includes(value)
    ? (value as EmailLocale)
    : DEFAULT_EMAIL_LOCALE
}

function metadataLocale(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object') {
    const value = (metadata as Record<string, unknown>).locale
    if (typeof value === 'string' && value) return value
  }
  return null
}

/**
 * Locale for an order-scoped email (confirmation, shipped, cancelled,
 * refunded). Checks `order.metadata.locale` first (future-proofing), then the
 * linked cart's `metadata.locale` via the order_cart link entity. Never
 * throws; falls back to Dutch.
 */
export async function resolveOrderEmailLocale(
  container: { resolve: (key: string) => any },
  orderId: string
): Promise<EmailLocale> {
  try {
    const orderModuleService = container.resolve(Modules.ORDER)
    const order = await orderModuleService.retrieveOrder(orderId, {
      select: ['id', 'metadata'],
    })
    const fromOrder = metadataLocale(order?.metadata)
    if (fromOrder) return normalizeEmailLocale(fromOrder)

    // Remote-query the order<->cart link entity (NOT a cross-module
    // query.graph field traversal) to find the cart the order came from.
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: links } = await query.graph({
      entity: 'order_cart',
      fields: ['cart_id'],
      filters: { order_id: orderId },
    })
    const cartId: string | undefined = links?.[0]?.cart_id
    if (!cartId) return DEFAULT_EMAIL_LOCALE

    return resolveCartEmailLocale(container, cartId)
  } catch {
    return DEFAULT_EMAIL_LOCALE
  }
}

/** Locale stored on a cart by the storefront checkout. Never throws. */
export async function resolveCartEmailLocale(
  container: { resolve: (key: string) => any },
  cartId: string
): Promise<EmailLocale> {
  try {
    const cartModuleService = container.resolve(Modules.CART)
    const cart = await cartModuleService.retrieveCart(cartId, {
      select: ['id', 'metadata'],
    })
    return normalizeEmailLocale(metadataLocale(cart?.metadata))
  } catch {
    return DEFAULT_EMAIL_LOCALE
  }
}

/** Locale stored on a customer at registration. Never throws. */
export async function resolveCustomerEmailLocale(
  container: { resolve: (key: string) => any },
  customerId: string
): Promise<EmailLocale> {
  try {
    const customerModuleService = container.resolve(Modules.CUSTOMER)
    const customer = await customerModuleService.retrieveCustomer(customerId, {
      select: ['id', 'metadata'],
    })
    return normalizeEmailLocale(metadataLocale(customer?.metadata))
  } catch {
    return DEFAULT_EMAIL_LOCALE
  }
}

/** Locale for a customer looked up by email (password reset flow). */
export async function resolveCustomerEmailLocaleByEmail(
  container: { resolve: (key: string) => any },
  email: string
): Promise<EmailLocale> {
  try {
    const customerModuleService = container.resolve(Modules.CUSTOMER)
    const customers = await customerModuleService.listCustomers(
      { email },
      { select: ['id', 'metadata'], take: 1 }
    )
    return normalizeEmailLocale(metadataLocale(customers?.[0]?.metadata))
  } catch {
    return DEFAULT_EMAIL_LOCALE
  }
}
