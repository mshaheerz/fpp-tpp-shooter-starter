import RAPIER from '@dimforge/rapier3d-compat'
import {
  Vector3,
  Object3D,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  MathUtils,
} from 'three'
import type { PhysicsSystem } from '../PhysicsSystem'
import type { CharacterRig, CharacterPool } from './CharacterPool'
import type { Combatant, Team } from './DamageSystem'
import type { NavGrid } from './NavGrid'

// Enemy capsule matches the player's default size so hit detection + ground
// behavior feel consistent.
const ENEMY_RADIUS = 0.36
const ENEMY_HALF_HEIGHT = 0.55
const ENEMY_FULL_HALF = ENEMY_HALF_HEIGHT + ENEMY_RADIUS // center→feet
const ENEMY_MAX_HP = 100

const RUN_SPEED_THRESHOLD = 3.0
const MOVE_SPEED_THRESHOLD = 0.3

// ── Perception / combat tuning (fair-but-dangerous defaults) ──────────────────
const VISION_RANGE = 32 // metres the enemy can see
const VISION_FOV = MathUtils.degToRad(110) // full cone angle
const HEARING_RANGE = 22 // gunfire within this radius alerts the enemy
const ATTACK_RANGE = 24 // starts shooting inside this distance with LoS
const ATTACK_STOP_RANGE = 9 // closes to roughly this distance, then holds
const REACTION_TIME = 0.35 // delay between first seeing the player and first shot
const FIRE_INTERVAL = 0.18 // seconds between shots while attacking
const BURST_LEN = 4 // shots per burst
const BURST_PAUSE = 0.7 // pause between bursts
const AIM_ERROR_BASE = 0.09 // radians of spread when first acquiring
const AIM_ERROR_SETTLED = 0.025 // radians once aim has settled
const AIM_SETTLE_TIME = 1.2 // seconds to go from base→settled error
const ENEMY_DAMAGE = 9 // per hit (low; bursts add up, leaves counterplay)
const SEARCH_DURATION = 5 // seconds to investigate last-known before giving up
const REPATH_INTERVAL = 0.4 // how often to recompute a chase path

export type EnemyAiState = 'patrol' | 'chase' | 'attack' | 'search' | 'dead'

/** Everything `think()` needs from the outside world each tick. */
export interface EnemyContext {
  nav: NavGrid
  /** The thing this enemy hunts (the player). */
  target: Combatant
  /** Target world position (capsule center). */
  targetPos: Vector3
  /** True if the target fired its weapon this tick (for hearing). */
  targetFiredNow: boolean
  /** Line-of-sight test: true if `from`→`to` is unobstructed by the map. */
  hasLineOfSight: (from: Vector3, to: Vector3) => boolean
  /** Deal `dmg` to the target (routes through the DamageSystem). */
  dealDamage: (dmg: number) => void
  /** Spawn muzzle flash / tracer / sound at the muzzle along `dir`. */
  onFire: (muzzle: Vector3, dir: Vector3) => void
}

const _v = new Vector3()
const _muzzle = new Vector3()
const _eye = new Vector3()
const _tEye = new Vector3()
const _aimDir = new Vector3()

let _enemySeq = 0

/**
 * An AI combatant: a Rapier capsule + a cloned Mixamo rig + a simple weapon.
 *
 * Step 3 scope: physics capsule, rig follows it, registered with the
 * DamageSystem so the player can shoot it, plays a death reaction. The AI
 * (perception / navigation / firing) is layered on in a later step via
 * `think()` — for now `update()` just keeps the visual synced and runs the
 * animator.
 */
export class Enemy implements Combatant {
  readonly id: string
  team: Team
  maxHp = ENEMY_MAX_HP
  hp = ENEMY_MAX_HP
  alive = true

  readonly body: RAPIER.RigidBody
  private readonly collider: RAPIER.Collider
  readonly rig: CharacterRig
  /** Muzzle tip object (child of the gun) — bullet origin for enemy fire. */
  readonly muzzle: Object3D

