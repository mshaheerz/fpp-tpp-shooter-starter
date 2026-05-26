import type { AnimationAction } from 'three'

export type MarkerEvent = 'flash' | 'eject' | 'reloadInsert' | 'switchReady'

export interface AnimMarker {
  time: number
  event: MarkerEvent
}

/**
 * Lightweight marker watcher. You hand it an array of `{time, event}` markers
 * and an `AnimationAction`; each `update(dt)` checks the action's current time
 * and fires `onEvent` for any markers crossed since the last call.
 *
 * Used by both FPSMesh (the FPP weapon anim) and CharacterAnimator overlays so
 * that muzzle-flash / shell-eject / reload-insert events fire identically in
 * both views.
 */
export class MarkerWatcher {
  private lastTime = 0
  private active = false

  constructor(
    private action: AnimationAction,
    private markers: AnimMarker[],
    private onEvent: (e: MarkerEvent) => void,
  ) {}

  reset() {
    this.lastTime = 0
    this.active = true
  }

  stop() {
    this.active = false
  }

  update() {
    if (!this.active) return
    const t = this.action.time
    if (t < this.lastTime) {
      // Looped — fire any markers between lastTime..clipDuration and 0..t.
      const dur = this.action.getClip().duration
      for (const m of this.markers) {
        if (m.time >= this.lastTime && m.time <= dur) this.onEvent(m.event)
        else if (m.time <= t) this.onEvent(m.event)
      }
    } else {
      for (const m of this.markers) {
        if (m.time > this.lastTime && m.time <= t) this.onEvent(m.event)
      }
    }
    this.lastTime = t
  }
}
