import { parseServicepointQuery } from '../query'

describe('parseServicepointQuery', () => {
  // ── Valid postcodes ──────────────────────────────────────────────────────────

  it('accepts "1011AB" (compact, no space) and defaults limit to 10', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB' })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 10 })
  })

  it('accepts "1011 AB" (with space) and normalises to "1011 AB"', () => {
    const result = parseServicepointQuery({ postalCode: '1011 AB' })
    expect(result).toEqual({ ok: true, postalCode: '1011 AB', limit: 10 })
  })

  it('normalises lowercase letters to uppercase', () => {
    const result = parseServicepointQuery({ postalCode: '1011ab' })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 10 })
  })

  it('trims surrounding whitespace before validating', () => {
    const result = parseServicepointQuery({ postalCode: '  1011AB  ' })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 10 })
  })

  // ── Missing / empty postalCode ───────────────────────────────────────────────

  it('returns error when postalCode is missing', () => {
    const result = parseServicepointQuery({})
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })

  it('returns error when postalCode is undefined', () => {
    const result = parseServicepointQuery({ postalCode: undefined })
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })

  it('returns error when postalCode is null', () => {
    const result = parseServicepointQuery({ postalCode: null })
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })

  it('returns error when postalCode is an empty string', () => {
    const result = parseServicepointQuery({ postalCode: '' })
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })

  // ── Invalid format ───────────────────────────────────────────────────────────

  it('rejects "ABCD" (all letters)', () => {
    const result = parseServicepointQuery({ postalCode: 'ABCD' })
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })

  it('rejects "10AB" (only 2 digits)', () => {
    const result = parseServicepointQuery({ postalCode: '10AB' })
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })

  it('rejects "1011" (no letters)', () => {
    const result = parseServicepointQuery({ postalCode: '1011' })
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })

  it('rejects "1011ABC" (three letters)', () => {
    const result = parseServicepointQuery({ postalCode: '1011ABC' })
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })

  it('rejects "12345AB" (five digits)', () => {
    const result = parseServicepointQuery({ postalCode: '12345AB' })
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })

  // ── limit: default ──────────────────────────────────────────────────────────

  it('uses limit 10 when limit is absent', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.limit).toBe(10)
  })

  it('uses limit 10 when limit is undefined', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: undefined })
    if (!result.ok) throw new Error('expected ok')
    expect(result.limit).toBe(10)
  })

  // ── limit: clamping ──────────────────────────────────────────────────────────

  it('clamps limit 100 to 25', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: 100 })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 25 })
  })

  it('clamps limit 26 to 25', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: 26 })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 25 })
  })

  it('accepts limit 25 as-is', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: 25 })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 25 })
  })

  it('accepts limit 1 as-is', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: 1 })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 1 })
  })

  it('clamps limit 0 to 1', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: 0 })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 1 })
  })

  it('clamps negative limit -5 to 1', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: -5 })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 1 })
  })

  // ── limit: string coercion ───────────────────────────────────────────────────

  it('coerces numeric string "5" to 5', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: '5' })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 5 })
  })

  it('coerces numeric string "25" to 25', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: '25' })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 25 })
  })

  it('clamps string "100" to 25', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: '100' })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 25 })
  })

  it('clamps string "0" to 1', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: '0' })
    expect(result).toEqual({ ok: true, postalCode: '1011AB', limit: 1 })
  })

  it('returns error for non-numeric string limit', () => {
    const result = parseServicepointQuery({ postalCode: '1011AB', limit: 'abc' })
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })
})
