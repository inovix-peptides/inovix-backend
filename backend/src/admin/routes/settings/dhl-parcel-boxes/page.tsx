import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArchiveBox, PencilSquare, Trash } from "@medusajs/icons"
import {
  Button,
  Container,
  FocusModal,
  Heading,
  IconButton,
  Input,
  Label,
  Prompt,
  Select,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

// ─── Types ───────────────────────────────────────────────────────────────────

type ParcelTypeKey = "XSMALL" | "SMALL" | "SMALL_MEDIUM" | "MEDIUM"

type BoxPreset = {
  id: string
  name: string
  length_cm: number
  width_cm: number
  height_cm: number
  max_items: number
  parcel_type_key: ParcelTypeKey
}

const PARCEL_TYPE_OPTIONS: { value: ParcelTypeKey; label: string }[] = [
  { value: "XSMALL", label: "XSMALL" },
  { value: "SMALL", label: "SMALL" },
  { value: "SMALL_MEDIUM", label: "SMALL_MEDIUM" },
  { value: "MEDIUM", label: "MEDIUM" },
]

const VALID_PARCEL_KEYS = new Set<string>(["XSMALL", "SMALL", "SMALL_MEDIUM", "MEDIUM"])

// ─── Form state ───────────────────────────────────────────────────────────────

type FormValues = {
  name: string
  length_cm: string
  width_cm: string
  height_cm: string
  max_items: string
  parcel_type_key: string
}

const emptyForm = (): FormValues => ({
  name: "",
  length_cm: "",
  width_cm: "",
  height_cm: "",
  max_items: "",
  parcel_type_key: "",
})

function presetToForm(p: BoxPreset): FormValues {
  return {
    name: p.name,
    length_cm: String(p.length_cm),
    width_cm: String(p.width_cm),
    height_cm: String(p.height_cm),
    max_items: String(p.max_items),
    parcel_type_key: p.parcel_type_key,
  }
}

type FormErrors = Partial<Record<keyof FormValues, string>>

function validateForm(values: FormValues): FormErrors {
  const errors: FormErrors = {}
  if (!values.name.trim()) {
    errors.name = "Naam is verplicht"
  }
  const lenNum = Number(values.length_cm)
  if (!values.length_cm || isNaN(lenNum) || lenNum <= 0) {
    errors.length_cm = "Vul een positief getal in"
  }
  const widNum = Number(values.width_cm)
  if (!values.width_cm || isNaN(widNum) || widNum <= 0) {
    errors.width_cm = "Vul een positief getal in"
  }
  const hgtNum = Number(values.height_cm)
  if (!values.height_cm || isNaN(hgtNum) || hgtNum <= 0) {
    errors.height_cm = "Vul een positief getal in"
  }
  const maxNum = Number(values.max_items)
  if (!values.max_items || isNaN(maxNum) || maxNum <= 0 || !Number.isInteger(maxNum)) {
    errors.max_items = "Vul een positief geheel getal in"
  }
  if (!values.parcel_type_key || !VALID_PARCEL_KEYS.has(values.parcel_type_key)) {
    errors.parcel_type_key = "Kies een geldig DHL type"
  }
  return errors
}

// ─── Modal ────────────────────────────────────────────────────────────────────

type BoxModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editPreset: BoxPreset | null
  onSaved: () => void
}

