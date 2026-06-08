import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { state, ASSETS_BASE } from './state'
import { Entity, REACTIVE_HP, round2 } from './types'
import { selectEntity, clearMultiSelection } from './selection'
import { pushUndo } from './undo'
import { rebuildWaypointLines, clearWaypointLines } from './waypoints'
import { updateStatus } from './ui'

/** Create a new entity and add it to the scene */
export function createEntity(type: string, position: THREE.Vector3, rotY = 0): Entity {
  const entity = new Entity(type, position, rotY)
  state.scene!.add(entity._mesh)

  if (type.startsWith('prop')) {
    const assetMap: Record<string, string> = {
      'propCrate': 'prototype/Models/GLB format/crate-color.glb',
      'propBarrel': 'industrial/Models/GLB format/detail-tank.glb',
      'propTarget': 'prototype/Models/GLB format/target-a-round.glb',
    }
    let asset = assetMap[type] || ''
    const assetMatch = type.match(/^prop(.+)$/)
    if (assetMatch && !asset) asset = assetMatch[1]
    entity.userData.asset = asset

    if (asset.includes('crate')) { entity.userData.reactiveType = 'crate'; entity.userData.hp = REACTIVE_HP.crate }
    else if (asset.includes('detail-tank')) { entity.userData.reactiveType = 'barrel'; entity.userData.hp = REACTIVE_HP.barrel }
    else if (asset.includes('target')) { entity.userData.reactiveType = 'target'; entity.userData.hp = REACTIVE_HP.target }

    if (asset) loadPropGLB(entity, ASSETS_BASE + asset)
  }

  if (type === 'waypoint') {
    let groupId: number | null = null
    if (state.selected && state.selected.type === 'waypoint' && state.selected.userData.groupId) {
      groupId = state.selected.userData.groupId
    }
    entity.userData.groupId = groupId ?? state.nextWaypointGroupId++
    if (!groupId) state.nextWaypointGroupId++
    entity.userData.order = state.entities.filter(e => e.type === 'waypoint' && e.userData.groupId === entity.userData.groupId).length
    entity._updateLabel()
    rebuildWaypointLines()
  }

  state.entities.push(entity)
  pushUndo()
  clearMultiSelection()
  selectEntity(entity)
  return entity
}

/** Load a GLB for a prop entity */
export async function loadPropGLB(entity: Entity, url: string, skipUndo = false) {
  try {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    const model = gltf.scene
    model.scale.setScalar(entity.scaleVal)
    model.traverse(o => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true } })
    const pos = entity._mesh.position.clone()
    const rot = entity._mesh.rotation.y
    state.scene!.remove(entity._mesh)
    entity._mesh = model
    model.position.copy(pos)
    model.rotation.y = rot
    model.userData.entity = entity
    state.scene!.add(model)
    if (!skipUndo) pushUndo()
  } catch { /* GLB not found — placeholder stays */ }
}

/** Remove all entities */
export function clearAllEntities() {
  for (const e of state.entities) state.scene!.remove(e._mesh)
  state.entities = []
  clearWaypointLines()
  state.selected = null
  state.multiSelected.clear()
  state.nextWaypointGroupId = 1
  updatePropertiesPanel()
  updateSelectionCount()
  updateStatus()
}

/** Delete selected entity/entities */
export function deleteSelected() {
  const toDelete = getSelectionSet()
  if (toDelete.size === 0) return
  for (const e of toDelete) {
    state.scene!.remove(e._mesh)
    const idx = state.entities.indexOf(e)
    if (idx > -1) state.entities.splice(idx, 1)
  }
  clearMultiSelection()
  state.selected = null
  rebuildWaypointLines()
  updatePropertiesPanel()
  updateStatus()
  pushUndo()
}

/** Duplicate selected entities */
export function duplicateSelected() {
  const sel = getSelectionSet()
  if (sel.size === 0) return
  const newEntities: Entity[] = []
  for (const e of sel) {
    const pos = e.position.clone()
    pos.x += 1.5; pos.z += 1.5
    const clone = new Entity(e.type, pos, e.rotY)
    clone.setScale(e.scaleVal)
    clone.userData = JSON.parse(JSON.stringify(e.userData))
    state.scene!.add(clone._mesh)
    state.entities.push(clone)
    if (clone.userData.asset) loadPropGLB(clone, ASSETS_BASE + clone.userData.asset, true)
    newEntities.push(clone)
  }
  clearMultiSelection()
  for (const e of newEntities) { state.multiSelected.add(e); e.select(false) }
  selectEntity(newEntities[newEntities.length - 1])
  updateSelectionCount()
  rebuildWaypointLines()
  pushUndo()
}

