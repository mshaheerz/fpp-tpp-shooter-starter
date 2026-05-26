# Weapon GLBs

```
public/assets/weapons/
├── ak47.glb
├── pistol.glb
└── knife.glb
```

If a file is missing, the renderer falls back to a chunky primitive weapon so
the rest of the game keeps working.

The weapon's local +Z is treated as "forward" (toward the muzzle) and +Y as up.
Adjust `fppOffset` and `tppOffset` in `src/weapon/WeaponData.ts` per weapon to
position it correctly in the hand / in front of the camera.
