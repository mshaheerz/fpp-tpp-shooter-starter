import { MAPS, type MapMeta } from './maps'
import { clamp } from './common/math'
import { CharacterPreview } from './menu/CharacterPreview'
import {
  getCharacterOptions,
  loadStoredCharacterSelection,
  normalizeCharacterSelection,
  saveStoredCharacterSelection,
  type CharacterSelection,
} from './character/characterRegistry'

export type GameMode = 'roam' | 'tdm'

/** What the menu resolves with when the user starts a game. */
export interface MenuSelection {
  mapId: string
  mode: GameMode
  characters: CharacterSelection
  /** Present only when `mode === 'tdm'`. */
  tdm?: { bots: number; roundsToWin: number }
}

/**
 * Controller for the start/in-game loadout overlay.
 *
 * Layout is a two-column "loadout" screen:
 *   - Left: a live rotating 3D {@link CharacterPreview} of the chosen player
 *     rig, plus clickable character/enemy-rig chips.
 *   - Right: FREE ROAM / TEAM DEATHMATCH mode tabs, a grid of selectable map
 *     cards, TDM controls (shown for TDM), and one big commit button.
 *
 * `show()` reveals the overlay, exits pointer lock, starts the preview loop, and
 * resolves with a {@link MenuSelection} when the user commits. The resolved
 * shape is unchanged from the previous version so `setup/mapFlow.ts` keeps
 * working as-is.
 */
export class MapMenu {
  private el: HTMLElement
  private grid: HTMLElement
  private resolver: ((sel: MenuSelection) => void) | null = null

  private characterSelection = loadStoredCharacterSelection()
  private mode: GameMode = 'roam'
  private selectedMapId = MAPS[0]?.id ?? ''
  private tdmBots = 4
  private tdmRounds = 2

  private readonly preview = new CharacterPreview()
  /** Re-render hooks for the dynamic regions, set up in build*(). */
  private refreshPlayerChips: () => void = () => {}
  private refreshEnemyChips: () => void = () => {}
  private refreshMapCards: () => void = () => {}
  private refreshModeTabs: () => void = () => {}
  private refreshTdmStrip: () => void = () => {}
  private refreshCommit: () => void = () => {}

  constructor() {
    const el = document.getElementById('map-menu')
    const grid = document.getElementById('map-menu-grid')
    if (!el || !grid) throw new Error('map-menu DOM missing — check index.html')
    this.el = el
    this.grid = grid

    this.mountPreview()
    this.buildCharacterChips()
    this.buildModeTabs()
    this.render(MAPS)
    this.buildTdmStrip()
    this.buildCommit()
    this.syncDynamic()
  }

  // ---- Left column: 3D preview + character chips -------------------------

  private mountPreview() {
    const canvas = document.getElementById('loadout-canvas') as HTMLCanvasElement | null
    if (!canvas) return
    this.preview.mount(canvas)
    window.addEventListener('resize', () => this.preview.resize())
  }

  private buildCharacterChips() {
    const playerHost = document.getElementById('player-chips')
    const enemyHost = document.getElementById('enemy-chips')

    if (playerHost) {
      this.refreshPlayerChips = () => {
        playerHost.innerHTML = ''
        for (const def of getCharacterOptions('player')) {
          const chip = document.createElement('button')
          chip.className = 'loadout-chip'
          chip.textContent = def.label
          chip.classList.toggle('selected', def.id === this.characterSelection.playerId)
          chip.addEventListener('click', () => {
            this.updateCharacterSelection({ playerId: def.id })
            this.preview.setCharacter(this.characterSelection.playerId)
            this.refreshPlayerChips()
          })
          playerHost.appendChild(chip)
        }
      }
      this.refreshPlayerChips()
    }

    if (enemyHost) {
      this.refreshEnemyChips = () => {
        enemyHost.innerHTML = ''
        for (const def of getCharacterOptions('enemy')) {
          const chip = document.createElement('button')
          chip.className = 'loadout-chip loadout-chip-sm'
          chip.textContent = def.label
          chip.classList.toggle('selected', def.id === this.characterSelection.enemyId)
          chip.addEventListener('click', () => {
            this.updateCharacterSelection({ enemyId: def.id })
            this.refreshEnemyChips()
          })
          enemyHost.appendChild(chip)
        }
      }
      this.refreshEnemyChips()
    }
  }

  // ---- Right column: mode tabs, map cards, TDM, commit -------------------

  private buildModeTabs() {
    const host = document.getElementById('mode-tabs')
    if (!host) return
    const tabs: Array<{ mode: GameMode; label: string }> = [
      { mode: 'roam', label: 'Free Roam' },
      { mode: 'tdm', label: 'Team Deathmatch' },
    ]
    this.refreshModeTabs = () => {
      host.innerHTML = ''
      for (const t of tabs) {
        const btn = document.createElement('button')
        btn.className = 'mode-tab'
        btn.textContent = t.label
        btn.classList.toggle('active', this.mode === t.mode)
        btn.addEventListener('click', () => {
          this.mode = t.mode
          this.syncDynamic()
        })
        host.appendChild(btn)
      }
    }
    this.refreshModeTabs()
  }

