import type { MapMenu, MenuSelection } from '../MapMenu'
import type { PhysicsSystem } from '../PhysicsSystem'
import type { Scene } from '../Scene'
import type { Player } from '../Player'
import type { NavGrid } from '../ai/NavGrid'
import type { CharacterSelection } from '../character/characterRegistry'
import { dlog } from '../debug/log'
import type { TdmConfig } from '../modes/TdmMatch'

export interface LoadingUi {
  show(text: string): void
  hide(): void
}

export interface InitialSelection {
  currentMapId: string
  pendingMatch: TdmConfig | null
  characterSelection: CharacterSelection
}

export interface OpenMenuDeps {
  mapMenu: MapMenu
  getCurrentMapId: () => string
  loadMap: (id: string) => Promise<void>
  player: Player
  rebuildNav: () => NavGrid
  setNav: (nav: NavGrid) => void
  hasActiveMatch: () => boolean
  endMatch: () => void
  startMatch: (cfg: TdmConfig) => void
  onSelection?: (selection: MenuSelection) => Promise<void> | void
}

export function createMapLoader(
  scene: Scene,
  physics: PhysicsSystem,
  loadingUi: LoadingUi,
  setCurrentMapId: (id: string) => void,
) {
  return async function loadMap(id: string) {
    loadingUi.show(`Loading map: ${id}…`)
    const ok = await scene.loadMapById(id, physics)
    if (!ok) {
      scene.addProceduralGround(physics)
      dlog('[map] assets missing for', id, '— using procedural fallback')
    } else {
      dlog('[map] loaded', id)
    }
    setCurrentMapId(id)
    loadingUi.hide()
  }
}

export async function pickInitialMap(mapMenu: MapMenu, loadMap: (id: string) => Promise<void>) {
  const firstPick = await mapMenu.show()
  await loadMap(firstPick.mapId)
  return {
    currentMapId: firstPick.mapId,
    pendingMatch: firstPick.mode === 'tdm' ? firstPick.tdm ?? null : null,
    characterSelection: firstPick.characters,
  } satisfies InitialSelection
}

export function createMapMenuReopener(deps: OpenMenuDeps) {
  return async function reopenMapMenu() {
    const selection = await deps.mapMenu.show()
    await deps.onSelection?.(selection)
    if (selection.mapId === deps.getCurrentMapId() && selection.mode === 'roam') return

    if (selection.mapId !== deps.getCurrentMapId()) {
      await deps.loadMap(selection.mapId)
      deps.player.body.setTranslation({ x: 0, y: 5, z: 0 }, true)
      deps.player.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      deps.setNav(deps.rebuildNav())
    }

    if (deps.hasActiveMatch()) deps.endMatch()
    if (selection.mode === 'tdm' && selection.tdm) deps.startMatch(selection.tdm)
  }
}

export function startRequestedMatch(
  pendingMatch: TdmConfig | null,
  params: URLSearchParams,
  startMatch: (cfg: TdmConfig) => void,
) {
  if (pendingMatch) {
    startMatch(pendingMatch)
    return
  }

  const tdmParam = params.get('tdm')
  if (!tdmParam) return

  const bots = Math.max(1, Math.min(12, Number(tdmParam) || 4))
  startMatch({ bots, roundsToWin: 2 })
}
