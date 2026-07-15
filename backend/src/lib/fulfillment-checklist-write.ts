import { Modules } from "@medusajs/framework/utils"
import type { IOrderModuleService, MedusaContainer } from "@medusajs/framework/types"

import {
  applyChecklistAction,
  parseChecklist,
  type ChecklistAction,
  type ChecklistActor,
  type ChecklistState,
} from "../admin/widgets/order-fulfillment-checklist.logic"

// Serializes checklist writes per order. Two concurrent writers (admin widget,
// Telegram bot, the dhl-label override) would otherwise read the same metadata
// snapshot and the second write would silently drop the first one's tick. An
// in-process chain is sufficient because the backend runs as a single Railway
// instance. Extracted from the fulfillment-checklist route so EVERY checklist
// writer shares the same queue.
const orderWriteChains = new Map<string, Promise<unknown>>()

export function withOrderWriteQueue<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
  const prev = orderWriteChains.get(orderId) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  const marker = run.then(
    () => undefined,
    () => undefined
  )
  orderWriteChains.set(orderId, marker)
  void marker.then(() => {
    if (orderWriteChains.get(orderId) === marker) orderWriteChains.delete(orderId)
  })
  return run
}

export type ChecklistUpdateResult = { next: ChecklistState } | { error: string }

// Apply ONE checklist action to order.metadata.fulfillment_checklist inside
// the per-order write queue. Other metadata keys are preserved (merge, not
// replace). Callers supply the already-resolved actor (the admin route stamps
// the auth user; the bot stamps tg:<telegram_user_id>).
export async function applyChecklistUpdate(
  container: MedusaContainer,
  orderId: string,
  action: ChecklistAction,
  actor: ChecklistActor
): Promise<ChecklistUpdateResult> {
  const orderModule = container.resolve(Modules.ORDER) as IOrderModuleService
  return withOrderWriteQueue(orderId, async () => {
    const order = await orderModule.retrieveOrder(orderId)
    const state = parseChecklist(order.metadata)
    const result = applyChecklistAction(state, action, actor, new Date().toISOString())
    if ("error" in result) return result

    const metadata = {
      ...((order.metadata ?? {}) as Record<string, unknown>),
      fulfillment_checklist: result.next,
    }
    await orderModule.updateOrders([{ id: orderId, metadata } as never])
    return { next: result.next }
  })
}
