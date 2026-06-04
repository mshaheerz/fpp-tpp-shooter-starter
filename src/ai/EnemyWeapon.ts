import {
  Object3D,
  Group,
  Mesh,
  Box3,
  Vector3,
  Quaternion,
  BoxGeometry,
  MeshStandardMaterial,
  MathUtils,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { WEAPONS } from '../weapon/WeaponData'
import { dlog } from '../debug/log'

/**
 * Enemy weapon model. Enemies hold the SAME real rifle the player uses
 * (`ak47.glb`) rather than a crude box, but they can't share the player's single
 * `WeaponRenderer` instance (it reparents one object across views). So we load
 * the GLB once here and hand out an independent **clone** per enemy.
 *
 * `attachEnemyGun(hand)` parents a fresh gun to the hand bone and returns its
 * muzzle tip (bullet origin for enemy fire). If the GLB is missing we fall back
 * to the primitive box so the game still runs without assets.
 */

let _template: Object3D | null = null
let _loadOnce: Promise<Object3D> | null = null

/** AK tppOffset reused so the enemy holds the rifle at the same grip/orientation
 *  the player's TPP character does. Decomposed once into pos/quat/scale. */
const _gripPos = new Vector3()
const _gripQuat = new Quaternion()
const _gripScale = new Vector3(1, 1, 1)

// Safety: ensure WEAPONS.ak47 is defined before decomposing
if (WEAPONS.ak47 && WEAPONS.ak47.tppOffset) {
  WEAPONS.ak47.tppOffset.decompose(_gripPos, _gripQuat, _gripScale)
} else {
  dlog('[EnemyWeapon] WARNING: WEAPONS.ak47.tppOffset not initialized at module load time')
}

/** Kick off (or reuse) the shared GLB load. Safe to call many times. */
export function preloadEnemyWeapon(): Promise<Object3D> {
  if (_loadOnce) return _loadOnce
  _loadOnce = loadTemplate()
  return _loadOnce
}

async function loadTemplate(): Promise<Object3D> {
  try {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(WEAPONS.ak47.modelUrl)
    const raw = gltf.scene
    raw.updateMatrixWorld(true)

    // Normalize to longest-axis = 1 unit + centered, mirroring WeaponRenderer so
    // the shared ak47 tppOffset scale (meters) applies identically.
    const bbox = new Box3().setFromObject(raw)
    const size = new Vector3()
    bbox.getSize(size)
    const longest = Math.max(size.x, size.y, size.z)
    const center = new Vector3()
    bbox.getCenter(center)

    const normalizer = new Group()
    normalizer.scale.setScalar(longest > 0 ? 1 / longest : 1)
    raw.position.sub(center)
    normalizer.add(raw)
    normalizer.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).castShadow = true
    })
    _template = normalizer
    dlog('[EnemyWeapon] ak47.glb loaded + normalized')
  } catch {
    dlog('[EnemyWeapon] ak47.glb missing — using placeholder box')
    _template = buildPlaceholderGun()
  }
  return _template
}

/**
 * Attach a gun to `hand` and return the muzzle tip object. Uses a clone of the
 * shared ak47 model if it has finished loading; otherwise a placeholder box. Call
 * `preloadEnemyWeapon()` during setup so the template is ready before spawns.
 */
export function attachEnemyGun(hand: Object3D): Object3D {
  if (_template) {
    // Real GLB clone: apply the same grip transform the player's TPP rifle uses.
    const gun = cloneSkeleton(_template)
    gun.position.copy(_gripPos)
    gun.quaternion.copy(_gripQuat)
    gun.scale.copy(_gripScale)
    hand.add(gun)
    const muzzle = new Object3D()
    muzzle.position.set(0, 0, 0.52) // forward end of the normalized model
    gun.add(muzzle)
    return muzzle
  }
  // Placeholder box keeps its own self-contained orientation.
  const gun = buildPlaceholderGun()
  hand.add(gun)
  const muzzle = new Object3D()
  muzzle.position.set(0, 0, 0.52)
  gun.add(muzzle)
  return muzzle
}

/** Primitive rifle fallback (the previous `buildGun`), used when the GLB is absent. */
function buildPlaceholderGun(): Object3D {
  const gun = new Object3D()
  const bodyMat = new MeshStandardMaterial({ color: 0x222428, roughness: 0.5, metalness: 0.3 })
  const barrel = new Mesh(new BoxGeometry(0.05, 0.05, 0.5), bodyMat)
  barrel.position.set(0, 0, 0.25)
  barrel.castShadow = true
  gun.add(barrel)
  const stock = new Mesh(new BoxGeometry(0.06, 0.12, 0.18), bodyMat)
  stock.position.set(0, -0.04, -0.05)
  gun.add(stock)
  gun.rotation.set(0, MathUtils.degToRad(90), 0)
  return gun
}
