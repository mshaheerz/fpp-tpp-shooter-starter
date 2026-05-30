import { MAPS, type MapDefinition } from './maps'

export type GameMode = 'roam' | 'tdm'

/** What the menu resolves with when the user starts a game. */
export interface MenuSelection {
  mapId: string
  mode: GameMode
  /** Present only when `mode === 'tdm'`. */
  tdm?: { bots: number; roundsToWin: number }
}

/**
 * Controller for the start/in-game overlay. Two sections:
 *   - a grid of map cards (free-roam: click a card → play that map), and
 *   - a Team Deathmatch panel (bot count + rounds-to-win + map picker + Start).
 *
 * `show()` reveals the overlay, exits pointer lock, and resolves with a
 * `MenuSelection`. Reads maps from the shared `MAPS` registry.
 */
export class MapMenu {
  private el: HTMLElement
  private grid: HTMLElement
  private resolver: ((sel: MenuSelection) => void) | null = null
  // TDM controls.
  private tdmBots = 4
  private tdmRounds = 2
  private tdmMapId = MAPS[0]?.id ?? ''

  constructor() {
    const el = document.getElementById('map-menu')
    const grid = document.getElementById('map-menu-grid')
    if (!el || !grid) throw new Error('map-menu DOM missing — check index.html')
    this.el = el
    this.grid = grid
    this.render(MAPS)
    this.buildTdmSection()
  }

  /** Build a card per registered map (free-roam quick start). */
  private render(maps: MapDefinition[]) {
    this.grid.innerHTML = ''
    for (const m of maps) {
      const card = document.createElement('div')
      card.className = 'map-card'
      card.dataset.mapId = m.id

      const title = document.createElement('div')
      title.className = 'map-name'
      title.textContent = m.name
      card.appendChild(title)

      const desc = document.createElement('div')
      desc.className = 'map-desc'
      desc.textContent = m.description
      card.appendChild(desc)

      card.addEventListener('click', () => this.pick({ mapId: m.id, mode: 'roam' }))
      this.grid.appendChild(card)
    }
  }

  /** Build the Team Deathmatch panel under the map grid. */
  private buildTdmSection() {
    const host = document.getElementById('tdm-section')
    if (!host) return
    host.innerHTML = ''

    const title = document.createElement('h2')
    title.className = 'tdm-title'
    title.textContent = 'Team Deathmatch'
    host.appendChild(title)

    const sub = document.createElement('div')
    sub.className = 'tdm-sub'
    sub.textContent = 'Round-based, last team standing wins. You vs a squad of bots.'
    host.appendChild(sub)

    const row = document.createElement('div')
    row.className = 'tdm-row'

    // Map picker.
    const mapSel = document.createElement('select')
    mapSel.className = 'tdm-select'
    for (const m of MAPS) {
      const opt = document.createElement('option')
      opt.value = m.id
      opt.textContent = m.name
      mapSel.appendChild(opt)
    }
    mapSel.value = this.tdmMapId
    mapSel.addEventListener('change', () => (this.tdmMapId = mapSel.value))
    row.appendChild(this.labeled('Map', mapSel))

    // Bot count stepper.
    const botsInput = document.createElement('input')
    botsInput.type = 'number'
    botsInput.className = 'tdm-num'
    botsInput.min = '1'
    botsInput.max = '12'
    botsInput.value = String(this.tdmBots)
    botsInput.addEventListener('change', () => {
      this.tdmBots = clamp(Number(botsInput.value) || 4, 1, 12)
      botsInput.value = String(this.tdmBots)
    })
    row.appendChild(this.labeled('Bots', botsInput))

    // Rounds-to-win stepper.
    const roundsInput = document.createElement('input')
    roundsInput.type = 'number'
    roundsInput.className = 'tdm-num'
    roundsInput.min = '1'
    roundsInput.max = '9'
    roundsInput.value = String(this.tdmRounds)
    roundsInput.addEventListener('change', () => {
      this.tdmRounds = clamp(Number(roundsInput.value) || 2, 1, 9)
      roundsInput.value = String(this.tdmRounds)
    })
    row.appendChild(this.labeled('Rounds to win', roundsInput))

    // Start button.
    const start = document.createElement('button')
    start.className = 'tdm-start'
    start.textContent = 'Start Match'
    start.addEventListener('click', () =>
      this.pick({
        mapId: this.tdmMapId,
        mode: 'tdm',
        tdm: { bots: this.tdmBots, roundsToWin: this.tdmRounds },
      }),
    )
    row.appendChild(start)

    host.appendChild(row)
  }

  private labeled(label: string, control: HTMLElement): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'tdm-field'
    const l = document.createElement('label')
    l.textContent = label
    wrap.appendChild(l)
    wrap.appendChild(control)
    return wrap
  }

  /** Show the menu and resolve with the selection. Exits pointer lock. */
  show(): Promise<MenuSelection> {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock()
      } catch {
        /* ignore */
      }
    }
    this.el.classList.remove('hidden')
    return new Promise((resolve) => {
      this.resolver = resolve
    })
  }

  hide() {
    this.el.classList.add('hidden')
  }

  private pick(sel: MenuSelection) {
    this.hide()
    const r = this.resolver
    this.resolver = null
    if (r) r(sel)
  }

  isOpen(): boolean {
    return !this.el.classList.contains('hidden')
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
