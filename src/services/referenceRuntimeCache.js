// Registration does not import heavy engines into startup. Only loaded engines
// participate; their calculations must not survive a reference-data replacement.
const caches = new Set()
export function registerReferenceCache(cache) { caches.add(cache); return cache }
export function invalidateReferenceCaches() { for (const cache of caches) cache.clear() }
