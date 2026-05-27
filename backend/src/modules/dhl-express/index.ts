import { ModuleProviderExports } from "@medusajs/framework/types"
import DhlExpressFulfillmentProviderService from "./service"

const services = [DhlExpressFulfillmentProviderService]

const providerExport: ModuleProviderExports = { services }

export default providerExport
export { DhlExpressFulfillmentProviderService }
export { DhlExpressClient } from "./client"
export * from "./types"
