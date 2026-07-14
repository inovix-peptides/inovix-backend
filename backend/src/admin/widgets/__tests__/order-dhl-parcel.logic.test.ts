import { decodeBase64DataUri } from "../order-dhl-parcel.logic"

describe("decodeBase64DataUri", () => {
  test("decodes a base64 PDF data URI into its mime type + bytes", () => {
    // "JVBERi0xLjQ=" is the base64 of "%PDF-1.4"
    const out = decodeBase64DataUri("data:application/pdf;base64,JVBERi0xLjQ=")
    expect(out).not.toBeNull()
    expect(out!.mime).toBe("application/pdf")
    expect(Buffer.from(out!.bytes).toString("latin1")).toBe("%PDF-1.4")
  })

  test("returns null for a plain (non-data) URL so the caller can open it directly", () => {
    expect(decodeBase64DataUri("https://cdn.example/label.pdf")).toBeNull()
  })

  test("returns null for a non-base64 data URI", () => {
    expect(decodeBase64DataUri("data:text/plain,hello")).toBeNull()
  })

  test("returns null for null / undefined / empty", () => {
    expect(decodeBase64DataUri(null)).toBeNull()
    expect(decodeBase64DataUri(undefined)).toBeNull()
    expect(decodeBase64DataUri("")).toBeNull()
  })
})
