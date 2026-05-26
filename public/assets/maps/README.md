# Maps

Drop a `.glb` map here as `dust.glb` to replace the procedural-ground fallback:

```
public/assets/maps/dust.glb
```

Convention: Y is up, 1 Three.js unit = 1 meter. Every mesh becomes a static
Rapier trimesh collider, so make sure the geometry is what you want for collisions
(no double-sided open shells, no leftover construction meshes).
