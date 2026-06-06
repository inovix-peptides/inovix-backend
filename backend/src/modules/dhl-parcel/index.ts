import { ModuleProviderExports } from "@medusajs/framework/types"
import DhlParcelFulfillmentProviderService from "./service"

const services = [DhlParcelFulfillmentProviderService]

const providerExport: ModuleProviderExports = { services }

export default providerExport
export { DhlParcelFulfillmentProviderService }
export { DhlParcelClient } from "./client"
export { TokenCache } from "./token-cache"
export * from "./types"
