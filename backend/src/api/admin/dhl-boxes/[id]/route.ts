import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { DHL_BOXES_MODULE } from "../../../../modules/dhl-express-boxes"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve(DHL_BOXES_MODULE) as any
  const box = await service.retrieveDhlBoxPreset(req.params.id)
  if (!box) return res.status(404).json({ error: "Not found" })
  res.json({ box })
}

export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve(DHL_BOXES_MODULE) as any
  const updated = await service.updateDhlBoxPresets({ id: req.params.id, ...(req.body as object) })
  res.json({ box: updated })
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve(DHL_BOXES_MODULE) as any
  await service.deleteDhlBoxPresets(req.params.id)
  res.status(204).end()
}
