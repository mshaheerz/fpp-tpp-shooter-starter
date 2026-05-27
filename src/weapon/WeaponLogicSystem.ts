import RAPIER from '@dimforge/rapier3d-compat'
import { WEAPONS, type WeaponId, type WeaponStats } from './WeaponData'
import type { WeaponRenderer } from './WeaponRenderer'
import type { WeaponShooter } from './WeaponShooter'
import type { InputManager } from '../InputManager'
import type { CameraRig } from '../Camera'
import type { FPSMesh } from '../animation/FPSMesh'
import type { ThirdPersonCharacter } from '../character/ThirdPersonCharacter'

type State = 'Idle' | 'Firing' | 'Reloading' | 'Switching'

interface Ammo {
  mag: number
  reserve: number
}

/**
 * Per-weapon FSM driving the rate-of-fire, reload, and switch timers. Sits
 * between input and the renderer/shooter; on `fire()` it asks `WeaponShooter`
 * for the raycast and asks `FPSMesh` + `ThirdPersonCharacter.animator` to
 * play the firing animation, so both views stay in sync.
 */
export class WeaponLogicSystem {
  state: State = 'Idle'
  current: WeaponId = 'ak47'
  ammo: Record<WeaponId, Ammo>
  private timeSinceShot = 1e9
  private timer = 0
  /** True while the firing-overlay animation is looping (LMB held). */
  private firingAnimActive = false
  /** True while the aim-overlay animation is looping (RMB held). */
  private aimAnimActive = false

  constructor(
    private input: InputManager,
    private camera: CameraRig,
    private weapons: WeaponRenderer,
    private shooter: WeaponShooter,
    private fpsMesh: FPSMesh,
    private character: ThirdPersonCharacter,
    private playerBody: RAPIER.RigidBody,
    private onEquip: (id: WeaponId) => Promise<void>,
  ) {
    this.ammo = {
      ak47: { mag: WEAPONS.ak47.magSize, reserve: WEAPONS.ak47.reserve },
      pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve },
      knife: { mag: 0, reserve: 0 },
    }
  }

  get stats(): WeaponStats {
    return WEAPONS[this.current]
  }

  requestSwitch(id: WeaponId) {
    if (id === this.current && this.state !== 'Switching') return
    this.state = 'Switching'
    this.timer = this.stats.switchTime
    // Equip immediately; timer just blocks firing.
    void this.onEquip(id).then(() => {
      this.current = id
    })
  }

  requestReload() {
    if (this.state !== 'Idle') return
    const s = this.stats
    const a = this.ammo[this.current]
    if (a.mag >= s.magSize || a.reserve <= 0 || s.magSize === 0) return
    this.state = 'Reloading'
    this.timer = s.reloadTime
    this.character.animator.playOverlay('reload_rifle')
  }

  update(dt: number) {
    this.timeSinceShot += dt

    if (this.state === 'Switching') {
      this.timer -= dt
      if (this.timer <= 0) this.state = 'Idle'
    } else if (this.state === 'Reloading') {
      this.timer -= dt
      if (this.timer <= 0) {
        const a = this.ammo[this.current]
        const s = this.stats
        const need = s.magSize - a.mag
        const take = Math.min(need, a.reserve)
        a.mag += take
        a.reserve -= take
        this.state = 'Idle'
      }
    }

    if (this.input.wasPressed('KeyR')) this.requestReload()

    const isMelee = this.current === 'knife'

    // ADS state mirrors RMB — disabled for melee (the knife has nothing to aim).
    const wantAds = !isMelee && this.input.rmb && this.state !== 'Reloading' && this.state !== 'Switching'
    this.camera.ads = wantAds

    // Drive the aim animation. Firing takes priority — when LMB is held the
    // firing overlay is active and we let it own the body; aim resumes after.
    const shouldAimAnim = wantAds && !this.input.lmb && this.state === 'Idle'
    if (shouldAimAnim && !this.aimAnimActive) {
      this.character.animator.playOverlay('aim_idle', true)
      this.aimAnimActive = true
    } else if (!shouldAimAnim && this.aimAnimActive) {
      this.character.animator.stopOverlay('aim_idle')
      this.aimAnimActive = false
    }

    if (this.state === 'Idle' && this.input.lmb) {
      const s = this.stats
      const interval = 60 / s.rpm
      if (this.timeSinceShot >= interval) {
        if (isMelee) {
          // Knife: play stab once, no raycast / no bullet. The clip itself is
          // the gameplay beat. Mixamo's "Stabbing" is captured at a slow
          // demonstration pace — speed it up so it reads as a quick combat
          // stab rather than a stage rehearsal.
          if (this.character.animator.hasClip('knife_stab')) {
            this.character.animator.playOverlay('knife_stab', false, 1.8)
          }
          this.timeSinceShot = 0
        } else if (s.magSize > 0 && this.ammo[this.current].mag <= 0) {
          // Out of mag — auto-reload.
          this.requestReload()
        } else {
          this.fireOnce()
          this.timeSinceShot = 0
        }
      }
      // Keep the firing animation looping while LMB is held (don't restart per bullet).
      // Suppressed for melee — the stab is a one-shot overlay above.
      if (!isMelee && !this.firingAnimActive && s.magSize > 0 && this.ammo[this.current].mag > 0) {
        this.character.animator.playOverlay('firing_rifle', true)
        this.firingAnimActive = true
      }
    } else if (this.firingAnimActive) {
      this.character.animator.stopOverlay('firing_rifle')
      this.firingAnimActive = false
    }
  }

  private fireOnce() {
    const s = this.stats
    if (s.magSize > 0) this.ammo[this.current].mag--

    // Recoil + shake reduced while aiming (cleaner tracking).
    const adsFactor = this.camera.adsFactor
    const recoilMul = 1 - adsFactor * 0.6
    const shakeMul = 1 - adsFactor * 0.5

    // Visuals + sounds.
    this.fpsMesh.addRecoil(0.04 * recoilMul, 0.02 * recoilMul)
    this.shooter.fire(this.camera, s, this.playerBody, (amount) => this.camera.shake(amount * shakeMul))

    // Recoil pitch/yaw kicks (small, additive; reduced while aiming).
    this.camera.pitch += s.recoil.pitch * recoilMul
    this.camera.yaw += (Math.random() - 0.5) * s.recoil.yaw * 2 * recoilMul

    // Note: firing animation is started/stopped in update() based on LMB hold;
    // we deliberately do NOT restart it here per shot or the arm-raise snaps.
  }
}
