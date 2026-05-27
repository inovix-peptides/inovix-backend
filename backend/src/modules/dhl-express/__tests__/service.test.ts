jest.mock("@medusajs/framework/utils", () => {
  class AbstractFulfillmentProviderService {
    static identifier = ""
  }
  class MedusaError extends Error {
    static Types = { INVALID_DATA: "INVALID_DATA", NOT_ALLOWED: "NOT_ALLOWED" }
    public type: string
    constructor(type: string, message: string) { super(message); this.type = type }
  }
  return { AbstractFulfillmentProviderService, MedusaError }
})

describe("DhlExpressFulfillmentProviderService", () => {
  it("returns the two seeded shipping option types", async () => {
    const { default: DhlExpressService } = await import("../service")
    const svc = new DhlExpressService({} as any, {
      apiKey: "k", apiSecret: "s", accountNumber: "a",
      baseUrl: "https://x",
      shipper: {
        name: "I", street: "S", city: "A", postalCode: "1",
        countryCode: "NL", phone: "+31", email: "o@i.com",
      },
    })
    const options = await svc.getFulfillmentOptions()
    expect(options).toEqual([
      { id: "dhl-standard", name: "DHL Standaard (2-4 werkdagen)", dhl_product_code: "H" },
      { id: "dhl-express",  name: "DHL Express (volgende werkdag)", dhl_product_code: "P" },
    ])
  })
})
