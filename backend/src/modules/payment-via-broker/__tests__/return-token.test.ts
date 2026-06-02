import { generateToken, writeReturnToken } from "../return-token"

describe("return-token", () => {
  describe("generateToken", () => {
    test("starts with r_ and has stable length", () => {
      const t = generateToken()
      expect(t.startsWith("r_")).toBe(true)
      expect(t.length).toBeGreaterThanOrEqual(10)
      expect(t.length).toBeLessThanOrEqual(40)
    })

    test("produces distinct tokens across calls", () => {
      const seen = new Set<string>()
      for (let i = 0; i < 100; i++) seen.add(generateToken())
      expect(seen.size).toBe(100)
    })
  })

  describe("writeReturnToken", () => {
    test("PUTs to the Cloudflare KV REST endpoint with expiration_ttl", async () => {
      const fetchMock = jest.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))

      await writeReturnToken({
        token: "r_test",
        target: "https://inovix-peptides.com/checkout/return?ref=pay_abc",
        ttlSeconds: 3600,
        accountId: "acc_1",
        namespaceId: "ns_1",
        apiToken: "tok_1",
        fetchImpl: fetchMock,
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe(
        "https://api.cloudflare.com/client/v4/accounts/acc_1/storage/kv/namespaces/ns_1/values/r_test?expiration_ttl=3600"
      )
      const headers = new Headers(init!.headers)
      expect(headers.get("authorization")).toBe("Bearer tok_1")
      expect(init!.method).toBe("PUT")
      expect(init!.body).toBe("https://inovix-peptides.com/checkout/return?ref=pay_abc")
    })

    test("throws if Cloudflare returns non-200", async () => {
      const fetchMock = jest.fn(async () => new Response("nope", { status: 401 }))
      await expect(
        writeReturnToken({
          token: "r_test",
          target: "https://inovix-peptides.com/checkout/return",
          ttlSeconds: 3600,
          accountId: "acc_1",
          namespaceId: "ns_1",
          apiToken: "tok_1",
          fetchImpl: fetchMock,
        })
      ).rejects.toThrow(/cloudflare kv write failed: 401/i)
    })
  })
})
