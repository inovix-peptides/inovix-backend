import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import {
  CreateFulfillmentResult,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  ValidateFulfillmentDataContext,
} from "@medusajs/framework/types"
import { v5 as uuidv5 } from "uuid"

import {
  DHL_PARCEL_API_BASE_URL,
  DHL_PARCEL_KEY,
  DHL_PARCEL_SHIPPER,
  DHL_PARCEL_USER_ID,
} from "lib/constants"
import { sumOrderWeightGrams } from "./box-selector"
import { DhlParcelClient } from "./client"
import { TokenCache } from "./token-cache"
import {
  DhlParcelContact,
  DhlParcelCreateLabelInput,
  DhlParcelOption,
  DhlParcelParcelType,
} from "./types"

// Fixed UUIDv5 namespace used as the idempotency seed for label ids. NEVER
// change this: it is what makes retries dedupe at DHL (a given order always
// derives the same labelId).
const DHL_LABEL_NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341"

type InjectedDependencies = { logger: Logger }

// The shipping address may be partial/absent on the fulfillment order; every
// field is optional so each access is guarded below.
type ShippingAddress = Partial<NonNullable<FulfillmentOrderDTO["shipping_address"]>>

class DhlParcelFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "dhl-parcel"

  protected client: DhlParcelClient
  protected logger_: Logger

  constructor(container: InjectedDependencies, __: Record<string, unknown>) {
    super()
    this.logger_ = container.logger
    this.client = new DhlParcelClient(
      DHL_PARCEL_API_BASE_URL,
      new TokenCache(DHL_PARCEL_API_BASE_URL, DHL_PARCEL_USER_ID, DHL_PARCEL_KEY),
    )
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    // NOTE: in Medusa v2 this is called WITHOUT a cart/destination, so it cannot
    // filter per-order by country. NL-only is enforced by only seeding these
    // options in the NL region (see the seed task).
    // TODO(EU expansion): when shipping beyond NL, gate options per destination
    // using the DHL capabilities endpoint
    // (GET /capabilities/business?fromCountry=NL&toCountry=<dest>). That check
    // belongs in the checkout/servicepoint flow, not here.
    return [
      { id: "dhl-thuisbezorgd", name: "DHL Thuisbezorgd", data: { dhl_option: "DOOR" } },
      { id: "dhl-servicepunt", name: "DHL Servicepunt", data: { dhl_option: "PS" } },
    ]
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    // Medusa passes the shipping option's `data` field here (i.e. what is stored
    // in the `data` column of the shipping_option table), NOT the full option
    // object. Our getFulfillmentOptions() stores `{ dhl_option: "DOOR"|"PS" }`
    // there, so we check dhl_option. Verified against:
    //   node_modules/.pnpm/@medusajs+fulfillment@2.12.1.../fulfillment-provider.js:71
    //   node_modules/.pnpm/@medusajs+utils@2.12.1.../fulfillment/provider.d.ts:160
    return data.dhl_option === "DOOR" || data.dhl_option === "PS"
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    _context: ValidateFulfillmentDataContext,
  ): Promise<Record<string, unknown>> {
    if (optionData.dhl_option === "PS") {
      const servicePointId = data.service_point_id
      if (typeof servicePointId !== "string" || servicePointId.trim().length === 0) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Selecteer een DHL Servicepunt voordat je verder gaat.",
        )
      }
    }
    return { ...optionData, ...data }
  }

  async canCalculate(): Promise<boolean> {
    return false
  }

  async createFulfillment(
    data: Record<string, any>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    _fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>,
  ): Promise<CreateFulfillmentResult> {
    // 1. Idempotency: a label was already bought for this shipping method.
    if (data.dhl_tracking_number) {
      return {
        data: { ...data },
        labels: [
          {
            tracking_number: data.dhl_tracking_number,
            tracking_url: data.dhl_shipment_tracking_url ?? "",
            label_url: data.dhl_label_pdf_url ?? "",
          },
        ],
      }
    }

    const ord = order ?? {}
    const shippingAddress: ShippingAddress = ord.shipping_address ?? {}

    // 2. Deterministic labelId (idempotency seed at DHL).
    const labelId: string =
      data.dhl_label_id ?? uuidv5(`${ord.display_id}-1`, DHL_LABEL_NAMESPACE)

    // 3. Total weight in grams (workflow enriches items with product.weight).
    const weight = sumOrderWeightGrams(
      items as Array<{ quantity: number; product?: { weight?: number | null } }>,
    )

    // 4. Parcel type (box selection step must have run first).
    const parcelTypeKey = data.dhl_parcel_type_key as DhlParcelParcelType | undefined
    if (!parcelTypeKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Geen DHL pakkettype gekozen: de doos-selectie moet eerst draaien (dhl_parcel_type_key ontbreekt).",
      )
    }

    // 5. Dimensions.
    const dimensions = data.dhl_box_dimensions as
      | { length: number; width: number; height: number }
      | undefined

    // 6. Receiver, mapped from the shipping address.
    const receiver = this.mapReceiver(shippingAddress, ord.email)

    // 7. Shipper, from the configured constant.
    const shipper = this.mapShipper()

    // 8. Account id.
    const accountId = (await this.client.getAccountNumbers())[0]

    // 9. Delivery + reference options (PS sent exactly once, carrying the
    //    service point id; no signature/HANDT option yet).
    const options: DhlParcelOption[] = [
      data.dhl_option === "PS"
        ? { key: "PS", input: data.service_point_id }
        : { key: "DOOR" },
      { key: "REFERENCE", input: String(ord.display_id) },
    ]

    // 10. Pieces.
    const pieces = [{ weight, dimensions }]

    // 11. Buy the label.
    const input: DhlParcelCreateLabelInput = {
      labelId,
      parcelTypeKey,
      receiver,
      shipper,
      accountId,
      options,
      pieces,
    }
    const response = await this.client.createLabel(input)

    // 12. Tracking number.
    const trackingNumber = response.shipmentTrackerCode

    // 13. Tracking URL. The literal `+` between barcode and postcode is what
    //     DHL's consumer track-and-trace expects; do NOT url-encode it.
    const trackingUrl = `https://www.dhlecommerce.nl/nl/consumer/track-and-trace?key=${trackingNumber}+${shippingAddress.postal_code ?? ""}`

    // 14. Label PDF as a data URI (R2 upload is a documented follow-up).
    const pdfBase64 = response.pdf ?? (await this.client.getLabelPdf(labelId))
    const labelUrl = `data:application/pdf;base64,${pdfBase64}`

    // 15. Result; `data` is persisted on the fulfillment, `labels` creates
    //     FulfillmentLabel rows.
    return {
      data: {
        ...data,
        dhl_label_id: labelId,
        dhl_tracking_number: trackingNumber,
        dhl_label_pdf_url: labelUrl,
        dhl_shipment_tracking_url: trackingUrl,
      },
      labels: [
        {
          tracking_number: trackingNumber,
          tracking_url: trackingUrl,
          label_url: labelUrl,
        },
      ],
    }
  }

  async cancelFulfillment(data: Record<string, any>): Promise<Record<string, unknown>> {
    const labelId = data.dhl_label_id
    if (labelId) {
      try {
        const result = await this.client.tryCancelLabel(labelId)
        if (!result.cancelled) {
          // Cancellation unsupported / already gone | non-fatal, log only.
          this.logCancelUnsupported(labelId)
        }
      } catch (e) {
        // A failed cancel must not block the local cancellation flow.
        this.logCancelUnsupported(labelId, e)
      }
    }
    return {}
  }

  private logCancelUnsupported(labelId: string, error?: unknown): void {
    this.logger_.warn(
      `[dhl-parcel] could not cancel label ${labelId} at DHL (non-fatal)` +
      (error ? ` | ${String(error)}` : ""),
    )
  }

  private mapReceiver(address: ShippingAddress, email?: string): DhlParcelContact {
    const { street, number } = splitStreet(address.address_1)
    return {
      name: {
        firstName: address.first_name,
        lastName: address.last_name,
        companyName: address.company,
      },
      address: {
        countryCode: address.country_code ?? "",
        postalCode: address.postal_code ?? "",
        city: address.city ?? "",
        street,
        number,
      },
      email,
      phoneNumber: address.phone,
    }
  }

  private mapShipper(): DhlParcelContact {
    const s = DHL_PARCEL_SHIPPER
    const { street, number } = splitStreet(s.street)
    return {
      name: { companyName: s.name },
      address: {
        countryCode: s.countryCode,
        postalCode: s.postalCode,
        city: s.city,
        street,
        number,
      },
      email: s.email || undefined,
      phoneNumber: s.phone || undefined,
    }
  }
}

/**
 * Best-effort split of a Dutch address line into street + trailing house
 * number. Conservative: only splits when the line clearly ends in a number
 * (optionally with a single letter suffix, e.g. "12A" or "12 B"). When it
 * can't tell, it returns the whole line as `street` and leaves `number`
 * undefined.
 *
 * LIMITATION: multi-letter NL house-number suffixes such as "hs", "bis",
 * "III", or "12-A" are NOT split | they fall back to the whole line as
 * `street` with `number` unset. Task 22 must verify live whether DHL accepts a
 * combined street+number in the `street` field, or whether `number` must
 * always be split out.
 */
function splitStreet(line?: string | null): { street: string; number?: string } {
  const value = (line ?? "").trim()
  if (!value) return { street: "" }
  const match = value.match(/^(.*?)\s+(\d+\s*[a-zA-Z]?)$/)
  if (match) {
    return { street: match[1].trim(), number: match[2].replace(/\s+/g, "") }
  }
  return { street: value }
}

export default DhlParcelFulfillmentProviderService
