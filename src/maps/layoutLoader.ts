import type { MapLayout } from './layoutTypes'

/**
 * Load a .layout.json file for the given map id.
 * Checks IndexedDB first (layouts saved from the Studio via ▶ Run),
 * then falls back to the file on disk.
 *
 * Returns null if no layout exists (graceful fallback — map uses hardcoded
 * spawns or procedural generation).
 */
export async function loadLayout(mapId: string): Promise<MapLayout | null> {
  // 1. Try IndexedDB first (from Studio's "Run" button)
  try {
    const db = await openLayoutDB()
    const json = await getLayoutFromDB(db, mapId)
    if (json) {
      const parsed: MapLayout = JSON.parse(json)
      if (parsed && parsed.version) return parsed
    }
  } catch {
    // IndexedDB unavailable or empty — continue to file fallback
  }

  // 2. Fallback: load from disk
  const url = `./assets/maps/${mapId}.layout.json`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json: MapLayout = await res.json()
    if (!json.version) return null
    return json
  } catch {
    return null
  }
}

/**
 * Read a layout JSON string from IndexedDB for a given mapId.
 * Returns null if nothing is stored.
 */
async function getLayoutFromDB(db: IDBDatabase, mapId: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('layouts', 'readonly')
    const req = tx.objectStore('layouts').get(mapId)
    req.onsuccess = () => resolve(req.result?.json ?? null)
    req.onerror = () => reject(req.error)
  })
}

let _dbPromise: Promise<IDBDatabase> | null = null

function openLayoutDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('map-studio', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('layouts')) {
        db.createObjectStore('layouts', { keyPath: 'mapId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _dbPromise
}

/**
 * Helper: extract a Vec3 as `[x, y, z]` tuple for use with map builder `place()`.
 * Falls back to y=0.5 when the y field is missing.
 */
export function asPosition(v: { x: number; y?: number; z: number }): [number, number, number] {
  return [v.x, v.y ?? 0.5, v.z]
}