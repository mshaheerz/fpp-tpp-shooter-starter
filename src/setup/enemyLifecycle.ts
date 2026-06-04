import { Vector3 } from 'three'
import type { PhysicsSystem } from '../PhysicsSystem'
import type { CharacterPool } from '../ai/CharacterPool'
import type { DamageSystem } from '../ai/DamageSystem'
import { Enemy } from '../ai/Enemy'
import { ENEMY_RADIUS, ENEMY_HALF_HEIGHT, randomTerritoryRadius } from '../ai/enemyConstants'
import type { Scene } from '../Scene'

const _groundPos = new Vector3()

export interface EnemyLifecycleDeps {
  physics: PhysicsSystem
  scene: Scene
  pool: CharacterPool
  damage: DamageSystem
}

/** Max distance to look for ground below a spawn point. If no ground is found
 *  within this range, the point is outside the map and should be rejected. */
const MAX_GROUND_DIST = 8

/** Validate that a spawn point is valid:
 *  1. Not inside geometry (capsule overlap check)
 *  2. Has ground beneath it (downward raycast) — prevents spawning outside the map */
export function isSpawnSafe(physics: PhysicsSystem, point: Vector3): boolean {
  // Check 1: not inside geometry
  const overlap = physics.overlapBox(
    { x: point.x, y: point.y + ENEMY_HALF_HEIGHT, z: point.z },
    { x: ENEMY_RADIUS, y: ENEMY_HALF_HEIGHT, z: ENEMY_RADIUS },
  )
  if (overlap) return false

  // Check 2: ground exists beneath — cast a ray straight down
  const hit = physics.raycast(
    { x: point.x, y: point.y, z: point.z },
    { x: 0, y: -1, z: 0 },
    MAX_GROUND_DIST,
  )
  if (!hit || hit.toi > MAX_GROUND_DIST - 0.5) {
    // No ground below — this point is outside the map
    return false
  }

  // Check 3: ground distance is reasonable (not too high up)
  if (hit.toi > 3) {
    // If the ground is too far down, the spawn point is floating above the map
    return false
  }

  return true
}

export function spawnRegisteredEnemy(
  deps: EnemyLifecycleDeps,
  spawn: Vector3,
) {
  const enemy = new Enemy(deps.physics, deps.pool, spawn)
  // Each enemy guards a circular zone centered on its spawn
  enemy.setTerritory(spawn, randomTerritoryRadius())
  deps.scene.add(enemy.rig.object)
  deps.damage.register(enemy)
  deps.damage.registerCollider(enemy.colliderHandle, enemy)
  enemy.onDeath = (dead) => deps.damage.unregisterCollider(dead.colliderHandle)
  return enemy
}
