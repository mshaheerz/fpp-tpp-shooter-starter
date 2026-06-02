import { Renderer } from './Renderer'
import { Scene } from './Scene'
import { PhysicsSystem } from './PhysicsSystem'
import { InputManager } from './InputManager'
import { CameraRig } from './Camera'
import { Player } from './Player'
import { ThirdPersonCharacter } from './character/ThirdPersonCharacter'
import { FPSMesh } from './animation/FPSMesh'
import { WeaponRenderer } from './weapon/WeaponRenderer'
import { WEAPONS, type WeaponId } from './weapon/WeaponData'
import { WeaponShooter } from './weapon/WeaponShooter'
import { WeaponLogicSystem } from './weapon/WeaponLogicSystem'
import { HUD } from './HUD'
import { Vector3 } from 'three'
import { WeaponTransformDebugger } from './debug/WeaponTransformDebugger'
import PlayerDebugger from './debug/PlayerDebugger'
import { MapMenu } from './MapMenu'
import { DamageSystem } from './ai/DamageSystem'
import { CharacterPool } from './ai/CharacterPool'
import { Enemy } from './ai/Enemy'
import { NavGrid } from './ai/NavGrid'
import type { TdmConfig } from './modes/TdmMatch'
import type { AnimationManifest } from './character/ThirdPersonCharacter'
import { dlog, isDebug } from './debug/log'
import { createParticles } from './setup/particles'
import { createSpriteFx } from './setup/spriteFx'
import { createAudio } from './setup/audio'
import { createWeaponHitHandlers } from './setup/weaponHitHandlers'
import { createEnemyCombatHelpers } from './setup/enemyCombat'
import { createMatchController } from './setup/matchController'

const FIXED_DT = 1 / 60
const _eyeTmp = new Vector3()

