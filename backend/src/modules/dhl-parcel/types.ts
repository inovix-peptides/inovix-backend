export type DhlParcelOptionKey =
  | 'DOOR'      // home delivery
  | 'PS'        // ServicePoint pickup (requires servicepoint id as input)
  | 'S'         // Saturday delivery (unused v1)
  | 'EVE'       // evening delivery (unused v1)
  | 'INS'       // insurance (unused v1, off by default)
  | 'REFERENCE' // custom reference on label
  | 'HANDT'     // signature required (DOOR only — mutually exclusive with PS per /capabilities)

// Parcel type keys as returned by DHL Parcel /capabilities/business endpoint
// (NL-to-NL, B2C, verified 2026-06-06):
//   XSMALL  0–2 kg,    max 38×26×3 cm
//   SMALL   0–10 kg,   max 80×60×50 cm
//   SMALL_MEDIUM  10–20 kg, max 80×60×50 cm
//   MEDIUM  20–31 kg,  max 180×100×50 cm
// NOTE: 'LARGE' does NOT exist in DHL's API. The box-preset enum and migration
// must be updated before Task 22 to remove LARGE and add XSMALL + SMALL_MEDIUM.
// See task report for details.
export type DhlParcelParcelType = 'XSMALL' | 'SMALL' | 'SMALL_MEDIUM' | 'MEDIUM'

export interface DhlParcelAddress {
  countryCode: string
  postalCode: string
  city: string
  street: string
  number?: string
  numberSuffix?: string
  isBusiness?: boolean
}

export interface DhlParcelName {
  firstName?: string
  lastName?: string
  companyName?: string
}

export interface DhlParcelContact {
  name: DhlParcelName
  address: DhlParcelAddress
  email?: string
  phoneNumber?: string
}

export interface DhlParcelOption {
  key: DhlParcelOptionKey
  input?: string | number | boolean
}

export interface DhlParcelCreateLabelInput {
  labelId: string            // UUID v5 we generate (idempotency key)
  orderReference?: string
  parcelTypeKey: DhlParcelParcelType
  receiver: DhlParcelContact
  shipper: DhlParcelContact
  accountId: string
  options: DhlParcelOption[]
  pieceNumber?: number
  quantity?: number
  application?: string
  pieces?: Array<{
    weight: number             // grams
    dimensions?: { length: number; width: number; height: number } // cm
  }>
}

export interface DhlParcelLabelResponse {
  labelId: string
  shipmentId: string
  parcelType: string
  labelType?: string
  pieceNumber?: number
  trackerCode: string  // tracking barcode (TOP-LEVEL; the /labels response is a single flat piece, verified live)
  routingCode?: string
  orderReference?: string
  pdf?: string  // base64 PDF, present in the POST /labels response
  timeCreated?: string
}

export interface DhlParcelServicePoint {
  id: string
  name: string
  address: {
    countryCode: string
    zipCode: string
    city: string
    street: string
    number?: string
  }
  geoLocation: { latitude: number; longitude: number }
  distance?: number
  openingTimes?: Array<{ weekDay: number; timeFrom: string; timeTo: string }>
}

export interface DhlParcelAuthResponse {
  accessToken: string
  accessTokenExpiration: number   // unix seconds
  refreshToken: string
  refreshTokenExpiration: number
  accountNumbers: string[]
}

export class DhlParcelApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
    public readonly url: string,
  ) {
    super(message)
    this.name = 'DhlParcelApiError'
  }
}

export class DhlParcelAuthError extends Error {
  constructor(message = 'DHL Parcel authentication failed') {
    super(message)
    this.name = 'DhlParcelAuthError'
  }
}

export interface FulfillmentDataDhlParcel {
  dhl_option: 'DOOR' | 'PS'
  service_point_id?: string
  service_point_name?: string
  service_point_address?: string
  dhl_box_dimensions?: { length: number; width: number; height: number }
  dhl_parcel_type_key?: DhlParcelParcelType
  dhl_label_id?: string
  dhl_tracking_number?: string
  dhl_label_pdf_url?: string
  dhl_shipment_tracking_url?: string
}
