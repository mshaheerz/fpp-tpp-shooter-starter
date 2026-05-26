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

  // Map: Kenney modular-only mode.
  setLoading('Loading map...')
  const hasKenneyRange = await scene.addKenneyShootRange(physics)
  if (hasKenneyRange) {
    console.log('[map] Kenney modular map loaded (reactive targets enabled)')
  } else {
    scene.addProceduralGround(physics)
    console.log('[map] Kenney assets missing; using procedural fallback')
  }

  const player = new Player(physics)
  scene.add(player.debugMesh)
  player.debugMesh.visible = false

  // Player debugger UI
  new PlayerDebugger(player)

  const character = new ThirdPersonCharacter()
  scene.add(character.object)
  try {
    setLoading('Loading character...')
    const res = await fetch('./assets/character/manifest.json')
    if (!res.ok) throw new Error('no manifest')
    const manifest = await res.json()
    await character.load(manifest)
    console.log('[character] Mixamo manifest loaded')
  } catch {
    console.log(
      '[character] using placeholder humanoid — drop ybot.glb + animation GLBs into public/assets/character/ and add manifest.json',
    )
  }

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

  // All done — hide loading overlay
  hideLoading()

  const logic = new WeaponLogicSystem(input, cam, weapons, shooter, fpsMesh, character, player.body, equip)
  const hud = new HUD(renderer.hudCtx, renderer.hudCanvas)

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

    acc += dt
    while (acc >= FIXED_DT) {
      player.update(FIXED_DT, input, cam)
      physics.step(FIXED_DT)
      acc -= FIXED_DT
    }

    // Landing detection: if we were airborne and now grounded, play the landing
    // animation when falling fast enough to warrant it.
    if (!prevGrounded && player.grounded) {
      const impactSpeed = player.velocity.y
      if (impactSpeed < -2.0) {
        if (character.animator.hasClip('falling_to_landing')) {
          character.animator.playOverlay('falling_to_landing', false)
        }
        // landing SFX
        try {
          audio.play('landing', { position: { x: player.position.x, y: player.position.y, z: player.position.z }, volume: 1.0 })
        } catch (e) {
          console.warn('[audio] landing play failed', e)
        }
      }
    }
    prevGrounded = player.grounded

    // footsteps SFX removed — will be provided later by user.

    logic.update(dt)
    scene.update(dt)
    character.update(player.position, player.velocity, player.grounded, cam.yaw, dt)
    character.applySpineAim(cam.pitch)
    fpsMesh.update(dt)
    muzzleFx.update(dt)
    smokeFx.update(dt)
    smokeSprites?.update(dt)
    flashSprites?.update(dt)
    impactFx.update(dt)
    decals.update(dt)
    shells.update(dt)

    // FPP eye-anchor follows the character's head bone (head is invisibly
    // scaled-to-zero in FPP but its transform still tracks the body).
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

    hud.draw({
      mode: cam.mode,
      weaponName: logic.stats.name,
      ammoMag: logic.ammo[logic.current].mag,
      ammoReserve: logic.ammo[logic.current].reserve,
      reloading: logic.state === 'Reloading',
      fps,
      ads: cam.adsFactor,
    })

    input.endFrame()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

main().catch((e) => {
  console.error('[fppandtpp] fatal', e)
})
