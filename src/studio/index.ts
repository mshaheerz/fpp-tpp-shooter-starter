import { state } from './state'
import { injectStyles } from './styles'
import { initScene, loadMap } from './scene'
import { buildPalette } from './palette'
import { setActiveTool } from './tools'
import { rebuildWaypointLines } from './waypoints'
import { updatePropertiesPanel, updateSelectionCount, getSelectionSet, deleteSelected, duplicateSelected, createEntity } from './entities'
import { getGroundPoint, snapPos } from './scene'
import { selectEntity, clearMultiSelection, getEntityAtPointer, updateSelectionBox, selectEntitiesInBox, toggleMultiSelect } from './selection'
import { updateGhost } from './scene'
import { undo, redo, pushUndo } from './undo'
import { exportLayout, importLayout } from './importexport'
import { updateStatus, updateUndoButtons } from './ui'

/**
 * Map Studio — main entry point.
 * Wires the Three.js scene, palette, properties panel, undo, etc.
 */
function main() {
  injectStyles()
  initScene()
  buildPalette()
  setupPointerEvents()
  setupKeyboard()
  setupToolbar()
  setupModals()
  setupResize()
  updateUndoButtons()
  updateStatus()

  console.log('🗺️ Map Studio v3 — TypeScript modules loaded')
  console.log('📖 [1/2/3] Tools, [Ctrl+Z] Undo, [Ctrl+Y] Redo, [Ctrl+D] Duplicate, [Del] Delete, [Shift+click] Multi-select')
}

let selBoxActive = false
let selBoxStartPt: { x: number; z: number } | null = null

function setupPointerEvents() {
  const el = state.renderer!.domElement
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return

  const entity = getEntityAtPointer(event)

  // Shift+click = multi-select toggle
  if (event.shiftKey && entity) {
    toggleMultiSelect(entity)
    if (state.selected !== entity) selectEntity(entity)
    return
  }

  // If entity clicked, start drag
  if (entity) {
    const selSet = getSelectionSet()
    if (!selSet.has(entity)) {
      clearMultiSelection()
      selectEntity(entity)
    }
    state.isDragging = true
    state.dragTarget = entity
    state.controls!.enabled = false
    state._dragStartPositions = new Map()
    for (const e of getSelectionSet()) {
      state._dragStartPositions!.set(e, e.position.clone())
    }
    return
  }

  // No entity — place or start selection box
  if (state.activeTool && !event.shiftKey && !event.ctrlKey) {
    const pt = getGroundPoint(event)
    if (!pt) return
    snapPos(pt); pt.y = 0.5
    createEntity(state.activeTool, pt)
    return
  }

  // Start selection box
  const pt = getGroundPoint(event)
  if (!pt) return
  selBoxActive = true
  selBoxStartPt = { x: pt.x, z: pt.z }
  state.controls!.enabled = false
  if (!event.shiftKey) clearMultiSelection()
}

function onPointerMove(event: PointerEvent) {
  if (state.activeTool) updateGhost(event)

  if (state.isDragging && state.dragTarget) {
    const pt = getGroundPoint(event)
    if (pt) {
      snapPos(pt); pt.y = 0.5
      const dx = pt.x - state.dragTarget.position.x
      const dz = pt.z - state.dragTarget.position.z
      for (const e of getSelectionSet()) {
        const orig = state._dragStartPositions?.get(e)
        if (orig) e.setPosition({ x: orig.x + dx, y: 0.5, z: orig.z + dz } as any)
      }
      updatePropertiesPanel()
      rebuildWaypointLines()
    }
    return
  }

  if (selBoxActive && selBoxStartPt) {
    const pt = getGroundPoint(event)
    if (pt) {
      updateSelectionBox(
        { x: selBoxStartPt.x, y: 0, z: selBoxStartPt.z } as any,
        pt
      )
    }
    return
  }

  // Hover
  const entity = getEntityAtPointer(event)
  state.renderer!.domElement.style.cursor = entity ? 'pointer' : (state.activeTool ? 'crosshair' : 'default')
}

