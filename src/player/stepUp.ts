import { Vector3 } from 'three'
import type { Player } from '../Player'
import { STEP_FORWARD_MARGIN, STEP_MAX_HEIGHT } from './movementConstants'

const _ahead = new Vector3()

/**
 * Manual stair / step-up assist for the velocity-driven dynamic capsule.
 *
 * Rapier's `KinematicCharacterController` has built-in autostep, but this player
 * is a dynamic body we drive with `setLinvel`, so a vertical stair riser just
 * stops the capsule's horizontal velocity and the player jams. Each grounded
 * frame we:
 *   1. Cast a short ray forward at shin height along the move direction. A hit
 *      with a near-vertical normal means a riser/wall is blocking us.
 *   2. Cast straight down from a point above-and-just-past that riser to find
 *      the surface on top of the step.
 *   3. If the rise is walkable (≤ STEP_MAX_HEIGHT) and there's headroom for the
 *      full standing capsule, snap the body up onto the step.
 *
 * Returns the vertical rise (metres) if the capsule was lifted this frame, else
 * 0. The caller uses the rise to drive visual smoothing so the snap isn't seen.
 *
 * Call AFTER velocity is committed, only while grounded and actually moving into
 * something. Cheap: at most 2 raycasts, and only when horizontal input exists.
 */
export function tryStepUp(player: Player, dt: number): number {
  if (!player.grounded || player.mode !== 'normal') return 0

  const move = player.moveDir
  const moveLen = Math.hypot(move.x, move.z)
  if (moveLen < 0.01) return 0

  // Don't fight an active climb / fast vertical motion.
  if (Math.abs(player.velocity.y) > 1.5) return 0

  const dirX = move.x / moveLen
  const dirZ = move.z / moveLen

  const t = player.body.translation()
  const radius = player.radius
  const halfHeight = player.currentHalfHeight
  const feetY = t.y - halfHeight - radius
  const probeReach = radius + STEP_FORWARD_MARGIN

  // 1) Forward ray at shin height — is something blocking us?
  const shinY = feetY + Math.min(0.12, STEP_MAX_HEIGHT * 0.4)
  const wall = player.physics.raycast(
    { x: t.x, y: shinY, z: t.z },
    { x: dirX, y: 0, z: dirZ },
    probeReach,
    player.body,
  )
  // No obstacle, or it's a shallow ramp (walkable normal) → let normal movement handle it.
  if (!wall || Math.abs(wall.normal.y) > 0.5) return 0

  // 2) Probe down from just above max step height, just past the riser, to find
  //    the top surface of the step.
  _ahead.set(t.x + dirX * probeReach, 0, t.z + dirZ * probeReach)
  const probeTopY = feetY + STEP_MAX_HEIGHT + 0.05
  const top = player.physics.raycast(
    { x: _ahead.x, y: probeTopY, z: _ahead.z },
    { x: 0, y: -1, z: 0 },
    STEP_MAX_HEIGHT + 0.1,
    player.body,
  )
  // Need a near-flat surface to stand on.
  if (!top || top.normal.y < 0.6) return 0

  const rise = top.point.y - feetY
  if (rise <= 0.02 || rise > STEP_MAX_HEIGHT) return 0

  // 3) Headroom check: the full standing capsule must fit above the step top so
  //    we don't shove the player into a low ceiling / soffit.
  const newCenterY = top.point.y + radius + halfHeight + 0.02
  const headClearance = player.standingHalfHeight + radius
  const head = player.physics.raycast(
    { x: t.x, y: top.point.y + 0.05, z: t.z },
    { x: 0, y: 1, z: 0 },
    headClearance,
    player.body,
  )
  if (head) return 0

  // Snap the capsule up onto the step. Move a touch forward too so we clear the
  // riser lip and don't immediately re-collide with it next frame.
  const forwardNudge = Math.min(radius * 0.5, moveLen * dt * 0.5 + 0.02)
  player.body.setTranslation(
    { x: t.x + dirX * forwardNudge, y: newCenterY, z: t.z + dirZ * forwardNudge },
    true,
  )
  // Kill any downward velocity from the lift so we don't bounce.
  if (player.velocity.y < 0) {
    player.velocity.y = 0
    const v = player.body.linvel()
    player.body.setLinvel({ x: v.x, y: 0, z: v.z }, true)
  }
  // The body jumped up by `rise`; the caller banks this as visual lag so the
  // eye/character glide up instead of popping. (`player.position` is recomputed
  // from the body translation + that lag back in Player.update.)
  return newCenterY - t.y
}
