import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import type { Logger } from "@medusajs/framework/types"
import { Modules, PaymentActions } from "@medusajs/framework/utils"
import { processPaymentWorkflowId } from "@medusajs/medusa/core-flows"

const PROVIDER_ID = "pp_via_broker_via_broker"

function ack(res: MedusaResponse, status = 200): void {
  res.status(status).type("text/plain").send("OK")
}

// Receives POSTs the external-payments broker pushes through the neutral
// relay domain. The provider's `getWebhookActionAndData` verifies the HMAC
// and maps the broker status to a payment action; we then run Medusa's
// processPaymentWorkflow exactly like the native payment-webhook subscriber
// does, so a captured/authorized callback authorizes + captures the payment
// and completes the cart server-side. The customer no longer has to make it
// back to /checkout/return for the order to exist; the reconcile cron stays
// as the safety net behind this.
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const paymentModule = req.scope.resolve(Modules.PAYMENT)
  const logger = req.scope.resolve("logger") as Logger

  try {
    const event = await paymentModule.getWebhookActionAndData({
      provider: PROVIDER_ID.replace(/^pp_/, ""),
      payload: {
        data: (req.body ?? {}) as Record<string, unknown>,
        rawData: req.rawBody as Buffer,
        headers: req.headers as Record<string, string>,
      },
    })

    // Mirror @medusajs/medusa's payment-webhook subscriber: only act on
    // captured / authorized / pending. Failed and cancelled callbacks change
    // nothing on the Inovix side (the cart simply never completes and the
    // Mollie payment expires), and not_supported covers HMAC rejections.
    const action = event?.action
    const shouldProcess =
      !!event?.data &&
      action !== PaymentActions.NOT_SUPPORTED &&
      action !== PaymentActions.CANCELED &&
      action !== PaymentActions.FAILED &&
      action !== PaymentActions.REQUIRES_MORE

    if (shouldProcess) {
      const wfEngine = req.scope.resolve(Modules.WORKFLOW_ENGINE)
      await wfEngine.run(processPaymentWorkflowId, { input: event })
      logger.info(
        `broker-callback processed action=${String(action)} session=${String(
          (event.data as { session_id?: string }).session_id ?? ""
        )}`
      )
    }

    ack(res)
  } catch (err) {
    // Always 200: the broker's retry schedule should not hammer a handler
    // bug, replays are idempotent, and the reconcile cron recovers anything
    // missed here.
    logger.error(`broker-callback handling failed: ${(err as Error).message}`)
    ack(res)
  }
}

export async function GET(
  _req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  ack(res)
}
