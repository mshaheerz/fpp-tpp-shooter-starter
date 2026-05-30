import { Vector3 } from 'three'
import type { PhysicsSystem } from '../PhysicsSystem'
import type { Scene } from '../Scene'
import type { Player } from '../Player'
import type { CharacterPool } from '../ai/CharacterPool'
import type { NavGrid } from '../ai/NavGrid'
import type { DamageSystem } from '../ai/DamageSystem'
import { Enemy } from '../ai/Enemy'

export type MatchPhase = 'countdown' | 'active' | 'roundEnd' | 'matchEnd'

export interface TdmConfig {
  bots: number
  /** Rounds a team must win to take the match. */
  roundsToWin: number
}

export interface TdmState {
  phase: MatchPhase
  round: number
  playerRoundWins: number
  botRoundWins: number
  roundsToWin: number
  botsAlive: number
  botsTotal: number
  /** Transient banner text (round result / countdown / match result). */
  banner: string
  /** Seconds left on the current countdown/round-end timer (for UI). */
  timer: number
}

export interface TdmDeps {
  physics: PhysicsSystem
  scene: Scene
  pool: CharacterPool
  player: Player
  /** Shared damage router (the same one main's onHit uses for player shots). */
  damage: DamageSystem
  /** Current nav grid (matches the active map). */
  getNav: () => NavGrid
  /** LoS test shared with the rest of the game. */
  hasLineOfSight: (from: Vector3, to: Vector3) => boolean
  /** Enemy gunfire FX. */
  onEnemyFire: (muzzle: Vector3, dir: Vector3) => void
  /** True if the player fired this tick (for enemy hearing). */
  playerFiredNow: () => boolean
}

const COUNTDOWN_TIME = 3
const ROUND_END_TIME = 3.5
const PLAYER_SPAWN = new Vector3(0, 3, 12)
const _v = new Vector3()

/**
 * Team Deathmatch orchestrator. Round-based, NO respawn within a round: when one
 * team is fully eliminated the round ends, everyone respawns, and the winning
 * team's round score ticks up. First to `roundsToWin` takes the match, then it
 * returns to the menu (signalled via `onMatchOver`).
 *
 *   - The player is team `blue` (1 member). Bots are team `red`.
 *   - Bots are spawned at random walkable nav points, kept apart from the player.
 *   - All AI/firing runs through the same DamageSystem the player's shots use.
 */
export class TdmMatch {
  private readonly damage: DamageSystem
  private enemies: Enemy[] = []
  private cfg: TdmConfig

  phase: MatchPhase = 'countdown'
  round = 1
  playerRoundWins = 0
  botRoundWins = 0
  private timer = COUNTDOWN_TIME
  private banner = ''

  /** Fired when the match is fully decided; caller returns to the menu. */
  onMatchOver?: (playerWon: boolean) => void

  constructor(private deps: TdmDeps, cfg: TdmConfig) {
    this.cfg = cfg
    this.damage = deps.damage
    // Player is already registered by main; ensure team is correct.
    deps.player.team = 'blue'
    this.startRound()
  }

  get state(): TdmState {
    return {
      phase: this.phase,
      round: this.round,
      playerRoundWins: this.playerRoundWins,
      botRoundWins: this.botRoundWins,
      roundsToWin: this.cfg.roundsToWin,
      botsAlive: this.damage.aliveOnTeam('red'),
      botsTotal: this.enemies.length,
      banner: this.banner,
      timer: Math.max(0, this.timer),
    }
  }

  /** Spawn bots + player for a fresh round and begin the countdown. */
  private startRound() {
    this.clearEnemies()
    const nav = this.deps.getNav()
    const player = this.deps.player

    // Respawn the player.
    const pSpawn = nav.nearestWalkable(PLAYER_SPAWN, 10, _v) ?? PLAYER_SPAWN
    player.respawn(_v.set(pSpawn.x, pSpawn.y + 1.5, pSpawn.z))

    // Spawn bots away from the player.
    for (let i = 0; i < this.cfg.bots; i++) {
      const spawn = this.pickBotSpawn(nav, player.position)
      const e = new Enemy(this.deps.physics, this.deps.pool, spawn)
      this.deps.scene.add(e.rig.object)
      this.damage.register(e)
      this.damage.registerCollider(e.colliderHandle, e)
      e.onDeath = (dead) => this.damage.unregisterCollider(dead.colliderHandle)
      this.enemies.push(e)
    }

    this.phase = 'countdown'
    this.timer = COUNTDOWN_TIME
    this.banner = `Round ${this.round}`
  }

