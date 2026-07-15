// Registers the action callback handlers into the callback registry at load
// time. Imported (for side effects) by commands/router.ts, which every bot
// entrypoint loads. Lives outside callbacks.ts so the registry module never
// value-imports the actions (they import ctx types/helpers from it).
import { CALLBACKS } from '../commands/callbacks'
import { lblAction, lbloAction } from './create-label'
import { shpAction, shpcAction } from './mark-shipped'
import { rstAction } from './restock'

CALLBACKS.lbl = lblAction
CALLBACKS.lblo = lbloAction
CALLBACKS.shp = shpAction
CALLBACKS.shpc = shpcAction
CALLBACKS.rst = rstAction
