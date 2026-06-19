import * as THREE from 'three'
import { state, ASSETS_BASE } from './state'
import { Entity, type EntitySnapshot } from './types'
import { clearWaypointLines, rebuildWaypointLines } from './waypoints'
import { updatePropertiesPanel, updateSelectionCount, loadPropGLB } from './entities'
import { updateStatus } from './ui'
import { updateUndoButtons } from './scene'

/**
 * Undo/redo model: `undoStack` is a list of full-scene snapshots whose TOP is
 * always the current state, with an empty baseline snapshot at the bottom.
 *   - pushUndo() records the new current state on top (one entry per action).
 *   - undo() pops the current state onto the redo stack and re-applies the new
 *     top (the previous state).
 *   - redo() moves a state back from redo to undo and applies it.
 */

/** True if two snapshots represent the same scene (used to collapse no-op pushes). */
function sameSnapshot(a: EntitySnapshot[], b: EntitySnapshot[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Reset history to a single empty baseline. Call on map load / fresh scene. */
export function resetUndo() {
  state.undoStack = [[]]
  state.redoStack = []
  updateUndoButtons()
}

/** Snapshot the current scene state and push it onto the undo stack */
export function pushUndo() {
  // Guarantee a baseline exists so the user can always undo back to "empty".
  if (state.undoStack.length === 0) state.undoStack.push([])
  const snapshot = state.entities.map(e => e.snapshot())
  const top = state.undoStack[state.undoStack.length - 1]
  // Collapse identical pushes (e.g. createEntity + async GLB-load both push, but
  // the transform data is unchanged) so each real action is exactly one step.
  if (top && sameSnapshot(top, snapshot)) return
  state.undoStack.push(snapshot)
  if (state.undoStack.length > state.undoDepth + 1) state.undoStack.shift()
  state.redoStack = []
  updateUndoButtons()
}

/** Step back one action: apply the previous snapshot. */
export function undo() {
  // Need more than just the baseline to have something to undo.
  if (state.undoStack.length <= 1) return
  const cur = state.undoStack.pop()!
  state.redoStack.push(cur)
  const prev = state.undoStack[state.undoStack.length - 1]
  restoreSnapshot(prev)
  updateUndoButtons()
}

/** Step forward one action: re-apply a previously undone snapshot. */
export function redo() {
  if (!state.redoStack.length) return
  const next = state.redoStack.pop()!
  state.undoStack.push(next)
  restoreSnapshot(next)
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
  // Detach gizmo
  if (state.transformControls) {
    state.transformControls.detach()
    state.transformControls.visible = false
  }
  updatePropertiesPanel()
  updateSelectionCount()
  updateStatus()
}
