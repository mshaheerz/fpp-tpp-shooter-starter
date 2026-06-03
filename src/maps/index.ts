import type { MapBuilder } from '../Scene'

/**
 * Metadata for a map shown in the menu. Only id, name, and description are
 * included — the actual map logic is lazy-loaded on demand.
 */
export interface MapMeta {
  /** Stable id used by the menu + `Scene.loadMapById(id)`. */
  id: string
  /** Human-readable name shown in the map-selection menu. */
  name: string
  /** One-line subtitle for the menu. */
  description: string
}

/**
 * Full map definition including the build function. Only loaded when the map
 * is actually selected to play.
 */
export interface MapDefinition extends MapMeta {
  /** Optional ground-plane override (size in meters, color, or skip the default
   *  flat plane entirely — set `noDefaultGround: true` for monolithic GLB maps
   *  that ship their own floor geometry). */
  scene?: { groundSize?: number; groundColor?: number; noDefaultGround?: boolean }
  /** Place props / set up reactive targets here. */
  build: (b: MapBuilder) => Promise<void>
}

/**
 * Metadata registry of all selectable maps shown in the menu.
 * Order here is the order shown in the menu.
 * To add a new map, add an entry here and implement the loader in `loadMap()`.
 */
export const MAPS: MapMeta[] = [
  {
    id: 'shootRange',
    name: 'Shooting Range',
    description: 'Open block grid with road cross, perimeter walls, mixed buildings, and a central shooting playground.',
  },
  {
    id: 'suburbanStreet',
    name: 'Suburban Street',
    description: 'A quiet suburban neighborhood with houses, trees, and parked cars.',
  },
  {
    id: 'industrialYard',
    name: 'Industrial Yard',
    description: 'A sprawling industrial complex with warehouses, machinery, and shipping containers.',
  },
  {
    id: 'ghostCity',
    name: 'Ghost City',
    description: 'Abandoned urban area with overgrown structures and eerie atmosphere.',
  },
  {
    id: 'deathmatch1',
    name: 'Team deathmatch 1',
    description: 'A pre-authored tdm (monolithic GLB). Atmospheric, large, no reactive props.',
  },
  {
    id: 'deathmatch2',
    name: 'Team deathmatch 2',
    description: 'Arena-style combat zone for team battles.',
  },
]

/**
 * Lazy-load a map definition by id. Only loaded when the map is selected.
 * Returns null if the map id is not found.
 */
export async function loadMap(id: string): Promise<MapDefinition | null> {
  try {
    switch (id) {
      case 'shootRange':
        return (await import('./shootRange')).shootRange
      case 'suburbanStreet':
        return (await import('./suburbanStreet')).suburbanStreet
      case 'industrialYard':
        return (await import('./industrialYard')).industrialYard
      case 'ghostCity':
        return (await import('./ghostCity')).ghostCity
      case 'deathmatch1':
        return (await import('./deathmatch1')).deathMatch1
      case 'deathmatch2':
        return (await import('./deathmatch2')).deathMatch2
      default:
        console.warn('[maps] unknown map id:', id)
        return null
    }
  } catch (e) {
    console.error('[maps] failed to load map:', id, e)
    return null
  }
}
