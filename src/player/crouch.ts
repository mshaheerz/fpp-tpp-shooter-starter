import type RAPIER from '@dimforge/rapier3d-compat'
import type { InputManager } from '../InputManager'
import type { PhysicsSystem } from '../PhysicsSystem'
import { CROUCH_HALF_HEIGHT_SCALE, CROUCH_TRANSITION_SPEED } from './movementConstants'

export interface PlayerCrouchCtx {
  body: RAPIER.RigidBody
  physics: PhysicsSystem
  standingHalfHeight: number
  radius: number
  currentHalfHeight: number
  crouching: boolean
  crouchT: number
  applyCapsuleSize(): void
}

export function updateCrouch(
  ctx: PlayerCrouchCtx,
  input: InputManager,
  t: { x: number; y: number; z: number },
  dt: number,
) {
  const wantsCrouch = input.isDown('ControlLeft') || input.isDown('ControlRight') || input.isDown('KeyC')

  if (wantsCrouch) {
    ctx.crouching = true
  } else if (ctx.crouching) {
    const standHalf = ctx.standingHalfHeight + ctx.radius
    const headroom = ctx.physics.raycast(
      { x: t.x, y: t.y + ctx.currentHalfHeight + ctx.radius * 0.5, z: t.z },
      { x: 0, y: 1, z: 0 },
      (standHalf - ctx.currentHalfHeight - ctx.radius * 0.5) + 0.05,
      ctx.body,
    )
    if (!headroom) ctx.crouching = false
  }

  const target = ctx.crouching ? 1 : 0
  const prevT = ctx.crouchT
  ctx.crouchT += (target - ctx.crouchT) * Math.min(1, CROUCH_TRANSITION_SPEED * dt)
  if (Math.abs(ctx.crouchT - target) < 0.001) ctx.crouchT = target

  const crouchedHalf = ctx.standingHalfHeight * CROUCH_HALF_HEIGHT_SCALE
  const newHalf = ctx.standingHalfHeight + (crouchedHalf - ctx.standingHalfHeight) * ctx.crouchT

  if (Math.abs(newHalf - ctx.currentHalfHeight) > 1e-4 || prevT !== ctx.crouchT) {
    const delta = ctx.currentHalfHeight - newHalf
    ctx.currentHalfHeight = newHalf
    ctx.applyCapsuleSize()
    if (delta !== 0) {
      const nt = ctx.body.translation()
      ctx.body.setTranslation({ x: nt.x, y: nt.y - delta, z: nt.z }, true)
    }
  }
}
