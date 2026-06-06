import { Module } from '@medusajs/framework/utils'
import DhlParcelSettingsModuleService from './service'

export const DHL_PARCEL_SETTINGS_MODULE = 'dhl_parcel_settings'
export default Module(DHL_PARCEL_SETTINGS_MODULE, { service: DhlParcelSettingsModuleService })
