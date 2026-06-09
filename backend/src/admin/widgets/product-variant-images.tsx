import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminProduct } from "@medusajs/types"
import { Container, Heading, Text, Button, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

/**
 * Lets the operator assign, per variant, which of the product's uploaded images
 * the storefront should show when a customer selects that variant. Saves the
 * chosen image URL to the variant's native `thumbnail` field. The storefront
 * reads `variant.thumbnail` first, so what you pick here is exactly what shows.
 *
 * Why this widget exists: Medusa's stock admin gives no UI to set a per-variant
 * image, so variant thumbnails could only be set programmatically and silently
 * drifted from the product gallery. This panel is the missing "set image per
 * variant" control.
 */

type Variant = { id: string; title: string | null; thumbnail: string | null }
type Image = { id: string; url: string }

// Sort variants by the mg strength in their title (10mg, 20mg, 30mg ...), same
// ordering the storefront uses, so the list reads predictably.
function strength(title: string | null): number {
  const m = title?.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : Number.POSITIVE_INFINITY
}

const ProductVariantImagesWidget = ({
  data,
}: DetailWidgetProps<AdminProduct>) => {
  const productId = data.id
  const [images, setImages] = useState<Image[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  // variantId -> chosen image url (null = no image)
  const [selection, setSelection] = useState<Record<string, string | null>>({})
  const [initial, setInitial] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/admin/products/${productId}?fields=id,images.id,images.url,variants.id,variants.title,variants.thumbnail`,
          { credentials: "include" }
        )
        if (!res.ok) throw new Error(`Laden mislukt (${res.status})`)
        const body = await res.json()
        if (cancelled) return
        const imgs: Image[] = body.product?.images ?? []
        const vars: Variant[] = (body.product?.variants ?? [])
          .map((v: Variant) => ({
            id: v.id,
            title: v.title ?? null,
            thumbnail: v.thumbnail ?? null,
          }))
          .sort((a: Variant, b: Variant) => strength(a.title) - strength(b.title))
        const init: Record<string, string | null> = {}
        for (const v of vars) init[v.id] = v.thumbnail
        setImages(imgs)
        setVariants(vars)
        setSelection(init)
        setInitial(init)
      } catch (err) {
        toast.error("Kon variant-afbeeldingen niet laden", {
          description: err instanceof Error ? err.message : "Onbekende fout",
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [productId])

  const dirtyIds = useMemo(
    () => variants.map((v) => v.id).filter((id) => selection[id] !== initial[id]),
    [variants, selection, initial]
  )
  const dirty = dirtyIds.length > 0

  const pick = (variantId: string, url: string | null) => {
    setSelection((prev) => ({ ...prev, [variantId]: url }))
  }

  const save = async () => {
    setSaving(true)
    try {
      for (const id of dirtyIds) {
        const res = await fetch(`/admin/products/${productId}/variants/${id}`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ thumbnail: selection[id] }),
        })
        if (!res.ok) throw new Error(`Opslaan mislukt (${res.status})`)
      }
      setInitial({ ...selection })
      toast.success("Variant-afbeeldingen opgeslagen")
    } catch (err) {
      toast.error("Opslaan mislukt", {
        description: err instanceof Error ? err.message : "Onbekende fout",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Variant afbeeldingen</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Kies per variant welke afbeelding de klant ziet zodra die variant
          geselecteerd wordt in de winkel. De afbeeldingen hieronder komen uit de
          Media-sectie van dit product | upload daar eerst je afbeeldingen.
        </Text>
      </div>

      {loading ? (
        <div className="px-6 py-6">
          <Text size="small" className="text-ui-fg-muted">
            Laden...
          </Text>
        </div>
      ) : images.length === 0 ? (
        <div className="px-6 py-6">
          <Text size="small" className="text-ui-fg-muted">
            Dit product heeft nog geen afbeeldingen. Upload ze eerst via de
            Media-sectie hierboven, kom dan terug om ze aan varianten te koppelen.
          </Text>
        </div>
      ) : (
        <div className="flex flex-col divide-y">
          {variants.map((variant) => (
            <div key={variant.id} className="px-6 py-4">
              <Text size="small" weight="plus" className="mb-2">
                {variant.title ?? "Variant"}
              </Text>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {/* "no image" option */}
                <ImageTile
                  selected={selection[variant.id] == null}
                  onClick={() => pick(variant.id, null)}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--fg-muted, #71717a)",
                      textAlign: "center",
                      padding: "0 4px",
                    }}
                  >
                    Geen
                  </span>
                </ImageTile>
                {images.map((img) => (
                  <ImageTile
                    key={img.id}
                    selected={selection[variant.id] === img.url}
                    onClick={() => pick(variant.id, img.url)}
                  >
                    <img
                      src={img.url}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  </ImageTile>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-4">
        <Text size="xsmall" className="text-ui-fg-subtle">
          {dirty ? "Niet opgeslagen wijzigingen" : "Alles opgeslagen"}
        </Text>
        <Button
          variant="primary"
          size="small"
          disabled={!dirty || saving || loading}
          isLoading={saving}
          onClick={save}
        >
          Opslaan
        </Button>
      </div>
    </Container>
  )
}

const ImageTile = ({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      width: "64px",
      height: "64px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg-base, #fff)",
      border: selected
        ? "2px solid var(--fg-base, #0f172a)"
        : "1px solid var(--border-base, #e5e7eb)",
      cursor: "pointer",
      padding: "2px",
    }}
  >
    {children}
  </button>
)

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductVariantImagesWidget
