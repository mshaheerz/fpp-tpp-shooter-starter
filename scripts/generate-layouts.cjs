#!/usr/bin/env node
/**
 * Manually generate .layout.json files for each Kenney map.
 * This evaluates the actual coordinate logic so positions match exactly.
 */
const fs = require('fs')
const path = require('path')

// ===== SHOOT RANGE =====
function buildShootRange() {
  const props = []
  const roads = './assets/kenney/roads/Models/GLB%20format/'
  const prototype = './assets/kenney/prototype/Models/GLB%20format/'
  const industrial = './assets/kenney/industrial/Models/GLB%20format/'
  const suburban = './assets/kenney/suburban/Models/GLB%20format/'

  // Simulate the layout
  const TILE = 2.0 // Math.max(1.8, foot.x, foot.z, roadFoot.x, roadFoot.z) ≈ 2.0
  const GRID = 7
  const HALF = Math.floor(GRID / 2)
  const edge = HALF * TILE + TILE

  // Base block grid
  for (let gx = -HALF; gx <= HALF; gx++) {
    for (let gz = -HALF; gz <= HALF; gz++) {
      props.push({ asset: 'roads/Models/GLB%20format/tile-low.glb', x: gx * TILE, y: 0, z: gz * TILE, rotY: 0, scale: 1 })
    }
  }

  // Cross road
  props.push({ asset: 'roads/Models/GLB%20format/road-crossroad.glb', x: 0, y: 0.01, z: 0, rotY: 0, scale: 1 })
  for (let i = 1; i <= HALF; i++) {
    props.push({ asset: 'roads/Models/GLB%20format/road-straight.glb', x: 0, y: 0.01, z: i * TILE, rotY: 0, scale: 1 })
    props.push({ asset: 'roads/Models/GLB%20format/road-straight.glb', x: 0, y: 0.01, z: -i * TILE, rotY: 0, scale: 1 })
    props.push({ asset: 'roads/Models/GLB%20format/road-straight.glb', x: i * TILE, y: 0.01, z: 0, rotY: Math.PI / 2, scale: 1 })
    props.push({ asset: 'roads/Models/GLB%20format/road-straight.glb', x: -i * TILE, y: 0.01, z: 0, rotY: Math.PI / 2, scale: 1 })
  }
  props.push({ asset: 'roads/Models/GLB%20format/road-intersection.glb', x: 0, y: 0.01, z: HALF * TILE, rotY: 0, scale: 1 })
  props.push({ asset: 'roads/Models/GLB%20format/road-intersection.glb', x: 0, y: 0.01, z: -HALF * TILE, rotY: 0, scale: 1 })
  props.push({ asset: 'roads/Models/GLB%20format/road-intersection.glb', x: HALF * TILE, y: 0.01, z: 0, rotY: Math.PI / 2, scale: 1 })
  props.push({ asset: 'roads/Models/GLB%20format/road-intersection.glb', x: -HALF * TILE, y: 0.01, z: 0, rotY: Math.PI / 2, scale: 1 })

  // Walls
  for (let i = -HALF - 1; i <= HALF + 1; i++) {
    props.push({ asset: 'prototype/Models/GLB%20format/wall.glb', x: i * TILE, y: 0, z: edge, rotY: 0, scale: 1 })
    props.push({ asset: 'prototype/Models/GLB%20format/wall.glb', x: i * TILE, y: 0, z: -edge, rotY: 0, scale: 1 })
    props.push({ asset: 'prototype/Models/GLB%20format/wall.glb', x: edge, y: 0, z: i * TILE, rotY: Math.PI / 2, scale: 1 })
    props.push({ asset: 'prototype/Models/GLB%20format/wall.glb', x: -edge, y: 0, z: i * TILE, rotY: Math.PI / 2, scale: 1 })
  }
  props.push({ asset: 'prototype/Models/GLB%20format/wall-corner.glb', x: edge, y: 0, z: edge, rotY: 0, scale: 1 })
  props.push({ asset: 'prototype/Models/GLB%20format/wall-corner.glb', x: -edge, y: 0, z: edge, rotY: Math.PI / 2, scale: 1 })
  props.push({ asset: 'prototype/Models/GLB%20format/wall-corner.glb', x: -edge, y: 0, z: -edge, rotY: Math.PI, scale: 1 })
  props.push({ asset: 'prototype/Models/GLB%20format/wall-corner.glb', x: edge, y: 0, z: -edge, rotY: -Math.PI / 2, scale: 1 })

  // Buildings industrial
  props.push({ asset: 'industrial/Models/GLB%20format/building-a.glb', x: -10, y: 0, z: -10, rotY: Math.PI * 0.15, scale: 1, desiredHeight: 7.2 })
  props.push({ asset: 'industrial/Models/GLB%20format/building-b.glb', x: -6, y: 0, z: -11, rotY: Math.PI * 0.05, scale: 1, desiredHeight: 7.2 })
  props.push({ asset: 'industrial/Models/GLB%20format/building-c.glb', x: -2, y: 0, z: -10, rotY: Math.PI * 0.12, scale: 1, desiredHeight: 7.2 })

  // Suburban buildings
  props.push({ asset: 'suburban/Models/GLB%20format/building-type-a.glb', x: 3, y: 0, z: 10, rotY: Math.PI, scale: 1, desiredHeight: 6.2 })
  props.push({ asset: 'suburban/Models/GLB%20format/building-type-b.glb', x: 7, y: 0, z: 11, rotY: Math.PI * 0.9, scale: 1, desiredHeight: 6.2 })
  props.push({ asset: 'suburban/Models/GLB%20format/building-type-c.glb', x: 11, y: 0, z: 10, rotY: Math.PI * 0.95, scale: 1, desiredHeight: 6.2 })

  // Fences
  for (let i = -2; i <= 2; i++) {
    props.push({ asset: 'suburban/Models/GLB%20format/fence-1x3.glb', x: 10.6, y: 0, z: i * 2.2, rotY: Math.PI / 2, scale: 1, desiredHeight: 2.1 })
  }

  // Trees
  props.push({ asset: 'suburban/Models/GLB%20format/tree-large.glb', x: 8, y: 0, z: 6, rotY: 0, scale: 1, desiredHeight: 5.5 })
  props.push({ asset: 'suburban/Models/GLB%20format/tree-small.glb', x: 12, y: 0, z: 5, rotY: 0, scale: 1, desiredHeight: 4.4 })
  props.push({ asset: 'suburban/Models/GLB%20format/tree-small.glb', x: 9, y: 0, z: 9, rotY: 0, scale: 1, desiredHeight: 4.4 })

  // Reactive props
  props.push({ asset: 'prototype/Models/GLB%20format/crate-color.glb', x: 1.8, y: 0.55, z: -4.6, rotY: 0.2, scale: 1.08, reactive: 'crate', hp: 70 })
  props.push({ asset: 'prototype/Models/GLB%20format/crate.glb', x: 3.2, y: 0.55, z: -5.4, rotY: -0.35, scale: 1.05, reactive: 'crate', hp: 70 })
  props.push({ asset: 'prototype/Models/GLB%20format/crate.glb', x: -2.9, y: 0.55, z: 4.8, rotY: 0.15, scale: 1.05, reactive: 'crate', hp: 70 })
  props.push({ asset: 'industrial/Models/GLB%20format/detail-tank.glb', x: -1.7, y: 0.7, z: -7.2, rotY: 0.1, scale: 1.1, reactive: 'barrel', hp: 120 })
  props.push({ asset: 'industrial/Models/GLB%20format/detail-tank.glb', x: -3.6, y: 0.7, z: -8.4, rotY: -0.2, scale: 1.1, reactive: 'barrel', hp: 120 })
  props.push({ asset: 'industrial/Models/GLB%20format/detail-tank.glb', x: 4.2, y: 0.7, z: 6.8, rotY: 0.25, scale: 1.1, reactive: 'barrel', hp: 120 })
  props.push({ asset: 'prototype/Models/GLB%20format/target-b-square.glb', x: 0, y: 1.25, z: -10, rotY: 0, scale: 1, reactive: 'target', hp: 40 })
  props.push({ asset: 'prototype/Models/GLB%20format/target-a-round.glb', x: 2.5, y: 1.35, z: -11, rotY: 0, scale: 1, reactive: 'target', hp: 40 })
  props.push({ asset: 'prototype/Models/GLB%20format/target-b-round.glb', x: -2.2, y: 1.35, z: 9.2, rotY: Math.PI, scale: 1, reactive: 'target', hp: 40 })

  return props
}

