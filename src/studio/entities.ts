import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { state, ASSETS_BASE } from './state'
import { Entity, REACTIVE_HP, round2 } from './types'
import { selectEntity, clearMultiSelection } from './selection'
import { pushUndo } from './undo'
import { rebuildWaypointLines, clearWaypointLines } from './waypoints'
import { updateStatus } from './ui'

/** Create a new entity and add it to the scene. Set skipUndo=true when called within an undo/restore flow.
 *  `explicitAsset` overrides asset-path derivation (used by import/restore where the saved
 *  asset string is authoritative and must keep its `.glb` extension). */
export function createEntity(type: string, position: THREE.Vector3, rotY = 0, skipUndo = false, explicitAsset?: string): Entity {
  const entity = new Entity(type, position, rotY)
  state.scene!.add(entity._mesh)

  if (type.startsWith('prop')) {
    const assetMap: Record<string, string> = {
      'propCrate': 'prototype/Models/GLB format/crate-color.glb',
      'propBarrel': 'industrial/Models/GLB format/detail-tank.glb',
      'propTarget': 'prototype/Models/GLB format/target-a-round.glb',
    }
    let asset = explicitAsset || assetMap[type] || ''
    const assetMatch = type.match(/^prop(.+)$/)
    if (assetMatch && !asset) asset = assetMatch[1]
    // A palette tool key embeds the full path including `.glb`; never let a missing
    // extension through or the GLB fetch 404s and the placeholder box stays forever.
    if (asset && !asset.endsWith('.glb')) asset += '.glb'
    entity.userData.asset = asset

    if (asset.includes('crate')) { entity.userData.reactiveType = 'crate'; entity.userData.hp = REACTIVE_HP.crate }
    else if (asset.includes('detail-tank')) { entity.userData.reactiveType = 'barrel'; entity.userData.hp = REACTIVE_HP.barrel }
    else if (asset.includes('target')) { entity.userData.reactiveType = 'target'; entity.userData.hp = REACTIVE_HP.target }

    if (asset) loadPropGLB(entity, ASSETS_BASE + asset, true)
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
  if (!skipUndo) pushUndo()
  clearMultiSelection()
  selectEntity(entity)
  return entity
}

/** Shared loader so every GLB request reuses the same parser/cache. */
const _gltfLoader = new GLTFLoader()

/** Dispose all geometry/material owned by an Object3D (placeholder cleanup). */
function disposeObject(obj: THREE.Object3D) {
  obj.traverse(o => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      mesh.geometry?.dispose()
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach(m => m.dispose())
      else mat?.dispose()
    }
    const sprite = o as THREE.Sprite
    if ((sprite as any).isSprite) (sprite.material as THREE.Material)?.dispose()
  })
}

/** Load a GLB for a prop entity, replacing its placeholder mesh in place. */
export async function loadPropGLB(entity: Entity, url: string, skipUndo = false) {
  try {
    const gltf = await _gltfLoader.loadAsync(url)
    const model = gltf.scene
    model.traverse(o => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true } })

    const old = entity._mesh
    const pos = old.position.clone()
    const rot = old.rotation.y
    const wasSelected = state.selected === entity
    const wasMulti = state.multiSelected.has(entity)
    const hadGizmo = state.transformControls?.object === old

    model.scale.setScalar(entity.scaleVal)
    model.position.copy(pos)
    model.rotation.y = rot
    model.userData.entity = entity

    // Rest the model's base on the placement height (props otherwise float/clip),
    // matching the runtime builder's ground-snap behaviour.
    if (!entity.userData.heightAdjusted) {
      model.updateMatrixWorld(true)
      const bb = new THREE.Box3().setFromObject(model)
      if (Number.isFinite(bb.min.y)) {
        model.position.y += pos.y - bb.min.y
        entity.userData.heightAdjusted = true
      }
    }

    state.scene!.remove(old)
    disposeObject(old)
    entity._mesh = model
    state.scene!.add(model)

    // The placeholder we just disposed may have held the gizmo / selection state.
    if (hadGizmo && state.transformControls) state.transformControls.attach(model)
    if (wasSelected) entity.select(true)
    else if (wasMulti) entity.select(false)

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

