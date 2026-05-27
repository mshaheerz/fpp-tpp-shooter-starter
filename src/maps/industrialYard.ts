import type { MapDefinition } from './index'

/**
 * Industrial Yard: a gritty factory complex made of two clusters of industrial
 * buildings flanking a central open yard. Crates and tank-barrels provide
 * destructible cover; chimneys break up the skyline; perimeter walls box the
 * arena in. Designed for close-quarters PvP-style engagements.
 */
export const industrialYard: MapDefinition = {
  id: 'industrialYard',
  name: 'Industrial Yard',
  description: 'Factory complex — clusters of industrial buildings, central yard with destructible cover, chimneys and tanks.',
  scene: { groundSize: 220, groundColor: 0x595c52 },
  async build(b) {
    const industrial = './assets/kenney/industrial/Models/GLB%20format/'
    const prototype = './assets/kenney/prototype/Models/GLB%20format/'
    const roads = './assets/kenney/roads/Models/GLB%20format/'

    // West cluster — 5 industrial buildings in an L shape.
    const buildingTypes = [
      'building-d.glb', 'building-f.glb', 'building-h.glb', 'building-j.glb',
      'building-l.glb', 'building-n.glb', 'building-p.glb', 'building-r.glb',
    ]
    const westCluster: Array<[number, number, number, number]> = [
      // [x, z, rotY, desiredHeight]
      [-18, -10, 0, 8.0],
      [-18, -4, 0, 8.0],
      [-18, 2, 0, 8.0],
      [-13, -13, Math.PI / 2, 7.4],
      [-7.5, -13, Math.PI / 2, 7.4],
    ]
    let idx = 0
    for (const [x, z, r, h] of westCluster) {
      await b.place(`${industrial}${buildingTypes[idx % buildingTypes.length]}`, [x, 0, z], r, 1, undefined, h)
      idx++
    }

    // East cluster — mirrored L.
    const eastCluster: Array<[number, number, number, number]> = [
      [18, 10, Math.PI, 8.0],
      [18, 4, Math.PI, 8.0],
      [18, -2, Math.PI, 8.0],
      [13, 13, -Math.PI / 2, 7.4],
      [7.5, 13, -Math.PI / 2, 7.4],
    ]
    for (const [x, z, r, h] of eastCluster) {
      await b.place(`${industrial}${buildingTypes[idx % buildingTypes.length]}`, [x, 0, z], r, 1, undefined, h)
      idx++
    }

    // Chimneys behind both clusters for skyline silhouette.
    await b.place(`${industrial}chimney-large.glb`, [-22, 0, 8], 0, 1, undefined, 12.0)
    await b.place(`${industrial}chimney-medium.glb`, [-20, 0, 5], 0, 1, undefined, 9.0)
    await b.place(`${industrial}chimney-large.glb`, [22, 0, -8], 0, 1, undefined, 12.0)
    await b.place(`${industrial}chimney-small.glb`, [20, 0, -5], 0, 1, undefined, 7.0)

    // Perimeter walls boxing the arena.
    const perimeterTypes = [
      'wall.glb', 'wall.glb', 'wall-window-medium.glb', 'wall.glb', 'wall.glb',
      'wall-window-small.glb', 'wall.glb',
    ]
    const EDGE = 25
    for (let i = -EDGE; i <= EDGE; i += 4) {
      // North + south walls (broken up with the occasional window for visual interest).
      const tN = perimeterTypes[(i + EDGE) % perimeterTypes.length]
      const tS = perimeterTypes[(i + EDGE + 3) % perimeterTypes.length]
      await b.place(`${prototype}${tN}`, [i, 0, -EDGE], 0, 1)
      await b.place(`${prototype}${tS}`, [i, 0, EDGE], 0, 1)
    }
    for (let i = -EDGE + 4; i <= EDGE - 4; i += 4) {
      // East + west walls.
      await b.place(`${prototype}wall.glb`, [-EDGE, 0, i], Math.PI / 2, 1)
      await b.place(`${prototype}wall.glb`, [EDGE, 0, i], Math.PI / 2, 1)
    }
    // Corners.
    await b.place(`${prototype}wall-corner.glb`, [EDGE, 0, EDGE], 0, 1)
    await b.place(`${prototype}wall-corner.glb`, [-EDGE, 0, EDGE], Math.PI / 2, 1)
    await b.place(`${prototype}wall-corner.glb`, [-EDGE, 0, -EDGE], Math.PI, 1)
    await b.place(`${prototype}wall-corner.glb`, [EDGE, 0, -EDGE], -Math.PI / 2, 1)

    // Central yard cover — interior wall stubs as half-walls + crates clustered
    // into firing positions. Distances chosen so the player can ADS from one
    // cluster onto the targets in the opposite cluster.
    await b.place(`${prototype}wall-low.glb`, [-3, 0, 0], 0, 1)
    await b.place(`${prototype}wall-low.glb`, [3, 0, 0], 0, 1)
    await b.place(`${prototype}wall-low.glb`, [0, 0, -3], Math.PI / 2, 1)
    await b.place(`${prototype}wall-low.glb`, [0, 0, 3], Math.PI / 2, 1)

    // Reactive crates clustered around the half-walls.
    const cratePositions: Array<[number, number, number]> = [
      [-4.2, 0.55, -1.6], [-4.0, 0.55, 1.7], [4.4, 0.55, -1.7], [4.2, 0.55, 1.6],
      [-1.8, 0.55, -4.4], [1.7, 0.55, -4.6], [-1.6, 0.55, 4.4], [1.9, 0.55, 4.5],
    ]
    for (let i = 0; i < cratePositions.length; i++) {
      const p = cratePositions[i]
      const url = i % 2 === 0 ? `${prototype}crate-color.glb` : `${prototype}crate.glb`
      await b.place(url, p, (i * 0.4) % Math.PI, 1.06, { kind: 'crate', hp: 70 })
    }

    // Tank-barrels scattered as bigger destructibles.
    const barrelPositions: Array<[number, number, number]> = [
      [-10, 0.7, -6], [-10.5, 0.7, 5.6], [10, 0.7, 6], [10.6, 0.7, -5.4],
      [0, 0.7, -10], [0, 0.7, 10],
    ]
    for (let i = 0; i < barrelPositions.length; i++) {
      await b.place(`${industrial}detail-tank.glb`, barrelPositions[i], (i * 0.6) % Math.PI, 1.1, { kind: 'barrel', hp: 120 })
    }

    // Practice targets mounted on the inside walls.
    await b.place(`${prototype}target-b-square.glb`, [0, 1.3, -EDGE + 0.4], 0, 1, { kind: 'target', hp: 40 })
    await b.place(`${prototype}target-a-round.glb`, [-6, 1.4, -EDGE + 0.4], 0, 1, { kind: 'target', hp: 40 })
    await b.place(`${prototype}target-b-round.glb`, [6, 1.4, -EDGE + 0.4], 0, 1, { kind: 'target', hp: 40 })
    await b.place(`${prototype}target-a-square.glb`, [0, 1.3, EDGE - 0.4], Math.PI, 1, { kind: 'target', hp: 40 })

    // Construction props for grit.
    await b.place(`${roads}construction-cone.glb`, [-2.2, 0, -8], 0, 1)
    await b.place(`${roads}construction-cone.glb`, [2.4, 0, -8.3], 0, 1)
    await b.place(`${roads}construction-barrier.glb`, [-12, 0, 8], 0, 1)
    await b.place(`${roads}construction-barrier.glb`, [12, 0, -8], Math.PI, 1)
    await b.place(`${roads}construction-light.glb`, [-14, 0, -2], 0, 1, undefined, 3.5)
    await b.place(`${roads}construction-light.glb`, [14, 0, 2], 0, 1, undefined, 3.5)
  },
}
