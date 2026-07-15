import { Module } from '@medusajs/framework/utils'
import TelegramOpsService from './service'

export const TELEGRAM_OPS_MODULE = 'telegram_ops'
export default Module(TELEGRAM_OPS_MODULE, { service: TelegramOpsService })
