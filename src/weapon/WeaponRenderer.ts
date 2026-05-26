import {
  Object3D,
  Group,
  Mesh,
  BoxGeometry,
  Box3,
  CylinderGeometry,
  MeshStandardMaterial,
  Matrix4,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { WEAPONS, type WeaponId, type WeaponStats } from './WeaponData'

/**
 * Loads each weapon GLB at most once and exposes a SINGLE `Object3D` per weapon.
 *
 * `attachTo(parent, offset)` reparents that one instance — Three.js's `parent.add()`
 * removes a node from its previous parent automatically. This keeps the weapon
 * as the unique source of truth (ammo state lives elsewhere, but the muzzle/eject
 * anchors live on this node and follow it across views).
 *
 * If a model GLB is missing, a stylized box "weapon" is generated as a fallback
 * so the rest of the system stays exercisable.
 */
export class WeaponRenderer {
  /** Logical world-space position of the muzzle, recomputed on demand. */
  readonly muzzleAnchor = new Object3D()
  /** Logical world-space position of the shell ejection port. */
  readonly ejectAnchor = new Object3D()

  private models = new Map<WeaponId, Object3D>()
  private current: WeaponId | null = null
  private currentParent: Object3D | null = null

  /** Returns the GLB Object3D for `id`, building a placeholder if loading failed.
   *
   *  Normalization: many third-party weapon packs (e.g. Quaternius) bake a large
   *  scale into the inner mesh node (scale=100) AND a -90° X rotation. After load
   *  we rebuild the scene so the model:
   *    1. Has identity transforms on every node.
   *    2. Is centered on origin.
   *    3. Has longest axis = 1 unit (along +X) — so `tppOffset` scale=1 means
   *       a 1-meter-long weapon. AK at scale 0.9, pistol at 0.22, knife at 0.30.
   */
  async get(id: WeaponId): Promise<Object3D> {
    const cached = this.models.get(id)
    if (cached) return cached
    const stats = WEAPONS[id]
    let model: Object3D
    try {
      const loader = new GLTFLoader()
      const gltf = await loader.loadAsync(stats.modelUrl)
      const raw = gltf.scene
      raw.updateMatrixWorld(true)
      // Measure post-transform AABB to find the longest axis & current size.
      const bbox = new Box3().setFromObject(raw)
      const size = new Vector3()
      bbox.getSize(size)
      const longest = Math.max(size.x, size.y, size.z)
      const normalizeScale = longest > 0 ? 1 / longest : 1

      // Wrap raw inside a normalizer Group: counter-translate to center it and
      // scale to 1 along longest axis. Don't try to undo internal rotation —
      // tppOffset handles orientation.
      const center = new Vector3()
      bbox.getCenter(center)
      const normalizer = new Group()
      normalizer.scale.setScalar(normalizeScale)
      raw.position.sub(center) // center model in normalizer's local space
      normalizer.add(raw)
      model = normalizer

      model.traverse((o) => {
        if ((o as Mesh).isMesh) {
          ;(o as Mesh).castShadow = true
        }
      })
      console.log(
        `[weapon] ${stats.name} loaded, raw size=${size.toArray().map((v) => v.toFixed(3))}, normalized to 1m`,
      )
    } catch {
      console.log(`[weapon] using placeholder for ${stats.name} — drop ${stats.modelUrl.replace('./', 'public/')}`)
      model = buildPlaceholderWeapon(id)
    }
    // Add anchor children once.
    model.add(this.muzzleAnchorFor(id))
    model.add(this.ejectAnchorFor(id))
    this.models.set(id, model)
    return model
  }

  private muzzleAnchorFor(id: WeaponId): Object3D {
    const a = new Object3D()
    a.name = `__muzzle_${id}`
    // Sensible defaults; user can refine after loading their own model.
    a.position.set(0, 0.05, id === 'pistol' ? -0.18 : -0.45)
    return a
  }

  private ejectAnchorFor(id: WeaponId): Object3D {
    const a = new Object3D()
    a.name = `__eject_${id}`
    a.position.set(0.06, 0.04, id === 'pistol' ? -0.05 : -0.1)
    return a
  }

  /** Hide all loaded weapons; called when switching to make sure none linger. */
  private hideAll() {
    for (const m of this.models.values()) m.visible = false
  }

  /**
   * Reparent the active weapon to `parent` with the per-mode offset applied to
   * its local transform.
   */
  async attachTo(id: WeaponId, parent: Object3D, offset: Matrix4): Promise<Object3D> {
    const model = await this.get(id)
    this.hideAll()
    model.visible = true
    parent.add(model)
    offset.decompose(model.position, model.quaternion, model.scale)
    this.current = id
    this.currentParent = parent
    return model
  }

  /** Returns world position of the muzzle for the active weapon. */
  getMuzzleWorld(out = new Vector3()): Vector3 {
    if (!this.current) return out
    const model = this.models.get(this.current)
    if (!model) return out
    const m = model.getObjectByName(`__muzzle_${this.current}`)
    return m ? m.getWorldPosition(out) : model.getWorldPosition(out)
  }

  getEjectWorld(out = new Vector3()): Vector3 {
    if (!this.current) return out
    const model = this.models.get(this.current)
    if (!model) return out
    const e = model.getObjectByName(`__eject_${this.current}`)
    return e ? e.getWorldPosition(out) : model.getWorldPosition(out)
  }

  getStats(): WeaponStats | null {
    return this.current ? WEAPONS[this.current] : null
  }

  getCurrentId(): WeaponId | null {
    return this.current
  }

  getCurrentObject(): Object3D | null {
    return this.current ? this.models.get(this.current) ?? null : null
  }

  /** Re-attach the current weapon to a (possibly different) parent with a new offset. */
  async refreshAttachment(parent: Object3D, offset: Matrix4) {
    if (!this.current) return
    await this.attachTo(this.current, parent, offset)
  }

  get parent(): Object3D | null {
    return this.currentParent
  }
}

/** Stylized placeholder weapon so the system works without real GLB models. */
function buildPlaceholderWeapon(id: WeaponId): Group {
  const root = new Group()
  const body = new MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.55 })
  const wood = new MeshStandardMaterial({ color: 0x6b4a25, roughness: 0.85 })
  if (id === 'knife') {
    const handle = new Mesh(new BoxGeometry(0.04, 0.04, 0.12), wood)
    handle.position.set(0, 0, 0.04)
    root.add(handle)
    const blade = new Mesh(new BoxGeometry(0.02, 0.02, 0.22), new MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7, roughness: 0.3 }))
    blade.position.set(0, 0, -0.15)
    root.add(blade)
    return root
  }
  // Rifle / pistol — chunky receiver + barrel + stock.
  const isPistol = id === 'pistol'
  const recL = isPistol ? 0.18 : 0.5
  const receiver = new Mesh(new BoxGeometry(0.07, 0.09, recL), body)
  receiver.position.set(0, 0, -recL * 0.5)
  root.add(receiver)
  const barrel = new Mesh(new CylinderGeometry(0.018, 0.018, isPistol ? 0.16 : 0.4, 12), body)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 0.05, isPistol ? -0.27 : -0.7)
  root.add(barrel)
  const grip = new Mesh(new BoxGeometry(0.05, 0.13, 0.06), wood)
  grip.position.set(0, -0.09, isPistol ? -0.07 : -0.1)
  grip.rotation.x = isPistol ? 0.2 : 0
  root.add(grip)
  if (!isPistol) {
    const stock = new Mesh(new BoxGeometry(0.06, 0.1, 0.28), wood)
    stock.position.set(0, -0.02, 0.18)
    root.add(stock)
    const mag = new Mesh(new BoxGeometry(0.05, 0.16, 0.07), body)
    mag.position.set(0, -0.13, -0.22)
    mag.rotation.x = -0.15
    root.add(mag)
  }
  return root
}
