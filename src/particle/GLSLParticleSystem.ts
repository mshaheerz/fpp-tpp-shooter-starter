import {
  BufferGeometry,
  BufferAttribute,
  Points,
  ShaderMaterial,
  AdditiveBlending,
  Vector3,
  Color,
} from 'three'

const VERT = /* glsl */ `
attribute vec3 aVel;
attribute float aBirth;
attribute float aLife;
attribute float aSize;
uniform float uTime;
uniform vec3 uGravity;
varying float vAlpha;

void main() {
  float age = uTime - aBirth;
  float t = clamp(age / aLife, 0.0, 1.0);
  vec3 pos = position + aVel * age + 0.5 * uGravity * age * age;
  vAlpha = (age > 0.0 && age < aLife) ? (1.0 - t) : 0.0;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * (300.0 / -mv.z) * (1.0 - 0.4 * t);
}
`

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(uColor, a);
}
`

export type ParticleKind = 'muzzle' | 'smoke' | 'impact'

const CAPACITY = 1024

const _v = new Vector3()

interface Slot {
  birth: number
  life: number
}

/**
 * One ring-buffer GPU particle system. Each particle is a quad with linear
 * velocity + constant gravity integrated in the vertex shader; alpha fades over
 * life and the fragment shader makes a soft round splat.
 */
export class GLSLParticleSystem {
  readonly points: Points
  private geom: BufferGeometry
  private mat: ShaderMaterial
  private cursor = 0
  private time = 0
  private slots: Slot[] = new Array(CAPACITY).fill(null).map(() => ({ birth: -1e9, life: 0 }))

  constructor(color: Color = new Color(0xffcc66), gravityY = -3) {
    this.geom = new BufferGeometry()
    const pos = new Float32Array(CAPACITY * 3)
    const vel = new Float32Array(CAPACITY * 3)
    const birth = new Float32Array(CAPACITY)
    const life = new Float32Array(CAPACITY)
    const size = new Float32Array(CAPACITY)
    for (let i = 0; i < CAPACITY; i++) birth[i] = -1e9
    this.geom.setAttribute('position', new BufferAttribute(pos, 3))
    this.geom.setAttribute('aVel', new BufferAttribute(vel, 3))
    this.geom.setAttribute('aBirth', new BufferAttribute(birth, 1))
    this.geom.setAttribute('aLife', new BufferAttribute(life, 1))
    this.geom.setAttribute('aSize', new BufferAttribute(size, 1))

    this.mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGravity: { value: new Vector3(0, gravityY, 0) },
        uColor: { value: color.clone() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    this.points = new Points(this.geom, this.mat)
    this.points.frustumCulled = false
  }

  setColor(c: Color) {
    ;(this.mat.uniforms.uColor.value as Color).copy(c)
  }

  spawn(origin: Vector3, count: number, life: number, speed: number, sizePx = 12, dir: Vector3 = _v.set(0, 1, 0)) {
    const pos = this.geom.getAttribute('position') as BufferAttribute
    const vel = this.geom.getAttribute('aVel') as BufferAttribute
    const birth = this.geom.getAttribute('aBirth') as BufferAttribute
    const lifeAttr = this.geom.getAttribute('aLife') as BufferAttribute
    const sizeAttr = this.geom.getAttribute('aSize') as BufferAttribute
    for (let i = 0; i < count; i++) {
      const idx = this.cursor
      this.cursor = (this.cursor + 1) % CAPACITY
      pos.setXYZ(idx, origin.x, origin.y, origin.z)
      const jx = (Math.random() - 0.5) * 0.6
      const jy = (Math.random() - 0.5) * 0.6
      const jz = (Math.random() - 0.5) * 0.6
      const sp = speed * (0.5 + Math.random() * 0.7)
      vel.setXYZ(idx, dir.x * sp + jx * sp, dir.y * sp + jy * sp, dir.z * sp + jz * sp)
      birth.setX(idx, this.time)
      lifeAttr.setX(idx, life * (0.6 + Math.random() * 0.6))
      sizeAttr.setX(idx, sizePx * (0.8 + Math.random() * 0.6))
      this.slots[idx].birth = this.time
      this.slots[idx].life = life
    }
    pos.needsUpdate = true
    vel.needsUpdate = true
    birth.needsUpdate = true
    lifeAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
  }

  update(dt: number) {
    this.time += dt
    ;(this.mat.uniforms.uTime.value as number) = this.time
  }
}
