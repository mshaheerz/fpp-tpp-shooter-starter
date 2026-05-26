# Character assets (Mixamo)

Drop your downloaded Mixamo files here:

```
public/assets/character/
├── ybot.glb                        ← Y Bot from Mixamo, WITH SKIN
├── manifest.json                   ← rename manifest.json.example to this
└── animations/
    ├── idle.glb                    (Mixamo: "Idle",          WITHOUT SKIN)
    ├── walk_forward.glb            (Mixamo: "Walking",       WITHOUT SKIN)
    ├── run_forward.glb             (Mixamo: "Running",       WITHOUT SKIN)
    ├── strafe_left.glb             (Mixamo: "Left Strafe Walking",  WITHOUT SKIN)
    ├── strafe_right.glb            (Mixamo: "Right Strafe Walking", WITHOUT SKIN)
    ├── walk_backward.glb           (Mixamo: "Walking Backwards",    WITHOUT SKIN)
    ├── jump.glb                    (Mixamo: "Jumping",       WITHOUT SKIN)
    ├── firing_rifle.glb            (Mixamo: "Firing Rifle",  WITHOUT SKIN)
    └── reload_rifle.glb            (Mixamo: "Reload Rifle",  WITHOUT SKIN)
```

Until you do, the game falls back to a placeholder humanoid built from primitives.

Inspect a downloaded GLB to confirm bone names:

```
npx tsx scripts/inspect-glb.ts public/assets/character/ybot.glb
```

The TPP weapon attaches to `mixamorigRightHand`; aim uses `mixamorigSpine1` +
`mixamorigSpine2`. Three.js's GLTF loader strips the `:` so the runtime expects
those exact names (or anything ending with `RightHand` / `Spine1` / `Spine2`).
