import { Vector3, type Mesh } from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { InputManager } from '../InputManager'
import type { PhysicsSystem } from '../PhysicsSystem'
import {
  CAPSULE_HALF_HEIGHT,
  CAPSULE_RADIUS,
  LEDGE_CHEST_OFFSET,
  LEDGE_CLIMB_DURATION_DEFAULT,
  LEDGE_FORWARD_REACH,
  LEDGE_HAND_TO_HIPS,
  LEDGE_REGRAB_COOLDOWN,
  LEDGE_SHIMMY_OBSTACLE_REACH,
  LEDGE_SHIMMY_SPEED,
  LEDGE_STAND_CLEARANCE,
  LEDGE_TOP_MAX_RELATIVE,
  LEDGE_TOP_MIN_RELATIVE,
  LEDGE_TOP_PROBE_ABOVE,
  LEDGE_TOP_PROBE_DEPTH,
  LEDGE_WALL_GAP,
  LEDGE_WALL_NORMAL_MAX_Y,
} from './movementConstants'

export type PlayerMode = 'normal' | 'hanging' | 'climbing'

export interface PlayerLedgeCtx {
  body: RAPIER.RigidBody
  physics: PhysicsSystem
  position: Vector3
  velocity: Vector3
  debugMesh: Mesh
  grounded: boolean
  mode: PlayerMode
  ledgeWallNormal: Vector3
  ledgeAnchor: Vector3
  ledgeYaw: number
  ledgeShimmyDir: -1 | 0 | 1
  ledgeJustGrabbed: boolean
  climbJustStarted: boolean
  climbTimer: number
  climbDuration: number
  climbTargetPos: Vector3
  regrabCooldown: number
  currentHalfHeight: number
}

export function updateClimbing(ctx: PlayerLedgeCtx, dt: number): boolean {
  if (ctx.mode !== 'climbing') return false

  ctx.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ctx.climbTimer += dt
  const t = ctx.body.translation()
  ctx.position.set(t.x, t.y, t.z)
  ctx.velocity.set(0, 0, 0)
  ctx.grounded = false
  ctx.debugMesh.position.set(t.x, t.y, t.z)

  if (ctx.climbTimer >= Math.max(0.1, ctx.climbDuration - 0.08)) {
    ctx.body.setTranslation(
      { x: ctx.climbTargetPos.x, y: ctx.climbTargetPos.y, z: ctx.climbTargetPos.z },
      true,
    )
    ctx.body.setGravityScale(1, true)
    ctx.mode = 'normal'
    ctx.regrabCooldown = LEDGE_REGRAB_COOLDOWN
  }

  return true
}

export function updateHanging(ctx: PlayerLedgeCtx, input: InputManager, dt: number): boolean {
  if (ctx.mode !== 'hanging') return false

  const t = ctx.body.translation()
  ctx.position.set(t.x, t.y, t.z)
  ctx.velocity.set(0, 0, 0)
  ctx.grounded = false

  if (input.isDown('KeyS') || input.isDown('ControlLeft') || input.isDown('ControlRight')) {
    ctx.body.setGravityScale(1, true)
    ctx.body.setLinvel({ x: 0, y: -0.5, z: 0 }, true)
    ctx.mode = 'normal'
    ctx.regrabCooldown = LEDGE_REGRAB_COOLDOWN
    ctx.debugMesh.position.set(t.x, t.y, t.z)
    return true
  }

  if (input.wasPressed('Space')) {
    const fwdX = -ctx.ledgeWallNormal.x
    const fwdZ = -ctx.ledgeWallNormal.z
    const tgtX = ctx.ledgeAnchor.x + fwdX * (CAPSULE_RADIUS + 0.15)
    const tgtY = ctx.ledgeAnchor.y + CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + 0.02
    const tgtZ = ctx.ledgeAnchor.z + fwdZ * (CAPSULE_RADIUS + 0.15)
    const blockedAbove = ctx.physics.raycast(
      { x: tgtX, y: ctx.ledgeAnchor.y + 0.05, z: tgtZ },
      { x: 0, y: 1, z: 0 },
      LEDGE_STAND_CLEARANCE,
      ctx.body,
    )
    if (blockedAbove) return true

    ctx.climbTargetPos.set(tgtX, tgtY, tgtZ)
    ctx.climbTimer = 0
    ctx.mode = 'climbing'
    ctx.climbJustStarted = true
    ctx.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ctx.debugMesh.position.set(t.x, t.y, t.z)
    return true
  }

  let shimmy = 0
  if (input.isDown('KeyA')) shimmy += 1
  if (input.isDown('KeyD')) shimmy -= 1
  if (shimmy !== 0) {
    const tanX = -ctx.ledgeWallNormal.z
    const tanZ = ctx.ledgeWallNormal.x
    const sx = tanX * shimmy
    const sz = tanZ * shimmy
    const chestObstacle = ctx.physics.raycast(
      { x: t.x, y: t.y + LEDGE_CHEST_OFFSET, z: t.z },
      { x: sx, y: 0, z: sz },
      LEDGE_SHIMMY_OBSTACLE_REACH,
      ctx.body,
    )
    const handObstacle = ctx.physics.raycast(
      { x: t.x, y: ctx.ledgeAnchor.y - 0.05, z: t.z },
      { x: sx, y: 0, z: sz },
      LEDGE_SHIMMY_OBSTACLE_REACH,
      ctx.body,
    )
    if (!chestObstacle && !handObstacle) {
      const step = shimmy * LEDGE_SHIMMY_SPEED * dt
      const nx = t.x + tanX * step
      const nz = t.z + tanZ * step
      const wallHit = ctx.physics.raycast(
        { x: nx, y: t.y + LEDGE_CHEST_OFFSET, z: nz },
        { x: -ctx.ledgeWallNormal.x, y: 0, z: -ctx.ledgeWallNormal.z },
        LEDGE_FORWARD_REACH + 0.1,
        ctx.body,
      )
      if (wallHit) {
        ctx.body.setTranslation({ x: nx, y: t.y, z: nz }, true)
        ctx.ledgeShimmyDir = shimmy as -1 | 1
      }
    }
  }

  ctx.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  const tt = ctx.body.translation()
  ctx.position.set(tt.x, tt.y, tt.z)
  ctx.debugMesh.position.set(tt.x, tt.y, tt.z)
  return true
}

