import * as THREE from 'three'
import { state } from './state'
import { Entity } from './types'
import { updatePropertiesPanel, updateSelectionCount, updateInspector, updateHierarchy } from './entities'
import { updateStatus } from './ui'

/** Set the single selected entity (clears multi-select) */
export function selectEntity(entity: Entity | null) {
  if (state.selected && state.selected !== entity) state.selected.deselect()
  state.selected = entity
  if (entity) entity.select(true)
  updatePropertiesPanel()
  updateInspector()
  updateHierarchy()
  updateStatus()

  // Attach/detach transform gizmo
  const tc = state.transformControls
  if (tc) {
    if (entity) {
      tc.attach(entity._mesh)
      tc.visible = true
    } else {
      tc.detach()
      tc.visible = false
    }
  }
}

/** Toggle an entity in/out of the multi-select set */
export function toggleMultiSelect(entity: Entity) {
  if (state.multiSelected.has(entity)) {
    state.multiSelected.delete(entity)
    if (entity !== state.selected) entity.deselect()
  } else {
    state.multiSelected.add(entity)
    entity.select(false)
  }
  if (state.selected && !state.multiSelected.has(state.selected)) {
    state.multiSelected.add(state.selected)
  }
  updateSelectionCount()
  updateInspector()
  updateHierarchy()
}

/** Clear the multi-select set */
export function clearMultiSelection() {
  for (const e of state.multiSelected) {
    if (e !== state.selected) e.deselect()
  }
  state.multiSelected.clear()
  updateSelectionCount()
  updateInspector()
  updateHierarchy()
}

/** Update the rectangular selection box preview */
export function updateSelectionBox(start: THREE.Vector3 | null, end: THREE.Vector3 | null) {
  const box = state.selBoxMesh
  if (!box) return
  if (!start || !end) { box.visible = false; return }
  const minX = Math.min(start.x, end.x)
  const maxX = Math.max(start.x, end.x)
  const minZ = Math.min(start.z, end.z)
  const maxZ = Math.max(start.z, end.z)
  const pts = [
    new THREE.Vector3(minX, 0.05, minZ),
    new THREE.Vector3(maxX, 0.05, minZ),
    new THREE.Vector3(maxX, 0.05, maxZ),
    new THREE.Vector3(minX, 0.05, maxZ),
    new THREE.Vector3(minX, 0.05, minZ),
  ]
  box.geometry.dispose()
  box.geometry = new THREE.BufferGeometry().setFromPoints(pts)
  box.visible = true
}

/** Select all entities within a rectangular area */
export function selectEntitiesInBox(start: THREE.Vector3, end: THREE.Vector3) {
  const minX = Math.min(start.x, end.x)
  const maxX = Math.max(start.x, end.x)
  const minZ = Math.min(start.z, end.z)
  const maxZ = Math.max(start.z, end.z)
  clearMultiSelection()
  for (const e of state.entities) {
    if (e.position.x >= minX && e.position.x <= maxX && e.position.z >= minZ && e.position.z <= maxZ) {
      state.multiSelected.add(e)
      e.select(false)
    }
  }
  if (state.multiSelected.size > 0) {
    const arr = Array.from(state.multiSelected)
    selectEntity(arr[arr.length - 1])
  }
  if (state.selBoxMesh) state.selBoxMesh.visible = false
  updateSelectionCount()
  updateInspector()
  updateHierarchy()
}

/** Find the entity under the pointer (via raycast) */
export function getEntityAtPointer(event: PointerEvent | MouseEvent): Entity | null {
  const rect = state.renderer!.domElement.getBoundingClientRect()
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  state.raycaster.setFromCamera(state.pointer, state.camera!)
  const targets = state.entities.map(e => e._mesh)
  const hits = state.raycaster.intersectObjects(targets, true)
  if (hits.length > 0) {
    let obj: THREE.Object3D | null = hits[0].object
    while (obj) { if (obj.userData.entity) return obj.userData.entity; obj = obj.parent }
  }
  return null
}