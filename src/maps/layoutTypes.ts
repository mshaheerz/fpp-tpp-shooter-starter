/**
 * Layout format for visual map editing (Map Studio).
 *
 * Each map that supports visual editing can have an optional companion
 * `.layout.json` file stored alongside the GLB in `public/assets/maps/`.
 * The game loads this file when the map starts and spawns entities
 * (player, enemies, items, props) at the designated positions.
 *
 * Over time this file will replace hardcoded spawn tables like
 * `PLAYER_SPAWNS` in `TdmMatch.ts` and manual coordinate arrays in
 * Kenney-prop map files.
 */

/** 3D position (Y-up world). */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Single enemy spawn entry. */
export interface EnemySpawn {
  x: number
  z: number
  /** Optional Y offset; defaults to 0.5 (just above ground). */
  y?: number
  /** Yaw rotation in radians. */
  rotY?: number
  /** Patrol route id from the waypoints list (optional — free patrol if unset). */
  patrolId?: number
  /** Hit-points override (defaults to 100). */
  hp?: number
  /** Territory patrol radius (defaults to 12 m). */
  territoryRadius?: number
}

/** A named patrol route that one or more enemies can follow. */
export interface PatrolRoute {
  id: number
  points: Vec3[]
}

/** A destructible or decorative prop instance. */
export interface PropSpawn {
  /** Relative path from `./assets/kenney/` to the GLB asset.
   *  e.g. `"prototype/Models/GLB format/crate-color.glb"` */
  asset: string
  x: number
  z: number
  y?: number
  rotY?: number
  scale?: number
  /** If present, the prop is destructible. Kind matches `ReactiveKind` in Scene.ts. */
  reactive?: 'crate' | 'barrel' | 'target'
  /** Hit-points when reactive (defaults: crate=70, barrel=120, target=40). */
  hp?: number
  /** Desired height in metres (overrides scale). */
  desiredHeight?: number
}

/** Full layout definition for a single map. */
export interface MapLayout {
  version: number
  /** The map id this layout belongs to (for validation). */
  mapId?: string
  /** Single player spawn point. */
  playerSpawn?: Vec3
  /** Array of enemy spawns. */
  enemies?: EnemySpawn[]
  /** Named patrol routes for enemies. */
  waypoints?: PatrolRoute[]
  /** Kenney / custom prop instances (decorative + destructible). */
  props?: PropSpawn[]
}