// ===== SUBURBAN STREET =====
function buildSuburbanStreet() {
  const props = []
  const roads = './assets/kenney/roads/Models/GLB%20format/'
  const suburban = './assets/kenney/suburban/Models/GLB%20format/'
  const prototype = './assets/kenney/prototype/Models/GLB%20format/'
  const industrial = './assets/kenney/industrial/Models/GLB%20format/'

  const ROAD_LEN = 2.0
  const STEPS = 7
  const HOUSE_OFFSET_Z = 6.5

  // Road
  props.push({ asset: 'roads/Models/GLB%20format/road-crossroad.glb', x: 0, y: 0.01, z: 0, rotY: 0, scale: 1 })
  for (let i = 1; i <= STEPS; i++) {
    props.push({ asset: 'roads/Models/GLB%20format/road-straight.glb', x: i * ROAD_LEN, y: 0.01, z: 0, rotY: Math.PI / 2, scale: 1 })
    props.push({ asset: 'roads/Models/GLB%20format/road-straight.glb', x: -i * ROAD_LEN, y: 0.01, z: 0, rotY: Math.PI / 2, scale: 1 })
  }
  props.push({ asset: 'roads/Models/GLB%20format/road-end-barrier.glb', x: (STEPS + 1) * ROAD_LEN, y: 0.01, z: 0, rotY: -Math.PI / 2, scale: 1 })
  props.push({ asset: 'roads/Models/GLB%20format/road-end-barrier.glb', x: -(STEPS + 1) * ROAD_LEN, y: 0.01, z: 0, rotY: Math.PI / 2, scale: 1 })

  // Houses
  const houseTypes = ['a', 'c', 'e', 'g', 'i', 'k', 'm']
  for (let i = 0; i < STEPS; i++) {
    const x = (i - STEPS / 2 + 0.5) * ROAD_LEN * 1.05
    const northType = houseTypes[i % 7]
    const southType = houseTypes[(i + 3) % 7]
    props.push({ asset: `suburban/Models/GLB%20format/building-type-${northType}.glb`, x, y: 0, z: -HOUSE_OFFSET_Z, rotY: Math.PI, scale: 1, desiredHeight: 6.4 })
    props.push({ asset: `suburban/Models/GLB%20format/building-type-${southType}.glb`, x, y: 0, z: HOUSE_OFFSET_Z, rotY: 0, scale: 1, desiredHeight: 6.4 })
  }

  // Driveways
  for (let i = 0; i < STEPS; i++) {
    const x = (i - STEPS / 2 + 0.5) * ROAD_LEN * 1.05
    props.push({ asset: 'suburban/Models/GLB%20format/driveway-short.glb', x, y: 0.005, z: -3, rotY: 0, scale: 1 })
    props.push({ asset: 'suburban/Models/GLB%20format/driveway-short.glb', x, y: 0.005, z: 3, rotY: Math.PI, scale: 1 })
  }

  // Fences
  const FENCE_Z_NORTH = -HOUSE_OFFSET_Z - 3.6
  const FENCE_Z_SOUTH = HOUSE_OFFSET_Z + 3.6
  for (let i = -STEPS; i <= STEPS; i++) {
    props.push({ asset: 'suburban/Models/GLB%20format/fence-1x4.glb', x: i * 2.0, y: 0, z: FENCE_Z_NORTH, rotY: 0, scale: 1, desiredHeight: 1.6 })
    props.push({ asset: 'suburban/Models/GLB%20format/fence-1x4.glb', x: i * 2.0, y: 0, z: FENCE_Z_SOUTH, rotY: 0, scale: 1, desiredHeight: 1.6 })
  }

  // Trees
  const treeSpotsN = [[-8, -4.2], [-2.3, -4.6], [4.4, -4.2], [10.6, -4.5], [-13.5, -4.4]]
  const treeSpotsS = [[-10, 4.4], [-3.6, 4.7], [3.1, 4.3], [9.4, 4.5], [-14.8, 4.6]]
  for (const [x, z] of treeSpotsN) props.push({ asset: 'suburban/Models/GLB%20format/tree-large.glb', x, y: 0, z, rotY: 0, scale: 1, desiredHeight: 5.2 })
  for (const [x, z] of treeSpotsS) props.push({ asset: 'suburban/Models/GLB%20format/tree-small.glb', x, y: 0, z, rotY: 0, scale: 1, desiredHeight: 4.4 })

  // Streetlights
  for (let i = -STEPS + 1; i <= STEPS - 1; i += 2) {
    props.push({ asset: 'roads/Models/GLB%20format/light-curved.glb', x: i * 2.0, y: 0, z: 2.8, rotY: 0, scale: 1, desiredHeight: 4.0 })
  }

  // Reactive props
  props.push({ asset: 'prototype/Models/GLB%20format/crate-color.glb', x: -6.5, y: 0.55, z: -8.4, rotY: 0.2, scale: 1.08, reactive: 'crate', hp: 70 })
  props.push({ asset: 'prototype/Models/GLB%20format/crate.glb', x: -5.2, y: 0.55, z: -9.0, rotY: -0.35, scale: 1.05, reactive: 'crate', hp: 70 })
  props.push({ asset: 'prototype/Models/GLB%20format/crate.glb', x: 7.4, y: 0.55, z: 8.6, rotY: 0.15, scale: 1.05, reactive: 'crate', hp: 70 })
  props.push({ asset: 'industrial/Models/GLB%20format/detail-tank.glb', x: -9.2, y: 0.7, z: 8.4, rotY: 0.1, scale: 1.0, reactive: 'barrel', hp: 120 })
  props.push({ asset: 'industrial/Models/GLB%20format/detail-tank.glb', x: 12.0, y: 0.7, z: -8.6, rotY: -0.2, scale: 1.0, reactive: 'barrel', hp: 120 })
  props.push({ asset: 'prototype/Models/GLB%20format/target-a-round.glb', x: (STEPS + 0.6) * ROAD_LEN, y: 1.3, z: 1.6, rotY: -Math.PI / 2, scale: 1, reactive: 'target', hp: 40 })
  props.push({ asset: 'prototype/Models/GLB%20format/target-b-round.glb', x: -(STEPS + 0.6) * ROAD_LEN, y: 1.3, z: -1.6, rotY: Math.PI / 2, scale: 1, reactive: 'target', hp: 40 })
  props.push({ asset: 'prototype/Models/GLB%20format/target-b-square.glb', x: (STEPS + 0.6) * ROAD_LEN, y: 1.3, z: -2.0, rotY: -Math.PI / 2, scale: 1, reactive: 'target', hp: 40 })

  return props
}

