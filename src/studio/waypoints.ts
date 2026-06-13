import * as THREE from 'three'
import { state } from './state'
import { Entity } from './types'

let _waypointLines: THREE.Line[] = []

/** Remove all waypoint connector lines */
export function clearWaypointLines() {
  for (const line of _waypointLines) {
    state.scene!.remove(line)
    line.geometry.dispose()
    ;(line.material as THREE.Material).dispose()
  }
  _waypointLines = []
}

/** Rebuild all waypoint connector lines based on current waypoint order */
export function rebuildWaypointLines() {
  if (state.isDragging) {
    // Defer rebuild to avoid geometry thrash during drag
    state._waypointsDirty = true
    return
  }
  _rebuildNow()
}

/** Actually perform the rebuild (called immediately or after drag ends). */
function _rebuildNow() {
  clearWaypointLines()
  const wps = state.entities.filter(e => e.type === 'waypoint')
  const groups = new Map<number, Entity[]>()
  for (const wp of wps) {
    const gid = wp.userData.groupId || 0
    if (!groups.has(gid)) groups.set(gid, [])
    groups.get(gid)!.push(wp)
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.userData.order || 0) - (b.userData.order || 0))
    for (let i = 0; i < group.length - 1; i++) {
      const a = group[i], b = group[i + 1]
      const pts = [a.position.clone(), b.position.clone()]
      pts[0].y = 0.2; pts[1].y = 0.2
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      const mat = new THREE.LineBasicMaterial({ color: 0x42a5f5, transparent: true, opacity: 0.4 })
      const line = new THREE.Line(geo, mat)
      state.scene!.add(line)
      _waypointLines.push(line)
    }
  }
  state._waypointsDirty = false
}

/** After drag ends, flush any queued rebuild. Called from index.ts onPointerUp. */
export function flushWaypointRebuild() {
  if (state._waypointsDirty) _rebuildNow()
}
