/**
 * Pull-model input. The game loop calls `consumeFrame()` once per frame to
 * read mouse delta and edge-triggered key presses, then those buffers reset.
 *
 * Mouse-look uses Pointer Lock; click anywhere on `canvas` to engage.
 */
export class InputManager {
  private keys = new Set<string>()
  /** Keys that went down this frame; cleared on consumeFrame(). */
  private pressedThisFrame = new Set<string>()
  private mouseDx = 0
  private mouseDy = 0
  lmb = false
  rmb = false
  locked = false

  constructor(canvas: HTMLCanvasElement, lockHint?: HTMLElement | null) {
    canvas.addEventListener('click', () => canvas.requestPointerLock())
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas
      if (lockHint) lockHint.classList.toggle('hidden', this.locked)
    })

    document.addEventListener('keydown', (e) => {
      const code = e.code
      if (!this.keys.has(code)) this.pressedThisFrame.add(code)
      this.keys.add(code)
    })
    document.addEventListener('keyup', (e) => this.keys.delete(e.code))

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return
      this.mouseDx += e.movementX
      this.mouseDy += e.movementY
    })

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return
      if (e.button === 0) this.lmb = true
      if (e.button === 2) this.rmb = true
    })
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false
      if (e.button === 2) this.rmb = false
    })

    // Suppress right-click menu inside the canvas.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  isDown(code: string): boolean {
    return this.keys.has(code)
  }

  /** True only for the first frame the key went down. */
  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code)
  }

  /** Read & reset the accumulated mouse delta for this frame. */
  readMouseDelta(): { x: number; y: number } {
    const out = { x: this.mouseDx, y: this.mouseDy }
    this.mouseDx = 0
    this.mouseDy = 0
    return out
  }

  /** Called by the game loop after all systems have read input. */
  endFrame() {
    this.pressedThisFrame.clear()
  }
}
