import {
  AnimationClip,
  AnimationUtils,
  Box3,
  Mesh,
  Object3D,
  SkinnedMesh,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { CharacterDefinition } from './characterRegistry'
import { findBoneByAnySuffix } from './rigHelpers'

/**
 * Loaded-once character assets. The skinned base mesh is kept as a TEMPLATE; the
 * pool clones it (via SkeletonUtils) per spawn. AnimationClips are immutable
 * track data and are SHARED across every clone's mixer — `clipAction` binds them
 * to whatever skeleton the mixer is rooted on, by bone name, so one clip drives
 * the player and all enemies without copying.
 *
 * This mirrors the processing `ThirdPersonCharacter.load()` does (rescale to
 * ~1.8 m, strip Hips drift, synthesize the additive jump leg-tuck) so cloned
 * enemy rigs animate identically to the player character.
 */
export interface CharacterAssets {
  /** Template skinned root (already rescaled). Clone this — never add it to the scene directly. */
  baseRoot: Object3D
  /** logical name → processed clip (shared). */
  clips: Map<string, AnimationClip>
  /** Distance from the GLB origin down to the feet (for capsule-bottom placement). */
  feetOffset: number
}

const OVERLAY_NAMES = new Set(['firing_rifle', 'reload_rifle', 'aim_idle', 'knife_stab'])

/** Clips authored with a deliberately LOWERED pelvis (the feet stay planted while
 *  the hips drop). For these we must NOT snap the Hips back to the standing bind
 *  height — that would lift the pelvis to standing level while the legs remain
 *  folded, leaving the feet dangling in mid-air. We keep their absolute authored
 *  Hips Y and only zero the horizontal (X/Z) drift. */
function isLoweredPelvisClip(name: string): boolean {
  return /crouch/i.test(name)
}

/** Strip/zero Hips position drift the same way ThirdPersonCharacter does. */
function processClipTracks(name: string, clip: AnimationClip, bindHipsY: number) {
  const isOverlay = OVERLAY_NAMES.has(name)
  const keepAbsoluteY = isLoweredPelvisClip(name)
  clip.tracks = clip.tracks.filter((track) => {
    if (!track.name.endsWith('.position')) return true
    if (!/Hips/i.test(track.name)) return true
    if (isOverlay) return false
    if (track.values && track.values.length % 3 === 0) {
      const v = track.values as Float32Array
      const firstY = v[1] ?? bindHipsY
      for (let i = 0; i < v.length; i += 3) {
        v[i] = 0
        // Crouch clips keep their authored (low) pelvis height so the feet stay
        // on the ground; everything else re-anchors to the standing bind height.
        v[i + 1] = keepAbsoluteY ? v[i + 1] : bindHipsY + (v[i + 1] - firstY)
        v[i + 2] = 0
      }
    }
    return true
  })
}

/** Legs-only additive (jump leg-tuck), identical to ThirdPersonCharacter's. */
function buildLegsOnlyAdditive(source: AnimationClip, name: string): AnimationClip {
  const clone = source.clone()
  clone.name = name
  clone.tracks = clone.tracks.filter(
    (track) => /(UpLeg|Leg|Foot|Toe)/i.test(track.name) && !/Hips/i.test(track.name),
  )
  AnimationUtils.makeClipAdditive(clone)
  return clone
}

/**
 * Load the Mixamo base mesh + every animation clip once. Returns a template to
 * clone from. Throws if the base mesh can't be loaded (caller falls back to the
 * placeholder humanoid).
 */
export async function loadCharacterAssets(definition: CharacterDefinition): Promise<CharacterAssets> {
  const loader = new GLTFLoader()
  const baseGltf = await loader.loadAsync(definition.base)
  const baseRoot = baseGltf.scene
  baseRoot.traverse((o) => {
    if ((o as Mesh).isMesh) {
      const m = o as Mesh
      m.castShadow = true
      m.receiveShadow = true
      if ((m as SkinnedMesh).isSkinnedMesh) m.frustumCulled = false
    }
  })

  // Normalize differently-authored rigs to the same gameplay height.
  baseRoot.updateMatrixWorld(true)
  const bbox = new Box3().setFromObject(baseRoot)
  const rawHeight = bbox.max.y - bbox.min.y
  if (rawHeight > 0.0001) {
    const normalizedScale = definition.targetHeight ? definition.targetHeight / rawHeight : 1
    const scale = normalizedScale * (definition.scaleMultiplier ?? 1)
    baseRoot.scale.multiplyScalar(scale)
    baseRoot.updateMatrixWorld(true)
    bbox.setFromObject(baseRoot)
  }
  const feetOffset = -bbox.min.y + (definition.groundOffset ?? 0)
  const bindHipsY =
    findBoneByAnySuffix(baseRoot, ['Hips', 'mixamorigHips'])?.position.y ?? 0

  const clips = new Map<string, AnimationClip>()
  const entries = Object.entries(definition.animations)
  const loaded = await Promise.all(
    entries.map(async ([name, path]) => {
      try {
        const gltf = await loader.loadAsync(path)
        const clip: AnimationClip | undefined =
          gltf.animations.find((c) => c && c.tracks && c.tracks.length > 0) ?? gltf.animations[0]
        if (clip && clip.tracks && clip.tracks.length > 0) return [name, clip] as const
      } catch (e) {
        console.warn('[characterAssets] failed to load anim', name, path, e)
      }
      return [name, null] as const
    }),
  )
  for (const [name, clip] of loaded) {
    if (!clip) continue
    processClipTracks(name, clip, bindHipsY)
    clips.set(name, clip)
  }

  // Synthesize additive air layers (shared across clones).
  const jump = clips.get('jump')
  if (jump) clips.set('jump_air', buildLegsOnlyAdditive(jump, 'jump_air'))
  const pistolJump = clips.get('pistol_jump')
  if (pistolJump) clips.set('pistol_jump_air', buildLegsOnlyAdditive(pistolJump, 'pistol_jump_air'))

  return { baseRoot, clips, feetOffset }
}
