import { Color, Vector3 } from 'three'
import { GLSLParticleSystem } from './GLSLParticleSystem'

const _v = new Vector3()

/**
 * Thin wrapper over `GLSLParticleSystem` that emits a short cone of debris
 * along a surface normal. Used on raycast hits.
 */
export class ImpactParticle {
  readonly system: GLSLParticleSystem

  constructor() {
    this.system = new GLSLParticleSystem(new Color(0x9aa0a8), -7)
  }

  spawn(point: Vector3, normal: Vector3, count = 8) {
    _v.copy(normal)
    this.system.spawn(point, count, 0.28, 1.8, 4, _v)
  }

  update(dt: number) {
    this.system.update(dt)
  }
}
