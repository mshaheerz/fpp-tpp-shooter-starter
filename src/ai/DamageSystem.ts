import type { Vector3 } from 'three'

/** Two teams. The player is on `blue`; bots default to `red`. */
export type Team = 'blue' | 'red'

/**
 * Anything that can be shot and can die: the player and every enemy implement
 * this. The DamageSystem only needs these members, so both the human Player and
 * the AI Enemy can be registered the same way.
 */
export interface Combatant {
  readonly id: string
  team: Team
  hp: number
  maxHp: number
  alive: boolean
  /** World position used for hit FX / kill feed. */
  getPosition(out: Vector3): Vector3
  /** Apply `amount` damage from `fromTeam`. Returns true if this hit killed it.
   *  Implementations should clamp hp at 0 and flip `alive` + fire their own
   *  death reaction. */
  takeDamage(amount: number, fromTeam: Team): boolean
}

export interface DamageEvent {
  target: Combatant
  amount: number
  fromTeam: Team
  killed: boolean
}

/**
 * Central router from a physics collider handle to the Combatant that owns it,
 * mirroring `Scene.reactiveByCollider` for destructible props. A weapon hit in
 * `main.ts` first asks the DamageSystem; if the handle belongs to a combatant
 * the hit is consumed here (and props are skipped), otherwise it falls through
 * to the existing prop-reaction path.
 *
 *   - Friendly fire is off by default (bots can't kill each other, you can't be
 *     hit by your own ray — though the ray already excludes the player body).
 *   - `onDamage` lets the HUD/match react (hit markers, kill feed, win checks).
 */
export class DamageSystem {
  private byCollider = new Map<number, Combatant>()
  private combatants = new Set<Combatant>()
  friendlyFire = false
  onDamage?: (e: DamageEvent) => void

  register(combatant: Combatant) {
    this.combatants.add(combatant)
  }

  unregister(combatant: Combatant) {
    this.combatants.delete(combatant)
    for (const [h, c] of this.byCollider) if (c === combatant) this.byCollider.delete(h)
  }

  /** Associate a physics collider handle with a combatant (its capsule). */
  registerCollider(handle: number, combatant: Combatant) {
    this.byCollider.set(handle, combatant)
  }

  unregisterCollider(handle: number) {
    this.byCollider.delete(handle)
  }

  /** True if the handle belongs to a living combatant (so callers can decide
   *  whether the shot was "absorbed" by a body vs the world). */
  isCombatant(handle: number): boolean {
    const c = this.byCollider.get(handle)
    return !!c && c.alive
  }

  /**
   * Apply a hit identified by collider handle. Returns true if the handle
   * mapped to a combatant (whether or not damage was dealt — e.g. friendly
   * fire is ignored but still "absorbed" by the body so it doesn't punch
   * through to a prop behind it).
   */
  applyHitByCollider(handle: number, amount: number, fromTeam: Team): boolean {
    const target = this.byCollider.get(handle)
    if (!target) return false
    if (!target.alive) return true
    if (!this.friendlyFire && target.team === fromTeam) return true
    const killed = target.takeDamage(amount, fromTeam)
    this.onDamage?.({ target, amount, fromTeam, killed })
    return true
  }

  /** Direct damage (used by melee / explosions that already know the target). */
  applyDamage(target: Combatant, amount: number, fromTeam: Team): boolean {
    if (!target.alive) return false
    if (!this.friendlyFire && target.team === fromTeam) return false
    const killed = target.takeDamage(amount, fromTeam)
    this.onDamage?.({ target, amount, fromTeam, killed })
    return killed
  }

  /** Living combatants on a team — used by the match to detect a wipe. */
  aliveOnTeam(team: Team): number {
    let n = 0
    for (const c of this.combatants) if (c.team === team && c.alive) n++
    return n
  }

  clear() {
    this.byCollider.clear()
    this.combatants.clear()
  }
}
