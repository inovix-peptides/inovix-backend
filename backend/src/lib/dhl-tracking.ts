// Live DHL Parcel NL tracking via the PUBLIC track-trace API (no auth):
//   GET https://api-gw.dhlparcel.nl/track-trace?key=<barcode>%2B<postcode>
// Shared by the admin tracking endpoint, the auto-mark-shipped job and
// (later) the storefront order tracking. mapDhlTracking is pure and tested;
// fetchDhlTracking is the only I/O.

export type DhlRawEvent = {
  timestamp?: string | null
  status?: string | null
  category?: string | null
}

export type DhlRawShipment = {
  barcode?: string | null
  deliveredAt?: string | null
  events?: DhlRawEvent[] | null
  destination?: {
    type?: string | null
    name?: string | null
    address?: { city?: string | null } | null
  } | null
}

export type TrackingPhase = "aangemeld" | "onderweg" | "bezorgd" | "onbekend"

export type TrackingEventView = { at: string; title: string; code: string | null }

export type TrackingView = {
  phase: TrackingPhase
  phase_label: string
  delivered_at: string | null
  last_event_at: string | null
  // True once ANY physical scan exists (a non-DATA_RECEIVED category): the
  // parcel has really been handed to DHL. The auto-mark-shipped job keys on
  // this.
  handed_to_dhl: boolean
  events: TrackingEventView[]
}

const PHASE_LABELS: Record<TrackingPhase, string> = {
  aangemeld: "Aangemeld",
  onderweg: "Onderweg",
  bezorgd: "Bezorgd",
  onbekend: "Status onbekend",
}

// Dutch titles for the DHL status codes we have seen or expect; anything
// unknown is humanized instead of leaking a raw code to the UI.
const STATUS_LABELS: Record<string, string> = {
  PRENOTIFICATION_RECEIVED: "Zending aangemeld bij DHL",
  DATA_RECEIVED_WITH_PREFIX_LABEL: "Label aangemaakt",
  SHIPMENT_ACCEPTANCE_PARCELSHOP: "Afgegeven bij DHL-punt",
  SHIPMENT_ACCEPTANCE: "Aangenomen door DHL",
  SHIPMENT_SORTED: "Gesorteerd in het sorteercentrum",
  SORTED: "Gesorteerd in het sorteercentrum",
  IN_TRANSIT: "Onderweg",
  OUT_FOR_DELIVERY: "Bezorger is onderweg",
  SHIPMENT_OUT_FOR_DELIVERY: "Bezorger is onderweg",
  DELIVERED: "Bezorgd",
  DELIVERED_AT_NEIGHBOURS: "Bezorgd bij de buren",
  DELIVERED_AT_PARCELSHOP: "Klaar om op te halen bij het DHL-punt",
}

function humanize(status: string): string {
  const words = status.toLowerCase().split("_").join(" ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function eventTitle(status: string | null | undefined): string {
  if (!status) return "Statusupdate"
  return STATUS_LABELS[status] ?? humanize(status)
}

function eventMs(at: string): number {
  const t = new Date(at).getTime()
  return Number.isFinite(t) ? t : 0
}

export function mapDhlTracking(raw: DhlRawShipment | null | undefined): TrackingView {
  const rawEvents = raw?.events ?? []
  const events: TrackingEventView[] = rawEvents
    .filter((e): e is DhlRawEvent & { timestamp: string } => Boolean(e?.timestamp))
    .map((e) => ({ at: e.timestamp, title: eventTitle(e.status), code: e.status ?? null }))
    .sort((a, b) => eventMs(b.at) - eventMs(a.at))

  const categories = new Set(
    rawEvents.map((e) => (e?.category ?? "").toUpperCase()).filter(Boolean)
  )
  const handedToDhl = [...categories].some((c) => c !== "DATA_RECEIVED")
  const delivered =
    Boolean(raw?.deliveredAt) ||
    [...categories].some((c) => c.startsWith("DELIVERED"))

  let phase: TrackingPhase = "onbekend"
  if (delivered) phase = "bezorgd"
  else if (handedToDhl) phase = "onderweg"
  else if (events.length > 0) phase = "aangemeld"

  return {
    phase,
    phase_label: PHASE_LABELS[phase],
    delivered_at: raw?.deliveredAt ?? null,
    last_event_at: events[0]?.at ?? null,
    handed_to_dhl: handedToDhl,
    events,
  }
}

const TRACK_TRACE_BASE = "https://api-gw.dhlparcel.nl/track-trace"
const FETCH_TIMEOUT_MS = 8_000

// Fetch the raw shipment for a barcode. Returns null when DHL does not know
// the barcode (yet) or the request fails; callers treat null as "no live
// data" and degrade gracefully.
export async function fetchDhlTracking(
  barcode: string,
  postcode: string | null | undefined
): Promise<DhlRawShipment | null> {
  const compact = (postcode ?? "").replace(/\s+/g, "")
  const key = `${barcode}%2B${compact}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${TRACK_TRACE_BASE}?key=${key}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
    if (!res.ok) return null
    const body = (await res.json()) as DhlRawShipment[] | null
    return body?.[0] ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// The CONSUMER deep link (what customers and admins open in a browser).
// Captured live from DHL's own site on 2026-07-15: the old
// www.dhlecommerce.nl/...?key=<barcode>+<pc> pattern 404s since a site
// restructure; the portal deep link below is what their search redirects to.
export type DhlPortalLang = "nl_NL" | "de_DE" | "en_GB"

export function buildDhlConsumerTrackingUrl(
  barcode: string,
  postcode: string | null | undefined,
  lang: DhlPortalLang = "nl_NL"
): string {
  const compact = (postcode ?? "").replace(/\s+/g, "").toUpperCase()
  const path = compact ? `${barcode}/${compact}` : barcode
  return `https://my.dhlecommerce.nl/home/tracktrace/${path}?lang=${lang}`
}
