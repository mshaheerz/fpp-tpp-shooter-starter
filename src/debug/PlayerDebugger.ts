import type { Player } from '../Player'

/**
 * On-screen player debugger.
 *
 *   - F7 toggles the panel. Because the game holds Pointer Lock (mouse
 *     captured), the panel's buttons and number fields are unusable while
 *     locked — so showing the panel *exits* pointer lock, and hiding it
 *     re-locks the canvas. That's the one change that makes the whole thing
 *     actually clickable.
 *   - Teleport / Set Velocity / Force Jump go through the Player's public debug
 *     helpers (teleport / setVelocity / launch) so the values persist instead of
 *     being clobbered by the next physics read.
 *   - Live readouts: position, velocity, grounded, mode, crouch, capsule size.
 *   - Height / radius / eye-height fields tune the capsule at runtime.
 */
export class PlayerDebugger {
  private root: HTMLDivElement
  private output: HTMLPreElement
  private inputs: Record<string, HTMLInputElement> = {}
  private running = true
  private visible = false
  private canvas: HTMLCanvasElement | null

  constructor(private player: Player) {
    // The WebGL canvas (inside #app) is the pointer-lock target — NOT the HUD
    // overlay canvas. Re-lock onto it when the panel closes.
    this.canvas = document.querySelector('#app canvas') as HTMLCanvasElement | null

    document.getElementById('__player_debugger')?.remove()
    this.root = document.createElement('div')
    this.root.id = '__player_debugger'
    this.root.style.cssText = [
      'position:fixed',
      'top:12px',
      'left:12px',
      'width:300px',
      'max-height:88vh',
      'overflow:auto',
      'padding:10px',
      'background:rgba(12,14,18,0.92)',
      'color:#e8edf2',
      'font:12px/1.35 monospace',
      'border:1px solid #2b3240',
      'border-radius:8px',
      'z-index:99999',
      'box-shadow:0 10px 30px rgba(0,0,0,0.35)',
      'display:none',
    ].join(';')

    const heading = document.createElement('div')
    heading.textContent = 'Player Debugger — F7 to toggle'
    heading.style.cssText = 'font-weight:700;margin-bottom:8px'
    this.root.appendChild(heading)

    const hint = document.createElement('div')
    hint.textContent = 'Mouse is released while this is open. Press F7 to resume.'
    hint.style.cssText = 'color:#8a93a6;margin-bottom:10px;font-size:11px'
    this.root.appendChild(hint)

    this.root.appendChild(this.section('Transform'))
    this.root.appendChild(this.row('posX', 'Pos X'))
    this.root.appendChild(this.row('posY', 'Pos Y'))
    this.root.appendChild(this.row('posZ', 'Pos Z'))
    this.root.appendChild(this.row('velX', 'Vel X'))
    this.root.appendChild(this.row('velY', 'Vel Y'))
    this.root.appendChild(this.row('velZ', 'Vel Z'))

    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px'
    actions.appendChild(this.button('Teleport', () => this.teleport()))
    actions.appendChild(this.button('Set Velocity', () => this.setVelocity()))
    actions.appendChild(this.button('Force Jump', () => this.player.launch(5.5)))
    actions.appendChild(this.button('Toggle Mesh', () => this.toggleDebugMesh()))
    this.root.appendChild(actions)

    this.root.appendChild(this.section('Size (metres)'))
    this.root.appendChild(this.row('height', 'Stand Height', 1.82, 0.05))
    this.root.appendChild(this.row('radius', 'Radius', 0.36, 0.01))
    this.root.appendChild(this.row('eyeFrac', 'Eye Frac', 0.82, 0.01))
    const sizeActions = document.createElement('div')
    sizeActions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px'
    sizeActions.appendChild(this.button('Apply Size', () => this.applySize()))
    sizeActions.appendChild(this.button('Reset Size', () => this.resetSize()))
    this.root.appendChild(sizeActions)

    this.output = document.createElement('pre')
    this.output.style.cssText =
      'margin-top:12px;padding:8px;background:#0a0d12;border-radius:6px;white-space:pre-wrap'
    this.root.appendChild(this.output)

    document.body.appendChild(this.root)
    window.addEventListener('keydown', this.onKeyDown)
    requestAnimationFrame(this.updateLoop)
  }

