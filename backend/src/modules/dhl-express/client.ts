import { DhlExpressOptions } from "./types"

export class DhlExpressClient {
  constructor(private readonly options: DhlExpressOptions) {}

  authHeader(): string {
    const raw = `${this.options.apiKey}:${this.options.apiSecret}`
    return "Basic " + Buffer.from(raw).toString("base64")
  }

  async createShipment(input: import("./types").CreateShipmentInput): Promise<import("./types").CreateShipmentResult> {
    const body = {
      productCode: input.productCode,
      plannedShippingDateAndTime: new Date().toISOString().slice(0, 19) + " GMT+01:00",
      pickup: { isRequested: false },
      accounts: [{ typeCode: "shipper", number: this.options.accountNumber }],
      customerDetails: {
        shipperDetails: this.detailsFromAddress(input.shipper),
        receiverDetails: this.detailsFromAddress(input.recipient),
      },
      content: {
        packages: input.pieces.map((p) => ({
          weight: p.weightKg,
          dimensions: { length: p.lengthCm, width: p.widthCm, height: p.heightCm },
        })),
        isCustomsDeclarable: false,
        declaredValue: input.declaredValueEur,
        declaredValueCurrency: "EUR",
        description: "Research peptides",
        incoterm: "DAP",
        unitOfMeasurement: "metric",
      },
      outputImageProperties: {
        encodingFormat: "pdf",
        imageOptions: [{ typeCode: "label", templateName: "ECOM26_84_001" }],
      },
    }
    const res = await fetch(`${this.options.baseUrl}/shipments`, {
      method: "POST",
      headers: {
        "Authorization": this.authHeader(),
        "Content-Type": "application/json",
        "Message-Reference": input.messageReference,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) {
      const { DhlApiError } = await import("./types")
      throw new DhlApiError({
        status: res.status,
        title: json?.title ?? "DHL error",
        detail: json?.detail,
        message: json?.detail ?? json?.title ?? `DHL ${res.status}`,
      })
    }
    return {
      trackingNumber: json.shipmentTrackingNumber,
      labelPdfBase64: json.documents?.[0]?.content,
      shipmentTrackingUrl:
        `https://www.dhl.com/be-en/home/tracking/tracking-express.html?submit=1&tracking-id=${json.shipmentTrackingNumber}`,
    }
  }

  private detailsFromAddress(a: import("./types").DhlAddress) {
    return {
      postalAddress: {
        cityName: a.city, countryCode: a.countryCode,
        postalCode: a.postalCode, addressLine1: a.street,
      },
      contactInformation: { phone: a.phone, companyName: a.name, fullName: a.name, email: a.email },
    }
  }
}