  readonly position = new Vector3()
  private yaw = 0
  aiState: EnemyAiState = 'patrol'
  /** Seconds the death reaction has been playing (for cleanup timing). */
  private deadTimer = 0

  // Patrol/path-follow state (shared by patrol + chase).
  private path: Vector3[] = []
  private pathIndex = 0
  /** Cooldown before recomputing a patrol path (s). */
  private repathTimer = 0
  /** Movement speed while patrolling (walk) and chasing (run). */
  patrolSpeed = 1.6
  chaseSpeed = 4.2

  // Perception / combat state.
  private lastKnownTarget = new Vector3()
  private hasLastKnown = false
  private alertTimer = 0 // counts up since the target was first perceived
  private fireCooldown = 0
  private burstShotsLeft = BURST_LEN
  private searchTimer = 0
  private firedThisTick = false

  onDeath?: (e: Enemy) => void

  constructor(
    private physics: PhysicsSystem,
    pool: CharacterPool,
    spawn: Vector3,
    team: Team = 'red',
  ) {
    this.id = `enemy_${_enemySeq++}`
    this.team = team

    const created = physics.createCapsule(
      { x: spawn.x, y: spawn.y, z: spawn.z },
      ENEMY_HALF_HEIGHT,
      ENEMY_RADIUS,
    )
    this.body = created.body
    this.collider = created.collider
    this.position.copy(spawn)

    this.rig = pool.spawnRig()
    this.muzzle = buildGun(this.rig.rightHand)
  }

  /** Rapier collider handle — registered with the DamageSystem by the match. */
  get colliderHandle(): number {
    return this.collider.handle
  }

  getPosition(out: Vector3): Vector3 {
    return out.copy(this.position)
  }

  /** World position of the eyes/head (perception + as a target for the player). */
  getEyePosition(out: Vector3): Vector3 {
    return out.copy(this.position).setY(this.position.y + ENEMY_HALF_HEIGHT)
  }

  getMuzzleWorld(out = _muzzle): Vector3 {
    return this.muzzle.getWorldPosition(out)
  }

  takeDamage(amount: number, _fromTeam: Team): boolean {
    if (!this.alive || amount <= 0) return false
    this.hp = Math.max(0, this.hp - amount)
    if (this.hp <= 0) {
      this.die()
      return true
    }
    return false
  }

  private die() {
    if (!this.alive) return
    this.alive = false
    this.aiState = 'dead'
    this.deadTimer = 0
    // Freeze physics immediately and completely - no lingering velocity
    try {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      this.collider.setEnabled(false)
    } catch {}
    // Try to play a death animation; fall back to other animations if not found
    const a = this.rig.animator
    if (a.hasClip('death')) {
      a.playOverlay('death', false)
    } else if (a.hasClip('dying')) {
      a.playOverlay('dying', false)
    } else if (a.hasClip('death_stand')) {
      a.playOverlay('death_stand', false)
    } else if (a.hasClip('falling_to_landing')) {
      a.playOverlay('falling_to_landing', false)
    }
    console.log(`[Enemy] ${this.id} died`)
    this.onDeath?.(this)
  }

  /** Aim the body toward a yaw (radians). Used by the AI when attacking. */
  faceYaw(targetYaw: number, dt: number, rate = 10) {
    const delta = wrapAngle(targetYaw - this.yaw)
    this.yaw += delta * Math.min(1, rate * dt)
  }

  /** Drive the capsule horizontally toward a world point at `speed` m/s. The AI
   *  calls this each tick with the next nav node; gravity stays on. */
  moveToward(target: Vector3, speed: number) {
    const v = this.body.linvel()
    _v.set(target.x - this.position.x, 0, target.z - this.position.z)
    const dist = _v.length()
    if (dist > 0.001) {
      _v.multiplyScalar(speed / dist)
      // Face the travel direction.
      this.yaw = Math.atan2(_v.x, _v.z)
    } else {
      _v.set(0, 0, 0)
    }
    this.body.setLinvel({ x: _v.x, y: v.y, z: _v.z }, true)
  }

