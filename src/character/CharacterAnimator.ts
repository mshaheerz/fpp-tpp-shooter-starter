import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Object3D,
  LoopOnce,
  LoopRepeat,
  NormalAnimationBlendMode,
} from 'three'

export type LocomotionState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'strafeL'
  | 'strafeR'
  | 'back'
  | 'jump'

/** Seconds for a full weight change (1↔0). */
const BLEND_TIME = 0.18
/** Faster fade for firing/reload entry so the body responds promptly. */
const OVERLAY_IN_TIME = 0.08
const OVERLAY_OUT_TIME = 0.18

/**
 * Drives a SkinnedMesh's `AnimationMixer` using **manual weight interpolation**
 * instead of Three.js's built-in `crossFadeTo` / `fadeIn` helpers.
 *
 * Why manual: Three.js's `_scheduleFading` hardcodes the fade endpoints to 0
 * and 1, so a fade started while a previous fade is mid-flight snaps the action
 * weight back to its starting endpoint. Rapidly changing locomotion (idle → walk
 * → run) under that scheme makes the skeleton briefly explode. Manual lerp
 * starts each new fade from the action's *current* weight, so transitions stay
 * smooth no matter how often state changes.
 *
 * - Every locomotion action `.play()`s once at bind time at weight 0. They run
 *   silently in the background; `setLocomotion(state)` just changes which one
 *   has a target weight of 1.
 * - Overlays (firing / reload) are full-body Normal-blend clips that take over
 *   completely while active: locomotion weights are forced to 0, overlay to 1.
 *   When the overlay's clip finishes, locomotion weights snap back in.
 */
export class CharacterAnimator {
  readonly mixer: AnimationMixer
  private clips = new Map<string, AnimationClip>()
  private locoActions = new Map<LocomotionState, AnimationAction>()
  private currentLoco: LocomotionState | null = null
  private overlays = new Map<string, AnimationAction>()
  private activeOverlay: AnimationAction | null = null
  /** action → target weight (0..1). Each frame, action.weight eases toward this. */
  private targetWeights = new Map<AnimationAction, number>()
  private finishHandler: ((e: { action: AnimationAction }) => void) | null = null

  constructor(root: Object3D) {
    this.mixer = new AnimationMixer(root)
  }

  addClip(name: string, clip: AnimationClip) {
    this.clips.set(name, clip)
  }

  hasClip(name: string): boolean {
    return this.clips.has(name)
  }

  private makeAction(name: string): AnimationAction | null {
    const clip = this.clips.get(name)
    if (!clip) return null
    const action = this.mixer.clipAction(clip)
    action.blendMode = NormalAnimationBlendMode
    return action
  }

  bindLocomotion(map: Partial<Record<LocomotionState, string>>) {
    for (const [state, clipName] of Object.entries(map) as Array<[LocomotionState, string]>) {
      const action = this.makeAction(clipName)
      if (!action) continue
      action.setLoop(LoopRepeat, Infinity)
      action.enabled = true
      action.setEffectiveTimeScale(1)
      action.weight = 0
      action.play()
      this.locoActions.set(state, action)
      this.targetWeights.set(action, 0)
    }
  }

  /**
   * Pick a locomotion state. Doesn't reset the action's time (locomotion clips
   * keep cycling in the background) so transitions are phase-continuous.
   */
  setLocomotion(state: LocomotionState) {
    const firstCall = this.currentLoco === null
    if (this.currentLoco === state) return
    const next = this.locoActions.get(state)
    if (!next) return
    this.currentLoco = state

    // While an overlay owns the body, just record the desired loco target;
    // the overlay-finished handler will read currentLoco and restore weights.
    if (this.activeOverlay) return

    for (const [s, action] of this.locoActions) {
      const target = s === state ? 1 : 0
      this.targetWeights.set(action, target)
      // On the very first setLocomotion call, snap to avoid a 180ms ramp from
      // bind pose to idle (which would briefly look like a T-pose).
      if (firstCall) action.weight = target
    }
  }

