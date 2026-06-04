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
import { preloadEnemyWeapon } from './ai/EnemyWeapon'
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
import { setupDevBots } from './setup/devBots'
import { createMapLoader, createMapMenuReopener, pickInitialMap, startRequestedMatch } from './setup/mapFlow'
import { drawHudFrame } from './setup/hudState'
import { LightingDebugger } from './debug/LightingDebugger'

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
  const loadingUi = {
    show(text: string) {
      setLoading(text)
      if (loadingEl) loadingEl.style.display = ''
    },
    hide: hideLoading,
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

  const mapMenu = new MapMenu()
  let currentMapId = 'shootRange'
  const loadMap = createMapLoader(scene, physics, loadingUi, (id) => {
    currentMapId = id
  })

  hideLoading()
  const { pendingMatch } = await pickInitialMap(mapMenu, loadMap)

  const player = new Player(physics)
  scene.add(player.debugMesh)
  player.debugMesh.visible = false

  const damage = new DamageSystem()
  damage.register(player)
  damage.registerCollider(player.colliderHandle, player)

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
    const climbClip = character.animator.getClip('ledge_climb_up')
    if (climbClip) player.setClimbDuration(climbClip.duration)
  } catch {
    dlog('[character] using placeholder humanoid')
  }

  const enemyPool = new CharacterPool()
  if (characterManifest) await enemyPool.init(characterManifest as AnimationManifest)
  else await enemyPool.init({ base: '', animations: {} })
  await preloadEnemyWeapon()

  const params = new URLSearchParams(location.search)
  let navDebug: import('three').Object3D | null = null
  let navDbgEnabled = params.has('nav')
  function buildNav(): NavGrid {
    if (navDebug) { scene.remove(navDebug); navDebug = null }
    const grid = new NavGrid(physics, { halfExtent: 60, cell: 0.9 })
    if (navDbgEnabled) { navDebug = grid.buildDebugObject(); scene.add(navDebug) }
    return grid
  }
  let nav: NavGrid = buildNav()

  // Lighting debugger — toggled from mod menu (N key)
  let lightingDbg: LightingDebugger | null = null

  // Register mod menu callbacks (called by index.html onclick handlers)
  ;(window as any)._modCallbacks = {
    light: () => {
      if (lightingDbg) {
        lightingDbg.destroy()
        lightingDbg = null
      } else {
        lightingDbg = new LightingDebugger(scene, cam)
      }
      return !!lightingDbg
    },
  }

  const enemies: Enemy[] = setupDevBots({ physics, scene, enemyPool, damage, nav, params })

  const fpsMesh = new FPSMesh()
  fpsMesh.object.visible = false
  cam.three.add(fpsMesh.object)

  const weapons = new WeaponRenderer()
  if (isDebug()) new WeaponTransformDebugger(weapons)

  setLoading('Loading textures...')
  const { smokeSprites, flashSprites } = await createSpriteFx(scene)
  const particles = createParticles(scene)
  const { muzzleFx, smokeFx, impactFx, decals, shells } = particles
  const { audio } = await createAudio()

  let hud!: HUD
  const weaponHitHandlers = createWeaponHitHandlers({
    damage, player, scene, smokeSprites, flashSprites, smokeFx, impactFx,
    getHud: () => hud, audio,
  })
  const shooter = new WeaponShooter(physics, weapons, muzzleFx, impactFx, decals, shells, weaponHitHandlers.onHit, weaponHitHandlers.onMuzzle)

  async function equip(id: WeaponId) {
    const stats = WEAPONS[id]
    await weapons.attachTo(id, character.rightHand, stats.tppOffset)
    character.useAnimationSet(id === 'pistol' ? 'pistol' : id === 'knife' ? 'knife' : 'rifle')
  }

  const applyMode = () => {
    character.object.visible = true
    character.setHeadVisible(cam.mode === 'TPP')
  }
  cam.onModeChange = applyMode
  await equip('ak47')
  applyMode()

  const logic = new WeaponLogicSystem(input, cam, weapons, shooter, fpsMesh, character, player.body, equip)
  hud = new HUD(renderer.hudCtx, renderer.hudCanvas)

  player.onDamaged = () => hud.flashDamage()

  const { losClear, enemyFireFx } = createEnemyCombatHelpers({
    physics, audio, muzzleFx, getFlashSprites: () => flashSprites, playerBody: player.body,
  })
  const matchController = createMatchController({
    physics, scene, mapMenu, player, enemyPool, damage,
    getNav: () => nav, setNav: (nextNav) => { nav = nextNav },
    onEnemyFire: enemyFireFx, getCurrentMapId: () => currentMapId, loadMap, buildNav,
  })
  const { startMatch, endMatch, getMatch } = matchController
  startRequestedMatch(pendingMatch, params, startMatch)

  let last = performance.now()
  let prevGrounded = player.grounded
  let acc = 0
  let frames = 0
  let fpsTimer = 0
  let fps = 0
  const reopenMapMenu = createMapMenuReopener({
    mapMenu, getCurrentMapId: () => currentMapId, loadMap, player,
    rebuildNav: buildNav, setNav: (nextNav) => { nav = nextNav },
    hasActiveMatch: () => !!getMatch(), endMatch, startMatch,
  })

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
        for (const e of enemies) {
          if (e.alive) {
            e.think({
              nav, target: player, targetPos: player.position,
              dealDamage: (dmg) => damage.applyDamage(player, dmg, e.team),
              onFire: (muzzle, dir) => enemyFireFx(muzzle, dir),
            }, FIXED_DT)
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
    const ledgeInfo = player.mode === 'hanging' || player.mode === 'climbing'
      ? { mode: player.mode, yaw: player.ledgeYaw, shimmy: player.ledgeShimmyDir } : undefined
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
    if (fpsTimer >= 0.5) { fps = Math.round(frames / fpsTimer); frames = 0; fpsTimer = 0 }
    drawHudFrame({ hud, cam, logic, player }, fps, getMatch(), dt)
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