import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Photo } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  InlineTip,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"

// Images the operator may upload as the site-wide default product image.
const ACCEPTED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"]
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

type UploadedFile = { url?: string }

const DefaultProductImagePage = () => {
  const inputRef = useRef<HTMLInputElement>(null)

  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Load the currently configured default image.
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/admin/default-product-image", {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        })
        if (!res.ok) throw new Error(`Laden mislukt (${res.status})`)
        const data = (await res.json()) as { url: string | null }
        setCurrentUrl(data.url)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Onbekende fout bij laden")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleFileSelected(file: File) {
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      toast.error("Alleen PNG, JPG, WEBP of AVIF afbeeldingen zijn toegestaan")
      return
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("De afbeelding mag maximaal 5 MB groot zijn")
      return
    }

    setUploading(true)
    try {
      const form = new FormData()
      form.append("files", file)
      const res = await fetch("/admin/uploads", {
        method: "POST",
        credentials: "include",
        body: form,
      })
      if (!res.ok) throw new Error(`Upload mislukt (${res.status})`)
      const json = (await res.json()) as { files?: UploadedFile[] }
      const uploaded = json.files?.[0]
      if (!uploaded?.url) throw new Error("Upload gaf geen URL terug")
      setCurrentUrl(uploaded.url)
      setDirty(true)
      toast.success("Afbeelding geupload | klik op Opslaan om te activeren")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload mislukt")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function persist(url: string | null) {
    setSaving(true)
    try {
      const res = await fetch("/admin/default-product-image", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message || `Opslaan mislukt (${res.status})`)
      }
      const data = (await res.json()) as { url: string | null }
      setCurrentUrl(data.url)
      setDirty(false)
      toast.success(
        url
          ? "Standaard productafbeelding opgeslagen"
          : "Standaard productafbeelding verwijderd | de winkel valt terug op de ingebouwde afbeelding"
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Container className="p-6">
        <Text>Standaard productafbeelding laden...</Text>
      </Container>
    )
  }

  if (loadError) {
    return (
      <Container className="p-6">
        <Text className="text-ui-fg-error">{loadError}</Text>
      </Container>
    )
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-5">
        <Heading level="h1">Standaard productafbeelding</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          Deze afbeelding wordt in de webshop getoond bij producten die zelf
          (nog) geen afbeelding hebben | op de catalogus, productpagina,
          winkelwagen en afrekenpagina. Upload een afbeelding en klik op
          Opslaan om hem direct in de hele winkel te gebruiken.
        </Text>
      </div>

      <div className="flex flex-col gap-6 px-6 py-6">
        {/* Preview */}
        <div className="flex flex-col gap-2">
          <Text size="small" weight="plus">
            Huidige afbeelding
          </Text>
          {currentUrl ? (
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentUrl}
                alt="Standaard productafbeelding"
                className="h-40 w-40 border border-ui-border-base object-cover"
              />
              <Text size="small" className="break-all text-ui-fg-subtle">
                {currentUrl}
              </Text>
            </div>
          ) : (
            <InlineTip label="Geen eigen afbeelding ingesteld" variant="info">
              Er is nog geen standaardafbeelding ingesteld. De winkel gebruikt
              op dit moment de ingebouwde fallback-afbeelding.
            </InlineTip>
          )}
        </div>

        {/* Hidden file input + actions */}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFileSelected(file)
          }}
        />

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="small"
            isLoading={uploading}
            disabled={uploading || saving}
            onClick={() => inputRef.current?.click()}
          >
            Afbeelding uploaden
          </Button>
          {currentUrl && (
            <Button
              variant="transparent"
              size="small"
              disabled={uploading || saving}
              onClick={() => void persist(null)}
            >
              Verwijderen
            </Button>
          )}
        </div>

        <Text size="xsmall" className="text-ui-fg-muted">
          Toegestane formaten: PNG, JPG, WEBP, AVIF | maximaal 5 MB. Gebruik bij
          voorkeur een vierkante afbeelding voor de beste weergave.
        </Text>
      </div>

      {/* Save footer */}
      <div className="flex items-center justify-between px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">
          {dirty
            ? "Je hebt een nieuwe afbeelding geupload die nog niet is opgeslagen."
            : "Wijzigingen worden direct in de webshop toegepast na het opslaan."}
        </Text>
        <Button
          variant="primary"
          size="small"
          isLoading={saving}
          disabled={!dirty || uploading || !currentUrl}
          onClick={() => void persist(currentUrl)}
        >
          Opslaan
        </Button>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Standaard productafbeelding",
  icon: Photo,
})

export default DefaultProductImagePage
