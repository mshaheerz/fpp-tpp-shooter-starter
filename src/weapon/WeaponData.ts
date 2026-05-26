import { Matrix4, Euler, Vector3, Quaternion } from 'three'
import type { AnimMarker } from '../animation/AnimationSystem'

export type WeaponId = 'ak47' | 'pistol' | 'knife'

export interface WeaponStats {
  id: WeaponId
  name: string
  /** Path to the GLB model (under public/assets/weapons/). */
  modelUrl: string
  magSize: number
  reserve: number
  /** Rounds per minute. */
  rpm: number
  /** Damage per body shot. */
  damage: number
  /** Cone half-angle in radians for hipfire spread. */
  spread: number
  /** Recoil applied each shot (yaw + pitch radians). */
  recoil: { yaw: number; pitch: number }
  /** Camera shake amount per shot. */
  cameraShake: number
  reloadTime: number
  switchTime: number
  /** Local transform when attached to the camera (FPP). */
  fppOffset: Matrix4
  /** Local transform when attached to the character's right-hand bone (TPP). */
  tppOffset: Matrix4
  /** Marker timeline driving the FPP-arm/character firing animation. */
  fireMarkers: AnimMarker[]
  reloadMarkers: AnimMarker[]
}

const mat4 = (pos: [number, number, number], euler: [number, number, number], scale = 1): Matrix4 => {
  const out = new Matrix4()
  out.compose(
    new Vector3(...pos),
    new Quaternion().setFromEuler(new Euler(...euler, 'XYZ')),
    new Vector3(scale, scale, scale),
  )
  return out
}

// Per-weapon TPP attach matrix.
//
// WeaponRenderer normalizes every loaded weapon to longest-axis = 1 unit, so
// the `scale` value below is the actual desired length in METERS:
//   AK   ≈ 0.90 m
//   pistol ≈ 0.22 m
//   knife  ≈ 0.30 m
//
// Orientation: use per-weapon tuned Euler angles (similar approach as YAZH).
// Keep these independent per model; different source GLBs have different
// authored forward/up axes.
// Position offsets fine-tune the grip location into the palm.
export const WEAPONS: Record<WeaponId, WeaponStats> = {
  ak47: {
    id: 'ak47',
    name: 'AK-47',
    modelUrl: './assets/weapons/ak47.glb',
    magSize: 30,
    reserve: 90,
    rpm: 600,
    damage: 35,
    spread: 0.012,
    recoil: { yaw: 0.0015, pitch: 0.013 },
    cameraShake: 0.05,
    reloadTime: 2.4,
    switchTime: 0.4,
    fppOffset: mat4([0, 0, 0], [0, 0, 0], 1),
    tppOffset: mat4([0, 0.13, 0.03], [3.1416, 0.3665, -1.5184], 0.2),
    fireMarkers: [
      { time: 0.02, event: 'flash' },
      { time: 0.05, event: 'eject' },
    ],
    reloadMarkers: [{ time: 1.2, event: 'reloadInsert' }],
  },
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    modelUrl: './assets/weapons/pistol.glb',
    magSize: 15,
    reserve: 60,
    rpm: 360,
    damage: 24,
    spread: 0.008,
    recoil: { yaw: 0.001, pitch: 0.018 },
    cameraShake: 0.04,
    reloadTime: 1.6,
    switchTime: 0.3,
    fppOffset: mat4([0, 0, 0], [0, 0, 0], 1),
    tppOffset: mat4([0, 0.02, -0.05], [0, -3.5081, 1.6232], 0.27),
    fireMarkers: [
      { time: 0.02, event: 'flash' },
      { time: 0.06, event: 'eject' },
    ],
    reloadMarkers: [{ time: 0.9, event: 'reloadInsert' }],
  },
  knife: {
    id: 'knife',
    name: 'Knife',
    modelUrl: './assets/weapons/knife.glb',
    magSize: 0,
    reserve: 0,
    rpm: 120,
    damage: 60,
    spread: 0,
    recoil: { yaw: 0, pitch: 0 },
    cameraShake: 0.02,
    reloadTime: 0,
    switchTime: 0.3,
    fppOffset: mat4([0, 0, 0], [0, 0, 0], 1),
    tppOffset: mat4([0.04, 0.13, 0.06], [-0.1047, -0.5323, 1.213], 0.3),
    fireMarkers: [],
    reloadMarkers: [],
  },
}

// Hot-reload weapon stats during development.
if (typeof import.meta !== 'undefined' && (import.meta as any).hot) {
  ;(import.meta as any).hot.accept()
}
