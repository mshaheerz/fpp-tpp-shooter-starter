import type { Vector3 } from 'three'
import type AudioManager from '../audio/AudioManager'
import type { SpriteFxSystem } from '../particle/SpriteFxSystem'

export interface MuzzleFlashConfig {
  count: number
  life: [number, number]
  speed: [number, number]
  size: [number, number]
  grow: number
  spread: number
  opacity: number
  gravity: number
  drag: number
}

export function playSpatialWeaponSound(
  audio: AudioManager,
  id: string,
  position: Vector3,
  volume: number,
  rateJitter: number,
) {
  audio.play(id, {
    position: { x: position.x, y: position.y, z: position.z },
    volume,
    rate: 1 + (Math.random() - 0.5) * rateJitter,
  })
}

export function spawnMuzzleFlash(
  flashSprites: SpriteFxSystem | null,
  muzzle: Vector3,
  shotDir: Vector3,
  config: MuzzleFlashConfig,
) {
  flashSprites?.spawn(muzzle, {
    count: config.count,
    life: config.life,
    speed: config.speed,
    size: config.size,
    grow: config.grow,
    spread: config.spread,
    dir: shotDir,
    opacity: config.opacity,
    gravity: config.gravity,
    drag: config.drag,
  })
}
