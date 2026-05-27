import { MedusaService } from "@medusajs/framework/utils"
import { DhlBoxPreset } from "./models/box-preset"

class DhlBoxesModuleService extends MedusaService({
  DhlBoxPreset,
}) {}

export default DhlBoxesModuleService
