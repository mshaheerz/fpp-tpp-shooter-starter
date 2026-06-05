import RAPIER from '@dimforge/rapier3d-compat'
import { Vector3, Mesh, CapsuleGeometry, MeshStandardMaterial } from 'three'
import type { PhysicsSystem } from './PhysicsSystem'
import type { InputManager } from './InputManager'
import type { CameraRig } from './Camera'
import type { Combatant, Team } from './ai/DamageSystem'
import { dlog } from './debug/log'
import { updateCrouch } from './player/crouch'
import { DEFAULT_CLIMB_DURATION, PlayerMode, tryGrabLedge, updateClimbing, updateHanging } from './player/ledge'
import {
  AIR_ACCEL,
  CAPSULE_HALF_HEIGHT,
  CAPSULE_RADIUS,
  COYOTE_TIME,
  CROUCH_SPEED_SCALE,
  EYE_HEIGHT_FRACTION,
  FRICTION,
  GROUND_ACCEL,
  GROUND_CHECK_DIST,
  GROUND_NORMAL_Y_MIN,
  JUMP_BUFFER_TIME,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  PLAYER_MAX_HP,
  RUN_SPEED,
  VARIABLE_JUMP_CUTOFF,
  WALK_SPEED,
} from './player/movementConstants'

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
export class Player implements Combatant {
  readonly body: RAPIER.RigidBody
  private readonly collider: RAPIER.Collider
  readonly position = new Vector3()
  readonly velocity = new Vector3()
  grounded = false
  private coyoteTimer = 0
  private jumpBuffer = 0

  // ── Combatant (health / team) ──────────────────────────────────────────────
  readonly id = 'player'
  team: Team = 'blue'
  maxHp = PLAYER_MAX_HP
  hp = PLAYER_MAX_HP
  alive = true
  /** Fired when damaged (HUD flash / damage indicator). */
  onDamaged?: (amount: number, fromTeam: Team) => void
  /** Fired the frame the player dies. */
  onDeath?: () => void
  /** Rapier collider handle of the capsule — registered with the DamageSystem
   *  so enemy bullets that hit it route to the player. */
  get colliderHandle(): number {
    return this.collider.handle
  }

  // ── Live-tunable capsule dimensions ────────────────────────────────────────
  // `standingHalfHeight`/`radius` are the player's configured standing size.
  // `currentHalfHeight` is what the collider is actually set to right now (it
  // dips toward the crouch size while crouching). All in metres.
  standingHalfHeight = CAPSULE_HALF_HEIGHT
  radius = CAPSULE_RADIUS
  currentHalfHeight = CAPSULE_HALF_HEIGHT
  /** Eye offset above capsule center as a fraction of the full half-extent. */
  eyeHeightFraction = EYE_HEIGHT_FRACTION

  // ── Crouch state ────────────────────────────────────────────────────────────
  crouching = false
  /** 0 = fully standing, 1 = fully crouched. Eased for smooth camera/visual. */
  crouchT = 0
  /** Yaw-only forward direction the player wants to travel (in world XZ). */
  readonly moveDir = new Vector3()
  /** Visible capsule mesh, swappable / hideable. */
  readonly debugMesh: Mesh

  // Ledge grab / climb state.
  mode: PlayerMode = 'normal'
  /** Outward-facing wall normal at the grabbed ledge (horizontal, length 1). */
  readonly ledgeWallNormal = new Vector3()
  /** World position of the grabbed ledge edge (used as the hand anchor). */
  readonly ledgeAnchor = new Vector3()
  /** Yaw the character should hold while hanging (facing the wall). */
  ledgeYaw = 0
  /** Increases each frame while shimmying so callers can pick L/R clip. */
  ledgeShimmyDir: -1 | 0 | 1 = 0
  /** True for one frame on the tick the player grabs a ledge. */
  ledgeJustGrabbed = false
  /** True for one frame on the tick the player starts the pull-up. */
  climbJustStarted = false
  climbTimer = 0
  climbDuration = DEFAULT_CLIMB_DURATION
  /** World position the capsule will be teleported to when the climb finishes. */
  climbTargetPos = new Vector3()
  regrabCooldown = 0

