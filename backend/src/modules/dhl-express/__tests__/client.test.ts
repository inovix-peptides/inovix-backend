import { DhlExpressClient } from "../client"

describe("DhlExpressClient", () => {
  describe("authHeader", () => {
    it("base64-encodes apiKey:apiSecret as Basic auth", () => {
      const client = new DhlExpressClient({
        apiKey: "user-123",
        apiSecret: "secret-456",
        accountNumber: "acc-789",
        baseUrl: "https://express.api.dhl.com/mydhlapi/test",
        shipper: {
          name: "Inovix",
          street: "Test 1",
          city: "Amsterdam",
          postalCode: "1000AA",
          countryCode: "NL",
          phone: "+31000000000",
          email: "ops@inovix-peptides.com",
        },
      })

      expect(client.authHeader()).toBe("Basic " + Buffer.from("user-123:secret-456").toString("base64"))
    })
  })

  describe("createShipment", () => {
    const baseOptions = {
      apiKey: "user-123",
      apiSecret: "secret-456",
      accountNumber: "acc-789",
      baseUrl: "https://express.api.dhl.com/mydhlapi/test",
      shipper: {
        name: "Inovix", street: "Test 1", city: "Amsterdam",
        postalCode: "1000AA", countryCode: "NL",
        phone: "+31000000000", email: "ops@inovix-peptides.com",
      },
    }

    it("posts to /shipments with the right shape and parses the response", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          shipmentTrackingNumber: "1234567890",
          documents: [{ imageFormat: "PDF", content: "JVBERi0=" }],
        }),
      })
      global.fetch = fetchMock as unknown as typeof fetch

      const client = new (await import("../client")).DhlExpressClient(baseOptions)
      const result = await client.createShipment({
        productCode: "P",
        messageReference: "inovix-1001-202605271430",
        shipper: baseOptions.shipper,
        recipient: { ...baseOptions.shipper, name: "Klant", email: "k@example.com" },
        pieces: [{ weightKg: 0.6, lengthCm: 28, widthCm: 20, heightCm: 12 }],
        declaredValueEur: 89.5,
        invoiceNumber: "1001",
      })

      expect(fetchMock).toHaveBeenCalledWith(
        "https://express.api.dhl.com/mydhlapi/test/shipments",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Authorization": expect.stringMatching(/^Basic /),
            "Content-Type": "application/json",
            "Message-Reference": "inovix-1001-202605271430",
          }),
        }),
      )
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      expect(body.productCode).toBe("P")
      expect(body.accounts).toEqual([{ typeCode: "shipper", number: "acc-789" }])
      expect(body.content.packages[0]).toMatchObject({
        weight: 0.6,
        dimensions: { length: 28, width: 20, height: 12 },
      })
      expect(result).toEqual({
        trackingNumber: "1234567890",
        labelPdfBase64: "JVBERi0=",
        shipmentTrackingUrl:
          "https://www.dhl.com/be-en/home/tracking/tracking-express.html?submit=1&tracking-id=1234567890",
      })
    })
  })
})
