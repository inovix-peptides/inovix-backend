import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

// The default product image is stored on the singleton Store's `metadata`
// under this key. The storefront reads it via GET /store/default-product-image
// and uses it as the fallback whenever a product has no thumbnail of its own.
const METADATA_KEY = "default_product_image"

/**
 * GET /admin/default-product-image
 *
 * Returns the currently configured default product image URL (or null when
 * none is set, in which case the storefront falls back to its built-in image).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const storeModule = req.scope.resolve(Modules.STORE)
  const [store] = await storeModule.listStores({}, { take: 1 })

  const url =
    (store?.metadata?.[METADATA_KEY] as string | undefined)?.trim() || null

  return res.json({ url })
}

/**
 * POST /admin/default-product-image
 *
 * Body: { url: string | null }
 *
 * Sets (or clears, when url is empty/null) the default product image URL on
 * the Store metadata. The value is normally an uploaded image URL returned by
 * POST /admin/uploads, but any reachable image URL is accepted.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { url?: unknown }

  if (body.url !== null && body.url !== undefined && typeof body.url !== "string") {
    return res.status(400).json({ message: "`url` must be a string or null" })
  }

  const normalized =
    typeof body.url === "string" && body.url.trim().length > 0
      ? body.url.trim()
      : null

  const storeModule = req.scope.resolve(Modules.STORE)
  const [store] = await storeModule.listStores({}, { take: 1 })

  if (!store) {
    return res.status(404).json({ message: "No store found" })
  }

  await storeModule.updateStores(store.id, {
    metadata: {
      ...(store.metadata ?? {}),
      [METADATA_KEY]: normalized,
    },
  })

  return res.json({ url: normalized })
}