async function main() {
  const loadingEl = document.getElementById('loading')
  const loadingText = document.getElementById('loading-text')
  function setLoading(t: string) {
    if (loadingText) loadingText.textContent = t
  }
  function hideLoading() {
    if (loadingEl) loadingEl.style.display = 'none'
  }

  setLoading('Initializing physics...')
  const physics = await PhysicsSystem.init()
  setLoading('Initializing renderer...')
  const renderer = new Renderer()
  setLoading('Building scene...')
  const scene = new Scene()
  setLoading('Setting up camera...')
  const cam = new CameraRig()
  const input = new InputManager(renderer.domElement, document.getElementById('lock-hint'))

  renderer.attachCamera(cam.three)
  window.addEventListener('resize', () => {
    cam.three.aspect = window.innerWidth / window.innerHeight
    cam.three.updateProjectionMatrix()
  })

  // Map selection: show the menu and wait for the user to pick a map. The
  // menu is HTML-based (see index.html + MapMenu.ts) so it runs before the
  // game loop starts. M reopens it in-game to swap maps without reloading.
  const mapMenu = new MapMenu()
  let currentMapId = 'shootRange'

  async function loadMap(id: string) {
    setLoading(`Loading map: ${id}…`)
    if (loadingEl) loadingEl.style.display = ''
    const ok = await scene.loadMapById(id, physics)
    if (!ok) {
      scene.addProceduralGround(physics)
      dlog('[map] assets missing for', id, '— using procedural fallback')
    } else {
      dlog('[map] loaded', id)
    }
    currentMapId = id
    hideLoading()
  }

  // Hide the loading overlay so the menu is visible, then wait for a pick.
  hideLoading()
  const firstPick = await mapMenu.show()
  await loadMap(firstPick.mapId)
  // Defer starting a TDM match until the player + systems exist (below).
  const pendingMatch = firstPick.mode === 'tdm' ? firstPick.tdm ?? null : null

  const player = new Player(physics)
  scene.add(player.debugMesh)
  player.debugMesh.visible = false

  // Central health/hit router. The player is a Combatant; its capsule collider
  // is registered so enemy bullets that hit it route here. Enemies register
  // themselves when a TDM match spawns them.
  const damage = new DamageSystem()
  damage.register(player)
  damage.registerCollider(player.colliderHandle, player)

  // Player debugger UI (F7) — only when ?debug or localStorage.debug is set.
  if (isDebug()) new PlayerDebugger(player)

  const character = new ThirdPersonCharacter()
  scene.add(character.object)
  let characterManifest: unknown = null
  try {
    setLoading('Loading character...')
    const res = await fetch('./assets/character/manifest.json')
    if (!res.ok) throw new Error('no manifest')
    const manifest = await res.json()
    characterManifest = manifest
    await character.load(manifest)
    dlog('[character] Mixamo manifest loaded')
    // Sync the climb FSM duration to the actual ledge_climb_up clip length so
    // the teleport-to-top happens exactly when the pull-up animation finishes
    // — otherwise short fixed timeouts cut the clip off mid-pose.
    const climbClip = character.animator.getClip('ledge_climb_up')
    if (climbClip) player.setClimbDuration(climbClip.duration)
  } catch {
    dlog(
      '[character] using placeholder humanoid — drop ybot.glb + animation GLBs into public/assets/character/ and add manifest.json',
    )
  }

  // Enemy character pool — loads the Mixamo assets once and clones per bot.
  // Initialized with the same manifest as the player (falls back to placeholder
  // rigs when assets are absent). Used by Team Deathmatch.
  const enemyPool = new CharacterPool()
  if (characterManifest) await enemyPool.init(characterManifest as AnimationManifest)
  else await enemyPool.init({ base: '', animations: {} })

  // Navigation grid, rebuilt whenever a map loads (samples the current static
  // colliders). `?nav` overlays the blocked cells for debugging.
  const params = new URLSearchParams(location.search)
  const showNav = params.has('nav')
  let navDebug: import('three').Object3D | null = null
  function buildNav(): NavGrid {
    if (navDebug) {
      scene.remove(navDebug)
      navDebug = null
    }
    const grid = new NavGrid(physics, { halfExtent: 60, cell: 0.9 })
    if (showNav) {
      navDebug = grid.buildDebugObject()
      scene.add(navDebug)
    }
    return grid
  }
  let nav: NavGrid = buildNav()

  // Dev free-roam bots: `?bot=N` drops N bots that just patrol the nav grid
  // (no match logic) — handy for testing pathfinding/hit detection in isolation.
  const enemies: Enemy[] = []
  const botParam = params.get('bot')
  if (botParam) {
    const n = Math.max(1, Math.min(8, Number(botParam) || 1))
    for (let i = 0; i < n; i++) {
      const spawn = nav.randomWalkable() ?? new Vector3((i - (n - 1) / 2) * 1.5, 3, -6)
      spawn.y = 3
      const e = new Enemy(physics, enemyPool, spawn)
      scene.add(e.rig.object)
      damage.register(e)
      damage.registerCollider(e.colliderHandle, e)
      e.onDeath = (dead) => damage.unregisterCollider(dead.colliderHandle)
      enemies.push(e)
    }
    dlog(`[tdm] spawned ${enemies.length} free-roam test bot(s)`)
  }

  // FPSMesh kept around solely for its recoil spring (camera kick); its
  // placeholder geometry is hidden — we use the Mixamo character's real arms
  // for both views now (head bone is hidden in FPP so you can see).
  const fpsMesh = new FPSMesh()
  fpsMesh.object.visible = false
  cam.three.add(fpsMesh.object)

  const weapons = new WeaponRenderer()
  // Weapon transform debugger (F8) — only when ?debug or localStorage.debug is set.
  if (isDebug()) new WeaponTransformDebugger(weapons)

  setLoading('Loading textures...')
  const { smokeSprites, flashSprites } = await createSpriteFx(scene)

  // Particle systems live at scene root so they aren't culled with the FPP arms.
  const particles = createParticles(scene)
  const { muzzleFx, smokeFx, impactFx, decals, shells } = particles

  const { audio } = await createAudio()

  let hud!: HUD
  const weaponHitHandlers = createWeaponHitHandlers({
    damage,
    player,
    scene,
    smokeSprites,
    flashSprites,
    smokeFx,
    impactFx,
    getHud: () => hud,
    audio,
  })

  const shooter = new WeaponShooter(
    physics,
    weapons,
    muzzleFx,
    impactFx,
    decals,
    shells,
    weaponHitHandlers.onHit,
    weaponHitHandlers.onMuzzle,
  )

  async function equip(id: WeaponId) {
    const stats = WEAPONS[id]
    // Weapon always rides the Mixamo right-hand bone now — same parent in both
    // views. The only thing that changes on V toggle is camera position + head
    // visibility on the character.
    await weapons.attachTo(id, character.rightHand, stats.tppOffset)
    // Swap the character's locomotion animation set so the stance matches the
    // weapon (pistol hold vs rifle hold vs knife stance).
    character.useAnimationSet(id === 'pistol' ? 'pistol' : id === 'knife' ? 'knife' : 'rifle')
  }

  const applyMode = () => {
    // Character is ALWAYS visible — in FPP the camera is at eye height inside
    // the head, so we hide just the head bone (otherwise we'd see the inside
    // of our own skull or have the face clip in front of the lens).
    character.object.visible = true
    character.setHeadVisible(cam.mode === 'TPP')
  }
  cam.onModeChange = applyMode
  await equip('ak47')
  applyMode()

  const logic = new WeaponLogicSystem(input, cam, weapons, shooter, fpsMesh, character, player.body, equip)
  hud = new HUD(renderer.hudCtx, renderer.hudCanvas)

  // Flash the red vignette whenever the player takes damage.
  player.onDamaged = () => hud.flashDamage()

  // ── Enemy combat helpers (used by Enemy.think via the loop) ──────────────────
  // Line-of-sight: cast from `from` toward `to`; clear if nothing solid is hit
  // before (almost) reaching the target. The target is the player capsule, so a
  // hit at ~target distance means an unobstructed view.
  const { losClear, enemyFireFx } = createEnemyCombatHelpers({
    physics,
    audio,
    muzzleFx,
    getFlashSprites: () => flashSprites,
  })
  const matchController = createMatchController({
    physics,
    scene,
    mapMenu,
    player,
    enemyPool,
    damage,
    getNav: () => nav,
    setNav: (nextNav) => {
      nav = nextNav
    },
    hasLineOfSight: losClear,
    onEnemyFire: enemyFireFx,
    playerFiredNow: () => input.lmb && logic.state === 'Idle',
    getCurrentMapId: () => currentMapId,
    loadMap,
    buildNav,
  })
  const { startMatch, endMatch, getMatch } = matchController

  // Start a TDM match if the menu requested one, or via dev `?tdm=N`.
  if (pendingMatch) {
    startMatch(pendingMatch)
  } else {
    const tdmParam = params.get('tdm')
    if (tdmParam) {
      const bots = Math.max(1, Math.min(12, Number(tdmParam) || 4))
      startMatch({ bots, roundsToWin: 2 })
    }
  }

  let last = performance.now()
  let prevGrounded = player.grounded
  let acc = 0
  let frames = 0
  let fpsTimer = 0
  let fps = 0
  async function reopenMapMenu() {
    const selection = await mapMenu.show()
    if (selection.mapId === currentMapId && selection.mode === 'roam') return
    if (selection.mapId !== currentMapId) {
      await loadMap(selection.mapId)
      player.body.setTranslation({ x: 0, y: 5, z: 0 }, true)
      player.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      nav = buildNav()
    }
    if (getMatch()) endMatch()
    if (selection.mode === 'tdm' && selection.tdm) startMatch(selection.tdm)
  }

  function handleFrameInput() {
    if (input.wasPressed('KeyV')) cam.toggleMode()
    if (input.wasPressed('Digit1')) logic.requestSwitch('ak47')
    if (input.wasPressed('Digit2')) logic.requestSwitch('pistol')
    if (input.wasPressed('Digit3')) logic.requestSwitch('knife')
    if (input.wasPressed('KeyM') && !mapMenu.isOpen()) {
      void reopenMapMenu()
    }
  }

  function stepFixedUpdate(dt: number) {
    acc += dt
    while (acc >= FIXED_DT) {
      const match = getMatch()
      if (player.alive) player.update(FIXED_DT, input, cam)
      if (match) {
        match.update(FIXED_DT)
      } else if (enemies.length) {
        // Free-roam dev bots (no match): patrol + react to the player.
        const playerFiredNow = input.lmb && logic.state === 'Idle'
        for (const e of enemies) {
          if (e.alive) {
            e.think(
              {
                nav,
                target: player,
                targetPos: player.position,
                targetFiredNow: playerFiredNow,
                hasLineOfSight: losClear,
                dealDamage: (dmg) => damage.applyDamage(player, dmg, e.team),
                onFire: (muzzle, dir) => enemyFireFx(muzzle, dir),
              },
              FIXED_DT,
            )
          }
          e.update(FIXED_DT)
        }
      }
      physics.step(FIXED_DT)
      acc -= FIXED_DT
    }
  }

  function handleLanding() {
    if (!prevGrounded && player.grounded) {
      const impactSpeed = player.velocity.y
      if (impactSpeed < -7.0) {
        if (character.animator.hasClip('falling_to_landing')) {
          character.animator.playOverlay('falling_to_landing', false)
        }
        try {
          audio.play('landing', { position: { x: player.position.x, y: player.position.y, z: player.position.z }, volume: 1.0 })
        } catch (e) {
          console.warn('[audio] landing play failed', e)
        }
      }
    }
    prevGrounded = player.grounded
  }

  function updateAnimationAndFx(dt: number) {
    if (player.alive && player.mode !== 'hanging' && player.mode !== 'climbing') logic.update(dt)
    scene.update(dt)
    if (player.climbJustStarted && character.animator.hasClip('ledge_climb_up')) {
      character.animator.playOverlay('ledge_climb_up', false)
    }
    const ledgeInfo =
      player.mode === 'hanging' || player.mode === 'climbing'
        ? { mode: player.mode, yaw: player.ledgeYaw, shimmy: player.ledgeShimmyDir }
        : undefined
    character.update(player.position, player.velocity, player.grounded, cam.yaw, dt, ledgeInfo, player.capsuleBottomOffset)
    if (!ledgeInfo) character.applySpineAim(cam.pitch)
    fpsMesh.update(dt)
    particles.update(dt)
    smokeSprites?.update(dt)
    flashSprites?.update(dt)
  }

  function syncCamera(dt: number) {
    cam.eyeOffset.y = player.eyeOffsetY
    const eyeAnchor = cam.mode === 'FPP' ? character.getHeadWorldPosition(_eyeTmp) ?? undefined : undefined
    cam.update(input, player.position, dt, physics, player.body, eyeAnchor)
    renderer.render(scene.three, cam.three)
  }

  function drawHud(dt: number) {
    frames++
    fpsTimer += dt
    if (fpsTimer >= 0.5) {
      fps = Math.round(frames / fpsTimer)
      frames = 0
      fpsTimer = 0
    }

    let banner: string | undefined
    let subtitle: string | undefined
    let scoreboard: string | undefined
    const match = getMatch()
    if (match) {
      const s = match.state
      scoreboard = `Round ${s.round}   You ${s.playerRoundWins} – ${s.botRoundWins} Bots   Enemies ${s.botsAlive}/${s.botsTotal}`
      if (s.phase === 'countdown') {
        banner = 'Get Ready'
        subtitle = `Round ${s.round} starts in ${Math.ceil(s.timer)}`
      } else if (s.banner && s.phase !== 'active') {
        banner = s.banner
        subtitle = `You ${s.playerRoundWins} – ${s.botRoundWins} Bots`
      } else if (!player.alive) {
        banner = 'You are down'
      }
    }

    hud.draw({
      mode: cam.mode,
      weaponName: logic.stats.name,
      ammoMag: logic.ammo[logic.current].mag,
      ammoReserve: logic.ammo[logic.current].reserve,
      reloading: logic.state === 'Reloading',
      fps,
      ads: cam.adsFactor,
      health: player.hp,
      maxHealth: player.maxHp,
      banner,
      subtitle,
      scoreboard,
    }, dt)
  }

  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now

    handleFrameInput()
    stepFixedUpdate(dt)
    handleLanding()
    updateAnimationAndFx(dt)
    syncCamera(dt)
    drawHud(dt)

    input.endFrame()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

main().catch((e) => {
  console.error('[fppandtpp] fatal', e)
})
