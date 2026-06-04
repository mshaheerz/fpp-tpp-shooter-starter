import { MathUtils, Vector3 } from 'three'

/**
 * Shared tuning + small math helpers for the enemy AI. Kept separate from
 * `Enemy.ts` so the numbers are easy to find/tune and the helper functions
 * (perception, cover) can import them without pulling in the class.
 */

// ── Capsule (matches the player default for consistent hit detection) ─────────
export const ENEMY_RADIUS = 0.36
export const ENEMY_HALF_HEIGHT = 0.55
export const ENEMY_FULL_HALF = ENEMY_HALF_HEIGHT + ENEMY_RADIUS // center→feet
export const ENEMY_MAX_HP = 100

// ── Perception / combat (fair-but-dangerous defaults) ─────────────────────────
export const VISION_RANGE = 32 // metres the enemy can see
export const VISION_FOV = MathUtils.degToRad(110) // full cone angle
export const HEARING_RANGE = 22 // gunfire within this radius alerts the enemy
export const ATTACK_RANGE = 24 // starts shooting inside this distance with LoS
export const ATTACK_STOP_RANGE = 16 // stops advancing once within this & has LoS
export const REACTION_TIME = 0.35 // delay between first seeing the player and first shot
export const FIRE_INTERVAL = 0.18 // seconds between shots while attacking
export const BURST_LEN = 4 // shots per burst
export const BURST_PAUSE = 0.7 // pause between bursts
export const AIM_ERROR_BASE = 0.09 // radians of spread when first acquiring
export const AIM_ERROR_SETTLED = 0.025 // radians once aim has settled
export const AIM_SETTLE_TIME = 1.2 // seconds to go from base→settled error
export const ENEMY_DAMAGE = 9 // per hit (low; bursts add up, leaves counterplay)
export const SEARCH_DURATION = 5 // seconds to investigate last-known before giving up
export const REPATH_INTERVAL = 0.4 // how often to recompute a chase path

// ── Territory (guard zone) ────────────────────────────────────────────────────
// Each enemy guards a circular zone centered on its spawn. While idle it patrols
// within that circle; the player entering the circle "attracts" the enemy even
// without line of sight. Attraction is sticky — once alerted, the normal
// chase/attack/search logic takes over and the enemy does NOT leash back.
export const TERRITORY_RADIUS_BASE = 13 // metres
export const TERRITORY_RADIUS_JITTER = 5 // ± this, so ~10.5–15.5m per enemy

/** A territory radius randomized around the base (used by the spawn helpers). */
export function randomTerritoryRadius(): number {
  return TERRITORY_RADIUS_BASE + (Math.random() - 0.5) * 2 * TERRITORY_RADIUS_JITTER
}

// ── Cover (peek & shoot) ──────────────────────────────────────────────────────
export const COVER_SEARCH_RADIUS = 7 // metres around the enemy to look for a hiding spot
export const COVER_REEVAL_INTERVAL = 1.5 // seconds before re-picking a cover spot
export const COVER_ARRIVE_DIST = 1.0 // within this of the cover point counts as "in cover"
export const PEEK_STEP = 1.4 // metres to lean out of cover toward the target to fire

// ── Aggro on damage ───────────────────────────────────────────────────────────
// Being shot expands the enemy's commitment: it engages regardless of range or
// territory and stays aggressive for this long after the last hit.
export const DAMAGE_AGGRO_DURATION = 8 // seconds of forced engagement after a hit

/** Horizontal (XZ) distance between two world points. */
export function distXZ(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.hypot(dx, dz)
}
