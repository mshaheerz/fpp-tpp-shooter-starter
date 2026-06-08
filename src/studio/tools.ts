import { state } from './state'
import { updateGhost } from './scene'
import { updateStatus } from './ui'

/** Set or clear the active palette tool */
export function setActiveTool(tool: string | null) {
  state.activeTool = tool
  document.querySelectorAll('.palette-item').forEach(el => {
    el.classList.toggle('active', (el as HTMLElement).dataset.tool === tool)
  })
  if (!tool && state.ghostMesh) state.ghostMesh.visible = false
  updateStatus()
}

/** Place a preview ghost at the mouse position */
export function updateGhostOnMove(event: PointerEvent) {
  if (state.activeTool) updateGhost(event)
}