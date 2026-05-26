import {
  Scene as ThreeScene,
  Color,
  Box3,
  HemisphereLight,
  DirectionalLight,
  Fog,
  Mesh,
  Object3D,
  Group,
  BufferGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  BoxGeometry,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import RAPIER from '@dimforge/rapier3d-compat'
import type { PhysicsSystem } from './PhysicsSystem'

/**
 * The visual scene: lights, sky, fog, and the loaded map.
 *
 * `loadMap()` walks every mesh in a .glb and creates a Rapier Trimesh collider
 * for each. Map convention: Y is up, 1 unit = 1 meter.
 */
export class Scene {
  readonly three = new ThreeScene()
  readonly sun = new DirectionalLight(0xfff2d6, 2.2)
  readonly hemi = new HemisphereLight(0xbfd7ff, 0x3a3024, 0.45)
  /** Static trimesh colliders keyed by their source mesh, for later cleanup. */
  private mapColliders = new Map<Mesh, RAPIER.Collider | null>()
  private propLoader = new GLTFLoader()
  private propCache = new Map<string, Object3D>()
  private propFootprints = new Map<string, { x: number; z: number }>()
  private reactiveByCollider = new Map<number, ReactiveTarget>()
  private reactiveTargets = new Set<ReactiveTarget>()
  private dynamicProps: DynamicProp[] = []
  private physics: PhysicsSystem | null = null

  constructor() {
    this.three.background = new Color(0x9bbfe6)
    this.three.fog = new Fog(0x9bbfe6, 30, 160)

    this.sun.position.set(40, 60, 25)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 160
    const s = 40
    this.sun.shadow.camera.left = -s
    this.sun.shadow.camera.right = s
    this.sun.shadow.camera.top = s
    this.sun.shadow.camera.bottom = -s
    this.sun.shadow.bias = -0.0005
    this.three.add(this.sun)
    this.three.add(this.sun.target)

    this.three.add(this.hemi)
  }

  add(obj: Object3D) {
    this.three.add(obj)
  }

  remove(obj: Object3D) {
    this.three.remove(obj)
  }

  /**
   * Placeholder map: a flat ground plane plus a few boxes for jumping/strafing.
   * Used until the user drops a real dust.glb into public/assets/maps/.
   */
  addProceduralGround(physics: PhysicsSystem) {
    this.physics = physics
    const ground = new Mesh(
      new PlaneGeometry(120, 120, 1, 1),
      new MeshStandardMaterial({ color: 0x6a7a55, roughness: 0.95 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    ground.updateMatrixWorld(true)
    this.registerObjectColliders(ground, physics)
    this.three.add(ground)

    // A few boxes so it's not a featureless plane.
    const boxMat = new MeshStandardMaterial({ color: 0xa39378, roughness: 0.8 })
    const boxes: Array<[number, number, number, number, number, number]> = [
      [8, 0.5, 0, 3, 1, 3],
      [-6, 1, 4, 2, 2, 2],
      [0, 0.25, -10, 6, 0.5, 1.5],
      [4, 1.5, -6, 1.5, 3, 1.5],
    ]
    for (const [x, y, z, sx, sy, sz] of boxes) {
      const b = new Mesh(new BoxGeometry(sx, sy, sz), boxMat)
      b.position.set(x, y, z)
      b.castShadow = true
      b.receiveShadow = true
      b.updateMatrixWorld(true)
      this.registerObjectColliders(b, physics)
      this.three.add(b)
    }

    // Reactive fallback targets so shooting feedback works even without map assets.
    const crate = new Mesh(new BoxGeometry(1.1, 1.1, 1.1), new MeshStandardMaterial({ color: 0x8b6a3b, roughness: 0.9 }))
    crate.position.set(2, 0.55, -5)
    crate.castShadow = true
    crate.receiveShadow = true
    this.three.add(crate)
    this.addReactiveTarget(crate, 'crate', 70, physics)

    const barrel = new Mesh(new BoxGeometry(0.9, 1.4, 0.9), new MeshStandardMaterial({ color: 0x565f66, roughness: 0.55, metalness: 0.35 }))
    barrel.position.set(-2, 0.7, -7)
    barrel.castShadow = true
    barrel.receiveShadow = true
    this.three.add(barrel)
    this.addReactiveTarget(barrel, 'barrel', 110, physics)

    const target = new Mesh(new BoxGeometry(0.7, 0.7, 0.25), new MeshStandardMaterial({ color: 0xecd46e, roughness: 0.8 }))
    target.position.set(0, 1.2, -9)
    target.castShadow = true
    target.receiveShadow = true
    this.three.add(target)
    this.addReactiveTarget(target, 'target', 40, physics)
  }

  async loadMap(url: string, physics: PhysicsSystem): Promise<Group> {
    this.physics = physics
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    const root = gltf.scene
    root.updateMatrixWorld(true)
    this.registerObjectColliders(root, physics)
    this.three.add(root)
    return root
  }

  async addKenneyShootRange(physics: PhysicsSystem): Promise<boolean> {
    this.physics = physics
    const roads = './assets/kenney/roads/Models/GLB%20format/'
    const prototype = './assets/kenney/prototype/Models/GLB%20format/'
    const industrial = './assets/kenney/industrial/Models/GLB%20format/'
    const suburban = './assets/kenney/suburban/Models/GLB%20format/'

    const root = new Group()
    root.name = 'KenneyShootRange'
    this.three.add(root)

    let loadedAny = false

    // Continuous walkable base so the scene reads as a true map, not floating tiles.
    const base = new Mesh(
      new PlaneGeometry(220, 220, 1, 1),
      new MeshStandardMaterial({ color: 0x6d7c62, roughness: 0.98 }),
    )
    base.rotation.x = -Math.PI / 2
    base.position.y = -0.02
    base.receiveShadow = true
    root.add(base)
    base.updateMatrixWorld(true)
    this.registerObjectColliders(base, physics)

    const tryPlace = async (
      url: string,
      pos: [number, number, number],
      rotY = 0,
      scale = 1,
      reactive?: { kind: ReactiveKind; hp: number },
      desiredHeight?: number,
    ) => {
      try {
        const o = await this.loadProp(url)
        o.position.set(pos[0], pos[1], pos[2])
        o.rotation.y = rotY
        if (desiredHeight && desiredHeight > 0) {
          const h = await this.getHeight(url)
          const hScale = h > 0.01 ? desiredHeight / h : 1
          o.scale.setScalar(scale * hScale)
        } else {
          o.scale.setScalar(scale)
        }
        root.add(o)
        o.updateMatrixWorld(true)

        // Ground-snap by bbox so assets with different pivots all sit on the floor.
        const bb = new Box3().setFromObject(o, true)
        if (Number.isFinite(bb.min.y)) {
          o.position.y += pos[1] - bb.min.y
          o.updateMatrixWorld(true)
        }

        if (reactive) this.addReactiveTarget(o, reactive.kind, reactive.hp, physics)
        else this.registerObjectColliders(o, physics)
        loadedAny = true
      } catch {
        // Ignore missing assets and continue building what we can.
      }
    }

    const tileFoot = await this.getFootprint(`${roads}tile-low.glb`)
    const roadFoot = await this.getFootprint(`${roads}road-straight.glb`)
    const TILE = Math.max(1.8, tileFoot.x, tileFoot.z, roadFoot.x, roadFoot.z)
    const GRID = 7
    const HALF = Math.floor(GRID / 2)

    // Base block grid.
    for (let gx = -HALF; gx <= HALF; gx++) {
      for (let gz = -HALF; gz <= HALF; gz++) {
        await tryPlace(`${roads}tile-low.glb`, [gx * TILE, 0, gz * TILE], 0, 1)
      }
    }

    // Cross-shaped road network.
    await tryPlace(`${roads}road-crossroad.glb`, [0, 0.01, 0], 0, 1)
    for (let i = 1; i <= HALF; i++) {
      await tryPlace(`${roads}road-straight.glb`, [0, 0.01, i * TILE], 0, 1)
      await tryPlace(`${roads}road-straight.glb`, [0, 0.01, -i * TILE], 0, 1)
      await tryPlace(`${roads}road-straight.glb`, [i * TILE, 0.01, 0], Math.PI / 2, 1)
      await tryPlace(`${roads}road-straight.glb`, [-i * TILE, 0.01, 0], Math.PI / 2, 1)
    }
    await tryPlace(`${roads}road-intersection.glb`, [0, 0.01, HALF * TILE], 0, 1)
    await tryPlace(`${roads}road-intersection.glb`, [0, 0.01, -HALF * TILE], 0, 1)
    await tryPlace(`${roads}road-intersection.glb`, [HALF * TILE, 0.01, 0], Math.PI / 2, 1)
    await tryPlace(`${roads}road-intersection.glb`, [-HALF * TILE, 0.01, 0], Math.PI / 2, 1)

    // Block boundaries / arena edges using walls.
    const edge = HALF * TILE + TILE
    for (let i = -HALF - 1; i <= HALF + 1; i++) {
      await tryPlace(`${prototype}wall.glb`, [i * TILE, 0, edge], 0, 1)
      await tryPlace(`${prototype}wall.glb`, [i * TILE, 0, -edge], 0, 1)
      await tryPlace(`${prototype}wall.glb`, [edge, 0, i * TILE], Math.PI / 2, 1)
      await tryPlace(`${prototype}wall.glb`, [-edge, 0, i * TILE], Math.PI / 2, 1)
    }
    await tryPlace(`${prototype}wall-corner.glb`, [edge, 0, edge], 0, 1)
    await tryPlace(`${prototype}wall-corner.glb`, [-edge, 0, edge], Math.PI / 2, 1)
    await tryPlace(`${prototype}wall-corner.glb`, [-edge, 0, -edge], Math.PI, 1)
    await tryPlace(`${prototype}wall-corner.glb`, [edge, 0, -edge], -Math.PI / 2, 1)

    // Industrial + suburban building belts.
    const industrialRow = [
      { m: 'building-a.glb', x: -10, z: -10, r: Math.PI * 0.15, h: 7.2 },
      { m: 'building-b.glb', x: -6, z: -11, r: Math.PI * 0.05, h: 7.2 },
      { m: 'building-c.glb', x: -2, z: -10, r: Math.PI * 0.12, h: 7.2 },
    ]
    for (const b of industrialRow) {
      await tryPlace(`${industrial}${b.m}`, [b.x, 0, b.z], b.r, 1, undefined, b.h)
    }
    const suburbanRow = [
      { m: 'building-type-a.glb', x: 3, z: 10, r: Math.PI, h: 6.2 },
      { m: 'building-type-b.glb', x: 7, z: 11, r: Math.PI * 0.9, h: 6.2 },
      { m: 'building-type-c.glb', x: 11, z: 10, r: Math.PI * 0.95, h: 6.2 },
    ]
    for (const b of suburbanRow) {
      await tryPlace(`${suburban}${b.m}`, [b.x, 0, b.z], b.r, 1, undefined, b.h)
    }

    // Decorative fences/trees.
    for (let i = -2; i <= 2; i++) {
      await tryPlace(`${suburban}fence-1x3.glb`, [10.6, 0, i * 2.2], Math.PI / 2, 1, undefined, 2.1)
    }
    await tryPlace(`${suburban}tree-large.glb`, [8, 0, 6], 0, 1, undefined, 5.5)
    await tryPlace(`${suburban}tree-small.glb`, [12, 0, 5], 0, 1, undefined, 4.4)
    await tryPlace(`${suburban}tree-small.glb`, [9, 0, 9], 0, 1, undefined, 4.4)

    // Central shooting playground with reactive targets.
    const props: Array<[string, [number, number, number], number, number, { kind: ReactiveKind; hp: number }]> = [
      [`${prototype}crate-color.glb`, [1.8, 0.55, -4.6], 0.2, 1.08, { kind: 'crate', hp: 70 }],
      [`${prototype}crate.glb`, [3.2, 0.55, -5.4], -0.35, 1.05, { kind: 'crate', hp: 70 }],
      [`${prototype}crate.glb`, [-2.9, 0.55, 4.8], 0.15, 1.05, { kind: 'crate', hp: 70 }],
      [`${industrial}detail-tank.glb`, [-1.7, 0.7, -7.2], 0.1, 1.1, { kind: 'barrel', hp: 120 }],
      [`${industrial}detail-tank.glb`, [-3.6, 0.7, -8.4], -0.2, 1.1, { kind: 'barrel', hp: 120 }],
      [`${industrial}detail-tank.glb`, [4.2, 0.7, 6.8], 0.25, 1.1, { kind: 'barrel', hp: 120 }],
      [`${prototype}target-b-square.glb`, [0, 1.25, -10], 0, 1, { kind: 'target', hp: 40 }],
      [`${prototype}target-a-round.glb`, [2.5, 1.35, -11], 0, 1, { kind: 'target', hp: 40 }],
      [`${prototype}target-b-round.glb`, [-2.2, 1.35, 9.2], Math.PI, 1, { kind: 'target', hp: 40 }],
    ]
    for (const [url, pos, rotY, scale, rx] of props) {
      await tryPlace(url, pos, rotY, scale, rx)
    }

    if (!loadedAny) {
      this.three.remove(root)
      return false
    }
    return true
  }

  applyBulletHit(colliderHandle: number, damage: number): BulletReaction {
    const target = this.reactiveByCollider.get(colliderHandle)
    if (!target || target.destroyed) return { kind: 'none', destroyed: false }
    target.lastHitDamage = damage
    target.hp -= damage
    if (target.hp > 0) return { kind: target.kind, destroyed: false }

    target.destroyed = true
    target.object.visible = false
    this.reactiveTargets.delete(target)
    this.reactiveByCollider.delete(colliderHandle)

    if (this.physics) {
      if (target.body) {
        try {
          this.physics.world.removeRigidBody(target.body)
        } catch {
          // already removed
        }
        this.dynamicProps = this.dynamicProps.filter((d) => d.reactive !== target)
        target.body = null
      }
      for (const h of target.colliders) {
        this.reactiveByCollider.delete(h)
        try {
          const c = this.physics.world.getCollider(h)
          this.physics.world.removeCollider(c, true)
        } catch {
          // Collider may already be removed; ignore.
        }
      }
    }
    return { kind: target.kind, destroyed: true }
  }

  applyBulletImpulse(colliderHandle: number, hitPoint: Vector3, shotDir: Vector3, damage: number) {
    const target = this.reactiveByCollider.get(colliderHandle)
    if (!target || target.destroyed || !target.body) return
    const dir = shotDir.clone().normalize()
    const impulseMag = Math.max(0.8, damage * 0.12)
    const impulse = { x: dir.x * impulseMag, y: dir.y * impulseMag + 0.08, z: dir.z * impulseMag }
    target.body.applyImpulseAtPoint(
      impulse,
      { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
      true,
    )
  }

  update(_dt: number) {
    for (const d of this.dynamicProps) {
      const t = d.body.translation()
      const r = d.body.rotation()
      d.object.position.set(t.x, t.y, t.z)
      d.object.quaternion.set(r.x, r.y, r.z, r.w)
    }
  }

  private addReactiveTarget(object: Object3D, kind: ReactiveKind, hp: number, physics: PhysicsSystem) {
    const dynamic = kind === 'crate' || kind === 'barrel'
    const target: ReactiveTarget = {
      object,
      kind,
      hp,
      maxHp: hp,
      colliders: [],
      destroyed: false,
      body: null,
      lastHitDamage: 0,
    }
    this.reactiveTargets.add(target)
    if (dynamic) {
      this.registerDynamicReactive(object, physics, target)
    } else {
      this.registerObjectColliders(object, physics, target)
    }
  }

  private registerObjectColliders(object: Object3D, physics: PhysicsSystem, reactive?: ReactiveTarget) {
    object.updateMatrixWorld(true)
    object.traverse((obj) => {
      if (!(obj as Mesh).isMesh) return
      const m = obj as Mesh
      m.castShadow = true
      m.receiveShadow = true
      const geom = m.geometry as BufferGeometry
      const collider = physics.createTrimeshCollider(geom, m.matrixWorld)
      this.mapColliders.set(m, collider)
      if (reactive && collider) {
        reactive.colliders.push(collider.handle)
        this.reactiveByCollider.set(collider.handle, reactive)
      }
    })
  }

  private async loadProp(url: string): Promise<Object3D> {
    const cached = this.propCache.get(url)
    if (cached) return cached.clone(true)
    const gltf = await this.propLoader.loadAsync(url)
    const root = gltf.scene
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const m = o as Mesh
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    this.propCache.set(url, root)
    return root.clone(true)
  }

  private async getFootprint(url: string): Promise<{ x: number; z: number }> {
    const cached = this.propFootprints.get(url)
    if (cached) return cached
    const o = await this.loadProp(url)
    o.updateMatrixWorld(true)
    const bb = new Box3().setFromObject(o, true)
    const x = Math.max(0.1, bb.max.x - bb.min.x)
    const z = Math.max(0.1, bb.max.z - bb.min.z)
    const out = { x, z }
    this.propFootprints.set(url, out)
    return out
  }

  private async getHeight(url: string): Promise<number> {
    const o = await this.loadProp(url)
    o.updateMatrixWorld(true)
    const bb = new Box3().setFromObject(o, true)
    return Math.max(0.01, bb.max.y - bb.min.y)
  }

  private registerDynamicReactive(object: Object3D, physics: PhysicsSystem, reactive: ReactiveTarget) {
    object.updateMatrixWorld(true)
    const bbox = new Box3().setFromObject(object, true)
    const size = new Vector3()
    const center = new Vector3()
    bbox.getSize(size)
    bbox.getCenter(center)
    const hy = Math.max(0.12, size.y * 0.5)
    const hx = Math.max(0.12, size.x * 0.5)
    const hz = Math.max(0.12, size.z * 0.5)
    const q = object.quaternion
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCanSleep(false)
    const body = physics.world.createRigidBody(bodyDesc)
    body.setLinearDamping(1.3)
    body.setAngularDamping(2.0)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setDensity(35)
      .setFriction(0.8)
      .setRestitution(0.06)
    const collider = physics.world.createCollider(colliderDesc, body)
    reactive.body = body
    reactive.colliders.push(collider.handle)
    this.reactiveByCollider.set(collider.handle, reactive)
    object.position.set(center.x, center.y, center.z)
    this.dynamicProps.push({ object, body, reactive })
  }
}

type ReactiveKind = 'crate' | 'barrel' | 'target'

interface ReactiveTarget {
  object: Object3D
  kind: ReactiveKind
  hp: number
  maxHp: number
  colliders: number[]
  destroyed: boolean
  body: RAPIER.RigidBody | null
  lastHitDamage: number
}

export interface BulletReaction {
  kind: ReactiveKind | 'none'
  destroyed: boolean
}

interface DynamicProp {
  object: Object3D
  body: RAPIER.RigidBody
  reactive: ReactiveTarget
}
