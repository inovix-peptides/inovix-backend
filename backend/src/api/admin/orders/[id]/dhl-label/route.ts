import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { createDhlLabelForOrder } from "../../../../../lib/dhl-label"

// All label logic (guards, checklist gate, workflow, N5 notify) lives in
// src/lib/dhl-label.ts, shared with the Telegram bot's Create-label action.
// This route only maps the result union to HTTP.
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const r = await createDhlLabelForOrder(req.scope, req.params.id)
  switch (r.status) {
    case "not_found":
      res.status(404).json({ message: `Order ${req.params.id} not found` })
      return
    case "checklist_blocked":
      res.status(400).json({
        message:
          "Nog niet alle items zijn afgevinkt op de picklijst. Vink eerst elk item af in de verzendchecklist, of gebruik de override met reden.",
      })
      return
    case "exists":
      res.status(200).json({
        fulfillment_id: r.fulfillment_id,
        tracking_number: r.tracking_number,
        label_pdf_url: r.label_pdf_url,
        shipment_tracking_url: r.shipment_tracking_url,
        already_existed: true,
      })
      return
    case "created":
      res.status(201).json({
        fulfillment_id: r.fulfillment_id,
        tracking_number: r.tracking_number,
        label_pdf_url: r.label_pdf_url,
        shipment_tracking_url: r.shipment_tracking_url,
      })
      return
    case "invalid":
      res.status(r.httpStatus).json({ message: r.message, details: r.details })
      return
    default:
      res.status(500).json({
        message: "DHL label creation failed",
        details: r.message,
      })
  }
}
