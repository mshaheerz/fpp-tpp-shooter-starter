import { Vector3, LineSegments, BufferGeometry, LineBasicMaterial, Object3D, Float32BufferAttribute } from 'three'
import type { PhysicsSystem } from '../PhysicsSystem'

/**
 * Uniform navigation grid over the (largely flat) play area.
 *
 * Maps in this game are flat ground planes with props on top, so a true
 * recast/detour navmesh would be overkill. Instead we lay a regular grid, mark
 * each cell blocked if static geometry overlaps a player-sized box at body
 * height, and run A* with string-pulling so bots walk around buildings/crates.
 *
 * Coordinate mapping: world XZ centered on the origin. Cell (col,row) center:
 *   x = (col - cols/2 + 0.5) * cell
 *   z = (row - rows/2 + 0.5) * cell
 */
export class NavGrid {
  readonly cell: number
  readonly cols: number
  readonly rows: number
  /** blocked[row*cols + col] === true → not walkable. */
  private blocked: Uint8Array
  /** Y used for sampling + returned path points (≈ player capsule center). */
  private sampleY: number

  constructor(
    physics: PhysicsSystem,
    opts: { halfExtent?: number; cell?: number; sampleY?: number; bodyHalf?: { x: number; y: number; z: number } } = {},
  ) {
    const halfExtent = opts.halfExtent ?? 60
    this.cell = opts.cell ?? 0.9
    this.sampleY = opts.sampleY ?? 1.0
    const bodyHalf = opts.bodyHalf ?? { x: 0.4, y: 0.85, z: 0.4 }

    this.cols = Math.max(1, Math.ceil((halfExtent * 2) / this.cell))
    this.rows = this.cols
    this.blocked = new Uint8Array(this.cols * this.rows)

    // Sample each cell: a body-sized box centered at sampleY. If it overlaps any
    // collider, the cell is blocked. Cells with no ground under them stay
    // walkable (flat maps), which is fine — bots are kept inside bounds by the
    // grid edges anyway.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const wx = (c - this.cols / 2 + 0.5) * this.cell
        const wz = (r - this.rows / 2 + 0.5) * this.cell
        if (physics.overlapBox({ x: wx, y: this.sampleY, z: wz }, bodyHalf)) {
          this.blocked[r * this.cols + c] = 1
        }
      }
    }
  }

  private inBounds(c: number, r: number): boolean {
    return c >= 0 && c < this.cols && r >= 0 && r < this.rows
  }

  isWalkable(c: number, r: number): boolean {
    return this.inBounds(c, r) && this.blocked[r * this.cols + c] === 0
  }

  worldToCell(p: Vector3): { c: number; r: number } {
    return {
      c: Math.floor(p.x / this.cell + this.cols / 2),
      r: Math.floor(p.z / this.cell + this.rows / 2),
    }
  }

  cellToWorld(c: number, r: number, out = new Vector3()): Vector3 {
    return out.set((c - this.cols / 2 + 0.5) * this.cell, this.sampleY, (r - this.rows / 2 + 0.5) * this.cell)
  }

  /** Nearest walkable cell center to a world point (spiral search). Returns the
   *  point itself snapped to grid if already walkable, else the closest free
   *  cell within `maxRing` rings, else null. */
  nearestWalkable(p: Vector3, maxRing = 8, out = new Vector3()): Vector3 | null {
    const { c, r } = this.worldToCell(p)
    if (this.isWalkable(c, r)) return this.cellToWorld(c, r, out)
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dc = -ring; dc <= ring; dc++) {
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue
          if (this.isWalkable(c + dc, r + dr)) return this.cellToWorld(c + dc, r + dr, out)
        }
      }
    }
    return null
  }

  /** A uniformly random walkable cell center. Tries up to `tries` times. */
  randomWalkable(tries = 200, out = new Vector3()): Vector3 | null {
    for (let i = 0; i < tries; i++) {
      const c = Math.floor(Math.random() * this.cols)
      const r = Math.floor(Math.random() * this.rows)
      if (this.blocked[r * this.cols + c] === 0) return this.cellToWorld(c, r, out)
    }
    return null
  }

  /**
   * A* from `from` to `to` (world points). Returns a list of world waypoints
   * (string-pulled so it's not stair-steppy), or null if unreachable. The first
   * point is the next node to walk toward; the destination is last.
   */
  findPath(from: Vector3, to: Vector3): Vector3[] | null {
    const start = this.worldToCell(from)
    const goal = this.worldToCell(to)
    // Snap endpoints to the nearest walkable cell if they're inside geometry.
    const s = this.isWalkable(start.c, start.r) ? start : this.cellOf(this.nearestWalkable(from))
    const g = this.isWalkable(goal.c, goal.r) ? goal : this.cellOf(this.nearestWalkable(to))
    if (!s || !g) return null
    if (s.c === g.c && s.r === g.r) return [this.cellToWorld(g.c, g.r)]

    const idx = (c: number, r: number) => r * this.cols + c
    const open = new MinHeap()
    const came = new Map<number, number>()
    const gScore = new Map<number, number>()
    const startId = idx(s.c, s.r)
    const goalId = idx(g.c, g.r)
    gScore.set(startId, 0)
    open.push(startId, this.heuristic(s.c, s.r, g.c, g.r))

    const DIRS = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ] as const

    let found = false
    while (open.size > 0) {
      const currentId = open.pop()!
      if (currentId === goalId) { found = true; break }
      const cc = currentId % this.cols
      const cr = (currentId - cc) / this.cols
      const baseG = gScore.get(currentId) ?? Infinity
      for (const [dc, dr, cost] of DIRS) {
        const nc = cc + dc
        const nr = cr + dr
        if (!this.isWalkable(nc, nr)) continue
        // Prevent cutting diagonally through a blocked corner.
        if (dc !== 0 && dr !== 0) {
          if (!this.isWalkable(cc + dc, cr) || !this.isWalkable(cc, cr + dr)) continue
        }
        const nId = idx(nc, nr)
        const tentative = baseG + cost
        if (tentative < (gScore.get(nId) ?? Infinity)) {
          came.set(nId, currentId)
          gScore.set(nId, tentative)
          open.push(nId, tentative + this.heuristic(nc, nr, g.c, g.r))
        }
      }
    }
    if (!found) return null

    // Reconstruct cell path.
    const cells: Array<{ c: number; r: number }> = []
    let cur: number | undefined = goalId
    while (cur !== undefined) {
      const cc = cur % this.cols
      const cr = (cur - cc) / this.cols
      cells.push({ c: cc, r: cr })
      cur = came.get(cur)
    }
    cells.reverse()

    // String-pull: keep a waypoint only when the straight line to the next-next
    // cell is blocked (line-of-sight on the grid). Cheap Bresenham LoS.
    const pulled: Array<{ c: number; r: number }> = [cells[0]]
    let anchor = 0
    for (let i = 2; i < cells.length; i++) {
      if (!this.lineWalkable(cells[anchor], cells[i])) {
        pulled.push(cells[i - 1])
        anchor = i - 1
      }
    }
    pulled.push(cells[cells.length - 1])

    return pulled.map((cl) => this.cellToWorld(cl.c, cl.r))
  }

  private cellOf(p: Vector3 | null): { c: number; r: number } | null {
    if (!p) return null
    return this.worldToCell(p)
  }

  private heuristic(c0: number, r0: number, c1: number, r1: number): number {
    // Octile distance (matches diagonal movement cost).
    const dc = Math.abs(c0 - c1)
    const dr = Math.abs(r0 - r1)
    return (dc + dr) + (Math.SQRT2 - 2) * Math.min(dc, dr)
  }

  /** Grid line-of-sight via Bresenham: every cell on the line must be walkable. */
  private lineWalkable(a: { c: number; r: number }, b: { c: number; r: number }): boolean {
    let c0 = a.c, r0 = a.r
    const c1 = b.c, r1 = b.r
    const dc = Math.abs(c1 - c0)
    const dr = Math.abs(r1 - r0)
    const sc = c0 < c1 ? 1 : -1
    const sr = r0 < r1 ? 1 : -1
    let err = dc - dr
    while (true) {
      if (!this.isWalkable(c0, r0)) return false
      if (c0 === c1 && r0 === r1) return true
      const e2 = 2 * err
      if (e2 > -dr) { err -= dr; c0 += sc }
      if (e2 < dc) { err += dc; r0 += sr }
    }
  }

  /** Debug visualization: a Line object marking blocked cell centers as crosses. */
  buildDebugObject(): Object3D {
    const positions: number[] = []
    const y = 0.05
    const h = this.cell * 0.35
    const p = new Vector3()
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.blocked[r * this.cols + c] === 0) continue
        this.cellToWorld(c, r, p)
        positions.push(p.x - h, y, p.z, p.x + h, y, p.z)
        positions.push(p.x, y, p.z - h, p.x, y, p.z + h)
      }
    }
    const geom = new BufferGeometry()
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3))
    const mat = new LineBasicMaterial({ color: 0xff3344 })
    const lines = new LineSegments(geom, mat)
    lines.frustumCulled = false
    return lines
  }
}

