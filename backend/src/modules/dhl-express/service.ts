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
}

export default DhlExpressFulfillmentProviderService