  /** Stop horizontal movement (e.g. when attacking in place). */
  halt() {
    const v = this.body.linvel()
    this.body.setLinvel({ x: 0, y: v.y, z: 0 }, true)
  }

  /** Replace the current path with a route to `dest` (world). Clears it if no
   *  route exists. Returns true if a path was found. */
  setPathTo(nav: NavGrid, dest: Vector3): boolean {
    const route = nav.findPath(this.position, dest)
    if (!route || route.length === 0) {
      this.path = []
      this.pathIndex = 0
      return false
    }
    this.path = route
    this.pathIndex = 0
    return true
  }

  /** Follow the current path at `speed`. Returns true while still travelling,
   *  false once the final node is reached (or there's no path). */
  followPath(speed: number): boolean {
    if (this.pathIndex >= this.path.length) {
      this.halt()
      return false
    }
    const node = this.path[this.pathIndex]
    const dx = node.x - this.position.x
    const dz = node.z - this.position.z
    if (dx * dx + dz * dz < 0.35 * 0.35) {
      this.pathIndex++
      if (this.pathIndex >= this.path.length) {
        this.halt()
        return false
      }
    }
    this.moveToward(this.path[this.pathIndex], speed)
    return true
  }

  /**
   * Idle patrol: wander between random walkable nav points. Re-paths when the
   * current route is exhausted or every few seconds if stuck. Standalone driver
   * used by the dev `?bot` spawn and as the fallback state in the full AI.
   */
  patrol(nav: NavGrid, dt: number) {
    if (this.aiState === 'dead') return
    this.repathTimer -= dt
    const travelling = this.followPath(this.patrolSpeed)
    if (!travelling || this.repathTimer <= 0) {
      const dest = nav.randomWalkable()
      if (dest) this.setPathTo(nav, dest)
      this.repathTimer = 4 + Math.random() * 3
    }
  }

