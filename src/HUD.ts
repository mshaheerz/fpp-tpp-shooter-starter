export interface HUDFrame {
  mode: 'FPP' | 'TPP'
  weaponName: string
  ammoMag: number
  ammoReserve: number
  reloading: boolean
  fps: number
  ads: number /** 0..1 ADS factor; shrinks the crosshair when aiming */
}

/**
 * Lightweight 2D overlay on the HUD canvas (separate from the 3D canvas).
 * Crosshair, ammo, weapon name, FPS, current view mode.
 */
export class HUD {
  constructor(private ctx: CanvasRenderingContext2D, private canvas: HTMLCanvasElement) {}

  draw(f: HUDFrame) {
    const { ctx, canvas } = this
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const cx = canvas.width * 0.5
    const cy = canvas.height * 0.5

    // Crosshair — shrinks toward a single dot while aiming.
    const adsT = f.ads
    ctx.strokeStyle = `rgba(234, 255, 208, ${1 - adsT * 0.7})`
    ctx.lineWidth = 2
    ctx.beginPath()
    const gap = 4 + adsT * 2
    const arm = (1 - adsT) * 8
    ctx.moveTo(cx - arm - gap, cy)
    ctx.lineTo(cx - gap, cy)
    ctx.moveTo(cx + gap, cy)
    ctx.lineTo(cx + arm + gap, cy)
    ctx.moveTo(cx, cy - arm - gap)
    ctx.lineTo(cx, cy - gap)
    ctx.moveTo(cx, cy + gap)
    ctx.lineTo(cx, cy + arm + gap)
    ctx.stroke()
    ctx.fillStyle = '#eaffd0'
    ctx.fillRect(cx - 1, cy - 1, 2, 2)

    // Bottom-right ammo block.
    ctx.font = '600 26px ui-monospace, Menlo, monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    const padR = 28
    const padB = 28
    ctx.fillStyle = '#ffffff'
    const ammoStr = f.ammoMag === 0 && f.ammoReserve === 0 ? '—' : `${f.ammoMag} / ${f.ammoReserve}`
    ctx.fillText(ammoStr, canvas.width - padR, canvas.height - padB)
    ctx.font = '500 14px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#cfd8c2'
    ctx.fillText(f.weaponName, canvas.width - padR, canvas.height - padB - 28)
    if (f.reloading) {
      ctx.fillStyle = '#ffaa55'
      ctx.fillText('reloading…', canvas.width - padR, canvas.height - padB - 48)
    }

    // Top-left FPS + mode.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = '500 12px ui-monospace, Menlo, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(`${f.fps} fps   ${f.mode}`, 14, 12)
  }
}
