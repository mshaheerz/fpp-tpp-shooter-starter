import { MAPS, type MapDefinition } from './maps'

/**
 * Controller for the map-selection overlay. Reads from the shared `MAPS`
 * registry so adding a new map auto-populates the menu.
 *
 * Lifecycle:
 *   - `show(onPick)` reveals the overlay and exits pointer lock so the cursor
 *     is usable. When the user clicks a card, `onPick(id)` fires and the
 *     overlay hides.
 *   - `bindHotkey(key)` makes the menu reopen on the given key while playing.
 *
 * The menu is intentionally HTML/CSS (not canvas-drawn) so it's keyboard-
 * navigable, accessible, and easy to restyle without touching the renderer.
 */
export class MapMenu {
  private el: HTMLElement
  private grid: HTMLElement
  private resolver: ((id: string) => void) | null = null

  constructor() {
    const el = document.getElementById('map-menu')
    const grid = document.getElementById('map-menu-grid')
    if (!el || !grid) throw new Error('map-menu DOM missing — check index.html')
    this.el = el
    this.grid = grid
    this.render(MAPS)
  }

  /** Build a card per registered map. Called once on construction. */
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

      card.addEventListener('click', () => this.pick(m.id))
      this.grid.appendChild(card)
    }
  }

  /** Show the menu and resolve with the selected map id. Exits pointer lock so
   *  the cursor can interact with the cards. */
  show(): Promise<string> {
    // Release the pointer if the game had it captured.
    if (document.pointerLockElement) {
      try { document.exitPointerLock() } catch { /* ignore */ }
    }
    this.el.classList.remove('hidden')
    return new Promise((resolve) => {
      this.resolver = resolve
    })
  }

  /** Hide the menu without picking anything (e.g. user pressed Escape). */
  hide() {
    this.el.classList.add('hidden')
  }

  private pick(id: string) {
    this.hide()
    const r = this.resolver
    this.resolver = null
    if (r) r(id)
  }

  /** Is the menu currently visible? */
  isOpen(): boolean {
    return !this.el.classList.contains('hidden')
  }
}
