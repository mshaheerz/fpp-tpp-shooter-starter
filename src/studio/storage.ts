/**
 * IndexedDB persistence for Map Studio.
 * Stores the current layout JSON per mapId so work is never lost,
 * and so the game can load layouts produced by the studio.
 */

const DB_NAME = 'map-studio'
const DB_VERSION = 1
const STORE_NAME = 'layouts'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'mapId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Save a layout JSON string for a mapId. */
export async function saveLayoutToIndexedDB(mapId: string, json: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put({ mapId, json, updatedAt: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('[storage] IndexedDB save failed:', e)
  }
}

/** Load a layout JSON string for a mapId from IndexedDB. */
export async function loadLayoutFromIndexedDB(mapId: string): Promise<string | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(mapId)
      req.onsuccess = () => resolve(req.result?.json ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('[storage] IndexedDB load failed:', e)
    return null
  }
}

/** Delete a stored layout for a mapId. */
export async function deleteLayoutFromIndexedDB(mapId: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(mapId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('[storage] IndexedDB delete failed:', e)
  }
}

/** List all stored mapIds with their update timestamps. */
export async function listStoredLayouts(): Promise<Array<{ mapId: string; updatedAt: number }>> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).getAll()
      req.onsuccess = () => resolve(req.result.map((r: any) => ({ mapId: r.mapId, updatedAt: r.updatedAt })))
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}