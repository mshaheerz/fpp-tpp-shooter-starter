import type { Vector3 } from 'three'
import type { PhysicsSystem } from '../PhysicsSystem'
import type { CharacterPool } from '../ai/CharacterPool'
import type { DamageSystem } from '../ai/DamageSystem'
import { Enemy } from '../ai/Enemy'
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
  deps.scene.add(enemy.rig.object)
  deps.damage.register(enemy)
  deps.damage.registerCollider(enemy.colliderHandle, enemy)
  enemy.onDeath = (dead) => deps.damage.unregisterCollider(dead.colliderHandle)
  return enemy
}
