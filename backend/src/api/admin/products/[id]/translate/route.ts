import type { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import { Modules } from '@medusajs/framework/utils'
import type { IProductModuleService, Logger } from '@medusajs/framework/types'
import { OPENAI_MODEL } from 'lib/constants'
import {
  translationConfigured,
  translateAll,
  hashSource,
  type TranslatableFields,
} from 'lib/translate'

// POST /admin/products/:id/translate
// Triggers an immediate (re)translation of the product's content into DE + EN
// and stores it in metadata.i18n. Used by the "Vertaal nu" button in the admin
// translations widget so editors do not have to wait for the save subscriber.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = req.params.id
  const logger = req.scope.resolve('logger') as Logger

  if (!translationConfigured()) {
    res
      .status(400)
      .json({ error: 'Vertaling is niet geconfigureerd (OPENAI_API_KEY ontbreekt).' })
    return
  }

  const productModule = req.scope.resolve(Modules.PRODUCT) as IProductModuleService

  try {
    const product = await productModule.retrieveProduct(id)
    const metadata = (product.metadata ?? {}) as Record<string, unknown>

    const source: TranslatableFields = {
      description: product.description ?? null,
      subtitle: product.subtitle ?? null,
      long_description:
        typeof metadata.long_description === 'string' ? metadata.long_description : null,
      category: typeof metadata.category === 'string' ? metadata.category : null,
    }

    // Don't re-bill OpenAI when the source is unchanged and we already have a
    // translation | return the cached one. (Force a fresh run by editing the
    // product, or it will translate when there is no cache yet.)
    const hash = hashSource(source)
    if (metadata.i18n && metadata.i18n_source_hash === hash) {
      res.status(200).json({ i18n: metadata.i18n, cached: true })
      return
    }

    const i18n = await translateAll(source)

    await productModule.updateProducts(id, {
      metadata: {
        ...metadata,
        i18n,
        i18n_source_hash: hashSource(source),
        i18n_updated_at: new Date().toISOString(),
        i18n_model: OPENAI_MODEL,
      },
    })

    res.status(200).json({ i18n })
  } catch (error) {
    logger.error(`admin product translate: ${(error as Error).message}`)
    res.status(500).json({ error: (error as Error).message })
  }
}
