import type { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import { validateUpdate } from '../validate'

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve('dhl_parcel_boxes') as any
  // retrieveDhlParcelBoxPreset throws MedusaError(NOT_FOUND) when the id is missing;
  // Medusa's error handler maps that to HTTP 404, so no explicit guard is needed.
  const preset = await service.retrieveDhlParcelBoxPreset(req.params.id)
  res.json({ dhl_parcel_box_preset: preset })
}

export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = req.body as Record<string, unknown>
  const errors = validateUpdate(body)
  if (errors.length > 0) {
    return res.status(400).json({ message: 'Validation failed', errors })
  }
  const service = req.scope.resolve('dhl_parcel_boxes') as any
  // id from the URL param is set LAST so it always wins: a body-supplied id cannot retarget another record.
  const updated = await service.updateDhlParcelBoxPresets({ ...body, id: req.params.id })
  res.json({ dhl_parcel_box_preset: updated })
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve('dhl_parcel_boxes') as any
  await service.deleteDhlParcelBoxPresets(req.params.id)
  res.status(204).end()
}
