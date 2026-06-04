import RAPIER from '@dimforge/rapier3d-compat'
import { Vector3, Object3D } from 'three'
import type { PhysicsSystem } from '../PhysicsSystem'
import type { CharacterRig, CharacterPool } from './CharacterPool'
import type { Combatant, Team } from './DamageSystem'
import type { NavGrid } from './NavGrid'
import { dlog } from '../debug/log'
import { wrapAngle } from '../common/math'
import { RUN_SPEED_THRESHOLD, MOVE_SPEED_THRESHOLD } from '../character/locomotionConstants'
import { attachEnemyGun } from './EnemyWeapon'
import {
  ENEMY_RADIUS,
  ENEMY_HALF_HEIGHT,
  ENEMY_FULL_HALF,
  ENEMY_MAX_HP,
  VISION_RANGE,
  ATTACK_RANGE,
  STANDOFF_RANGE,
  FIRE_INTERVAL,
  BURST_LEN,
  BURST_PAUSE,
  AIM_ERROR_BASE,
  AIM_ERROR_SETTLED,
  AIM_SETTLE_TIME,
  ENEMY_DAMAGE,
  PATROL_SPEED,
  CHASE_SPEED,
  REPATH_INTERVAL,
  DAMAGE_AGGRO_DURATION,
  distXZ,
} from './enemyConstants'

export type EnemyAiState = 'patrol' | 'chase' | 'attack' | 'dead'
/** Animation state — tracks what we last commanded the animator (not the physics). */
type AnimState = 'idle' | 'walk' | 'run' | 'attackAnim'

/**
 * Everything `think()` needs from the outside world each tick.
 * Pure distance-based — like YAZH reference.
 */
export interface EnemyContext {
  nav: NavGrid
  target: Combatant
  targetPos: Vector3
  dealDamage: (dmg: number) => void
  onFire: (muzzle: Vector3, dir: Vector3) => void
}

// Per-tick scratch vectors.
const _v = new Vector3()
const _muzzle = new Vector3()
const _tEye = new Vector3()
const _aimDir = new Vector3()
const _patrol = new Vector3()

let _enemySeq = 0