  /** Tell the player how long the ledge_climb_up clip is (seconds). Call this
   *  once after the character finishes loading its manifest. */
  setClimbDuration(seconds: number) {
    if (Number.isFinite(seconds) && seconds > 0.1) this.climbDuration = seconds
  }

  constructor(readonly physics: PhysicsSystem, spawn = new Vector3(0, 5, 0)) {
    const { body, collider } = physics.createCapsule(
      { x: spawn.x, y: spawn.y, z: spawn.z },
      CAPSULE_HALF_HEIGHT,
      CAPSULE_RADIUS,
    )
    this.body = body
    this.collider = collider
    this.position.copy(spawn)

    // Visual placeholder; hidden in FPP at runtime.
    const geom = new CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT * 2, 6, 12)
    const mat = new MeshStandardMaterial({ color: 0xcc6622, roughness: 0.7 })
    this.debugMesh = new Mesh(geom, mat)
    this.debugMesh.castShadow = true
  }

  // ── Capsule sizing API (used by the debugger + crouch) ──────────────────────

  /** Full standing height of the player in metres (top of head to feet). */
  get standingHeight(): number {
    return (this.standingHalfHeight + this.radius) * 2
  }

  /** Current full height in metres (shrinks while crouching). */
  get currentHeight(): number {
    return (this.currentHalfHeight + this.radius) * 2
  }

  get capsuleRadius(): number {
    return this.radius
  }

  /**
   * Set the standing (uncrouched) height in metres. The radius is preserved, so
   * `halfHeight = height/2 - radius` and is clamped so the capsule never inverts.
   * Re-applies the collider size immediately if not mid-crouch.
   */
  setStandingHeight(height: number) {
    const half = Math.max(0.05, height / 2 - this.radius)
    this.standingHalfHeight = half
    // If we're standing (not mid-crouch), the live half-height should follow
    // the new standing value immediately.
    if (this.crouchT < 0.001) this.currentHalfHeight = half
    this.applyCapsuleSize()
  }

  /** Set the capsule radius in metres (clamped to a sane minimum). */
  setRadius(radius: number) {
    this.radius = Math.max(0.1, radius)
    try {
      this.collider.setRadius(this.radius)
    } catch {}
    this.applyCapsuleSize()
  }

  /**
   * Push `currentHalfHeight` to the collider and rebuild the visual capsule so
   * the debug mesh matches the physics shape. Called whenever dimensions change.
   */
  applyCapsuleSize() {
    try {
      this.collider.setHalfHeight(this.currentHalfHeight)
    } catch {}
    // Rebuild the placeholder geometry to match (cheap; only on size change).
    const geom = new CapsuleGeometry(this.radius, this.currentHalfHeight * 2, 6, 12)
    this.debugMesh.geometry.dispose()
    this.debugMesh.geometry = geom
  }

  update(dt: number, input: InputManager, camera: CameraRig) {
    // Reset one-frame flags from the previous tick.
    this.ledgeJustGrabbed = false
    this.climbJustStarted = false
    this.ledgeShimmyDir = 0
    if (this.regrabCooldown > 0) {
      this.regrabCooldown = Math.max(0, this.regrabCooldown - dt)
    }

    if (updateClimbing(this, dt)) {
      return
    }

    if (updateHanging(this, input, dt)) {
      return
    }

    // NORMAL movement.
    // 1) Read current state from the physics body.
    const t = this.body.translation()
    const v = this.body.linvel()
    this.position.set(t.x, t.y, t.z)
    this.velocity.set(v.x, v.y, v.z)

    // Crouch: hold Ctrl/C to lower the capsule. Standing back up requires
    // headroom — if something is directly above, stay crouched until it clears.
    updateCrouch(this, input, t, dt)

    // 2) Ground check via a short downward raycast from capsule bottom.
    const footY = t.y - this.currentHalfHeight - this.radius * 0.95
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
    // ADS should not change gameplay speed; keep locomotion feel consistent
    // whether the player is aiming or firing.
    const aiming = (camera as { ads?: boolean }).ads === true
    // Crouching disables sprint too — you can't run while ducked.
    let wishSpeed = (sprinting && !this.crouching ? RUN_SPEED : WALK_SPEED) * (wLen > 0 ? 1 : 0)
    if (this.crouching) wishSpeed *= CROUCH_SPEED_SCALE

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
      // Jump (consume buffer): allow within coyote window after leaving ground.
      // Crouching suppresses the jump (you must stand first).
      if (!this.crouching && this.jumpBuffer > 0 && (this.grounded || this.coyoteTimer <= COYOTE_TIME)) {
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

    // 5) Ledge grab detection. Only while airborne (so the player can't grab
    // a chest-high ledge while already standing on the ground), not while
    // rising fast (still ascending mid-jump), and not for a brief moment
    // after releasing a ledge (so dropping off doesn't immediately re-grab).
    if (
      !this.grounded &&
      this.velocity.y <= 1.5 &&
      this.regrabCooldown <= 0 &&
      camera
    ) {
      tryGrabLedge(this, t, _wishDir)
    }
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

  /**
   * World eye position, derived from the *current* capsule (so it lowers while
   * crouching). Used as the FPP camera fallback when there's no head bone.
   */
  get eyePosition(): Vector3 {
    const fullHalf = this.currentHalfHeight + this.radius
    return _temp.copy(this.position).setY(this.position.y + fullHalf * this.eyeHeightFraction)
  }

  /** Eye offset above the capsule center, in metres (tracks crouch). */
  get eyeOffsetY(): number {
    return (this.currentHalfHeight + this.radius) * this.eyeHeightFraction
  }

  /** Distance from capsule center down to the feet, in metres (tracks crouch).
   *  Used by the TPP character to keep its feet planted while ducking. */
  get capsuleBottomOffset(): number {
    return this.currentHalfHeight + this.radius
  }

  // ── Debug / external control helpers ────────────────────────────────────────

  /** Snapshot of internal game-feel timers, for the debugger readout. */
  get debugState() {
    return {
      grounded: this.grounded,
      mode: this.mode,
      crouching: this.crouching,
      coyoteTimer: this.coyoteTimer,
      jumpBuffer: this.jumpBuffer,
      standingHeight: this.standingHeight,
      currentHeight: this.currentHeight,
      radius: this.radius,
      eyeHeightFraction: this.eyeHeightFraction,
    }
  }

  /** Hard teleport: set body position and zero velocity. */
  teleport(x: number, y: number, z: number) {
    this.body.setTranslation({ x, y, z }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
  }

  /**
   * Set the body's linear velocity. Also writes `this.velocity` so the value
   * survives into the next `update()` (which reads body.linvel at the top).
   */
  setVelocity(x: number, y: number, z: number) {
    this.velocity.set(x, y, z)
    this.body.setLinvel({ x, y, z }, true)
  }

  /** Launch straight up at the given liftoff speed (m/s). */
  launch(vy: number) {
    const v = this.body.linvel()
    this.velocity.set(v.x, vy, v.z)
    this.body.setLinvel({ x: v.x, y: vy, z: v.z }, true)
    this.grounded = false
  }

  // ── Combatant implementation ────────────────────────────────────────────────

  getPosition(out: Vector3): Vector3 {
    return out.copy(this.position)
  }

  takeDamage(amount: number, fromTeam: Team): boolean {
    if (!this.alive || amount <= 0) return false
    this.hp = Math.max(0, this.hp - amount)
    this.onDamaged?.(amount, fromTeam)
    if (this.hp <= 0) {
      this.alive = false
      this.onDeath?.()
      return true
    }
    return false
  }

  /** Reset health + teleport to a spawn point for a new round. */
  respawn(pos: Vector3) {
    this.hp = this.maxHp
    this.alive = true
    this.crouching = false
    this.crouchT = 0
    this.mode = 'normal'
    // Make sure velocity is zero
    try {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    } catch {}
    this.body.setGravityScale(1, true)
    this.teleport(pos.x, pos.y, pos.z)
    dlog(`[Player] Respawned at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) - HP: ${this.hp}/${this.maxHp}`)
  }
}

export const PLAYER_CAPSULE = {
  radius: CAPSULE_RADIUS,
  halfHeight: CAPSULE_HALF_HEIGHT,
}
