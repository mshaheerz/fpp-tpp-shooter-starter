import { DirectionalLight, AmbientLight, Vector3 } from 'three'
import type { Scene } from '../Scene'
import type { CameraRig } from '../Camera'

/**
 * Lighting Debugger — a proper HTML-based inspector panel (like WeaponTransformDebugger).
 * Provides sun direction + ambient controls with presets.
 */
export class LightingDebugger {
  private sun: DirectionalLight
  private ambient: AmbientLight
  private panel: HTMLDivElement

  constructor(
    private scene: Scene,
    private cam: CameraRig,
  ) {
    this.clearExistingLights()
    this.ambient = new AmbientLight(0xffffff, 0.3)
    scene.three.add(this.ambient)

    this.sun = new DirectionalLight(0xffeedd, 1.0)
    this.sun.position.set(20, 30, 10)
    this.sun.target.position.set(0, 0, 0)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.width = 2048
    this.sun.shadow.mapSize.height = 2048
    this.sun.shadow.camera.near = 0.5
    this.sun.shadow.camera.far = 100
    this.sun.shadow.camera.left = -40
    this.sun.shadow.camera.right = 40
    this.sun.shadow.camera.top = 40
    this.sun.shadow.camera.bottom = -40
    scene.three.add(this.sun)
    scene.three.add(this.sun.target)

    this.panel = this.createPanel()
    document.body.appendChild(this.panel)
  }

  private clearExistingLights() {
    const toRemove: any[] = []
    this.scene.three.traverse((c: any) => { if (c.type?.includes('Light')) toRemove.push(c) })
    toRemove.forEach((c: any) => this.scene.three.remove(c))
  }