  /**
   * Start a full-body overlay (firing_rifle, reload_rifle). Locomotion fades
   * out while the overlay owns the body.
   *
   * @param loop  - true for held-fire (LMB down); the clip loops until stopOverlay() is called.
   *                false for one-shot (reload); the clip plays once then auto-restores locomotion.
   *
   * If the same overlay is already active, this is a no-op (won't restart it).
   * Use `stopOverlay()` and a fresh `playOverlay()` to force a restart.
   */
  playOverlay(name: string, loop = false): AnimationAction | null {
    let action = this.overlays.get(name)
    if (!action) {
      const made = this.makeAction(name)
      if (!made) return null
      made.clampWhenFinished = false
      made.enabled = true
      made.weight = 0
      this.overlays.set(name, made)
      action = made
    }

    // If already active and same loop mode, leave it running.
    if (this.activeOverlay === action) {
      action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1)
      return action
    }

    action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1)
    action.reset()
    action.enabled = true
    action.setEffectiveTimeScale(1)
    action.weight = 0
    action.play()

    for (const loco of this.locoActions.values()) this.targetWeights.set(loco, 0)
    this.targetWeights.set(action, 1)
    this.activeOverlay = action

    if (this.finishHandler) {
      this.mixer.removeEventListener('finished', this.finishHandler as (e: any) => void)
    }
    if (loop) {
      // Looping overlays don't auto-restore; the caller must call stopOverlay().
      this.finishHandler = null
      return action
    }
    const handler = (e: { action: AnimationAction }) => {
      if (e.action !== action) return
      this.mixer.removeEventListener('finished', handler as (e: any) => void)
      this.finishHandler = null
      this.targetWeights.set(action!, 0)
      this.activeOverlay = null
      const cur = this.currentLoco
      if (cur) {
        for (const [s, a] of this.locoActions) {
          this.targetWeights.set(a, s === cur ? 1 : 0)
        }
      }
    }
    this.finishHandler = handler
    this.mixer.addEventListener('finished', handler as (e: any) => void)

    return action
  }

  /** Stop a currently-playing overlay (typically the looping fire). Fades back to locomotion. */
  stopOverlay(name: string) {
    const action = this.overlays.get(name)
    if (!action || this.activeOverlay !== action) return
    if (this.finishHandler) {
      this.mixer.removeEventListener('finished', this.finishHandler as (e: any) => void)
      this.finishHandler = null
    }
    this.targetWeights.set(action, 0)
    this.activeOverlay = null
    const cur = this.currentLoco
    if (cur) {
      for (const [s, a] of this.locoActions) {
        this.targetWeights.set(a, s === cur ? 1 : 0)
      }
    }
  }

  /** Force-cancel any active overlay immediately (no fade). */
  cancelOverlay() {
    if (!this.activeOverlay) return
    if (this.finishHandler) {
      this.mixer.removeEventListener('finished', this.finishHandler as (e: any) => void)
      this.finishHandler = null
    }
    this.targetWeights.set(this.activeOverlay, 0)
    this.activeOverlay = null
    const cur = this.currentLoco
    if (cur) {
      for (const [s, a] of this.locoActions) {
        this.targetWeights.set(a, s === cur ? 1 : 0)
      }
    }
  }

  update(dt: number) {
    // Ease each action's weight toward its target.
    const inRate = 1 / OVERLAY_IN_TIME
    const outRate = 1 / OVERLAY_OUT_TIME
    const locoRate = 1 / BLEND_TIME
    for (const [action, target] of this.targetWeights) {
      const cur = action.weight
      if (cur === target) continue
      const delta = target - cur
      const isOverlay = this.overlays.has(this.findOverlayKey(action) ?? '')
      const rate = isOverlay ? (delta > 0 ? inRate : outRate) : locoRate
      const step = Math.sign(delta) * Math.min(Math.abs(delta), rate * dt)
      action.weight = cur + step
    }
    this.mixer.update(dt)
  }

  /** Reverse lookup: action → overlay name (or null). Used to pick fade rate. */
  private findOverlayKey(action: AnimationAction): string | null {
    for (const [name, a] of this.overlays) if (a === action) return name
    return null
  }
}