  /**
   * AI tick: perception → state machine → movement/firing. Call once per fixed
   * step BEFORE `update()` (which syncs the visual + animation). No-op when dead.
   */
  think(ctx: EnemyContext, dt: number) {
    if (this.aiState === 'dead') {
      // Dead enemies should not think or move at all
      return
    }
    this.firedThisTick = false
    if (this.fireCooldown > 0) this.fireCooldown -= dt

    this.getEyePosition(_eye)
    _tEye.copy(ctx.targetPos).setY(ctx.targetPos.y + 0.5) // aim ~chest

    // ── Perception ────────────────────────────────────────────────────────────
    const toTarget = _v.set(ctx.targetPos.x - this.position.x, 0, ctx.targetPos.z - this.position.z)
    const dist = toTarget.length()
    let canSee = false
    if (ctx.target.alive && dist <= VISION_RANGE) {
      // FOV check (skip the cone when very close — peripheral/awareness).
      const facing = _aimDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
      const cosAngle = dist > 0.001 ? facing.dot(toTarget) / dist : 1
      const inFov = dist < 3 || cosAngle >= Math.cos(VISION_FOV / 2)
      if (inFov && ctx.hasLineOfSight(_eye, _tEye)) {
        canSee = true
        // DEBUG: print when vision acquired
        if (this.alertTimer < 0.1) {
          console.log(`[Enemy] ${this.id} can see target at distance ${dist.toFixed(1)}m, FOV: ${inFov}`)
        }
      }
    }
    // Hearing: the player's gunfire gives away their position within range.
    if (!canSee && ctx.target.alive && ctx.targetFiredNow && dist <= HEARING_RANGE) {
      console.log(`[Enemy] ${this.id} heard gunfire at distance ${dist.toFixed(1)}m`)
      this.lastKnownTarget.copy(ctx.targetPos)
      this.hasLastKnown = true
      if (this.aiState === 'patrol') this.aiState = 'search', (this.searchTimer = SEARCH_DURATION)
    }

    if (canSee) {
      this.lastKnownTarget.copy(ctx.targetPos)
      this.hasLastKnown = true
      this.alertTimer += dt
    } else if (this.alertTimer > 0) {
      // Brief memory so a flicker of cover doesn't reset reaction instantly.
      this.alertTimer = Math.max(0, this.alertTimer - dt * 0.5)
    }

    // ── State transitions ──────────────────────────────────────────────────────
    switch (this.aiState) {
      case 'patrol':
        if (canSee) this.aiState = 'chase'
        break
      case 'chase':
        if (canSee && dist <= ATTACK_RANGE) this.aiState = 'attack'
        else if (!canSee && !this.hasLastKnown) this.aiState = 'patrol'
        break
      case 'attack':
        if (!canSee) {
          this.aiState = 'search'
          this.searchTimer = SEARCH_DURATION
        } else if (dist > ATTACK_RANGE) {
          this.aiState = 'chase'
        }
        break
      case 'search':
        if (canSee) this.aiState = dist <= ATTACK_RANGE ? 'attack' : 'chase'
        break
    }

    // ── State behavior ─────────────────────────────────────────────────────────
    switch (this.aiState) {
      case 'patrol':
        this.alertTimer = 0
        this.patrol(ctx.nav, dt)
        break

      case 'chase': {
        this.repathTimer -= dt
        if (this.repathTimer <= 0) {
          this.setPathTo(ctx.nav, this.hasLastKnown ? this.lastKnownTarget : ctx.targetPos)
          this.repathTimer = REPATH_INTERVAL
        }
        this.followPath(this.chaseSpeed)
        break
      }

      case 'attack': {
        // Hold at a stand-off distance: back-pedal if too close, advance if far.
        if (dist > ATTACK_STOP_RANGE + 1.5) {
          this.repathTimer -= dt
          if (this.repathTimer <= 0) {
            this.setPathTo(ctx.nav, ctx.targetPos)
            this.repathTimer = REPATH_INTERVAL
          }
          this.followPath(this.chaseSpeed)
        } else {
          this.path = []
          this.halt()
        }
        // Always face the target while attacking.
        const targetYaw = Math.atan2(toTarget.x, toTarget.z)
        this.faceYaw(targetYaw, dt, 12)
        // Fire once the reaction delay has elapsed.
        if (this.alertTimer >= REACTION_TIME) {
          console.log(`[Enemy] ${this.id} firing! alertTimer=${this.alertTimer.toFixed(2)}, dist=${dist.toFixed(1)}m`)
          this.tryFire(ctx, dt, dist)
        }
        break
      }

      case 'search': {
        this.searchTimer -= dt
        this.repathTimer -= dt
        if (this.repathTimer <= 0 && this.hasLastKnown) {
          this.setPathTo(ctx.nav, this.lastKnownTarget)
          this.repathTimer = REPATH_INTERVAL
        }
        const stillGoing = this.followPath(this.patrolSpeed)
        if (this.searchTimer <= 0 || (!stillGoing && this.atLastKnown())) {
          this.hasLastKnown = false
          this.aiState = 'patrol'
        }
        break
      }
    }
  }

  private atLastKnown(): boolean {
    const dx = this.lastKnownTarget.x - this.position.x
    const dz = this.lastKnownTarget.z - this.position.z
    return dx * dx + dz * dz < 1.2 * 1.2
  }

