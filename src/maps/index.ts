import type { MapBuilder } from '../Scene'
import { shootRange } from './shootRange'
import { suburbanStreet } from './suburbanStreet'
import { industrialYard } from './industrialYard'
import { ghostCity } from './ghostCity'

/**
 * Describes a playable map. `build()` is called after `Scene.startMap()` so the
 * builder already has a root group + walkable base ready — the module just
 * places props on top.
 */
export interface MapDefinition {
  /** Stable id used by the menu + `Scene.loadMapById(id)`. */
  id: string
  /** Human-readable name shown in the map-selection menu. */
  name: string
  /** One-line subtitle for the menu. */
  description: string
  /** Optional ground-plane override (size in meters, color, or skip the default
   *  flat plane entirely — set `noDefaultGround: true` for monolithic GLB maps
   *  that ship their own floor geometry). */
  scene?: { groundSize?: number; groundColor?: number; noDefaultGround?: boolean }
  /** Place props / set up reactive targets here. */
  build: (b: MapBuilder) => Promise<void>
}

/**
 * Registry of all selectable maps. Order here is the order shown in the menu.
 * To add a new map, drop a file under `src/maps/` exporting a `MapDefinition`
 * and append it here — no other code changes required.
 */
export const MAPS: MapDefinition[] = [shootRange, suburbanStreet, industrialYard, ghostCity]
