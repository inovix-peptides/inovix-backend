import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ListBullet, XMark, Plus } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  IconButton,
  Input,
  Select,
  Text,
  toast,
} from "@medusajs/ui"
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useEffect, useMemo, useState } from "react"

type Variant = {
  id: string
  title: string | null
}

type Product = {
  id: string
  title: string
  thumbnail: string | null
  metadata: Record<string, unknown> | null
  created_at?: string | null
  variants?: Variant[]
}

const AUTO_VARIANT = "__auto__"

type Slot = string | null
type HomepageSlots = [Slot, Slot, Slot]

function readShopRank(
  metadata: Record<string, unknown> | null | undefined
): number | null {
  const r = metadata?.shop_rank
  if (typeof r === "number" && Number.isFinite(r)) return r
  if (typeof r === "string") {
    const n = Number(r)
    if (Number.isFinite(n)) return n
  }
  return null
}

function readHomepagePosition(
  metadata: Record<string, unknown> | null | undefined
): 1 | 2 | 3 | null {
  const p = metadata?.homepage_position
  if (p === 1 || p === 2 || p === 3) return p
  if (p === "1" || p === "2" || p === "3") return Number(p) as 1 | 2 | 3
  return null
}

function readFeaturedVariantId(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const v = metadata?.featured_variant_id
  return typeof v === "string" && v.length > 0 ? v : null
}

function sortByDisplayOrder(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const ra = readShopRank(a.metadata) ?? Number.MAX_SAFE_INTEGER
    const rb = readShopRank(b.metadata) ?? Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    const ca = a.created_at ? new Date(a.created_at).getTime() : 0
    const cb = b.created_at ? new Date(b.created_at).getTime() : 0
    return cb - ca
  })
}

function SortableRow({
  id,
  index,
  product,
}: {
  id: string
  index: number
  product: Product
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto" as const,
  }

  const isFeatured = readHomepagePosition(product.metadata) !== null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 border-b border-ui-border-base bg-ui-bg-base px-4 py-3 last:border-b-0"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Sleep om volgorde te wijzigen"
        className="cursor-grab touch-none px-1 text-ui-fg-muted hover:text-ui-fg-base active:cursor-grabbing"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="4" cy="3" r="1.25" fill="currentColor" />
          <circle cx="10" cy="3" r="1.25" fill="currentColor" />
          <circle cx="4" cy="7" r="1.25" fill="currentColor" />
          <circle cx="10" cy="7" r="1.25" fill="currentColor" />
          <circle cx="4" cy="11" r="1.25" fill="currentColor" />
          <circle cx="10" cy="11" r="1.25" fill="currentColor" />
        </svg>
      </button>

      <span className="w-8 font-mono text-xs tabular-nums text-ui-fg-muted">
        {index + 1}
      </span>

      {product.thumbnail ? (
        <img
          src={product.thumbnail}
          alt=""
          className="size-10 border border-ui-border-base object-cover"
        />
      ) : (
        <div className="size-10 border border-ui-border-base bg-ui-bg-subtle" />
      )}

      <Text size="small" weight="plus" className="flex-1 truncate">
        {product.title}
      </Text>

      {isFeatured && (
        <span className="border border-ui-border-base bg-ui-bg-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-ui-fg-subtle">
          Homepage
        </span>
      )}
    </div>
  )
}

