import type { MedusaRequest, MedusaResponse } from '@medusajs/framework'

import { DhlParcelClient } from 'modules/dhl-parcel/client'
import { TokenCache } from 'modules/dhl-parcel/token-cache'
import {
  DHL_PARCEL_API_BASE_URL,
  DHL_PARCEL_KEY,
  DHL_PARCEL_USER_ID,
} from 'lib/constants'
import { parseServicepointQuery } from './query'

// Module-level lazy singleton: keeps the TokenCache (and its cached JWT)
// alive across requests in the same process, avoiding a fresh DHL auth call
// on every request.
let client: DhlParcelClient | undefined

function getClient(): DhlParcelClient {
  if (!client) {
    client = new DhlParcelClient(
      DHL_PARCEL_API_BASE_URL,
      new TokenCache(DHL_PARCEL_API_BASE_URL, DHL_PARCEL_USER_ID, DHL_PARCEL_KEY),
    )
  }
  return client
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = parseServicepointQuery(req.query as { postalCode?: unknown; limit?: unknown })

  if (parsed.ok === false) {
    return res.status(400).json({ message: parsed.error })
  }

  const { postalCode, limit } = parsed

  try {
    const servicepoints = await getClient().listServicePoints('NL', { postalCode, limit })

    // ServicePoint lists are relatively static (DHL updates them infrequently).
    // Cache at the CDN/proxy level for 24 h to reduce DHL API load.
    res.setHeader('Cache-Control', 'public, s-maxage=86400')

    return res.json({ servicepoints })
  } catch {
    // Do NOT forward the upstream error details — they may contain token info
    // or internal DHL stack traces. Map everything to an opaque 502.
    return res.status(502).json({ message: 'Kon servicepunten niet ophalen' })
  }
}
