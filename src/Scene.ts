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
  /** Root group for the currently-loaded map, or null when no map is loaded. */
  private activeMapRoot: Group | null = null

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

  /**
   * Begin authoring a map. Creates a fresh root group + a flat walkable base
   * and returns a `MapBuilder` whose `place(...)` puts Kenney props at world
   * coordinates. Maps live in `src/maps/<id>.ts` and call this once.
   *
   * `groundSize` is the side length of the visual + physics floor plane (m).
   */
  startMap(
    physics: PhysicsSystem,
    name: string,
    opts?: { groundSize?: number; groundColor?: number; noDefaultGround?: boolean },
  ): MapBuilder {
    // Tear down any previous map first so loadMapById() can be called again.
    this.clearMap(physics)
    this.physics = physics

    const root = new Group()
    root.name = name
    this.three.add(root)
    this.activeMapRoot = root

    let loadedAny = false

    // Monolithic GLB maps ship their own ground — skip the default plane so the
    // collider doesn't intersect their floor and cause z-fighting / footstep
    // weirdness. The default plane is still useful for Kenney-prop maps where
    // the props don't form a complete ground surface.
    if (!opts?.noDefaultGround) {
      const groundSize = opts?.groundSize ?? 220
      const groundColor = opts?.groundColor ?? 0x6d7c62
      const base = new Mesh(
        new PlaneGeometry(groundSize, groundSize, 1, 1),
        new MeshStandardMaterial({ color: groundColor, roughness: 0.98 }),
      )
      base.rotation.x = -Math.PI / 2
      base.position.y = -0.02
      base.receiveShadow = true
      root.add(base)
      base.updateMatrixWorld(true)
      this.registerObjectColliders(base, physics)
    }

    const place: MapBuilder['place'] = async (url, pos, rotY = 0, scale = 1, reactive, desiredHeight) => {
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
        const bb = new Box3().setFromObject(o, true)
        if (Number.isFinite(bb.min.y)) {
          o.position.y += pos[1] - bb.min.y
          o.updateMatrixWorld(true)
        }
        if (reactive) this.addReactiveTarget(o, reactive.kind, reactive.hp, physics)
        else this.registerObjectColliders(o, physics)
        loadedAny = true
      } catch {
        // Missing assets are ignored so builds remain resilient.
      }
    }

    /**
     * Load a pre-authored monolithic GLB as the entire map. Walks every mesh
     * and creates a Rapier trimesh collider per submesh so collisions match
     * the visual geometry exactly. Use this for Blender / SketchUp / Sketchfab
     * scenes that already contain the floor, walls, and props as one scene.
     */
    const loadGlb: MapBuilder['loadGlb'] = async (url, glbOpts) => {
      try {
        const loader = new GLTFLoader()
        const gltf = await loader.loadAsync(url)
        const sceneRoot = gltf.scene
        const scale = glbOpts?.scale ?? 1
        const yOffset = glbOpts?.yOffset ?? 0
        sceneRoot.scale.setScalar(scale)
        sceneRoot.position.y += yOffset
        sceneRoot.traverse((o) => {
          if ((o as Mesh).isMesh) {
            const m = o as Mesh
            m.castShadow = true
            m.receiveShadow = true
          }
        })
        root.add(sceneRoot)
        sceneRoot.updateMatrixWorld(true)
        this.registerObjectColliders(sceneRoot, physics)
        loadedAny = true
      } catch (e) {
        console.warn('[map] failed to load GLB', url, e)
      }
    }

    return {
      root,
      physics,
      place,
      loadGlb,
      footprint: (url) => this.getFootprint(url),
      height: (url) => this.getHeight(url),
      didLoadAny: () => loadedAny,
    }
  }

  /**
   * Remove the currently-loaded map (visual + physics) so a different one can
   * be loaded. Safe to call when no map is loaded.
   */
  clearMap(physics: PhysicsSystem) {
    // Remove dynamic reactive bodies first (they own Rapier rigid bodies).
    for (const d of this.dynamicProps) {
      try { physics.world.removeRigidBody(d.body) } catch { /* already gone */ }
    }
    this.dynamicProps = []
    // Remove every static map collider we tracked.
    for (const [, collider] of this.mapColliders) {
      if (!collider) continue
      try { physics.world.removeCollider(collider, true) } catch { /* already gone */ }
    }
    this.mapColliders.clear()
    this.reactiveTargets.clear()
    this.reactiveByCollider.clear()
    if (this.activeMapRoot) {
      this.three.remove(this.activeMapRoot)
      this.activeMapRoot = null
    }
  }

  /**
   * Load a map by id from the registry. Returns true if anything loaded.
   * Callers should fall back to `addProceduralGround()` on false.
   */
  async loadMapById(id: string, physics: PhysicsSystem): Promise<boolean> {
    const mod = await import('./maps').then((m) => m.MAPS.find((mm) => mm.id === id))
    if (!mod) {
      console.warn('[map] unknown id', id)
      return false
    }
    const builder = this.startMap(physics, mod.name, mod.scene)
    await mod.build(builder)
    if (!builder.didLoadAny()) {
      this.clearMap(physics)
      return false
    }
    return true
  }

  /**
   * Legacy single-map entry point — kept so the existing main.ts call site
   * keeps working until it's switched to `loadMapById`.
   */
  async addKenneyShootRange(physics: PhysicsSystem): Promise<boolean> {
    return this.loadMapById('shootRange', physics)
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

export type ReactiveKind = 'crate' | 'barrel' | 'target'

/**
 * Authoring API handed to each map module's `build(builder)`. Wraps just enough
 * of `Scene` so map files don't need to know about colliders, prop caching, or
 * footprint queries — they only call `place(...)` and (optionally) `footprint`
 * / `height` for layout math.
 */
export interface MapBuilder {
  /** Map root group; map modules can `add` extra meshes here for custom geometry. */
  root: Group
  physics: PhysicsSystem
  /**
   * Place a Kenney GLB at world coords, with optional Y rotation, uniform
   * scale, reactive (destructible) hookup, and a desired height in meters
   * (height overrides scale proportionally so every "house" reads the same
   * size regardless of source units).
   */
  place: (
    url: string,
    pos: [number, number, number],
    rotY?: number,
    scale?: number,
    reactive?: { kind: ReactiveKind; hp: number },
    desiredHeight?: number,
  ) => Promise<void>
  /**
   * Drop a pre-authored monolithic GLB into the map. Per-mesh trimesh colliders
   * are built automatically. Use for Blender / SketchUp scenes you exported as
   * one file (e.g. `ghost_city.glb`). `scale` / `yOffset` adjust if the source
   * units or pivot are off.
   */
  loadGlb: (url: string, opts?: { scale?: number; yOffset?: number }) => Promise<void>
  footprint: (url: string) => Promise<{ x: number; z: number }>
  height: (url: string) => Promise<number>
  didLoadAny: () => boolean
}

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
