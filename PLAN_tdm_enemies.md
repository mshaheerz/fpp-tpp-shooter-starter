# Plan: TDM enemies (same Mixamo character) + mutual combat + menu mode

## Goal
Add AI enemies that use the **same Mixamo character** as the player, can shoot the
player (and be shot), with a **Team Deathmatch** mode selectable from the menu.
Per the chosen options: **round-based (no respawn, last team standing wins)**,
enemies **navigate** (grid-based pathfinding around obstacles), characters are
**cloned** (load GLB once, `SkeletonUtils.clone` per bot), and TDM gets its **own
menu section** with bot count + settings.

## Honest note on "full navmesh patrol"
The maps are essentially **flat ground planes with props on top** (see
`src/maps/*.ts`). A true recast/detour navmesh is a heavy 3rd-party dependency and
weeks of integration. Instead I'll build a **uniform navigation grid** over the
flat play area, mark blocked cells by sampling the Rapier physics world (sphere
overlap / short raycasts) at startup, and run **A\*** for paths. This delivers the
*behavior* the option implies — patrol waypoints, walk around buildings/crates,
chase with pathing — without the dependency. If a real navmesh is wanted later,
the `NavGrid` interface is small enough to swap for recast output.

---

## Architecture overview

```
TdmMatch (orchestrator, owned by main.ts)
 ├── NavGrid            grid + A* over the flat map, blocked cells from physics
 ├── CharacterPool      loads base GLB + clips ONCE, hands out cloned rigs
 ├── Combatant (player) thin adapter exposing pos/health/team for the player
 ├── Enemy[]            AI agents: nav + perception + weapon firing
 ├── DamageSystem       central HP + hit routing (collider handle -> combatant)
 └── TdmHud / overlay   round state, scores, your health, death/win banner
```

### Key integration seams (already in codebase)
- **Hit routing today:** `WeaponShooter.fire()` raycasts, `onHit(hit, stats, dir)`
  in `main.ts` calls `scene.applyBulletHit(hit.colliderHandle, dmg)`. We extend
  this: a new `DamageSystem` keeps a `Map<colliderHandle, Combatant>` (mirroring
  `Scene.reactiveByCollider`). `onHit` first checks the DamageSystem; if the
  handle belongs to a combatant, apply player→enemy damage; else fall through to
  the existing prop reaction.
- **Character reuse:** `ThirdPersonCharacter.load(manifest)` builds a fresh
  animator from a freshly loaded `baseRoot`. We add a `CharacterPool` that loads
  the manifest once, then `SkeletonUtils.clone()` the skinned base per enemy and
  shares the already-parsed `AnimationClip`s (clips are immutable data and can be
  bound to multiple mixers). Each enemy gets its **own** `CharacterAnimator`.
- **Enemy bodies:** reuse the player's capsule pattern
  (`PhysicsSystem.createCapsule`) for each enemy so they collide with the world
  and so the player's bullets hit a real collider. Register each enemy capsule
  collider handle in `DamageSystem`.
- **Enemies shooting back:** enemies don't use the FPP `WeaponShooter` (that's
  camera-coupled). They get a lightweight `enemyFire()` that raycasts from their
  muzzle toward the player with aim error + reaction delay, then calls
  `DamageSystem.applyHit(playerCombatant, dmg)`. Tracer/muzzle FX reuse the
  existing `flashSprites` / `BulletInstancedParticleSystem` via callbacks.

---

## New files
1. **`src/ai/NavGrid.ts`**
   - Build a 2D grid (cell ~0.6 m) over a configured bounds (from map ground size).
   - Mark blocked cells: for each cell center, do a short vertical-capsule overlap
     / down+side raycasts against the physics world; if a static collider is
     within player radius, block it. Cache per map id.
   - `findPath(from, to): Vector3[]` — A\* with diagonal movement + string-pull
     smoothing so paths aren't zig-zaggy.
   - `randomWalkable()` for patrol waypoints; `nearestWalkable(p)` to snap.

2. **`src/ai/Enemy.ts`**
   - Holds: capsule body (Rapier), cloned `ThirdPersonCharacter`-like rig,
     `CharacterAnimator`, weapon model on the right hand, team, HP, AI state.
   - **AI state machine:** `Patrol` (walk between nav waypoints) → `Chase`
     (path to last-known player pos when alerted) → `Attack` (in range + LoS:
     stop, face player, fire bursts) → `Search` (go to last-known, then back to
     patrol) → `Dead` (ragdoll-lite: play death/fall, freeze, disable collider).
   - **Perception:** vision cone (FOV + range) + LoS raycast (exclude self);
     hearing on player gunfire (alert radius). Reaction delay before first shot.
   - **Movement:** follow current path node-to-node using the same
     capsule-velocity approach as `Player` (kinematic-ish: set linvel toward next
     node, snap yaw, gravity stays on). Animator fed velocity → existing
     locomotion blend tree drives walk/run/idle automatically.
   - **Firing:** rate-limited from `WEAPONS[id]`; raycast muzzle→player with
     spread that shrinks the longer it's been aiming; on hit calls damage cb.

