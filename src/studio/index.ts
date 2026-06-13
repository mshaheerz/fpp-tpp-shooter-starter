import { state } from './state'
import { injectStyles } from './styles'
import { initScene, loadMap } from './scene'
import { buildPalette } from './palette'
import { setActiveTool } from './tools'
import { rebuildWaypointLines, flushWaypointRebuild } from './waypoints'
import { updatePropertiesPanel, updateSelectionCount, getSelectionSet, deleteSelected, duplicateSelected, createEntity } from './entities'
import { getGroundPoint, snapPos } from './scene'
import { selectEntity, clearMultiSelection, getEntityAtPointer, updateSelectionBox, selectEntitiesInBox, toggleMultiSelect } from './selection'
import { updateGhost } from './scene'
import { undo, redo, pushUndo } from './undo'
import { exportLayout, importLayout, buildLayoutJSON } from './importexport'
import { updateStatus, updateUndoButtons } from './ui'
import { saveLayoutToIndexedDB, loadLayoutFromIndexedDB } from './storage'

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
  restoreLastSession()

  console.log('🗺️ Map Studio v3 — TypeScript modules loaded')
  console.log('📖 [1/2/3] Tools, [Ctrl+Z] Undo, [Ctrl+Y] Redo, [Ctrl+D] Duplicate, [Del] Delete, [Shift+click] Multi-select, [Ctrl+drag] Selection box, [Right-click] Rotate, [▶ Run] Play-test')
}

let selBoxActive = false
let selBoxStartPt: { x: number; z: number } | null = null

/** When true, skip undo pushes during layout restore */
let _isRestoring = false

function setupPointerEvents() {
  const el = state.renderer!.domElement
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
}

function onPointerDown(event: PointerEvent) {
  // --- Right-click (button 2): start entity rotation ---
  if (event.button === 2) {
    const entity = getEntityAtPointer(event)
    if (entity) {
      const selSet = getSelectionSet()
      if (!selSet.has(entity)) {
        clearMultiSelection()
        selectEntity(entity)
      }
      state.isRotating = true
      state.rotationStartX = event.clientX
      state.rotationStartAngles = new Map()
      for (const e of getSelectionSet()) {
        state.rotationStartAngles.set(e, e.rotY)
      }
      state.controls!.enabled = false
    }
    return
  }

  // --- Left-click only from here ---
  if (event.button !== 0) return

  const entity = getEntityAtPointer(event)

  // Shift+click = multi-select toggle
  if (event.shiftKey && entity) {
    toggleMultiSelect(entity)
    if (state.selected !== entity) selectEntity(entity)
    return
  }

  // Ctrl+click (no entity) = start selection box
  if (event.ctrlKey && !entity) {
    const pt = getGroundPoint(event)
    if (!pt) return
    selBoxActive = true
    selBoxStartPt = { x: pt.x, z: pt.z }
    state.controls!.enabled = false
    if (!event.shiftKey) clearMultiSelection()
    return
  }

  // If entity clicked (no modifier), start drag
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

  // No entity, no modifier, but has active tool — place entity
  if (state.activeTool && !event.shiftKey && !event.ctrlKey) {
    const pt = getGroundPoint(event)
    if (!pt) return
    snapPos(pt); pt.y = 0.5
    createEntity(state.activeTool, pt)
    return
  }
}

function onPointerMove(event: PointerEvent) {
  // --- Right-click rotation ---
  if (state.isRotating && state.rotationStartX !== undefined && state.rotationStartAngles) {
    const dx = (event.clientX - state.rotationStartX) * 0.01
    for (const [ent, startAngle] of state.rotationStartAngles) {
      ent.setRotY(startAngle + dx)
    }
    updatePropertiesPanel()
    rebuildWaypointLines()
    return
  }

  // --- Ghost preview (only when NOT dragging and tool is active) ---
  if (!state.isDragging && state.activeTool) {
    updateGhost(event)
  }

  // --- Drag selected entities ---
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
      // Deferred waypoint rebuild (skipped during drag to avoid flicker)
      rebuildWaypointLines()
    }
    return
  }

  // --- Selection box ---
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

  // --- Hover cursor ---
  const hoverEntity = getEntityAtPointer(event)
  state.renderer!.domElement.style.cursor = hoverEntity ? 'pointer' : (state.activeTool ? 'crosshair' : 'default')
}

