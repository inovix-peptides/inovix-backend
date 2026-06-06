// Pure validation helper — no framework imports so tests need no Medusa boot.

const NL_POSTAL_CODE_RE = /^\d{4}\s?[A-Z]{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateShipperSettings(body: Record<string, unknown>): string[] {
  const errors: string[] = []

  const requiredStrings = [
    'shipper_name',
    'shipper_street',
    'shipper_postal_code',
    'shipper_city',
    'shipper_phone',
    'shipper_email',
  ] as const

  for (const field of requiredStrings) {
    if (!body[field] || typeof body[field] !== 'string' || (body[field] as string).trim() === '') {
      errors.push(`Field "${field}" is required and must be a non-empty string`)
    }
  }

  // shipper_country_code: required, exactly 2 letters
  if (!body.shipper_country_code || typeof body.shipper_country_code !== 'string') {
    errors.push('Field "shipper_country_code" is required and must be a 2-letter country code')
  } else if (!/^[A-Z]{2}$/.test(body.shipper_country_code)) {
    errors.push('Field "shipper_country_code" must be a 2-letter country code (e.g. NL)')
  }

  // shipper_postal_code: NL format (only validate format when value is present)
  if (body.shipper_postal_code && typeof body.shipper_postal_code === 'string' && body.shipper_postal_code.trim() !== '') {
    const pc = body.shipper_postal_code as string
    if (!NL_POSTAL_CODE_RE.test(pc.toUpperCase())) {
      errors.push('Field "shipper_postal_code" must be in NL format: 4 digits + optional space + 2 uppercase letters (e.g. 1234 AB or 1234AB)')
    }
  }

  // shipper_email: basic email shape (only validate format when value is present)
  if (body.shipper_email && typeof body.shipper_email === 'string' && body.shipper_email.trim() !== '') {
    if (!EMAIL_RE.test(body.shipper_email as string)) {
      errors.push('Field "shipper_email" must be a valid email address')
    }
  }

  // shipper_number: optional — only validate type if provided
  if (body.shipper_number !== undefined && body.shipper_number !== null) {
    if (typeof body.shipper_number !== 'string') {
      errors.push('Field "shipper_number" must be a string when provided')
    }
  }

  return errors
}