3. **`src/ai/DamageSystem.ts`**
   - `Combatant` = { id, team, getPosition(), hp, maxHp, alive, onDamaged?,
     onDeath? }.
   - `registerCollider(handle, combatant)` / `unregister`.
   - `applyHitByCollider(handle, dmg, fromTeam): boolean` (returns true if it was
     a combatant). Ignores friendly fire (configurable). Fires death callbacks.
   - Player is a `Combatant` too, so enemies damage the player through the same
     path and the HUD reads `player.hp`.

4. **`src/ai/CharacterPool.ts`**
   - `init(manifest)` loads base + clips once (reuses the load logic, refactored
     so `ThirdPersonCharacter` and the pool share a `buildRigFromGltf` helper).
   - `spawnRig()` → `{ object, bones, animator }` via `SkeletonUtils.clone`.
   - Falls back to placeholder humanoid clones if the manifest isn't present
     (keeps the "everything works without assets" property the repo values).

5. **`src/modes/TdmMatch.ts`**
   - Owns round lifecycle: spawn N enemies (one team) + player (other team) at
     spread spawn points (from nav `randomWalkable`, min distance apart).
   - Round-based: when one team is fully dead → round over → show banner →
     after delay, reset (respawn all, increment round score) or return to menu
     after a target number of rounds.
   - `update(dt)` ticks all enemies, checks win/los, updates the TDM HUD overlay.
   - Exposes `playerCombatant` and wires enemy-fire FX through callbacks passed
     from `main.ts` (so it reuses existing particle systems, no duplication).

6. **`src/ui/TdmHud.ts`** (or extend `HUD`)
   - Player health bar, round score (You vs Bots), round number, kill feed line,
     center banner for "Round won/lost" and "Match over".

## Modified files
- **`src/MapMenu.ts` + `index.html`**
  - Add a **Team Deathmatch** section below the map cards: a small panel with
    bot-count stepper, rounds-to-win, and a "Start TDM" button per map (or a
    mode toggle that changes what clicking a card does). `show()` resolves with
    `{ mapId, mode: 'roam' | 'tdm', tdm?: { bots, rounds } }` instead of a bare
    id. Keep backward-compat default = roam.
- **`src/Player.ts`**
  - Add `hp`, `maxHp`, `alive`, `team`, `takeDamage(n)`, `respawn(pos)` and a
    `Combatant` adapter. Death: lock input, show banner (handled by TdmMatch).
  - Expose a muzzle/eye origin for enemy LoS targeting (reuse `eyePosition`).
- **`src/weapon/WeaponShooter.ts` / `main.ts` `onHit`**
  - Route combatant hits through `DamageSystem` before prop reaction. Add hit
    markers (crosshair flash) + hit/kill sound.
- **`src/main.ts`**
  - Instantiate `CharacterPool`, `NavGrid` (after map load), `DamageSystem`.
  - If selected mode is TDM, build `TdmMatch`; tick it in the fixed loop; render
    `TdmHud`. In roam mode everything behaves exactly as today.
  - Rebuild nav grid + reset match on map change (M key) and on round reset.
- **`src/PhysicsSystem.ts`**
  - Small helpers if needed: `overlapSphere(center, r, excludeBody?)` (or reuse
    `spherecast`) for nav-cell blocking and enemy spacing.

## Dependencies
- `three/examples/jsm/utils/SkeletonUtils.js` (ships with three — no new npm dep)
  for skinned-mesh cloning. No recast/detour added.

---

## Sequencing (incremental, each step builds + is testable)
1. **DamageSystem + player HP** (no enemies yet): player has HP/health bar; prove
   hit routing still works for props. Add hit marker + sounds.
2. **CharacterPool**: refactor rig-building out of `ThirdPersonCharacter`; clone a
   second character standing in the world (dummy, no AI) and confirm animations
   play on the clone independently.
3. **Enemy capsule + DamageSystem registration**: the dummy becomes shootable;
   shooting it plays a hit/death reaction. Player can kill a static bot.
4. **NavGrid + A\***: visualize (debug lines via existing debug pattern) and make
   one bot patrol waypoints, walking around props.
5. **Perception + chase + enemy firing**: bot sees player, chases, shoots; player
   takes damage and can die. Tune aim error / reaction / damage for fairness.
6. **TdmMatch round lifecycle + spawns + win/lose** with multiple bots.
7. **Menu TDM section** wiring `{mode, bots, rounds}` → `TdmMatch`.
8. **TdmHud** polish: scores, round banners, kill feed; balance pass.

## Risks / tradeoffs to flag
- Nav grid blocking is sampled from physics at map load; very thin or floating
  geometry may mis-mark — mitigated by cell size + multi-point sampling.
- Many cloned skinned meshes are the main perf cost; start with ~3–6 bots, cap it.
- Death is "freeze + fall/dissolve", not full ragdoll (no ragdoll system exists);
  can upgrade later.
- Enemy aim is hitscan with error (matches player's hitscan model) — no
  projectile travel time. Consistent with current weapons.
```
```
