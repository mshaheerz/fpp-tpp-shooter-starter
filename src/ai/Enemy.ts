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
import { computeSight, isInTerritory } from './enemyPerception'
import { findCoverPoint } from './enemyCover'
import {
  ENEMY_RADIUS,
  ENEMY_HALF_HEIGHT,
  ENEMY_FULL_HALF,
  ENEMY_MAX_HP,
  HEARING_RANGE,
  ATTACK_RANGE,
  ATTACK_STOP_RANGE,
  REACTION_TIME,
  FIRE_INTERVAL,
  BURST_LEN,
  BURST_PAUSE,
  AIM_ERROR_BASE,
  AIM_ERROR_SETTLED,
  AIM_SETTLE_TIME,
  ENEMY_DAMAGE,
  SEARCH_DURATION,
  REPATH_INTERVAL,
  COVER_REEVAL_INTERVAL,
  COVER_ARRIVE_DIST,
  PEEK_STEP,
  DAMAGE_AGGRO_DURATION,
  distXZ,
} from './enemyConstants'

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

// Per-tick scratch vectors (module-local; never aliased across the call tree).
const _v = new Vector3()
const _muzzle = new Vector3()
const _eye = new Vector3()
const _tEye = new Vector3()
const _aimDir = new Vector3()
const _peek = new Vector3()
const _patrol = new Vector3()
const _toTarget = new Vector3()

let _enemySeq = 0

