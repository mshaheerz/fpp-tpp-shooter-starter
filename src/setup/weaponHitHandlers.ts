import { Vector3 } from 'three'
import type { HitInfo } from '../PhysicsSystem'
import type { Scene } from '../Scene'
import type { Player } from '../Player'
import type { DamageSystem } from '../ai/DamageSystem'
import type { HUD } from '../HUD'
import type AudioManager from '../audio/AudioManager'
import type { WeaponStats } from '../weapon/WeaponData'
import type { GLSLParticleSystem } from '../particle/GLSLParticleSystem'
import type { ImpactParticle } from '../particle/ImpactParticle'
import type { SpriteFxSystem } from '../particle/SpriteFxSystem'
import { playSpatialWeaponSound, spawnMuzzleFlash } from './muzzleFx'

const _hitPoint = new Vector3()
const _hitNormal = new Vector3()
const _up = new Vector3(0, 1, 0)

export interface WeaponHitHandlerDeps {
  damage: DamageSystem
  player: Player
  scene: Scene
  smokeSprites: SpriteFxSystem | null
  flashSprites: SpriteFxSystem | null
  smokeFx: GLSLParticleSystem
  impactFx: ImpactParticle
  getHud: () => HUD
  audio: AudioManager
}

export function createWeaponHitHandlers(deps: WeaponHitHandlerDeps) {
  const spawnImpactSmoke = (point: Vector3, normal: Vector3) => {
    deps.smokeSprites?.spawn(point, {
      count: 2,
      life: [0.2, 0.45],
      speed: [0.12, 0.45],
      size: [0.14, 0.24],
      grow: 1.8,
      spread: 0.35,
      dir: normal,
      opacity: 0.42,
      gravity: -0.16,
      drag: 2.2,
    })
  }

  const spawnCombatantSmoke = (point: Vector3, normal: Vector3) => {
    deps.smokeSprites?.spawn(point, {
      count: 3,
      life: [0.18, 0.4],
      speed: [0.2, 0.7],
      size: [0.12, 0.2],
      grow: 1.6,
      spread: 0.5,
      dir: normal,
      opacity: 0.5,
      gravity: -0.1,
      drag: 2.0,
    })
  }

  const spawnBarrelSmoke = (point: Vector3) => {
    deps.smokeSprites?.spawn(point, {
      count: 16,
      life: [0.7, 1.4],
      speed: [0.25, 0.95],
      size: [0.45, 0.9],
      grow: 2.6,
      spread: 0.9,
      dir: _up,
      opacity: 0.62,
      gravity: -0.2,
      drag: 1.0,
    })
  }

  return {
    onHit(hit: HitInfo, stats: WeaponStats, shotDir: Vector3) {
      _hitPoint.set(hit.point.x, hit.point.y, hit.point.z)
      _hitNormal.set(hit.normal.x, hit.normal.y, hit.normal.z)

      if (deps.damage.applyHitByCollider(hit.colliderHandle, stats.damage, deps.player.team)) {
        spawnCombatantSmoke(_hitPoint, _hitNormal)
        deps.getHud().flashHitMarker()
        try {
          deps.audio.play('hitmarker', { volume: 0.5 })
        } catch {}
        return
      }

      deps.scene.applyBulletImpulse(hit.colliderHandle, _hitPoint, shotDir, stats.damage)
      const reaction = deps.scene.applyBulletHit(hit.colliderHandle, stats.damage)

      if (deps.smokeSprites) {
        spawnImpactSmoke(_hitPoint, _hitNormal)
      } else {
        deps.impactFx.spawn(_hitPoint, _hitNormal, 4)
      }

      if (reaction.destroyed && reaction.kind === 'barrel') {
        deps.smokeFx.spawn(_hitPoint, 24, 1.1, 1.4, 18, _up)
        if (!deps.smokeSprites) deps.impactFx.spawn(_hitPoint, _up, 22)
        spawnBarrelSmoke(_hitPoint)
      }
    },

    onMuzzle(muzzle: Vector3, shotDir: Vector3, stats?: WeaponStats) {
      try {
        const id = stats?.id ?? 'ak47'
        playSpatialWeaponSound(deps.audio, id, muzzle, 0.9, 0.06)
      } catch (e) {
        console.warn('[audio] play failed', e)
      }

      spawnMuzzleFlash(deps.flashSprites, muzzle, shotDir, {
        count: 1,
        life: [0.025, 0.045],
        speed: [0.03, 0.12],
        size: [0.14, 0.22],
        grow: 1.2,
        spread: 0.1,
        opacity: 0.55,
        gravity: 0,
        drag: 7.0,
      })
    },
  }
}
