/**
 * Pure helpers for the customer order note ("klantopmerking").
 *
 * Lives under admin/widgets (with no framework imports) so BOTH the admin
 * bundle and the server can use it, the same arrangement as
 * `order-fulfillment-checklist.logic.ts`. The server-side entry point with the
 * cart fallback is `src/lib/customer-note.ts`, which re-exports everything here.
 */

/** Matches the storefront's own cap, so both ends agree on the limit. */
export const MAX_CUSTOMER_NOTE_LENGTH = 500

/** Legacy key: the field shipped as "Opmerkingen voor bezorger" before 2026-07-24. */
const LEGACY_NOTE_KEY = "delivery_notes"
const NOTE_KEY = "customer_note"

/**
 * Normalizes a raw note: trims, collapses runs of blank lines, caps the length.
 * Returns null for anything empty or not a string, so callers can treat
 * "no note" as a single falsy case.
 */
export function sanitizeCustomerNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const collapsed = raw
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (!collapsed) return null
  return collapsed.slice(0, MAX_CUSTOMER_NOTE_LENGTH)
}

/** Reads either metadata key off a metadata bag, preferring the current one. */
export function noteFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null
  const bag = metadata as Record<string, unknown>
  return (
    sanitizeCustomerNote(bag[NOTE_KEY]) ?? sanitizeCustomerNote(bag[LEGACY_NOTE_KEY])
  )
}

/** Reads the note straight off an already-loaded order or queue row. */
export function customerNoteFromOrder(
  order: { metadata?: Record<string, unknown> | null } | null | undefined
): string | null {
  return noteFromMetadata(order?.metadata)
}

/**
 * Shortens a note for a surface with a length budget (the Telegram push).
 * Returns the note unchanged when it fits.
 */
export function truncateCustomerNote(note: string, max: number): string {
  if (note.length <= max) return note
  return `${note.slice(0, max - 1).trimEnd()}…`
}
