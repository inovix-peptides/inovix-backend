import { Modules } from '@medusajs/framework/utils'
import { IProductModuleService, Logger } from '@medusajs/framework/types'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { Sentry } from '../lib/instrument'
import { OPENAI_MODEL } from '../lib/constants'
import {
  translationConfigured,
  translateAll,
  hashSource,
  type TranslatableFields,
} from '../lib/translate'

/**
 * Auto-translate product content (description, subtitle, the rich
 * long_description, and category) into DE + EN whenever a product is saved.
 *
 * Safety:
 * - No API key -> no-op (the feature is inert until OPENAI_API_KEY is set).
 * - `metadata.i18n_locked === true` -> skip (an editor has taken ownership of
 *   the translations; we never overwrite hand edits).
 * - The Dutch source is hashed; we only re-translate when that hash changes.
 *   Writing the translations back into metadata does NOT change the source
 *   hash, so the resulting product.updated event is a no-op (no loop).
 */
export default async function productTranslateHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!translationConfigured()) return

  const logger: Logger = container.resolve('logger')
  const productModule: IProductModuleService = container.resolve(Modules.PRODUCT)

  try {
    const product = await productModule.retrieveProduct(data.id)
    const metadata = (product.metadata ?? {}) as Record<string, unknown>

    if (metadata.i18n_locked === true) return

    const metaStr = (key: string) =>
      typeof metadata[key] === 'string' ? (metadata[key] as string) : null

    const source: TranslatableFields = {
      description: product.description ?? null,
      subtitle: product.subtitle ?? null,
      long_description: metaStr('long_description'),
      category: metaStr('category'),
      physical_state: metaStr('physical_state'),
      solubility: metaStr('solubility'),
      shelf_life: metaStr('shelf_life'),
      storage_temp: metaStr('storage_temp'),
      handling_notes: metaStr('handling_notes'),
    }

    const hasContent = Object.values(source).some(Boolean)
    if (!hasContent) return

    const hash = hashSource(source)
    if (metadata.i18n && metadata.i18n_source_hash === hash) return

    const i18n = await translateAll(source)

    await productModule.updateProducts(data.id, {
      metadata: {
        ...metadata,
        i18n,
        i18n_source_hash: hash,
        i18n_updated_at: new Date().toISOString(),
        i18n_model: OPENAI_MODEL,
      },
    })

    logger.info(`product.translate: translated ${data.id} into de, en`)
  } catch (error) {
    logger.error(
      `product.translate: failed for ${data.id}: ${(error as Error).message}`
    )
    Sentry.captureException(error, {
      tags: { subscriber: 'product.translate' },
      extra: { productId: data.id },
    })
  }
}

export const config: SubscriberConfig = {
  event: ['product.created', 'product.updated'],
}