/** Tiny binary min-heap keyed by priority, storing integer cell ids. */
class MinHeap {
  private ids: number[] = []
  private pri: number[] = []
  get size(): number {
    return this.ids.length
  }
  push(id: number, priority: number) {
    this.ids.push(id)
    this.pri.push(priority)
    let i = this.ids.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.pri[parent] <= this.pri[i]) break
      this.swap(i, parent)
      i = parent
    }
  }
  pop(): number | undefined {
    if (this.ids.length === 0) return undefined
    const top = this.ids[0]
    const lastId = this.ids.pop()!
    const lastPri = this.pri.pop()!
    if (this.ids.length > 0) {
      this.ids[0] = lastId
      this.pri[0] = lastPri
      let i = 0
      const n = this.ids.length
      while (true) {
        const l = i * 2 + 1
        const r = i * 2 + 2
        let smallest = i
        if (l < n && this.pri[l] < this.pri[smallest]) smallest = l
        if (r < n && this.pri[r] < this.pri[smallest]) smallest = r
        if (smallest === i) break
        this.swap(i, smallest)
        i = smallest
      }
    }
    return top
  }
  private swap(a: number, b: number) {
    ;[this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]]
    ;[this.pri[a], this.pri[b]] = [this.pri[b], this.pri[a]]
  }
}
