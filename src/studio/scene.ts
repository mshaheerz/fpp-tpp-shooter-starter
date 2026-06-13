import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { state } from './state'
import { clearAllEntities } from './entities'
import { clearWaypointLines } from './waypoints'
import { updateStatus } from './ui'
import { pushUndo } from './undo'

export function initScene() {
  const container = document.getElementById('viewport')!
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1e2a)
  scene.fog = new THREE.Fog(0x1a1e2a, 150, 500)
  state.scene = scene

  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 500)
  camera.position.set(20, 15, 20)
  state.camera = camera

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  container.appendChild(renderer.domElement)
  state.renderer = renderer

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.update()
  state.controls = controls

  // Lights
  scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x3a3024, 0.6))
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.2)
  sun.position.set(40, 60, 25)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 160
  const ss = 40
  sun.shadow.camera.left = -ss; sun.shadow.camera.right = ss
  sun.shadow.camera.top = ss; sun.shadow.camera.bottom = -ss
  sun.shadow.bias = -0.001
  scene.add(sun); scene.add(sun.target)
  scene.add(new THREE.AmbientLight(0x404060, 0.3))

  // Grid
  const grid = new THREE.GridHelper(120, 40, 0x4a5060, 0x2a3040)
  scene.add(grid)
  state.grid = grid

  // Ghost mesh
  const ghostGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6)
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.3, depthWrite: false })
  const ghost = new THREE.Mesh(ghostGeo, ghostMat)
  ghost.visible = false
  scene.add(ghost)
  state.ghostMesh = ghost

  // Selection box
  const selBoxGeo = new THREE.BufferGeometry()
  const selBoxMat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 })
  const selBox = new THREE.Line(selBoxGeo, selBoxMat)
  selBox.visible = false
  scene.add(selBox)
  state.selBoxMesh = selBox

  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault())

  animate()
}

function animate() {
  requestAnimationFrame(animate)
  if (state.renderer && state.scene && state.camera) {
    state.renderer.render(state.scene, state.camera)
  }
}

/** Get the 3D point on the ground under the mouse */
export function getGroundPoint(event: PointerEvent | MouseEvent): THREE.Vector3 | null {
  const rect = state.renderer!.domElement.getBoundingClientRect()
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  state.raycaster.setFromCamera(state.pointer, state.camera!)

  const meshes: THREE.Mesh[] = []
  if (state.mapRoot) state.mapRoot.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh) })
  if (meshes.length > 0) {
    const hits = state.raycaster.intersectObjects(meshes, false)
    for (const hit of hits) {
      if (hit.distance < 200) return hit.point
    }
  }
  // Fallback plane at y=0
  const planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const pt = new THREE.Vector3()
  const ray = state.raycaster.ray
  const denom = ray.direction.dot(planeY.normal)
  if (Math.abs(denom) < 0.001) return null
  const t = -(ray.origin.dot(planeY.normal) + planeY.constant) / denom
  if (t < 0) return null
  return pt.copy(ray.origin).add(ray.direction.clone().multiplyScalar(t))
}

/** Snap a point to the current grid */
export function snapPos(pt: THREE.Vector3 | null): THREE.Vector3 | null {
  if (!pt) return pt
  const s = state.snapSize
  if (s <= 0) return pt
  pt.x = Math.round(pt.x / s) * s
  pt.z = Math.round(pt.z / s) * s
  return pt
}

/** Update the placement ghost mesh */
export function updateGhost(event: PointerEvent) {
  const ghost = state.ghostMesh
  if (!state.activeTool || !ghost) { ghost!.visible = false; return }
  const pt = getGroundPoint(event)
  if (!pt) { ghost.visible = false; return }
  snapPos(pt)
  pt.y = 0.5
  ghost.position.copy(pt)
  ghost.visible = true

  const tool = state.activeTool
  if (tool === 'playerSpawn') { ghost.geometry = new THREE.SphereGeometry(0.35, 8, 8); ghost.scale.set(1, 0.3, 1); ghost.position.y = 0.15 }
  else if (tool === 'enemySpawn') { ghost.geometry = new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8); ghost.scale.setScalar(1); ghost.position.y = 0.25 }
  else if (tool === 'waypoint') { ghost.geometry = new THREE.OctahedronGeometry(0.3); ghost.scale.setScalar(1); ghost.position.y = 0.3 }
  else { ghost.geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6); ghost.scale.setScalar(1); ghost.position.y = 0.3 }
}

