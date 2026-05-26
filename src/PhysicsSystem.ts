import RAPIER from '@dimforge/rapier3d-compat'
import type { BufferGeometry, Matrix4 } from 'three'
import { Vector3 } from 'three'

export interface HitInfo {
  point: { x: number; y: number; z: number }
  normal: { x: number; y: number; z: number }
  toi: number
  colliderHandle: number
}

/**
 * Thin wrapper over a Rapier 3D world.
 *
 * Conventions:
 *   - Y is up. 1 unit = 1 meter. Gravity = -9.81 m/s².
 *   - Static (map) colliders are Trimesh, no rigidbody.
 *   - Player capsule is a Dynamic rigidbody with locked rotations (gravity + impulses only).
 */
export class PhysicsSystem {
  readonly world: RAPIER.World
  readonly eventQueue: RAPIER.EventQueue

  /** Map mesh-userdata pointer → THREE matrix; useful for hit lookups (filled later). */
  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.eventQueue = new RAPIER.EventQueue(true)
  }

  static async init(): Promise<PhysicsSystem> {
    await RAPIER.init()
    const sys = new PhysicsSystem()
    console.log('[physics] ready')
    return sys
  }

  /**
   * Dynamic capsule for the player. Rotations are locked so the capsule never
   * tips over — yaw is read from the camera, not from physics.
   */
  createCapsule(pos: { x: number; y: number; z: number }, halfHeight: number, radius: number): RAPIER.RigidBody {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .lockRotations()
      .setLinearDamping(0)
      .setCanSleep(false)
    const body = this.world.createRigidBody(desc)
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setFriction(0)
      .setRestitution(0)
    this.world.createCollider(colliderDesc, body)
    return body
  }

  /**
   * Static trimesh collider built from a Three.js BufferGeometry, with the mesh's
   * world matrix baked into the vertex positions (so we don't need a rigidbody pose).
   */
  createTrimeshCollider(geom: BufferGeometry, matrixWorld: Matrix4): RAPIER.Collider | null {
    const posAttr = geom.getAttribute('position')
    if (!posAttr) return null
    const idxAttr = geom.getIndex()
    const verts = new Float32Array(posAttr.count * 3)
    const v = new Vector3()
    for (let i = 0; i < posAttr.count; i++) {
      v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(matrixWorld)
      verts[i * 3 + 0] = v.x
      verts[i * 3 + 1] = v.y
      verts[i * 3 + 2] = v.z
    }
    let indices: Uint32Array
    if (idxAttr) {
      indices = new Uint32Array(idxAttr.count)
      for (let i = 0; i < idxAttr.count; i++) indices[i] = idxAttr.getX(i)
    } else {
      indices = new Uint32Array(posAttr.count)
      for (let i = 0; i < posAttr.count; i++) indices[i] = i
    }
    const desc = RAPIER.ColliderDesc.trimesh(verts, indices).setFriction(0.4).setRestitution(0)
    return this.world.createCollider(desc)
  }

  /**
   * Casts a ray. `excludeBody` lets the player ignore self-collisions for the
   * crosshair shot. Returns null if nothing was hit within `maxToi`.
   */
  raycast(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    maxToi = 200,
    excludeBody?: RAPIER.RigidBody,
  ): HitInfo | null {
    const ray = new RAPIER.Ray(origin, dir)
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxToi,
      true,
      undefined,
      undefined,
      undefined,
      excludeBody,
    )
    if (!hit) return null
    const p = ray.pointAt(hit.timeOfImpact)
    return {
      point: { x: p.x, y: p.y, z: p.z },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      toi: hit.timeOfImpact,
      colliderHandle: hit.collider.handle,
    }
  }

  /**
   * Shapecast a sphere along `dir` from `origin`. Used by the TPP camera to
   * back off when it would clip through a wall.
   */
  spherecast(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    radius: number,
    maxToi: number,
    excludeBody?: RAPIER.RigidBody,
  ): number {
    const shape = new RAPIER.Ball(radius)
    const hit = this.world.castShape(
      origin,
      { x: 0, y: 0, z: 0, w: 1 },
      dir,
      shape,
      0, // targetDist
      maxToi,
      true,
      undefined,
      undefined,
      undefined,
      excludeBody,
    )
    return hit ? hit.time_of_impact : maxToi
  }

  step(_dt: number) {
    this.world.step(this.eventQueue)
  }
}