function HomepageSlotCard({
  position,
  productId,
  variantId,
  products,
  usedIds,
  onChange,
  onClear,
  onVariantChange,
}: {
  position: 1 | 2 | 3
  productId: string | null
  variantId: string | null
  products: Product[]
  usedIds: Set<string>
  onChange: (id: string) => void
  onClear: () => void
  onVariantChange: (variantId: string | null) => void
}) {
  const product = productId
    ? products.find((p) => p.id === productId)
    : undefined

  const variants = product?.variants ?? []
  const hasMultipleVariants = variants.length > 1

  const selectable = useMemo(
    () =>
      products.filter(
        (p) => p.id === productId || !usedIds.has(p.id)
      ),
    [products, productId, usedIds]
  )

  return (
    <div className="flex flex-col gap-3 border border-ui-border-base bg-ui-bg-subtle p-4">
      <div className="flex items-center justify-between">
        <Text
          size="xsmall"
          weight="plus"
          className="uppercase tracking-wider text-ui-fg-subtle"
        >
          Positie {position}
        </Text>
        {product && (
          <IconButton
            size="xsmall"
            variant="transparent"
            onClick={onClear}
            aria-label="Verwijder uit homepage"
          >
            <XMark />
          </IconButton>
        )}
      </div>

      {product ? (
        <div className="flex items-center gap-3">
          {product.thumbnail ? (
            <img
              src={product.thumbnail}
              alt=""
              className="size-14 border border-ui-border-base object-cover"
            />
          ) : (
            <div className="size-14 border border-ui-border-base bg-ui-bg-base" />
          )}
          <Text size="small" weight="plus" className="line-clamp-2">
            {product.title}
          </Text>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-ui-fg-muted">
          <Plus />
          <Text size="small">Kies een product</Text>
        </div>
      )}

      <Select
        value={productId ?? ""}
        onValueChange={(v) => {
          if (v) onChange(v)
        }}
      >
        <Select.Trigger>
          <Select.Value placeholder="Selecteer product..." />
        </Select.Trigger>
        <Select.Content>
          {selectable.map((p) => (
            <Select.Item key={p.id} value={p.id}>
              {p.title}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>

      {product && hasMultipleVariants && (
        <div className="flex flex-col gap-1">
          <Text
            size="xsmall"
            className="uppercase tracking-wider text-ui-fg-muted"
          >
            Welke maat tonen
          </Text>
          <Select
            value={variantId ?? AUTO_VARIANT}
            onValueChange={(v) =>
              onVariantChange(v === AUTO_VARIANT ? null : v)
            }
          >
            <Select.Trigger>
              <Select.Value placeholder="Automatisch (laagste prijs)" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={AUTO_VARIANT}>
                Automatisch (laagste prijs)
              </Select.Item>
              {variants.map((v) => (
                <Select.Item key={v.id} value={v.id}>
                  {v.title ?? v.id}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      )}
    </div>
  )
}

const ProductOrderPage = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [orderedIds, setOrderedIds] = useState<string[]>([])
  const [homepage, setHomepage] = useState<HomepageSlots>([null, null, null])
  const [originalHomepage, setOriginalHomepage] = useState<HomepageSlots>([
    null,
    null,
    null,
  ])
  const [featuredVariants, setFeaturedVariants] = useState<
    Record<string, string | null>
  >({})
  const [originalFeaturedVariants, setOriginalFeaturedVariants] = useState<
    Record<string, string | null>
  >({})
  const [originalOrder, setOriginalOrder] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          "/admin/products?limit=500&fields=id,title,thumbnail,metadata,created_at,variants.id,variants.title",
          { credentials: "include" }
        )
        if (!res.ok) {
          throw new Error(`Failed to load products (${res.status})`)
        }
        const data = (await res.json()) as { products: Product[] }
        if (cancelled) return

        const sorted = sortByDisplayOrder(data.products)
        const ids = sorted.map((p) => p.id)
        const slots: HomepageSlots = [null, null, null]
        const variantMap: Record<string, string | null> = {}
        sorted.forEach((p) => {
          const pos = readHomepagePosition(p.metadata)
          if (pos !== null && slots[pos - 1] === null) {
            slots[pos - 1] = p.id
          }
          const fv = readFeaturedVariantId(p.metadata)
          if (fv !== null) variantMap[p.id] = fv
        })

        setProducts(sorted)
        setOrderedIds(ids)
        setOriginalOrder(ids)
        setHomepage(slots)
        setOriginalHomepage([...slots] as HomepageSlots)
        setFeaturedVariants(variantMap)
        setOriginalFeaturedVariants({ ...variantMap })
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Onbekende fout")
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const productsById = useMemo(() => {
    const m = new Map<string, Product>()
    products.forEach((p) => m.set(p.id, p))
    return m
  }, [products])

  const homepageUsedIds = useMemo(
    () => new Set(homepage.filter((v): v is string => v !== null)),
    [homepage]
  )

  const visibleOrderedIds = useMemo(() => {
    if (!search.trim()) return orderedIds
    const q = search.toLowerCase()
    return orderedIds.filter((id) => {
      const p = productsById.get(id)
      return p?.title.toLowerCase().includes(q)
    })
  }, [orderedIds, search, productsById])

  const dirty = useMemo(() => {
    if (orderedIds.length !== originalOrder.length) return true
    for (let i = 0; i < orderedIds.length; i++) {
      if (orderedIds[i] !== originalOrder[i]) return true
    }
    for (let i = 0; i < 3; i++) {
      if (homepage[i] !== originalHomepage[i]) return true
    }
    for (const id of homepage) {
      if (!id) continue
      if ((featuredVariants[id] ?? null) !== (originalFeaturedVariants[id] ?? null)) {
        return true
      }
    }
    return false
  }, [
    orderedIds,
    originalOrder,
    homepage,
    originalHomepage,
    featuredVariants,
    originalFeaturedVariants,
  ])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrderedIds((current) => {
      const oldIndex = current.indexOf(String(active.id))
      const newIndex = current.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return current
      return arrayMove(current, oldIndex, newIndex)
    })
  }

  const setSlot = (slot: 0 | 1 | 2, value: string | null) => {
    setHomepage((current) => {
      const next: HomepageSlots = [...current] as HomepageSlots
      if (value !== null) {
        for (let i = 0; i < 3; i++) {
          if (next[i] === value && i !== slot) next[i] = null
        }
      }
      next[slot] = value
      return next
    })
  }

  const setVariantForProduct = (productId: string, variantId: string | null) => {
    setFeaturedVariants((current) => ({
      ...current,
      [productId]: variantId,
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const shop_ranks = orderedIds.map((id, idx) => ({ id, rank: idx }))

      const homepageChanges: { id: string; position: 1 | 2 | 3 | null }[] = []
      for (let i = 0; i < 3; i++) {
        const pos = (i + 1) as 1 | 2 | 3
        const newId = homepage[i]
        const oldId = originalHomepage[i]
        if (newId === oldId) continue
        if (oldId && !homepage.includes(oldId)) {
          homepageChanges.push({ id: oldId, position: null })
        }
        if (newId) {
          homepageChanges.push({ id: newId, position: pos })
        }
      }

      const seen = new Set<string>()
      const dedupedHomepage = homepageChanges.filter((c) => {
        const key = c.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const featuredVariantChanges: {
        id: string
        variant_id: string | null
      }[] = []
      // Currently featured products: persist their chosen variant (or auto/null).
      for (const id of homepage) {
        if (!id) continue
        featuredVariantChanges.push({
          id,
          variant_id: featuredVariants[id] ?? null,
        })
      }
      // Products dropped from the homepage: clear their featured variant.
      for (const id of originalHomepage) {
        if (id && !homepage.includes(id)) {
          featuredVariantChanges.push({ id, variant_id: null })
        }
      }

      const seenVariants = new Set<string>()
      const dedupedFeaturedVariants = featuredVariantChanges.filter((c) => {
        if (seenVariants.has(c.id)) return false
        seenVariants.add(c.id)
        return true
      })

      const res = await fetch("/admin/products/reorder", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shop_ranks,
          homepage_positions: dedupedHomepage,
          featured_variants: dedupedFeaturedVariants,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `Failed (${res.status})`)
      }

      setOriginalOrder(orderedIds)
      setOriginalHomepage([...homepage] as HomepageSlots)
      setOriginalFeaturedVariants({ ...featuredVariants })
      toast.success("Volgorde opgeslagen")
    } catch (err) {
      toast.error("Opslaan mislukt", {
        description: err instanceof Error ? err.message : "Onbekende fout",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setOrderedIds([...originalOrder])
    setHomepage([...originalHomepage] as HomepageSlots)
    setFeaturedVariants({ ...originalFeaturedVariants })
  }

  if (loading) {
    return (
      <Container className="p-6">
        <Text>Producten laden...</Text>
      </Container>
    )
  }

  if (error) {
    return (
      <Container className="p-6">
        <Text className="text-ui-fg-error">{error}</Text>
      </Container>
    )
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-2 px-6 py-5">
        <Heading level="h1">Product weergavevolgorde</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Bepaal hier de volgorde waarin producten op de website worden
          getoond. De volgorde op de productpagina volgt deze lijst. Lege
          homepage-slots worden automatisch opgevuld met de nieuwste producten.
        </Text>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        <div>
          <Heading level="h2">Homepage uitgelichte producten</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Kies maximaal 3 producten om uit te lichten op de homepage.
          </Text>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <HomepageSlotCard
              key={i}
              position={(i + 1) as 1 | 2 | 3}
              productId={homepage[i]}
              variantId={homepage[i] ? featuredVariants[homepage[i] as string] ?? null : null}
              products={products}
              usedIds={homepageUsedIds}
              onChange={(id) => setSlot(i as 0 | 1 | 2, id)}
              onClear={() => setSlot(i as 0 | 1 | 2, null)}
              onVariantChange={(variantId) => {
                const id = homepage[i]
                if (id) setVariantForProduct(id, variantId)
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Heading level="h2">Volgorde productpagina</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Sleep producten om de volgorde op /products te bepalen.
              {' '}Bovenaan = eerst getoond.
            </Text>
          </div>
          <div className="w-full sm:w-64">
            <Input
              type="search"
              placeholder="Zoek product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {visibleOrderedIds.length === 0 ? (
          <Text size="small" className="text-ui-fg-muted">
            Geen producten gevonden.
          </Text>
        ) : (
          <div className="border border-ui-border-base">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleOrderedIds}
                strategy={verticalListSortingStrategy}
              >
                {visibleOrderedIds.map((id) => {
                  const product = productsById.get(id)
                  if (!product) return null
                  const fullIndex = orderedIds.indexOf(id)
                  return (
                    <SortableRow
                      key={id}
                      id={id}
                      index={fullIndex}
                      product={product}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <Text size="xsmall" className="text-ui-fg-subtle">
          {dirty ? "Niet opgeslagen wijzigingen" : "Alles opgeslagen"}
        </Text>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="small"
            disabled={!dirty || saving}
            onClick={handleReset}
          >
            Annuleren
          </Button>
          <Button
            variant="primary"
            size="small"
            disabled={!dirty || saving}
            isLoading={saving}
            onClick={handleSave}
          >
            Opslaan
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Volgorde",
  icon: ListBullet,
})

export default ProductOrderPage
