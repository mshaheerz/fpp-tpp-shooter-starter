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
    jump: 'jump',
    fall: has('falling_to_landing') ? 'falling_to_landing' : 'jump',
    land: 'jump',
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
