export type CharacterRole = 'player' | 'enemy'

export interface CharacterDefinition {
  id: string
  label: string
  base: string
  animations: Record<string, string>
  roles: CharacterRole[]
  /**
   * Normalized world height in meters. Keeps differently-authored rigs
   * consistent without per-model trial-and-error in gameplay code.
   */
  targetHeight?: number
  /**
   * Optional extra multiplier after height normalization for fine tuning.
   */
  scaleMultiplier?: number
  /**
   * Small vertical adjustment in meters after floor alignment.
   * Positive values lift the rig up if the feet sink into the ground.
   */
  groundOffset?: number
}

export interface CharacterSelection {
  playerId: string
  enemyId: string
}

const STORAGE_KEY = 'fppandtpp:character-selection'

const SHARED_ANIMATIONS: Record<string, string> = {
  idle: './assets/character/animations/idle.glb',
  walk_forward: './assets/character/animations/walk_forward.glb',
  run_forward: './assets/character/animations/run_forward.glb',
  strafe_left: './assets/character/animations/strafe_left.glb',
  strafe_right: './assets/character/animations/strafe_right.glb',
  walk_backward: './assets/character/animations/walk_backward.glb',
  run_backward: './assets/character/animations/run_backward.glb',
  jump: './assets/character/animations/jump.glb',
  firing_rifle: './assets/character/animations/firing_rifle.glb',
  reload_rifle: './assets/character/animations/reload_rifle.glb',
  aim_idle: './assets/character/animations/aim_idle.glb',
  falling_to_landing: './assets/character/animations/falling_to_landing.glb',
  pistol_idle: './assets/character/animations/pistol_idle.glb',
  pistol_walk_forward: './assets/character/animations/pistol_walk_forward.glb',
  pistol_walk_backward: './assets/character/animations/pistol_walk_backward.glb',
  pistol_run_forward: './assets/character/animations/pistol_run_forward.glb',
  pistol_run_backward: './assets/character/animations/pistol_run_backward.glb',
  pistol_strafe_left: './assets/character/animations/pistol_strafe_left.glb',
  pistol_strafe_right: './assets/character/animations/pistol_strafe_right.glb',
  pistol_jump: './assets/character/animations/pistol_jump.glb',
  pistol_crouch_idle: './assets/character/animations/pistol_crouch_idle.glb',
  crouch_idle: './assets/character/animations/crouch_idle.glb',
  crouch_walk_forward: './assets/character/animations/crouch_walk_forward.glb',
  crouch_strafe_left: './assets/character/animations/crouch_strafe_left.glb',
  crouch_strafe_right: './assets/character/animations/crouch_strafe_right.glb',
  knife_idle: './assets/character/animations/knife_idle.glb',
  knife_stab: './assets/character/animations/knife_stab.glb',
  ledge_idle: './assets/character/animations/ledge_idle.glb',
  ledge_shimmy_left: './assets/character/animations/ledge_shimmy_left.glb',
  ledge_shimmy_right: './assets/character/animations/ledge_shimmy_right.glb',
  ledge_climb_up: './assets/character/animations/ledge_climb_up.glb',
  death: './assets/character/animations/death.glb',
  dying: './assets/character/animations/dying.glb',
}

export const DEFAULT_PLAYER_CHARACTER_ID = 'steve'
export const DEFAULT_ENEMY_CHARACTER_ID = 'ybot'

export const CHARACTER_DEFINITIONS: CharacterDefinition[] = [
  {
    id: 'steve',
    label: 'Steve',
    base: './assets/character/steve.glb',
    animations: SHARED_ANIMATIONS,
    roles: ['player', 'enemy'],
    targetHeight: 1.8,
    groundOffset: 0.08,
  },
  {
    id: 'ybot',
    label: 'Y Bot',
    base: './assets/character/ybot.glb',
    animations: SHARED_ANIMATIONS,
    roles: ['player', 'enemy'],
    targetHeight: 1.8,
  },
]

const CHARACTER_BY_ID = new Map(CHARACTER_DEFINITIONS.map((definition) => [definition.id, definition] as const))

function fallbackCharacterId(role: CharacterRole): string {
  const preferred = role === 'player' ? DEFAULT_PLAYER_CHARACTER_ID : DEFAULT_ENEMY_CHARACTER_ID
  const preferredDefinition = CHARACTER_BY_ID.get(preferred)
  if (preferredDefinition && preferredDefinition.roles.includes(role)) return preferredDefinition.id

  const firstAllowed = CHARACTER_DEFINITIONS.find((definition) => definition.roles.includes(role))
  return firstAllowed?.id ?? CHARACTER_DEFINITIONS[0]?.id ?? ''
}

export function getCharacterOptions(role: CharacterRole): CharacterDefinition[] {
  return CHARACTER_DEFINITIONS.filter((definition) => definition.roles.includes(role))
}

export function normalizeCharacterSelection(
  partial?: Partial<CharacterSelection> | null,
): CharacterSelection {
  const playerDefinition = CHARACTER_BY_ID.get(partial?.playerId ?? '')
  const enemyDefinition = CHARACTER_BY_ID.get(partial?.enemyId ?? '')

  return {
    playerId:
      playerDefinition && playerDefinition.roles.includes('player')
        ? playerDefinition.id
        : fallbackCharacterId('player'),
    enemyId:
      enemyDefinition && enemyDefinition.roles.includes('enemy')
        ? enemyDefinition.id
        : fallbackCharacterId('enemy'),
  }
}

export function getCharacterDefinition(id: string, role?: CharacterRole): CharacterDefinition {
  const direct = CHARACTER_BY_ID.get(id)
  if (direct && (!role || direct.roles.includes(role))) return direct
  return CHARACTER_BY_ID.get(fallbackCharacterId(role ?? 'player')) ?? CHARACTER_DEFINITIONS[0]
}

export function getCharacterDefinitionForSelection(
  selection: CharacterSelection,
  role: CharacterRole,
): CharacterDefinition {
  return getCharacterDefinition(role === 'player' ? selection.playerId : selection.enemyId, role)
}

export function loadStoredCharacterSelection(): CharacterSelection {
  if (typeof window === 'undefined') return normalizeCharacterSelection()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return normalizeCharacterSelection()
    return normalizeCharacterSelection(JSON.parse(raw) as Partial<CharacterSelection>)
  } catch {
    return normalizeCharacterSelection()
  }
}

export function saveStoredCharacterSelection(selection: CharacterSelection) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection))
  } catch {
    // Ignore storage failures (private mode / blocked storage).
  }
}
