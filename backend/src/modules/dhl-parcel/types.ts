export type DhlParcelOptionKey =
  | 'DOOR'      // home delivery
  | 'PS'        // ServicePoint pickup (requires servicepoint id as input)
  | 'S'         // Saturday delivery (unused v1)
  | 'EVE'       // evening delivery (unused v1)
  | 'INS'       // insurance (unused v1, off by default)
  | 'REFERENCE' // custom reference on label
  | 'HANDT'     // signature required (verify key via /capabilities before relying)

export type DhlParcelParcelType = 'SMALL' | 'MEDIUM' | 'LARGE'

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
  shipmentId: string
  shipmentTrackerCode: string
  pieces: Array<{
    labelId: string
    trackerCode: string
    parcelType: string
    pieceNumber: number
  }>
  pdf?: string  // base64; present when Accept: application/pdf or for /labels POST
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