/** Get current selection set */
export function getSelectionSet(): Set<Entity> {
  if (state.multiSelected.size > 0) return state.multiSelected
  if (state.selected) return new Set([state.selected])
  return new Set()
}

/** Update the selection count badge */
export function updateSelectionCount() {
  const el = document.getElementById('selection-count')
  if (!el) return
  const count = state.multiSelected.size || (state.selected ? 1 : 0)
  el.classList.toggle('visible', count > 1)
  if (count > 1) el.textContent = `${count} entities selected`
}

/** Update the right-side properties panel */
export function updatePropertiesPanel() {
  const panel = document.getElementById('props-panel')
  const title = document.getElementById('prop-title')
  const fields = document.getElementById('prop-fields')
  const e = state.selected
  const selSet = getSelectionSet()
  const multi = selSet.size > 1

  if (!panel || !title || !fields) return
  if (!e && !multi) { panel.classList.remove('visible'); return }
  panel.classList.add('visible')

  if (multi) {
    title.textContent = `${selSet.size} Entities`
    fields.innerHTML = `
      <div class="prop-row"><label>Count</label><span style="font-size:12px;color:var(--text-dim)">${selSet.size}</span></div>
      <div class="prop-row"><label>Rotation</label><input type="number" step="0.05" value="0" data-field="rotY"></div>
      <div class="prop-row"><label>Scale</label><input type="number" step="0.1" value="1" data-field="scale"></div>`
    fields.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => {
        const val = parseFloat((input as HTMLInputElement).value) || 0
        const field = (input as HTMLElement).dataset.field
        for (const ent of selSet) {
          if (field === 'rotY') ent.setRotY(val)
          if (field === 'scale') ent.setScale(val)
        }
        pushUndo()
      })
    })
    return
  }

  if (!e) return
  const labelMap: Record<string, string> = {
    playerSpawn: 'Player Spawn', enemySpawn: 'Enemy Spawn', waypoint: 'Waypoint',
  }
  title.textContent = labelMap[e.type] ?? e.type

  let html = ''
  html += `<div class="prop-row"><label>X</label><input type="number" step="0.1" value="${round2(e.position.x)}" data-field="posX"></div>`
  html += `<div class="prop-row"><label>Z</label><input type="number" step="0.1" value="${round2(e.position.z)}" data-field="posZ"></div>`
  html += `<div class="prop-row"><label>Rotation</label><input type="number" step="0.05" value="${round2(e.rotY)}" data-field="rotY"></div>`
  if (e.type.startsWith('prop')) {
    html += `<div class="prop-row"><label>Scale</label><input type="number" step="0.1" value="${e.scaleVal || 1}" data-field="scale"></div>`
  }
  if (e.type === 'enemySpawn') {
    html += `<div class="prop-row"><label>HP</label><input type="number" value="${e.userData.hp || 100}" data-field="hp"></div>`
    html += `<div class="prop-row"><label>Patrol ID</label><input type="number" value="${e.userData.patrolId || 0}" data-field="patrolId"></div>`
    html += `<div class="prop-row"><label>Territory Radius</label><input type="number" step="0.5" value="${e.userData.territoryRadius || 12}" data-field="territoryRadius"></div>`
  }
  if (e.type.startsWith('prop') && e.userData.hp) {
    html += `<div class="prop-row"><label>HP</label><input type="number" value="${e.userData.hp}" data-field="hp"></div>`
  }
  html += `<div class="prop-row" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)"><label>Type</label><span style="font-size:12px;color:var(--text-dim)">${e.type}</span></div>`
  fields.innerHTML = html

  fields.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => {
      const val = parseFloat((input as HTMLInputElement).value) || 0
      const field = (input as HTMLElement).dataset.field
      if (field === 'posX') e.setPosition(new THREE.Vector3(val, e.position.y, e.position.z))
      else if (field === 'posZ') e.setPosition(new THREE.Vector3(e.position.x, e.position.y, val))
      else if (field === 'rotY') e.setRotY(val)
      else if (field === 'scale') e.setScale(val)
      else if (field === 'hp') e.userData.hp = val
      else if (field === 'patrolId') e.userData.patrolId = val
      else if (field === 'territoryRadius') e.userData.territoryRadius = val
      rebuildWaypointLines()
      pushUndo()
    })
  })
}