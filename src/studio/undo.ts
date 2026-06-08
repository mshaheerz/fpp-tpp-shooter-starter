import * as THREE from 'three'
import { state, ASSETS_BASE } from './state'
import { Entity, type EntitySnapshot } from './types'
import { clearWaypointLines, rebuildWaypointLines } from './waypoints'
import { updatePropertiesPanel, updateSelectionCount, loadPropGLB } from './entities'
import { updateStatus } from './ui'
import { updateUndoButtons } from './scene'

/** Snapshot the current scene state and push it onto the undo stack */
export function pushUndo() {
  const snapshot = state.entities.map(e => e.snapshot())
  state.undoStack.push(snapshot)
  if (state.undoStack.length > state.undoDepth) state.undoStack.shift()
  state.redoStack = []
  updateUndoButtons()
}

/** Pop the last snapshot and apply it (replacing all entities) */
export function undo() {
  if (!state.undoStack.length) return
  const cur = state.entities.map(e => e.snapshot())
  state.redoStack.push(cur)
  const prev = state.undoStack.pop()
  if (prev) restoreSnapshot(prev)
  updateUndoButtons()
}

/** Pop the last redo snapshot and apply it */
export function redo() {
  if (!state.redoStack.length) return
  const cur = state.entities.map(e => e.snapshot())
  state.undoStack.push(cur)
  const next = state.redoStack.pop()
  if (next) restoreSnapshot(next)
  updateUndoButtons()
}

/** Replace all current entities with those from a snapshot */
function restoreSnapshot(snap: EntitySnapshot[]) {
  for (const e of state.entities) {
    state.scene!.remove(e._mesh)
    if (e._label) e._label.removeFromParent()
  }
  clearWaypointLines()
  state.entities = []

  for (const s of snap) {
    const pos = new THREE.Vector3(s.x, s.y, s.z)
    const entity = new Entity(s.type, pos, s.rotY)
    entity.setScale(s.scale)
    entity.userData = JSON.parse(JSON.stringify(s.userData))
    state.scene!.add(entity._mesh)
    state.entities.push(entity)
    if (entity.userData.asset && entity.type.startsWith('prop')) {
      loadPropGLB(entity, ASSETS_BASE + entity.userData.asset, true)
    }
  }
  rebuildWaypointLines()
  state.selected = null
  state.multiSelected.clear()
  updatePropertiesPanel()
  updateSelectionCount()
  updateStatus()
}