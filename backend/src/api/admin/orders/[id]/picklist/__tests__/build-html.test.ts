import { buildPicklistHtml, escapeHtml, type PicklistView } from "../build-html"

const view: PicklistView = {
  display_id: 28411,
  created_at: "2026-07-14T09:00:00.000Z",
  customer_name: "Jan <script>Jansen",
  email: "jan@example.com",
  address_lines: ["Straatweg 1", "1234 AB Amsterdam", "NL"],
  dhl_option_label: "DHL Servicepunt",
  service_point: "Primera Centrum | Dorpsstraat 2, Amsterdam",
  items: [
    { product_title: "BPC-157", variant_title: "5mg", sku: "BPC-5", quantity: 2 },
    { product_title: "TB-500 & co", variant_title: null, sku: null, quantity: 1 },
  ],
}

describe("escapeHtml", () => {
  it("escapes the five HTML-special characters", () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;")
  })
})

describe("buildPicklistHtml", () => {
  const html = buildPicklistHtml(view)

  it("contains the order number, items, quantities and address", () => {
    expect(html).toContain("Picklijst | Bestelling #28411")
    expect(html).toContain("BPC-157")
    expect(html).toContain("5mg")
    expect(html).toContain("2x")
    expect(html).toContain("1234 AB Amsterdam")
    expect(html).toContain("DHL Servicepunt")
    expect(html).toContain("Primera Centrum")
  })

  it("escapes user-controlled values", () => {
    expect(html).not.toContain("<script>Jansen")
    expect(html).toContain("&lt;script&gt;Jansen")
    expect(html).toContain("TB-500 &amp; co")
  })

  it("renders the five paper checklist steps and auto-print", () => {
    expect(html).toContain("Stap 1.")
    expect(html).toContain("Stap 5.")
    expect(html).toContain("window.print()")
  })

  it("keeps sharp corners (no border-radius other than 0)", () => {
    expect(html).toContain("border-radius: 0")
    expect(html.match(/border-radius/g)).toHaveLength(1)
  })
})