// ===== INDUSTRIAL YARD =====
function buildIndustrialYard() {
  const props = []
  const industrial = 'industrial/Models/GLB%20format/'
  const prototype = 'prototype/Models/GLB%20format/'
  const roads = 'roads/Models/GLB%20format/'

  const buildingTypes = ['d', 'f', 'h', 'j', 'l', 'n', 'p', 'r']
  const EDGE = 25

  // West cluster
  const westCluster = [[-18, -10, 0, 8.0], [-18, -4, 0, 8.0], [-18, 2, 0, 8.0], [-13, -13, Math.PI / 2, 7.4], [-7.5, -13, Math.PI / 2, 7.4]]
  westCluster.forEach(([x, z, r, h], i) => {
    props.push({ asset: `industrial/Models/GLB%20format/building-${buildingTypes[i % 8]}.glb`, x, y: 0, z, rotY: r, scale: 1, desiredHeight: h })
  })

  // East cluster
  const eastCluster = [[18, 10, Math.PI, 8.0], [18, 4, Math.PI, 8.0], [18, -2, Math.PI, 8.0], [13, 13, -Math.PI / 2, 7.4], [7.5, 13, -Math.PI / 2, 7.4]]
  eastCluster.forEach(([x, z, r, h], i) => {
    props.push({ asset: `industrial/Models/GLB%20format/building-${buildingTypes[(i + 5) % 8]}.glb`, x, y: 0, z, rotY: r, scale: 1, desiredHeight: h })
  })

  // Chimneys
  props.push({ asset: 'industrial/Models/GLB%20format/chimney-large.glb', x: -22, y: 0, z: 8, rotY: 0, scale: 1, desiredHeight: 12.0 })
  props.push({ asset: 'industrial/Models/GLB%20format/chimney-medium.glb', x: -20, y: 0, z: 5, rotY: 0, scale: 1, desiredHeight: 9.0 })
  props.push({ asset: 'industrial/Models/GLB%20format/chimney-large.glb', x: 22, y: 0, z: -8, rotY: 0, scale: 1, desiredHeight: 12.0 })
  props.push({ asset: 'industrial/Models/GLB%20format/chimney-small.glb', x: 20, y: 0, z: -5, rotY: 0, scale: 1, desiredHeight: 7.0 })

  // Walls
  const perimeterTypes = ['wall.glb', 'wall.glb', 'wall-window-medium.glb', 'wall.glb', 'wall.glb', 'wall-window-small.glb', 'wall.glb']
  for (let i = -EDGE; i <= EDGE; i += 4) {
    const tN = perimeterTypes[(i + EDGE) % 7]
    const tS = perimeterTypes[(i + EDGE + 3) % 7]
    props.push({ asset: `prototype/Models/GLB%20format/${tN}`, x: i, y: 0, z: -EDGE, rotY: 0, scale: 1 })
    props.push({ asset: `prototype/Models/GLB%20format/${tS}`, x: i, y: 0, z: EDGE, rotY: 0, scale: 1 })
  }
  for (let i = -EDGE + 4; i <= EDGE - 4; i += 4) {
    props.push({ asset: 'prototype/Models/GLB%20format/wall.glb', x: -EDGE, y: 0, z: i, rotY: Math.PI / 2, scale: 1 })
    props.push({ asset: 'prototype/Models/GLB%20format/wall.glb', x: EDGE, y: 0, z: i, rotY: Math.PI / 2, scale: 1 })
  }
  props.push({ asset: 'prototype/Models/GLB%20format/wall-corner.glb', x: EDGE, y: 0, z: EDGE, rotY: 0, scale: 1 })
  props.push({ asset: 'prototype/Models/GLB%20format/wall-corner.glb', x: -EDGE, y: 0, z: EDGE, rotY: Math.PI / 2, scale: 1 })
  props.push({ asset: 'prototype/Models/GLB%20format/wall-corner.glb', x: -EDGE, y: 0, z: -EDGE, rotY: Math.PI, scale: 1 })
  props.push({ asset: 'prototype/Models/GLB%20format/wall-corner.glb', x: EDGE, y: 0, z: -EDGE, rotY: -Math.PI / 2, scale: 1 })

  // Low walls
  props.push({ asset: 'prototype/Models/GLB%20format/wall-low.glb', x: -3, y: 0, z: 0, rotY: 0, scale: 1 })
  props.push({ asset: 'prototype/Models/GLB%20format/wall-low.glb', x: 3, y: 0, z: 0, rotY: 0, scale: 1 })
  props.push({ asset: 'prototype/Models/GLB%20format/wall-low.glb', x: 0, y: 0, z: -3, rotY: Math.PI / 2, scale: 1 })
  props.push({ asset: 'prototype/Models/GLB%20format/wall-low.glb', x: 0, y: 0, z: 3, rotY: Math.PI / 2, scale: 1 })

  // Reactive crates
  const cratePositions = [[-4.2, 0.55, -1.6], [-4.0, 0.55, 1.7], [4.4, 0.55, -1.7], [4.2, 0.55, 1.6], [-1.8, 0.55, -4.4], [1.7, 0.55, -4.6], [-1.6, 0.55, 4.4], [1.9, 0.55, 4.5]]
  cratePositions.forEach(([x, y, z], i) => {
    const url = i % 2 === 0 ? 'prototype/Models/GLB%20format/crate-color.glb' : 'prototype/Models/GLB%20format/crate.glb'
    props.push({ asset: url, x, y, z, rotY: (i * 0.4) % Math.PI, scale: 1.06, reactive: 'crate', hp: 70 })
  })

  // Barrel positions
  const barrelPositions = [[-10, 0.7, -6], [-10.5, 0.7, 5.6], [10, 0.7, 6], [10.6, 0.7, -5.4], [0, 0.7, -10], [0, 0.7, 10]]
  barrelPositions.forEach(([x, y, z], i) => {
    props.push({ asset: 'industrial/Models/GLB%20format/detail-tank.glb', x, y, z, rotY: (i * 0.6) % Math.PI, scale: 1.1, reactive: 'barrel', hp: 120 })
  })

  // Targets
  props.push({ asset: 'prototype/Models/GLB%20format/target-b-square.glb', x: 0, y: 1.3, z: -EDGE + 0.4, rotY: 0, scale: 1, reactive: 'target', hp: 40 })
  props.push({ asset: 'prototype/Models/GLB%20format/target-a-round.glb', x: -6, y: 1.4, z: -EDGE + 0.4, rotY: 0, scale: 1, reactive: 'target', hp: 40 })
  props.push({ asset: 'prototype/Models/GLB%20format/target-b-round.glb', x: 6, y: 1.4, z: -EDGE + 0.4, rotY: 0, scale: 1, reactive: 'target', hp: 40 })
  props.push({ asset: 'prototype/Models/GLB%20format/target-a-square.glb', x: 0, y: 1.3, z: EDGE - 0.4, rotY: Math.PI, scale: 1, reactive: 'target', hp: 40 })

  // Construction props
  props.push({ asset: 'roads/Models/GLB%20format/construction-cone.glb', x: -2.2, y: 0, z: -8, rotY: 0, scale: 1 })
  props.push({ asset: 'roads/Models/GLB%20format/construction-cone.glb', x: 2.4, y: 0, z: -8.3, rotY: 0, scale: 1 })
  props.push({ asset: 'roads/Models/GLB%20format/construction-barrier.glb', x: -12, y: 0, z: 8, rotY: 0, scale: 1 })
  props.push({ asset: 'roads/Models/GLB%20format/construction-barrier.glb', x: 12, y: 0, z: -8, rotY: Math.PI, scale: 1 })
  props.push({ asset: 'roads/Models/GLB%20format/construction-light.glb', x: -14, y: 0, z: -2, rotY: 0, scale: 1, desiredHeight: 3.5 })
  props.push({ asset: 'roads/Models/GLB%20format/construction-light.glb', x: 14, y: 0, z: 2, rotY: 0, scale: 1, desiredHeight: 3.5 })

  return props
}

// Round helper
function r(v) { return Math.round(v * 100) / 100 }

function roundProps(props) {
  return props.map(p => {
    const out = {
      asset: p.asset,
      x: r(p.x),
      z: r(p.z),
      y: r(p.y),
      rotY: r(p.rotY),
      scale: r(p.scale),
    }
    if (p.reactive) { out.reactive = p.reactive; out.hp = p.hp }
    if (p.desiredHeight) out.desiredHeight = r(p.desiredHeight)
    return out
  })
}

// Generate and write
const maps = [
  { id: 'shootRange', fn: buildShootRange },
  { id: 'suburbanStreet', fn: buildSuburbanStreet },
  { id: 'industrialYard', fn: buildIndustrialYard },
]

for (const { id, fn } of maps) {
  const raw = fn()
  const rounded = roundProps(raw)
  const layout = { version: 1, mapId: id, props: rounded }
  const outPath = path.join(__dirname, '..', 'public', 'assets', 'maps', `${id}.layout.json`)
  fs.writeFileSync(outPath, JSON.stringify(layout, null, 2))
  console.log(`${id}: wrote ${rounded.length} props → ${outPath}`)
}