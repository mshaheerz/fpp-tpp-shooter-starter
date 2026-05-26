# FPP + TPP Browser FPS Starter

A Three.js + Rapier + TypeScript starter inspired by the NotStrike template, with
**both first-person and third-person views** toggleable on a key. Built for the
browser (~925 KB gzipped first load) using a Mixamo-rigged humanoid for the TPP
character.

```
npm install
npm run dev
```

Open http://localhost:5173, click the canvas to lock the pointer, and you're in.

## Controls

| Key   | Action                  |
|-------|-------------------------|
| WASD  | Move                    |
| Shift | Sprint                  |
| Space | Jump                    |
| R     | Reload                  |
| 1/2/3 | Equip AK / pistol / knife |
| LMB   | Fire                    |
| **V** | **Toggle FPP ↔ TPP**     |

## Architecture

```
src/
├── main.ts                 Bootstrap, fixed-step physics loop, view toggle wiring
├── Renderer.ts             WebGLRenderer + HUD canvas overlay
├── Scene.ts                Lights, sky, GLB map → trimesh colliders
├── PhysicsSystem.ts        Rapier 3D world, raycast, spherecast
├── InputManager.ts         Pointer Lock + edge-triggered keys
├── Camera.ts               FPP/TPP rig; spherecast back-off for TPP camera
├── Player.ts               Quake-style PM_Accelerate on a dynamic capsule
├── HUD.ts                  2D crosshair, ammo, fps overlay
├── weapon/
│   ├── WeaponData.ts          AK / pistol / knife stats + per-mode offsets
│   ├── WeaponLogicSystem.ts   Idle / Firing / Reloading / Switching FSM
│   ├── WeaponRenderer.ts      Loads each GLB once; reparents on V toggle
│   └── WeaponShooter.ts       Raycast + impact / decal / shell / muzzle FX
├── particle/
│   ├── GLSLParticleSystem.ts        Custom shader Points; muzzle / smoke
│   ├── BulletInstancedParticleSystem.ts InstancedMesh brass shells
│   ├── DecalSystem.ts               Bullet-hole decals (FIFO, fade)
│   └── ImpactParticle.ts            Debris cone along surface normal
├── character/
│   ├── ThirdPersonCharacter.ts   Loads Mixamo Y Bot + anims; spine aim
│   └── CharacterAnimator.ts      Layered AnimationMixer (loco + additive overlays)
└── animation/
    ├── AnimationSystem.ts    MarkerWatcher: time-based animation events
    └── FPSMesh.ts            FPP arms placeholder; recoil spring
```

## How FPP and TPP stay in sync

A single weapon `Object3D` is reparented when you press V:

  - **FPP**: parented to `cam.three → fpsMesh.weaponAttach`
  - **TPP**: parented to `character.rightHand` (the `mixamorigRightHand` bone)

The crosshair raycast always uses `camera.three.position` and the camera-forward
direction, so shooting behavior is identical in both views — only what you *see*
changes. In TPP, `applySpineAim(pitch)` adds an additive rotation to the
`mixamorigSpine1` / `mixamorigSpine2` bones so the upper body actually points at
where the crosshair is.

## Asset setup (you provide)

The game runs out of the box with primitive placeholders. Drop these in to upgrade:

### Map

```
public/assets/maps/dust.glb         (Y-up, 1 unit = 1 m, every mesh → trimesh collider)
```

### Mixamo character

1. Go to **[mixamo.com](https://www.mixamo.com)** → sign in (free Adobe account)
2. Pick **"Y Bot"** and download:
   - Format: **glTF Binary (.glb)** (or FBX → convert with `fbx2gltf`)
   - Skin: **WITH SKIN**
   - Save as `public/assets/character/ybot.glb`
3. For each animation below, search Mixamo, click Download:
   - Format: **glTF Binary (.glb)**
   - Skin: **WITHOUT SKIN** ← reuses Y Bot's skeleton, no retargeting needed
   - FPS: 30, Keyframe Reduction: none
4. Save under `public/assets/character/animations/`:

| File                  | Mixamo search term       |
|-----------------------|--------------------------|
| `idle.glb`            | Idle                     |
| `walk_forward.glb`    | Walking                  |
| `run_forward.glb`     | Running                  |
| `strafe_left.glb`     | Left Strafe Walking      |
| `strafe_right.glb`    | Right Strafe Walking     |
| `walk_backward.glb`   | Walking Backwards        |
| `jump.glb`            | Jumping                  |
| `firing_rifle.glb`    | Firing Rifle             |
| `reload_rifle.glb`    | Reload Rifle             |

5. Rename `public/assets/character/manifest.json.example` → `manifest.json`.

The runtime fetches `manifest.json`; if it's missing, you get the placeholder
humanoid. Adding more animations is data-only — extend the manifest and the
bindings in `ThirdPersonCharacter.load()`.

### Weapons

Drop GLBs into `public/assets/weapons/ak47.glb` etc. If absent, a chunky
primitive rifle is rendered. Adjust `fppOffset` / `tppOffset` in
`src/weapon/WeaponData.ts` so the model sits naturally in the hand and in front
of the camera.

## Inspecting a GLB

```
npx tsx scripts/inspect-glb.ts public/assets/character/ybot.glb
```

Lists animation clips, bone node names, and skins — useful to confirm the
exact Mixamo bone names you got and adjust `WeaponData.ts` offsets.

## Rapier WASM note

This template uses **`@dimforge/rapier3d-compat`**, which inlines the WASM as
base64 (≈ 760 KB gzipped). No extra Vite plugins. If you switch to the
non-`-compat` `@dimforge/rapier3d`, you'll need `vite-plugin-wasm` +
`vite-plugin-top-level-await`.

## Bundle size

Latest production build:

```
dist/assets/index-*.js     ~24 KB gz   (app code)
dist/assets/three-*.js    ~139 KB gz   (Three.js + GLTFLoader)
dist/assets/rapier-*.js   ~761 KB gz   (Rapier WASM, base64-embedded)
                          ───────────
                          ~925 KB gz first load
```

GLB assets (map, character, weapons) lazy-load and don't count against this.

## License

MIT — go nuts.
