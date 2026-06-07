import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

// Public counterpart of the admin route: the storefront fetches this to learn
// which image to show for products that have no thumbnail. Set the value from
// the Medusa admin under Settings, "Standaard productafbeelding".
const METADATA_KEY = "default_product_image"

/**
 * GET /store/default-product-image
 *
 * Returns { url: string | null }. When null, the storefront uses its own
 * built-in fallback image.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const storeModule = req.scope.resolve(Modules.STORE)
  const [store] = await storeModule.listStores({}, { take: 1 })

  const url =
    (store?.metadata?.[METADATA_KEY] as string | undefined)?.trim() || null

  return res.json({ url })
}
