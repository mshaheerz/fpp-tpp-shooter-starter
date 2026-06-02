import { Color } from 'three'
import type { Scene } from '../Scene'
import { GLSLParticleSystem } from '../particle/GLSLParticleSystem'
import { ImpactParticle } from '../particle/ImpactParticle'
import { DecalSystem } from '../particle/DecalSystem'
import { BulletInstancedParticleSystem } from '../particle/BulletInstancedParticleSystem'

export interface Particles {
  muzzleFx: GLSLParticleSystem
  smokeFx: GLSLParticleSystem
  impactFx: ImpactParticle
  decals: DecalSystem
  shells: BulletInstancedParticleSystem
  /** Step every particle system one frame. */
  update(dt: number): void
}

/**
 * Create the bullet/impact/smoke/shell particle systems and add them to the
 * scene root (so they aren't culled with the FPP arms). Returns the systems plus
 * a single `update(dt)` that ticks them all.
 */
export function createParticles(scene: Scene): Particles {
  const muzzleFx = new GLSLParticleSystem(new Color(0xffe07a), 0)
  scene.add(muzzleFx.points)
  const smokeFx = new GLSLParticleSystem(new Color(0x9da4ad), -0.6)
  scene.add(smokeFx.points)
  const impactFx = new ImpactParticle()
  scene.add(impactFx.system.points)
  const decals = new DecalSystem()
  scene.add(decals.object)
  const shells = new BulletInstancedParticleSystem()
  scene.add(shells.mesh)

  return {
    muzzleFx,
    smokeFx,
    impactFx,
    decals,
    shells,
    update(dt: number) {
      muzzleFx.update(dt)
      smokeFx.update(dt)
      impactFx.update(dt)
      decals.update(dt)
      shells.update(dt)
    },
  }
}