/** Update the inspector panel (Unity/Godot-style) */
export function updateInspector() {
  const panel = document.getElementById('inspector-content')
  const e = state.selected
  const selSet = getSelectionSet()
  const multi = selSet.size > 1

  if (!panel) return
  if (!e && !multi) { panel.innerHTML = '<div class="inspector-empty">Select an entity to inspect</div>'; return }

  let html = ''

  if (multi) {
    html += `<div class="inspector-section">
      <div class="inspector-section-title">Multi-Select (${selSet.size} entities)</div>
      <div class="inspector-row"><label>Rotation</label><input type="number" step="0.05" value="0" data-field="rotY"></div>
      <div class="inspector-row"><label>Scale</label><input type="number" step="0.1" value="1" data-field="scale"></div>
    </div>`
    panel.innerHTML = html
    panel.querySelectorAll('input').forEach(input => {
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
  const typeLabel = labelMap[e.type] ?? e.type

  // Transform section
  html += `<div class="inspector-section">
    <div class="inspector-section-title">Transform</div>
    <div class="inspector-row"><label>Position X</label><input type="number" step="0.1" value="${round2(e.position.x)}" data-field="posX"></div>
    <div class="inspector-row"><label>Position Z</label><input type="number" step="0.1" value="${round2(e.position.z)}" data-field="posZ"></div>
    <div class="inspector-row"><label>Rotation</label><input type="number" step="0.05" value="${round2(e.rotY)}" data-field="rotY"></div>`
  if (e.type.startsWith('prop')) {
    html += `<div class="inspector-row"><label>Scale</label><input type="number" step="0.1" value="${e.scaleVal || 1}" data-field="scale"></div>`
  }
  html += `</div>`

  // Entity info section
  html += `<div class="inspector-section">
    <div class="inspector-section-title">Entity Info</div>
    <div class="inspector-row" style="margin-bottom:0"><label>Type</label><span style="font-size:11px;color:var(--text-dim)">${typeLabel}</span></div>
  </div>`

  // Enemy-specific section
  if (e.type === 'enemySpawn') {
    html += `<div class="inspector-section">
      <div class="inspector-section-title">Enemy Settings</div>
      <div class="inspector-row"><label>HP</label><input type="number" value="${e.userData.hp || 100}" data-field="hp"></div>
      <div class="inspector-row"><label>Patrol ID</label><input type="number" value="${e.userData.patrolId || 0}" data-field="patrolId"></div>
      <div class="inspector-row"><label>Territory</label><input type="number" step="0.5" value="${e.userData.territoryRadius || 12}" data-field="territoryRadius"></div>
    </div>`
  }

  // Prop-specific section
  if (e.type.startsWith('prop') && e.userData.hp) {
    html += `<div class="inspector-section">
      <div class="inspector-section-title">Prop Properties</div>
      <div class="inspector-row"><label>HP</label><input type="number" value="${e.userData.hp}" data-field="hp"></div>
    </div>`
  }

  // Actions
  html += `<div class="inspector-actions">
    <button class="delete" id="inspector-delete">Delete</button>
    <button class="duplicate" id="inspector-duplicate">Duplicate</button>
  </div>`

  panel.innerHTML = html

  panel.querySelectorAll('input').forEach(input => {
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

  document.getElementById('inspector-delete')?.addEventListener('click', deleteSelected)
  document.getElementById('inspector-duplicate')?.addEventListener('click', duplicateSelected)
}

/** Update the scene hierarchy list */
export function updateHierarchy() {
  const list = document.getElementById('hierarchy-list')
  const count = document.getElementById('entity-count')
  if (!list) return
  const entityCount = state.entities.length
  if (count) count.textContent = `(${entityCount})`

  if (entityCount === 0) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text-dim);padding:8px;text-align:center">No entities</div>'
    return
  }

  let html = ''
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i]
    const colorMap: Record<string, string> = {
      playerSpawn: '#4caf7d', enemySpawn: '#e0615d', waypoint: '#42a5f5',
    }
    const color = colorMap[e.type] || '#888888'
    const labelMap: Record<string, string> = {
      playerSpawn: 'Player Spawn', enemySpawn: 'Enemy Spawn', waypoint: 'Waypoint',
    }
    let label = labelMap[e.type] || e.type
    if (e.type.startsWith('prop') && e.userData.asset) {
      label = e.userData.asset.split('/').pop()?.replace('.glb', '') || e.type
    }
    if (e.type === 'waypoint' && e.userData.order !== undefined) label += ' #' + e.userData.order
    const isSel = state.selected === e || state.multiSelected.has(e)
    html += `<div class="hierarchy-item${isSel ? ' selected' : ''}" data-index="${i}">
      <span class="dot" style="background:${color}"></span>
      <span class="label">${label}</span>
    </div>`
  }
  list.innerHTML = html

  list.querySelectorAll('.hierarchy-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt((item as HTMLElement).dataset.index!)
      const entity = state.entities[idx]
      if (!entity) return
      clearMultiSelection()
      selectEntity(entity)
      // Attach transform gizmo
      const tc = state.transformControls
      if (tc) {
        tc.attach(entity._mesh)
        tc.visible = true
      }
    })
  })
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