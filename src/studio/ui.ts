import { state } from './state'
import { getSelectionSet } from './entities'
import { ENTITY_LABELS } from './types'

/** Update the bottom status bar with current tool/entity count/selection */
export function updateStatus() {
  const el = document.getElementById('status')
  if (!el) return
  const toolName = state.activeTool
    ? (ENTITY_LABELS[state.activeTool] ?? state.activeTool.replace(/^prop/, '').replace(/\//g, ' '))
    : '—'
  const entityCount = state.entities.length
  const selSet = getSelectionSet()
  const selCount = selSet.size
  let selName = 'none'
  if (selCount > 1) selName = selCount + ' multi'
  else if (state.selected) selName = ENTITY_LABELS[state.selected.type] ?? state.selected.type
  el.innerHTML = `Tool: <strong>${toolName}</strong> · Entities: <strong>${entityCount}</strong> · Selected: <strong>${selName}</strong>`
}

/** Update the undo/redo button disabled state */
export function updateUndoButtons() {
  const u = document.getElementById('undo-btn') as HTMLButtonElement | null
  const r = document.getElementById('redo-btn') as HTMLButtonElement | null
  if (u) u.disabled = state.undoStack.length === 0
  if (r) r.disabled = state.redoStack.length === 0
}