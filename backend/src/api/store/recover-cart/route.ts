import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

const PROVIDER_ID = "pp_via_broker_via_broker"

/**
 * GET /store/recover-cart?ref=pay_xxx
 *
 * Resolves the Medusa cart id from a broker payment `ref`. The post-payment
 * return page relies on this when the customer comes back in a different
 * browser context (typically the iDEAL banking app on mobile), where the
 * localStorage/sessionStorage cart id from the original checkout tab is gone.
 * The `ref` is always present in the return URL, so it is the only reliable
 * handle we have at that point.
 *
 * The cart id is read off the via_broker payment session's `data` (set at
 * initiatePayment). Nothing here is sent to Mollie; this is purely Inovix-side.
 *
 * 200 { cart_id }            — resolved
 * 400 { message }            — missing/invalid ref
 * 404 { message }            — no matching session / no cart id on it
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const ref =
    typeof req.query.ref === "string" ? req.query.ref.trim() : undefined

  if (!ref || !ref.startsWith("pay_")) {
    return res.status(400).json({ message: "Missing or invalid ref" })
  }

  try {
    const paymentModule = req.scope.resolve(Modules.PAYMENT)
    // The return fires within minutes of payment, so the matching session is
    // among the most recent. Bound the scan and match the ref in memory
    // (data.ref is a jsonb field, not a first-class filterable column).
    const sessions = await paymentModule.listPaymentSessions(
      { provider_id: PROVIDER_ID },
      { select: ["id", "data"], take: 500, order: { created_at: "DESC" } }
    )

    const match = sessions.find(
      (s) => (s.data as { ref?: string } | undefined)?.ref === ref
    )
    const cartId = (match?.data as { cart_id?: string } | undefined)?.cart_id

    if (!cartId) {
      return res.status(404).json({ message: "Cart not found for ref" })
    }

    return res.json({ cart_id: cartId })
  } catch (err) {
    // Never surface a 500 on the recovery path | degrade to "not found" so the
    // return page can fall back to its existing error handling.
    const message = err instanceof Error ? err.message : String(err)
    req.scope.resolve("logger").warn(`recover-cart failed for ${ref}: ${message}`)
    return res.status(404).json({ message: "Cart not found for ref" })
  }
}
