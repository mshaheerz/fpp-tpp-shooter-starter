import RAPIER from '@dimforge/rapier3d-compat'
import { Vector3, Object3D } from 'three'
import type { PhysicsSystem } from '../PhysicsSystem'
import type { CharacterRig, CharacterPool } from './CharacterPool'
import type { Combatant, Team } from './DamageSystem'
import type { NavGrid } from './NavGrid'
import { dlog } from '../debug/log'
import { wrapAngle } from '../common/math'
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

export type EnemyAiState = 'patrol' | 'chase' | 'dead'
type AnimState = 'idle' | 'walk' | 'run' | 'attackAnim'

export interface EnemyContext {
  nav: NavGrid
  target: Combatant
  targetPos: Vector3
  dealDamage: (dmg: number) => void
  onFire: (muzzle: Vector3, dir: Vector3) => void
}

const _v = new Vector3()
const _muzzle = new Vector3()
const _tEye = new Vector3()
const _aimDir = new Vector3()
const _patrol = new Vector3()
const _rayFrom = new Vector3()
const _rayTo = new Vector3()
const _rayDir = new Vector3()

let _enemySeq = 0

/** Simple enemy AI — distance-based. Shoots while running when in range. */
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
  private animState: AnimState = 'idle'
  private deadTimer = 0

  private path: Vector3[] = []
  private pathIndex = 0
  private repathTimer = 0

  private alertTimer = 0
  private fireCooldown = 0
  private burstShotsLeft = BURST_LEN
  private firedThisTick = false
  private aggroTimer = 0
  // Keeps the looping firing overlay alive for a short window past the last shot
  // so rapid bursts don't restart it every shot (which caused locomotion flicker).
  private fireHoldTimer = 0
  private firingOverlayOn = false

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

  get colliderHandle(): number { return this.collider.handle }
  getPosition(out: Vector3): Vector3 { return out.copy(this.position) }

  getEyePosition(out: Vector3): Vector3 {
    return out.copy(this.position).setY(this.position.y + ENEMY_HALF_HEIGHT)
  }

  getMuzzleWorld(out = _muzzle): Vector3 {
    return this.muzzle.getWorldPosition(out)
  }

  takeDamage(amount: number, _fromTeam: Team): boolean {
    if (!this.alive || amount <= 0) return false
    this.hp = Math.max(0, this.hp - amount)
    if (this.hp <= 0) { this.die(); return true }
    this.aggroTimer = DAMAGE_AGGRO_DURATION
    if (this.aiState === 'patrol') { this.aiState = 'chase'; this.repathTimer = 0 }
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
    // Drop any active firing loop so it doesn't fight the death clip.
    if (this.firingOverlayOn) { a.stopOverlay('firing_rifle'); this.firingOverlayOn = false }
    this.fireHoldTimer = 0
    const deathClip = ['death', 'dying', 'falling_to_landing'].find((n) => a.hasClip(n))
    if (deathClip) a.playDeath(deathClip)
    this.onDeath?.(this)
  }

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
    if (dist > 0.001) { _v.multiplyScalar(speed / dist); this.yaw = Math.atan2(_v.x, _v.z) }
    else { _v.set(0, 0, 0) }
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
    if (this.pathIndex >= this.path.length) { this.halt(); return false }
    const node = this.path[this.pathIndex]
    const dx = node.x - this.position.x, dz = node.z - this.position.z
    if (dx * dx + dz * dz < 0.35 * 0.35) {
      this.pathIndex++
      if (this.pathIndex >= this.path.length) { this.halt(); return false }
    }
    this.moveToward(this.path[this.pathIndex], speed)
    return true
  }

  private chaseTo(nav: NavGrid, dest: Vector3, speed: number, dt: number) {
    this.repathTimer -= dt
    if (this.repathTimer <= 0) { this.setPathTo(nav, dest); this.repathTimer = REPATH_INTERVAL }
    this.followPath(speed)
  }

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
    _patrol.set(this.territoryCenter.x + Math.cos(angle) * r, this.territoryCenter.y, this.territoryCenter.z + Math.sin(angle) * r)
    return nav.nearestWalkable(_patrol, 6) ?? nav.randomWalkable()
  }

  // ── Main AI tick ──────────────────────────────────────────────────────────

  think(ctx: EnemyContext, dt: number) {
    if (this.aiState === 'dead') return
    this.firedThisTick = false
    if (this.fireCooldown > 0) this.fireCooldown -= dt
    if (this.aggroTimer > 0) this.aggroTimer -= dt
    if (this.fireHoldTimer > 0) this.fireHoldTimer -= dt

    const dist = distXZ(this.position, ctx.targetPos)
    const playerAlive = ctx.target.alive

    if (playerAlive && dist <= VISION_RANGE) this.alertTimer += dt
    else this.alertTimer = Math.max(0, this.alertTimer - dt)

    const inTerritory = this.territoryRadius > 0 && distXZ(ctx.targetPos, this.territoryCenter) <= this.territoryRadius
    const attracted = playerAlive && (this.aggroTimer > 0 || inTerritory)

    // State transitions
    if (this.aiState === 'patrol') {
      if ((playerAlive && dist <= VISION_RANGE) || attracted) { this.aiState = 'chase'; this.repathTimer = 0 }
    } else if (this.aiState === 'chase') {
      if (!playerAlive || (dist > VISION_RANGE && !attracted)) this.aiState = 'patrol'
    }

    // Behavior — single chase state handles everything: patrol → chase → shoot
    switch (this.aiState) {
      case 'patrol':
        this.patrol(ctx.nav, dt)
        this.applyAnimState(this.pathIndex < this.path.length ? 'walk' : 'idle')
        break
      case 'chase': {
        this.facePoint(ctx.targetPos, dt)
        if (dist <= ATTACK_RANGE) {
          this.tryFire(ctx, dist) // Shoot while running (like YAZH)
        }
        if (dist <= STANDOFF_RANGE) {
          this.path = []
          this.halt()
          this.applyAnimState('attackAnim')
        } else {
          this.chaseTo(ctx.nav, ctx.targetPos, CHASE_SPEED, dt)
          this.applyAnimState('run')
        }
        break
      }
    }

    // Start/stop the looping firing overlay based on whether we're shooting.
    this.syncFiringOverlay()
  }

  private applyAnimState(wanted: AnimState) {
    if (wanted === this.animState) return
    this.animState = wanted
    const a = this.rig.animator
    switch (wanted) {
      case 'idle': a.setLocomotion('idle'); break
      case 'walk': a.setLocomotion('walk'); break
      case 'run': a.setLocomotion('run'); break
      case 'attackAnim': a.setLocomotion('idle'); break
    }
  }

  /**
   * Drive the firing overlay as a single LOOPING action that lives for as long
   * as the enemy is actively shooting (fireHoldTimer > 0), then stops. Starting
   * one short one-shot overlay per shot (every FIRE_INTERVAL) made locomotion
   * weight oscillate 0↔1, which read as a flicker while the enemy ran in. A
   * loop fades locomotion out once and back once, so the transition is smooth.
   */
  private syncFiringOverlay() {
    const a = this.rig.animator
    if (!a.hasClip('firing_rifle')) return
    const shouldFire = this.fireHoldTimer > 0
    if (shouldFire && !this.firingOverlayOn) {
      a.playOverlay('firing_rifle', true, 1.4) // loop=true: held while firing
      this.firingOverlayOn = true
    } else if (!shouldFire && this.firingOverlayOn) {
      a.stopOverlay('firing_rifle')
      this.firingOverlayOn = false
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
    if (!muzzle || !Number.isFinite(muzzle.x)) return

    // Wall check: raycast from muzzle toward player, excluding enemy's own body
    _tEye.copy(ctx.targetPos).setY(ctx.targetPos.y + 0.5)
    _aimDir.set(_tEye.x - muzzle.x, _tEye.y - muzzle.y, _tEye.z - muzzle.z)
    const losDist = _aimDir.length()
    _aimDir.normalize()
    const losHit = this.physics.raycast(
      { x: muzzle.x, y: muzzle.y, z: muzzle.z },
      { x: _aimDir.x, y: _aimDir.y, z: _aimDir.z },
      losDist + 0.5,
      this.body,
    )
    if (losHit && losHit.toi < losDist - 0.4) return // wall between

    // Aim with spread
    const settle = Math.min(1, this.alertTimer / AIM_SETTLE_TIME)
    const err = AIM_ERROR_BASE + (AIM_ERROR_SETTLED - AIM_ERROR_BASE) * settle
    _aimDir.x += (Math.random() - 0.5) * err
    _aimDir.y += (Math.random() - 0.5) * err
    _aimDir.z += (Math.random() - 0.5) * err
    _aimDir.normalize()

    ctx.onFire(muzzle, _aimDir)
    this.firedThisTick = true

    // Hit chance (scaled by range + settle)
    const range01 = Math.min(1, dist / ATTACK_RANGE)
    const hitChance = (0.85 - 0.45 * range01) * (0.6 + 0.4 * settle)
    if (Math.random() < hitChance) ctx.dealDamage(ENEMY_DAMAGE)

    this.burstShotsLeft--
    this.fireCooldown = FIRE_INTERVAL
    // Keep the looping firing overlay alive a touch past this shot's interval so
    // back-to-back burst shots don't drop it; it expires during the longer
    // BURST_PAUSE so the enemy reverts to plain running between bursts.
    this.fireHoldTimer = FIRE_INTERVAL + 0.15
  }

  get didFire(): boolean { return this.firedThisTick }

  update(dt: number) {
    const t = this.body.translation()
    this.position.set(t.x, t.y, t.z)

    if (this.aiState === 'dead') {
      this.deadTimer += dt
      try { this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true) } catch {}
      this.rig.object.position.set(t.x, t.y - ENEMY_FULL_HALF + this.rig.feetOffset - this.deadTimer * 0.15, t.z)
      this.rig.animator.update(dt)
      return
    }

    this.rig.object.position.set(t.x, t.y - ENEMY_FULL_HALF + this.rig.feetOffset, t.z)
    this.rig.object.rotation.y = this.yaw
    this.rig.animator.update(dt)
  }

  dispose() {
    try { this.physics.world.removeRigidBody(this.body) } catch {}
    this.rig.object.removeFromParent()
  }

  get facingYaw(): number { return this.yaw }
}