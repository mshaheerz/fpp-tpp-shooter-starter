import * as THREE from 'three'
import { state } from './state'
import { Entity, round2 } from './types'
import { createEntity, clearAllEntities } from './entities'
import { rebuildWaypointLines, clearWaypointLines } from './waypoints'
import { selectEntity } from './selection'
import { updateStatus } from './ui'
import { pushUndo } from './undo'
import type { MapLayout } from '../maps/layoutTypes'

/** Build a layout JSON from current scene and show it in the export modal */
export function exportLayout() {
  const layout: Record<string, any> = { version: 1, mapId: state.mapId || 'unknown', playerSpawn: null, enemies: [], waypoints: [], props: [] }

  const wpGroups = new Map<number, Entity[]>()
  for (const e of state.entities) {
    if (e.type === 'waypoint') {
      const gid = e.userData.groupId || 0
      if (!wpGroups.has(gid)) wpGroups.set(gid, [])
      wpGroups.get(gid)!.push(e)
    }
  }
  for (const [gid, group] of wpGroups) {
    group.sort((a, b) => (a.userData.order || 0) - (b.userData.order || 0))
    layout.waypoints.push({ id: gid, points: group.map(wp => ({ x: round2(wp.position.x), y: round2(wp.position.y), z: round2(wp.position.z) })) })
  }

  for (const e of state.entities) {
    if (e.type === 'playerSpawn') {
      layout.playerSpawn = { x: round2(e.position.x), y: round2(e.position.y), z: round2(e.position.z) }
    } else if (e.type === 'enemySpawn') {
      const enemy: Record<string, any> = { x: round2(e.position.x), z: round2(e.position.z), y: round2(e.position.y), rotY: round2(e.rotY) }
      if (e.userData.hp) enemy.hp = e.userData.hp
      if (e.userData.patrolId) enemy.patrolId = e.userData.patrolId
      if (e.userData.territoryRadius) enemy.territoryRadius = e.userData.territoryRadius
      layout.enemies.push(enemy)
    } else if (e.type.startsWith('prop') && e.userData.asset) {
      const prop: Record<string, any> = { asset: e.userData.asset, x: round2(e.position.x), z: round2(e.position.z), y: round2(e.position.y), rotY: round2(e.rotY) }
      if (e.scaleVal !== 1) prop.scale = e.scaleVal
      if (e.userData.desiredHeight) prop.desiredHeight = e.userData.desiredHeight
      if (e.userData.hp && e.userData.reactiveType) { prop.reactive = e.userData.reactiveType; prop.hp = e.userData.hp }
      layout.props.push(prop)
    }
  }
  if (!layout.enemies.length) delete layout.enemies
  if (!layout.waypoints.length) delete layout.waypoints
  if (!layout.props.length) delete layout.props

  const text = document.getElementById('export-text') as HTMLTextAreaElement
  if (text) text.value = JSON.stringify(layout, null, 2)
  const modal = document.getElementById('export-modal')
  if (modal) modal.classList.remove('hidden')
}

/** Clear all entities and waypoint lines */
function clearAll() {
  clearAllEntities()
  clearWaypointLines()
  state.nextWaypointGroupId = 1
}

/** Read a layout JSON and recreate entities from it */
export function importLayout(json: string) {
  let layout: MapLayout
  try { layout = JSON.parse(json) } catch { alert('Invalid JSON'); return }
  if (!layout.version) { alert('Not a valid layout file'); return }
  clearAll()

  if (layout.playerSpawn) {
    createEntity('playerSpawn', new THREE.Vector3(layout.playerSpawn.x, layout.playerSpawn.y ?? 0.5, layout.playerSpawn.z))
  }
  if (layout.enemies) {
    for (const e of layout.enemies) {
      const entity = createEntity('enemySpawn', new THREE.Vector3(e.x, e.y ?? 0.5, e.z), e.rotY || 0)
      if (e.hp) entity.userData.hp = e.hp
      if (e.patrolId) entity.userData.patrolId = e.patrolId
      if (e.territoryRadius) entity.userData.territoryRadius = e.territoryRadius
    }
  }
  if (layout.waypoints) {
    for (const route of layout.waypoints) {
      let first = true
      for (const pt of route.points) {
        const entity = createEntity('waypoint', new THREE.Vector3(pt.x, pt.y ?? 0.5, pt.z))
        entity.userData.groupId = route.id
        entity.userData.order = first ? route.points.length : (entity.userData.order || 1)
        first = false
        entity._updateLabel()
      }
    }
    rebuildWaypointLines()
  }
  if (layout.props) {
    for (const p of layout.props) {
      const type = p.asset.includes('detail-tank') ? 'propBarrel' : p.asset.includes('target') ? 'propTarget' : 'prop' + p.asset.replace(/\.glb$/, '').replace(/\//g, '/')
      const entity = createEntity(type, new THREE.Vector3(p.x, p.y ?? 0.5, p.z), p.rotY || 0)
      entity.userData.asset = p.asset
      if (p.scale) entity.setScale(p.scale)
      if (p.desiredHeight) entity.userData.desiredHeight = p.desiredHeight
      if (p.hp) entity.userData.hp = p.hp
      if (p.reactive) entity.userData.reactiveType = p.reactive
    }
  }
  selectEntity(null)
  updateStatus()
  pushUndo()
}