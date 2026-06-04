import { Vector3 } from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { PhysicsSystem } from '../PhysicsSystem'
import type AudioManager from '../audio/AudioManager'
import type { GLSLParticleSystem } from '../particle/GLSLParticleSystem'
import type { SpriteFxSystem } from '../particle/SpriteFxSystem'
import { playSpatialWeaponSound, spawnMuzzleFlash } from './muzzleFx'

const _losDir = new Vector3()
const _muzzleDir = new Vector3()

export interface EnemyCombatDeps {
  physics: PhysicsSystem
  audio: AudioManager
  muzzleFx: GLSLParticleSystem
  getFlashSprites: () => SpriteFxSystem | null
  /** The player's rigid body – excluded from the LoS raycast so the enemy's
   *  sight-line doesn't self-intersect the player's own capsule. */
  playerBody?: RAPIER.RigidBody
}

export function createEnemyCombatHelpers(deps: EnemyCombatDeps) {
  return {
    losClear(from: Vector3, to: Vector3): boolean {
      _losDir.set(to.x - from.x, to.y - from.y, to.z - from.z)
      const dist = _losDir.length()
      if (dist < 0.01) return true
      _losDir.multiplyScalar(1 / dist)
      const hit = deps.physics.raycast(
        { x: from.x, y: from.y, z: from.z },
        { x: _losDir.x, y: _losDir.y, z: _losDir.z },
        dist - 0.4,
        deps.playerBody, // exclude the player's own capsule from LoS ray
      )
      return !hit
    },

    enemyFireFx(muzzle: Vector3, dir: Vector3) {
      _muzzleDir.copy(dir)
      deps.muzzleFx.spawn(muzzle, 1, 0.025, 0.6, 3, _muzzleDir)
      spawnMuzzleFlash(deps.getFlashSprites(), muzzle, _muzzleDir, {
        count: 1,
        life: [0.025, 0.045],
        speed: [0.03, 0.1],
        size: [0.12, 0.2],
        grow: 1.2,
        spread: 0.1,
        opacity: 0.9,
        gravity: 0,
        drag: 4,
      })
      try {
        playSpatialWeaponSound(deps.audio, 'ak47', muzzle, 0.5, 0.08)
      } catch {}
    },
  }
}