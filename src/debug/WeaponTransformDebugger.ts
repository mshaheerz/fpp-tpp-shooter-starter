import { Euler, MathUtils, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { WEAPONS, type WeaponId } from '../weapon/WeaponData'
import type { WeaponRenderer } from '../weapon/WeaponRenderer'

const _pos = new Vector3()
const _quat = new Quaternion()
const _scl = new Vector3()
const _e = new Euler(0, 0, 0, 'XYZ')

export class WeaponTransformDebugger {
  private root: HTMLDivElement
  private title: HTMLDivElement
  private output: HTMLPreElement
  private currentId: WeaponId | null = null
  private currentObject: Object3D | null = null
  private running = true
  private readonly inputs: Record<string, HTMLInputElement> = {}

  constructor(private weapons: WeaponRenderer) {
    document.getElementById('__weapon_debugger')?.remove()
    this.root = document.createElement('div')
    this.root.id = '__weapon_debugger'
    this.root.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'width:320px',
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
    heading.textContent = 'Weapon Debugger (F8 hide/show)'
    heading.style.cssText = 'font-weight:700;margin-bottom:8px'
    this.root.appendChild(heading)

    this.title = document.createElement('div')
    this.title.textContent = 'Current: none'
    this.title.style.cssText = 'margin-bottom:8px;color:#98a4b8'
    this.root.appendChild(this.title)

    this.root.appendChild(this.createField('posX', 'Pos X', 0.01))
    this.root.appendChild(this.createField('posY', 'Pos Y', 0.01))
    this.root.appendChild(this.createField('posZ', 'Pos Z', 0.01))
    this.root.appendChild(this.createField('rotX', 'Rot X (deg)', 0.5))
    this.root.appendChild(this.createField('rotY', 'Rot Y (deg)', 0.5))
    this.root.appendChild(this.createField('rotZ', 'Rot Z (deg)', 0.5))
    this.root.appendChild(this.createField('scale', 'Scale', 0.01))

    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px'
    actions.appendChild(this.button('Read Object', () => this.pullFromObject()))
    actions.appendChild(this.button('Reset From Code', () => this.resetFromWeaponData()))
    actions.appendChild(this.button('Copy mat4', () => this.copyMat4Line()))
    this.root.appendChild(actions)

    this.output = document.createElement('pre')
    this.output.style.cssText = 'margin-top:10px;padding:8px;background:#0a0d12;border-radius:6px;white-space:pre-wrap'
    this.output.textContent = 'tppOffset: mat4([0, 0, 0], [0, 0, 0], 1),'
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

  private updateLoop = () => {
    if (!this.running) return
    const id = this.weapons.getCurrentId()
    const obj = this.weapons.getCurrentObject()
    if (id !== this.currentId || obj !== this.currentObject) {
      this.currentId = id
      this.currentObject = obj
      this.title.textContent = `Current: ${id ?? 'none'}`
      this.pullFromObject()
    }
    requestAnimationFrame(this.updateLoop)
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'F8') return
    this.root.style.display = this.root.style.display === 'none' ? 'block' : 'none'
  }

  private createField(key: string, label: string, step: number): HTMLDivElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px'
    const l = document.createElement('label')
    l.textContent = label
    l.style.cssText = 'flex:1;color:#b6c2d6'
    const input = document.createElement('input')
    input.type = 'number'
    input.value = '0'
    input.step = String(step)
    input.style.cssText =
      'width:120px;background:#131a24;color:#e8edf2;border:1px solid #364054;border-radius:4px;padding:4px 6px'
    input.addEventListener('input', () => this.applyToObject())
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

  private setNum(key: string, value: number) {
    this.inputs[key].value = String(value)
  }

  private applyToObject() {
    const obj = this.currentObject
    if (!obj) return
    obj.position.set(this.num('posX'), this.num('posY'), this.num('posZ'))
    _e.set(
      MathUtils.degToRad(this.num('rotX')),
      MathUtils.degToRad(this.num('rotY')),
      MathUtils.degToRad(this.num('rotZ')),
      'XYZ',
    )
    obj.quaternion.setFromEuler(_e)
    const s = this.num('scale')
    obj.scale.setScalar(s)
    obj.updateMatrix()
    this.updateOutput()
  }

  private pullFromObject() {
    const obj = this.currentObject
    if (!obj) return
    _e.setFromQuaternion(obj.quaternion, 'XYZ')
    this.setNum('posX', round(obj.position.x, 4))
    this.setNum('posY', round(obj.position.y, 4))
    this.setNum('posZ', round(obj.position.z, 4))
    this.setNum('rotX', round(MathUtils.radToDeg(_e.x), 3))
    this.setNum('rotY', round(MathUtils.radToDeg(_e.y), 3))
    this.setNum('rotZ', round(MathUtils.radToDeg(_e.z), 3))
    this.setNum('scale', round(obj.scale.x, 4))
    this.updateOutput()
  }

  private resetFromWeaponData() {
    const id = this.currentId
    const obj = this.currentObject
    if (!id || !obj) return
    WEAPONS[id].tppOffset.decompose(_pos, _quat, _scl)
    obj.position.copy(_pos)
    obj.quaternion.copy(_quat)
    obj.scale.copy(_scl)
    obj.updateMatrix()
    this.pullFromObject()
  }

  private updateOutput() {
    const px = round(this.num('posX'), 4)
    const py = round(this.num('posY'), 4)
    const pz = round(this.num('posZ'), 4)
    const rx = round(MathUtils.degToRad(this.num('rotX')), 4)
    const ry = round(MathUtils.degToRad(this.num('rotY')), 4)
    const rz = round(MathUtils.degToRad(this.num('rotZ')), 4)
    const s = round(this.num('scale'), 4)
    this.output.textContent = `tppOffset: mat4([${px}, ${py}, ${pz}], [${rx}, ${ry}, ${rz}], ${s}),`
  }

  private copyMat4Line() {
    const text = this.output.textContent ?? ''
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text)
    }
  }
}

function round(n: number, d: number) {
  const f = Math.pow(10, d)
  return Math.round(n * f) / f
}
