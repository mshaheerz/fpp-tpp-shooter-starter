import {
  WebGLRenderer,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene as ThreeScene,
  ACESFilmicToneMapping,
  ColorManagement,
} from 'three'

/**
 * Owns the WebGL renderer + the 2D HUD canvas overlay.
 *
 * Render targets:
 *   - 3D: WebGLRenderer at devicePixelRatio (capped at 2) for the game scene.
 *   - 2D: A separate full-window <canvas id="hud"> for crosshair / ammo text.
 */
export class Renderer {
  readonly gl: WebGLRenderer
  readonly hudCanvas: HTMLCanvasElement
  readonly hudCtx: CanvasRenderingContext2D

  constructor() {
    ColorManagement.enabled = true

    const appEl = document.getElementById('app')!
    this.gl = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.gl.setSize(window.innerWidth, window.innerHeight)
    this.gl.shadowMap.enabled = true
    this.gl.shadowMap.type = PCFSoftShadowMap
    this.gl.toneMapping = ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1.0
    appEl.appendChild(this.gl.domElement)

    this.hudCanvas = document.getElementById('hud') as HTMLCanvasElement
    this.hudCanvas.width = window.innerWidth
    this.hudCanvas.height = window.innerHeight
    this.hudCtx = this.hudCanvas.getContext('2d')!

    window.addEventListener('resize', () => this.onResize())
  }

  attachCamera(camera: PerspectiveCamera) {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  }

  render(scene: ThreeScene, camera: PerspectiveCamera) {
    this.gl.render(scene, camera)
  }

  private onResize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.gl.setSize(w, h)
    this.hudCanvas.width = w
    this.hudCanvas.height = h
  }

  get domElement(): HTMLCanvasElement {
    return this.gl.domElement
  }
}