export function tryGrabLedge(
  ctx: PlayerLedgeCtx,
  t: { x: number; y: number; z: number },
  wishDir: Vector3,
) {
  let fx = wishDir.x
  let fz = wishDir.z
  let len = Math.hypot(fx, fz)
  if (len < 0.01) {
    fx = ctx.velocity.x
    fz = ctx.velocity.z
    len = Math.hypot(fx, fz)
    if (len < 0.5) return
  }
  fx /= len
  fz /= len

  const chestY = t.y + LEDGE_CHEST_OFFSET
  const wallHit = ctx.physics.raycast(
    { x: t.x, y: chestY, z: t.z },
    { x: fx, y: 0, z: fz },
    LEDGE_FORWARD_REACH,
    ctx.body,
  )
  if (!wallHit) return
  if (Math.abs(wallHit.normal.y) > LEDGE_WALL_NORMAL_MAX_Y) return

  const probeX = wallHit.point.x + fx * 0.05
  const probeZ = wallHit.point.z + fz * 0.05
  const probeStartY = chestY + LEDGE_TOP_PROBE_ABOVE
  const downHit = ctx.physics.raycast(
    { x: probeX, y: probeStartY, z: probeZ },
    { x: 0, y: -1, z: 0 },
    LEDGE_TOP_PROBE_DEPTH,
    ctx.body,
  )
  if (!downHit) return
  if (downHit.normal.y < 0.7) return

  const topY = downHit.point.y
  const relY = topY - t.y
  if (relY < LEDGE_TOP_MIN_RELATIVE || relY > LEDGE_TOP_MAX_RELATIVE) return

  const clearanceHit = ctx.physics.raycast(
    { x: probeX, y: topY + 0.05, z: probeZ },
    { x: 0, y: 1, z: 0 },
    LEDGE_STAND_CLEARANCE,
    ctx.body,
  )
  if (clearanceHit) return

  const wnX = wallHit.normal.x
  const wnZ = wallHit.normal.z
  const wnLen = Math.hypot(wnX, wnZ) || 1
  ctx.ledgeWallNormal.set(wnX / wnLen, 0, wnZ / wnLen)
  ctx.ledgeAnchor.set(probeX, topY, probeZ)

  const snapX = wallHit.point.x + ctx.ledgeWallNormal.x * LEDGE_WALL_GAP
  const snapZ = wallHit.point.z + ctx.ledgeWallNormal.z * LEDGE_WALL_GAP
  const snapY = topY - LEDGE_HAND_TO_HIPS
  ctx.body.setTranslation({ x: snapX, y: snapY, z: snapZ }, true)
  ctx.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ctx.body.setGravityScale(0, true)

  ctx.ledgeYaw = Math.atan2(-ctx.ledgeWallNormal.x, -ctx.ledgeWallNormal.z)
  ctx.mode = 'hanging'
  ctx.ledgeJustGrabbed = true
  ctx.position.set(snapX, snapY, snapZ)
  ctx.velocity.set(0, 0, 0)
  ctx.grounded = false
  ctx.debugMesh.position.set(snapX, snapY, snapZ)
}

export const DEFAULT_CLIMB_DURATION = LEDGE_CLIMB_DURATION_DEFAULT
