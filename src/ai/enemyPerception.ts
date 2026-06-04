import { Vector3 } from 'three'
import type { EnemyContext } from './Enemy'
import {
  VISION_RANGE,
  VISION_FOV,
  distXZ,
} from './enemyConstants'

/**
 * Pure perception helpers, split out of `Enemy.think` so the sensing rules are
 * small and independently readable. They take primitives + the shared context
 * and return plain results — no class state is mutated here.
 */

const _facing = new Vector3()

/** Result of the per-tick sight test. */
export interface SightResult {
  /** True if the enemy currently sees the target (FOV + range + line of sight). */
  canSee: boolean
  /** Horizontal distance to the target (always computed, even when unseen). */
  dist: number
}

/**
 * Can this enemy see the target right now? Combines range, a forward FOV cone
 * (skipped at point-blank for peripheral awareness), and a physics line-of-sight
 * test via `ctx.hasLineOfSight`.
 */
export function computeSight(
  ctx: EnemyContext,
  eye: Vector3,
  targetEye: Vector3,
  enemyPos: Vector3,
  yaw: number,
  toTargetXZ: Vector3,
): SightResult {
  const dist = toTargetXZ.length()
  if (!ctx.target.alive || dist > VISION_RANGE) return { canSee: false, dist }

  _facing.set(Math.sin(yaw), 0, Math.cos(yaw))
  const cosAngle = dist > 0.001 ? _facing.dot(toTargetXZ) / dist : 1
  const inFov = dist < 3 || cosAngle >= Math.cos(VISION_FOV / 2)
  if (!inFov) return { canSee: false, dist }

  return { canSee: ctx.hasLineOfSight(eye, targetEye), dist }
}

/** True if `pos` lies within `radius` of the territory center (XZ plane). */
export function isInTerritory(targetPos: Vector3, center: Vector3, radius: number): boolean {
  return radius > 0 && distXZ(targetPos, center) <= radius
}
