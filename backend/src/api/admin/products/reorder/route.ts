import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import type { IProductModuleService, Logger } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

type RankEntry = {
  id: string
  rank: number | null
}

type PositionEntry = {
  id: string
  position: 1 | 2 | 3 | null
}

type FeaturedVariantEntry = {
  id: string
  variant_id: string | null
}

type Body = {
  shop_ranks?: RankEntry[]
  homepage_positions?: PositionEntry[]
  featured_variants?: FeaturedVariantEntry[]
}

function isValidRank(r: unknown): r is number | null {
  return r === null || (typeof r === "number" && Number.isFinite(r) && r >= 0)
}

function isValidPosition(p: unknown): p is 1 | 2 | 3 | null {
  return p === null || p === 1 || p === 2 || p === 3
}

function isValidVariantId(v: unknown): v is string | null {
  return v === null || (typeof v === "string" && v.length > 0)
}

export async function POST(
  req: MedusaRequest<Body>,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve("logger") as Logger
  const body = req.body ?? {}

  const shopRanks = Array.isArray(body.shop_ranks) ? body.shop_ranks : []
  const homepagePositions = Array.isArray(body.homepage_positions)
    ? body.homepage_positions
    : []
  const featuredVariants = Array.isArray(body.featured_variants)
    ? body.featured_variants
    : []

  for (const entry of shopRanks) {
    if (!entry || typeof entry.id !== "string" || !isValidRank(entry.rank)) {
      res.status(400).json({
        error: "shop_ranks entries must be { id: string, rank: number|null }",
      })
      return
    }
  }

  const seenPositions = new Map<1 | 2 | 3, string>()
  for (const entry of homepagePositions) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !isValidPosition(entry.position)
    ) {
      res.status(400).json({
        error:
          "homepage_positions entries must be { id: string, position: 1|2|3|null }",
      })
      return
    }
    if (entry.position !== null) {
      const existing = seenPositions.get(entry.position)
      if (existing && existing !== entry.id) {
        res.status(400).json({
          error: `homepage position ${entry.position} assigned to multiple products`,
        })
        return
      }
      seenPositions.set(entry.position, entry.id)
    }
  }

  for (const entry of featuredVariants) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !isValidVariantId(entry.variant_id)
    ) {
      res.status(400).json({
        error:
          "featured_variants entries must be { id: string, variant_id: string|null }",
      })
      return
    }
  }

  const productIds = new Set<string>()
  shopRanks.forEach((r) => productIds.add(r.id))
  homepagePositions.forEach((p) => productIds.add(p.id))
  featuredVariants.forEach((f) => productIds.add(f.id))

  if (productIds.size === 0) {
    res.status(200).json({ ok: true, updated: 0 })
    return
  }

  const productModule = req.scope.resolve(
    Modules.PRODUCT
  ) as IProductModuleService

  const existing = await productModule.listProducts(
    { id: Array.from(productIds) },
    { select: ["id", "metadata"], take: null }
  )

  const existingById = new Map(existing.map((p) => [p.id, p]))
  const rankById = new Map(shopRanks.map((r) => [r.id, r.rank]))
  const positionById = new Map(
    homepagePositions.map((p) => [p.id, p.position])
  )
  const featuredVariantById = new Map(
    featuredVariants.map((f) => [f.id, f.variant_id])
  )

  type Update = { id: string; metadata: Record<string, unknown> }
  const updates: Update[] = []

  for (const id of productIds) {
    const current = existingById.get(id)
    if (!current) continue

    const metadata: Record<string, unknown> = {
      ...((current.metadata as Record<string, unknown> | null) ?? {}),
    }

    if (rankById.has(id)) {
      const rank = rankById.get(id)
      if (rank === null || rank === undefined) {
        delete metadata.shop_rank
      } else {
        metadata.shop_rank = rank
      }
    }

    if (positionById.has(id)) {
      const position = positionById.get(id)
      if (position === null || position === undefined) {
        delete metadata.homepage_position
      } else {
        metadata.homepage_position = position
      }
    }

    if (featuredVariantById.has(id)) {
      const variantId = featuredVariantById.get(id)
      if (variantId === null || variantId === undefined) {
        delete metadata.featured_variant_id
      } else {
        metadata.featured_variant_id = variantId
      }
    }

    updates.push({ id, metadata })
  }

  if (updates.length === 0) {
    res.status(200).json({ ok: true, updated: 0 })
    return
  }

  try {
    await Promise.all(
      updates.map((u) => productModule.updateProducts(u.id, { metadata: u.metadata }))
    )
    logger.info(`admin.products.reorder: updated ${updates.length} products`)
    res.status(200).json({ ok: true, updated: updates.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`admin.products.reorder failed: ${message}`)
    res.status(500).json({ error: "failed to update products" })
  }
}