  private pickBotSpawn(nav: NavGrid, playerPos: Vector3): Vector3 {
    for (let tries = 0; tries < 100; tries++) {
      const p = nav.randomWalkable()
      if (!p) break
      if (p.distanceTo(playerPos) > 14) {
        p.y += 1.5
        console.log(`[TDM] spawn: ${tries} tries, dist=${p.distanceTo(playerPos).toFixed(1)}m`)
        return p
      }
    }
    // Fallback
    for (let tries = 0; tries < 50; tries++) {
      const p = nav.randomWalkable()
      if (!p) break
      if (p.distanceTo(playerPos) > 8) {
        p.y += 1.5
        return p
      }
    }
    const fallback = new Vector3(-playerPos.x * 0.8, playerPos.y + 2, -playerPos.z * 0.8)
    return fallback
  }

  private clearEnemies() {
    for (const e of this.enemies) {
      this.damage.unregister(e)
      e.dispose()
    }
    this.enemies = []
  }

  update(dt: number) {
    switch (this.phase) {
      case 'countdown':
        this.timer -= dt
        if (this.timer <= 0) {
          this.phase = 'active'
          this.banner = ''
        }
        // Freeze AI during countdown (enemies just stand).
        for (const e of this.enemies) e.update(dt)
        return

      case 'active':
        this.tickCombat(dt)
        this.checkRoundEnd()
        return

      case 'roundEnd':
        this.timer -= dt
        for (const e of this.enemies) e.update(dt)
        if (this.timer <= 0) {
          if (this.playerRoundWins >= this.cfg.roundsToWin || this.botRoundWins >= this.cfg.roundsToWin) {
            this.phase = 'matchEnd'
            const playerWon = this.playerRoundWins > this.botRoundWins
            this.banner = playerWon ? 'You win the match!' : 'You lost the match'
            this.timer = ROUND_END_TIME
          } else {
            this.round++
            this.startRound()
          }
        }
        return

      case 'matchEnd':
        this.timer -= dt
        for (const e of this.enemies) e.update(dt)
        if (this.timer <= 0) {
          const playerWon = this.playerRoundWins > this.botRoundWins
          this.onMatchOver?.(playerWon)
        }
        return
    }
  }

  private tickCombat(dt: number) {
    const player = this.deps.player
    const nav = this.deps.getNav()
    const playerFired = this.deps.playerFiredNow()
    for (const e of this.enemies) {
      if (e.alive) {
        const prevState = e.aiState
        e.think(
          {
            nav,
            target: player,
            targetPos: player.position,
            targetFiredNow: playerFired,
            hasLineOfSight: this.deps.hasLineOfSight,
            dealDamage: (dmg) => {
              console.log(`[TDM] Enemy ${e.id} dealt ${dmg} damage to player`)
              this.damage.applyDamage(player, dmg, e.team)
            },
            onFire: this.deps.onEnemyFire,
          },
          dt,
        )
        if (prevState !== e.aiState) {
          const dist = Math.sqrt((e.position.x - player.position.x) ** 2 + (e.position.z - player.position.z) ** 2)
          console.log(`[TDM] Enemy ${e.id} state: ${prevState} → ${e.aiState} (distance: ${dist.toFixed(1)}m)`)
        }
      }
      e.update(dt)
    }
  }

  private checkRoundEnd() {
    const botsAlive = this.damage.aliveOnTeam('red')
    const playerAlive = this.deps.player.alive
    if (botsAlive > 0 && playerAlive) return

    // Round decided.
    if (!playerAlive) {
      this.botRoundWins++
      this.banner = 'Round lost'
    } else {
      this.playerRoundWins++
      this.banner = 'Round won!'
    }
    this.phase = 'roundEnd'
    this.timer = ROUND_END_TIME
  }

  /** Tear the match down (leaving TDM / changing map). Removes enemies but
   *  leaves the player registered in the shared damage system. */
  dispose() {
    this.clearEnemies()
  }
}