  /** Fire control: rate-limited bursts with aim error that settles over time. */
  private tryFire(ctx: EnemyContext, _dt: number, dist: number) {
    if (this.fireCooldown > 0) return
    if (this.burstShotsLeft <= 0) {
      this.burstShotsLeft = BURST_LEN
      this.fireCooldown = BURST_PAUSE
      return
    }

    // Aim from muzzle toward the target chest, with error that tightens as the
    // enemy "settles" (alertTimer grows).
    const muzzle = this.getMuzzleWorld(_muzzle)
    _tEye.copy(ctx.targetPos).setY(ctx.targetPos.y + 0.5)
    _aimDir.set(_tEye.x - muzzle.x, _tEye.y - muzzle.y, _tEye.z - muzzle.z).normalize()

    const settle = Math.min(1, this.alertTimer / AIM_SETTLE_TIME)
    const err = AIM_ERROR_BASE + (AIM_ERROR_SETTLED - AIM_ERROR_BASE) * settle
    // Random small cone offset.
    _aimDir.x += (Math.random() - 0.5) * err
    _aimDir.y += (Math.random() - 0.5) * err
    _aimDir.z += (Math.random() - 0.5) * err
    _aimDir.normalize()

    ctx.onFire(muzzle, _aimDir)
    this.firedThisTick = true

    // Hit resolution: a forgiving hit chance scaled by distance + settle, so it
    // feels like aimed fire without a second physics raycast per enemy/shot.
    const range01 = Math.min(1, dist / ATTACK_RANGE)
    const hitChance = (0.85 - 0.45 * range01) * (0.6 + 0.4 * settle)
    if (Math.random() < hitChance) {
      console.log(`[Enemy] ${this.id} hit! distance=${dist.toFixed(1)}m, settle=${settle.toFixed(2)}, chance=${hitChance.toFixed(2)}`)
      ctx.dealDamage(ENEMY_DAMAGE)
    }

    this.burstShotsLeft--
    this.fireCooldown = FIRE_INTERVAL
    // Fire overlay on the rig if available.
    const a = this.rig.animator
    if (a.hasClip('firing_rifle')) a.playOverlay('firing_rifle', false, 1.4)
  }

  /** Did the enemy fire this tick? (for the match to drive shared FX/sound.) */
  get didFire(): boolean {
    return this.firedThisTick
  }

  /**
   * Per-frame sync + animation. Keeps the rig glued to the capsule and the
   * locomotion blend tree fed with the current speed.
   */
  update(dt: number) {
    const t = this.body.translation()
    this.position.set(t.x, t.y, t.z)

    if (this.aiState === 'dead') {
      this.deadTimer += dt
      // Sink the corpse slowly so it reads as "down". Also freeze velocity every frame
      // to make absolutely sure dead enemies don't move.
      try {
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      } catch {}
      this.rig.object.position.set(t.x, t.y - ENEMY_FULL_HALF + this.rig.feetOffset - this.deadTimer * 0.15, t.z)
      this.rig.animator.update(dt)
      return
    }

    // Place feet at the capsule bottom (same formula as ThirdPersonCharacter).
    this.rig.object.position.set(t.x, t.y - ENEMY_FULL_HALF + this.rig.feetOffset, t.z)
    this.rig.object.rotation.y = this.yaw

    // Locomotion from horizontal speed.
    const v = this.body.linvel()
    const speed = Math.hypot(v.x, v.z)
    const a = this.rig.animator
    if (speed < MOVE_SPEED_THRESHOLD) a.setLocomotion('idle')
    else if (speed > RUN_SPEED_THRESHOLD) a.setLocomotion('run')
    else a.setLocomotion('walk')
    a.setAir(false)
    a.update(dt)
  }

  /** Remove physics + scene presence entirely (round teardown). */
  dispose() {
    try {
      this.physics.world.removeRigidBody(this.body)
    } catch {}
    this.rig.object.removeFromParent()
  }

  /** Current facing yaw (radians). */
  get facingYaw(): number {
    return this.yaw
  }
}

/** Build a simple primitive rifle parented to the hand; returns the muzzle node. */
function buildGun(hand: Object3D): Object3D {
  const gun = new Object3D()
  const bodyMat = new MeshStandardMaterial({ color: 0x222428, roughness: 0.5, metalness: 0.3 })
  const barrel = new Mesh(new BoxGeometry(0.05, 0.05, 0.5), bodyMat)
  barrel.position.set(0, 0, 0.25)
  barrel.castShadow = true
  gun.add(barrel)
  const stock = new Mesh(new BoxGeometry(0.06, 0.12, 0.18), bodyMat)
  stock.position.set(0, -0.04, -0.05)
  gun.add(stock)
  // Orient roughly forward out of the hand.
  gun.rotation.set(0, MathUtils.degToRad(90), 0)
  gun.position.set(0, 0, 0)
  hand.add(gun)

  const muzzle = new Object3D()
  muzzle.position.set(0, 0, 0.52)
  gun.add(muzzle)
  return muzzle
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}
