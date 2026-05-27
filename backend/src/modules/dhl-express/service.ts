import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"
import { DhlExpressClient } from "./client"
import { DhlExpressOptions } from "./types"

class DhlExpressFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "dhl-express"

  private client: DhlExpressClient

  constructor(_: any, options: DhlExpressOptions) {
    super()
    this.client = new DhlExpressClient(options)
  }

  async getFulfillmentOptions() {
    return [
      { id: "dhl-standard", name: "DHL Standaard (2-4 werkdagen)", dhl_product_code: "H" as const },
      { id: "dhl-express",  name: "DHL Express (volgende werkdag)", dhl_product_code: "P" as const },
    ]
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    return data.id === "dhl-standard" || data.id === "dhl-express"
  }

  async validateFulfillmentData(
    _optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    _context: Record<string, unknown>,
  ) {
    return data
  }

  async canCalculate() {
    return false
  }

  async createFulfillment(
    optionData: Record<string, any>,
    _items: Array<{ quantity: number }>,
    context: { order?: any; items?: any[] },
    data: Record<string, any>,
  ) {
    if (data.dhl_tracking_number) {
      return {
        data: {
          ...data,
          dhl_tracking_number: data.dhl_tracking_number,
        },
        labels: [{
          tracking_number: data.dhl_tracking_number,
          tracking_url: data.dhl_tracking_url,
          label_url: this.labelUrlFromBase64(data.dhl_label_pdf_base64),
        }],
      }
    }

    const order = context.order ?? {}
    const recipient = {
      name: `${order.shipping_address?.first_name ?? ""} ${order.shipping_address?.last_name ?? ""}`.trim() || "Recipient",
      street: order.shipping_address?.address_1 ?? "",
      city: order.shipping_address?.city ?? "",
      postalCode: order.shipping_address?.postal_code ?? "",
      countryCode: order.shipping_address?.country_code?.toUpperCase() ?? "NL",
      phone: order.shipping_address?.phone ?? "+31000000000",
      email: order.email ?? "",
    }

    const dims = data.dhl_box_dimensions as { lengthCm: number; widthCm: number; heightCm: number }
    const productCode = data.dhl_product_code as "H" | "P"
    const totalEur = typeof order.total === "number" ? order.total / 100 : 0

    const shipment = await this.client.createShipment({
      productCode,
      messageReference: data.dhl_request_id,
      shipper: this.client.options.shipper,
      recipient,
      pieces: [{
        weightKg: data.dhl_total_weight_kg,
        lengthCm: dims.lengthCm,
        widthCm: dims.widthCm,
        heightCm: dims.heightCm,
      }],
      declaredValueEur: totalEur,
      invoiceNumber: String(order.display_id ?? order.id ?? ""),
    })

    return {
      data: {
        ...data,
        dhl_tracking_number: shipment.trackingNumber,
        dhl_tracking_url: shipment.shipmentTrackingUrl,
        dhl_label_pdf_base64: shipment.labelPdfBase64,
      },
      labels: [{
        tracking_number: shipment.trackingNumber,
        tracking_url: shipment.shipmentTrackingUrl,
        label_url: this.labelUrlFromBase64(shipment.labelPdfBase64),
      }],
    }
  }

  async cancelFulfillment(_data: Record<string, unknown>) {
    // DHL Express MyDHL API has no void/cancel endpoint. Per DHL guidance, an
    // unused label is not billed until the parcel is scanned into the network.
    // Cancellation is purely local: the admin discards the printed label.
    return {}
  }

  private labelUrlFromBase64(base64: string | undefined): string {
    if (!base64) return ""
    return `data:application/pdf;base64,${base64}`
  }
}

export default DhlExpressFulfillmentProviderService
