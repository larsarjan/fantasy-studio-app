const DATABASE_NAME =
  'fantasy-studio-storage'

const DATABASE_VERSION =
  1

const STORE_NAME =
  'cache'

const DATABASE_KEY =
  'database'

const STATUS_KEY =
  'syncStatus'

function openStorageDatabase() {
  return new Promise(
    (resolve, reject) => {
      const request =
        indexedDB.open(
          DATABASE_NAME,
          DATABASE_VERSION,
        )

      request.onupgradeneeded =
        () => {
          const db =
            request.result

          if (
            !db.objectStoreNames.contains(
              STORE_NAME,
            )
          ) {
            db.createObjectStore(
              STORE_NAME,
            )
          }
        }

      request.onsuccess =
        () => {
          resolve(
            request.result,
          )
        }

      request.onerror =
        () => {
          reject(
            request.error ??
            new Error(
              'IndexedDB kon niet worden geopend.',
            ),
          )
        }
    },
  )
}

// Read/write both keys in one transaction: data and snapshot ID must never diverge.
async function cacheTransaction(mode, values) {
  const db = await openStorageDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    let database, syncStatus
    transaction.oncomplete = () => {
      db.close()
      resolve(mode === 'readonly' ? { database: database.result ?? null, syncStatus: syncStatus.result ?? null } : undefined)
    }
    const fail = () => { db.close(); reject(transaction.error ?? new Error('Databasecache-transactie mislukt.')) }
    transaction.onerror = fail
    transaction.onabort = fail
    try {
      if (mode === 'readwrite') {
        store.put(values.database, DATABASE_KEY)
        store.put(values.syncStatus, STATUS_KEY)
      } else {
        database = store.get(DATABASE_KEY)
        syncStatus = store.get(STATUS_KEY)
      }
    } catch (error) {
      transaction.abort()
      db.close()
      reject(error)
    }
  })
}

export function saveDatabaseCache(values) { return cacheTransaction('readwrite', values) }
export function loadDatabaseCache() { return cacheTransaction('readonly') }

export async function clearDatabaseCache() {
  const db =
    await openStorageDatabase()

  return new Promise(
    (resolve, reject) => {
      const transaction =
        db.transaction(
          STORE_NAME,
          'readwrite',
        )

      transaction
        .objectStore(
          STORE_NAME,
        )
        .clear()

      transaction.oncomplete =
        () => {
          db.close()
          resolve()
        }

      transaction.onerror =
        () => {
          const error =
            transaction.error

          db.close()

          reject(
            error ??
            new Error(
              'IndexedDB-cache kon niet worden verwijderd.',
            ),
          )
        }
    },
  )
}
