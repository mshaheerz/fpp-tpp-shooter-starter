import type { MapDefinition } from './index'

/**
 * Ghost City: a pre-authored monolithic GLB (`public/assets/maps/ghost_city.glb`).
 *
 * Unlike the Kenney-prop maps (shoot-range, suburban street, industrial yard)
 * which compose a scene out of many small placed GLBs, this one ships the
 * entire environment — terrain, buildings, props — as a single file. The
 * builder's `loadGlb` walks every mesh and creates per-submesh trimesh
 * colliders, so collisions match the visual geometry exactly.
 *
 * `noDefaultGround: true` because the GLB has its own floor; otherwise the
 * default flat plane would z-fight with whatever ground geometry the file
 * already contains.
 */
export const ghostCity: MapDefinition = {
  id: 'ghostCity',
  name: 'Ghost City',
  description: 'A pre-authored urban environment (monolithic GLB). Atmospheric, large, no reactive props.',
  scene: { noDefaultGround: true },
  async build(b) {
    await b.loadGlb('./assets/maps/ghost_city.glb', { scale: 1, yOffset: 0 })
  },
}
