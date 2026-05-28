import {
  Bone,
  Box3,
  Group,
  Object3D,
  Vector3,
  MathUtils,
  AnimationClip,
  AnimationUtils,
  Mesh,
  SkinnedMesh,
  BoxGeometry,
  MeshStandardMaterial,
  CapsuleGeometry,
  Quaternion,
  Euler,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CharacterAnimator, type LocomotionState } from './CharacterAnimator'

export interface AnimationManifest {
  /** Path to the rigged base mesh GLB ("Y Bot" from Mixamo, WITH SKIN). */
  base: string
  /** Map of logical animation name → file path (Mixamo download, WITHOUT SKIN). */
  animations: Record<string, string>
}

// Three.js's GLTFLoader replaces ':' with '' in bone names by default, so the
// Mixamo bones come through as `mixamorigRightHand` / `mixamorigSpine1` etc.
// `findBoneByAnySuffix` accepts both forms.

const _euler = new Euler(0, 0, 0, 'YXZ')
const _q = new Quaternion()
const _q2 = new Quaternion()
const _forward = new Vector3()

// Sit between WALK_SPEED (1.5) and RUN_SPEED (5.5): anything above ~3 m/s
// counts as a jog/run for animation purposes. Below MOVE_SPEED_THRESHOLD the
// character returns to idle.
const RUN_SPEED_THRESHOLD = 3.0
const MOVE_SPEED_THRESHOLD = 0.3
const YAW_LERP_RATE = 8

/**
 * Visual-only TPP character. Follows the physics capsule transform and applies
 * Mixamo animations via `CharacterAnimator`.
 *
 *   - `load(manifest)` loads Y Bot + each animation GLB; the first clip in each
 *     animation file is registered under its logical name.
 *   - `update(playerPos, vel, grounded, dt)` copies position, slerps yaw toward
 *     movement direction, picks a locomotion state, and steps the mixer.
 *   - `applySpineAim(pitch)` runs AFTER `mixer.update()` and adds rotation to
 *     Spine1+Spine2 toward the camera pitch so the rifle points at the crosshair.
 *
 * If no manifest is provided OR a load fails, a chunky placeholder humanoid is
 * built from primitives so the rest of the game still functions.
 */
export class ThirdPersonCharacter {
  /** Root group that gets added to the Three.js scene. */
  readonly object = new Group()
  /** Resolved attach point for weapon parenting. Always non-null after construction. */
  rightHand: Object3D
  spine1: Object3D | null = null
  spine2: Object3D | null = null
  /** Head bone, hidden in FPP so the camera doesn't render the inside of our own skull. */
  head: Object3D | null = null
  animator: CharacterAnimator
  /** Logical state, updated each frame from velocity. */
  locomotion: LocomotionState = 'idle'
  /** Last state held while grounded. Used to keep the upper-body stance during
   *  the airborne window (so the rifle hold doesn't snap to bind pose). */
  private lastGroundedState: LocomotionState = 'idle'

  private yaw = 0
  private placeholder = true
  /** Distance from the GLB's local origin DOWN to the lowest point (the feet).
   *  Equals `-bbox.min.y` after the model is loaded and uniformly scaled.
   *  Placeholder humanoid has its feet at local y=0 → 0. */
  private feetOffset = 0

  constructor() {
    // Build a placeholder humanoid by default. `load()` replaces it.
    const ph = buildPlaceholder()
    this.object.add(ph.root)
    this.rightHand = ph.rightHand
    this.spine1 = ph.spine
    this.spine2 = ph.spine
    this.animator = new CharacterAnimator(ph.root)
  }

