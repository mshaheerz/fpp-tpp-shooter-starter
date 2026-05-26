import {
  InstancedMesh,
  CylinderGeometry,
  MeshStandardMaterial,
  Object3D,
  Vector3,
  Quaternion,
  Euler,
  Color,
} from 'three'

const CAPACITY = 256
const GRAVITY = -12
const GROUND_Y = 0.02

interface ShellState {
  active: boolean
  pos: Vector3
  vel: Vector3
  rot: Quaternion
  angVel: Vector3
  age: number
  life: number
}

const _v = new Vector3()
const _e = new Euler(0, 0, 0, 'XYZ')
const _q = new Quaternion()
const _proxy = new Object3D()

/**
 * Bullet brass shells via `InstancedMesh`. Pure visual — no Rapier collisions.
 * Shells fall under gravity, bounce once, and recycle FIFO.
 */
export class BulletInstancedParticleSystem {
  readonly mesh: InstancedMesh
  private states: ShellState[] = []
  private cursor = 0

  constructor() {
    const geom = new CylinderGeometry(0.005, 0.005, 0.022, 6)
    const mat = new MeshStandardMaterial({ color: new Color(0xc9a93b), metalness: 0.6, roughness: 0.4 })
    this.mesh = new InstancedMesh(geom, mat, CAPACITY)
    this.mesh.frustumCulled = false
    for (let i = 0; i < CAPACITY; i++) {
      this.states.push({
        active: false,
        pos: new Vector3(),
        vel: new Vector3(),
        rot: new Quaternion(),
        angVel: new Vector3(),
        age: 0,
        life: 3,
      })
      _proxy.position.set(0, -1000, 0)
      _proxy.updateMatrix()
      this.mesh.setMatrixAt(i, _proxy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  spawn(origin: Vector3, ejectDir: Vector3) {
    const idx = this.cursor
    this.cursor = (this.cursor + 1) % CAPACITY
    const s = this.states[idx]
    s.active = true
    s.age = 0
    s.life = 3
    s.pos.copy(origin)
    _v.copy(ejectDir).normalize().multiplyScalar(2.4 + Math.random() * 1.2)
    _v.y += 1.5 + Math.random() * 0.5
    s.vel.copy(_v)
    s.angVel.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20)
    s.rot.identity()
  }

  update(dt: number) {
    for (let i = 0; i < CAPACITY; i++) {
      const s = this.states[i]
      if (!s.active) continue
      s.age += dt
      // Integrate.
      s.vel.y += GRAVITY * dt
      s.pos.addScaledVector(s.vel, dt)
      // Ground bounce.
      if (s.pos.y < GROUND_Y) {
        s.pos.y = GROUND_Y
        s.vel.y = -s.vel.y * 0.3
        s.vel.x *= 0.5
        s.vel.z *= 0.5
        s.angVel.multiplyScalar(0.5)
      }
      _e.set(s.angVel.x * dt, s.angVel.y * dt, s.angVel.z * dt)
      _q.setFromEuler(_e)
      s.rot.multiply(_q)
      _proxy.position.copy(s.pos)
      _proxy.quaternion.copy(s.rot)
      _proxy.scale.set(1, 1, 1)
      if (s.age >= s.life) {
        s.active = false
        _proxy.position.set(0, -1000, 0)
      }
      _proxy.updateMatrix()
      this.mesh.setMatrixAt(i, _proxy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
