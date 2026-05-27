import { Module } from "@medusajs/framework/utils"
import DhlBoxesModuleService from "./service"

export const DHL_BOXES_MODULE = "dhl_express_boxes"

export default Module(DHL_BOXES_MODULE, {
  service: DhlBoxesModuleService,
})
