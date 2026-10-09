export const NEWS_IMAGE_BUCKET = 'news-images'
export const MAX_NEWS_IMAGE_BYTES = 5 * 1024 * 1024
const types = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' }
export function validateNewsImage(file) {
  if (!file || !types[file.type] || !/\.(jpe?g|png|webp)$/i.test(file.name)) throw Error('Kies een JPG-, PNG- of WebP-afbeelding.')
  if (!file.size) throw Error('Het bestand is leeg. Kies een andere afbeelding.')
  if (file.size > MAX_NEWS_IMAGE_BYTES) throw Error('De afbeelding mag maximaal 5 MB groot zijn.')
  return types[file.type]
}
export async function uploadNewsImage(client, userId, file) {
  const extension = validateNewsImage(file)
  let bitmap
  try { bitmap = await createImageBitmap(file) } catch { throw Error('Dit bestand is geen geldige afbeelding. Kies een ander bestand.') }
  if (bitmap.width > 10000 || bitmap.height > 10000 || bitmap.width * bitmap.height > 40000000) { bitmap.close(); throw Error('Deze afbeelding is te groot. Gebruik maximaal 10.000 pixels per zijde en 40 megapixels.') }
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap,0,0); bitmap.close()
  const blob = await new Promise(resolve=>canvas.toBlob(resolve,file.type,.9))
  if (!blob || blob.size > MAX_NEWS_IMAGE_BYTES) throw Error('De afbeelding kon niet binnen 5 MB worden verwerkt.')
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const {error} = await client.storage.from(NEWS_IMAGE_BUCKET).upload(path,blob,{contentType:file.type,upsert:false,cacheControl:'3600'})
  if (error) throw error
  return {path,url:client.storage.from(NEWS_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl}
}
export function ownNewsImagePath(client,userId,url) {
  const prefix = client.storage.from(NEWS_IMAGE_BUCKET).getPublicUrl('').data.publicUrl
  if (!String(url).startsWith(prefix)) return null
  const path = String(url).slice(prefix.length).replace(/^\//,'')
  return path.startsWith(userId+'/') && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/.test(path) ? path : null
}
