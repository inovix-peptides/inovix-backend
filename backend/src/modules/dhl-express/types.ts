export type DhlProductCode = 'H' | 'P' | 'U' | 'N'

export type DhlExpressOptions = {
  apiKey: string
  apiSecret: string
  accountNumber: string
  baseUrl: string
  shipper: DhlAddress
}

export type DhlAddress = {
  name: string
  street: string
  city: string
  postalCode: string
  countryCode: string
  phone: string
  email: string
}

export type CreateShipmentInput = {
  productCode: DhlProductCode
  messageReference: string
  shipper: DhlAddress
  recipient: DhlAddress
  pieces: Array<{
    weightKg: number
    lengthCm: number
    widthCm: number
    heightCm: number
  }>
  declaredValueEur: number
  invoiceNumber: string
}

export type CreateShipmentResult = {
  trackingNumber: string
  labelPdfBase64: string
  shipmentTrackingUrl: string
}

export type DhlApiErrorShape = {
  status: number
  title: string
  detail?: string
  message: string
}

export class DhlApiError extends Error {
  status: number
  title: string
  detail?: string
  constructor(shape: DhlApiErrorShape) {
    super(shape.message)
    this.status = shape.status
    this.title = shape.title
    this.detail = shape.detail
  }
}

export type FulfillmentDataDhl = {
  // Pre-call (set by the workflow before calling DHL):
  dhl_product_code: DhlProductCode
  dhl_request_id: string
  dhl_box_preset_id: string
  dhl_total_weight_kg: number
  dhl_box_dimensions: { lengthCm: number; widthCm: number; heightCm: number }
  // Post-call (set by the provider service after DHL responds):
  dhl_tracking_number?: string
  dhl_tracking_url?: string
  dhl_label_pdf_base64?: string
}
