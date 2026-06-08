import * as THREE from 'three'
import type { Entity } from './types'

/**
 * Global mutable state for the Map Studio editor.
 * Import this from any module to access the shared state.
 */
export const state = {
  scene: null as THREE.Scene | null,
  camera: null as THREE.PerspectiveCamera | null,
  controls: null as any | null,
  renderer: null as THREE.WebGLRenderer | null,

  grid: null as THREE.GridHelper | null,
  mapRoot: null as THREE.Group | null,
  mapId: '',

  entities: [] as Entity[],
  selected: null as Entity | null,
  multiSelected: new Set<Entity>(),
  activeTool: null as string | null,

  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),

  dragTarget: null as Entity | null,
  isDragging: false,
  _dragStartPositions: null as Map<Entity, THREE.Vector3> | null,

  nextWaypointGroupId: 1,
  ghostMesh: null as THREE.Mesh | null,
  snapSize: 0.5,

  selBoxStart: null as THREE.Vector3 | null,
  selBoxMesh: null as THREE.Line | null,

  undoStack: [] as any[][],
  redoStack: [] as any[][],
  undoDepth: 50,
}

export const ASSETS_BASE = '/assets/kenney/'