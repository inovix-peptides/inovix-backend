import type { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import { validateCreate } from './validate'

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve('dhl_parcel_boxes') as any
  const dhl_parcel_box_presets = await service.listDhlParcelBoxPresets({})
  res.json({ dhl_parcel_box_presets })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = req.body as Record<string, unknown>
  const errors = validateCreate(body)
  if (errors.length > 0) {
    return res.status(400).json({ message: 'Validation failed', errors })
  }
  const service = req.scope.resolve('dhl_parcel_boxes') as any
  const created = await service.createDhlParcelBoxPresets(body)
  res.status(201).json({ dhl_parcel_box_preset: created })
}
