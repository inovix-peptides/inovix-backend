import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { DHL_BOXES_MODULE } from "../../../modules/dhl-express-boxes"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve(DHL_BOXES_MODULE) as any
  const boxes = await service.listDhlBoxPresets({})
  res.json({ boxes })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = req.body as {
    name: string; length_cm: number; width_cm: number; height_cm: number; max_items: number
  }
  for (const k of ["name", "length_cm", "width_cm", "height_cm", "max_items"] as const) {
    if (body[k] === undefined || body[k] === null || body[k] === "") {
      return res.status(400).json({ error: `Field "${k}" is required` })
    }
  }
  const service = req.scope.resolve(DHL_BOXES_MODULE) as any
  const created = await service.createDhlBoxPresets(body)
  res.status(201).json({ box: created })
}
