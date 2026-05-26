#!/usr/bin/env tsx
/**
 * Inspect a .glb file: list its animation clips and bone hierarchy.
 *
 *   npx tsx scripts/inspect-glb.ts path/to/file.glb
 *
 * Useful when wiring up a new Mixamo download to figure out exact bone names
 * (Three.js's GLTFLoader strips `:` from Mixamo bone names → `mixamorigRightHand`).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { argv, exit } from 'node:process'

const arg = argv[2]
if (!arg) {
  console.error('usage: tsx scripts/inspect-glb.ts <file.glb>')
  exit(2)
}

const buf = readFileSync(resolve(arg))

// Minimal GLB parser — extracts the JSON chunk so we don't pull in three's
// loader (which expects a browser DOM for image decoding).
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
const magic = view.getUint32(0, true)
if (magic !== 0x46546c67) {
  console.error('not a binary glTF file (bad magic)')
  exit(2)
}
const version = view.getUint32(4, true)
const totalLen = view.getUint32(8, true)
console.log(`glTF binary version ${version}, total ${totalLen} bytes`)

const jsonChunkLen = view.getUint32(12, true)
const jsonChunkType = view.getUint32(16, true)
if (jsonChunkType !== 0x4e4f534a) {
  console.error('expected JSON chunk first')
  exit(2)
}
const jsonBytes = new Uint8Array(buf.buffer, buf.byteOffset + 20, jsonChunkLen)
const json = JSON.parse(new TextDecoder().decode(jsonBytes))

console.log('')
console.log('animations:')
if (!json.animations || json.animations.length === 0) {
  console.log('  (none)')
} else {
  for (const a of json.animations) {
    const ch = a.channels?.length ?? 0
    console.log(`  - ${a.name ?? '<unnamed>'} (${ch} channels)`)
  }
}

console.log('')
console.log('nodes (bones):')
const isBone = (n: any) => n.skin == null && n.mesh == null
const nodes: any[] = json.nodes ?? []
for (let i = 0; i < nodes.length; i++) {
  const n = nodes[i]
  if (!isBone(n)) continue
  console.log(`  [${i}] ${n.name ?? '<unnamed>'}`)
}

console.log('')
console.log('skins:')
const skins = json.skins ?? []
for (const s of skins) {
  console.log(`  - ${s.name ?? '<unnamed>'} (${s.joints?.length ?? 0} joints)`)
}