/** Load a GLB map into the scene */
export async function loadMap(mapId: string) {
  if (state.mapRoot) {
    state.scene!.remove(state.mapRoot)
    state.mapRoot.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry?.dispose() })
    state.mapRoot = null
  }
  clearAllEntities()
  state.mapId = mapId
  state.undoStack = []; state.redoStack = []
  updateUndoButtons()

  // Remove any existing flat ground if we had one
  if (state._flatGround) {
    state.scene!.remove(state._flatGround)
    state._flatGround = null
  }

  const mapUrls: Record<string, string> = {
    shootRange: '/assets/maps/ghost_city.glb',
    suburbanStreet: '/assets/maps/ghost_city.glb',
    industrialYard: '/assets/maps/ghost_city.glb',
    ghostCity: '/assets/maps/ghost_city.glb',
    deathmatch1: '/assets/maps/lowpoly__fps__tdm__game__map_by_resoforge.glb',
    deathmatch2: '/assets/maps/RP_MAP_1.glb',
  }

  // For Kenney-based maps (no monolithic GLB): create a flat ground + load layout
  if (mapId === 'shootRange' || mapId === 'suburbanStreet' || mapId === 'industrialYard') {
    try {
      // Add a flat ground plane so the user can see a surface
      addFlatGround()
      state.controls!.target.set(0, 0, 0)
      state.camera!.position.set(20, 15, 20)
      state.controls!.update()
      updateStatusBarMessage(`Loaded "${mapId}" — ground ready, place props from palette.`)
    } catch (e) {
      console.error('Failed to init map:', e)
      updateStatusBarMessage(`Failed to init "${mapId}"`)
    }
    return
  }

  // For monolithic GLB maps: load the GLB
  const url = mapUrls[mapId]
  if (!url) { updateStatusBarMessage(`No map data for "${mapId}"`); return }

  updateStatusBarMessage(`Loading "${mapId}"...`)
  try {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    const root = gltf.scene

    // Enable shadows on all meshes
    root.traverse(o => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).castShadow = true
        ;(o as THREE.Mesh).receiveShadow = true
      }
    })

    // Remove empty Armature/Bone nodes (from Blender export) that have no
    // children and are not meshes. These can interfere with rendering.
    // But DO NOT detach meshes from their parents — skinned meshes need
    // their bone hierarchy to render correctly.
    const empties: THREE.Object3D[] = []
    root.traverse(o => {
      if (o.type === 'Bone' || o.type === 'Armature') {
        // Only remove if it has no mesh descendants
        let hasMeshDescendant = false
        o.traverse(c => { if ((c as THREE.Mesh).isMesh) hasMeshDescendant = true })
        if (!hasMeshDescendant) empties.push(o)
      }
    })
    for (const o of empties) {
      o.removeFromParent()
    }

    // Count meshes for the status message
    let meshCount = 0
    root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshCount++ })

    if (meshCount === 0) {
      updateStatusBarMessage(`"${mapId}" loaded but contains no visible meshes.`)
      return
    }

    // Add the entire scene tree as-is (preserving parent/child relationships
    // for skins, transforms, and groups)
    state.scene!.add(root)
    state.mapRoot = root

    // Compute bounding box and adjust camera
    const box = new THREE.Box3().setFromObject(root)
    if (!box.isEmpty()) {
      const center = new THREE.Vector3(), size = new THREE.Vector3()
      box.getCenter(center); box.getSize(size)
      state.controls!.target.copy(center)
      const maxDim = Math.max(size.x, size.z, 1)
      const dist = Math.max(maxDim * 0.8, 10)
      state.camera!.position.set(center.x + dist, maxDim * 0.6 + 5, center.z + dist)
      state.controls!.update()
      updateStatusBarMessage(`Loaded "${mapId}" — ${meshCount} meshes, ${Math.round(maxDim)}m`)
    } else {
      updateStatusBarMessage(`Loaded "${mapId}" — ${meshCount} meshes (empty bounding box)`)
    }
  } catch (e) {
    console.error('Failed to load map:', e)
    updateStatusBarMessage(`Failed to load "${mapId}": ${(e as Error).message}`)
  }
}

/** Add a flat ground plane for Kenney-based maps (no monolithic GLB). */
function addFlatGround() {
  const geo = new THREE.PlaneGeometry(60, 60)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a3040,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -0.01
  mesh.receiveShadow = true
  state.scene!.add(mesh)
  state._flatGround = mesh
}

function updateUndoButtons() {
  const u = document.getElementById('undo-btn') as HTMLButtonElement
  const r = document.getElementById('redo-btn') as HTMLButtonElement
  if (u) u.disabled = state.undoStack.length === 0
  if (r) r.disabled = state.redoStack.length === 0
}

export function updateStatusBarMessage(msg: string) {
  const el = document.getElementById('status')
  if (!el) return
  const prefix = el.innerHTML.split('·').slice(0, 2).join('·')
  el.innerHTML = prefix + ` · <span style="color:var(--text-dim)">${msg}</span>`
}

export { updateUndoButtons }