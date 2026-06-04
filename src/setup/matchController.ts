import { Vector3 } from 'three'
import type { MapMenu } from '../MapMenu'
import type { Player } from '../Player'
import type { Scene } from '../Scene'
import type { PhysicsSystem } from '../PhysicsSystem'
import type { CharacterPool } from '../ai/CharacterPool'
import type { DamageSystem } from '../ai/DamageSystem'
import type { NavGrid } from '../ai/NavGrid'
import { TdmMatch, type TdmConfig } from '../modes/TdmMatch'

export interface MatchControllerDeps {
  physics: PhysicsSystem
  scene: Scene
  mapMenu: MapMenu
  player: Player
  enemyPool: CharacterPool
  damage: DamageSystem
  getNav: () => NavGrid
  setNav: (nav: NavGrid) => void
  onEnemyFire: (muzzle: Vector3, dir: Vector3) => void
  getCurrentMapId: () => string
  loadMap: (id: string) => Promise<void>
  buildNav: () => NavGrid
}

export function createMatchController(deps: MatchControllerDeps) {
  let match: TdmMatch | null = null

  function startMatch(cfg: TdmConfig) {
    endMatch()
    match = new TdmMatch(
      {
        physics: deps.physics,
        scene: deps.scene,
        pool: deps.enemyPool,
        player: deps.player,
        damage: deps.damage,
        getNav: deps.getNav,
        onEnemyFire: deps.onEnemyFire,
      },
      cfg,
    )

    match.onMatchOver = () => {
      endMatch()
      void deps.mapMenu.show().then(async (selection) => {
        if (selection.mapId !== deps.getCurrentMapId()) {
          await deps.loadMap(selection.mapId)
          deps.setNav(deps.buildNav())
        }
        deps.player.respawn(new Vector3(0, 5, 0))
        if (selection.mode === 'tdm' && selection.tdm) startMatch(selection.tdm)
      })
    }
  }

  function endMatch() {
    if (!match) return
    match.dispose()
    match = null
  }

  return {
    startMatch,
    endMatch,
    getMatch: () => match,
  }
}
