import type { MapDefinition } from './index'

/**
 * The original Kenney shoot-range layout. Implementation still lives inside
 * `Scene.buildKenneyShootRangeBody` to keep the diff small; this module is
 * just the registry entry pointing at it.
 */
export const shootRange: MapDefinition = {
  id: 'shootRange',
  name: 'Shooting Range',
  description: 'Open block grid with road cross, perimeter walls, mixed buildings, and a central shooting playground.',
  scene: { groundSize: 220, groundColor: 0x6d7c62 },
  async build(b) {
    // The Scene exposes the legacy body builder so callers don't need to copy
    // 80 lines of layout into a fresh map module just to keep this map alive.
    // `b.root.parent` is the Three scene; we reach the Scene class via global
    // registration on first load — but simpler: pass the original sequence
    // inline here so this file is self-contained.
    const roads = './assets/kenney/roads/Models/GLB%20format/'
    const prototype = './assets/kenney/prototype/Models/GLB%20format/'
    const industrial = './assets/kenney/industrial/Models/GLB%20format/'
    const suburban = './assets/kenney/suburban/Models/GLB%20format/'

    const tileFoot = await b.footprint(`${roads}tile-low.glb`)
    const roadFoot = await b.footprint(`${roads}road-straight.glb`)
    const TILE = Math.max(1.8, tileFoot.x, tileFoot.z, roadFoot.x, roadFoot.z)
    const GRID = 7
    const HALF = Math.floor(GRID / 2)

    // Base block grid.
    for (let gx = -HALF; gx <= HALF; gx++) {
      for (let gz = -HALF; gz <= HALF; gz++) {
        await b.place(`${roads}tile-low.glb`, [gx * TILE, 0, gz * TILE], 0, 1)
      }
    }

    // Cross-shaped road network.
    await b.place(`${roads}road-crossroad.glb`, [0, 0.01, 0], 0, 1)
    for (let i = 1; i <= HALF; i++) {
      await b.place(`${roads}road-straight.glb`, [0, 0.01, i * TILE], 0, 1)
      await b.place(`${roads}road-straight.glb`, [0, 0.01, -i * TILE], 0, 1)
      await b.place(`${roads}road-straight.glb`, [i * TILE, 0.01, 0], Math.PI / 2, 1)
      await b.place(`${roads}road-straight.glb`, [-i * TILE, 0.01, 0], Math.PI / 2, 1)
    }
    await b.place(`${roads}road-intersection.glb`, [0, 0.01, HALF * TILE], 0, 1)
    await b.place(`${roads}road-intersection.glb`, [0, 0.01, -HALF * TILE], 0, 1)
    await b.place(`${roads}road-intersection.glb`, [HALF * TILE, 0.01, 0], Math.PI / 2, 1)
    await b.place(`${roads}road-intersection.glb`, [-HALF * TILE, 0.01, 0], Math.PI / 2, 1)

    // Block boundaries / arena edges using walls.
    const edge = HALF * TILE + TILE
    for (let i = -HALF - 1; i <= HALF + 1; i++) {
      await b.place(`${prototype}wall.glb`, [i * TILE, 0, edge], 0, 1)
      await b.place(`${prototype}wall.glb`, [i * TILE, 0, -edge], 0, 1)
      await b.place(`${prototype}wall.glb`, [edge, 0, i * TILE], Math.PI / 2, 1)
      await b.place(`${prototype}wall.glb`, [-edge, 0, i * TILE], Math.PI / 2, 1)
    }
    await b.place(`${prototype}wall-corner.glb`, [edge, 0, edge], 0, 1)
    await b.place(`${prototype}wall-corner.glb`, [-edge, 0, edge], Math.PI / 2, 1)
    await b.place(`${prototype}wall-corner.glb`, [-edge, 0, -edge], Math.PI, 1)
    await b.place(`${prototype}wall-corner.glb`, [edge, 0, -edge], -Math.PI / 2, 1)

    // Industrial + suburban building belts.
    const industrialRow = [
      { m: 'building-a.glb', x: -10, z: -10, r: Math.PI * 0.15, h: 7.2 },
      { m: 'building-b.glb', x: -6, z: -11, r: Math.PI * 0.05, h: 7.2 },
      { m: 'building-c.glb', x: -2, z: -10, r: Math.PI * 0.12, h: 7.2 },
    ]
    for (const bb of industrialRow) {
      await b.place(`${industrial}${bb.m}`, [bb.x, 0, bb.z], bb.r, 1, undefined, bb.h)
    }
    const suburbanRow = [
      { m: 'building-type-a.glb', x: 3, z: 10, r: Math.PI, h: 6.2 },
      { m: 'building-type-b.glb', x: 7, z: 11, r: Math.PI * 0.9, h: 6.2 },
      { m: 'building-type-c.glb', x: 11, z: 10, r: Math.PI * 0.95, h: 6.2 },
    ]
    for (const bb of suburbanRow) {
      await b.place(`${suburban}${bb.m}`, [bb.x, 0, bb.z], bb.r, 1, undefined, bb.h)
    }

    // Decorative fences/trees.
    for (let i = -2; i <= 2; i++) {
      await b.place(`${suburban}fence-1x3.glb`, [10.6, 0, i * 2.2], Math.PI / 2, 1, undefined, 2.1)
    }
    await b.place(`${suburban}tree-large.glb`, [8, 0, 6], 0, 1, undefined, 5.5)
    await b.place(`${suburban}tree-small.glb`, [12, 0, 5], 0, 1, undefined, 4.4)
    await b.place(`${suburban}tree-small.glb`, [9, 0, 9], 0, 1, undefined, 4.4)

    // Central shooting playground with reactive targets.
    await b.place(`${prototype}crate-color.glb`, [1.8, 0.55, -4.6], 0.2, 1.08, { kind: 'crate', hp: 70 })
    await b.place(`${prototype}crate.glb`, [3.2, 0.55, -5.4], -0.35, 1.05, { kind: 'crate', hp: 70 })
    await b.place(`${prototype}crate.glb`, [-2.9, 0.55, 4.8], 0.15, 1.05, { kind: 'crate', hp: 70 })
    await b.place(`${industrial}detail-tank.glb`, [-1.7, 0.7, -7.2], 0.1, 1.1, { kind: 'barrel', hp: 120 })
    await b.place(`${industrial}detail-tank.glb`, [-3.6, 0.7, -8.4], -0.2, 1.1, { kind: 'barrel', hp: 120 })
    await b.place(`${industrial}detail-tank.glb`, [4.2, 0.7, 6.8], 0.25, 1.1, { kind: 'barrel', hp: 120 })
    await b.place(`${prototype}target-b-square.glb`, [0, 1.25, -10], 0, 1, { kind: 'target', hp: 40 })
    await b.place(`${prototype}target-a-round.glb`, [2.5, 1.35, -11], 0, 1, { kind: 'target', hp: 40 })
    await b.place(`${prototype}target-b-round.glb`, [-2.2, 1.35, 9.2], Math.PI, 1, { kind: 'target', hp: 40 })
  },
}
