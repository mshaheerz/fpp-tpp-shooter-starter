import RAPIER from '@dimforge/rapier3d-compat'
import { Vector3, Color } from 'three'
import type { HitInfo, PhysicsSystem } from '../PhysicsSystem'
import type { WeaponStats } from './WeaponData'
import type { GLSLParticleSystem } from '../particle/GLSLParticleSystem'
import type { ImpactParticle } from '../particle/ImpactParticle'
import type { DecalSystem } from '../particle/DecalSystem'
import type { BulletInstancedParticleSystem } from '../particle/BulletInstancedParticleSystem'
import type { WeaponRenderer } from './WeaponRenderer'
import type { CameraRig } from '../Camera'

const _origin = new Vector3()
const _dir = new Vector3()
const _muzzle = new Vector3()
const _eject = new Vector3()
const _normalV = new Vector3()
const _pointV = new Vector3()
const _ejectDir = new Vector3()
const _dirOut = new Vector3()
const _muzzleOut = new Vector3()
const _shotDirOut = new Vector3()

/**
 * Performs the raycast for a shot. The ray origin/direction is whatever the
 * CameraRig considers "crosshair-forward" — gameplay-identical in FPP and TPP.
 *
 * On hit: spawns impact debris, places a decal, kicks back the FPS arm recoil
 * spring (via `onCameraShake`). Brass is ejected from the weapon's eject anchor.
 */
export class WeaponShooter {
  constructor(
    private physics: PhysicsSystem,
    private weapons: WeaponRenderer,
    private muzzleFx: GLSLParticleSystem,
    private impactFx: ImpactParticle,
    private decals: DecalSystem,
    private shells: BulletInstancedParticleSystem,
    private onHit?: (hit: HitInfo, stats: WeaponStats, shotDir: Vector3) => void,
    private onShot?: (muzzle: Vector3, shotDir: Vector3, stats?: WeaponStats) => void,
  ) {}

  fire(camera: CameraRig, stats: WeaponStats, playerBody: RAPIER.RigidBody, onCameraShake: (amount: number) => void) {
    const ray = camera.getCrosshairRay()
    _origin.copy(ray.origin)
    _dir.copy(ray.dir)

    // Apply spread (reduced ×0.2 while ADS — much tighter cone).
    const adsFactor = camera.adsFactor
    const spreadMul = 1 - adsFactor * 0.8
    if (stats.spread > 0) {
      const effective = stats.spread * spreadMul
      const ang = Math.random() * Math.PI * 2
      const r = Math.random() * effective
      _dir.x += Math.cos(ang) * r
      _dir.y += Math.sin(ang) * r
      _dir.normalize()
    }

    const hit = this.physics.raycast(
      { x: _origin.x, y: _origin.y, z: _origin.z },
      { x: _dir.x, y: _dir.y, z: _dir.z },
      300,
      playerBody,
    )
    if (hit) {
      _pointV.set(hit.point.x, hit.point.y, hit.point.z)
      _normalV.set(hit.normal.x, hit.normal.y, hit.normal.z)
      this.impactFx.spawn(_pointV, _normalV)
      this.decals.spawn(_pointV, _normalV)
      _dirOut.copy(_dir)
      this.onHit?.(hit, stats, _dirOut)
    }

    // Muzzle flash at the weapon muzzle anchor (works in both views since the
    // weapon model is the same Object3D, just reparented).
    // Small + bright + ultra-brief — additive blending makes large size-px values
    // look like a torch beam, so keep size tiny and life under one frame at 60fps.
    this.weapons.getMuzzleWorld(_muzzle)
    // Tight spark-like muzzle effect (avoid torch/bomb look).
    this.muzzleFx.spawn(_muzzle, 1, 0.025, 0.7, 3, _dir)
    _muzzleOut.copy(_muzzle)
    _shotDirOut.copy(_dir)
    this.onShot?.(_muzzleOut, _shotDirOut, stats)

    // Brass shell out the ejection port, perpendicular-ish to the weapon forward.
    this.weapons.getEjectWorld(_eject)
    _ejectDir.set(_dir.z, 0.6, -_dir.x).normalize()
    this.shells.spawn(_eject, _ejectDir)

    onCameraShake(stats.cameraShake)
  }
}