  /** Build a selectable card per registered map. */
  private render(maps: MapMeta[]) {
    this.refreshMapCards = () => {
      this.grid.innerHTML = ''
      for (const m of maps) {
        const card = document.createElement('div')
        card.className = 'map-card'
        card.dataset.mapId = m.id
        card.classList.toggle('selected', m.id === this.selectedMapId)

        const title = document.createElement('div')
        title.className = 'map-name'
        title.textContent = m.name
        card.appendChild(title)

        const desc = document.createElement('div')
        desc.className = 'map-desc'
        desc.textContent = m.description
        card.appendChild(desc)

        card.addEventListener('click', () => {
          this.selectedMapId = m.id
          this.refreshMapCards()
          this.refreshCommit()
        })
        this.grid.appendChild(card)
      }
    }
    this.refreshMapCards()
  }

  /** Bots + rounds steppers, only relevant in TDM. */
  private buildTdmStrip() {
    const host = document.getElementById('tdm-strip')
    if (!host) return

    this.refreshTdmStrip = () => {
      host.classList.toggle('hidden', this.mode !== 'tdm')
      if (this.mode !== 'tdm') return
      host.innerHTML = ''
      host.appendChild(
        this.stepper('Bots', this.tdmBots, 1, 12, (v) => {
          this.tdmBots = v
        }),
      )
      host.appendChild(
        this.stepper('Rounds to win', this.tdmRounds, 1, 9, (v) => {
          this.tdmRounds = v
        }),
      )
    }
    this.refreshTdmStrip()
  }

  /** A labeled −/value/+ stepper control. */
  private stepper(
    label: string,
    initial: number,
    min: number,
    max: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    let value = clamp(initial, min, max)
    const wrap = document.createElement('div')
    wrap.className = 'loadout-stepper'

    const l = document.createElement('label')
    l.textContent = label
    wrap.appendChild(l)

    const controls = document.createElement('div')
    controls.className = 'stepper-controls'

    const valueEl = document.createElement('span')
    valueEl.className = 'stepper-value'
    valueEl.textContent = String(value)

    const set = (next: number) => {
      value = clamp(next, min, max)
      valueEl.textContent = String(value)
      onChange(value)
    }

    const minus = document.createElement('button')
    minus.className = 'stepper-btn'
    minus.textContent = '−'
    minus.addEventListener('click', () => set(value - 1))

    const plus = document.createElement('button')
    plus.className = 'stepper-btn'
    plus.textContent = '+'
    plus.addEventListener('click', () => set(value + 1))

    controls.appendChild(minus)
    controls.appendChild(valueEl)
    controls.appendChild(plus)
    wrap.appendChild(controls)
    return wrap
  }

  private buildCommit() {
    const btn = document.getElementById('loadout-commit') as HTMLButtonElement | null
    if (!btn) return
    this.refreshCommit = () => {
      btn.textContent = this.mode === 'tdm' ? 'Start Match' : 'Play'
      btn.classList.toggle('tdm', this.mode === 'tdm')
    }
    btn.addEventListener('click', () => this.commit())
    this.refreshCommit()
  }

  private commit() {
    if (this.mode === 'tdm') {
      this.pick({
        mapId: this.selectedMapId,
        mode: 'tdm',
        characters: this.characterSelection,
        tdm: { bots: this.tdmBots, roundsToWin: this.tdmRounds },
      })
    } else {
      this.pick({
        mapId: this.selectedMapId,
        mode: 'roam',
        characters: this.characterSelection,
      })
    }
  }

  /** Re-run all the dynamic refreshers (after a mode/selection change). */
  private syncDynamic() {
    this.refreshModeTabs()
    this.refreshMapCards()
    this.refreshTdmStrip()
    this.refreshCommit()
  }

  // ---- Lifecycle ---------------------------------------------------------

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
    this.preview.start()
    this.preview.setCharacter(this.characterSelection.playerId)
    this.preview.resize()
    return new Promise((resolve) => {
      this.resolver = resolve
    })
  }

  hide() {
    this.el.classList.add('hidden')
    this.preview.stop()
  }

  private updateCharacterSelection(next: Partial<CharacterSelection>) {
    this.characterSelection = normalizeCharacterSelection({
      ...this.characterSelection,
      ...next,
    })
    saveStoredCharacterSelection(this.characterSelection)
  }

  private pick(sel: MenuSelection) {
    this.updateCharacterSelection(sel.characters)
    this.hide()
    const r = this.resolver
    this.resolver = null
    if (r) r(sel)
  }

  isOpen(): boolean {
    return !this.el.classList.contains('hidden')
  }
}
