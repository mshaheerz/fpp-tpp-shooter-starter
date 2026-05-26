import { Object3D, Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3 } from 'three'

/**
 * Container for the FPP "view-model": stylized arms plus an attach point for
 * the active weapon. Parented to the camera so it always follows view yaw/pitch.
 *
 * Visibility is toggled by `CameraRig.onModeChange` (hidden in TPP).
 *
 * Animations are intentionally minimal in the starter (a simple recoil bump
 * applied by `WeaponLogicSystem` via `addRecoil`). When the user drops in real
 * FPP arm animations later, they can plug into `MarkerWatcher` from
 * AnimationSystem.ts.
 */
export class FPSMesh {
  readonly object = new Group()
  /** Where the weapon is parented in FPP mode. */
  readonly weaponAttach = new Object3D()

  private recoilOffset = new Vector3()
  private recoilVel = new Vector3()

  constructor() {
    // Placeholder arm cubes. Replaced when you drop a real FPP hands GLB into
    // public/assets/character/fps_arms.glb (wire-up left as a follow-up).
    const skinMat = new MeshStandardMaterial({ color: 0xd9c39a, roughness: 0.6 })
    const sleeveMat = new MeshStandardMaterial({ color: 0x556b2f, roughness: 0.85 })

    const leftArm = new Mesh(new BoxGeometry(0.1, 0.1, 0.5), sleeveMat)
    leftArm.position.set(-0.18, -0.22, -0.45)
    leftArm.rotation.x = -0.2
    this.object.add(leftArm)

    const rightArm = new Mesh(new BoxGeometry(0.1, 0.1, 0.5), sleeveMat)
    rightArm.position.set(0.18, -0.22, -0.45)
    rightArm.rotation.x = -0.25
    this.object.add(rightArm)

    const leftHand = new Mesh(new BoxGeometry(0.09, 0.09, 0.12), skinMat)
    leftHand.position.set(-0.18, -0.22, -0.72)
    this.object.add(leftHand)

    const rightHand = new Mesh(new BoxGeometry(0.09, 0.09, 0.12), skinMat)
    rightHand.position.set(0.18, -0.22, -0.72)
    this.object.add(rightHand)

    // Weapon attach at "rifle hold" position relative to the camera.
    this.weaponAttach.position.set(0.18, -0.22, -0.72)
    this.object.add(this.weaponAttach)
  }

  addRecoil(kickZ: number, kickY: number) {
    this.recoilVel.z += kickZ
    this.recoilVel.y += kickY
  }

  /** Springs the recoil offset back to zero each frame. */
  update(dt: number) {
    const stiffness = 90
    const damping = 14
    this.recoilVel.x += -stiffness * this.recoilOffset.x * dt - damping * this.recoilVel.x * dt
    this.recoilVel.y += -stiffness * this.recoilOffset.y * dt - damping * this.recoilVel.y * dt
    this.recoilVel.z += -stiffness * this.recoilOffset.z * dt - damping * this.recoilVel.z * dt
    this.recoilOffset.addScaledVector(this.recoilVel, dt)
    this.weaponAttach.position.set(0.18 + this.recoilOffset.x, -0.22 + this.recoilOffset.y, -0.72 + this.recoilOffset.z)
  }
}
