import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import type { Logger } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const PROVIDER_ID = "pp_via_broker_via_broker"

function ack(res: MedusaResponse, status = 200): void {
  res.status(status).type("text/plain").send("OK")
}

// Receives POSTs the external-payments broker pushes through the neutral
// relay domain. The Medusa payment module re-validates the HMAC via the
// provider's `getWebhookActionAndData`, and updates the matching payment
// session/collection.
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const paymentModule = req.scope.resolve(Modules.PAYMENT)
  const logger = req.scope.resolve("logger") as Logger

  try {
    await paymentModule.getWebhookActionAndData({
      provider: PROVIDER_ID.replace(/^pp_/, ""),
      payload: {
        data: (req.body ?? {}) as Record<string, unknown>,
        rawData: req.rawBody as Buffer,
        headers: req.headers as Record<string, string>,
      },
    })
    ack(res)
  } catch (err) {
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
