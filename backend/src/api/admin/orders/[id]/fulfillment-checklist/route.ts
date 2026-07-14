import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type {
  IOrderModuleService,
  IUserModuleService,
  Logger,
} from "@medusajs/framework/types"

import {
  applyChecklistAction,
  parseChecklist,
  type ChecklistAction,
} from "../../../../../admin/widgets/order-fulfillment-checklist.logic"

// Serializes checklist writes per order. Two concurrent POSTs for the same
// order would otherwise both read the same metadata snapshot and the second
// write would silently drop the first one's tick. An in-process chain is
// sufficient because the backend runs as a single Railway instance.
const orderWriteChains = new Map<string, Promise<unknown>>()

function withOrderWriteQueue<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
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

// POST /admin/orders/:id/fulfillment-checklist
// Applies ONE checklist action (item tick, package-closed confirm, override)
// to order.metadata.fulfillment_checklist. The acting admin user is stamped
// server-side from the auth context so the audit trail cannot be spoofed by
// the client. Other metadata keys are preserved (merge, not replace).
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> => {
  const orderId = req.params.id
  const logger = req.scope.resolve("logger") as Logger

  const actorId = req.auth_context?.actor_id
  if (!actorId) {
    res.status(401).json({ message: "Niet ingelogd." })
    return
  }

  const action = (req.body ?? {}) as ChecklistAction
  const orderModule = req.scope.resolve(Modules.ORDER) as IOrderModuleService
  const userModule = req.scope.resolve(Modules.USER) as IUserModuleService

  try {
    const outcome = await withOrderWriteQueue(orderId, async () => {
      const [order, user] = await Promise.all([
        orderModule.retrieveOrder(orderId),
        userModule.retrieveUser(actorId).catch(() => null),
      ])
      const byName = user
        ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email || actorId
        : actorId

      const state = parseChecklist(order.metadata)
      const result = applyChecklistAction(
        state,
        action,
        { by_id: actorId, by_name: byName },
        new Date().toISOString()
      )
      if ("error" in result) {
        return { error: result.error } as const
      }

      const metadata = {
        ...((order.metadata ?? {}) as Record<string, unknown>),
        fulfillment_checklist: result.next,
      }
      await orderModule.updateOrders([{ id: orderId, metadata } as never])

      return { next: result.next } as const
    })

    if ("error" in outcome) {
      res.status(400).json({ message: outcome.error })
      return
    }

    res.status(200).json({ fulfillment_checklist: outcome.next })
  } catch (err) {
    logger.error(
      `admin fulfillment-checklist: order ${orderId}: ${(err as Error).message}`
    )
    res.status(500).json({ message: "Opslaan mislukt." })
  }
}