function onPointerUp(event: PointerEvent) {
  // --- End right-click rotation ---
  if (state.isRotating) {
    state.isRotating = false
    state.rotationStartAngles = null
    state.controls!.enabled = true
    if (!_isRestoring) pushUndo()
    return
  }

  // --- End drag ---
  if (state.isDragging) {
    state.isDragging = false
    state.dragTarget = null
    state.controls!.enabled = true
    flushWaypointRebuild()
    if (!_isRestoring) pushUndo()
    return
  }

  // --- End selection box ---
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
  const typeBadge = document.getElementById('map-type-badge') as HTMLElement

  // Update badge when selection changes
  mapSelect?.addEventListener('change', () => {
    const opt = mapSelect.options[mapSelect.selectedIndex]
    const type = opt?.dataset?.type || ''
    if (type === 'canvas') {
      typeBadge.textContent = '🎨 Canvas — add props from palette'
      typeBadge.style.color = 'var(--green)'
    } else if (type === 'map') {
      typeBadge.textContent = '🏙️ Full 3D Map'
      typeBadge.style.color = 'var(--accent)'
    } else {
      typeBadge.textContent = ''
    }
  })

  document.getElementById('load-map-btn')?.addEventListener('click', () => {
    if (mapSelect.value) loadMapAndRestore(mapSelect.value)
  })
  document.getElementById('undo-btn')?.addEventListener('click', undo)
  document.getElementById('redo-btn')?.addEventListener('click', redo)
  document.getElementById('export-btn')?.addEventListener('click', () => {
    const textarea = document.getElementById('export-text') as HTMLTextAreaElement
    const json = buildLayoutJSON()
    textarea.value = json
    document.getElementById('export-modal')?.classList.remove('hidden')
  })
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

  // Run button: save to IndexedDB + open game
  document.getElementById('run-btn')?.addEventListener('click', async () => {
    if (!state.mapId) { alert('Load a map first!'); return }
    const json = buildLayoutJSON()
    await saveLayoutToIndexedDB(state.mapId, json)
    showSavedIndicator()
    // Open the main game with this map in roam mode (using query params for main.ts)
    window.open(`/index.html?mode=roam&map=${state.mapId}`, '_blank')
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
  document.getElementById('export-save')?.addEventListener('click', async () => {
    const json = (document.getElementById('export-text') as HTMLTextAreaElement).value
    if (state.mapId) {
      await saveLayoutToIndexedDB(state.mapId, json)
      showSavedIndicator()
      window.open(`/index.html#mode=roam&map=${state.mapId}`, '_blank')
      document.getElementById('export-modal')?.classList.add('hidden')
    }
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

/** Save current mapId to localStorage for session restore on next load */
function saveSession(mapId: string) {
  try { localStorage.setItem('map-studio-session', JSON.stringify({ mapId })) } catch { /* ignore */ }
}

/** Try to parse JSON silently, return null on failure */
function tryParseJSON(text: string): any {
  try { return JSON.parse(text) } catch { return null }
}

/** Load a map then try to restore any saved layout from IndexedDB */
async function loadMapAndRestore(mapId: string) {
  await loadMap(mapId)
  saveSession(mapId)
  // For Kenney canvas maps, try to restore layout from IndexedDB first,
  // then fall back to loading from .layout.json file on disk
  const isCanvas = mapId === 'shootRange' || mapId === 'suburbanStreet' || mapId === 'industrialYard'
  if (isCanvas) {
    let json: string | null = null

    // Try IndexedDB first (user's saved work)
    json = await loadLayoutFromIndexedDB(mapId)
    if (json) {
      const parsed = tryParseJSON(json)
      if (parsed && parsed.version) {
        _isRestoring = true
        importLayout(json)
        _isRestoring = false
        updateStatus()
        showSavedIndicator()
        return
      }
    }

    // Fallback: try to load from .layout.json file on disk
    try {
      const res = await fetch(`./assets/maps/${mapId}.layout.json`)
      if (res.ok) {
        json = await res.text()
        const parsed = tryParseJSON(json)
        if (parsed && parsed.version) {
          _isRestoring = true
          importLayout(json)
          _isRestoring = false
          updateStatus()
        }
      }
    } catch { /* no layout file — empty canvas is fine */ }
  }
}

/** Auto-save layout to IndexedDB whenever undo stack changes */
export function autoSaveLayout() {
  if (!state.mapId) return
  const json = buildLayoutJSON()
  saveLayoutToIndexedDB(state.mapId, json)
  showSavedIndicator()
}

function showSavedIndicator() {
  const el = document.getElementById('save-indicator')
  if (!el) return
  el.style.display = 'inline'
  clearTimeout((el as any)._saveTimer)
  ;(el as any)._saveTimer = setTimeout(() => { el.style.display = 'none' }, 3000)
}

/** Restore the last session's map + layout */
async function restoreLastSession() {
  try {
    const stored = localStorage.getItem('map-studio-session')
    if (!stored) return
    const { mapId } = JSON.parse(stored)
    if (mapId) {
      // Pre-select in dropdown
      const sel = document.getElementById('map-select') as HTMLSelectElement
      if (sel) sel.value = mapId
      // Also update badge
      const evt = new Event('change')
      sel?.dispatchEvent(evt)
      await loadMapAndRestore(mapId)
    }
  } catch { /* ignore */ }
}

main()