function BoxModal({ open, onOpenChange, editPreset, onSaved }: BoxModalProps) {
  const [values, setValues] = useState<FormValues>(emptyForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setValues(editPreset ? presetToForm(editPreset) : emptyForm())
      setErrors({})
      setServerError(null)
    }
  }, [open, editPreset])

  function setField(field: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    // Clear field error on change
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationErrors = validateForm(values)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setSaving(true)
    setServerError(null)

    const payload = {
      name: values.name.trim(),
      length_cm: Number(values.length_cm),
      width_cm: Number(values.width_cm),
      height_cm: Number(values.height_cm),
      max_items: Number(values.max_items),
      parcel_type_key: values.parcel_type_key,
    }

    try {
      const url = editPreset
        ? `/admin/dhl-parcel-boxes/${editPreset.id}`
        : "/admin/dhl-parcel-boxes"
      const method = editPreset ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string; errors?: unknown }
        throw new Error(body.message || `Opslaan mislukt (${res.status})`)
      }

      toast.success(editPreset ? "Doosformaat bijgewerkt" : "Doosformaat aangemaakt")
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Onbekende fout")
    } finally {
      setSaving(false)
    }
  }

  const title = editPreset ? "Doosformaat bewerken" : "Doosformaat toevoegen"

  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <FocusModal.Header>
          <FocusModal.Title>{title}</FocusModal.Title>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col gap-6 p-6">
          {serverError && (
            <Text size="small" className="text-ui-fg-error">
              {serverError}
            </Text>
          )}

          {/* Name */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="box-name" size="small" weight="plus">
              Naam
            </Label>
            <Input
              id="box-name"
              type="text"
              value={values.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="bijv. Klein doosje"
            />
            {errors.name && (
              <Text size="xsmall" className="text-ui-fg-error">
                {errors.name}
              </Text>
            )}
          </div>

          {/* Dimensions row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="box-length" size="small" weight="plus">
                Lengte (cm)
              </Label>
              <Input
                id="box-length"
                type="number"
                min={0.1}
                step={0.1}
                value={values.length_cm}
                onChange={(e) => setField("length_cm", e.target.value)}
                placeholder="30"
              />
              {errors.length_cm && (
                <Text size="xsmall" className="text-ui-fg-error">
                  {errors.length_cm}
                </Text>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="box-width" size="small" weight="plus">
                Breedte (cm)
              </Label>
              <Input
                id="box-width"
                type="number"
                min={0.1}
                step={0.1}
                value={values.width_cm}
                onChange={(e) => setField("width_cm", e.target.value)}
                placeholder="20"
              />
              {errors.width_cm && (
                <Text size="xsmall" className="text-ui-fg-error">
                  {errors.width_cm}
                </Text>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="box-height" size="small" weight="plus">
                Hoogte (cm)
              </Label>
              <Input
                id="box-height"
                type="number"
                min={0.1}
                step={0.1}
                value={values.height_cm}
                onChange={(e) => setField("height_cm", e.target.value)}
                placeholder="15"
              />
              {errors.height_cm && (
                <Text size="xsmall" className="text-ui-fg-error">
                  {errors.height_cm}
                </Text>
              )}
            </div>
          </div>

          {/* Max items */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="box-max-items" size="small" weight="plus">
              Max. items
            </Label>
            <Input
              id="box-max-items"
              type="number"
              min={1}
              step={1}
              value={values.max_items}
              onChange={(e) => setField("max_items", e.target.value)}
              placeholder="5"
            />
            {errors.max_items && (
              <Text size="xsmall" className="text-ui-fg-error">
                {errors.max_items}
              </Text>
            )}
          </div>

          {/* Parcel type */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="box-parcel-type" size="small" weight="plus">
              DHL pakkettype
            </Label>
            <Select
              value={values.parcel_type_key}
              onValueChange={(v) => setField("parcel_type_key", v)}
            >
              <Select.Trigger id="box-parcel-type">
                <Select.Value placeholder="Kies een DHL type..." />
              </Select.Trigger>
              <Select.Content>
                {PARCEL_TYPE_OPTIONS.map((opt) => (
                  <Select.Item key={opt.value} value={opt.value}>
                    {opt.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            {errors.parcel_type_key && (
              <Text size="xsmall" className="text-ui-fg-error">
                {errors.parcel_type_key}
              </Text>
            )}
          </div>
        </FocusModal.Body>
        <FocusModal.Footer>
          <div className="flex items-center justify-end gap-2">
            <FocusModal.Close asChild>
              <Button variant="secondary" size="small" disabled={saving}>
                Annuleren
              </Button>
            </FocusModal.Close>
            <Button
              variant="primary"
              size="small"
              isLoading={saving}
              onClick={handleSubmit}
            >
              {editPreset ? "Opslaan" : "Toevoegen"}
            </Button>
          </div>
        </FocusModal.Footer>
      </FocusModal.Content>
    </FocusModal>
  )
}

// ─── Delete prompt ────────────────────────────────────────────────────────────

type DeletePromptProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset: BoxPreset | null
  onDeleted: () => void
}

function DeletePrompt({ open, onOpenChange, preset, onDeleted }: DeletePromptProps) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!preset) return
    setDeleting(true)
    try {
      const res = await fetch(`/admin/dhl-parcel-boxes/${preset.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message || `Verwijderen mislukt (${res.status})`)
      }
      toast.success(`"${preset.name}" verwijderd`)
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      toast.error("Verwijderen mislukt", {
        description: err instanceof Error ? err.message : "Onbekende fout",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Prompt open={open} onOpenChange={onOpenChange} variant="danger">
      <Prompt.Content>
        <Prompt.Header>
          <Prompt.Title>Doosformaat verwijderen</Prompt.Title>
          <Prompt.Description>
            Weet je zeker dat je{" "}
            <strong>{preset?.name ?? "dit formaat"}</strong> wilt verwijderen?
            Deze actie kan niet ongedaan worden gemaakt.
          </Prompt.Description>
        </Prompt.Header>
        <Prompt.Footer>
          <Prompt.Cancel disabled={deleting}>Annuleren</Prompt.Cancel>
          <Prompt.Action
            onClick={handleDelete}
          >
            {deleting ? "Verwijderen..." : "Verwijderen"}
          </Prompt.Action>
        </Prompt.Footer>
      </Prompt.Content>
    </Prompt>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DhlParcelBoxesPage = () => {
  const [presets, setPresets] = useState<BoxPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editPreset, setEditPreset] = useState<BoxPreset | null>(null)

  // Delete prompt state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BoxPreset | null>(null)

  async function loadPresets() {
    try {
      const res = await fetch("/admin/dhl-parcel-boxes", {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) {
        throw new Error(`Laden mislukt (${res.status})`)
      }
      const data = (await res.json()) as { dhl_parcel_box_presets: BoxPreset[] }
      setPresets(data.dhl_parcel_box_presets ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPresets()
  }, [])

  function openCreate() {
    setEditPreset(null)
    setModalOpen(true)
  }

  function openEdit(preset: BoxPreset) {
    setEditPreset(preset)
    setModalOpen(true)
  }

  function openDelete(preset: BoxPreset) {
    setDeleteTarget(preset)
    setDeleteOpen(true)
  }

  if (loading) {
    return (
      <Container className="p-6">
        <Text>DHL doosformaten laden...</Text>
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
    <>
      <Container className="divide-y p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex flex-col gap-1">
            <Heading level="h1">DHL doosformaten</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Beheer de beschikbare doosformaten voor DHL Parcel NL. Het
              systeem kiest automatisch het kleinste passende formaat per
              bestelling.
            </Text>
          </div>
          <Button variant="primary" size="small" onClick={openCreate}>
            Toevoegen
          </Button>
        </div>

        {/* Table */}
        {presets.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <Text size="small" className="text-ui-fg-muted">
              Nog geen doosformaten aangemaakt. Klik op "Toevoegen" om te
              beginnen.
            </Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Naam</Table.HeaderCell>
                <Table.HeaderCell>Afmetingen (L x B x H cm)</Table.HeaderCell>
                <Table.HeaderCell>Max. items</Table.HeaderCell>
                <Table.HeaderCell>Type</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Acties</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {presets.map((preset) => (
                <Table.Row key={preset.id}>
                  <Table.Cell>
                    <Text size="small" weight="plus">
                      {preset.name}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small" className="font-mono text-ui-fg-subtle">
                      {preset.length_cm} x {preset.width_cm} x {preset.height_cm}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small">{preset.max_items}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="border border-ui-border-base bg-ui-bg-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-ui-fg-subtle">
                      {preset.parcel_type_key}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        size="small"
                        variant="transparent"
                        onClick={() => openEdit(preset)}
                        aria-label={`Bewerk ${preset.name}`}
                      >
                        <PencilSquare />
                      </IconButton>
                      <IconButton
                        size="small"
                        variant="transparent"
                        onClick={() => openDelete(preset)}
                        aria-label={`Verwijder ${preset.name}`}
                        className="text-ui-fg-error hover:text-ui-fg-error"
                      >
                        <Trash />
                      </IconButton>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>

      {/* Create / edit modal */}
      <BoxModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editPreset={editPreset}
        onSaved={loadPresets}
      />

      {/* Delete confirm prompt */}
      <DeletePrompt
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        preset={deleteTarget}
        onDeleted={loadPresets}
      />
    </>
  )
}

export const config = defineRouteConfig({
  label: "DHL doosformaten",
  icon: ArchiveBox,
})

export default DhlParcelBoxesPage
