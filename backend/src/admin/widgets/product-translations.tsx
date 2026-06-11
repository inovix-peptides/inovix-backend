import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminProduct } from "@medusajs/types"
import {
  Container,
  Heading,
  Button,
  Text,
  Textarea,
  Label,
  Switch,
  Badge,
  toast,
} from "@medusajs/ui"
import { useMemo, useState } from "react"

type Lang = "de" | "en"
const LANGS: { code: Lang; label: string }[] = [
  { code: "de", label: "Duits (DE)" },
  { code: "en", label: "Engels (EN)" },
]
const FIELDS: { key: string; label: string; rows: number }[] = [
  { key: "description", label: "Korte beschrijving", rows: 3 },
  { key: "subtitle", label: "Subtitel", rows: 2 },
  { key: "category", label: "Categorie", rows: 1 },
  { key: "long_description", label: "Uitgebreide beschrijving (HTML)", rows: 6 },
]

type LangFields = Record<string, string>
type I18n = Record<Lang, LangFields>

function readI18n(metadata: Record<string, unknown> | null | undefined): I18n {
  const raw = (metadata?.i18n ?? {}) as Record<string, unknown>
  const pick = (l: Lang): LangFields => {
    const obj = (raw?.[l] ?? {}) as Record<string, unknown>
    const out: LangFields = {}
    for (const f of FIELDS) {
      const v = obj[f.key]
      out[f.key] = typeof v === "string" ? v : ""
    }
    return out
  }
  return { de: pick("de"), en: pick("en") }
}

const ProductTranslationsWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const metadata = (data.metadata ?? {}) as Record<string, unknown>
  const initial = useMemo(() => readI18n(metadata), [data.metadata])
  const updatedAt = typeof metadata.i18n_updated_at === "string" ? metadata.i18n_updated_at : null
  const model = typeof metadata.i18n_model === "string" ? metadata.i18n_model : null

  const [i18n, setI18n] = useState<I18n>(initial)
  const [locked, setLocked] = useState<boolean>(metadata.i18n_locked === true)
  const [saving, setSaving] = useState(false)
  const [translating, setTranslating] = useState(false)

  function setField(lang: Lang, key: string, value: string) {
    setI18n((prev) => ({ ...prev, [lang]: { ...prev[lang], [key]: value } }))
  }

  async function onTranslateNow() {
    setTranslating(true)
    try {
      const res = await fetch(`/admin/products/${data.id}/translate`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
      })
      const body = (await res.json().catch(() => ({}))) as {
        i18n?: Record<string, Record<string, unknown>>
        error?: string
      }
      if (!res.ok) throw new Error(body.error || `mislukt (${res.status})`)
      setI18n(readI18n({ i18n: body.i18n }))
      toast.success("Automatisch vertaald", {
        description: "Controleer en sla op. Vergrendel om handmatige correcties te behouden.",
      })
    } catch (err) {
      toast.error("Vertalen mislukt", {
        description: err instanceof Error ? err.message : "onbekende fout",
      })
    } finally {
      setTranslating(false)
    }
  }

  async function onSave() {
    setSaving(true)
    try {
      // Merge only the keys this widget owns, server-side, so we never clobber
      // a concurrent edit from the description widget (both render on this page).
      const res = await fetch(`/admin/products/${data.id}/metadata`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ i18n, i18n_locked: locked }),
      })
      if (!res.ok) throw new Error(`opslaan mislukt (${res.status})`)
      toast.success("Vertalingen opgeslagen")
    } catch (err) {
      toast.error("Opslaan mislukt", {
        description: err instanceof Error ? err.message : "onbekende fout",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Heading level="h2">Vertalingen</Heading>
          {updatedAt && (
            <Badge size="2xsmall" color="grey">
              {model ? `${model} | ` : ""}
              {new Date(updatedAt).toLocaleDateString("nl-NL")}
            </Badge>
          )}
        </div>
        <Button
          variant="secondary"
          size="small"
          onClick={onTranslateNow}
          isLoading={translating}
          disabled={translating || saving}
        >
          Vertaal nu
        </Button>
      </div>

      <div className="px-6 py-4">
        <Text className="txt-small text-ui-fg-subtle mb-4">
          Duitse en Engelse versie van de productteksten. Nederlands blijft de bron. Bij elke
          wijziging van de Nederlandse tekst wordt automatisch opnieuw vertaald, tenzij vergrendeld.
          Titels, peptidecodes (BPC-157), afkortingen (HPLC, GMP) en formules blijven onvertaald.
        </Text>

        <div className="grid gap-6 md:grid-cols-2">
          {LANGS.map(({ code, label }) => (
            <div key={code} className="space-y-3">
              <Text className="txt-compact-small-plus text-ui-fg-base">{label}</Text>
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label size="xsmall" className="text-ui-fg-subtle">
                    {f.label}
                  </Label>
                  <Textarea
                    rows={f.rows}
                    value={i18n[code][f.key] ?? ""}
                    onChange={(e) => setField(code, f.key, e.target.value)}
                    placeholder="(leeg)"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={locked} onCheckedChange={setLocked} id="i18n-locked" />
          <Label htmlFor="i18n-locked" className="text-ui-fg-subtle txt-small">
            Vergrendeld | automatische vertaling overschrijft deze teksten niet
          </Label>
        </div>
        <Button variant="primary" size="small" onClick={onSave} isLoading={saving} disabled={saving}>
          Opslaan
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductTranslationsWidget
