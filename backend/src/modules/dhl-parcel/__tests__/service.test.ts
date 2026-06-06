import { v5 as uuidv5 } from "uuid"

// AbstractFulfillmentProviderService pulls in the whole Medusa framework at
// import time; stub it (and MedusaError) so the service can be unit-tested in
// isolation, mirroring the old DHL Express test.
jest.mock("@medusajs/framework/utils", () => {
  class AbstractFulfillmentProviderService {
    static identifier = ""
  }
  class MedusaError extends Error {
    static Types = { INVALID_DATA: "INVALID_DATA", NOT_ALLOWED: "NOT_ALLOWED" }
    public type: string
    constructor(type: string, message: string) {
      super(message)
      this.type = type
    }
  }
  return { AbstractFulfillmentProviderService, MedusaError }
})

// lib/constants loads env + asserts DATABASE_URL/JWT_SECRET at import time, which
// would throw under jest. Provide stable fakes so the service module imports.
jest.mock("lib/constants", () => ({
  DHL_PARCEL_API_BASE_URL: "https://api.dhl-parcel.test",
  DHL_PARCEL_USER_ID: "test-user",
  DHL_PARCEL_KEY: "test-key",
  DHL_PARCEL_SHIPPER: {
    name: "Inovix",
    street: "Shipperstraat 10",
    postalCode: "1234AB",
    city: "Utrecht",
    countryCode: "NL",
    phone: "+31100000000",
    email: "ops@example.com",
  },
}))

// The hardcoded idempotency namespace must match the one baked into the service.
const DHL_LABEL_NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341"

type MockClient = {
  createLabel: jest.Mock
  getLabelPdf: jest.Mock
  getAccountNumbers: jest.Mock
  tryCancelLabel: jest.Mock
}

function makeMockClient(overrides: Partial<MockClient> = {}): MockClient {
  return {
    createLabel: jest.fn(),
    getLabelPdf: jest.fn(),
    getAccountNumbers: jest.fn(async () => ["ACC-0001"]),
    tryCancelLabel: jest.fn(async () => ({ cancelled: true })),
    ...overrides,
  }
}

function makeLogger() {
  return {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}

async function makeService(client: MockClient, logger = makeLogger()) {
  const { default: DhlParcelService } = await import("../service")
  const svc: any = new DhlParcelService({ logger } as any, {})
  svc.client = client
  return { svc, logger }
}

const SAMPLE_LABEL_RESPONSE = {
  labelId: "label-abc",
  shipmentId: "shipment-abc",
  parcelType: "MEDIUM",
  pieceNumber: 1,
  trackerCode: "JVGL0123456789NL",
  routingCode: "2LNL1011DL+00540000",
  pdf: "JVBERi0xLjQ=",
}

function sampleOrder() {
  return {
    id: "order_1",
    display_id: 1042,
    email: "klant@example.com",
    currency_code: "eur",
    shipping_address: {
      first_name: "Jan",
      last_name: "Jansen",
      company: "Acme BV",
      address_1: "Klantstraat 12",
      city: "Rotterdam",
      postal_code: "3000AA",
      country_code: "nl",
      phone: "+31600000000",
    },
  }
}

const SAMPLE_ITEMS = [{ quantity: 2, product: { weight: 150 } }]

const BASE_DATA = {
  dhl_option: "DOOR" as const,
  dhl_parcel_type_key: "MEDIUM" as const,
  dhl_box_dimensions: { length: 28, width: 20, height: 12 },
}

describe("DhlParcelFulfillmentProviderService", () => {
  // ─── Test 1: getFulfillmentOptions returns both options ──────────────────────
  it("getFulfillmentOptions returns DOOR and PS options with correct data", async () => {
    const { svc } = await makeService(makeMockClient())
    const options = await svc.getFulfillmentOptions()

    expect(options).toEqual([
      { id: "dhl-thuisbezorgd", name: "DHL Thuisbezorgd", data: { dhl_option: "DOOR" } },
      { id: "dhl-servicepunt", name: "DHL Servicepunt", data: { dhl_option: "PS" } },
    ])
  })

  // ─── Test 2: validateOption checks dhl_option (the option's data field) ──────
  it("validateOption returns true for { dhl_option: 'DOOR' } and { dhl_option: 'PS' }", async () => {
    const { svc } = await makeService(makeMockClient())

    expect(await svc.validateOption({ dhl_option: "DOOR" })).toBe(true)
    expect(await svc.validateOption({ dhl_option: "PS" })).toBe(true)
  })

  it("validateOption returns false for unknown option data", async () => {
    const { svc } = await makeService(makeMockClient())

    // Old wrong shape: the shipping option's top-level id is NOT passed here.
    expect(await svc.validateOption({ id: "dhl-thuisbezorgd" })).toBe(false)
    expect(await svc.validateOption({ id: "dhl-servicepunt" })).toBe(false)
    expect(await svc.validateOption({ dhl_option: "UNKNOWN" })).toBe(false)
    expect(await svc.validateOption({})).toBe(false)
  })

  // ─── Test 3: validateFulfillmentData PS guard ────────────────────────────────
  it("validateFulfillmentData throws when PS is chosen but service_point_id is missing/empty", async () => {
    const { svc } = await makeService(makeMockClient())

    await expect(
      svc.validateFulfillmentData({ dhl_option: "PS" }, {}, {}),
    ).rejects.toThrow()

    await expect(
      svc.validateFulfillmentData({ dhl_option: "PS" }, { service_point_id: "" }, {}),
    ).rejects.toThrow()
  })

  it("validateFulfillmentData passes for PS with a service_point_id and for DOOR", async () => {
    const { svc } = await makeService(makeMockClient())

    const ps = await svc.validateFulfillmentData(
      { dhl_option: "PS" },
      { service_point_id: "sp-123" },
      {},
    )
    expect(ps).toMatchObject({ dhl_option: "PS", service_point_id: "sp-123" })

    const door = await svc.validateFulfillmentData({ dhl_option: "DOOR" }, {}, {})
    expect(door).toMatchObject({ dhl_option: "DOOR" })
  })

  // ─── Test 4: createFulfillment happy path ────────────────────────────────────
  it("createFulfillment calls createLabel with the correct input shape and returns tracking data", async () => {
    const client = makeMockClient()
    client.createLabel.mockResolvedValue(SAMPLE_LABEL_RESPONSE)
    const { svc } = await makeService(client)

    const order = sampleOrder()
    const result = await svc.createFulfillment(BASE_DATA, SAMPLE_ITEMS, order, {})

    // Called exactly once
    expect(client.createLabel).toHaveBeenCalledTimes(1)

    const input = client.createLabel.mock.calls[0][0]

    // Deterministic labelId from display_id
    const expectedLabelId = uuidv5(`${order.display_id}-1`, DHL_LABEL_NAMESPACE)
    expect(input.labelId).toBe(expectedLabelId)

    // parcel type from data
    expect(input.parcelTypeKey).toBe("MEDIUM")

    // account id from client.getAccountNumbers()[0]
    expect(input.accountId).toBe("ACC-0001")

    // receiver mapped from shipping address
    expect(input.receiver).toMatchObject({
      name: { firstName: "Jan", lastName: "Jansen", companyName: "Acme BV" },
      address: { countryCode: "nl", postalCode: "3000AA", city: "Rotterdam" },
      email: "klant@example.com",
      phoneNumber: "+31600000000",
    })

    // options: DOOR + REFERENCE + HANDT (signature required; HANDT only on DOOR per capabilities)
    expect(input.options).toEqual([
      { key: "DOOR" },
      { key: "REFERENCE", input: "1042" },
      { key: "HANDT" },
    ])

    // pieces: weight from items (2 * 150 = 300), dimensions from data
    expect(input.pieces).toEqual([
      { weight: 300, dimensions: { length: 28, width: 20, height: 12 } },
    ])

    // Return shape
    expect(result.data).toMatchObject({
      dhl_label_id: expectedLabelId,
      dhl_tracking_number: "JVGL0123456789NL",
    })
    expect(result.data.dhl_label_pdf_url).toBe("data:application/pdf;base64,JVBERi0xLjQ=")
    expect(result.data.dhl_shipment_tracking_url).toBe(
      "https://www.dhlecommerce.nl/nl/consumer/track-and-trace?key=JVGL0123456789NL+3000AA",
    )

    expect(result.labels).toEqual([
      {
        tracking_number: "JVGL0123456789NL",
        tracking_url:
          "https://www.dhlecommerce.nl/nl/consumer/track-and-trace?key=JVGL0123456789NL+3000AA",
        label_url: "data:application/pdf;base64,JVBERi0xLjQ=",
      },
    ])
  })

  // ─── Test 5: createFulfillment idempotency ───────────────────────────────────
  it("createFulfillment is idempotent: skips the client when dhl_tracking_number is already set", async () => {
    const client = makeMockClient()
    const { svc } = await makeService(client)

    const existing = {
      ...BASE_DATA,
      dhl_label_id: "existing-label-id",
      dhl_tracking_number: "JVGL-EXISTING",
      dhl_label_pdf_url: "data:application/pdf;base64,PREV",
      dhl_shipment_tracking_url: "https://track/prev",
    }

    const result = await svc.createFulfillment(existing, SAMPLE_ITEMS, sampleOrder(), {})

    expect(client.createLabel).not.toHaveBeenCalled()
    expect(client.getAccountNumbers).not.toHaveBeenCalled()
    expect(result.data).toMatchObject({ dhl_tracking_number: "JVGL-EXISTING" })
    expect(result.labels).toEqual([
      {
        tracking_number: "JVGL-EXISTING",
        tracking_url: "https://track/prev",
        label_url: "data:application/pdf;base64,PREV",
      },
    ])
  })

  // ─── Test 6: createFulfillment PS option ─────────────────────────────────────
  it("createFulfillment with PS option includes { key: 'PS', input: <service_point_id> } exactly once", async () => {
    const client = makeMockClient()
    client.createLabel.mockResolvedValue(SAMPLE_LABEL_RESPONSE)
    const { svc } = await makeService(client)

    const data = { ...BASE_DATA, dhl_option: "PS" as const, service_point_id: "sp-999" }
    await svc.createFulfillment(data, SAMPLE_ITEMS, sampleOrder(), {})

    const input = client.createLabel.mock.calls[0][0]
    // PS shipments do NOT get HANDT (mutually exclusive per DHL capabilities)
    expect(input.options).toEqual([
      { key: "PS", input: "sp-999" },
      { key: "REFERENCE", input: "1042" },
    ])

    const psCount = input.options.filter((o: { key: string }) => o.key === "PS").length
    expect(psCount).toBe(1)
    const handtCount = input.options.filter((o: { key: string }) => o.key === "HANDT").length
    expect(handtCount).toBe(0)
  })

  // ─── Test 7: cancelFulfillment logs via container logger, never throws ────────
  it("cancelFulfillment returns {} even when tryCancelLabel reports cancelled:false, and logs via logger_.warn", async () => {
    const client = makeMockClient({
      tryCancelLabel: jest.fn(async () => ({ cancelled: false })),
    })
    const { svc, logger } = await makeService(client)

    const result = await svc.cancelFulfillment({ dhl_label_id: "label-xyz" })

    expect(client.tryCancelLabel).toHaveBeenCalledWith("label-xyz")
    expect(result).toEqual({})
    // Unsupported cancellation is logged via the container logger, not console.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("label-xyz"),
    )
  })

  // ─── Test 8: createFulfillment uses dhl_shipper from data when present ───────
  it("createFulfillment uses data.dhl_shipper when provided (admin-saved warehouse address)", async () => {
    const client = makeMockClient()
    client.createLabel.mockResolvedValue(SAMPLE_LABEL_RESPONSE)
    const { svc } = await makeService(client)

    const adminShipper = {
      name: { companyName: "Inovix Warehouse" },
      address: {
        countryCode: "NL",
        postalCode: "1234AB",
        city: "Amsterdam",
        street: "Magazijnweg",
        number: "5",
        isBusiness: true,
      },
      email: "ship@inovix-peptides.nl",
      phoneNumber: "+31201234567",
    }

    const dataWithShipper = { ...BASE_DATA, dhl_shipper: adminShipper }
    await svc.createFulfillment(dataWithShipper, SAMPLE_ITEMS, sampleOrder(), {})

    const input = client.createLabel.mock.calls[0][0]
    // Must use the admin shipper, NOT the env constant.
    expect(input.shipper).toEqual(adminShipper)
  })

  // ─── Test 9: createFulfillment falls back to env shipper when dhl_shipper absent ─
  it("createFulfillment falls back to the env shipper (mapShipper) when data.dhl_shipper is absent", async () => {
    const client = makeMockClient()
    client.createLabel.mockResolvedValue(SAMPLE_LABEL_RESPONSE)
    const { svc } = await makeService(client)

    // BASE_DATA has no dhl_shipper field.
    await svc.createFulfillment(BASE_DATA, SAMPLE_ITEMS, sampleOrder(), {})

    const input = client.createLabel.mock.calls[0][0]
    // The env constant is mocked above: name "Inovix", street "Shipperstraat 10", etc.
    // mapShipper() splits "Shipperstraat 10" into street + number.
    expect(input.shipper.name).toEqual({ companyName: "Inovix" })
    expect(input.shipper.address.countryCode).toBe("NL")
    expect(input.shipper.address.city).toBe("Utrecht")
    expect(input.shipper.address.isBusiness).toBe(true)
  })
})
