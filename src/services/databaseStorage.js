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

async function writeValue(
  key,
  value,
) {
  const db =
    await openStorageDatabase()

  return new Promise(
    (resolve, reject) => {
      const transaction =
        db.transaction(
          STORE_NAME,
          'readwrite',
        )

      const store =
        transaction.objectStore(
          STORE_NAME,
        )

      store.put(
        value,
        key,
      )

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
              `Opslaan van ${key} is mislukt.`,
            ),
          )
        }

      transaction.onabort =
        () => {
          const error =
            transaction.error

          db.close()

          reject(
            error ??
            new Error(
              `Opslaan van ${key} is afgebroken.`,
            ),
          )
        }
    },
  )
}

async function readValue(
  key,
) {
  const db =
    await openStorageDatabase()

  return new Promise(
    (resolve, reject) => {
      const transaction =
        db.transaction(
          STORE_NAME,
          'readonly',
        )

      const store =
        transaction.objectStore(
          STORE_NAME,
        )

      const request =
        store.get(
          key,
        )

      request.onsuccess =
        () => {
          resolve(
            request.result ??
            null,
          )
        }

      request.onerror =
        () => {
          reject(
            request.error ??
            new Error(
              `Lezen van ${key} is mislukt.`,
            ),
          )
        }

      transaction.oncomplete =
        () => {
          db.close()
        }
    },
  )
}

export async function saveDatabaseCache({
  database,
  syncStatus,
}) {
  await Promise.all([
    writeValue(
      DATABASE_KEY,
      database,
    ),

    writeValue(
      STATUS_KEY,
      syncStatus,
    ),
  ])
}

export async function loadDatabaseCache() {
  const [
    database,
    syncStatus,
  ] =
    await Promise.all([
      readValue(
        DATABASE_KEY,
      ),

      readValue(
        STATUS_KEY,
      ),
    ])

  return {
    database,
    syncStatus,
  }
}

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