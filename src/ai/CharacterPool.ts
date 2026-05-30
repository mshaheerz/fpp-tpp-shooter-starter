import {
  Bone,
  Object3D,
  Group,
  Mesh,
  BoxGeometry,
  CapsuleGeometry,
  MeshStandardMaterial,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { CharacterAnimator } from '../character/CharacterAnimator'
import type { AnimationManifest } from '../character/ThirdPersonCharacter'
import { loadCharacterAssets, type CharacterAssets } from '../character/characterAssets'

/**
 * A single cloned character instance for an enemy: its own scene object, bones,
 * and animator (sharing the pool's clips). This is the AI-facing equivalent of
 * `ThirdPersonCharacter` but without the FPP/camera/ledge/weapon-FSM coupling.
 */
export interface CharacterRig {
  /** Add this to the scene. */
  readonly object: Object3D
  readonly animator: CharacterAnimator
  /** Weapon attach bone (right hand) — non-null (placeholder proxy if no rig). */
  readonly rightHand: Object3D
  /** Distance from object origin down to feet (capsule-bottom placement). */
  readonly feetOffset: number
  /** True if this is the primitive placeholder (no Mixamo assets). */
  readonly placeholder: boolean
}

function findBoneByAnySuffix(root: Object3D, suffixes: string[]): Bone | null {
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

/** Bind the rifle locomotion set on a freshly-created animator. Enemies use the
 *  rifle stance; weapon-specific stances aren't needed for bots. */
function bindRifleLocomotion(animator: CharacterAnimator) {
  const has = (n: string) => animator.hasClip(n)
  if (has('jump_air')) animator.bindAirAdditive('jump_air')
  animator.bindLocomotion({
    idle: 'idle',
    walk: 'walk_forward',
    run: 'run_forward',
    strafeL: 'strafe_left',
    strafeR: 'strafe_right',
    back: 'walk_backward',
    runBack: has('run_backward') ? 'run_backward' : 'walk_backward',
    jump: 'jump',
    fall: has('falling_to_landing') ? 'falling_to_landing' : 'jump',
    land: 'jump',
  })
  animator.setLocomotion('idle')
}

/**
 * Loads the Mixamo character ONCE and hands out cloned rigs. Falls back to a
 * primitive placeholder humanoid (cloned per spawn) when no manifest is
 * available, preserving the repo's "works without assets" guarantee.
 */
export class CharacterPool {
  private assets: CharacterAssets | null = null
  private ready = false

  /** Load shared assets. Safe to call once; later calls are no-ops. Never throws —
   *  on failure the pool produces placeholder rigs. */
  async init(manifest: AnimationManifest) {
    if (this.ready) return
    try {
      this.assets = await loadCharacterAssets(manifest)
    } catch (e) {
      console.warn('[CharacterPool] using placeholder rigs — no Mixamo assets', e)
      this.assets = null
    }
    this.ready = true
  }

  get usingPlaceholder(): boolean {
    return !this.assets
  }

  /** Produce a new independent rig (cloned mesh + own animator). */
  spawnRig(): CharacterRig {
    if (!this.assets) return this.spawnPlaceholderRig()

    const object = cloneSkeleton(this.assets.baseRoot)
    const rightHand =
      findBoneByAnySuffix(object, ['RightHand', 'mixamorigRightHand']) ?? object

    const animator = new CharacterAnimator(object)
    for (const [name, clip] of this.assets.clips) animator.addClip(name, clip)
    bindRifleLocomotion(animator)

    return {
      object,
      animator,
      rightHand,
      feetOffset: this.assets.feetOffset,
      placeholder: false,
    }
  }

  private spawnPlaceholderRig(): CharacterRig {
    const ph = buildPlaceholder()
    const animator = new CharacterAnimator(ph.root)
    // No clips to bind; the placeholder simply stands. Enemies still move via
    // the capsule, so the box humanoid slides along — acceptable for a fallback.
    return {
      object: ph.root,
      animator,
      rightHand: ph.rightHand,
      feetOffset: 0,
      placeholder: true,
    }
  }
}

/** Reddish placeholder humanoid so enemies are visually distinct from the
 *  player's tan placeholder, when no Mixamo assets are present. */
function buildPlaceholder(): { root: Group; rightHand: Object3D } {
  const root = new Group()
  const skin = new MeshStandardMaterial({ color: 0xc08457, roughness: 0.6 })
  const cloth = new MeshStandardMaterial({ color: 0x8a3b3b, roughness: 0.8 })

  const torso = new Mesh(new CapsuleGeometry(0.22, 0.5, 4, 8), cloth)
  torso.position.y = 1.05
  torso.castShadow = true
  root.add(torso)

  const head = new Mesh(new BoxGeometry(0.28, 0.28, 0.28), skin)
  head.position.y = 1.6
  head.castShadow = true
  root.add(head)

  const armGeom = new BoxGeometry(0.13, 0.55, 0.13)
  const lArm = new Mesh(armGeom, cloth)
  lArm.position.set(-0.32, 1.05, 0)
  lArm.castShadow = true
  root.add(lArm)
  const rArm = new Mesh(armGeom, cloth)
  rArm.position.set(0.32, 1.05, 0)
  rArm.castShadow = true
  root.add(rArm)

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

  return { root, rightHand }
}
