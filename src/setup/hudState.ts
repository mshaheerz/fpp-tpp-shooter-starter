import type { CameraRig } from '../Camera'
import type { HUD } from '../HUD'
import type { Player } from '../Player'
import type { WeaponLogicSystem } from '../weapon/WeaponLogicSystem'
import type { TdmMatch } from '../modes/TdmMatch'

export interface HudStateDeps {
  hud: HUD
  cam: CameraRig
  logic: WeaponLogicSystem
  player: Player
}

export function buildHudCopy(match: TdmMatch | null, player: Player) {
  let banner: string | undefined
  let subtitle: string | undefined
  let scoreboard: string | undefined

  if (match) {
    const state = match.state
    scoreboard = `Round ${state.round}   You ${state.playerRoundWins} – ${state.botRoundWins} Bots   Enemies ${state.botsAlive}/${state.botsTotal}`
    if (state.phase === 'countdown') {
      banner = 'Get Ready'
      subtitle = `Round ${state.round} starts in ${Math.ceil(state.timer)}`
    } else if (state.banner && state.phase !== 'active') {
      banner = state.banner
      subtitle = `You ${state.playerRoundWins} – ${state.botRoundWins} Bots`
    } else if (!player.alive) {
      banner = 'You are down'
    }
  }

  return { banner, subtitle, scoreboard }
}

export function drawHudFrame(deps: HudStateDeps, fps: number, match: TdmMatch | null, dt: number) {
  const { banner, subtitle, scoreboard } = buildHudCopy(match, deps.player)
  deps.hud.draw(
    {
      mode: deps.cam.mode,
      weaponName: deps.logic.stats.name,
      ammoMag: deps.logic.ammo[deps.logic.current].mag,
      ammoReserve: deps.logic.ammo[deps.logic.current].reserve,
      reloading: deps.logic.state === 'Reloading',
      fps,
      ads: deps.cam.adsFactor,
      health: deps.player.hp,
      maxHealth: deps.player.maxHp,
      banner,
      subtitle,
      scoreboard,
    },
    dt,
  )
}
