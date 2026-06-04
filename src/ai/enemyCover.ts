import { Vector3 } from 'three'
import type { EnemyContext } from './Enemy'
import {
  ENEMY_HALF_HEIGHT,
  COVER_SEARCH_RADIUS,
  distXZ,
} from './enemyConstants'

/**
 * Cover-point search, split out of `Enemy` so the peek-&-shoot logic stays
 * focused. Pure function: it reads the nav grid + line-of-sight test and returns
 * a hiding spot (or null), mutating nothing on the enemy.
 */

const _sample = new Vector3()
const _targetEye = new Vector3()
const _coverEye = new Vector3()
const RINGS = [COVER_SEARCH_RADIUS * 0.5, COVER_SEARCH_RADIUS]
const STEPS = 8

/**
 * Find the closest nearby walkable spot that hides the enemy from the target
 * (no line of sight from the spot's eye height to the target's chest). Samples a
 * couple of rings of candidate angles around `enemyPos`. Returns the chosen point
 * (a fresh Vector3) or null if everything nearby is exposed.
 */
export function findCoverPoint(ctx: EnemyContext, enemyPos: Vector3): Vector3 | null {
  _targetEye.copy(ctx.targetPos).setY(ctx.targetPos.y + 0.5)
  let best: Vector3 | null = null
  let bestDist = Infinity

  for (const radius of RINGS) {
    for (let i = 0; i < STEPS; i++) {
      const angle = (i / STEPS) * Math.PI * 2
      _sample.set(
        enemyPos.x + Math.cos(angle) * radius,
        enemyPos.y,
        enemyPos.z + Math.sin(angle) * radius,
      )
      const cell = ctx.nav.nearestWalkable(_sample, 3)
      if (!cell) continue
      _coverEye.copy(cell).setY(cell.y + ENEMY_HALF_HEIGHT)
      if (ctx.hasLineOfSight(_coverEye, _targetEye)) continue // exposed, skip
      const d = distXZ(cell, enemyPos)
      if (d < bestDist) {
        bestDist = d
        best = cell.clone()
      }
    }
    if (best) break // prefer the inner ring when it yields cover
  }
  return best
}
