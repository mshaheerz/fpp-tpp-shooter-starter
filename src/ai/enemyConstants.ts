import { MathUtils, Vector3 } from 'three'

/**
 * Shared tuning + small math helpers for the enemy AI. Kept separate from
 * `Enemy.ts` so the numbers are easy to find/tune.
 */

// ── Capsule (matches the player default for consistent hit detection) ─────────
export const ENEMY_RADIUS = 0.36
export const ENEMY_HALF_HEIGHT = 0.55
export const ENEMY_FULL_HALF = ENEMY_HALF_HEIGHT + ENEMY_RADIUS // center→feet
export const ENEMY_MAX_HP = 100

// ── Perception / combat — PURE DISTANCE-BASED (no LoS checks) ────────────────
export const VISION_RANGE = 32       // metres — sees player at this distance
export const WALK_DISTANCE = 24      // walk toward player beyond this
export const RUN_DISTANCE = 16       // start running inside this distance
export const ATTACK_RANGE = 12       // start shooting inside this distance
export const STANDOFF_RANGE = 8      // stop advancing when within this distance (comfortable shooting range)
export const FIRE_INTERVAL = 0.25    // seconds between shots
export const BURST_LEN = 3           // shots per burst
export const BURST_PAUSE = 0.6       // pause between bursts
export const AIM_ERROR_BASE = 0.12   // radians of spread
export const AIM_ERROR_SETTLED = 0.04
export const AIM_SETTLE_TIME = 0.8   // seconds to settle aim
export const ENEMY_DAMAGE = 9        // per hit
export const PATROL_SPEED = 1.6      // m/s walk speed
export const CHASE_SPEED = 4.2       // m/s run speed
export const REPATH_INTERVAL = 0.4   // how often to recompute a chase path

// ── Territory (guard zone) ────────────────────────────────────────────────────
export const TERRITORY_RADIUS_BASE = 13
export const TERRITORY_RADIUS_JITTER = 5

/** A territory radius randomized around the base. */
export function randomTerritoryRadius(): number {
  return TERRITORY_RADIUS_BASE + (Math.random() - 0.5) * 2 * TERRITORY_RADIUS_JITTER
}

// ── Aggro on damage ───────────────────────────────────────────────────────────
export const DAMAGE_AGGRO_DURATION = 8

/** Horizontal (XZ) distance between two world points. */
export function distXZ(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.hypot(dx, dz)
}