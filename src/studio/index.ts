import * as THREE from 'three'
import { state } from './state'
import { injectStyles } from './styles'
import { initScene, loadMap, updateStatusBarMessage } from './scene'
import { buildPalette } from './palette'
import { setActiveTool } from './tools'
import { rebuildWaypointLines } from './waypoints'
import { updateSelectionCount, getSelectionSet, deleteSelected, duplicateSelected, createEntity, updateInspector, updateHierarchy } from './entities'
import { getGroundPoint } from './scene'
import { selectEntity, clearMultiSelection, getEntityAtPointer, updateSelectionBox, selectEntitiesInBox, toggleMultiSelect } from './selection'
import { updateGhost } from './scene'
import { undo, redo } from './undo'
import { exportLayout, importLayout, buildLayoutJSON } from './importexport'
import { updateStatus, updateUndoButtons } from './ui'
import { saveLayoutToIndexedDB, loadLayoutFromIndexedDB } from './storage'

/**
 * Map Studio — main entry point.
 */
function main() {
  injectStyles()
  initScene()
  buildPalette()
  setupPointerEvents()
  setupKeyboard()
  setupTransformModeButtons()
  setupPanelTabs()
  setupToolbar()
  setupModals()
  setupResize()
  updateUndoButtons()
  updateStatus()
  updateHierarchy()
  restoreLastSession()
}

let selBoxActive = false
let selBoxStartPt: { x: number; z: number } | null = null
let _isRestoring = false

function setupPointerEvents() {
  const el = state.renderer!.domElement
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
}

function attachGizmo(obj: THREE.Object3D | null) {
  const tc = state.transformControls
  if (!tc) return
  if (tc.object === obj) return
  tc.detach()
  tc.visible = false
  if (obj) {
    tc.attach(obj)
    tc.visible = true
  }
}

function setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
  state.transformMode = mode
  const tc = state.transformControls
  if (tc) tc.setMode(mode)
  document.querySelectorAll('#transform-group .tb-btn').forEach(b => b.classList.remove('active'))
  const btn = document.getElementById(`mode-${mode}`)
  if (btn) btn.classList.add('active')
}

function focusOnSelected() {
  const selSet = getSelectionSet()
  if (selSet.size === 0) return
  const avg = new THREE.Vector3()
  for (const e of selSet) avg.add(e.position)
  avg.divideScalar(selSet.size)
  const controls = state.controls!
  const cam = state.camera!
  const curTarget = controls.target.clone()
  const dir = cam.position.clone().sub(curTarget).normalize()
  const dist = cam.position.distanceTo(curTarget)
  controls.target.copy(avg)
  cam.position.copy(avg).add(dir.multiplyScalar(Math.max(dist, 3)))
  controls.update()
}

function onPointerDown(event: PointerEvent) {
  if (state.transformDragging) return
  if (event.button === 2) {
    const entity = getEntityAtPointer(event)
    if (!entity) { attachGizmo(null); clearMultiSelection(); selectEntity(null) }
    return
  }
  if (event.button !== 0) return

  const entity = getEntityAtPointer(event)

  if (event.shiftKey && entity) {
    toggleMultiSelect(entity)
    if (state.selected !== entity) selectEntity(entity)
    return
  }

  if (event.ctrlKey && !entity) {
    const pt = getGroundPoint(event)
    if (!pt) return
    selBoxActive = true
    selBoxStartPt = { x: pt.x, z: pt.z }
    state.controls!.enabled = false
    if (!event.shiftKey) clearMultiSelection()
    return
  }

  if (entity) {
    const selSet = getSelectionSet()
    if (!selSet.has(entity)) { clearMultiSelection(); selectEntity(entity) }
    attachGizmo(entity._mesh)
    return
  }

  attachGizmo(null)
  clearMultiSelection()
  selectEntity(null)

  if (state.activeTool) {
    const pt = getGroundPoint(event)
    if (!pt) return
    createEntity(state.activeTool, pt)
  }
}

function onPointerMove(event: PointerEvent) {
  if (!state.transformDragging && state.activeTool) updateGhost(event)
  if (selBoxActive && selBoxStartPt) {
    const pt = getGroundPoint(event)
    if (pt) updateSelectionBox({ x: selBoxStartPt.x, y: 0, z: selBoxStartPt.z } as any, pt)
    return
  }
  const hoverEntity = getEntityAtPointer(event)
  state.renderer!.domElement.style.cursor = hoverEntity ? 'pointer' : (state.activeTool ? 'crosshair' : 'default')
}

function onPointerUp(event: PointerEvent) {
  if (state.transformDragging) return
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
    if (e.key === 'Escape') { setActiveTool(null); attachGizmo(null); clearMultiSelection(); selectEntity(null); return }
    if (e.key === '1') { setActiveTool('playerSpawn'); attachGizmo(null); return }
    if (e.key === '2') { setActiveTool('enemySpawn'); attachGizmo(null); return }
    if (e.key === '3') { setActiveTool('waypoint'); attachGizmo(null); return }
    if (e.key === 'w' || e.key === 'W') { setTransformMode('translate'); return }
    if (e.key === 'e' || e.key === 'E') { setTransformMode('rotate'); reattachGizmo(); return }
    if (e.key === 'r' || e.key === 'R') { setTransformMode('scale'); reattachGizmo(); return }
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); focusOnSelected(); return }
  })
}

