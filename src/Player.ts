import RAPIER from '@dimforge/rapier3d-compat'
import { Vector3, Mesh, CapsuleGeometry, MeshStandardMaterial } from 'three'
import type { PhysicsSystem } from './PhysicsSystem'
import type { InputManager } from './InputManager'
import type { CameraRig } from './Camera'

const CAPSULE_RADIUS = 0.36
const CAPSULE_HALF_HEIGHT = 0.55 // total height = 2*half + 2*radius = 1.82m
const EYE_HEIGHT = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS * 0.55 // ~0.75m above capsule center
const GROUND_CHECK_DIST = 0.08
const GROUND_NORMAL_Y_MIN = 0.6

const WALK_SPEED = 5.0
const RUN_SPEED = 7.5
const GROUND_ACCEL = 80
const AIR_ACCEL = 30
const FRICTION = 8.0
const JUMP_VELOCITY = 5.5
// Improved jump feel
const COYOTE_TIME = 0.12
const JUMP_BUFFER_TIME = 0.12
const VARIABLE_JUMP_CUTOFF = 0.6
const MAX_FALL_SPEED = -30

const _hVel = new Vector3()
const _wishDir = new Vector3()
const _temp = new Vector3()

/**
 * Quake-style player movement on a Rapier capsule.
 *
 *   - Rigidbody is dynamic with locked rotations; we own velocity directly.
 *   - Movement basis comes from the camera yaw, NOT a physics rotation.
 *   - PM_Accelerate: clamp(wishspeed - currentSpeed, 0, accel*dt) projected onto wishDir.
 *   - Air control: same accel formula with no friction → strafe-jumping emerges.
 *   - Grounded test: short raycast straight down + check normal.y above 0.6.
 */
export class Player {
  readonly body: RAPIER.RigidBody
  readonly position = new Vector3()
  readonly velocity = new Vector3()
  grounded = false
  private coyoteTimer = 0
  private jumpBuffer = 0
  /** Yaw-only forward direction the player wants to travel (in world XZ). */
  readonly moveDir = new Vector3()
  /** Visible capsule mesh, swappable / hideable. */
  readonly debugMesh: Mesh

  constructor(private physics: PhysicsSystem, spawn = new Vector3(0, 5, 0)) {
    this.body = physics.createCapsule({ x: spawn.x, y: spawn.y, z: spawn.z }, CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS)
    this.position.copy(spawn)

    // Visual placeholder; hidden in FPP at runtime.
    const geom = new CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT * 2, 6, 12)
    const mat = new MeshStandardMaterial({ color: 0xcc6622, roughness: 0.7 })
    this.debugMesh = new Mesh(geom, mat)
    this.debugMesh.castShadow = true
  }

  update(dt: number, input: InputManager, camera: CameraRig) {
    // 1) Read current state from the physics body.
    const t = this.body.translation()
    const v = this.body.linvel()
    this.position.set(t.x, t.y, t.z)
    this.velocity.set(v.x, v.y, v.z)

    // 2) Ground check via a short downward raycast from capsule bottom.
    const footY = t.y - CAPSULE_HALF_HEIGHT - CAPSULE_RADIUS * 0.95
    const groundHit = this.physics.raycast(
      { x: t.x, y: footY, z: t.z },
      { x: 0, y: -1, z: 0 },
      GROUND_CHECK_DIST + 0.05,
      this.body,
    )
    this.grounded = !!groundHit && groundHit.normal.y >= GROUND_NORMAL_Y_MIN

    // Update coyote timer and jump buffer timers
    if (this.grounded) {
      this.coyoteTimer = 0
    } else {
      this.coyoteTimer += dt
    }
    if (input.wasPressed('Space')) this.jumpBuffer = JUMP_BUFFER_TIME
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt)

    // 3) Build wish-direction in world space from camera yaw.
    const fwd = camera.yaw
    const sinY = Math.sin(fwd)
    const cosY = Math.cos(fwd)
    let wx = 0,
      wz = 0
    if (input.isDown('KeyW')) {
      wx -= sinY
      wz -= cosY
    }
    if (input.isDown('KeyS')) {
      wx += sinY
      wz += cosY
    }
    if (input.isDown('KeyA')) {
      wx -= cosY
      wz += sinY
    }
    if (input.isDown('KeyD')) {
      wx += cosY
      wz -= sinY
    }
    const wLen = Math.hypot(wx, wz)
    if (wLen > 0) {
      wx /= wLen
      wz /= wLen
    }
    _wishDir.set(wx, 0, wz)
    this.moveDir.copy(_wishDir)

    const sprinting = input.isDown('ShiftLeft') || input.isDown('ShiftRight')
    // ADS suppresses sprint and slows base speed (CS-style).
    const aiming = (camera as { ads?: boolean }).ads === true
    let wishSpeed = (sprinting && !aiming ? RUN_SPEED : WALK_SPEED) * (wLen > 0 ? 1 : 0)
    if (aiming) wishSpeed *= 0.6

    _hVel.set(this.velocity.x, 0, this.velocity.z)

    if (this.grounded) {
      // Friction (only when grounded).
      const speed = _hVel.length()
      if (speed > 0) {
        const drop = Math.max(speed, 1.0) * FRICTION * dt
        const newSpeed = Math.max(0, speed - drop)
        _hVel.multiplyScalar(newSpeed / speed)
      }
      this.accelerate(_hVel, _wishDir, wishSpeed, GROUND_ACCEL, dt)
      // Jump (consume buffer): allow within coyote window after leaving ground
      if (this.jumpBuffer > 0 && (this.grounded || this.coyoteTimer <= COYOTE_TIME)) {
        this.velocity.y = JUMP_VELOCITY
        this.grounded = false
        this.jumpBuffer = 0
      }
    } else {
      // Air control: weaker accel, no friction.
      this.accelerate(_hVel, _wishDir, wishSpeed, AIR_ACCEL, dt)
    }

    // 4) Commit horizontal velocity back to the body; let gravity handle vy.
    // Variable jump height: if player released jump early, clamp upward vel
    if (!input.isDown('Space') && this.velocity.y > VARIABLE_JUMP_CUTOFF) {
      this.velocity.y = Math.min(this.velocity.y, JUMP_VELOCITY * 0.6)
    }
    // Clamp fall speed
    if (this.velocity.y < MAX_FALL_SPEED) this.velocity.y = MAX_FALL_SPEED
    this.body.setLinvel({ x: _hVel.x, y: this.velocity.y, z: _hVel.z }, true)

    // Visual mesh follows the capsule.
    this.debugMesh.position.set(t.x, t.y, t.z)
  }

  /** PM_Accelerate-style step: only add up to (wishspeed - dotvel) along wishDir. */
  private accelerate(vel: Vector3, wishDir: Vector3, wishSpeed: number, accel: number, dt: number) {
    if (wishSpeed <= 0) return
    const currentSpeed = vel.x * wishDir.x + vel.z * wishDir.z
    const addSpeed = wishSpeed - currentSpeed
    if (addSpeed <= 0) return
    let accelSpeed = accel * dt * wishSpeed
    if (accelSpeed > addSpeed) accelSpeed = addSpeed
    vel.x += wishDir.x * accelSpeed
    vel.z += wishDir.z * accelSpeed
  }

  get eyePosition(): Vector3 {
    return _temp.copy(this.position).setY(this.position.y + EYE_HEIGHT - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS) * 0.45)
  }
}

export const PLAYER_CAPSULE = {
  radius: CAPSULE_RADIUS,
  halfHeight: CAPSULE_HALF_HEIGHT,
}