  private createPanel(): HTMLDivElement {
    const div = document.createElement('div')
    div.id = 'light-debug-panel'
    div.style.cssText = `
      position:fixed; top:50px; left:10px; z-index:99999;
      background:rgba(10,12,16,0.94); border:1px solid rgba(255,255,255,0.15);
      border-radius:10px; padding:16px 18px; width:260px;
      font:12px/1.6 system-ui,sans-serif; color:#d0d4da;
    `
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:14px;font-weight:600;color:#fff;text-transform:uppercase;letter-spacing:0.05em;">Lighting Debugger</span>
        <span id="ld-close" style="cursor:pointer;color:#888;font-size:16px;" title="Close">✕</span>
      </div>

      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:#99a;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px;">Presets</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="ld-preset" data-preset="realistic">Realistic</button>
          <button class="ld-preset" data-preset="overcast">Overcast</button>
          <button class="ld-preset" data-preset="studio">Studio</button>
          <button class="ld-preset" data-preset="night">Night</button>
          <button class="ld-preset" data-preset="golden">Golden Hour</button>
          <button class="ld-preset" data-preset="harsh">Harsh Sun</button>
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:#99a;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px;">Sun Position</label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
          <div><label style="font-size:10px;color:#777;">X</label>
            <input id="ld-sx" type="range" min="-60" max="60" value="20" style="width:100%;"></div>
          <div><label style="font-size:10px;color:#777;">Y (height)</label>
            <input id="ld-sy" type="range" min="1" max="60" value="30" style="width:100%;"></div>
          <div><label style="font-size:10px;color:#777;">Z</label>
            <input id="ld-sz" type="range" min="-60" max="60" value="10" style="width:100%;"></div>
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:#99a;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px;">Sun</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div><label style="font-size:10px;color:#777;">Intensity</label>
            <input id="ld-si" type="range" min="0" max="3" step="0.1" value="1" style="width:100%;"></div>
          <div><label style="font-size:10px;color:#777;">Color</label>
            <input id="ld-sc" type="color" value="#ffeedd" style="width:100%;height:24px;"></div>
        </div>
      </div>

      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:#99a;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px;">Ambient</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div><label style="font-size:10px;color:#777;">Intensity</label>
            <input id="ld-ai" type="range" min="0" max="1" step="0.05" value="0.3" style="width:100%;"></div>
          <div><label style="font-size:10px;color:#777;">Color</label>
            <input id="ld-ac" type="color" value="#ffffff" style="width:100%;height:24px;"></div>
        </div>
      </div>

      <div style="margin-bottom:8px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input id="ld-shadows" type="checkbox" checked> Shadows
        </label>
      </div>
    `

    // Add button styles
    const btns = div.querySelectorAll('.ld-preset') as NodeListOf<HTMLElement>
    btns.forEach(btn => {
      btn.style.cssText = 'background:#1a1d23;color:#bbb;border:1px solid #3a3f4a;border-radius:5px;padding:4px 8px;font-size:11px;cursor:pointer;'
      btn.onmouseenter = () => { btn.style.background = '#2a2d33' }
      btn.onmouseleave = () => { btn.style.background = '#1a1d23' }
      btn.onclick = () => this.applyPreset(btn.dataset.preset!)
    })

    // Bind sliders
    const $ = (id: string) => div.querySelector(id) as HTMLInputElement
    const bind = (id: string, fn: (v: number) => void) => {
      $(id).oninput = () => fn(parseFloat($(id).value))
    }
    bind('#ld-sx', v => { this.sun.position.x = v })
    bind('#ld-sy', v => { this.sun.position.y = v })
    bind('#ld-sz', v => { this.sun.position.z = v })
    bind('#ld-si', v => { this.sun.intensity = v })
    bind('#ld-ai', v => { this.ambient.intensity = v })
    $('#ld-sc').oninput = () => { this.sun.color.set($('#ld-sc').value) }
    $('#ld-ac').oninput = () => { this.ambient.color.set($('#ld-ac').value) }
    $('#ld-shadows').onchange = () => { this.sun.castShadow = ($('#ld-shadows') as HTMLInputElement).checked }

    // Close button
    (div.querySelector('#ld-close') as HTMLElement)!.onclick = () => this.destroy()

    return div
  }

  private applyPreset(name: string) {
    const presets: Record<string, { sx: number; sy: number; sz: number; si: number; ai: number; sc: string; ac: string }> = {
      realistic: { sx: 20, sy: 30, sz: 10, si: 1.0, ai: 0.3, sc: '#ffeedd', ac: '#ffffff' },
      overcast:  { sx: 0,  sy: 40, sz: 0,  si: 0.6, ai: 0.55, sc: '#c8d0e0', ac: '#d0d8e8' },
      studio:    { sx: 15, sy: 25, sz: 20, si: 1.2, ai: 0.4, sc: '#ffffff', ac: '#f0f0ff' },
      night:     { sx: 5,  sy: 10, sz: -10, si: 0.15, ai: 0.08, sc: '#4466aa', ac: '#111122' },
      golden:    { sx: -15, sy: 8,  sz: 10, si: 1.4, ai: 0.2, sc: '#ff9944', ac: '#332200' },
      harsh:     { sx: 25, sy: 50, sz: 0,  si: 2.0, ai: 0.1, sc: '#ffffff', ac: '#222222' },
    }
    const p = presets[name]
    if (!p) return

    this.sun.position.set(p.sx, p.sy, p.sz)
    this.sun.intensity = p.si
    this.sun.color.set(p.sc)
    this.ambient.intensity = p.ai
    this.ambient.color.set(p.ac)

    // Update sliders to match
    const set = (id: string, val: string | number) => {
      const el = this.panel.querySelector(id) as HTMLInputElement
      if (el) el.value = String(val)
    }
    set('#ld-sx', p.sx)
    set('#ld-sy', p.sy)
    set('#ld-sz', p.sz)
    set('#ld-si', p.si)
    set('#ld-ai', p.ai)
    set('#ld-sc', p.sc)
    set('#ld-ac', p.ac)
  }

  destroy() {
    this.panel.remove()
    // Restore default lights
    this.clearExistingLights()
    const defSun = new DirectionalLight(0xffffff, 0.8)
    defSun.position.set(20, 30, 10)
    this.scene.three.add(defSun)
    const defAmb = new AmbientLight(0xffffff, 0.3)
    this.scene.three.add(defAmb)
  }
}