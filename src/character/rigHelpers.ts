import {
  Bone,
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'

/**
 * Depth-first search for the first `Bone` whose name equals or ends with any of
 * `suffixes`. Used to locate Mixamo bones (e.g. `mixamorigRightHand`) regardless
 * of whether GLTFLoader stripped the `:` from `mixamorig:RightHand`.
 */
export function findBoneByAnySuffix(root: Object3D, suffixes: string[]): Bone | null {
  let found: Bone | null = null
  root.traverse((o) => {
    if (found) return
    const b = o as Bone
    if (b.isBone || (o as { type?: string }).type === 'Bone') {
      for (const s of suffixes) {
        if (b.name === s || b.name.endsWith(s)) {
          found = b
          return
        }
      }
    }
  })
  return found
}

export interface PlaceholderHumanoid {
  root: Group
  /** Weapon attach point at the right hand (a weapon parented here points forward). */
  rightHand: Object3D
  /** Aim proxy at chest height — present only when `withSpine` was requested. */
  spine?: Object3D
}

/**
 * Stylized humanoid built from primitives, used when no Mixamo GLB is available.
 * Colors are parameterized so the player and enemies can be visually distinct.
 * `withSpine` adds a chest-height proxy `Object3D` for additive aim (the player
 * needs it; cloned enemy rigs don't).
 */
export function buildPlaceholderHumanoid(opts: {
  skin: number
  cloth: number
  withSpine: boolean
}): PlaceholderHumanoid {
  const root = new Group()
  const skin = new MeshStandardMaterial({ color: opts.skin, roughness: 0.6 })
  const cloth = new MeshStandardMaterial({ color: opts.cloth, roughness: 0.8 })

  const torso = new Mesh(new CapsuleGeometry(0.22, 0.5, 4, 8), cloth)
  torso.position.y = 1.05
  torso.castShadow = true
  root.add(torso)

  const head = new Mesh(new BoxGeometry(0.28, 0.28, 0.28), skin)
  head.position.y = 1.6
  head.castShadow = true
  root.add(head)

  let spine: Object3D | undefined
  if (opts.withSpine) {
    spine = new Object3D()
    spine.position.y = 1.2
    root.add(spine)
  }

  const armGeom = new BoxGeometry(0.13, 0.55, 0.13)
  const lArm = new Mesh(armGeom, cloth)
  lArm.position.set(-0.32, 1.05, 0)
  lArm.castShadow = true
  root.add(lArm)
  const rArm = new Mesh(armGeom, cloth)
  rArm.position.set(0.32, 1.05, 0)
  rArm.castShadow = true
  root.add(rArm)

  // Right hand attach point at the bottom-front of the right arm.
  const rightHand = new Object3D()
  rightHand.position.set(0.32, 0.78, 0.15)
  rightHand.rotation.set(0, -Math.PI / 2, 0)
  root.add(rightHand)

  const legGeom = new BoxGeometry(0.18, 0.8, 0.18)
  const lLeg = new Mesh(legGeom, skin)
  lLeg.position.set(-0.12, 0.42, 0)
  lLeg.castShadow = true
  root.add(lLeg)
  const rLeg = new Mesh(legGeom, skin)
  rLeg.position.set(0.12, 0.42, 0)
  rLeg.castShadow = true
  root.add(rLeg)

  return { root, rightHand, spine }
}
