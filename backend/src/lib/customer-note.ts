import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'

import { noteFromMetadata } from '../admin/widgets/customer-note.logic'

/**
 * Customer order note ("klantopmerking"), server side.
 *
 * The storefront checkout stores the customer's free-text remark on the cart as
 * `cart.metadata.customer_note`. Orders do NOT inherit cart metadata (Medusa v2
 * creates orders with `metadata: null`), so `order-customer-note.ts` copies it
 * onto `order.metadata.customer_note` on `order.placed`. Readers that may run
 * BEFORE that copy lands (the Telegram subscribers fire on the same event) use
 * `resolveOrderCustomerNote`, which falls back to the originating cart through
 * the order<->cart link.
 *
 * The pure helpers live in `admin/widgets/customer-note.logic.ts` so the admin
 * bundle can share them; they are re-exported here so server code has one
 * import site.
 *
 * The note is addressed to Inovix. It is never sent to DHL (the label payload
 * is a fixed option whitelist, see `modules/dhl-parcel/service.ts`) and never
 * to the payment broker (only amount + currency cross that wire).
 */

export {
  customerNoteFromOrder,
  MAX_CUSTOMER_NOTE_LENGTH,
  noteFromMetadata,
  sanitizeCustomerNote,
  truncateCustomerNote,
} from '../admin/widgets/customer-note.logic'

/**
 * The note for an order. Checks `order.metadata.customer_note` first, then the
 * linked cart's metadata via the order_cart link entity. Never throws; returns
 * null when there is no note or anything goes wrong.
 */
export async function resolveOrderCustomerNote(
  container: { resolve: (key: string) => any },
  orderId: string
): Promise<string | null> {
  try {
    const orderModuleService = container.resolve(Modules.ORDER)
    const order = await orderModuleService.retrieveOrder(orderId, {
      select: ['id', 'metadata'],
    })
    const fromOrder = noteFromMetadata(order?.metadata)
    if (fromOrder) return fromOrder

    // Remote-query the order<->cart link entity (NOT a cross-module
    // query.graph field traversal) to find the cart the order came from.
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: links } = await query.graph({
      entity: 'order_cart',
      fields: ['cart_id'],
      filters: { order_id: orderId },
    })
    const cartId: string | undefined = links?.[0]?.cart_id
    if (!cartId) return null

    const cartModuleService = container.resolve(Modules.CART)
    const cart = await cartModuleService.retrieveCart(cartId, {
      select: ['id', 'metadata'],
    })
    return noteFromMetadata(cart?.metadata)
  } catch {
    return null
  }
}
