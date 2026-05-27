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

  it("createFulfillment calls DHL once and returns a Medusa fulfillment result with tracking", async () => {
    const { default: DhlExpressService } = await import("../service")
    const svc: any = new DhlExpressService({} as any, {
      apiKey: "k", apiSecret: "s", accountNumber: "a",
      baseUrl: "https://x",
      shipper: {
        name: "Inovix", street: "Test 1", city: "Amsterdam",
        postalCode: "1000AA", countryCode: "NL",
        phone: "+31000000000", email: "ops@inovix-peptides.com",
      },
    })

    svc.client.createShipment = jest.fn().mockResolvedValue({
      trackingNumber: "AWB-99",
      labelPdfBase64: "JVBERi0=",
      shipmentTrackingUrl: "https://www.dhl.com/track?awb=AWB-99",
    })

    const result = await svc.createFulfillment(
      { id: "dhl-express", dhl_product_code: "P" },
      [{ quantity: 1 }],
      {
        order: {
          id: "order_1",
          display_id: 1001,
          email: "k@example.com",
          shipping_address: {
            first_name: "K", last_name: "L",
            address_1: "Klantstraat 1", city: "Rotterdam",
            postal_code: "3000AA", country_code: "NL",
            phone: "+31600000000",
          },
          total: 8950,
          currency_code: "eur",
        },
        items: [],
      },
      {
        dhl_product_code: "P",
        dhl_request_id: "inovix-1001-202605271430",
        dhl_box_preset_id: "preset_m",
        dhl_total_weight_kg: 0.6,
        dhl_box_dimensions: { lengthCm: 28, widthCm: 20, heightCm: 12 },
      },
    )

    expect(svc.client.createShipment).toHaveBeenCalledTimes(1)
    expect(svc.client.createShipment).toHaveBeenCalledWith(expect.objectContaining({
      productCode: "P",
      messageReference: "inovix-1001-202605271430",
      pieces: [{ weightKg: 0.6, lengthCm: 28, widthCm: 20, heightCm: 12 }],
    }))
    expect(result).toMatchObject({
      data: expect.objectContaining({ dhl_tracking_number: "AWB-99" }),
      labels: [expect.objectContaining({
        tracking_number: "AWB-99",
        tracking_url: "https://www.dhl.com/track?awb=AWB-99",
      })],
    })
  })

  it("createFulfillment skips DHL when fulfillment.dhl_tracking_number is already set (idempotency)", async () => {
    const { default: DhlExpressService } = await import("../service")
    const svc: any = new DhlExpressService({} as any, {
      apiKey: "k", apiSecret: "s", accountNumber: "a",
      baseUrl: "https://x",
      shipper: {
        name: "Inovix", street: "Test 1", city: "Amsterdam",
        postalCode: "1000AA", countryCode: "NL",
        phone: "+31000000000", email: "ops@inovix-peptides.com",
      },
    })
    svc.client.createShipment = jest.fn()

    const result = await svc.createFulfillment(
      { id: "dhl-express", dhl_product_code: "P" },
      [{ quantity: 1 }],
      { order: {} },
      {
        dhl_product_code: "P",
        dhl_request_id: "inovix-1001-202605271430",
        dhl_box_preset_id: "preset_m",
        dhl_total_weight_kg: 0.6,
        dhl_box_dimensions: { lengthCm: 28, widthCm: 20, heightCm: 12 },
        dhl_tracking_number: "AWB-PREV",
        dhl_tracking_url: "https://www.dhl.com/track?awb=AWB-PREV",
        dhl_label_pdf_base64: "PREVPDF",
      },
    )

    expect(svc.client.createShipment).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      labels: [expect.objectContaining({ tracking_number: "AWB-PREV" })],
    })
  })

  it("cancelFulfillment is local-only (does NOT call DHL) and returns empty data", async () => {
    const { default: DhlExpressService } = await import("../service")
    const svc: any = new DhlExpressService({} as any, {
      apiKey: "k", apiSecret: "s", accountNumber: "a",
      baseUrl: "https://x",
      shipper: {
        name: "I", street: "S", city: "A", postalCode: "1",
        countryCode: "NL", phone: "+31", email: "o@i.com",
      },
    })
    svc.client.createShipment = jest.fn()
    const result = await svc.cancelFulfillment({ dhl_tracking_number: "AWB-9" })
    expect(svc.client.createShipment).not.toHaveBeenCalled()
    expect(result).toEqual({})
  })
})
