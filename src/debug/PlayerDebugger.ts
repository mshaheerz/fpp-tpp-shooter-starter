import { Vector3 } from 'three'
import type { Player } from '../Player'

export class PlayerDebugger {
  private root: HTMLDivElement
  private output: HTMLPreElement
  private inputs: Record<string, HTMLInputElement> = {}
  private running = true

  constructor(private player: Player) {
    document.getElementById('__player_debugger')?.remove()
    this.root = document.createElement('div')
    this.root.id = '__player_debugger'
    this.root.style.cssText = [
      'position:fixed',
      'top:12px',
      'left:12px',
      'width:300px',
      'max-height:75vh',
      'overflow:auto',
      'padding:10px',
      'background:rgba(12,14,18,0.92)',
      'color:#e8edf2',
      'font:12px/1.35 monospace',
      'border:1px solid #2b3240',
      'border-radius:8px',
      'z-index:99999',
      'box-shadow:0 10px 30px rgba(0,0,0,0.35)',
    ].join(';')

    const heading = document.createElement('div')
    heading.textContent = 'Player Debugger (F7 hide/show)'
    heading.style.cssText = 'font-weight:700;margin-bottom:8px'
    this.root.appendChild(heading)

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
    actions.appendChild(this.button('Toggle DebugMesh', () => this.toggleDebugMesh()))
    actions.appendChild(this.button('Force Jump', () => this.forceJump()))
    this.root.appendChild(actions)

    this.output = document.createElement('pre')
    this.output.style.cssText = 'margin-top:10px;padding:8px;background:#0a0d12;border-radius:6px;white-space:pre-wrap'
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
    this.root.style.display = this.root.style.display === 'none' ? 'block' : 'none'
  }

  private row(key: string, label: string): HTMLDivElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px'
    const l = document.createElement('label')
    l.textContent = label
    l.style.cssText = 'flex:1;color:#b6c2d6'
    const input = document.createElement('input')
    input.type = 'number'
    input.value = '0'
    input.step = '0.1'
    input.style.cssText = 'width:100px;background:#131a24;color:#e8edf2;border:1px solid #364054;border-radius:4px;padding:4px 6px'
    this.inputs[key] = input
    row.appendChild(l)
    row.appendChild(input)
    return row
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.style.cssText = 'background:#1f2b3d;color:#edf3ff;border:1px solid #3d4f6c;border-radius:4px;padding:6px 8px;cursor:pointer'
    b.addEventListener('click', onClick)
    return b
  }

  private num(key: string): number {
    return Number(this.inputs[key].value) || 0
  }

  private teleport() {
    const x = this.num('posX')
    const y = this.num('posY')
    const z = this.num('posZ')
    try {
      // set body position via Rapier body API if present
      // @ts-ignore
      this.player.body.setTranslation({ x, y, z }, true)
      // zero velocity so physics doesn't immediately move us
      // @ts-ignore
      this.player.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      // also update position vector and velocity
      this.player.position.set(x, y, z)
      this.player.velocity.set(0, 0, 0)
    } catch (e) {
      console.warn('Teleport failed', e)
    }
  }

  private setVelocity() {
    const vx = this.num('velX')
    const vy = this.num('velY')
    const vz = this.num('velZ')
    try {
      // @ts-ignore
      this.player.body.setLinvel({ x: vx, y: vy, z: vz }, true)
      this.player.velocity.set(vx, vy, vz)
    } catch (e) {
      console.warn('Set velocity failed', e)
    }
  }

  private toggleDebugMesh() {
    try {
      (this.player.debugMesh.visible = !this.player.debugMesh.visible)
    } catch {}
  }

  private forceJump() {
    try {
      this.player.velocity.y = 5.5
      // @ts-ignore
      this.player.body.setLinvel({ x: this.player.velocity.x, y: this.player.velocity.y, z: this.player.velocity.z }, true)
    } catch (e) {
      console.warn('Force jump failed', e)
    }
  }

  private updateLoop = () => {
    if (!this.running) return
    const p = this.player
    // Don't clobber user edits: skip updating an input if it's focused.
    if (document.activeElement !== this.inputs['posX']) this.inputs['posX'].value = String(p.position.x.toFixed(3))
    if (document.activeElement !== this.inputs['posY']) this.inputs['posY'].value = String(p.position.y.toFixed(3))
    if (document.activeElement !== this.inputs['posZ']) this.inputs['posZ'].value = String(p.position.z.toFixed(3))
    if (document.activeElement !== this.inputs['velX']) this.inputs['velX'].value = String(p.velocity.x.toFixed(3))
    if (document.activeElement !== this.inputs['velY']) this.inputs['velY'].value = String(p.velocity.y.toFixed(3))
    if (document.activeElement !== this.inputs['velZ']) this.inputs['velZ'].value = String(p.velocity.z.toFixed(3))

    // Try to read internal timers if present
    // @ts-ignore
    const coyote = typeof p.coyoteTimer === 'number' ? p.coyoteTimer.toFixed(3) : 'n/a'
    // @ts-ignore
    const jbuf = typeof p.jumpBuffer === 'number' ? p.jumpBuffer.toFixed(3) : 'n/a'
    const grounded = Boolean(p.grounded)
    this.output.textContent = `grounded: ${grounded}\ncoyote: ${coyote}\njumpBuffer: ${jbuf}`

    requestAnimationFrame(this.updateLoop)
  }
}

export default PlayerDebugger
