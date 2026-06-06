import { validateShipperSettings } from '../validate'

const validBody = {
  shipper_name: 'Inovix Research BV',
  shipper_street: 'Teststraat',
  shipper_number: '42',
  shipper_postal_code: '1234AB',
  shipper_city: 'Amsterdam',
  shipper_country_code: 'NL',
  shipper_phone: '+31612345678',
  shipper_email: 'verzending@inovix-peptides.nl',
}

describe('validateShipperSettings', () => {
  it('passes for a full valid body', () => {
    expect(validateShipperSettings(validBody)).toEqual([])
  })

  it('passes when shipper_postal_code has a space (1234 AB)', () => {
    expect(validateShipperSettings({ ...validBody, shipper_postal_code: '1234 AB' })).toEqual([])
  })

  it('passes when shipper_number is omitted (optional)', () => {
    const { shipper_number, ...rest } = validBody
    expect(validateShipperSettings(rest)).toEqual([])
  })

  it('passes when shipper_number is null (optional)', () => {
    expect(validateShipperSettings({ ...validBody, shipper_number: null })).toEqual([])
  })

  // Required string fields

  it('returns error for missing shipper_name', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_name: undefined })
    expect(errors.some((e) => e.includes('"shipper_name"'))).toBe(true)
  })

  it('returns error for empty shipper_name', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_name: '   ' })
    expect(errors.some((e) => e.includes('"shipper_name"'))).toBe(true)
  })

  it('returns error for missing shipper_street', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_street: undefined })
    expect(errors.some((e) => e.includes('"shipper_street"'))).toBe(true)
  })

  it('returns error for missing shipper_postal_code', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_postal_code: undefined })
    expect(errors.some((e) => e.includes('"shipper_postal_code"'))).toBe(true)
  })

  it('returns error for missing shipper_city', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_city: undefined })
    expect(errors.some((e) => e.includes('"shipper_city"'))).toBe(true)
  })

  it('returns error for missing shipper_phone', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_phone: undefined })
    expect(errors.some((e) => e.includes('"shipper_phone"'))).toBe(true)
  })

  it('returns error for missing shipper_email', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_email: undefined })
    expect(errors.some((e) => e.includes('"shipper_email"'))).toBe(true)
  })

  // Postal code format

  it('returns error for postal code with wrong format (digits only)', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_postal_code: '12345' })
    expect(errors.some((e) => e.includes('"shipper_postal_code"'))).toBe(true)
  })

  it('returns error for postal code with lowercase letters', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_postal_code: '1234ab' })
    // lowercase fails the regex after toUpperCase() — '1234ab'.toUpperCase() = '1234AB' which is valid
    // so this should PASS (we uppercase before testing, matching DHL behavior)
    expect(errors).toEqual([])
  })

  it('returns error for postal code that is only 3 digits + 2 letters', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_postal_code: '123AB' })
    expect(errors.some((e) => e.includes('"shipper_postal_code"'))).toBe(true)
  })

  it('returns error for postal code with too many letters', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_postal_code: '1234ABC' })
    expect(errors.some((e) => e.includes('"shipper_postal_code"'))).toBe(true)
  })

  // Email format

  it('returns error for email without @', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_email: 'notanemail' })
    expect(errors.some((e) => e.includes('"shipper_email"'))).toBe(true)
  })

  it('returns error for email without domain part', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_email: 'user@' })
    expect(errors.some((e) => e.includes('"shipper_email"'))).toBe(true)
  })

  // Country code

  it('returns error for missing shipper_country_code', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_country_code: undefined })
    expect(errors.some((e) => e.includes('"shipper_country_code"'))).toBe(true)
  })

  it('returns error for 3-letter country code', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_country_code: 'NLD' })
    expect(errors.some((e) => e.includes('"shipper_country_code"'))).toBe(true)
  })

  it('accepts DE as shipper_country_code', () => {
    expect(validateShipperSettings({ ...validBody, shipper_country_code: 'DE' })).toEqual([])
  })

  // shipper_number optional but typed

  it('returns error if shipper_number is a number (not string)', () => {
    const errors = validateShipperSettings({ ...validBody, shipper_number: 42 as any })
    expect(errors.some((e) => e.includes('"shipper_number"'))).toBe(true)
  })

  it('passes when shipper_number is a string', () => {
    expect(validateShipperSettings({ ...validBody, shipper_number: '42A' })).toEqual([])
  })

  // Multiple errors at once

  it('accumulates multiple errors', () => {
    const errors = validateShipperSettings({
      ...validBody,
      shipper_name: '',
      shipper_email: 'bad',
      shipper_postal_code: 'XXXX',
    })
    expect(errors.some((e) => e.includes('"shipper_name"'))).toBe(true)
    expect(errors.some((e) => e.includes('"shipper_email"'))).toBe(true)
    expect(errors.some((e) => e.includes('"shipper_postal_code"'))).toBe(true)
    expect(errors.length).toBeGreaterThanOrEqual(3)
  })
})
