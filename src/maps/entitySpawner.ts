import { Vector3 } from 'three'
import type { PhysicsSystem } from '../PhysicsSystem'
import type { Scene, MapBuilder } from '../Scene'
import type { CharacterPool } from '../ai/CharacterPool'
import type { DamageSystem } from '../ai/DamageSystem'
import type { NavGrid } from '../ai/NavGrid'
import { Enemy } from '../ai/Enemy'
import { ENEMY_RADIUS, ENEMY_HALF_HEIGHT, CHASE_SPEED, PATROL_SPEED, randomTerritoryRadius } from '../ai/enemyConstants'
import type { MapLayout, EnemySpawn, PatrolRoute } from './layoutTypes'
import { asPosition } from './layoutLoader'

const _v = new Vector3()
const _pos = new Vector3()

export interface EntitySpawnerDeps {
  physics: PhysicsSystem
  scene: Scene
  pool: CharacterPool
  damage: DamageSystem
  nav: NavGrid
}

export interface SpawnedEntities {
  playerSpawn: Vector3
  enemies: Enemy[]
}

/**
 * Given a loaded MapLayout, spawn all entities (player spawn, enemies, waypoints).
 * Returns the player spawn position and the array of spawned enemies.
 * Callers should add enemies to their own tracking array and register them.
 */
export function spawnEntitiesFromLayout(
  deps: EntitySpawnerDeps,
  layout: MapLayout,
): SpawnedEntities {
  const { physics, scene, pool, damage, nav } = deps

  // --- Player spawn ---
  let playerSpawn = new Vector3(0, 0.5, 0)
  if (layout.playerSpawn) {
    const ps = layout.playerSpawn
    playerSpawn.set(ps.x, ps.y ?? 0.5, ps.z)
    // Snap to nav mesh so player doesn't spawn inside geometry
    const snapped = nav.nearestWalkable(playerSpawn, 10, _v)
    if (snapped) playerSpawn.copy(snapped).setY(snapped.y + 1.5)
  }

  // --- Build patrol waypoint lookup ---
  const patrolRoutes = new Map<number, Vector3[]>()
  if (layout.waypoints) {
    for (const route of layout.waypoints) {
      const points: Vector3[] = []
      for (const p of route.points) {
        points.push(new Vector3(p.x, p.y ?? 0, p.z))
      }
      patrolRoutes.set(route.id, points)
    }
  }

  // --- Spawn enemies ---
  const enemies: Enemy[] = []
  if (layout.enemies) {
    for (const spawnDef of layout.enemies) {
      const spawnPos = new Vector3(spawnDef.x, spawnDef.y ?? 0.5, spawnDef.z)
      const enemy = new Enemy(physics, pool, spawnPos)
      // Territory
      const terrRadius = spawnDef.territoryRadius ?? randomTerritoryRadius()
      enemy.setTerritory(spawnPos, terrRadius)
      // Patrol route
      if (spawnDef.patrolId !== undefined) {
        const route = patrolRoutes.get(spawnDef.patrolId)
        if (route && route.length > 0) {
          // Set enemy's first path to the route
          enemy.setPathTo(nav, route[0])
        }
      }
      scene.add(enemy.rig.object)
      damage.register(enemy)
      damage.registerCollider(enemy.colliderHandle, enemy)
      enemy.onDeath = (dead) => damage.unregisterCollider(dead.colliderHandle)
      enemies.push(enemy)
    }
  }

  return { playerSpawn, enemies }
}

/**
 * Place props from a layout into the given map builder.
 * Call this during map building (inside `build(b)`).
 */
export async function placePropsFromLayout(
  b: MapBuilder,
  layout: MapLayout,
  baseAssetPath = './assets/kenney/',
): Promise<void> {
  if (!layout.props) return
  for (const prop of layout.props) {
    const pos: [number, number, number] = [prop.x, prop.y ?? 0, prop.z]
    const url = `${baseAssetPath}${prop.asset}`
    const scale = prop.scale ?? 1
    const rotY = prop.rotY ?? 0
    const reactive = prop.reactive
      ? { kind: prop.reactive as 'crate' | 'barrel' | 'target', hp: prop.hp ?? 70 }
      : undefined
    await b.place(url, pos, rotY, scale, reactive, prop.desiredHeight)
  }
}