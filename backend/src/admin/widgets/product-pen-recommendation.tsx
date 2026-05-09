import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/types"
import {
  Button,
  Container,
  Heading,
  Label,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { useMemo, useState } from "react"

function readRequiresPen(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  return Boolean(metadata?.requires_pen)
}

const ProductPenRecommendationWidget = ({
  data,
}: DetailWidgetProps<AdminProduct>) => {
  const initial = useMemo(
    () =>
      readRequiresPen(
        data.metadata as Record<string, unknown> | null | undefined
      ),
    [data.metadata]
  )
  const [enabled, setEnabled] = useState<boolean>(initial)
  const [saving, setSaving] = useState(false)

  const dirty = enabled !== initial

  const save = async () => {
    setSaving(true)
    try {
      const nextMetadata = {
        ...(data.metadata ?? {}),
        requires_pen: enabled,
      }
      const res = await fetch(`/admin/products/${data.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metadata: nextMetadata }),
      })
      if (!res.ok) {
        throw new Error(`Failed (${res.status})`)
      }
      toast.success("Pen-aanbeveling opgeslagen")
    } catch (err) {
      toast.error("Opslaan mislukt", {
        description: err instanceof Error ? err.message : "Onbekende fout",
      })
    } finally {
      setSaving(false)
    }
  }

  const id = "requires-pen-toggle"

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Injectiepen-aanbeveling</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Toont op de productpagina een aanbeveling voor de injectiepen. Zet
          aan voor peptiden waarvoor een pen nodig is bij rehydratie of
          injectie.
        </Text>
      </div>

      <div className="px-6 py-4">
        <div className="flex flex-col gap-y-1">
          <div className="flex items-center justify-between gap-x-4">
            <Label htmlFor={id} className="txt-small font-medium">
              Toon pen-aanbeveling
            </Label>
            <Switch
              id={id}
              checked={enabled}
              onCheckedChange={(v) => setEnabled(Boolean(v))}
            />
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Aan: de injectiepen verschijnt als bijproduct-aanbeveling onder
            de productafbeelding op de storefront.
          </Text>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <Text size="xsmall" className="text-ui-fg-subtle">
          {dirty ? "Niet opgeslagen wijzigingen" : "Alles opgeslagen"}
        </Text>
        <Button
          variant="primary"
          size="small"
          disabled={!dirty || saving}
          isLoading={saving}
          onClick={save}
        >
          Opslaan
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductPenRecommendationWidget
