import {createGrowthHandler} from '../server/growthAnalytics.js'
const handler=createGrowthHandler()
export const GET=request=>handler(request)
