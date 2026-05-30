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
export const deathMatch1: MapDefinition = {
  id: 'deathmatch1',
  name: 'Team death match 1',
  description: 'A pre-authored tdm (monolithic GLB). Atmospheric, large, no reactive props.',
  scene: { noDefaultGround: true },
  async build(b) {
    await b.loadGlb('./assets/maps/lowpoly__fps__tdm__game__map_by_resoforge.glb', { scale: 4, yOffset: 0 })
  },
}
