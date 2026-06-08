import type { MapLayout } from './layoutTypes'

/**
 * Load a .layout.json file for the given map id.
 * Returns null if no layout file exists (graceful fallback).
 *
 * Layout files live in `public/assets/maps/<mapId>.layout.json` and are
 * served from `./assets/maps/<mapId>.layout.json` (Vite resolves public/).
 */
export async function loadLayout(mapId: string): Promise<MapLayout | null> {
  const url = `./assets/maps/${mapId}.layout.json`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json: MapLayout = await res.json()
    // Basic validation
    if (!json.version) return null
    return json
  } catch {
    // No layout file — map uses hardcoded spawns (legacy behaviour).
    return null
  }
}

/**
 * Helper: extract a Vec3 as `[x, y, z]` tuple for use with map builder `place()`.
 * Falls back to y=0.5 when the y field is missing.
 */
export function asPosition(v: { x: number; y?: number; z: number }): [number, number, number] {
  return [v.x, v.y ?? 0.5, v.z]
}