import { MedusaService } from '@medusajs/framework/utils'
import { DhlParcelBoxPreset } from './models/box-preset'

class DhlParcelBoxesModuleService extends MedusaService({ DhlParcelBoxPreset }) {}
export default DhlParcelBoxesModuleService
