import { PerspectiveCamera, Vector3, MathUtils, Object3D, Euler } from 'three'
import type { InputManager } from './InputManager'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { PhysicsSystem } from './PhysicsSystem'

export type CameraMode = 'FPP' | 'TPP'

const PITCH_LIMIT = Math.PI / 2 - 0.01
const MOUSE_SENSITIVITY = 0.0022

const FOV_HIP = 75
const FOV_ADS = 55
const ADS_LERP = 10 // 1/s — how fast FOV reaches the target (higher = snappier)
const ADS_SENS_MULTIPLIER = 0.5

/**
 * Holds the yaw/pitch state and produces a camera position+orientation each
 * frame for both FPP (eye-level) and TPP (over-the-shoulder).
 *
 *   - `getCrosshairRay()` always returns the camera-forward ray. Gameplay-relevant
 *     shooting is identical in both views.
 *   - `toggleMode()` flips the mode and fires `onModeChange` so visibility (FPP
 *     arms vs TPP character) and weapon reparenting can react.
 */
export class CameraRig {
  readonly three: PerspectiveCamera
  mode: CameraMode = 'FPP'
  yaw = 0
  pitch = 0

  /** Eye offset above the capsule center (for FPP eye position / TPP anchor). */
  readonly eyeOffset = new Vector3(0, 0.65, 0)
  /** Shoulder offset added to the eye in TPP (right + slightly up). */
  readonly shoulderOffset = new Vector3(0.45, 0.15, 0)
  /** Distance behind the shoulder in TPP. */
  tppDistance = 2.6
  /** Sphere radius used by the camera back-off shapecast. */
  private tppShapecastRadius = 0.18

  private shakeAmount = 0
  private shakeDecay = 6

  /** True while RMB is held — drives FOV zoom, sensitivity, spread, movement, anim. */
  ads = false
  /** Smoothly-interpolated 0..1 ADS factor (matches actual FOV). 1 = fully zoomed. */
  adsFactor = 0

  onModeChange?: (mode: CameraMode) => void

  constructor() {
    this.three = new PerspectiveCamera(FOV_HIP, window.innerWidth / window.innerHeight, 0.02, 500)
  }

  toggleMode() {
    this.mode = this.mode === 'FPP' ? 'TPP' : 'FPP'
    this.onModeChange?.(this.mode)
  }

  shake(amount: number) {
    this.shakeAmount = Math.min(0.5, this.shakeAmount + amount)
  }

  /**
   * Update yaw/pitch from mouse, then place the camera.
   *
   * @param playerPos capsule center
   * @param playerYawOut if provided, gets the camera yaw written into it so the
   *                     player movement basis matches camera orientation
   */
  update(
    input: InputManager,
    playerPos: Vector3,
    dt: number,
    physics: PhysicsSystem,
    playerBody?: RAPIER.RigidBody,
    eyeAnchor?: Vector3,
  ) {
    // Ease ADS factor toward target each frame, then derive FOV + sensitivity.
    const adsTarget = this.ads ? 1 : 0
    this.adsFactor += (adsTarget - this.adsFactor) * Math.min(1, ADS_LERP * dt)
    this.three.fov = MathUtils.lerp(FOV_HIP, FOV_ADS, this.adsFactor)
    this.three.updateProjectionMatrix()
    const sensMul = MathUtils.lerp(1, ADS_SENS_MULTIPLIER, this.adsFactor)

    const md = input.readMouseDelta()
    this.yaw -= md.x * MOUSE_SENSITIVITY * sensMul
    this.pitch -= md.y * MOUSE_SENSITIVITY * sensMul
    this.pitch = MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT)

    // Shake decays exponentially.
    this.shakeAmount = Math.max(0, this.shakeAmount - this.shakeDecay * this.shakeAmount * dt)
    const shakeX = (Math.random() - 0.5) * this.shakeAmount
    const shakeY = (Math.random() - 0.5) * this.shakeAmount

    // FPP: prefer the character's head-bone world position if provided. Falls
    // back to a fixed offset above the capsule for the placeholder case.
    const eye = _v
    if (eyeAnchor) eye.copy(eyeAnchor)
    else eye.copy(playerPos).add(this.eyeOffset)

    if (this.mode === 'FPP') {
      this.three.position.copy(eye)
      this.three.rotation.order = 'YXZ'
      this.three.rotation.set(this.pitch + shakeY, this.yaw + shakeX, 0)
      return
    }
    // For TPP keep the eye derived from capsule + offset (shoulder anchor reads
    // a stable position, not a head bone that's bobbing with the walk anim).
    eye.copy(playerPos).add(this.eyeOffset)

    // TPP: anchor at shoulder, push camera back along -forward, shapecast to avoid walls.
    const forward = _forward.set(0, 0, -1).applyEuler(_e.set(this.pitch, this.yaw, 0, 'YXZ'))
    const right = _right.copy(forward).cross(_up.set(0, 1, 0)).normalize()
    const anchor = _anchor.copy(eye)
      .addScaledVector(right, this.shoulderOffset.x)
      .addScaledVector(_up.set(0, 1, 0), this.shoulderOffset.y)

    // Cast from anchor backwards.
    const backDir = _back.copy(forward).multiplyScalar(-1)
    const toi = physics.spherecast(
      anchor,
      backDir,
      this.tppShapecastRadius,
      this.tppDistance,
      playerBody,
    )
    const dist = Math.max(0.4, toi - 0.05)

    this.three.position.copy(anchor).addScaledVector(backDir, dist)
    this.three.rotation.order = 'YXZ'
    this.three.rotation.set(this.pitch + shakeY, this.yaw + shakeX, 0)
  }

  /** Camera-forward unit vector, identical across modes. */
  getForward(out = new Vector3()): Vector3 {
    return out.set(0, 0, -1).applyEuler(_e.set(this.pitch, this.yaw, 0, 'YXZ'))
  }

  /** Origin + direction of the gameplay raycast. Always camera-forward from camera position. */
  getCrosshairRay(): { origin: Vector3; dir: Vector3 } {
    const origin = new Vector3().copy(this.three.position)
    const dir = this.getForward()
    return { origin, dir }
  }

  attachHelper(obj: Object3D) {
    this.three.add(obj)
  }
}

// reusable scratch
const _v = new Vector3()
const _forward = new Vector3()
const _right = new Vector3()
const _up = new Vector3()
const _anchor = new Vector3()
const _back = new Vector3()
const _e = new Euler(0, 0, 0, 'YXZ')
