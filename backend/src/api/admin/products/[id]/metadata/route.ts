import type { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import { Modules } from '@medusajs/framework/utils'
import type { IProductModuleService, Logger } from '@medusajs/framework/types'

// POST /admin/products/:id/metadata
// Server-side merge of only the provided keys into the product's existing
// metadata. This avoids the lost-update race where two admin widgets each POST
// the WHOLE metadata blob from a load-time snapshot and clobber each other's
// changes. A key whose value is `null` is deleted.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = req.params.id
  const logger = req.scope.resolve('logger') as Logger
  const patch = (req.body ?? {}) as Record<string, unknown>

  if (typeof patch !== 'object' || Array.isArray(patch)) {
    res.status(400).json({ error: 'Body moet een object met metadata-velden zijn.' })
    return
  }

  const productModule = req.scope.resolve(Modules.PRODUCT) as IProductModuleService

  try {
    const product = await productModule.retrieveProduct(id)
    const existing = (product.metadata ?? {}) as Record<string, unknown>
    const next: Record<string, unknown> = { ...existing }

    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete next[key]
      else next[key] = value
    }

    await productModule.updateProducts(id, { metadata: next })
    res.status(200).json({ metadata: next })
  } catch (error) {
    logger.error(`admin product metadata merge: ${(error as Error).message}`)
    res.status(500).json({ error: 'Opslaan mislukt.' })
  }
}
