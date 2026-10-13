import { createReferenceSyncHandler } from '../server/referenceSyncHandler.js'
export const maxDuration = 240
const handle = createReferenceSyncHandler()
export const POST = request => handle(request)