/**
 * An AI combatant: a Rapier capsule + a cloned Mixamo rig + a rifle.
 *
 * This class is the **state container + thin orchestration**. The heavy logic is
 * split into focused modules: tuning in `enemyConstants`, sensing in
 * `enemyPerception`, cover search in `enemyCover`, and the weapon model in
 * `EnemyWeapon`. `think()` runs perception → state machine → behavior each fixed
 * step (call BEFORE `update()`, which syncs the visual + animation).
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
  private deadTimer = 0

  // Path-follow state (shared by patrol + chase + cover approach).
  private path: Vector3[] = []
  private pathIndex = 0
  private repathTimer = 0
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
  /** Seconds of forced aggression remaining after being shot (engage regardless
   *  of range/territory). Set by takeDamage, decays in think. */
  private aggroTimer = 0

  // Territory (guard zone). Center defaults to spawn; set via setTerritory().
  private territoryCenter = new Vector3()
  private territoryRadius = 0

  // Cover (peek & shoot).
  private coverPoint = new Vector3()
  private hasCover = false
  private coverTimer = 0

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
    this.territoryCenter.copy(spawn) // default zone center
  }

  /** Define the circular guard zone this enemy patrols and defends. The player
   *  entering this circle "attracts" the enemy even without line of sight. */
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
    // Getting shot — even from out of range or behind — makes the enemy commit:
    // it now knows roughly where the player is and engages seriously. think()
    // reads `aggroTimer` to force chase/attack regardless of range or territory.
    this.aggroTimer = DAMAGE_AGGRO_DURATION
    if (this.aiState === 'patrol' || this.aiState === 'search') {
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

  // ── Low-level movement primitives ───────────────────────────────────────────

  /** Aim the body toward a yaw (radians). */
  faceYaw(targetYaw: number, dt: number, rate = 10) {
    this.yaw += wrapAngle(targetYaw - this.yaw) * Math.min(1, rate * dt)
  }

  /** Turn to face a world point (XZ). */
  private facePoint(point: Vector3, dt: number, rate = 12) {
    this.faceYaw(Math.atan2(point.x - this.position.x, point.z - this.position.z), dt, rate)
  }

  /** Drive the capsule horizontally toward a world point at `speed` m/s. */
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

  /** Stop horizontal movement (keep vertical for gravity). */
  halt() {
    const v = this.body.linvel()
    this.body.setLinvel({ x: 0, y: v.y, z: 0 }, true)
  }

  /** Replace the current path with a route to `dest`. Returns true if found. */
  setPathTo(nav: NavGrid, dest: Vector3): boolean {
    const route = nav.findPath(this.position, dest)
    this.path = route ?? []
    this.pathIndex = 0
    return this.path.length > 0
  }

  /** Follow the current path at `speed`. Returns true while still travelling. */
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

  /** Re-path toward `dest` at most every REPATH_INTERVAL, then follow at `speed`. */
  private chaseTo(nav: NavGrid, dest: Vector3, speed: number, dt: number) {
    this.repathTimer -= dt
    if (this.repathTimer <= 0) {
      this.setPathTo(nav, dest)
      this.repathTimer = REPATH_INTERVAL
    }
    this.followPath(speed)
  }

  // ── Patrol ────────────────────────────────────────────────────────────────

  /** Idle wander. Inside a territory it stays near the zone; otherwise roams. */
  patrol(nav: NavGrid, dt: number) {
    if (this.aiState === 'dead') return
    this.repathTimer -= dt
    const travelling = this.followPath(this.patrolSpeed)
    if (!travelling || this.repathTimer <= 0) {
      const dest = this.pickPatrolDest(nav)
      if (dest) this.setPathTo(nav, dest)
      this.repathTimer = 4 + Math.random() * 3
    }
  }

  private pickPatrolDest(nav: NavGrid): Vector3 | null {
    if (this.territoryRadius <= 0) return nav.randomWalkable()
    const angle = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * this.territoryRadius // uniform in disc
    _patrol.set(
      this.territoryCenter.x + Math.cos(angle) * r,
      this.territoryCenter.y,
      this.territoryCenter.z + Math.sin(angle) * r,
    )
    return nav.nearestWalkable(_patrol, 6) ?? nav.randomWalkable()
  }

  // ── Main AI tick ────────────────────────────────────────────────────────────

  think(ctx: EnemyContext, dt: number) {
    if (this.aiState === 'dead') return
    this.firedThisTick = false
    if (this.fireCooldown > 0) this.fireCooldown -= dt
    if (this.aggroTimer > 0) this.aggroTimer -= dt

    this.getEyePosition(_eye)
    _tEye.copy(ctx.targetPos).setY(ctx.targetPos.y + 0.5)
    const toTarget = _toTarget.set(ctx.targetPos.x - this.position.x, 0, ctx.targetPos.z - this.position.z)

    const { canSee, dist } = computeSight(ctx, _eye, _tEye, this.position, this.yaw, toTarget)

    this.updatePerception(ctx, canSee, dist, dt)
    this.updateState(canSee, dist)
    this.runBehavior(ctx, dt, dist, toTarget, canSee)
  }

  /** Fold sight/hearing/territory/aggro into last-known + alert memory. */
  private updatePerception(ctx: EnemyContext, canSee: boolean, dist: number, dt: number) {
    const alive = ctx.target.alive

    // Hearing: gunfire within range reveals the player's position.
    if (!canSee && alive && ctx.targetFiredNow && dist <= HEARING_RANGE) {
      this.lastKnownTarget.copy(ctx.targetPos)
      this.hasLastKnown = true
      if (this.aiState === 'patrol') {
        this.aiState = 'search'
        this.searchTimer = SEARCH_DURATION
      }
    }

    // Territory attraction OR being-shot aggro: pull the enemy onto the player
    // even without line of sight. Both refresh last-known to the live position.
    const attracted =
      alive &&
      (this.aggroTimer > 0 || isInTerritory(ctx.targetPos, this.territoryCenter, this.territoryRadius))
    if (!canSee && attracted) {
      this.lastKnownTarget.copy(ctx.targetPos)
      this.hasLastKnown = true
      if (this.aiState === 'patrol') {
        this.aiState = 'chase'
        this.repathTimer = 0
      }
    }

    if (canSee) {
      this.lastKnownTarget.copy(ctx.targetPos)
      this.hasLastKnown = true
      this.alertTimer += dt
    } else if (this.alertTimer > 0) {
      this.alertTimer = Math.max(0, this.alertTimer - dt * 0.5)
    }
  }

  /** State transitions. Aggro keeps the enemy committed even with no sight. */
  private updateState(canSee: boolean, dist: number) {
    const committed = this.aggroTimer > 0
    switch (this.aiState) {
      case 'patrol':
        if (canSee) {
          this.aiState = 'chase'
          console.log(`[Enemy] ${this.id} patrol→chase (see player at ${dist.toFixed(1)}m)`)
          dlog(`[Enemy] ${this.id} patrol→chase (see player at ${dist.toFixed(1)}m)`)
        }
        break
      case 'chase':
        if (canSee && dist <= ATTACK_RANGE) {
          this.aiState = 'attack'
          console.log(`[Enemy] ${this.id} chase→attack (within ${dist.toFixed(1)}m, ATTACK_RANGE=${ATTACK_RANGE})`)
          dlog(`[Enemy] ${this.id} chase→attack (within ${dist.toFixed(1)}m)`)
        } else if (!canSee && !this.hasLastKnown && !committed) this.aiState = 'patrol'
        break
      case 'attack':
        if (!canSee) {
          // Ducking behind cover loses LoS on purpose — only bail once alert
          // memory has fully decayed and we're not still committed by aggro.
          if (this.alertTimer <= 0 && !committed) {
            this.aiState = 'search'
            this.searchTimer = SEARCH_DURATION
            this.hasCover = false
          }
        } else if (dist > ATTACK_RANGE) {
          this.aiState = 'chase'
          this.hasCover = false
        }
        break
      case 'search':
        if (canSee) this.aiState = dist <= ATTACK_RANGE ? 'attack' : 'chase'
        break
    }
  }

  /** Drive movement/firing for the current state. */
  private runBehavior(
    ctx: EnemyContext,
    dt: number,
    dist: number,
    toTarget: Vector3,
    canSee: boolean,
  ) {
    switch (this.aiState) {
      case 'patrol':
        this.alertTimer = 0
        this.hasCover = false
        this.patrol(ctx.nav, dt)
        break
      case 'chase':
        // Close the gap, but only until within shooting range WITH line of sight —
        // then hold so the enemy fights from range instead of running into you.
        if (canSee && dist <= ATTACK_STOP_RANGE) {
          this.path = []
          this.halt()
          this.facePoint(ctx.targetPos, dt)
        } else {
          this.chaseTo(ctx.nav, this.hasLastKnown ? this.lastKnownTarget : ctx.targetPos, this.chaseSpeed, dt)
        }
        break
      case 'attack':
        this.attackWithCover(ctx, dt, dist, toTarget, canSee)
        break
      case 'search': {
        this.searchTimer -= dt
        if (this.hasLastKnown) this.chaseTo(ctx.nav, this.lastKnownTarget, this.patrolSpeed, dt)
        const arrived = this.pathIndex >= this.path.length && this.atLastKnown()
        if (this.searchTimer <= 0 || arrived) {
          this.hasLastKnown = false
          this.aiState = 'patrol'
        }
        break
      }
    }
  }

  private atLastKnown(): boolean {
    return distXZ(this.lastKnownTarget, this.position) < 1.2
  }

  // ── Attack: peek & shoot from cover ───────────────────────────────────────

  /**
   * Hold a cover spot that breaks the target's line of sight, duck there between
   * bursts, and lean out (PEEK_STEP) to fire. Falls back to a ranged stand-off
   * when no cover is reachable, so the enemy never freezes — and never charges
   * into melee, because it only advances while too far to shoot.
   */
  private attackWithCover(
    ctx: EnemyContext,
    dt: number,
    dist: number,
    toTarget: Vector3,
    canSee: boolean,
  ) {
    this.coverTimer -= dt
    if (!this.hasCover || this.coverTimer <= 0) {
      const spot = findCoverPoint(ctx, this.position)
      this.hasCover = spot !== null
      if (spot) {
        this.coverPoint.copy(spot)
        this.setPathTo(ctx.nav, this.coverPoint)
      }
      this.coverTimer = COVER_REEVAL_INTERVAL
    }

    const peeking = this.burstShotsLeft > 0
    if (this.hasCover) {
      if (distXZ(this.position, this.coverPoint) > COVER_ARRIVE_DIST) {
        this.followPath(this.chaseSpeed) // still moving to cover
      } else if (peeking && this.alertTimer >= REACTION_TIME) {
        // Lean out toward the target to take the shot.
        const inv = 1 / (dist || 1)
        _peek.set(
          this.coverPoint.x + toTarget.x * inv * PEEK_STEP,
          this.position.y,
          this.coverPoint.z + toTarget.z * inv * PEEK_STEP,
        )
        this.moveToward(_peek, this.patrolSpeed)
      } else {
        this.moveToward(this.coverPoint, this.patrolSpeed) // duck back
      }
    } else {
      // No cover: hold ground at shooting range (never push into the player).
      this.path = []
      this.halt()
    }

    this.facePoint(canSee ? ctx.targetPos : this.lastKnownTarget, dt)

    if (canSee && this.alertTimer >= REACTION_TIME) {
      console.log(
        `[Enemy] ${this.id} trying to fire: cooldown=${this.fireCooldown.toFixed(2)}, burstLeft=${this.burstShotsLeft}, alertTimer=${this.alertTimer.toFixed(2)}`
      )
      dlog(
        `[Enemy] ${this.id} trying to fire: cooldown=${this.fireCooldown.toFixed(2)}, burstLeft=${this.burstShotsLeft}, alertTimer=${this.alertTimer.toFixed(2)}`
      )
      this.tryFire(ctx, dist)
    }
  }

  /** Rate-limited bursts with aim error that settles over time. */
  private tryFire(ctx: EnemyContext, dist: number) {
    console.log(`[tryFire] ${this.id}: checking conditions - cooldown=${this.fireCooldown.toFixed(3)}, burstLeft=${this.burstShotsLeft}`)
    if (this.fireCooldown > 0) {
      console.log(`[tryFire] ${this.id}: on cooldown, skipping`)
      return
    }
    if (this.burstShotsLeft <= 0) {
      console.log(`[tryFire] ${this.id}: burst over, setting up new burst`)
      this.burstShotsLeft = BURST_LEN
      this.fireCooldown = BURST_PAUSE
      return
    }

    const muzzle = this.getMuzzleWorld(_muzzle)
    if (!muzzle || !Number.isFinite(muzzle.x)) {
      console.error(`[tryFire] ${this.id}: ERROR: invalid muzzle position`, muzzle)
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

    // Forgiving hit chance scaled by distance + settle (no second raycast).
    const range01 = Math.min(1, dist / ATTACK_RANGE)
    const hitChance = (0.85 - 0.45 * range01) * (0.6 + 0.4 * settle)
    if (Math.random() < hitChance) ctx.dealDamage(ENEMY_DAMAGE)

    this.burstShotsLeft--
    this.fireCooldown = FIRE_INTERVAL
    const a = this.rig.animator
    if (a.hasClip('firing_rifle')) a.playOverlay('firing_rifle', false, 1.4)
  }

  get didFire(): boolean {
    return this.firedThisTick
  }

  // ── Per-frame visual sync ─────────────────────────────────────────────────

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

    const v = this.body.linvel()
    const speed = Math.hypot(v.x, v.z)
    const a = this.rig.animator
    if (speed < MOVE_SPEED_THRESHOLD) a.setLocomotion('idle')
    else if (speed > RUN_SPEED_THRESHOLD) a.setLocomotion('run')
    else a.setLocomotion('walk')
    a.setAir(false)
    a.update(dt)
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
