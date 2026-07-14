// Pure helpers for the DHL Parcel order widget, split out so they are unit
// testable without rendering the widget.

export type DecodedDataUri = { mime: string; bytes: Uint8Array }

/**
 * Decode a base64 `data:` URI into its mime type + raw bytes.
 *
 * The DHL label PDF is persisted on the fulfillment as a
 * `data:application/pdf;base64,...` URI. Browsers BLOCK opening a `data:` URL
 * as a top-level tab (anti-phishing), so a plain `<a href={dataUri} target=
 * "_blank">` just lands on about:blank. Instead we decode the bytes here and
 * the caller wraps them in a Blob + object URL, which IS allowed to open.
 *
 * Returns null when `uri` is not a base64 data URI (e.g. a real hosted URL, or
 * null/empty), signalling the caller to open it directly.
 */
export function decodeBase64DataUri(
  uri: string | null | undefined,
): DecodedDataUri | null {
  if (typeof uri !== "string" || uri.length === 0) return null
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(uri)
  if (!match) return null
  const mime = match[1]
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return { mime, bytes }
}
