import {createArticleViewsHandler} from '../server/articleViews.js'
const handle=createArticleViewsHandler()
export const GET=request=>handle(request)
export const POST=request=>handle(request)
