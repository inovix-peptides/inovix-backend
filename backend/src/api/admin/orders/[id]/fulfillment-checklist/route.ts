import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { IUserModuleService, Logger } from "@medusajs/framework/types"

import type { ChecklistAction } from "../../../../../admin/widgets/order-fulfillment-checklist.logic"
import { applyChecklistUpdate } from "../../../../../lib/fulfillment-checklist-write"

// POST /admin/orders/:id/fulfillment-checklist
// Applies ONE checklist action (item tick, package-closed confirm, override)
// to order.metadata.fulfillment_checklist. The acting admin user is stamped
// server-side from the auth context so the audit trail cannot be spoofed by
// the client. The write itself goes through the shared per-order queue in
// lib/fulfillment-checklist-write.ts (also used by the Telegram bot), so
// concurrent writers never drop each other's ticks.
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
  const userModule = req.scope.resolve(Modules.USER) as IUserModuleService

  try {
    const user = await userModule.retrieveUser(actorId).catch(() => null)
    const byName = user
      ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email || actorId
      : actorId

    const outcome = await applyChecklistUpdate(req.scope, orderId, action, {
      by_id: actorId,
      by_name: byName,
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
