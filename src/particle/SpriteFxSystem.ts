import {
  AdditiveBlending,
  Color,
  Group,
  NormalBlending,
  Sprite,
  SpriteMaterial,
  Texture,
  Vector3,
} from 'three'

interface Particle {
  active: boolean
  sprite: Sprite
  vel: Vector3
  age: number
  life: number
  size0: number
  size1: number
  spin: number
}

export interface SpriteSpawnOpts {
  count?: number
  life?: [number, number]
  speed?: [number, number]
  size?: [number, number]
  grow?: number
  drag?: number
  gravity?: number
  opacity?: number
  spread?: number
  dir?: Vector3
}

const _rand = new Vector3()
const _up = new Vector3(0, 1, 0)

export class SpriteFxSystem {
  readonly object = new Group()
  private particles: Particle[] = []
  private cursor = 0
  private drag = 1.6
  private gravity = -0.4
  private baseOpacity = 0.85

  constructor(texture: Texture, capacity = 160, additive = false, color = new Color(0xffffff)) {
    for (let i = 0; i < capacity; i++) {
      const mat = new SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: additive ? AdditiveBlending : NormalBlending,
      })
      const s = new Sprite(mat)
      s.visible = false
      this.object.add(s)
      this.particles.push({
        active: false,
        sprite: s,
        vel: new Vector3(),
        age: 0,
        life: 1,
        size0: 0.5,
        size1: 1.2,
        spin: 0,
      })
    }
  }

  spawn(origin: Vector3, opts: SpriteSpawnOpts = {}) {
    const count = opts.count ?? 8
    const life = opts.life ?? [0.35, 0.85]
    const speed = opts.speed ?? [0.6, 1.8]
    const size = opts.size ?? [0.45, 0.8]
    const grow = opts.grow ?? 1.6
    const spread = opts.spread ?? 0.8
    const dir = opts.dir ?? _up
    this.drag = opts.drag ?? this.drag
    this.gravity = opts.gravity ?? this.gravity
    this.baseOpacity = opts.opacity ?? this.baseOpacity

    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor]
      this.cursor = (this.cursor + 1) % this.particles.length
      p.active = true
      p.age = 0
      p.life = mix(life[0], life[1], Math.random())
      p.size0 = mix(size[0], size[1], Math.random())
      p.size1 = p.size0 * grow * mix(0.85, 1.25, Math.random())
      p.spin = (Math.random() - 0.5) * 2.4
      _rand.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread)
      p.vel.copy(dir).add(_rand).normalize().multiplyScalar(mix(speed[0], speed[1], Math.random()))
      p.sprite.position.copy(origin)
      p.sprite.scale.setScalar(p.size0)
      const m = p.sprite.material as SpriteMaterial
      m.opacity = this.baseOpacity
      m.rotation = Math.random() * Math.PI * 2
      p.sprite.visible = true
    }
  }

  update(dt: number) {
    const dragFactor = Math.exp(-this.drag * dt)
    for (const p of this.particles) {
      if (!p.active) continue
      p.age += dt
      if (p.age >= p.life) {
        p.active = false
        p.sprite.visible = false
        continue
      }
      const t = p.age / p.life
      p.vel.multiplyScalar(dragFactor)
      p.vel.y += this.gravity * dt
      p.sprite.position.addScaledVector(p.vel, dt)
      const s = p.size0 + (p.size1 - p.size0) * t
      p.sprite.scale.set(s, s, 1)
      const m = p.sprite.material as SpriteMaterial
      m.opacity = this.baseOpacity * (1 - t)
      m.rotation += p.spin * dt
    }
  }
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}
