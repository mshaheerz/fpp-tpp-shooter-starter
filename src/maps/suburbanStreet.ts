import type { MapDefinition } from './index'

/**
 * Suburban Street: a long residential road with houses on both sides, driveways
 * leading to the street, sidewalks of fence/tree decoration, and a handful of
 * reactive crates and barrels tucked into side yards for shooting.
 *
 * The road runs along the X axis. Houses (suburban building-type-*) are placed
 * in two parallel rows facing inward. Fences fill the gaps; trees soften the
 * silhouette; a few back-alley crates give the player something to engage.
 */
export const suburbanStreet: MapDefinition = {
  id: 'suburbanStreet',
  name: 'Suburban Street',
  description: 'Long residential street — houses, driveways, fences and trees on both sides. A handful of reactive props in side alleys.',
  scene: { groundSize: 260, groundColor: 0x7a8a66 },
  async build(b) {
    const roads = './assets/kenney/roads/Models/GLB%20format/'
    const suburban = './assets/kenney/suburban/Models/GLB%20format/'
    const prototype = './assets/kenney/prototype/Models/GLB%20format/'
    const industrial = './assets/kenney/industrial/Models/GLB%20format/'

    // Measure the road segment so houses align with its width.
    const roadFoot = await b.footprint(`${roads}road-straight.glb`)
    const ROAD_LEN = Math.max(2.0, roadFoot.x, roadFoot.z)
    const STEPS = 7 // number of road segments either side of the centre crossroad

    // Lay the road down the X axis.
    await b.place(`${roads}road-crossroad.glb`, [0, 0.01, 0], 0, 1)
    for (let i = 1; i <= STEPS; i++) {
      await b.place(`${roads}road-straight.glb`, [i * ROAD_LEN, 0.01, 0], Math.PI / 2, 1)
      await b.place(`${roads}road-straight.glb`, [-i * ROAD_LEN, 0.01, 0], Math.PI / 2, 1)
    }
    // Bookend the road with dead-end barriers so the player can see it terminates.
    await b.place(`${roads}road-end-barrier.glb`, [(STEPS + 1) * ROAD_LEN, 0.01, 0], -Math.PI / 2, 1)
    await b.place(`${roads}road-end-barrier.glb`, [-(STEPS + 1) * ROAD_LEN, 0.01, 0], Math.PI / 2, 1)

    // Houses — two rows of 7 alternating between several suburban types so the
    // street reads as a real neighborhood, not a copy-paste loop.
    const houseTypes = [
      'building-type-a.glb',
      'building-type-c.glb',
      'building-type-e.glb',
      'building-type-g.glb',
      'building-type-i.glb',
      'building-type-k.glb',
      'building-type-m.glb',
    ]
    const HOUSE_OFFSET_Z = 6.5
    const HOUSE_HEIGHT = 6.4
    for (let i = 0; i < STEPS; i++) {
      const x = (i - STEPS / 2 + 0.5) * ROAD_LEN * 1.05
      // North row faces -Z (toward road); south row faces +Z.
      const north = houseTypes[i % houseTypes.length]
      const south = houseTypes[(i + 3) % houseTypes.length]
      await b.place(`${suburban}${north}`, [x, 0, -HOUSE_OFFSET_Z], Math.PI, 1, undefined, HOUSE_HEIGHT)
      await b.place(`${suburban}${south}`, [x, 0, HOUSE_OFFSET_Z], 0, 1, undefined, HOUSE_HEIGHT)
    }

    // Driveways connecting houses to the road on both rows.
    for (let i = 0; i < STEPS; i++) {
      const x = (i - STEPS / 2 + 0.5) * ROAD_LEN * 1.05
      await b.place(`${suburban}driveway-short.glb`, [x, 0.005, -3], 0, 1)
      await b.place(`${suburban}driveway-short.glb`, [x, 0.005, 3], Math.PI, 1)
    }

    // Fences forming the perimeter behind each house row.
    const FENCE_Z_NORTH = -HOUSE_OFFSET_Z - 3.6
    const FENCE_Z_SOUTH = HOUSE_OFFSET_Z + 3.6
    for (let i = -STEPS; i <= STEPS; i++) {
      await b.place(`${suburban}fence-1x4.glb`, [i * 2.0, 0, FENCE_Z_NORTH], 0, 1, undefined, 1.6)
      await b.place(`${suburban}fence-1x4.glb`, [i * 2.0, 0, FENCE_Z_SOUTH], 0, 1, undefined, 1.6)
    }

    // Trees — scattered down both sidewalks.
    const treeSpotsN: Array<[number, number]> = [
      [-8, -4.2], [-2.3, -4.6], [4.4, -4.2], [10.6, -4.5], [-13.5, -4.4],
    ]
    const treeSpotsS: Array<[number, number]> = [
      [-10, 4.4], [-3.6, 4.7], [3.1, 4.3], [9.4, 4.5], [-14.8, 4.6],
    ]
    for (const [x, z] of treeSpotsN) {
      await b.place(`${suburban}tree-large.glb`, [x, 0, z], 0, 1, undefined, 5.2)
    }
    for (const [x, z] of treeSpotsS) {
      await b.place(`${suburban}tree-small.glb`, [x, 0, z], 0, 1, undefined, 4.4)
    }

    // Streetlights along the south sidewalk for atmosphere.
    for (let i = -STEPS + 1; i <= STEPS - 1; i += 2) {
      await b.place(`${roads}light-curved.glb`, [i * 2.0, 0, 2.8], 0, 1, undefined, 4.0)
    }

    // Side-alley shooting nests: crates + a tank "barrel" tucked behind a
    // couple of houses so the player has destructibles to engage with.
    await b.place(`${prototype}crate-color.glb`, [-6.5, 0.55, -8.4], 0.2, 1.08, { kind: 'crate', hp: 70 })
    await b.place(`${prototype}crate.glb`, [-5.2, 0.55, -9.0], -0.35, 1.05, { kind: 'crate', hp: 70 })
    await b.place(`${prototype}crate.glb`, [7.4, 0.55, 8.6], 0.15, 1.05, { kind: 'crate', hp: 70 })
    await b.place(`${industrial}detail-tank.glb`, [-9.2, 0.7, 8.4], 0.1, 1.0, { kind: 'barrel', hp: 120 })
    await b.place(`${industrial}detail-tank.glb`, [12.0, 0.7, -8.6], -0.2, 1.0, { kind: 'barrel', hp: 120 })

    // Targets mounted at each end of the street for ranged practice.
    await b.place(`${prototype}target-a-round.glb`, [(STEPS + 0.6) * ROAD_LEN, 1.3, 1.6], -Math.PI / 2, 1, { kind: 'target', hp: 40 })
    await b.place(`${prototype}target-b-round.glb`, [-(STEPS + 0.6) * ROAD_LEN, 1.3, -1.6], Math.PI / 2, 1, { kind: 'target', hp: 40 })
    await b.place(`${prototype}target-b-square.glb`, [(STEPS + 0.6) * ROAD_LEN, 1.3, -2.0], -Math.PI / 2, 1, { kind: 'target', hp: 40 })
  },
}
