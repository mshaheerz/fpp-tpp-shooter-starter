import type { Vector3 } from 'three'
import type { PhysicsSystem } from '../PhysicsSystem'
import type { CharacterPool } from '../ai/CharacterPool'
import type { DamageSystem } from '../ai/DamageSystem'
import { Enemy } from '../ai/Enemy'
import { randomTerritoryRadius } from '../ai/enemyConstants'
import type { Scene } from '../Scene'

export interface EnemyLifecycleDeps {
  physics: PhysicsSystem
  scene: Scene
  pool: CharacterPool
  damage: DamageSystem
}

export function spawnRegisteredEnemy(
  deps: EnemyLifecycleDeps,
  spawn: Vector3,
) {
  const enemy = new Enemy(deps.physics, deps.pool, spawn)
  // Each enemy guards a circular zone centered on its spawn; the player entering
  // it attracts the enemy even without line of sight. Radius is slightly
  // randomized so zones feel non-uniform.
  enemy.setTerritory(spawn, randomTerritoryRadius())
  deps.scene.add(enemy.rig.object)
  deps.damage.register(enemy)
  deps.damage.registerCollider(enemy.colliderHandle, enemy)
  enemy.onDeath = (dead) => deps.damage.unregisterCollider(dead.colliderHandle)
  return enemy
}
