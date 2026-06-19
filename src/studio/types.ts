import * as THREE from 'three'

/** Entity type to mesh color mapping */
export const ENTITY_COLORS: Record<string, number> = {
  playerSpawn: 0x4caf7d,
  enemySpawn: 0xe0615d,
  waypoint: 0x42a5f5,
  propCrate: 0x8b6a3b,
  propBarrel: 0x6b7b8d,
  propTarget: 0xecd46e,
}

export const ENTITY_LABELS: Record<string, string> = {
  playerSpawn: 'Player Spawn',
  enemySpawn: 'Enemy Spawn',
  waypoint: 'Waypoint',
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** Reactive HP defaults */
export const REACTIVE_HP = { crate: 70, barrel: 120, target: 40 }

/** A snapshot of an Entity for undo/redo */
export interface EntitySnapshot {
  type: string
  x: number; y: number; z: number
  rotY: number
  scale: number
  userData: Record<string, any>
}

/**
 * Core Entity class — a placed object in the editor (spawn, waypoint, or prop).
 */
export class Entity {
  type: string
  position: THREE.Vector3
  rotY: number
  scaleVal = 1
  userData: Record<string, any> = {}
  _mesh: THREE.Object3D
  _label: THREE.Sprite | null = null

  constructor(type: string, position: THREE.Vector3, rotY = 0) {
    this.type = type
    this.position = position.clone()
    this.rotY = rotY
    this._mesh = createEntityMesh(type)
    this._mesh.position.copy(position)
    this._mesh.rotation.y = rotY
    this._mesh.userData.entity = this
    this._updateLabel()
  }

  setPosition(p: THREE.Vector3) { this.position.copy(p); this._mesh.position.copy(p) }
  setRotY(r: number) { this.rotY = r; this._mesh.rotation.y = r }
  setScale(s: number) { this.scaleVal = s; if (this._mesh.scale) this._mesh.scale.setScalar(s) }
  get scale(): number { return this.scaleVal }

  select(hot = false) {
    this._traverseMaterials(m => {
      const msh = m as any
      msh._origEmissive = msh._origEmissive ?? msh.emissive?.getHex?.() ?? 0
      if (msh.emissive) { msh.emissive.setHex(hot ? 0xffffff : 0x4488ff); msh.emissiveIntensity = hot ? 0.5 : 0.3 }
    })
  }
  deselect() {
    this._traverseMaterials(m => {
      const msh = m as any
      if (msh._origEmissive !== undefined && msh.emissive) {
        msh.emissive.setHex(msh._origEmissive)
        msh.emissiveIntensity = 0
      }
    })
  }
  _traverseMaterials(fn: (m: THREE.Material) => void) {
    if (!this._mesh) return
    this._mesh.traverse(o => {
      if ((o as THREE.Mesh).isMesh) {
        const mat = (o as THREE.Mesh).material
        if (Array.isArray(mat)) mat.forEach(fn); else fn(mat)
      }
    })
  }

  toLayout(): Record<string, any> {
    const base: Record<string, any> = { x: round2(this.position.x), z: round2(this.position.z), rotY: round2(this.rotY) }
    if (this.position.y !== 0.5) base.y = round2(this.position.y)
    if (this.type === 'playerSpawn') return { type: 'playerSpawn', ...base }
    if (this.type === 'enemySpawn') {
      const e: Record<string, any> = { type: 'enemySpawn', ...base }
      if (this.userData.hp) e.hp = this.userData.hp
      if (this.userData.patrolId) e.patrolId = this.userData.patrolId
      if (this.userData.territoryRadius) e.territoryRadius = this.userData.territoryRadius
      return e
    }
    if (this.type === 'waypoint') {
      const wp: Record<string, any> = { type: 'waypoint', ...base }
      if (this.userData.groupId) wp.groupId = this.userData.groupId
      if (this.userData.order !== undefined) wp.order = this.userData.order
      return wp
    }
    const prop: Record<string, any> = { type: this.type, ...base, asset: this.userData.asset || '' }
    if (this.scaleVal !== 1) prop.scale = this.scaleVal
    if (this.userData.desiredHeight) prop.desiredHeight = this.userData.desiredHeight
    if (this.userData.hp) {
      prop.hp = this.userData.hp
      if (this.userData.reactiveType) prop.reactive = this.userData.reactiveType
    }
    return prop
  }

  _updateLabel() {
    if (this.type.startsWith('prop')) return
    if (this._label) { this._label.removeFromParent(); this._label = null }
    const canvas = document.createElement('canvas')
    canvas.width = 256; canvas.height = 48
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.roundRect(0, 0, 256, 48, 6); ctx.fill()
    ctx.fillStyle = this.type === 'playerSpawn' ? '#4caf7d' : this.type === 'enemySpawn' ? '#e0615d' : '#42a5f5'
    ctx.font = 'bold 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    let label = ENTITY_LABELS[this.type] || this.type
    if (this.type === 'waypoint' && this.userData.order) label += ' #' + this.userData.order
    ctx.fillText(label, 128, 26)
    const tex = new THREE.CanvasTexture(canvas); tex.needsUpdate = true
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, sizeAttenuation: true })
    this._label = new THREE.Sprite(mat)
    this._label.scale.set(4, 0.75, 1); this._label.position.set(0, 1.8, 0)
    this._mesh.add(this._label)
  }

  snapshot(): EntitySnapshot {
    return {
      type: this.type,
      x: this.position.x, y: this.position.y, z: this.position.z,
      rotY: this.rotY, scale: this.scaleVal,
      userData: JSON.parse(JSON.stringify(this.userData)),
    }
  }

  applySnapshot(s: EntitySnapshot) {
    this.setPosition(new THREE.Vector3(s.x, s.y, s.z))
    this.setRotY(s.rotY); this.setScale(s.scale)
    this.userData = JSON.parse(JSON.stringify(s.userData))
    this._updateLabel()
  }
}

/** Create a placeholder mesh for an entity type */
function createEntityMesh(type: string): THREE.Object3D {
  if (type === 'playerSpawn') {
    const geo = new THREE.SphereGeometry(0.35, 12, 12); geo.scale(1, 0.3, 1)
    const mat = new THREE.MeshStandardMaterial({ color: 0x4caf7d, emissive: 0x4caf7d, emissiveIntensity: 0.15 })
    const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 0.15
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 8), new THREE.MeshStandardMaterial({ color: 0x4caf7d }))
    arrow.position.set(0, 0.3, 0.35); mesh.add(arrow); return mesh
  }
  if (type === 'enemySpawn') {
    const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8)
    const mat = new THREE.MeshStandardMaterial({ color: 0xe0615d, emissive: 0xe0615d, emissiveIntensity: 0.15 })
    const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 0.25; return mesh
  }
  if (type === 'waypoint') {
    const geo = new THREE.OctahedronGeometry(0.3)
    const mat = new THREE.MeshStandardMaterial({ color: 0x42a5f5, emissive: 0x42a5f5, emissiveIntensity: 0.15 })
    const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 0.3; return mesh
  }
  // Props — solid translucent placeholder cube shown only until the GLB loads
  const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6)
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a8fcf, emissive: 0x223355, transparent: true, opacity: 0.55 })
  const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 0.3; return mesh
}