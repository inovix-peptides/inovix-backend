import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { evaluatePaymentGate } from "../../../admin/widgets/order-fulfillment-checklist.logic"

// Registration key of the dhl-parcel-boxes module (exported as
// DHL_PARCEL_BOXES_MODULE from src/modules/dhl-parcel-boxes). Referenced as a
// literal so resolving the module here does not pull the MikroORM model into
// the workflow's import graph.
const DHL_PARCEL_BOXES_MODULE = "dhl_parcel_boxes"

type ShippingMethod = {
  data?: Record<string, any> | null
  shipping_option?: { provider_id?: string; data?: Record<string, any> | null } | null
}

export type ValidateOrderInput = {
  order: {
    id: string
    display_id: number
    status: string
    shipping_methods?: ShippingMethod[]
    items?: Array<{ quantity: number; product?: { id?: string; title?: string; weight?: number | null } }>
  }
  // The order's broker payment (resolveBrokerPayment) | null when none exists.
  payment?: {
    amount?: unknown
    captured_amount?: unknown
    refunded_amount?: unknown
    canceled_at?: string | Date | null
  } | null
  // True when the operator recorded an explicit, reasoned payment override in
  // the fulfillment checklist. Skips ONLY the payment gate, nothing else.
  paymentOverridden?: boolean
}

/**
 * A shipping method belongs to DHL Parcel when either:
 *  - its shipping_option.provider_id is "dhl-parcel", or
 *  - its `data` carries a dhl_option of DOOR/PS (what flows through from the
 *    provider's getFulfillmentOptions() + validateFulfillmentData()).
 *
 * Exported so build-payload can share the same detection logic rather than
 * independently reading shipping_methods[0] (which picks the wrong method if
 * a non-DHL method is prepended).
 */
export function findDhlParcelMethod(methods: ShippingMethod[]): ShippingMethod | undefined {
  return methods.find((m) => {
    if (m.shipping_option?.provider_id === "dhl-parcel") return true
    const opt = m.data?.dhl_option ?? m.shipping_option?.data?.dhl_option
    return opt === "DOOR" || opt === "PS"
  })
}

const validateOrder = createStep(
  "validate-order-for-dhl-parcel",
  async (input: ValidateOrderInput, { container }: any) => {
    const { order } = input

    if (
      order.status === "canceled" ||
      order.status === "cancelled" ||
      order.status === "refunded"
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Order is ${order.status}, geen DHL Parcel-label mogelijk`,
      )
    }

    if (!input.paymentOverridden) {
      const gate = evaluatePaymentGate(input.payment ?? null)
      if (!gate.ok) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `${gate.reason} | geen DHL-label mogelijk. Controleer de betaling op de bestelpagina of gebruik de override met reden.`
        )
      }
    }

    const items = order.items ?? []
    if (items.length === 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Order has no items, geen DHL Parcel-label mogelijk",
      )
    }

    const method = findDhlParcelMethod(order.shipping_methods ?? [])
    if (!method) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Order has no DHL Parcel shipping method",
      )
    }

    for (const item of items) {
      if (item.product?.weight == null) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Product "${item.product?.title ?? "?"}" heeft nog geen gewicht. Stel een gewicht (in gram) in op dit product en probeer het opnieuw.`,
        )
      }
    }

    const boxesService = container.resolve(DHL_PARCEL_BOXES_MODULE)
    const presets = await boxesService.listDhlParcelBoxPresets()
    if (!presets || presets.length === 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No DHL Parcel box presets configured",
      )
    }

    // dhl_option is the DOOR/PS selection carried on the method's data.
    const dhlOption = (method.data?.dhl_option ??
      method.shipping_option?.data?.dhl_option) as "DOOR" | "PS" | undefined

    return new StepResponse({ valid: true, dhl_option: dhlOption })
  },
)

export default validateOrder
