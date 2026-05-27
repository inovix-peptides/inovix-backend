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
})
