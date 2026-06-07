import PaymentViaBrokerProviderService from "../service"
import type { BrokerOptions } from "../types"

const baseOptions: BrokerOptions = {
  brokerUrl: "https://broker.test",
  clientId: "client_001",
  hmacSecret: "0".repeat(64),
  relayBaseUrl: "https://payments-relay.nl",
  cfKvAccountId: "acc_1",
  cfKvNamespaceId: "ns_1",
  cfKvApiToken: "tok_1",
  returnTokenTtlSeconds: 3600,
}

const fakeLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as never

describe("PaymentViaBrokerProviderService.initiatePayment", () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })
  beforeEach(() => {
    process.env.STOREFRONT_URL = "https://inovix-peptides.com"
  })

  test("provisions a KV token and sends a payments-relay.nl return_url to the broker", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    global.fetch = jest.fn(async (url, init) => {
      calls.push({ url: String(url), init: init! })
      if (String(url).includes("api.cloudflare.com")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      return new Response(
        JSON.stringify({
          ref: "pay_xyz",
          checkout_url: "https://www.mollie.com/checkout/select-method/abc",
          status: "pending",
        }),
        { status: 200 }
      )
    }) as typeof fetch

    const svc = new PaymentViaBrokerProviderService(
      { logger: fakeLogger } as never,
      baseOptions
    )
    const result = await svc.initiatePayment({
      amount: 19.95 as never,
      currency_code: "EUR",
      context: {},
    } as never)

    const kvCall = calls.find((c) => c.url.includes("api.cloudflare.com"))
    const brokerCall = calls.find((c) => c.url.includes("broker.test"))
    expect(kvCall).toBeTruthy()
    expect(brokerCall).toBeTruthy()

    expect(kvCall!.init.body).toMatch(
      /^https:\/\/inovix-peptides\.com\/checkout\/return\?ref=pay_/
    )
    const brokerBody = JSON.parse(brokerCall!.init.body as string) as {
      return_url: string
    }
    expect(brokerBody.return_url).toMatch(
      /^https:\/\/payments-relay\.nl\/r\/r_/
    )
    expect(brokerBody.return_url).not.toContain("inovix")
    const kvUrl = kvCall!.url
    const tokenInKv = decodeURIComponent(kvUrl.split("/values/")[1].split("?")[0])
    const tokenInBroker = new URL(brokerBody.return_url).pathname.split("/").pop()
    expect(tokenInKv).toBe(tokenInBroker)
    expect(
      (result.data as { checkoutUrl: string }).checkoutUrl
    ).toContain("mollie.com")
  })

  test("carries cart_id from input.data onto the session for return recovery", async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes("api.cloudflare.com")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      return new Response(
        JSON.stringify({
          ref: "pay_abc",
          checkout_url: "https://www.mollie.com/checkout/x",
          status: "pending",
        }),
        { status: 200 }
      )
    }) as typeof fetch

    const svc = new PaymentViaBrokerProviderService(
      { logger: fakeLogger } as never,
      baseOptions
    )
    const result = await svc.initiatePayment({
      amount: 10.95 as never,
      currency_code: "EUR",
      context: {},
      data: { cart_id: "cart_test_123" },
    } as never)

    expect((result.data as { cart_id?: string }).cart_id).toBe("cart_test_123")
  })
})
