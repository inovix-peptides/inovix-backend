import crypto from 'crypto'

// Shared signature helpers for the ops webhooks (Sentry sha256, Vercel sha1).
// Both providers sign the RAW request bytes, so callers must pass req.rawBody
// (preserved via the preserveRawBody entries in src/api/middlewares.ts).

export function hmacHex(algorithm: 'sha1' | 'sha256', secret: string, raw: Buffer): string {
  return crypto.createHmac(algorithm, secret).update(raw).digest('hex')
}

// Constant-time compare; length mismatch short-circuits (length is not secret
// for a hex HMAC of known algorithm).
export function safeEqualHex(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
