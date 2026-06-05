import { Object3D } from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { CharacterAnimator } from '../character/CharacterAnimator'
import { loadCharacterAssets, type CharacterAssets } from '../character/characterAssets'
import type { CharacterDefinition } from '../character/characterRegistry'
import { findBoneByAnySuffix, buildPlaceholderHumanoid } from '../character/rigHelpers'
import { bindRifleLocomotion } from '../character/locomotionBindings'

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

/**
 * Loads the Mixamo character ONCE and hands out cloned rigs. Falls back to a
 * primitive placeholder humanoid (cloned per spawn) when no manifest is
 * available, preserving the repo's "works without assets" guarantee.
 */
export class CharacterPool {
  private assets: CharacterAssets | null = null
  private ready = false
  private characterId: string | null = null

  /** Load shared assets. Safe to call once; later calls are no-ops. Never throws —
   *  on failure the pool produces placeholder rigs. */
  async init(definition: CharacterDefinition) {
    if (this.ready && this.characterId === definition.id) return
    try {
      this.assets = await loadCharacterAssets(definition)
      this.characterId = definition.id
    } catch (e) {
      console.warn('[CharacterPool] using placeholder rigs — no Mixamo assets', e)
      this.assets = null
      this.characterId = null
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
    animator.setLocomotion('idle')
    // Force an immediate update on the mixer so the rig starts in the idle pose
    // instead of T-pose for the first frame.
    animator.update(0)

    return {
      object,
      animator,
      rightHand,
      feetOffset: this.assets.feetOffset,
      placeholder: false,
    }
  }

  private spawnPlaceholderRig(): CharacterRig {
    const ph = buildPlaceholderHumanoid({ skin: 0xc08457, cloth: 0x8a3b3b, withSpine: false })
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
