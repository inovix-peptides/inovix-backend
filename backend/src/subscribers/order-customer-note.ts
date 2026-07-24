import { Modules } from '@medusajs/framework/utils'
import type { IOrderModuleService } from '@medusajs/framework/types'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { customerNoteFromOrder, resolveOrderCustomerNote } from '../lib/customer-note'
import { withOrderWriteQueue } from '../lib/fulfillment-checklist-write'
import { Sentry } from '../lib/instrument'

/**
 * Copies the customer's checkout note from the cart onto the order.
 *
 * Medusa v2 creates orders with `metadata: null`, so without this the note
 * would only ever be reachable through the order<->cart link. Persisting it on
 * `order.metadata.customer_note` is what lets the Verzendstation queue, the
 * picklist route and the admin checklist widget show the note for free: they
 * already select `order.metadata`.
 *
 * Idempotent (a second run finds the note already there and returns) and it
 * never rethrows: a note is informational, it must not break order placement.
 * The write goes through the shared per-order queue so it cannot drop a
 * concurrent checklist write (or have its own note dropped by one).
 */
export default async function orderCustomerNoteHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id
  try {
    const note = await resolveOrderCustomerNote(container, orderId)
    if (!note) return

    const orderModule = container.resolve(Modules.ORDER) as IOrderModuleService
    await withOrderWriteQueue(orderId, async () => {
      // Re-read inside the queue so the merge is against fresh metadata.
      const order = await orderModule.retrieveOrder(orderId)
      // Already copied (retry, or a second order.placed): nothing to do.
      if (customerNoteFromOrder(order)) return

      const metadata = {
        ...((order.metadata ?? {}) as Record<string, unknown>),
        customer_note: note,
      }
      await orderModule.updateOrders([{ id: orderId, metadata } as never])
    })
  } catch (e) {
    const logger = container.resolve('logger')
    logger.error(
      `order-customer-note: failed for order ${orderId}: ${(e as Error).message}`
    )
    Sentry.captureException(e, {
      tags: { subscriber: 'order-customer-note' },
      extra: { orderId },
    })
  }
}

export const config: SubscriberConfig = {
  event: 'order.placed',
}
