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
import { GLSLParticleSystem } from './particle/GLSLParticleSystem'
import { ImpactParticle } from './particle/ImpactParticle'
import { DecalSystem } from './particle/DecalSystem'
import { BulletInstancedParticleSystem } from './particle/BulletInstancedParticleSystem'
import { WeaponShooter } from './weapon/WeaponShooter'
import { WeaponLogicSystem } from './weapon/WeaponLogicSystem'
import { HUD } from './HUD'
import { Color, SRGBColorSpace, TextureLoader, Vector3 } from 'three'
import { WeaponTransformDebugger } from './debug/WeaponTransformDebugger'
import PlayerDebugger from './debug/PlayerDebugger'
import { SpriteFxSystem } from './particle/SpriteFxSystem'
import AudioManager from './audio/AudioManager'
import { MapMenu } from './MapMenu'
import { DamageSystem } from './ai/DamageSystem'
import { CharacterPool } from './ai/CharacterPool'
import { Enemy } from './ai/Enemy'
import { NavGrid } from './ai/NavGrid'
import { TdmMatch, type TdmConfig } from './modes/TdmMatch'
import type { AnimationManifest } from './character/ThirdPersonCharacter'

const FIXED_DT = 1 / 60
const _eyeTmp = new Vector3()
const _hitPoint = new Vector3()
const _hitNormal = new Vector3()
const _up = new Vector3(0, 1, 0)

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
      console.log('[map] assets missing for', id, '— using procedural fallback')
    } else {
      console.log('[map] loaded', id)
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

  // Player debugger UI
  new PlayerDebugger(player)

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
    console.log('[character] Mixamo manifest loaded')
    // Sync the climb FSM duration to the actual ledge_climb_up clip length so
    // the teleport-to-top happens exactly when the pull-up animation finishes
    // — otherwise short fixed timeouts cut the clip off mid-pose.
    const climbClip = character.animator.getClip('ledge_climb_up')
    if (climbClip) player.setClimbDuration(climbClip.duration)
  } catch {
    console.log(
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
    console.log(`[tdm] spawned ${enemies.length} free-roam test bot(s)`)
  }

  // Active Team Deathmatch match, if any. Built on demand (dev `?tdm=N`, or the
  // menu in TDM mode). When set, it owns enemy lifecycle + round flow.
  let match: TdmMatch | null = null

  // FPSMesh kept around solely for its recoil spring (camera kick); its
  // placeholder geometry is hidden — we use the Mixamo character's real arms
  // for both views now (head bone is hidden in FPP so you can see).
  const fpsMesh = new FPSMesh()
  fpsMesh.object.visible = false
  cam.three.add(fpsMesh.object)

  const weapons = new WeaponRenderer()
  new WeaponTransformDebugger(weapons)

  let smokeSprites: SpriteFxSystem | null = null
  let flashSprites: SpriteFxSystem | null = null
  try {
    setLoading('Loading textures...')
    const loader = new TextureLoader()
    const [smokeTex, flashTex] = await Promise.all([
      loader.loadAsync('./assets/kenney/smoke/PNG/White%20puff/whitePuff12.png'),
      loader.loadAsync('./assets/kenney/smoke/PNG/Flash/flash04.png'),
    ])
    smokeTex.colorSpace = SRGBColorSpace
    flashTex.colorSpace = SRGBColorSpace
    smokeSprites = new SpriteFxSystem(smokeTex, 220, false, new Color(0xd7dde6))
    flashSprites = new SpriteFxSystem(flashTex, 80, true, new Color(0xffcc78))
    scene.add(smokeSprites.object)
    scene.add(flashSprites.object)
    console.log('[fx] Kenney smoke/flash sprites enabled')
  } catch {
    console.log('[fx] Kenney smoke textures not available; using shader particles only')
  }

  // Particle systems live at scene root so they aren't culled with the FPP arms.
  const muzzleFx = new GLSLParticleSystem(new Color(0xffe07a), 0)
  scene.add(muzzleFx.points)
  const smokeFx = new GLSLParticleSystem(new Color(0x9da4ad), -0.6)
  scene.add(smokeFx.points)
  const impactFx = new ImpactParticle()
  scene.add(impactFx.system.points)
  const decals = new DecalSystem()
  scene.add(decals.object)
  const shells = new BulletInstancedParticleSystem()
  scene.add(shells.mesh)

  // Audio manager: preload weapon SFX from provided archives (fallback synth used for footsteps/landing)
  const audio = new AudioManager()
  try {
    // preload file data (decoding will occur once user allows audio)
    await audio.preloadMap({
      ak47: './assets/sfx/weapons/762x39 Single WAV.wav',
      pistol: './assets/sfx/weapons/556 Single WAV.wav',
    })
    // Don't await resume here (must be a user gesture). Install a one-time
    // gesture listener to resume audio when the user first interacts.
    const resumeOnGesture = async () => {
      try {
        await audio.resume()
        window.removeEventListener('pointerdown', resumeOnGesture)
        window.removeEventListener('keydown', resumeOnGesture)
      } catch (e) {
        console.warn('[audio] resume on gesture failed', e)
      }
    }
    window.addEventListener('pointerdown', resumeOnGesture)
    window.addEventListener('keydown', resumeOnGesture)
  } catch (e) {
    console.warn('[audio] preload failed', e)
  }

  const shooter = new WeaponShooter(
    physics,
    weapons,
    muzzleFx,
    impactFx,
    decals,
    shells,
    (hit, stats, shotDir) => {
      _hitPoint.set(hit.point.x, hit.point.y, hit.point.z)
      _hitNormal.set(hit.normal.x, hit.normal.y, hit.normal.z)

      // Combatant hit takes priority over prop reactions. If the ray struck an
      // enemy capsule, deal damage through the DamageSystem and stop — the body
      // "absorbs" the shot (we still draw a blood-ish impact puff below).
      if (damage.applyHitByCollider(hit.colliderHandle, stats.damage, player.team)) {
        if (smokeSprites) {
          smokeSprites.spawn(_hitPoint, {
            count: 3,
            life: [0.18, 0.4],
            speed: [0.2, 0.7],
            size: [0.12, 0.2],
            grow: 1.6,
            spread: 0.5,
            dir: _hitNormal,
            opacity: 0.5,
            gravity: -0.1,
            drag: 2.0,
          })
        }
        hud.flashHitMarker()
        try {
          audio.play('hitmarker', { volume: 0.5 })
        } catch {}
        return
      }

      scene.applyBulletImpulse(hit.colliderHandle, _hitPoint, shotDir, stats.damage)
      const reaction = scene.applyBulletHit(hit.colliderHandle, stats.damage)

      // Bullet impact = Kenney smoke puff (small), not fire.
      if (smokeSprites) {
        smokeSprites.spawn(_hitPoint, {
          count: 2,
          life: [0.2, 0.45],
          speed: [0.12, 0.45],
          size: [0.14, 0.24],
          grow: 1.8,
          spread: 0.35,
          dir: _hitNormal,
          opacity: 0.42,
          gravity: -0.16,
          drag: 2.2,
        })
      } else {
        // Fallback only when texture-based sprites are unavailable.
        impactFx.spawn(_hitPoint, _hitNormal, 4)
      }

      if (reaction.destroyed && reaction.kind === 'barrel') {
        smokeFx.spawn(_hitPoint, 24, 1.1, 1.4, 18, _up)
        if (!smokeSprites) impactFx.spawn(_hitPoint, _up, 22)
        smokeSprites?.spawn(_hitPoint, {
          count: 16,
          life: [0.7, 1.4],
          speed: [0.25, 0.95],
          size: [0.45, 0.9],
          grow: 2.6,
          spread: 0.9,
          dir: _up,
          opacity: 0.62,
          gravity: -0.2,
          drag: 1.0,
        })
      }
    },
    (muzzle, shotDir, stats) => {
      // play weapon shot SFX (stat id used to choose buffer)
      try {
        const id = stats?.id ?? 'ak47'
        audio.play(id, { position: { x: muzzle.x, y: muzzle.y, z: muzzle.z }, volume: 0.9, rate: 1 + (Math.random() - 0.5) * 0.06 })
      } catch (e) {
        console.warn('[audio] play failed', e)
      }
      flashSprites?.spawn(muzzle, {
        count: 1,
        life: [0.025, 0.045],
        speed: [0.03, 0.12],
        size: [0.14, 0.22],
        grow: 1.2,
        spread: 0.1,
        dir: shotDir,
        opacity: 0.55,
        gravity: 0,
        drag: 7.0,
      })
    },
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
  const hud = new HUD(renderer.hudCtx, renderer.hudCanvas)

  // Flash the red vignette whenever the player takes damage.
  player.onDamaged = () => hud.flashDamage()

  // ── Enemy combat helpers (used by Enemy.think via the loop) ──────────────────
  // Line-of-sight: cast from `from` toward `to`; clear if nothing solid is hit
  // before (almost) reaching the target. The target is the player capsule, so a
  // hit at ~target distance means an unobstructed view.
  const _losDir = new Vector3()
  function losClear(from: Vector3, to: Vector3): boolean {
    _losDir.set(to.x - from.x, to.y - from.y, to.z - from.z)
    const dist = _losDir.length()
    if (dist < 0.01) return true
    _losDir.multiplyScalar(1 / dist)
    const hit = physics.raycast(
      { x: from.x, y: from.y, z: from.z },
      { x: _losDir.x, y: _losDir.y, z: _losDir.z },
      dist - 0.4,
    )
    // No hit before (dist-0.4) → clear view to the player.
    return !hit
  }

  // Enemy gunfire FX: muzzle flash + sound. Reuses the player's particle systems.
  const _efxDir = new Vector3()
  function enemyFireFx(muzzle: Vector3, dir: Vector3) {
    _efxDir.copy(dir)
    muzzleFx.spawn(muzzle, 1, 0.025, 0.6, 3, _efxDir)
    flashSprites?.spawn(muzzle, {
      count: 1,
      life: [0.025, 0.045],
      speed: [0.03, 0.1],
      size: [0.12, 0.2],
      grow: 1.2,
      spread: 0.1,
      dir: _efxDir,
      opacity: 0.9,
      gravity: 0,
      drag: 4,
    })
    try {
      audio.play('ak47', { position: { x: muzzle.x, y: muzzle.y, z: muzzle.z }, volume: 0.5, rate: 1 + (Math.random() - 0.5) * 0.08 })
    } catch {}
  }

  // ── Team Deathmatch lifecycle ────────────────────────────────────────────────
  function startMatch(cfg: TdmConfig) {
    endMatch()
    match = new TdmMatch(
      {
        physics,
        scene,
        pool: enemyPool,
        player,
        damage,
        getNav: () => nav,
        hasLineOfSight: losClear,
        onEnemyFire: enemyFireFx,
        playerFiredNow: () => input.lmb && logic.state === 'Idle',
      },
      cfg,
    )
    match.onMatchOver = () => {
      endMatch()
      // Drop back to the map menu after a match.
      void mapMenu.show().then(async (selection) => {
        if (selection.mapId !== currentMapId) {
          await loadMap(selection.mapId)
          nav = buildNav()
        }
        player.respawn(new Vector3(0, 5, 0))
        // If the user selected TDM, start a new match; else just stay in roam.
        if (selection.mode === 'tdm' && selection.tdm) {
          startMatch(selection.tdm)
        }
      })
    }
  }
  function endMatch() {
    if (match) {
      match.dispose()
      match = null
    }
  }

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
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now

    if (input.wasPressed('KeyV')) cam.toggleMode()
    if (input.wasPressed('Digit1')) logic.requestSwitch('ak47')
    if (input.wasPressed('Digit2')) logic.requestSwitch('pistol')
    if (input.wasPressed('Digit3')) logic.requestSwitch('knife')
    if (input.wasPressed('KeyM') && !mapMenu.isOpen()) {
      // Open the map menu; selecting a different map clears the current one
      // and rebuilds from the registry. Re-selecting the same id is a no-op
      // beyond closing the menu (handy as a "pause"). The pointer-lock hint
      // returns once the user clicks the canvas again.
      void mapMenu.show().then(async (selection) => {
        if (selection.mapId === currentMapId && selection.mode === 'roam') return
        if (selection.mapId !== currentMapId) {
          await loadMap(selection.mapId)
          // Reset the player so they don't fall through removed geometry.
          player.body.setTranslation({ x: 0, y: 5, z: 0 }, true)
          player.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
          // Rebuild navigation for the new map's geometry.
          nav = buildNav()
        }
        // If TDM is selected, start a match; otherwise just stay in roam.
        if (match) endMatch()
        if (selection.mode === 'tdm' && selection.tdm) {
          startMatch(selection.tdm)
        }
      })
    }

    acc += dt
    while (acc >= FIXED_DT) {
      // While dead in a match, freeze player movement (spectate until respawn).
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

    // Landing detection: if we were airborne and now grounded, optionally play
    // the landing animation + impact thud. A single threshold so the visual
    // flex and the sound agree — small hops produce neither (the air-layer
    // additive already shows the legs tucking, no need to also overlay a
    // full-body landing pose that would fight the locomotion).
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

    // footsteps SFX removed — will be provided later by user.

    // Skip the weapon FSM entirely while on a ledge — the hands are busy — or
    // while dead in a match. This also prevents the rifle from being
    // fired/reloaded mid-hang, which would clash with the ledge_idle pose.
    if (player.alive && player.mode !== 'hanging' && player.mode !== 'climbing') logic.update(dt)
    scene.update(dt)
    // Trigger the climb pull-up overlay the frame the climb starts. It's a
    // one-shot full-body clip; while it plays, locomotion fades to 0 and the
    // overlay drives the skeleton. When it finishes, the locomotion blend
    // restores naturally (player.mode is back to 'normal' by then).
    if (player.climbJustStarted && character.animator.hasClip('ledge_climb_up')) {
      character.animator.playOverlay('ledge_climb_up', false)
    }
    const ledgeInfo =
      player.mode === 'hanging' || player.mode === 'climbing'
        ? { mode: player.mode, yaw: player.ledgeYaw, shimmy: player.ledgeShimmyDir }
        : undefined
    character.update(player.position, player.velocity, player.grounded, cam.yaw, dt, ledgeInfo, player.capsuleBottomOffset)
    // Skip the additive spine aim while on a ledge — the hang/climb pose owns
    // the upper body and we don't want camera pitch warping the chest.
    if (!ledgeInfo) character.applySpineAim(cam.pitch)
    fpsMesh.update(dt)
    muzzleFx.update(dt)
    smokeFx.update(dt)
    smokeSprites?.update(dt)
    flashSprites?.update(dt)
    impactFx.update(dt)
    decals.update(dt)
    shells.update(dt)

    // Keep the camera's fallback eye offset in sync with the player's live
    // (crouch-aware) eye height, so the FPP placeholder view and the TPP
    // shoulder anchor both lower when ducking.
    cam.eyeOffset.y = player.eyeOffsetY

    // FPP eye-anchor follows the character's head bone (head is invisibly
    // scaled-to-zero in FPP but its transform still tracks the body). When
    // crouching, the capsule center (and thus the head bone) lowers on its own
    // because the body is shifted down to keep the feet planted — so the FPP
    // view ducks for free without needing a crouch pose.
    const eyeAnchor = cam.mode === 'FPP' ? character.getHeadWorldPosition(_eyeTmp) ?? undefined : undefined
    cam.update(input, player.position, dt, physics, player.body, eyeAnchor)

    renderer.render(scene.three, cam.three)

    // FPS counter.
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

    input.endFrame()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

main().catch((e) => {
  console.error('[fppandtpp] fatal', e)
})
