import { Vector3 } from 'three'
import type { PhysicsSystem } from '../PhysicsSystem'
import type { CharacterPool } from '../ai/CharacterPool'
import type { DamageSystem } from '../ai/DamageSystem'
import type { Enemy } from '../ai/Enemy'
import type { NavGrid } from '../ai/NavGrid'
import type { Scene } from '../Scene'
import { dlog } from '../debug/log'
import { spawnRegisteredEnemy } from './enemyLifecycle'

export interface DevBotSetupDeps {
  physics: PhysicsSystem
  scene: Scene
  enemyPool: CharacterPool
  damage: DamageSystem
  nav: NavGrid
  params: URLSearchParams
}

export function setupDevBots(deps: DevBotSetupDeps): Enemy[] {
  const enemies: Enemy[] = []
  const botParam = deps.params.get('bot')
  if (!botParam) return enemies

  const count = Math.max(1, Math.min(8, Number(botParam) || 1))
  for (let index = 0; index < count; index++) {
    const spawn =
      deps.nav.randomWalkable() ?? new Vector3((index - (count - 1) / 2) * 1.5, 3, -6)
    spawn.y = 3
    const enemy = spawnRegisteredEnemy(
      { physics: deps.physics, scene: deps.scene, pool: deps.enemyPool, damage: deps.damage },
      spawn,
    )
    enemies.push(enemy)
  }

  dlog(`[tdm] spawned ${enemies.length} free-roam test bot(s)`)
  return enemies
}
