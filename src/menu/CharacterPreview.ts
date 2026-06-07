import {
  AnimationMixer,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type Object3D,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { loadCharacterAssets, type CharacterAssets } from '../character/characterAssets'
import { getCharacterDefinition } from '../character/characterRegistry'

/**
 * A small self-contained 3D viewer for the loadout menu. Renders the currently
 * selected character into its own canvas with a slow turntable rotation and the
 * idle animation playing, so picking a character shows the *actual* rig.
 *
 * It owns a dedicated `WebGLRenderer` separate from the game renderer. The loop
 * only runs between `start()` and `stop()`, so it costs nothing during gameplay
 * (the menu calls `start()` on show and `stop()` on hide).
 *
 * Assets are loaded via the shared {@link loadCharacterAssets} (same rescaling
 * the game uses) and cached per-character so re-selecting is instant.
 */
export class CharacterPreview {
  private renderer: WebGLRenderer | null = null
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(32, 1, 0.1, 100)
  /** Spins for the turntable effect; the model is parented here. */
  private readonly turntable = new Group()
  private canvas: HTMLCanvasElement | null = null

  private current: Object3D | null = null
  private mixer: AnimationMixer | null = null
  private idleAction: AnimationAction | null = null

  /** Cache of loaded assets keyed by character id. */
  private readonly cache = new Map<string, CharacterAssets>()
  /** Guards against a stale async load swapping in after a newer selection. */
  private loadToken = 0
  private currentId: string | null = null

  private running = false
  private rafId = 0
  private lastTime = 0

  constructor() {
    this.scene.background = null
    this.scene.add(this.turntable)

    const hemi = new HemisphereLight(0xdfe8f5, 0x222018, 1.15)
    this.scene.add(hemi)

    // Warm key light from front-left, cool rim from back-right for shape.
    const key = new DirectionalLight(0xfff1d6, 2.1)
    key.position.set(2.5, 3.5, 3)
    this.scene.add(key)
    const rim = new DirectionalLight(0x8fb6ff, 1.4)
    rim.position.set(-3, 2, -2.5)
    this.scene.add(rim)
  }

  /** Attach to a canvas element. Safe to call once. */
  mount(canvas: HTMLCanvasElement) {
    if (this.renderer) return
    this.canvas = canvas
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true })
    this.renderer.setClearColor(new Color(0x000000), 0)
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.resize()
  }

  /** Match the renderer + camera to the canvas's CSS box. */
  resize() {
    if (!this.renderer || !this.canvas) return
    const w = Math.max(1, this.canvas.clientWidth)
    const h = Math.max(1, this.canvas.clientHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** Swap to a different character. Debounced via a load token; no-op if same. */
  setCharacter(id: string) {
    if (id === this.currentId && this.current) return
    this.currentId = id
    const token = ++this.loadToken

    const cached = this.cache.get(id)
    if (cached) {
      this.applyAssets(cached)
      return
    }

    const definition = getCharacterDefinition(id)
    loadCharacterAssets(definition)
      .then((assets) => {
        if (token !== this.loadToken) return // a newer selection won
        this.cache.set(id, assets)
        this.applyAssets(assets)
      })
      .catch((e) => {
        console.warn('[CharacterPreview] failed to load', id, e)
        // Graceful: leave whatever was showing (or nothing).
      })
  }

  /** Clone the template, parent it, frame the camera, and start the idle clip. */
  private applyAssets(assets: CharacterAssets) {
    // Tear down the previous model.
    if (this.current) {
      this.turntable.remove(this.current)
      this.current = null
    }
    this.idleAction?.stop()
    this.idleAction = null
    this.mixer = null

    const model = cloneSkeleton(assets.baseRoot)
    // Sit the feet on the turntable origin so all rigs share a ground plane.
    model.position.y = -bottomOf(model)
    this.turntable.add(model)
    this.current = model

    const clip = assets.clips.get('idle') ?? assets.clips.values().next().value ?? null
    if (clip) {
      this.mixer = new AnimationMixer(model)
      this.idleAction = this.mixer.clipAction(clip)
      this.idleAction.play()
    }

    this.frameCamera(model)
  }

  /** Position the camera to centre the model's torso/head in view. */
  private frameCamera(model: Object3D) {
    const box = new Box3().setFromObject(model)
    const size = new Vector3()
    const center = new Vector3()
    box.getSize(size)
    box.getCenter(center)

    const height = Math.max(0.5, size.y)
    // Aim a touch above centre (toward chest/face), pull back to fit the height.
    const target = new Vector3(center.x, center.y + height * 0.12, center.z)
    const fovRad = (this.camera.fov * Math.PI) / 180
    const dist = (height * 0.62) / Math.tan(fovRad / 2)

    this.camera.position.set(target.x, target.y, target.z + dist)
    this.camera.lookAt(target)
  }

  /** Begin the render loop. Idempotent. */
  start() {
    if (this.running) return
    this.running = true
    this.lastTime = 0
    this.resize()
    const loop = (t: number) => {
      if (!this.running) return
      this.rafId = requestAnimationFrame(loop)
      const dt = this.lastTime ? Math.min(0.05, (t - this.lastTime) / 1000) : 0
      this.lastTime = t
      this.turntable.rotation.y += dt * 0.6
      this.mixer?.update(dt)
      this.renderer?.render(this.scene, this.camera)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  /** Pause the render loop (no GPU/CPU cost while stopped). Idempotent. */
  stop() {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.lastTime = 0
  }

  /** Release GPU resources. The preview is unusable after this. */
  dispose() {
    this.stop()
    this.idleAction?.stop()
    this.renderer?.dispose()
    this.renderer = null
    this.cache.clear()
  }
}

/** Distance from a model's origin down to its lowest point (for floor placement). */
function bottomOf(model: Object3D): number {
  return new Box3().setFromObject(model).min.y
}