  async load(manifest: AnimationManifest) {
    const loader = new GLTFLoader()
    const baseGltf = await loader.loadAsync(manifest.base)
    const baseRoot = baseGltf.scene
    baseRoot.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const m = o as Mesh
        m.castShadow = true
        m.receiveShadow = true
        // Skinned meshes can be culled incorrectly when their bounding box is
        // computed from the bind pose only; skip frustum culling to be safe.
        if ((m as SkinnedMesh).isSkinnedMesh) m.frustumCulled = false
      }
    })

    // Mixamo characters export at ~180 units tall (cm). Auto-rescale so the
    // model is roughly 1.8m tall, matching the player capsule.
    baseRoot.updateMatrixWorld(true)
    const bbox = new Box3().setFromObject(baseRoot)
    const rawHeight = bbox.max.y - bbox.min.y
    if (rawHeight > 5) {
      // Almost certainly in centimeters.
      const scale = 1.8 / rawHeight
      baseRoot.scale.setScalar(scale)
      baseRoot.updateMatrixWorld(true)
      bbox.setFromObject(baseRoot)
    }
    // Compute feet offset: distance from root origin (y=0 of the GLB) down to bottom.
    this.feetOffset = -bbox.min.y

    // Replace placeholder.
    this.object.clear()
    this.object.add(baseRoot)
    this.placeholder = false

    // Find bones.
    const hand = findBoneByAnySuffix(baseRoot, ['RightHand', 'mixamorigRightHand'])
    if (hand) this.rightHand = hand
    this.spine1 = findBoneByAnySuffix(baseRoot, ['Spine1', 'mixamorigSpine1'])
    this.spine2 = findBoneByAnySuffix(baseRoot, ['Spine2', 'mixamorigSpine2'])
    this.head = findBoneByAnySuffix(baseRoot, ['Head', 'mixamorigHead'])

    // Build a fresh animator bound to the new skinned mesh root.
    this.animator = new CharacterAnimator(baseRoot)

    // Load animation clips in parallel.
    const entries = Object.entries(manifest.animations)
    const loaded = await Promise.all(
      entries.map(async ([name, path]) => {
        try {
          const gltf = await loader.loadAsync(path)
          // Prefer the first non-empty clip (some FBX exports include an empty "Take 001").
          const clip: AnimationClip | undefined = gltf.animations.find((c) => c && c.tracks && c.tracks.length > 0) ?? gltf.animations[0]
          if (clip && clip.tracks && clip.tracks.length > 0) return [name, clip] as const
        } catch (e) {
          console.warn('[character] failed to load anim', name, path, e)
        }
        return [name, null] as const
      }),
    )
    for (const [name, clip] of loaded) {
      if (!clip) continue
      // Mixamo's "in place" animations still embed a small Hips position track.
      // For overlays (firing/reload/aim) we strip ALL position tracks so when
      // they end, the root doesn't jump back. For locomotion we leave Hips Y
      // (bob) but kill XZ drift.
      const isOverlay = name === 'firing_rifle' || name === 'reload_rifle' || name === 'aim_idle' || name === 'knife_stab'
      clip.tracks = clip.tracks.filter((track) => {
        if (!track.name.endsWith('.position')) return true
        if (!/Hips/i.test(track.name)) return true
        if (isOverlay) return false
        // Locomotion: drop X and Z components by zeroing them.
        if (track.values && track.values.length % 3 === 0) {
          const v = track.values as Float32Array
          for (let i = 0; i < v.length; i += 3) {
            v[i] = 0
            v[i + 2] = 0
          }
        }
        return true
      })
      this.animator.addClip(name, clip)
    }

    // Synthesize an ADDITIVE air-layer clip from the rifle jump (and pistol jump
    // if present) — legs + hips-Y bob only. This rides on top of whatever
    // locomotion clip is active so the arms keep holding the gun and the head
    // never spins. Without this, the full-body Mixamo jump clip wrecks the
    // upper-body pose.
    const sourceJump = this.animator.getClip('jump')
    if (sourceJump) {
      this.animator.addClip('jump_air', buildLegsOnlyAdditive(sourceJump, 'jump_air'))
    }
    const sourcePistolJump = this.animator.getClip('pistol_jump')
    if (sourcePistolJump) {
      this.animator.addClip('pistol_jump_air', buildLegsOnlyAdditive(sourcePistolJump, 'pistol_jump_air'))
    }

    // Default to the rifle set; weapon swaps call useAnimationSet().
    this.useAnimationSet('rifle')
    this.animator.setLocomotion('idle')
  }

  /**
   * Swap the locomotion clip set. Called on weapon change so the character
   * stance matches (rifle hold vs pistol hold vs unarmed).
   *
   * Falls back per-state when a weapon-specific clip is missing — e.g. if
   * `pistol_jump` is absent, jump uses the rifle `jump`. Keeps the system
   * resilient to incomplete asset sets.
   */
  useAnimationSet(set: 'rifle' | 'pistol' | 'knife') {
    const has = (n: string) => this.animator.hasClip(n)
    // Pick the additive air clip that matches the weapon stance.
    const airClip =
      set === 'pistol' && has('pistol_jump_air')
        ? 'pistol_jump_air'
        : has('jump_air')
          ? 'jump_air'
          : null
    if (airClip) this.animator.bindAirAdditive(airClip)
    // Ledge bindings are shared across weapon sets — when hanging, the rifle
    // hold is irrelevant; both hands are on the ledge. Fall back to the hang
    // clip if a shimmy clip is missing.
    const ledgeBindings = has('ledge_idle')
      ? {
          ledge: 'ledge_idle' as const,
          ledgeShimmyL: (has('ledge_shimmy_left') ? 'ledge_shimmy_left' : 'ledge_idle') as string,
          ledgeShimmyR: (has('ledge_shimmy_right') ? 'ledge_shimmy_right' : 'ledge_idle') as string,
        }
      : {}
    if (set === 'knife' && has('knife_idle')) {
      // Knife pack only ships an idle + a stab. Everything else falls back to
      // the rifle locomotion clips — the character keeps moving naturally,
      // and the stab is delivered via a one-shot overlay from the weapon FSM.
      this.animator.bindLocomotion({
        idle: 'knife_idle',
        walk: 'walk_forward',
        run: 'run_forward',
        strafeL: 'strafe_left',
        strafeR: 'strafe_right',
        back: 'walk_backward',
        runBack: has('run_backward') ? 'run_backward' : 'walk_backward',
        jump: 'jump',
        fall: has('falling_to_landing') ? 'falling_to_landing' : 'jump',
        land: 'jump',
        ...ledgeBindings,
      })
      return
    }
    if (set === 'pistol' && has('pistol_idle')) {
      this.animator.bindLocomotion({
        idle: 'pistol_idle',
        walk: has('pistol_walk_forward') ? 'pistol_walk_forward' : 'walk_forward',
        run: has('pistol_run_forward') ? 'pistol_run_forward' : 'run_forward',
        strafeL: has('pistol_strafe_left') ? 'pistol_strafe_left' : 'strafe_left',
        strafeR: has('pistol_strafe_right') ? 'pistol_strafe_right' : 'strafe_right',
        back: has('pistol_walk_backward') ? 'pistol_walk_backward' : 'walk_backward',
        runBack: has('pistol_run_backward') ? 'pistol_run_backward' : 'run_backward',
        jump: has('pistol_jump') ? 'pistol_jump' : 'jump',
        fall: has('falling_to_landing') ? 'falling_to_landing' : 'jump',
        land: has('pistol_jump') ? 'pistol_jump' : 'jump',
        ...ledgeBindings,
      })
      return
    }
    // Rifle (default) set.
    this.animator.bindLocomotion({
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
      ...ledgeBindings,
    })
  }

  update(
    playerPos: Vector3,
    velocity: Vector3,
    grounded: boolean,
    cameraYaw: number,
    dt: number,
    ledge?: { mode: 'hanging' | 'climbing'; yaw: number; shimmy: -1 | 0 | 1 },
  ) {
    // LEDGE OVERRIDE: when hanging or climbing, the standard yaw-from-velocity
    // and locomotion-from-velocity logic doesn't apply — we want the character
    // to face the wall and play a dedicated state. We still pin the mesh to
    // the capsule transform so the rest of the camera/anchor code keeps working.
    if (ledge) {
      const CAPSULE_BOTTOM = 0.9
      this.object.position.set(
        playerPos.x,
        playerPos.y - CAPSULE_BOTTOM + this.feetOffset,
        playerPos.z,
      )
      // Slerp yaw toward the ledge facing instead of snapping — the snap
      // looks bad if the player grabbed at an angle. A higher rate than the
      // normal locomotion lerp so it locks in within a few frames.
      const LEDGE_YAW_RATE = 18
      const dyaw = wrapAngle(ledge.yaw - this.yaw)
      this.yaw += dyaw * Math.min(1, LEDGE_YAW_RATE * dt)
      this.object.rotation.y = this.yaw

      // Pick the locomotion state. While climbing the playOverlay covers the
      // body fully, but we still keep the ledge state underneath so when the
      // overlay finishes we fade back into the hang/standing pose cleanly.
      let next: LocomotionState = 'ledge'
      if (ledge.mode === 'hanging') {
        if (ledge.shimmy < 0) next = 'ledgeShimmyL'
        else if (ledge.shimmy > 0) next = 'ledgeShimmyR'
      }
      this.locomotion = next
      this.animator.setLocomotion(next)
      // Air-additive jump leg-tuck makes no sense on a ledge — kill it.
      this.animator.setAir(false)
      this.animator.update(dt)
      return
    }

    // (rest of the normal-mode update follows)
    // Place the character so its feet sit at the capsule bottom.
    //   capsule bottom (world Y) = playerPos.y - 0.9
    //   mesh feet (world Y)      = object.y + bbox.min.y
    //                            = object.y - feetOffset            (since feetOffset = -bbox.min.y)
    //   solve: object.y = playerPos.y - 0.9 + feetOffset
    // For the placeholder humanoid (feet at local y=0) feetOffset is 0 — same formula.
    const CAPSULE_BOTTOM = 0.9
    this.object.position.set(
      playerPos.x,
      playerPos.y - CAPSULE_BOTTOM + this.feetOffset,
      playerPos.z,
    )

    // Yaw: character must face AWAY from the camera (we want to see their back).
    // Mixamo exports characters facing +Z; camera looks down -Z when cam.yaw=0,
    // so a character at rotation.y=π has its +Z rotated to -Z (face away). The
    // movement-direction case naturally produces this: pressing W with cam.yaw=0
    // yields velocity (0,0,-speed) → atan2(0,-speed)=π. So when MOVING, use
    // atan2(vx,vz); when IDLE, use cameraYaw + π for the same effect.
    const speedSq = velocity.x * velocity.x + velocity.z * velocity.z
    let targetYaw = this.yaw
    if (speedSq > MOVE_SPEED_THRESHOLD * MOVE_SPEED_THRESHOLD) {
      targetYaw = Math.atan2(velocity.x, velocity.z)
    } else {
      targetYaw = cameraYaw + Math.PI
    }
    
    // Wrap-aware lerp.
    const delta = wrapAngle(targetYaw - this.yaw)
    this.yaw += delta * Math.min(1, YAW_LERP_RATE * dt)
    this.object.rotation.y = this.yaw

    // Locomotion state from velocity (in character local space).
    // Three.js rotation +Y by θ sends +X→(cos θ,0,sin θ) and +Z→(sin θ,0,cos θ).
    _forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    const fwdSpeed = velocity.x * _forward.x + velocity.z * _forward.z
    const rightX = Math.cos(this.yaw)
    const rightZ = Math.sin(this.yaw)
    const rightSpeed = velocity.x * rightX + velocity.z * rightZ
    const horizSpeed = Math.sqrt(speedSq)
    let next: LocomotionState
    if (!grounded) {
      // Airborne: keep whatever ground locomotion was active. Mixamo's full-body
      // jump clip fights the rifle hold and snaps the arms to bind-pose
      // (T-pose-ish) plus spins the head 360° because of a quaternion sign
      // flip on the Head track. Reusing the ground stance during the airborne
      // window keeps the upper body holding the gun — the capsule rising and
      // falling gives the visual sense of the jump on its own. This is the
      // same trick most modern FPS games use (Apex, Valorant, etc).
      next = this.lastGroundedState
    } else {
      if (horizSpeed < MOVE_SPEED_THRESHOLD) {
        next = 'idle'
      } else if (Math.abs(rightSpeed) > Math.abs(fwdSpeed)) {
        next = rightSpeed > 0 ? 'strafeR' : 'strafeL'
      } else if (fwdSpeed < -MOVE_SPEED_THRESHOLD) {
        // Backwards: sprint variant if moving fast enough.
        next = horizSpeed > RUN_SPEED_THRESHOLD ? 'runBack' : 'back'
      } else if (horizSpeed > RUN_SPEED_THRESHOLD) {
        next = 'run'
      } else {
        next = 'walk'
      }
      // Remember the last grounded state so airborne can fall back to it.
      this.lastGroundedState = next
    }
    this.locomotion = next
    this.animator.setLocomotion(next)
    // Layer the additive jump (legs only) while airborne so the user actually
    // sees a jump — legs tuck, then extend — while the locomotion-driven upper
    // body keeps holding the gun.
    this.animator.setAir(!grounded)

    this.animator.update(dt)
  }

  /**
   * Add upper-body aim by additively rotating spine bones toward the camera pitch.
   * Must be called AFTER `update()` so the additive rotation isn't overwritten
   * by the next mixer pass.
   */
  applySpineAim(pitch: number) {
    // Mixamo's Spine1 / Spine2 have their local +X pointing to the character's
    // LEFT side, so a positive X-rotation tilts the chest forward/down. The
    // camera's `pitch` is positive when looking UP — so we need a NEGATIVE
    // sign on the rotation to make "look up" bend the chest up.
    const split = MathUtils.clamp(pitch, -Math.PI / 3, Math.PI / 3) * 0.5
    if (this.spine1) {
      _euler.set(-split, 0, 0, 'YXZ')
      _q.setFromEuler(_euler)
      _q2.copy(this.spine1.quaternion).multiply(_q)
      this.spine1.quaternion.copy(_q2)
    }
    if (this.spine2 && this.spine2 !== this.spine1) {
      _euler.set(-split, 0, 0, 'YXZ')
      _q.setFromEuler(_euler)
      _q2.copy(this.spine2.quaternion).multiply(_q)
      this.spine2.quaternion.copy(_q2)
    }
  }

  get isPlaceholder(): boolean {
    return this.placeholder
  }

  /**
   * Show / hide the head bone. Scaling to ~0 collapses the head + hair geometry
   * to a point inside the neck, so in FPP you don't see the back of your own
   * head / face from inside. Restoring scale brings them back for TPP.
   *
   * (We can't just toggle visibility on the SkinnedMesh — all bones share one
   *  mesh — so we scale the bone instead, which is a clean per-bone hide.)
   */
  setHeadVisible(visible: boolean) {
    if (!this.head) return
    const s = visible ? 1 : 0.0001
    this.head.scale.setScalar(s)
  }

  /** World position of the head bone — used as the FPP eye anchor so the camera
   *  rides the character's head bob naturally. Returns null if no head bone. */
  getHeadWorldPosition(out: Vector3): Vector3 | null {
    if (!this.head) return null
    this.head.getWorldPosition(out)
    return out
  }
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function findBoneByAnySuffix(root: Object3D, suffixes: string[]): Bone | null {
  let found: Bone | null = null
  root.traverse((o) => {
    if (found) return
    const b = o as Bone
    if (b.isBone || (o as any).type === 'Bone') {
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

/**
 * Build an additive clip that contains only the lower-body tracks from `source`
 * (UpLeg / Leg / Foot / Toe + Hips Y bob). The intent is to layer this on top
 * of locomotion while airborne, so:
 *   - the legs tuck/extend visibly as the character jumps and falls;
 *   - the arms, spine, neck and head stay driven by whatever locomotion clip
 *     was running, so the rifle hold is preserved;
 *   - the Hips Y track adds the small vertical bob the jump anim has baked in.
 *
 * Frame 0 of `source` is used as the reference pose for `makeClipAdditive` —
 * the first frame of Mixamo's jump is essentially the bind pose, so the
 * additive delta starts at zero and ramps in cleanly when faded to weight 1.
 */
function buildLegsOnlyAdditive(source: AnimationClip, name: string): AnimationClip {
  const clone = source.clone()
  clone.name = name
  // Keep ONLY the leg chain. We deliberately drop Hips entirely — additive deltas
  // on Hips.rotation propagate down the whole skeleton (it's the root bone), so
  // any tilt baked into the jump clip's hips would visibly drag the chest,
  // arms and head with it and visually conflict with the locomotion clip
  // that's still driving those bones. Vertical hip-bob isn't worth that cost.
  clone.tracks = clone.tracks.filter((track) =>
    /(UpLeg|Leg|Foot|Toe)/i.test(track.name) && !/Hips/i.test(track.name),
  )
  AnimationUtils.makeClipAdditive(clone)
  return clone
}

/**
 * Stylized humanoid built from primitives. Used when no Mixamo GLB is loaded.
 * The "right hand" is a small cube whose transform is suitable for weapon attach.
 */
function buildPlaceholder() {
  const root = new Group()
  const mat = new MeshStandardMaterial({ color: 0xd9c39a, roughness: 0.6 })
  const matDark = new MeshStandardMaterial({ color: 0x556b2f, roughness: 0.8 })

  // Torso
  const torso = new Mesh(new CapsuleGeometry(0.22, 0.5, 4, 8), matDark)
  torso.position.y = 1.05
  torso.castShadow = true
  root.add(torso)

  // Head
  const head = new Mesh(new BoxGeometry(0.28, 0.28, 0.28), mat)
  head.position.y = 1.6
  head.castShadow = true
  root.add(head)

  // Spine attach (proxy bone for aim)
  const spine = new Object3D()
  spine.position.y = 1.2
  root.add(spine)

  // Arms
  const armGeom = new BoxGeometry(0.13, 0.55, 0.13)
  const lArm = new Mesh(armGeom, matDark)
  lArm.position.set(-0.32, 1.05, 0)
  lArm.castShadow = true
  root.add(lArm)
  const rArm = new Mesh(armGeom, matDark)
  rArm.position.set(0.32, 1.05, 0)
  rArm.castShadow = true
  root.add(rArm)

  // Right hand attach point at the bottom-front of the right arm.
  const rightHand = new Object3D()
  rightHand.position.set(0.32, 0.78, 0.15)
  // Rotate so a weapon parented here points forward.
  rightHand.rotation.set(0, -Math.PI / 2, 0)
  root.add(rightHand)

  // Legs
  const legGeom = new BoxGeometry(0.18, 0.8, 0.18)
  const lLeg = new Mesh(legGeom, mat)
  lLeg.position.set(-0.12, 0.42, 0)
  lLeg.castShadow = true
  root.add(lLeg)
  const rLeg = new Mesh(legGeom, mat)
  rLeg.position.set(0.12, 0.42, 0)
  rLeg.castShadow = true
  root.add(rLeg)

  return { root, spine, rightHand }
}
