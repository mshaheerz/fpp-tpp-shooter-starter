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

// Real-world tuning. 1 unit = 1 m, gravity = -9.81 m/s² (PhysicsSystem).
//
// Reference numbers used:
//   - Casual walk:   ~1.4 m/s (5 km/h)
//   - Brisk walk:    ~2.0 m/s
//   - Jog:           ~3.0 m/s
//   - Sprint:        ~5.5 m/s (recreational; Usain Bolt peaks ~12)
//   - Standing jump: 2.7–3.2 m/s liftoff → 0.37–0.52 m apex (h = v²/2g)
//   - Terminal vel:  ~53 m/s belly-down
//
// Accel/friction are chosen so a stop from full sprint feels like ~1 stride
// (~0.7 m), not the snappy Quake stop the old constants gave.
const WALK_SPEED = 1.5
const RUN_SPEED = 5.5
const GROUND_ACCEL = 25
const AIR_ACCEL = 8
const FRICTION = 6.0
const JUMP_VELOCITY = 3.0
// Game-feel windows (these are not "physics" and aren't supposed to be real):
//   COYOTE: jump still works briefly after walking off a ledge.
//   JUMP_BUFFER: jump still works if pressed slightly before landing.
const COYOTE_TIME = 0.12
const JUMP_BUFFER_TIME = 0.12
const VARIABLE_JUMP_CUTOFF = 0.6
const MAX_FALL_SPEED = -53

const _hVel = new Vector3()
const _wishDir = new Vector3()
const _temp = new Vector3()

// Ledge grab tuning (real-world calibrated).
// Capsule center is ~0.91m above feet; head bone sits ~0.81m above center.
// Outstretched-arm-overhead reach from a jump apex (~0.46m) gives the player
// a realistic vertical grab range from "just below shoulder" up to "fully
// extended overhead while jumping" — roughly center+0.1m .. center+0.85m.
const LEDGE_CHEST_OFFSET = 0.35      // above capsule center (≈ chest / shoulder)
const LEDGE_FORWARD_REACH = 0.50     // arm reach (~50 cm)
const LEDGE_TOP_PROBE_ABOVE = 0.55   // how far above chest we start down-probe
const LEDGE_TOP_PROBE_DEPTH = 1.0    // how far down the down-probe travels
const LEDGE_WALL_NORMAL_MAX_Y = 0.35
// Standing-clearance check: after finding a ledge top, sweep upward from the
// surface to make sure a full player capsule fits there.
const LEDGE_STAND_CLEARANCE = (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS) * 2 + 0.05
const LEDGE_SHIMMY_OBSTACLE_REACH = CAPSULE_RADIUS + 0.1
// Reach band: realistic for a 1.8m human with arms extended.
const LEDGE_TOP_MIN_RELATIVE = 0.0   // at or above capsule center (chest+)
const LEDGE_TOP_MAX_RELATIVE = 0.85  // ~fingertips overhead at jump apex
const LEDGE_REGRAB_COOLDOWN = 0.35
// Visual & snap offsets.
const LEDGE_HAND_TO_HIPS = 1.05      // hands-to-hips on a hang ~= 1 m for a 1.8m body
const LEDGE_WALL_GAP = CAPSULE_RADIUS + 0.02
const LEDGE_CLIMB_DURATION_DEFAULT = 1.6
// Side-step shimmy: a hanging person can slide arms hand-over-hand at roughly
// 0.5 m/s, which matches casual climbing footage.
const LEDGE_SHIMMY_SPEED = 0.5

