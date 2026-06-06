import { MedusaService } from '@medusajs/framework/utils'
import { DhlParcelSettings } from './models/settings'

class DhlParcelSettingsModuleService extends MedusaService({ DhlParcelSettings }) {}
export default DhlParcelSettingsModuleService
