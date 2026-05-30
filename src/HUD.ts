export interface HUDFrame {
  mode: 'FPP' | 'TPP'
  weaponName: string
  ammoMag: number
  ammoReserve: number
  reloading: boolean
  fps: number
  ads: number /** 0..1 ADS factor; shrinks the crosshair when aiming */
  /** Player health 0..maxHealth. Omit (undefined) to hide the health bar. */
  health?: number
  maxHealth?: number
  /** Big center banner (round result, countdown). Empty/undefined hides it. */
  banner?: string
  /** Small line under the banner (e.g. "You 1 — 0 Bots"). */
  subtitle?: string
  /** Top-center scoreboard text (e.g. "Round 2   Bots: 3/4"). */
  scoreboard?: string
}

/**
 * Lightweight 2D overlay on the HUD canvas (separate from the 3D canvas).
 * Crosshair, ammo, weapon name, FPS, current view mode, health, hit marker.
 */
export class HUD {
  /** Seconds remaining on the transient hit-marker (X over the crosshair). */
  private hitMarker = 0
  /** Seconds remaining on the red damage vignette. */
  private damageFlash = 0

  constructor(private ctx: CanvasRenderingContext2D, private canvas: HTMLCanvasElement) {}

  /** Show the hit confirmation marker briefly (call when a shot hits an enemy). */
  flashHitMarker() {
    this.hitMarker = 0.12
  }

  /** Flash a red edge vignette (call when the player takes damage). */
  flashDamage() {
    this.damageFlash = 0.35
  }

  draw(f: HUDFrame, dt = 0) {
    const { ctx, canvas } = this
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (this.hitMarker > 0) this.hitMarker = Math.max(0, this.hitMarker - dt)
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt)

    const cx = canvas.width * 0.5
    const cy = canvas.height * 0.5

    // Red damage vignette around the screen edges.
    if (this.damageFlash > 0) {
      const a = (this.damageFlash / 0.35) * 0.45
      const grad = ctx.createRadialGradient(
        cx, cy, Math.min(cx, cy) * 0.5,
        cx, cy, Math.max(cx, cy),
      )
      grad.addColorStop(0, 'rgba(180,0,0,0)')
      grad.addColorStop(1, `rgba(180,0,0,${a})`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

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

    // Hit marker: four short diagonal ticks (an X) that fade out.
    if (this.hitMarker > 0) {
      const a = this.hitMarker / 0.12
      ctx.strokeStyle = `rgba(255,80,80,${a})`
      ctx.lineWidth = 2
      const r0 = 6
      const r1 = 12
      ctx.beginPath()
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        ctx.moveTo(cx + sx * r0, cy + sy * r0)
        ctx.lineTo(cx + sx * r1, cy + sy * r1)
      }
      ctx.stroke()
    }

    // Bottom-left health bar.
    if (typeof f.health === 'number' && typeof f.maxHealth === 'number' && f.maxHealth > 0) {
      const frac = Math.max(0, Math.min(1, f.health / f.maxHealth))
      const bw = 220
      const bh = 16
      const bx = 28
      const by = canvas.height - 28 - bh
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4)
      // Color shifts green→amber→red as health drops.
      const hue = frac * 120 // 120=green, 0=red
      ctx.fillStyle = `hsl(${hue}, 70%, 45%)`
      ctx.fillRect(bx, by, bw * frac, bh)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 1
      ctx.strokeRect(bx, by, bw, bh)
      ctx.font = '600 13px ui-monospace, Menlo, monospace'
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${Math.ceil(f.health)} HP`, bx + 6, by + bh / 2 + 1)
    }

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

    // Top-center TDM scoreboard.
    if (f.scoreboard) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.font = '600 15px ui-monospace, Menlo, monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fillText(f.scoreboard, cx, 14)
    }

    // Center banner (round result / countdown).
    if (f.banner) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '700 42px ui-sans-serif, system-ui, sans-serif'
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillText(f.banner, cx + 2, cy - 60 + 2)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(f.banner, cx, cy - 60)
      if (f.subtitle) {
        ctx.font = '600 18px ui-sans-serif, system-ui, sans-serif'
        ctx.fillStyle = '#cfd8c2'
        ctx.fillText(f.subtitle, cx, cy - 26)
      }
    }
  }
}