export type PlayerMode = 'normal' | 'hanging' | 'climbing'

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
  private climbTimer = 0
  private climbDuration = LEDGE_CLIMB_DURATION_DEFAULT
  /** World position the capsule will be teleported to when the climb finishes. */
  private climbTargetPos = new Vector3()
  private regrabCooldown = 0

  /** Tell the player how long the ledge_climb_up clip is (seconds). Call this
   *  once after the character finishes loading its manifest. */
  setClimbDuration(seconds: number) {
    if (Number.isFinite(seconds) && seconds > 0.1) this.climbDuration = seconds
  }

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
    // Reset one-frame flags from the previous tick.
    this.ledgeJustGrabbed = false
    this.climbJustStarted = false
    this.ledgeShimmyDir = 0
    if (this.regrabCooldown > 0) this.regrabCooldown = Math.max(0, this.regrabCooldown - dt)

    // CLIMBING: time-driven pull-up. Input frozen. Capsule stays put (gravity
    // disabled, velocity zeroed) until the timer elapses, then we teleport
    // the body up onto the ledge top and hand control back to normal mode.
    if (this.mode === 'climbing') {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      this.climbTimer += dt
      const t = this.body.translation()
      this.position.set(t.x, t.y, t.z)
      this.velocity.set(0, 0, 0)
      this.grounded = false
      this.debugMesh.position.set(t.x, t.y, t.z)
      // End the climb a hair before the clip finishes — the overlay's tail
      // fade-out (~0.18s) overlaps with locomotion fading back in, so doing
      // the teleport slightly early lets the final pose dissolve cleanly into
      // the standing idle rather than popping after a held end-frame.
      if (this.climbTimer >= Math.max(0.1, this.climbDuration - 0.08)) {
        this.body.setTranslation(
          { x: this.climbTargetPos.x, y: this.climbTargetPos.y, z: this.climbTargetPos.z },
          true,
        )
        this.body.setGravityScale(1, true)
        this.mode = 'normal'
        this.regrabCooldown = LEDGE_REGRAB_COOLDOWN
      }
      return
    }

    // HANGING: physics frozen (gravity off, velocity zeroed). A handful of
    // inputs are honoured: Space to start climbing, S/Ctrl to drop, A/D to
    // shimmy along the ledge if shimmy clips exist.
    if (this.mode === 'hanging') {
      const t = this.body.translation()
      this.position.set(t.x, t.y, t.z)
      this.velocity.set(0, 0, 0)
      this.grounded = false

      // Drop: release the ledge, restore gravity, briefly disable re-grab.
      if (input.isDown('KeyS') || input.isDown('ControlLeft') || input.isDown('ControlRight')) {
        this.body.setGravityScale(1, true)
        this.body.setLinvel({ x: 0, y: -0.5, z: 0 }, true)
        this.mode = 'normal'
        this.regrabCooldown = LEDGE_REGRAB_COOLDOWN
        this.debugMesh.position.set(t.x, t.y, t.z)
        return
      }
      // Climb up.
      if (input.wasPressed('Space')) {
        // Target: a step forward from the wall, on top of the ledge.
        const fwdX = -this.ledgeWallNormal.x
        const fwdZ = -this.ledgeWallNormal.z
        const tgtX = this.ledgeAnchor.x + fwdX * (CAPSULE_RADIUS + 0.15)
        const tgtY = this.ledgeAnchor.y + CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + 0.02
        const tgtZ = this.ledgeAnchor.z + fwdZ * (CAPSULE_RADIUS + 0.15)
        // Refuse to start climbing if the standing target is blocked. A short
        // ray straight up from the ledge top, plus a forward ray at chest
        // height from the standing spot, catches both ceilings and walls.
        const blockedAbove = this.physics.raycast(
          { x: tgtX, y: this.ledgeAnchor.y + 0.05, z: tgtZ },
          { x: 0, y: 1, z: 0 },
          LEDGE_STAND_CLEARANCE,
          this.body,
        )
        if (blockedAbove) {
          // Stay hanging; don't consume the press silently — let the player
          // try again next frame (e.g. after shimmying).
          return
        }
        this.climbTargetPos.set(tgtX, tgtY, tgtZ)
        this.climbTimer = 0
        this.mode = 'climbing'
        this.climbJustStarted = true
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        this.debugMesh.position.set(t.x, t.y, t.z)
        return
      }
      // Shimmy: slide along the ledge tangent. The tangent is the wall normal
      // rotated 90° around Y. We do a forward-probe each frame to confirm the
      // wall is still in front; if it's gone, drop off.
      // Swapped: while hanging the character is facing the wall, so from the
      // PLAYER's point of view A should still slide them to the right edge of
      // the screen and D to the left. Tangent direction flips accordingly.
      let shimmy = 0
      if (input.isDown('KeyA')) shimmy += 1
      if (input.isDown('KeyD')) shimmy -= 1
      if (shimmy !== 0) {
        const tanX = -this.ledgeWallNormal.z
        const tanZ = this.ledgeWallNormal.x
        const sx = tanX * shimmy
        const sz = tanZ * shimmy
        // Sideways obstacle check at chest and head height — refuses to slide
        // the player INTO a wall segment, pillar, or any prop that sticks out
        // perpendicular to the ledge run.
        const chestObstacle = this.physics.raycast(
          { x: t.x, y: t.y + LEDGE_CHEST_OFFSET, z: t.z },
          { x: sx, y: 0, z: sz },
          LEDGE_SHIMMY_OBSTACLE_REACH,
          this.body,
        )
        const handObstacle = this.physics.raycast(
          { x: t.x, y: this.ledgeAnchor.y - 0.05, z: t.z },
          { x: sx, y: 0, z: sz },
          LEDGE_SHIMMY_OBSTACLE_REACH,
          this.body,
        )
        if (!chestObstacle && !handObstacle) {
          const step = shimmy * LEDGE_SHIMMY_SPEED * dt
          const nx = t.x + tanX * step
          const nz = t.z + tanZ * step
          // Re-probe forward to make sure the wall continues at the new
          // position; if it ends, cancel the step instead of falling off.
          const probeOrigin = { x: nx, y: t.y + LEDGE_CHEST_OFFSET, z: nz }
          const probeDir = { x: -this.ledgeWallNormal.x, y: 0, z: -this.ledgeWallNormal.z }
          const wallHit = this.physics.raycast(probeOrigin, probeDir, LEDGE_FORWARD_REACH + 0.1, this.body)
          if (wallHit) {
            this.body.setTranslation({ x: nx, y: t.y, z: nz }, true)
            this.ledgeShimmyDir = shimmy as -1 | 1
          }
        }
      }
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      const tt = this.body.translation()
      this.position.set(tt.x, tt.y, tt.z)
      this.debugMesh.position.set(tt.x, tt.y, tt.z)
      return
    }

    // NORMAL movement.
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
      this.tryGrabLedge(t)
    }
  }

  /**
   * Two-ray probe for a grabbable ledge. The first ray fires straight forward
   * from chest height to find a near-vertical wall. If a wall is hit close
   * enough, the second ray drops down from a point a bit above the chest and
   * just past the wall — if it hits within the reachable band, the hit point's
   * Y defines the ledge top.
   *
   * Direction of "forward" comes from the player's last move input if any,
   * else camera yaw — so the player can't accidentally grab a ledge behind
   * them. We pull forward direction from `_wishDir` (still set above) if it's
   * non-zero, otherwise we use the body's facing derived from camera yaw via
   * the wishDir build above (which we set to (0,0,0) when no key is pressed).
   */
  private tryGrabLedge(t: { x: number; y: number; z: number }) {
    // Forward direction for the probe: prefer current wish input, else use
    // the velocity direction; if both are zero, skip — we only grab ledges
    // the player is actively running into.
    let fx = _wishDir.x
    let fz = _wishDir.z
    let len = Math.hypot(fx, fz)
    if (len < 0.01) {
      fx = this.velocity.x
      fz = this.velocity.z
      len = Math.hypot(fx, fz)
      if (len < 0.5) return
    }
    fx /= len
    fz /= len

    const chestY = t.y + LEDGE_CHEST_OFFSET
    const wallHit = this.physics.raycast(
      { x: t.x, y: chestY, z: t.z },
      { x: fx, y: 0, z: fz },
      LEDGE_FORWARD_REACH,
      this.body,
    )
    if (!wallHit) return
    // Wall must be near-vertical (its surface normal mostly horizontal).
    if (Math.abs(wallHit.normal.y) > LEDGE_WALL_NORMAL_MAX_Y) return

    // Down-probe from above the chest, just past the wall surface, looking for
    // the top of the ledge.
    const probeX = wallHit.point.x + fx * 0.05
    const probeZ = wallHit.point.z + fz * 0.05
    const probeStartY = chestY + LEDGE_TOP_PROBE_ABOVE
    const downHit = this.physics.raycast(
      { x: probeX, y: probeStartY, z: probeZ },
      { x: 0, y: -1, z: 0 },
      LEDGE_TOP_PROBE_DEPTH,
      this.body,
    )
    if (!downHit) return
    // Top must be approximately flat (could relax later for sloped ledges).
    if (downHit.normal.y < 0.7) return

    const topY = downHit.point.y
    const relY = topY - t.y
    if (relY < LEDGE_TOP_MIN_RELATIVE || relY > LEDGE_TOP_MAX_RELATIVE) return

    // Refuse the grab if there's something directly above the ledge top — the
    // climb pull-up would end inside geometry (an overhang, a low ceiling, an
    // object placed on the ledge). Cast a short ray UP from just above the
    // top; any hit within standing-clearance is a blocker.
    const clearanceHit = this.physics.raycast(
      { x: probeX, y: topY + 0.05, z: probeZ },
      { x: 0, y: 1, z: 0 },
      LEDGE_STAND_CLEARANCE,
      this.body,
    )
    if (clearanceHit) return

    // Lock in the grab. Snap the body so the capsule sits with its hands at
    // ledge height and its chest pressed against the wall (with a small gap
    // so it doesn't tunnel).
    const wnX = wallHit.normal.x
    const wnZ = wallHit.normal.z
    const wnLen = Math.hypot(wnX, wnZ) || 1
    this.ledgeWallNormal.set(wnX / wnLen, 0, wnZ / wnLen)
    this.ledgeAnchor.set(probeX, topY, probeZ)

    const snapX = wallHit.point.x + this.ledgeWallNormal.x * LEDGE_WALL_GAP
    const snapZ = wallHit.point.z + this.ledgeWallNormal.z * LEDGE_WALL_GAP
    const snapY = topY - LEDGE_HAND_TO_HIPS
    this.body.setTranslation({ x: snapX, y: snapY, z: snapZ }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setGravityScale(0, true)

    // Face the wall: yaw points along -wallNormal in XZ.
    this.ledgeYaw = Math.atan2(-this.ledgeWallNormal.x, -this.ledgeWallNormal.z)

    this.mode = 'hanging'
    this.ledgeJustGrabbed = true
    this.position.set(snapX, snapY, snapZ)
    this.velocity.set(0, 0, 0)
    this.grounded = false
    this.debugMesh.position.set(snapX, snapY, snapZ)
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
