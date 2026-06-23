#!/usr/bin/env node
/**
 * Generate .layout.json files from hardcoded Kenney map module files.
 *
 * Usage: node scripts/generate-layout-json.cjs
 *
 * Reads src/maps/shootRange.ts, suburbanStreet.ts, industrialYard.ts and
 * writes corresponding public/assets/maps/<id>.layout.json files.
 */

const fs = require('fs')
const path = require('path')

const MAP_FILES = ['shootRange', 'suburbanStreet', 'industrialYard']

function extractPlaces(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const places = []

  // Template parts: the variables are `${roads}`, `${prototype}`, etc.
  // We need to resolve them. Parse the variable definitions.
  const vars = {}
  const varRegex = /const\s+(\w+)\s*=\s*['"]\.\/assets\/kenney\/([^'"]+)['"]/
  for (const line of lines) {
    const m = line.match(varRegex)
    if (m) vars[m[1]] = './assets/kenney/' + m[2]
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match: await b.place(`${var}file.glb`, [x, y, z], rotY, scale, ...)
    const m = line.match(/await\s+b\.place\s*\(\s*`([^`]+)`\s*,\s*\[([^\]]+)\]\s*,\s*([^,]+)\s*,\s*([^,)\s]+)(.*)\)/)
    if (!m) continue

    let urlTemplate = m[1]
    const posStr = m[2]
    let rotStr = m[3].trim()
    let scaleStr = m[4].trim()
    const extraStr = m[5] || ''

    // Resolve template variable references ($[var] -> value)
    for (const [k, v] of Object.entries(vars)) {
      urlTemplate = urlTemplate.replace(new RegExp('\\$\\{' + k + '\\}', 'g'), v)
    }

    // Parse position
    const coords = posStr.split(',').map(s => parseFloat(s.trim()))
    const x = coords[0]
    const z = coords.length >= 3 ? coords[2] : (coords[1] || 0)
    const yVal = coords.length >= 3 ? coords[1] : 0.5

    // Parse rotation
    let rotY = 0
    try {
      if (rotStr.includes('Math.')) {
        rotY = eval(rotStr.replace(/Math\.PI/g, 'Math.PI').replace(/Math\./g, 'Math.'))
      } else {
        rotY = parseFloat(rotStr) || 0
      }
    } catch { rotY = 0 }

    // Scale
    const scale = parseFloat(scaleStr) || 1

    // Check for reactive + desiredHeight in extra
    let reactive = null
    let hp = null
    let desiredHeight = null

    // Match: { kind: 'crate', hp: 70 }
    const reactMatch = extraStr.match(/\{\s*kind:\s*'([^']+)'\s*,\s*hp:\s*(\d+)\s*\}/)
    if (reactMatch) {
      reactive = reactMatch[1]
      hp = parseInt(reactMatch[2])
    }

    // Match: undefined, 7.2  (desiredHeight after reactive/undefined)
    const heightMatch = extraStr.match(/undefined\s*,\s*([\d.]+)/)
    if (heightMatch) desiredHeight = parseFloat(heightMatch[1])
    // Also check direct number after reactive block
    if (!heightMatch) {
      const directHeight = extraStr.match(/\},\s*([\d.]+)\s*\)/)
      if (directHeight) desiredHeight = parseFloat(directHeight[1])
    }

    // Extract the relative asset path from the full URL
    const assetMatch = urlTemplate.match(/\.\/assets\/kenney\/(.+)/)
    const asset = assetMatch ? assetMatch[1] : urlTemplate

    places.push({
      asset,
      x: Math.round(x * 100) / 100,
      y: Math.round(yVal * 100) / 100,
      z: Math.round(z * 100) / 100,
      rotY: Math.round(rotY * 100) / 100,
      scale: Math.round(scale * 100) / 100,
      ...(reactive ? { reactive, hp } : {}),
      ...(desiredHeight ? { desiredHeight } : {}),
    })
  }

  return places
}

for (const mapId of MAP_FILES) {
  const filePath = path.join(__dirname, '..', 'src', 'maps', `${mapId}.ts`)
  const places = extractPlaces(filePath)

  console.log(`\n${mapId}: extracted ${places.length} props`)

  const layout = {
    version: 1,
    mapId,
    props: places,
  }

  const outPath = path.join(__dirname, '..', 'public', 'assets', 'maps', `${mapId}.layout.json`)
  fs.writeFileSync(outPath, JSON.stringify(layout, null, 2))
  console.log(`  wrote ${outPath}`)
}