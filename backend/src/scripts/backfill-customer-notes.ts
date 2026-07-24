import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { customerNoteFromOrder, sanitizeCustomerNote } from "../lib/customer-note"

/**
 * Backfills `order.metadata.customer_note` for orders placed before the
 * customer-note feature shipped (2026-07-24).
 *
 *   medusa exec ./src/scripts/backfill-customer-notes.ts
 *   BACKFILL_NOTES_DRY_RUN=1 medusa exec ./src/scripts/backfill-customer-notes.ts
 *
 * Those orders carry `metadata: null`, but the note the customer typed still
 * sits on the originating cart (under `customer_note`, or `delivery_notes` for
 * the older label). This walks the order_cart link table, so it only touches
 * orders that actually have a note to copy.
 *
 * IDEMPOTENT: an order that already has a note is skipped, and the write merges
 * into existing metadata rather than replacing it. Safe to re-run.
 *
 * NOTE: `medusa exec` against prod loads **\/*.ts including test files
 * ("jest is not defined"); move test files aside first if that bites.
 */
export default async function backfillCustomerNotes({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const orderModule = container.resolve(Modules.ORDER) as any
  const cartModule = container.resolve(Modules.CART) as any

  const dryRun = ["1", "true", "yes"].includes(
    String(process.env.BACKFILL_NOTES_DRY_RUN ?? "").toLowerCase()
  )

  // Every order<->cart pair. At Inovix volumes this is a small table; if it
  // ever grows past a few thousand rows this wants pagination.
  const { data: links } = await query.graph({
    entity: "order_cart",
    fields: ["order_id", "cart_id"],
  })

  let scanned = 0
  let filled = 0
  let skipped = 0
  let failed = 0

  for (const link of (links ?? []) as Array<{ order_id?: string; cart_id?: string }>) {
    const orderId = link?.order_id
    const cartId = link?.cart_id
    if (!orderId || !cartId) continue
    scanned++

    try {
      const cart = await cartModule.retrieveCart(cartId, { select: ["id", "metadata"] })
      const bag = (cart?.metadata ?? {}) as Record<string, unknown>
      const note =
        sanitizeCustomerNote(bag.customer_note) ?? sanitizeCustomerNote(bag.delivery_notes)
      if (!note) continue

      const order = await orderModule.retrieveOrder(orderId, { select: ["id", "metadata"] })
      if (customerNoteFromOrder(order)) {
        skipped++
        continue
      }

      if (dryRun) {
        logger.info(`[dry-run] would set customer_note on ${orderId}: ${note.slice(0, 60)}`)
        filled++
        continue
      }

      await orderModule.updateOrders([
        {
          id: orderId,
          metadata: {
            ...((order?.metadata ?? {}) as Record<string, unknown>),
            customer_note: note,
          },
        },
      ])
      filled++
    } catch (e) {
      failed++
      logger.warn(`backfill-customer-notes: order ${orderId} failed: ${(e as Error).message}`)
    }
  }

  logger.info(
    `backfill-customer-notes${dryRun ? " (dry run)" : ""}: scanned ${scanned} linked carts, ` +
      `filled ${filled}, already had a note ${skipped}, failed ${failed}.`
  )
}
