// Confirmed real DHL Parcel keys (2026-06-06, sandbox /capabilities/business NL-to-NL):
// LARGE does not exist; XSMALL (0-2kg) and SMALL_MEDIUM (10-20kg) do.
const VALID_PARCEL_TYPE_KEYS = ['XSMALL', 'SMALL', 'SMALL_MEDIUM', 'MEDIUM'] as const

function isPositiveNumber(v: unknown): boolean {
  return typeof v === 'number' && isFinite(v) && v > 0
}

export function validateCreate(body: Record<string, unknown>): string[] {
  const errors: string[] = []

  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    errors.push('Field "name" is required and must be a non-empty string')
  }

  for (const field of ['length_cm', 'width_cm', 'height_cm', 'max_items'] as const) {
    if (body[field] === undefined || body[field] === null) {
      errors.push(`Field "${field}" is required`)
    } else if (!isPositiveNumber(body[field])) {
      errors.push(`Field "${field}" must be a positive number`)
    }
  }

  if (body.parcel_type_key === undefined || body.parcel_type_key === null) {
    errors.push('Field "parcel_type_key" is required')
  } else if (!VALID_PARCEL_TYPE_KEYS.includes(body.parcel_type_key as any)) {
    errors.push(`Field "parcel_type_key" must be one of: ${VALID_PARCEL_TYPE_KEYS.join(', ')}`)
  }

  return errors
}

export function validateUpdate(body: Record<string, unknown>): string[] {
  const errors: string[] = []

  if ('name' in body) {
    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      errors.push('Field "name" must be a non-empty string')
    }
  }

  for (const field of ['length_cm', 'width_cm', 'height_cm', 'max_items'] as const) {
    if (field in body) {
      if (!isPositiveNumber(body[field])) {
        errors.push(`Field "${field}" must be a positive number`)
      }
    }
  }

  if ('parcel_type_key' in body) {
    if (!VALID_PARCEL_TYPE_KEYS.includes(body.parcel_type_key as any)) {
      errors.push(`Field "parcel_type_key" must be one of: ${VALID_PARCEL_TYPE_KEYS.join(', ')}`)
    }
  }

  return errors
}
