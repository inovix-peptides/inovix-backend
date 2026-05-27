import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export type ValidateOrderInput = {
  order: {
    id: string; display_id: number; status: string
    shipping_methods: Array<{ data?: { id?: string }; shipping_option?: { metadata?: Record<string, any> } }>
    items: Array<{ quantity: number; product: { id: string; title: string; weight: number | null } }>
  }
  boxes: Array<{ id?: string; max_items: number }>
}

const validateOrder = createStep(
  "validate-order-for-dhl",
  async (input: ValidateOrderInput) => {
    const { order, boxes } = input

    if (order.status === "canceled" || order.status === "cancelled" || order.status === "refunded") {
      throw new Error(`Order is ${order.status}, geen DHL-label mogelijk`)
    }

    const sm = order.shipping_methods?.[0]
    const optionId = sm?.data?.id
    if (optionId !== "dhl-standard" && optionId !== "dhl-express") {
      throw new Error("Order has no DHL shipping method")
    }

    for (const item of order.items) {
      if (item.product.weight == null) {
        throw new Error(`Product "${item.product.title}" is missing weight`)
      }
    }

    if (!boxes || boxes.length === 0) {
      throw new Error("No box presets configured")
    }

    return new StepResponse({ valid: true, dhl_product_code: optionId === "dhl-express" ? "P" : "H" })
  },
)

export default validateOrder
