import {
  Mesh,
  MeshBasicMaterial,
  Vector3,
  Object3D,
  CircleGeometry,
  DoubleSide,
  Group,
  Quaternion,
} from 'three'

const CAPACITY = 100
const SIZE = 0.07
const FADE_TIME = 8

/**
 * Persistent bullet-hole decals. Implementation note: the textbook `DecalGeometry`
 * approach projects against the exact hit mesh and is the highest fidelity, but
 * also the most expensive and requires keeping references to the hit mesh.
 *
 * For a starter we use cheap oriented quads pushed slightly along the surface
 * normal — visually adequate, ~free, and works even when the hit collider isn't
 * a Three.js mesh (e.g. a Rapier-only proxy). Upgrade to `DecalGeometry` later.
 */
export class DecalSystem {
  readonly object = new Group()
  private decals: { mesh: Mesh; born: number }[] = []
  private cursor = 0
  private now = 0

  constructor() {
    const geom = new CircleGeometry(SIZE, 12)
    const mat = new MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false })
    for (let i = 0; i < CAPACITY; i++) {
      const m = new Mesh(geom, mat.clone())
      m.visible = false
      this.object.add(m)
      this.decals.push({ mesh: m, born: -1e9 })
    }
  }

  spawn(point: Vector3, normal: Vector3) {
    const slot = this.decals[this.cursor]
    this.cursor = (this.cursor + 1) % CAPACITY
    slot.mesh.position.copy(point).addScaledVector(normal, 0.005)
    // Orient the disc so its +Z faces along the normal.
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal.clone().normalize())
    slot.mesh.quaternion.copy(q)
    ;(slot.mesh.material as MeshBasicMaterial).opacity = 0.9
    slot.mesh.visible = true
    slot.born = this.now
  }

  update(dt: number) {
    this.now += dt
    for (const d of this.decals) {
      if (!d.mesh.visible) continue
      const age = this.now - d.born
      if (age > FADE_TIME) {
        d.mesh.visible = false
        continue
      }
      const t = age / FADE_TIME
      ;(d.mesh.material as MeshBasicMaterial).opacity = 0.9 * (1 - t)
    }
  }
}

// Keep import unused-symbol happy in case lint runs:
void Object3D
