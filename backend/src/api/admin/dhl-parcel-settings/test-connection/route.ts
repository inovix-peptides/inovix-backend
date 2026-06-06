import type { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import { DHL_PARCEL_API_BASE_URL, DHL_PARCEL_USER_ID, DHL_PARCEL_KEY } from '../../../../lib/constants'
import { TokenCache } from '../../../../modules/dhl-parcel/token-cache'
import { DhlParcelClient } from '../../../../modules/dhl-parcel/client'
import { DhlParcelAuthError, DhlParcelApiError } from '../../../../modules/dhl-parcel/types'

/**
 * POST /admin/dhl-parcel-settings/test-connection
 *
 * Tests DHL Parcel API connectivity using the env credentials. Decodes the
 * JWT's middle segment to determine whether the key is a test or live key.
 * Never logs or returns the token or API key.
 *
 * 200 { connected: true,  accountId, environment, keyDesc, baseUrl }
 * 200 { connected: false, error }   — on auth failure (keeps HTTP 200 so
 *                                     the admin UI can display the error without
 *                                     triggering framework-level error overlays)
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const baseUrl = DHL_PARCEL_API_BASE_URL
  const userId = DHL_PARCEL_USER_ID
  const key = DHL_PARCEL_KEY

  if (!userId || !key) {
    return res.json({
      connected: false,
      error: 'DHL credentials are not configured (DHL_PARCEL_USER_ID / DHL_PARCEL_KEY missing)',
    })
  }

  const tokenCache = new TokenCache(baseUrl, userId, key)
  const client = new DhlParcelClient(baseUrl, tokenCache)

  let accountNumbers: string[]
  try {
    accountNumbers = await client.getAccountNumbers()
  } catch (err) {
    const isAuthErr =
      err instanceof DhlParcelAuthError ||
      (err instanceof DhlParcelApiError && err.status === 401) ||
      (err instanceof Error && err.message.includes('401'))

    if (isAuthErr) {
      return res.json({
        connected: false,
        error: 'DHL authentication failed (check the API key)',
      })
    }

    // Unexpected error (network, 5xx, etc.) — surface a sanitised message
    const message = err instanceof Error ? err.message : String(err)
    return res.json({
      connected: false,
      error: `DHL connection error: ${message}`,
    })
  }

  // Decode the JWT's middle segment to read keyDesc
  let keyDesc = 'unknown'
  try {
    const rawToken = await tokenCache.getToken()
    const seg = rawToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const parsed = JSON.parse(Buffer.from(seg, 'base64').toString())
    keyDesc = (parsed.keyDesc as string) ?? 'unknown'
  } catch {
    // Leave keyDesc = 'unknown'; do not surface token details
  }

  const accountId = accountNumbers[0] ?? null
  const environment: 'test' | 'live' = keyDesc === 'test' ? 'test' : 'live'

  return res.json({
    connected: true,
    accountId,
    environment,
    keyDesc,
    baseUrl,
  })
}