/**
 * Enemy AI — pure distance-based (no LoS checks, no cover).
 * Matches YAZH reference style. Key differences from the original:
 *   - Animation is driven from AI state, NOT from physics velocity
 *   - On attack the enemy halts AND forces idle animation immediately
 *   - Movement uses physics impulse-based velocity (Rapier handles obstacle sliding)
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
  readonly muzzle: Object3D

  readonly position = new Vector3()
  private yaw = 0
  aiState: EnemyAiState = 'patrol'
  /** Separate animation tracking — not driven by velocity, but by AI state. */
  private animState: AnimState = 'idle'
  private deadTimer = 0

  // Path-follow state.
  private path: Vector3[] = []
  private pathIndex = 0
  private repathTimer = 0

  // Combat state.
  private alertTimer = 0
  private fireCooldown = 0
  private burstShotsLeft = BURST_LEN
  private firedThisTick = false
  private aggroTimer = 0

  private territoryCenter = new Vector3()
  private territoryRadius = 0

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
    this.muzzle = attachEnemyGun(this.rig.rightHand)
    this.territoryCenter.copy(spawn)
  }

  setTerritory(center: Vector3, radius: number) {
    this.territoryCenter.copy(center)
    this.territoryRadius = Math.max(0, radius)
  }

  get colliderHandle(): number {
    return this.collider.handle
  }

  getPosition(out: Vector3): Vector3 {
    return out.copy(this.position)
  }

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
    this.aggroTimer = DAMAGE_AGGRO_DURATION
    if (this.aiState === 'patrol') {
      this.aiState = 'chase'
      this.repathTimer = 0
    }
    return false
  }

  private die() {
    if (!this.alive) return
    this.alive = false
    this.aiState = 'dead'
    this.deadTimer = 0
    try {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      this.collider.setEnabled(false)
    } catch {}
    const a = this.rig.animator
    const deathClip = ['death', 'dying', 'falling_to_landing'].find((n) => a.hasClip(n))
    if (deathClip) a.playDeath(deathClip)
    dlog(`[Enemy] ${this.id} died`)
    this.onDeath?.(this)
  }

  // ── Movement ──────────────────────────────────────────────────────────────

  faceYaw(targetYaw: number, dt: number, rate = 10) {
    this.yaw += wrapAngle(targetYaw - this.yaw) * Math.min(1, rate * dt)
  }

  private facePoint(point: Vector3, dt: number, rate = 12) {
    this.faceYaw(Math.atan2(point.x - this.position.x, point.z - this.position.z), dt, rate)
  }

  moveToward(target: Vector3, speed: number) {
    const v = this.body.linvel()
    _v.set(target.x - this.position.x, 0, target.z - this.position.z)
    const dist = _v.length()
    if (dist > 0.001) {
      _v.multiplyScalar(speed / dist)
      this.yaw = Math.atan2(_v.x, _v.z)
    } else {
      _v.set(0, 0, 0)
    }
    this.body.setLinvel({ x: _v.x, y: v.y, z: _v.z }, true)
  }

  halt() {
    const v = this.body.linvel()
    this.body.setLinvel({ x: 0, y: v.y, z: 0 }, true)
  }

  setPathTo(nav: NavGrid, dest: Vector3): boolean {
    const route = nav.findPath(this.position, dest)
    this.path = route ?? []
    this.pathIndex = 0
    return this.path.length > 0
  }

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

  private chaseTo(nav: NavGrid, dest: Vector3, speed: number, dt: number) {
    this.repathTimer -= dt
    if (this.repathTimer <= 0) {
      this.setPathTo(nav, dest)
      this.repathTimer = REPATH_INTERVAL
    }
    this.followPath(speed)
  }

  // ── Patrol ────────────────────────────────────────────────────────────────

  patrol(nav: NavGrid, dt: number) {
    if (this.aiState === 'dead') return
    this.repathTimer -= dt
    const travelling = this.followPath(PATROL_SPEED)
    if (!travelling || this.repathTimer <= 0) {
      const dest = this.pickPatrolDest(nav)
      if (dest) this.setPathTo(nav, dest)
      this.repathTimer = 4 + Math.random() * 3
    }
  }

  private pickPatrolDest(nav: NavGrid): Vector3 | null {
    if (this.territoryRadius <= 0) return nav.randomWalkable()
    const angle = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * this.territoryRadius
    _patrol.set(
      this.territoryCenter.x + Math.cos(angle) * r,
      this.territoryCenter.y,
      this.territoryCenter.z + Math.sin(angle) * r,
    )
    return nav.nearestWalkable(_patrol, 6) ?? nav.randomWalkable()
  }

  // ── Main AI tick ──────────────────────────────────────────────────────────

  think(ctx: EnemyContext, dt: number) {
    if (this.aiState === 'dead') return
    this.firedThisTick = false
    if (this.fireCooldown > 0) this.fireCooldown -= dt
    if (this.aggroTimer > 0) this.aggroTimer -= dt

    const dist = distXZ(this.position, ctx.targetPos)
    const playerAlive = ctx.target.alive

    // Update alert timer
    if (playerAlive && dist <= VISION_RANGE) {
      this.alertTimer += dt
    } else {
      this.alertTimer = Math.max(0, this.alertTimer - dt)
    }

    // Territory attraction
    const inTerritory = this.territoryRadius > 0 && distXZ(ctx.targetPos, this.territoryCenter) <= this.territoryRadius
    const attracted = playerAlive && (this.aggroTimer > 0 || inTerritory)

    // State transitions (pure distance-based)
    switch (this.aiState) {
      case 'patrol':
        if (playerAlive && dist <= VISION_RANGE) {
          this.aiState = 'chase'
          this.repathTimer = 0
        } else if (attracted) {
          this.aiState = 'chase'
          this.repathTimer = 0
        }
        break
      case 'chase':
        if (dist <= ATTACK_RANGE && playerAlive) {
          this.aiState = 'attack'
        } else if (!playerAlive || (dist > VISION_RANGE && !attracted)) {
          this.aiState = 'patrol'
        }
        break
      case 'attack':
        if (dist > ATTACK_RANGE) {
          this.aiState = 'chase'
        } else if (!playerAlive) {
          this.aiState = 'patrol'
        }
        break
    }

    // Behavior per state — animation driven by state, NOT by physics velocity
    switch (this.aiState) {
      case 'patrol': {
        this.patrol(ctx.nav, dt)
        const moving = this.pathIndex < this.path.length
        this.applyAnimState(moving ? 'walk' : 'idle')
        break
      }
      case 'chase': {
        // If within standoff range, stop
        if (dist <= STANDOFF_RANGE) {
          this.path = []
          this.halt()
          this.applyAnimState('idle')
          this.facePoint(ctx.targetPos, dt)
        } else {
          this.chaseTo(ctx.nav, ctx.targetPos, CHASE_SPEED, dt)
          this.applyAnimState('run')
          this.facePoint(ctx.targetPos, dt)
        }
        break
      }
      case 'attack': {
        this.halt()
        this.applyAnimState('attackAnim')
        this.facePoint(ctx.targetPos, dt)
        this.tryFire(ctx, dist)
        break
      }
    }
  }

  /** Drive the animator from the AI-defined animation state.
   *  This replaces the old velocity-based animation in update(). */
  private applyAnimState(wanted: AnimState) {
    if (wanted === this.animState) return
    this.animState = wanted
    const a = this.rig.animator
    switch (wanted) {
      case 'idle':
        a.setLocomotion('idle')
        break
      case 'walk':
        a.setLocomotion('walk')
        break
      case 'run':
        a.setLocomotion('run')
        break
      case 'attackAnim':
        // When attacking, force idle body animation and use the firing overlay
        a.setLocomotion('idle')
        if (a.hasClip('firing_rifle')) a.playOverlay('firing_rifle', false, 1.4)
        break
    }
  }

  // ── Shooting ──────────────────────────────────────────────────────────────

  private tryFire(ctx: EnemyContext, dist: number) {
    if (this.fireCooldown > 0) return
    if (this.burstShotsLeft <= 0) {
      this.burstShotsLeft = BURST_LEN
      this.fireCooldown = BURST_PAUSE
      return
    }

    const muzzle = this.getMuzzleWorld(_muzzle)
    if (!muzzle || !Number.isFinite(muzzle.x)) {
      dlog(`[Enemy] ${this.id} ERROR: invalid muzzle position`, muzzle)
      return
    }
    _tEye.copy(ctx.targetPos).setY(ctx.targetPos.y + 0.5)
    _aimDir.set(_tEye.x - muzzle.x, _tEye.y - muzzle.y, _tEye.z - muzzle.z).normalize()

    const settle = Math.min(1, this.alertTimer / AIM_SETTLE_TIME)
    const err = AIM_ERROR_BASE + (AIM_ERROR_SETTLED - AIM_ERROR_BASE) * settle
    _aimDir.x += (Math.random() - 0.5) * err
    _aimDir.y += (Math.random() - 0.5) * err
    _aimDir.z += (Math.random() - 0.5) * err
    _aimDir.normalize()

    ctx.onFire(muzzle, _aimDir)
    this.firedThisTick = true

    const range01 = Math.min(1, dist / ATTACK_RANGE)
    const hitChance = (0.85 - 0.45 * range01) * (0.6 + 0.4 * settle)
    if (Math.random() < hitChance) ctx.dealDamage(ENEMY_DAMAGE)

    this.burstShotsLeft--
    this.fireCooldown = FIRE_INTERVAL
    // Playing the overlay each shot keeps the animation synced
    const a = this.rig.animator
    if (a.hasClip('firing_rifle')) a.playOverlay('firing_rifle', false, 1.4)
  }

  get didFire(): boolean {
    return this.firedThisTick
  }

  // ── Visual sync ───────────────────────────────────────────────────────────

  update(dt: number) {
    const t = this.body.translation()
    this.position.set(t.x, t.y, t.z)

    if (this.aiState === 'dead') {
      this.deadTimer += dt
      try {
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      } catch {}
      this.rig.object.position.set(t.x, t.y - ENEMY_FULL_HALF + this.rig.feetOffset - this.deadTimer * 0.15, t.z)
      this.rig.animator.update(dt)
      return
    }

    this.rig.object.position.set(t.x, t.y - ENEMY_FULL_HALF + this.rig.feetOffset, t.z)
    this.rig.object.rotation.y = this.yaw

    // Animation is now driven entirely by applyAnimState() in think()
    // — no longer based on physics velocity
    this.rig.animator.update(dt)
  }

  dispose() {
    try {
      this.physics.world.removeRigidBody(this.body)
    } catch {}
    this.rig.object.removeFromParent()
  }

  get facingYaw(): number {
    return this.yaw
  }
}