function reattachGizmo() {
  const selSet = getSelectionSet()
  if (selSet.size === 0) return
  const first = selSet.values().next().value
  if (first) attachGizmo(first._mesh)
}

function setupPanelTabs() {
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      document.querySelectorAll('.panel-content').forEach(c => c.classList.remove('active'))
      const target = document.getElementById((tab as HTMLElement).dataset.tab!)
      if (target) target.classList.add('active')
    })
  })
}

function setupTransformModeButtons() {
  document.getElementById('mode-translate')?.addEventListener('click', () => setTransformMode('translate'))
  document.getElementById('mode-rotate')?.addEventListener('click', () => { setTransformMode('rotate'); reattachGizmo() })
  document.getElementById('mode-scale')?.addEventListener('click', () => { setTransformMode('scale'); reattachGizmo() })
  document.getElementById('focus-btn')?.addEventListener('click', focusOnSelected)
}

function setupToolbar() {
  const mapSelect = document.getElementById('map-select') as HTMLSelectElement
  const typeBadge = document.getElementById('map-type-badge') as HTMLElement

  mapSelect?.addEventListener('change', () => {
    const opt = mapSelect.options[mapSelect.selectedIndex]
    const type = opt?.dataset?.type || ''
    typeBadge.textContent = type === 'canvas' ? '🎨 Canvas' : type === 'map' ? '🏙️ Map' : ''
    typeBadge.style.color = type === 'canvas' ? 'var(--green)' : 'var(--accent)'
  })

  document.getElementById('load-map-btn')?.addEventListener('click', () => { if (mapSelect.value) loadMapAndRestore(mapSelect.value) })
  document.getElementById('undo-btn')?.addEventListener('click', undo)
  document.getElementById('redo-btn')?.addEventListener('click', redo)
  document.getElementById('export-btn')?.addEventListener('click', () => {
    const textarea = document.getElementById('export-text') as HTMLTextAreaElement
    textarea.value = buildLayoutJSON()
    document.getElementById('export-modal')?.classList.remove('hidden')
  })
  document.getElementById('import-btn')?.addEventListener('click', () => document.getElementById('import-modal')?.classList.remove('hidden'))
  document.getElementById('delete-btn')?.addEventListener('click', deleteSelected)
  document.getElementById('duplicate-btn')?.addEventListener('click', duplicateSelected)
  document.getElementById('grid-toggle')?.addEventListener('click', () => { if (state.grid) state.grid.visible = !state.grid.visible })
  document.getElementById('snap-select')?.addEventListener('change', e => { state.snapSize = parseFloat((e.target as HTMLSelectElement).value) || 0 })
  document.getElementById('run-btn')?.addEventListener('click', async () => {
    if (!state.mapId) { alert('Load a map first!'); return }
    await saveLayoutToIndexedDB(state.mapId, buildLayoutJSON())
    showSavedIndicator()
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
  document.getElementById('export-close')?.addEventListener('click', () => document.getElementById('export-modal')?.classList.add('hidden'))
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
  document.getElementById('import-close')?.addEventListener('click', () => document.getElementById('import-modal')?.classList.add('hidden'))
  document.getElementById('import-apply')?.addEventListener('click', () => {
    const text = (document.getElementById('import-text') as HTMLTextAreaElement).value
    importLayout(text)
    document.getElementById('import-modal')?.classList.add('hidden')
  })
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

function saveSession(mapId: string) {
  try { localStorage.setItem('map-studio-session', JSON.stringify({ mapId })) } catch { }
}

function tryParseJSON(text: string): any {
  try { return JSON.parse(text) } catch { return null }
}

async function loadMapAndRestore(mapId: string) {
  await loadMap(mapId)
  saveSession(mapId)
  const isCanvas = mapId === 'shootRange' || mapId === 'suburbanStreet' || mapId === 'industrialYard'
  if (isCanvas) {
    let json: string | null = await loadLayoutFromIndexedDB(mapId)
    if (json) {
      const parsed = tryParseJSON(json)
      if (parsed && parsed.version) {
        _isRestoring = true; importLayout(json); _isRestoring = false
        updateStatus(); showSavedIndicator(); return
      }
    }
    try {
      const res = await fetch(`./assets/maps/${mapId}.layout.json`)
      if (res.ok) {
        json = await res.text()
        const parsed = tryParseJSON(json)
        if (parsed && parsed.version) { _isRestoring = true; importLayout(json); _isRestoring = false; updateStatus() }
      }
    } catch { }
  }
}

export function autoSaveLayout() {
  if (!state.mapId) return
  saveLayoutToIndexedDB(state.mapId, buildLayoutJSON())
  showSavedIndicator()
}

function showSavedIndicator() {
  const el = document.getElementById('save-indicator')
  if (!el) return
  el.style.display = 'inline'
  clearTimeout((el as any)._saveTimer)
  ;(el as any)._saveTimer = setTimeout(() => { el.style.display = 'none' }, 3000)
}

async function restoreLastSession() {
  try {
    const stored = localStorage.getItem('map-studio-session')
    if (!stored) return
    const { mapId } = JSON.parse(stored)
    if (mapId) {
      const sel = document.getElementById('map-select') as HTMLSelectElement
      if (sel) sel.value = mapId
      const evt = new Event('change')
      sel?.dispatchEvent(evt)
      await loadMapAndRestore(mapId)
    }
  } catch { }
}

main()