function onPointerUp(event: PointerEvent) {
  if (state.isDragging) {
    state.isDragging = false
    state.dragTarget = null
    state.controls!.enabled = true
    pushUndo()
    return
  }
  if (selBoxActive) {
    selBoxActive = false
    state.controls!.enabled = true
    if (selBoxStartPt) {
      const pt = getGroundPoint(event)
      if (pt) selectEntitiesInBox({ x: selBoxStartPt.x, y: 0, z: selBoxStartPt.z } as any, pt)
      selBoxStartPt = null
      if (state.selBoxMesh) state.selBoxMesh.visible = false
    }
  }
}

function setupKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); return }
    if (e.ctrlKey && e.key === 'd') { e.preventDefault(); duplicateSelected(); return }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return }
    if (e.key === 'Escape') { setActiveTool(null); clearMultiSelection(); selectEntity(null); return }
    if (e.key === '1') setActiveTool('playerSpawn')
    if (e.key === '2') setActiveTool('enemySpawn')
    if (e.key === '3') setActiveTool('waypoint')
  })
}

function setupToolbar() {
  const mapSelect = document.getElementById('map-select') as HTMLSelectElement
  document.getElementById('load-map-btn')?.addEventListener('click', () => { if (mapSelect.value) loadMap(mapSelect.value) })
  document.getElementById('undo-btn')?.addEventListener('click', undo)
  document.getElementById('redo-btn')?.addEventListener('click', redo)
  document.getElementById('export-btn')?.addEventListener('click', exportLayout)
  document.getElementById('import-btn')?.addEventListener('click', () => document.getElementById('import-modal')?.classList.remove('hidden'))
  document.getElementById('delete-btn')?.addEventListener('click', deleteSelected)
  document.getElementById('prop-delete')?.addEventListener('click', deleteSelected)
  document.getElementById('duplicate-btn')?.addEventListener('click', duplicateSelected)
  document.getElementById('clear-all-btn')?.addEventListener('click', () => {
    if (confirm('Remove all entities?')) {
      for (const e of state.entities) state.scene!.remove(e._mesh)
      state.entities = []
      rebuildWaypointLines()
      state.selected = null
      state.multiSelected.clear()
      state.nextWaypointGroupId = 1
      updatePropertiesPanel()
      updateSelectionCount()
      updateStatus()
      pushUndo()
    }
  })
  document.getElementById('grid-toggle')?.addEventListener('click', () => {
    if (state.grid) state.grid.visible = !state.grid.visible
  })
  document.getElementById('snap-select')?.addEventListener('change', e => {
    state.snapSize = parseFloat((e.target as HTMLSelectElement).value) || 0
  })
  const fileInput = document.getElementById('file-input') as HTMLInputElement
  fileInput?.addEventListener('change', e => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => importLayout(ev.target!.result as string)
    reader.readAsText(file)
  })
}

function setupModals() {
  document.getElementById('export-close')?.addEventListener('click', () => {
    document.getElementById('export-modal')?.classList.add('hidden')
  })
  document.getElementById('export-copy')?.addEventListener('click', () => {
    const t = document.getElementById('export-text') as HTMLTextAreaElement
    t.select()
    navigator.clipboard.writeText(t.value).then(() => {
      const btn = document.getElementById('export-copy') as HTMLButtonElement
      const orig = btn.textContent
      btn.textContent = 'Copied!'
      setTimeout(() => { btn.textContent = orig }, 2000)
    })
  })
  document.getElementById('import-close')?.addEventListener('click', () => {
    document.getElementById('import-modal')?.classList.add('hidden')
  })
  document.getElementById('import-apply')?.addEventListener('click', () => {
    const text = (document.getElementById('import-text') as HTMLTextAreaElement).value
    importLayout(text)
    document.getElementById('import-modal')?.classList.add('hidden')
  })
  // Click outside modal closes
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden') })
  })
}

function setupResize() {
  window.addEventListener('resize', () => {
    const c = document.getElementById('viewport')!
    state.camera!.aspect = c.clientWidth / c.clientHeight
    state.camera!.updateProjectionMatrix()
    state.renderer!.setSize(c.clientWidth, c.clientHeight)
  })
}

main()