import type { CharacterAnimator } from './CharacterAnimator'

type HasClip = (name: string) => boolean

function buildRifleLocomotionBindings(has: HasClip) {
  return {
    idle: 'idle',
    walk: 'walk_forward',
    run: 'run_forward',
    strafeL: 'strafe_left',
    strafeR: 'strafe_right',
    back: 'walk_backward',
    runBack: has('run_backward') ? 'run_backward' : 'walk_backward',
    jump: has('rifle_jump_in_place') ? 'rifle_jump_in_place' : 'jump',
    fall: has('jump_2') ? 'jump_2' : (has('falling_to_landing') ? 'falling_to_landing' : 'jump'),
    land: has('rifle_jump_in_place') ? 'rifle_jump_in_place' : 'jump',
    // Crouch locomotion — falls back to standing clips when the crouch pack
    // isn't present, so the character still moves naturally without them.
    crouchIdle: has('crouch_idle') ? 'crouch_idle' : 'idle',
    crouchWalk: has('crouch_walk_forward') ? 'crouch_walk_forward' : 'walk_forward',
    crouchStrafeL: has('crouch_strafe_left') ? 'crouch_strafe_left' : 'strafe_left',
    crouchStrafeR: has('crouch_strafe_right') ? 'crouch_strafe_right' : 'strafe_right',
  }
}

export function bindRifleLocomotion(animator: CharacterAnimator) {
  const has = (name: string) => animator.hasClip(name)
  if (has('jump_air')) animator.bindAirAdditive('jump_air')
  animator.bindLocomotion(buildRifleLocomotionBindings(has))
}

export function bindRifleLocomotionWithExtras(
  animator: CharacterAnimator,
  extras: Record<string, string>,
) {
  const has = (name: string) => animator.hasClip(name)
  if (has('jump_air')) animator.bindAirAdditive('jump_air')
  animator.bindLocomotion({
    ...buildRifleLocomotionBindings(has),
    ...extras,
  })
}