  dispose() {
    this.running = false
    window.removeEventListener('keydown', this.onKeyDown)
    this.root.remove()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'F7') return
    e.preventDefault()
    this.visible = !this.visible
    if (this.visible) this.open()
    else this.close()
  }

  private open() {
    this.root.style.display = 'block'
    // Release the mouse so the panel is interactive. The game's lock-hint
    // reappears on its own via the pointerlockchange handler in InputManager.
    try {
      document.exitPointerLock()
    } catch {}
    // Seed the size fields from the live player so editing starts from truth.
    const s = this.player.debugState
    this.setIfPresent('height', s.standingHeight)
    this.setIfPresent('radius', s.radius)
    this.setIfPresent('eyeFrac', s.eyeHeightFraction)
  }

  private close() {
    this.root.style.display = 'none'
    // Re-grab the pointer so play resumes immediately.
    try {
      this.canvas?.requestPointerLock()
    } catch {}
  }

  private section(label: string): HTMLDivElement {
    const d = document.createElement('div')
    d.textContent = label
    d.style.cssText =
      'margin:12px 0 6px;color:#7fa7d9;font-weight:700;border-top:1px solid #232a36;padding-top:8px'
    return d
  }

  private row(key: string, label: string, value = 0, step = 0.1): HTMLDivElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px'
    const l = document.createElement('label')
    l.textContent = label
    l.style.cssText = 'flex:1;color:#b6c2d6'
    const input = document.createElement('input')
    input.type = 'number'
    input.value = String(value)
    input.step = String(step)
    input.style.cssText =
      'width:100px;background:#131a24;color:#e8edf2;border:1px solid #364054;border-radius:4px;padding:4px 6px'
    this.inputs[key] = input
    row.appendChild(l)
    row.appendChild(input)
    return row
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.style.cssText =
      'background:#1f2b3d;color:#edf3ff;border:1px solid #3d4f6c;border-radius:4px;padding:6px 8px;cursor:pointer'
    b.addEventListener('click', onClick)
    return b
  }

  private num(key: string): number {
    return Number(this.inputs[key].value) || 0
  }

  private setIfPresent(key: string, value: number) {
    const el = this.inputs[key]
    if (el && document.activeElement !== el) el.value = String(Number(value.toFixed(3)))
  }

  private teleport() {
    this.player.teleport(this.num('posX'), this.num('posY'), this.num('posZ'))
  }

  private setVelocity() {
    this.player.setVelocity(this.num('velX'), this.num('velY'), this.num('velZ'))
  }

  private toggleDebugMesh() {
    this.player.debugMesh.visible = !this.player.debugMesh.visible
  }

  private applySize() {
    const h = this.num('height')
    const r = this.num('radius')
    const eye = this.num('eyeFrac')
    if (r > 0) this.player.setRadius(r)
    if (h > 0) this.player.setStandingHeight(h)
    if (eye > 0) this.player.eyeHeightFraction = eye
  }

  private resetSize() {
    this.player.setRadius(0.36)
    this.player.setStandingHeight(1.82)
    this.player.eyeHeightFraction = 0.82
    this.setIfPresent('height', 1.82)
    this.setIfPresent('radius', 0.36)
    this.setIfPresent('eyeFrac', 0.82)
  }

  private updateLoop = () => {
    if (!this.running) return
    // Only refresh the DOM while visible — no point thrashing inputs when hidden.
    if (this.visible) {
      const p = this.player
      this.setIfPresent('posX', p.position.x)
      this.setIfPresent('posY', p.position.y)
      this.setIfPresent('posZ', p.position.z)
      this.setIfPresent('velX', p.velocity.x)
      this.setIfPresent('velY', p.velocity.y)
      this.setIfPresent('velZ', p.velocity.z)

      const s = p.debugState
      const speed = Math.hypot(p.velocity.x, p.velocity.z)
      this.output.textContent =
        `mode:      ${s.mode}\n` +
        `grounded:  ${s.grounded}\n` +
        `crouching: ${s.crouching}\n` +
        `h-speed:   ${speed.toFixed(2)} m/s\n` +
        `coyote:    ${s.coyoteTimer.toFixed(3)}\n` +
        `jumpBuf:   ${s.jumpBuffer.toFixed(3)}\n` +
        `height:    ${s.currentHeight.toFixed(2)} / ${s.standingHeight.toFixed(2)} m\n` +
        `radius:    ${s.radius.toFixed(2)} m`
    }
    requestAnimationFrame(this.updateLoop)
  }
}

export default PlayerDebugger
