import { defineRouteConfig } from "@medusajs/admin-sdk"
import { TruckFast } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  InlineTip,
  Input,
  Label,
  StatusBadge,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

// ─── Types ───────────────────────────────────────────────────────────────────

type DhlParcelSettings = {
  id?: string
  shipper_name: string
  shipper_street: string
  shipper_number: string
  shipper_postal_code: string
  shipper_city: string
  shipper_country_code: string
  shipper_phone: string
  shipper_email: string
}

type GetSettingsResponse = {
  dhl_parcel_settings: DhlParcelSettings
  persisted: boolean
}

type TestConnectionSuccess = {
  connected: true
  accountId: string
  environment: "test" | "live"
  keyDesc: string
  baseUrl: string
}

type TestConnectionFailure = {
  connected: false
  error: string
}

type TestConnectionResult = TestConnectionSuccess | TestConnectionFailure

// ─── Form state ───────────────────────────────────────────────────────────────

type FormValues = {
  shipper_name: string
  shipper_street: string
  shipper_number: string
  shipper_postal_code: string
  shipper_city: string
  shipper_country_code: string
  shipper_phone: string
  shipper_email: string
}

type FormErrors = Partial<Record<keyof FormValues, string>>

const NL_POSTCODE_RE = /^\d{4}\s?[A-Z]{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateForm(values: FormValues): FormErrors {
  const errors: FormErrors = {}

  if (!values.shipper_name.trim()) {
    errors.shipper_name = "Bedrijfsnaam is verplicht"
  }
  if (!values.shipper_street.trim()) {
    errors.shipper_street = "Straatnaam is verplicht"
  }
  if (!values.shipper_postal_code.trim()) {
    errors.shipper_postal_code = "Postcode is verplicht"
  } else if (!NL_POSTCODE_RE.test(values.shipper_postal_code.trim().toUpperCase())) {
    errors.shipper_postal_code = "Voer een geldige postcode in, bijv. 1234 AB"
  }
  if (!values.shipper_city.trim()) {
    errors.shipper_city = "Stad is verplicht"
  }
  if (!values.shipper_country_code.trim()) {
    errors.shipper_country_code = "Landcode is verplicht"
  } else if (values.shipper_country_code.trim().length !== 2) {
    errors.shipper_country_code = "Gebruik een 2-letterige ISO landcode, bijv. NL"
  }
  if (!values.shipper_phone.trim()) {
    errors.shipper_phone = "Telefoonnummer is verplicht"
  }
  if (!values.shipper_email.trim()) {
    errors.shipper_email = "E-mailadres is verplicht"
  } else if (!EMAIL_RE.test(values.shipper_email.trim())) {
    errors.shipper_email = "Voer een geldig e-mailadres in"
  }

  return errors
}

function settingsToForm(s: DhlParcelSettings): FormValues {
  return {
    shipper_name: s.shipper_name ?? "",
    shipper_street: s.shipper_street ?? "",
    shipper_number: s.shipper_number ?? "",
    shipper_postal_code: s.shipper_postal_code ?? "",
    shipper_city: s.shipper_city ?? "",
    shipper_country_code: s.shipper_country_code ?? "NL",
    shipper_phone: s.shipper_phone ?? "",
    shipper_email: s.shipper_email ?? "",
  }
}

// ─── Connection result panel ──────────────────────────────────────────────────

function ConnectionResultPanel({ result }: { result: TestConnectionResult }) {
  if (!result.connected) {
    const failure = result as TestConnectionFailure
    return (
      <InlineTip label="Verbinding mislukt" variant="error">
        {failure.error}
      </InlineTip>
    )
  }

  const success = result as TestConnectionSuccess
  const isLive = success.environment === "live"

  return (
    <div className="flex flex-col gap-3">
      {isLive ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <StatusBadge color="red">LIVE</StatusBadge>
            <Text size="small" weight="plus" className="text-ui-fg-error">
              Verbinding actief
            </Text>
          </div>
          <InlineTip label="Liveomgeving: labels worden gefactureerd" variant="warning">
            LIVE | Labels zijn echt en worden gefactureerd. Controleer elke
            zending goed voordat je een label aanmaakt.
          </InlineTip>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <StatusBadge color="blue">TESTMODUS</StatusBadge>
            <Text size="small" weight="plus" className="text-ui-fg-subtle">
              Verbinding actief
            </Text>
          </div>
          <InlineTip label="Testomgeving: labels zijn niet echt" variant="info">
            TESTMODUS | Labels worden NIET echt verzonden of gefactureerd.
            Schakel over naar de live API-sleutel om te activeren.
          </InlineTip>
        </div>
      )}

      {/* Account details table */}
      <div className="flex flex-col gap-1 border border-ui-border-base p-4">
        <div className="flex items-center gap-2">
          <Text size="small" className="text-ui-fg-muted w-32">
            Account-ID
          </Text>
          <Text size="small" weight="plus" className="font-mono">
            {success.accountId}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Text size="small" className="text-ui-fg-muted w-32">
            Omgeving
          </Text>
          <Badge color={isLive ? "red" : "blue"} size="xsmall">
            {isLive ? "LIVE" : "TEST"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Text size="small" className="text-ui-fg-muted w-32">
            API-sleutel
          </Text>
          <Text size="small" className="font-mono text-ui-fg-subtle">
            {success.keyDesc}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Text size="small" className="text-ui-fg-muted w-32">
            Base URL
          </Text>
          <Text size="small" className="font-mono text-ui-fg-subtle">
            {success.baseUrl}
          </Text>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DhlParcelSettingsPage = () => {
  // Section A: warehouse address
  const [values, setValues] = useState<FormValues>({
    shipper_name: "",
    shipper_street: "",
    shipper_number: "",
    shipper_postal_code: "",
    shipper_city: "",
    shipper_country_code: "NL",
    shipper_phone: "",
    shipper_email: "",
  })
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [persisted, setPersisted] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Section B: connection test
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/admin/dhl-parcel-settings", {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        })
        if (!res.ok) {
          throw new Error(`Laden mislukt (${res.status})`)
        }
        const data = (await res.json()) as GetSettingsResponse
        setValues(settingsToForm(data.dhl_parcel_settings))
        setPersisted(data.persisted)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Onbekende fout bij laden")
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  function setField(field: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const errors = validateForm(values)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      const res = await fetch("/admin/dhl-parcel-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipper_name: values.shipper_name.trim(),
          shipper_street: values.shipper_street.trim(),
          shipper_number: values.shipper_number.trim(),
          shipper_postal_code: values.shipper_postal_code.trim().toUpperCase(),
          shipper_city: values.shipper_city.trim(),
          shipper_country_code: values.shipper_country_code.trim().toUpperCase(),
          shipper_phone: values.shipper_phone.trim(),
          shipper_email: values.shipper_email.trim(),
        }),
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string
          errors?: Record<string, string>
        }
        if (body.errors && typeof body.errors === "object") {
          setFieldErrors(body.errors as FormErrors)
        }
        throw new Error(body.message || `Opslaan mislukt (${res.status})`)
      }

      setPersisted(true)
      toast.success("Adresgegevens opgeslagen")
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Onbekende fout")
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch("/admin/dhl-parcel-settings/test-connection", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      const data = (await res.json()) as TestConnectionResult
      setTestResult(data)
    } catch (err) {
      setTestResult({
        connected: false,
        error: err instanceof Error ? err.message : "Netwerkfout",
      })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <Container className="p-6">
        <Text>DHL Parcel instellingen laden...</Text>
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
    <div className="flex flex-col gap-4">
      {/* ─── Section A: Warehouse / sender address ─────────────────────────── */}
      <Container className="divide-y p-0">
        <div className="px-6 py-5">
          <Heading level="h1">DHL Parcel instellingen</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Dit adres wordt afgedrukt als AFZENDER op elk DHL-label. Zorg dat
            alle velden volledig en correct zijn ingevuld.
          </Text>
        </div>

        {/* Unpersisted notice */}
        {!persisted && (
          <div className="px-6 py-4">
            <InlineTip label="Nog niet opgeslagen" variant="warning">
              Deze waarden komen uit de serverinstellingen en zijn nog niet
              opgeslagen. Sla ze op om ze te beheren vanuit de admin.
            </InlineTip>
          </div>
        )}

        {/* Address form */}
        <form onSubmit={handleSave} noValidate>
          <div className="flex flex-col gap-6 px-6 py-6">
            {/* Server-level save error */}
            {saveError && (
              <InlineTip label="Opslaan mislukt" variant="error">
                {saveError}
              </InlineTip>
            )}

            {/* Bedrijfsnaam */}
            <div className="flex flex-col gap-1">
              <Label htmlFor="shipper_name" size="small" weight="plus">
                Bedrijfs- of afzendernaam
              </Label>
              <Text size="small" className="text-ui-fg-subtle">
                Staat op het label als afzender, bijv. Inovix Research B.V.
              </Text>
              <Input
                id="shipper_name"
                type="text"
                value={values.shipper_name}
                onChange={(e) => setField("shipper_name", e.target.value)}
                placeholder="Inovix Research B.V."
              />
              {fieldErrors.shipper_name && (
                <Text size="xsmall" className="text-ui-fg-error">
                  {fieldErrors.shipper_name}
                </Text>
              )}
            </div>

            {/* Straat + huisnummer */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 flex flex-col gap-1">
                <Label htmlFor="shipper_street" size="small" weight="plus">
                  Straatnaam
                </Label>
                <Input
                  id="shipper_street"
                  type="text"
                  value={values.shipper_street}
                  onChange={(e) => setField("shipper_street", e.target.value)}
                  placeholder="Hoofdstraat"
                />
                {fieldErrors.shipper_street && (
                  <Text size="xsmall" className="text-ui-fg-error">
                    {fieldErrors.shipper_street}
                  </Text>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="shipper_number" size="small" weight="plus">
                  Huisnummer{" "}
                  <span className="font-normal text-ui-fg-muted">(optioneel)</span>
                </Label>
                <Input
                  id="shipper_number"
                  type="text"
                  value={values.shipper_number}
                  onChange={(e) => setField("shipper_number", e.target.value)}
                  placeholder="42A"
                />
                {fieldErrors.shipper_number && (
                  <Text size="xsmall" className="text-ui-fg-error">
                    {fieldErrors.shipper_number}
                  </Text>
                )}
              </div>
            </div>

            {/* Postcode + stad + landcode */}
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="shipper_postal_code" size="small" weight="plus">
                  Postcode
                </Label>
                <Input
                  id="shipper_postal_code"
                  type="text"
                  value={values.shipper_postal_code}
                  onChange={(e) => setField("shipper_postal_code", e.target.value)}
                  placeholder="1234 AB"
                />
                <Text size="xsmall" className="text-ui-fg-muted">
                  bijv. 1234 AB
                </Text>
                {fieldErrors.shipper_postal_code && (
                  <Text size="xsmall" className="text-ui-fg-error">
                    {fieldErrors.shipper_postal_code}
                  </Text>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="shipper_city" size="small" weight="plus">
                  Stad
                </Label>
                <Input
                  id="shipper_city"
                  type="text"
                  value={values.shipper_city}
                  onChange={(e) => setField("shipper_city", e.target.value)}
                  placeholder="Amsterdam"
                />
                {fieldErrors.shipper_city && (
                  <Text size="xsmall" className="text-ui-fg-error">
                    {fieldErrors.shipper_city}
                  </Text>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="shipper_country_code" size="small" weight="plus">
                  Landcode
                </Label>
                <Input
                  id="shipper_country_code"
                  type="text"
                  maxLength={2}
                  value={values.shipper_country_code}
                  onChange={(e) =>
                    setField("shipper_country_code", e.target.value.toUpperCase())
                  }
                  placeholder="NL"
                />
                <Text size="xsmall" className="text-ui-fg-muted">
                  2-letterige ISO code
                </Text>
                {fieldErrors.shipper_country_code && (
                  <Text size="xsmall" className="text-ui-fg-error">
                    {fieldErrors.shipper_country_code}
                  </Text>
                )}
              </div>
            </div>

            {/* Telefoon + e-mail */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="shipper_phone" size="small" weight="plus">
                  Telefoonnummer
                </Label>
                <Input
                  id="shipper_phone"
                  type="tel"
                  value={values.shipper_phone}
                  onChange={(e) => setField("shipper_phone", e.target.value)}
                  placeholder="+31201234567"
                />
                <Text size="xsmall" className="text-ui-fg-muted">
                  incl. landcode, bijv. +31 20 123 4567
                </Text>
                {fieldErrors.shipper_phone && (
                  <Text size="xsmall" className="text-ui-fg-error">
                    {fieldErrors.shipper_phone}
                  </Text>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="shipper_email" size="small" weight="plus">
                  E-mailadres
                </Label>
                <Input
                  id="shipper_email"
                  type="email"
                  value={values.shipper_email}
                  onChange={(e) => setField("shipper_email", e.target.value)}
                  placeholder="info@example.nl"
                />
                {fieldErrors.shipper_email && (
                  <Text size="xsmall" className="text-ui-fg-error">
                    {fieldErrors.shipper_email}
                  </Text>
                )}
              </div>
            </div>
          </div>

          {/* Save footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-ui-border-base">
            <Text size="small" className="text-ui-fg-subtle">
              Dit adres is het afzenderadres op elk DHL-label. Onjuiste gegevens
              kunnen leiden tot retourzendingen.
            </Text>
            <Button
              type="submit"
              variant="primary"
              size="small"
              isLoading={saving}
            >
              Opslaan
            </Button>
          </div>
        </form>
      </Container>

      {/* ─── Section B: Connection status ──────────────────────────────────── */}
      <Container className="divide-y p-0">
        <div className="px-6 py-5">
          <Heading level="h2">DHL verbinding</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Of je in Test- of Livemodus zit, wordt bepaald door welke DHL
            API-sleutel op de server is geinstalleerd. Overschakelen naar Live
            is een eenmalige technische stap en kan niet via dit scherm.
          </Text>
        </div>

        <div className="px-6 py-6 flex flex-col gap-4">
          <Button
            variant="secondary"
            size="small"
            isLoading={testing}
            onClick={handleTestConnection}
            className="self-start"
          >
            Verbinding testen
          </Button>

          {testResult !== null && <ConnectionResultPanel result={testResult} />}
        </div>
      </Container>

      {/* ─── Section C: Links ──────────────────────────────────────────────── */}
      <Container className="divide-y p-0">
        <div className="px-6 py-5">
          <Heading level="h2">Gerelateerde instellingen</Heading>
        </div>
        <div className="px-6 py-6 flex flex-col gap-4">
          {/* Box presets */}
          <div className="flex flex-col gap-1">
            <Text size="small" weight="plus">
              Doosformaten beheren
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              Beheer de beschikbare doosformaten die het systeem gebruikt om
              zendingen in te pakken.{" "}
              <a
                href="/app/settings/dhl-parcel-boxes"
                className="text-ui-fg-interactive underline"
              >
                Ga naar doosformaten
              </a>
            </Text>
          </div>

          {/* Shipping prices */}
          <div className="flex flex-col gap-1">
            <Text size="small" weight="plus">
              Verzendprijzen
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              DHL-verzendkosten worden beheerd via Medusa{"'"}s eigen instellingen:
              Instellingen, Locaties en verzending. Stel de tarieven per
              verzendprofiel en zone in vanuit die sectie.
            </Text>
          </div>
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "DHL Parcel",
  icon: TruckFast,
})

export default DhlParcelSettingsPage
