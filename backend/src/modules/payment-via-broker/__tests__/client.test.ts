import crypto from "node:crypto"

import { BrokerClient } from "../client"

describe("BrokerClient", () => {
  const opts = {
    brokerUrl: "https://broker.test",
    clientId: "client_001",
    hmacSecret: "0".repeat(64),
  }

  test("rejects missing required options", () => {
    expect(
      () =>
        new BrokerClient({
          brokerUrl: "",
          clientId: "x",
          hmacSecret: "y",
        })
    ).toThrow()
  })

  test("createPayment signs body and posts to broker", async () => {
    const fetchMock = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init!.headers)
      // Inspect signing scheme
      const ts = headers.get("x-timestamp")!
      const sig = headers.get("x-signature")!
      const body = init!.body as string
      const expected = crypto
        .createHmac("sha256", opts.hmacSecret)
        .update(`${ts}.${body}`)
        .digest("hex")
      expect(sig).toBe(expected)
      expect(headers.get("x-client-id")).toBe("client_001")
      expect(headers.get("user-agent")).toBe("payments-client/1.0")
      return new Response(
        JSON.stringify({
          ref: "pay_abc",
          checkout_url: "https://www.mollie.com/checkout/abc",
          status: "pending",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch
    try {
      const client = new BrokerClient(opts)
      const result = await client.createPayment({
        ref: "pay_abc",
        amountMinor: 1234,
        currencyCode: "EUR",
        returnUrl: "https://example.com/return",
      })
      expect(result.ref).toBe("pay_abc")
      expect(result.checkoutUrl).toContain("mollie.com")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("verifyCallback accepts a fresh signature", () => {
    const client = new BrokerClient(opts)
    const body = JSON.stringify({ ref: "pay_abc", status: "captured" })
    const ts = Math.floor(Date.now() / 1000)
    const sig = crypto
      .createHmac("sha256", opts.hmacSecret)
      .update(`${ts}.${body}`)
      .digest("hex")
    expect(
      client.verifyCallback({
        rawBody: body,
        signatureHeader: sig,
        timestampHeader: String(ts),
        nowUnix: ts,
      }).ok
    ).toBe(true)
  })

  test("verifyCallback rejects bad sig", () => {
    const client = new BrokerClient(opts)
    expect(
      client.verifyCallback({
        rawBody: "{}",
        signatureHeader: "ff".repeat(32),
        timestampHeader: String(Math.floor(Date.now() / 1000)),
      }).ok
    ).toBe(false)
  })
})
