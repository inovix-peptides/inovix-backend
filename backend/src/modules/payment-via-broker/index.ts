import { ModuleProviderExports } from "@medusajs/framework/types"
import PaymentViaBrokerProviderService from "./service"

const services = [PaymentViaBrokerProviderService]

const providerExport: ModuleProviderExports = { services }

export default providerExport
export { PaymentViaBrokerProviderService }
export { BrokerClient } from "./client"
export * from "./types"
