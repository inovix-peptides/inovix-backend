import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { sumOrderWeightGrams, suggestBoxPreset } from "../../../modules/dhl-parcel/box-selector"
import { findDhlParcelMethod } from "./validate-order"

// Same literal as in validate-order: the dhl-parcel-boxes module registration
// key. Used as a string so this step does not pull the MikroORM model into the
// workflow's import graph.
const DHL_PARCEL_BOXES_MODULE = "dhl_parcel_boxes"

type BoxPreset = {
  id: string
  name: string
  // Real DHL keys confirmed 2026-06-06: LARGE does not exist; XSMALL and SMALL_MEDIUM do.
  parcel_type_key: "XSMALL" | "SMALL" | "SMALL_MEDIUM" | "MEDIUM"
  max_items: number
  length_cm: number
  width_cm: number
  height_cm: number
}

export type BuildPayloadInput = {
  order: {
    id: string
    display_id: number
    shipping_methods?: Array<{
      data?: Record<string, any> | null
      shipping_option?: { data?: Record<string, any> | null } | null
    }>
    items: Array<{ quantity: number; product?: { weight?: number | null } & Record<string, any> }>
  }
}

/**
 * CONTRACT with DhlParcelFulfillmentProviderService.createFulfillment:
 *
 * This step is the single owner of the fulfillment `data` and `items` that the
 * provider depends on. It MUST:
 *   - set `dhl_parcel_type_key` (the DHL parcel type from the chosen box preset)
 *   - set `dhl_box_dimensions` ({ length, width, height } in cm)
 *   - carry `dhl_option` (DOOR/PS) and, for PS, `service_point_id`
 *   - return `items` enriched with `product.weight`, because the provider calls
 *     `sumOrderWeightGrams(items)` and reads `items[i].product.weight`.
 *
 * It MUST NOT generate `dhl_label_id`: the provider derives that deterministically
 * from `order.display_id` (idempotency seed at DHL). See service.ts.
 */
const buildPayload = createStep(
  "build-dhl-parcel-payload",
  async (input: BuildPayloadInput, { container }: any) => {
    const { order } = input
    const items = order.items ?? []

    // Total weight in grams + total units (sum of quantities).
    const dhlTotalWeightGrams = sumOrderWeightGrams(
      items.map((it) => ({ quantity: it.quantity, product: it.product })),
    )
    const totalUnits = items.reduce((sum, it) => sum + it.quantity, 0)

    // Pick the best-fit box preset for the unit count.
    const boxesService = container.resolve(DHL_PARCEL_BOXES_MODULE)
    const presets: BoxPreset[] = await boxesService.listDhlParcelBoxPresets()
    const { preset } = suggestBoxPreset(presets, totalUnits)

    // Use the shared finder so we pick the DHL Parcel method specifically, not
    // just shipping_methods[0] which may be a fee/discount method.
    const method = findDhlParcelMethod(order.shipping_methods ?? [])
    const methodData = { ...(method?.shipping_option?.data ?? {}), ...(method?.data ?? {}) }
    const dhlOption = methodData.dhl_option as "DOOR" | "PS" | undefined
    const servicePointId =
      dhlOption === "PS" ? (methodData.service_point_id as string | undefined) : undefined

    // Enrich items so the provider can recompute weight from product.weight.
    const enrichedItems = items.map((it) => ({
      ...it,
      product: { ...(it.product ?? {}), weight: it.product?.weight },
    }))

    return new StepResponse({
      dhl_option: dhlOption,
      service_point_id: servicePointId,
      dhl_parcel_type_key: preset.parcel_type_key,
      dhl_box_dimensions: {
        length: preset.length_cm,
        width: preset.width_cm,
        height: preset.height_cm,
      },
      dhl_total_weight_grams: dhlTotalWeightGrams,
      total_units: totalUnits,
      items: enrichedItems,
    })
  },
)

export default buildPayload
