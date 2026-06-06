import { Module } from '@medusajs/framework/utils'
import DhlParcelBoxesModuleService from './service'

export const DHL_PARCEL_BOXES_MODULE = 'dhl_parcel_boxes'
export default Module(DHL_PARCEL_BOXES_MODULE, { service: DhlParcelBoxesModuleService })
