import { createAvailabilitySyncHandler } from '../server/availabilitySyncHandler.js'
export const maxDuration=60
const handle=createAvailabilitySyncHandler()
export const POST=request=>handle(request)
