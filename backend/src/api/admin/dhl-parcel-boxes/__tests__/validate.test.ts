import { validateCreate, validateUpdate } from '../validate'

describe('validateCreate', () => {
  const validBody = {
    name: 'Small Box',
    length_cm: 20,
    width_cm: 15,
    height_cm: 10,
    max_items: 5,
    parcel_type_key: 'SMALL',
  }

  it('passes for a full valid body', () => {
    expect(validateCreate(validBody)).toEqual([])
  })

  it('returns error for missing name', () => {
    const body = { ...validBody, name: undefined } as any
    const errors = validateCreate(body)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.includes('"name"'))).toBe(true)
  })

  it('returns error for empty string name', () => {
    const body = { ...validBody, name: '   ' }
    const errors = validateCreate(body)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.includes('"name"'))).toBe(true)
  })

  it('returns error for missing length_cm', () => {
    const { length_cm, ...rest } = validBody
    const errors = validateCreate(rest as any)
    expect(errors.some((e) => e.includes('"length_cm"'))).toBe(true)
  })

  it('returns error for zero length_cm', () => {
    const errors = validateCreate({ ...validBody, length_cm: 0 })
    expect(errors.some((e) => e.includes('"length_cm"'))).toBe(true)
  })

  it('returns error for negative width_cm', () => {
    const errors = validateCreate({ ...validBody, width_cm: -5 })
    expect(errors.some((e) => e.includes('"width_cm"'))).toBe(true)
  })

  it('returns error for zero height_cm', () => {
    const errors = validateCreate({ ...validBody, height_cm: 0 })
    expect(errors.some((e) => e.includes('"height_cm"'))).toBe(true)
  })

  it('returns error for missing max_items', () => {
    const { max_items, ...rest } = validBody
    const errors = validateCreate(rest as any)
    expect(errors.some((e) => e.includes('"max_items"'))).toBe(true)
  })

  it('returns error for negative max_items', () => {
    const errors = validateCreate({ ...validBody, max_items: -1 })
    expect(errors.some((e) => e.includes('"max_items"'))).toBe(true)
  })

  it('returns error for invalid parcel_type_key (XL)', () => {
    const errors = validateCreate({ ...validBody, parcel_type_key: 'XL' })
    expect(errors.some((e) => e.includes('"parcel_type_key"'))).toBe(true)
  })

  it('returns error for missing parcel_type_key', () => {
    const { parcel_type_key, ...rest } = validBody
    const errors = validateCreate(rest as any)
    expect(errors.some((e) => e.includes('"parcel_type_key"'))).toBe(true)
  })

  it('accepts MEDIUM as parcel_type_key', () => {
    expect(validateCreate({ ...validBody, parcel_type_key: 'MEDIUM' })).toEqual([])
  })

  it('accepts XSMALL as parcel_type_key', () => {
    expect(validateCreate({ ...validBody, parcel_type_key: 'XSMALL' })).toEqual([])
  })
})

describe('validateUpdate', () => {
  it('passes for a partial valid body (only name)', () => {
    expect(validateUpdate({ name: 'Updated Box' })).toEqual([])
  })

  it('passes for a partial valid body (only numeric fields)', () => {
    expect(validateUpdate({ length_cm: 30, width_cm: 20 })).toEqual([])
  })

  it('passes for a partial valid body (only parcel_type_key)', () => {
    expect(validateUpdate({ parcel_type_key: 'SMALL_MEDIUM' })).toEqual([])
  })

  it('passes for an empty body (no-op update)', () => {
    expect(validateUpdate({})).toEqual([])
  })

  it('returns error for empty string name when name is present', () => {
    const errors = validateUpdate({ name: '' })
    expect(errors.some((e) => e.includes('"name"'))).toBe(true)
  })

  it('returns error for zero length_cm when present', () => {
    const errors = validateUpdate({ length_cm: 0 })
    expect(errors.some((e) => e.includes('"length_cm"'))).toBe(true)
  })

  it('returns error for negative max_items when present', () => {
    const errors = validateUpdate({ max_items: -3 })
    expect(errors.some((e) => e.includes('"max_items"'))).toBe(true)
  })

  it('returns error for invalid parcel_type_key when present', () => {
    const errors = validateUpdate({ parcel_type_key: 'XL' })
    expect(errors.some((e) => e.includes('"parcel_type_key"'))).toBe(true)
  })

  it('ignores absent fields (missing height_cm does not error)', () => {
    expect(validateUpdate({ name: 'Test' })).toEqual([])
  })

  it('validates multiple present fields independently', () => {
    const errors = validateUpdate({ name: '', length_cm: -1, parcel_type_key: 'XL' })
    expect(errors.some((e) => e.includes('"name"'))).toBe(true)
    expect(errors.some((e) => e.includes('"length_cm"'))).toBe(true)
    expect(errors.some((e) => e.includes('"parcel_type_key"'))).toBe(true)
    expect(errors.length).toBe(3)
  })
})
