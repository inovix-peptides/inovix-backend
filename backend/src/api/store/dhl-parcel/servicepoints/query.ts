const NL_POSTCODE_RE = /^\d{4}\s?[A-Z]{2}$/

/**
 * Parse and validate query parameters for the servicepoints endpoint.
 *
 * Returns a discriminated-union result so the caller never has to do
 * null-checks on the happy path.
 */
export function parseServicepointQuery(raw: {
  postalCode?: unknown
  limit?: unknown
}):
  | { ok: true; postalCode: string; limit: number }
  | { ok: false; error: string } {
  // ── postalCode ─────────────────────────────────────────────────────────────
  if (raw.postalCode === undefined || raw.postalCode === null || raw.postalCode === '') {
    return { ok: false, error: 'postalCode is verplicht' }
  }

  if (typeof raw.postalCode !== 'string') {
    return { ok: false, error: 'postalCode moet een string zijn' }
  }

  const postalCode = raw.postalCode.trim().toUpperCase()

  if (!NL_POSTCODE_RE.test(postalCode)) {
    return {
      ok: false,
      error:
        'postalCode heeft een ongeldig formaat (verwacht: 4 cijfers + 2 letters, bijv. 1011AB of 1011 AB)',
    }
  }

  // ── limit ──────────────────────────────────────────────────────────────────
  let limit = 10 // default

  if (raw.limit !== undefined && raw.limit !== null && raw.limit !== '') {
    const coerced = Number(raw.limit)

    if (!Number.isFinite(coerced)) {
      return { ok: false, error: 'limit moet een getal zijn' }
    }

    const asInt = Math.trunc(coerced)
    // Clamp: values below 1 become 1, values above 25 become 25
    limit = Math.min(25, Math.max(1, asInt))
  }

  return { ok: true, postalCode, limit }
}
