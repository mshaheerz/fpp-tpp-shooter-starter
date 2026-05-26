export default class AudioManager {
  private ctx: AudioContext | null = null
  private buffers: Map<string, AudioBuffer> = new Map()
  private pending: Map<string, ArrayBuffer> = new Map()
  private master: GainNode | null = null

  constructor() {}

  private createContext() {
    if (this.ctx) return
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    this.master = this.ctx.createGain()
    this.master.gain.value = 1
    this.master.connect(this.ctx.destination)
  }

  // Resume must be called from a user gesture; it will create the AudioContext
  // if needed and decode any pending loaded ArrayBuffers.
  async resume() {
    this.createContext()
    if (!this.ctx) return
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    // decode any pending buffers
    for (const [name, ab] of Array.from(this.pending.entries())) {
      try {
        const buf = await this.ctx.decodeAudioData(ab.slice(0))
        this.buffers.set(name, buf)
      } catch (e) {
        console.warn('[audio] decode failed', name, e)
      }
      this.pending.delete(name)
    }
  }

  // Fetch & store raw ArrayBuffer; decoding happens on resume (user gesture)
  async load(name: string, url: string) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('fetch failed')
      const ab = await res.arrayBuffer()
      if (this.ctx) {
        try {
          const buf = await this.ctx.decodeAudioData(ab)
          this.buffers.set(name, buf)
          return
        } catch (e) {
          console.warn('[audio] decode immediate failed', e)
        }
      }
      this.pending.set(name, ab)
    } catch (e) {
      console.warn('[audio] failed to load', name, url, e)
    }
  }

  async preloadMap(map: Record<string, string>) {
    await Promise.all(Object.entries(map).map(([k, v]) => this.load(k, v)))
  }

  play(name: string, opts?: { position?: { x: number; y: number; z: number }; volume?: number; rate?: number }) {
    // Prefer decoded buffer
    const buf = this.buffers.get(name)
    if (buf && this.ctx && this.master) {
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      if (opts?.rate) src.playbackRate.value = opts.rate
      const g = this.ctx.createGain()
      g.gain.value = typeof opts?.volume === 'number' ? opts!.volume : 1

      if (opts?.position) {
        const p = this.ctx.createPanner()
        try {
          p.panningModel = 'HRTF'
        } catch {}
        p.distanceModel = 'inverse'
        p.refDistance = 1
        p.maxDistance = 100
        try {
          p.positionX.setValueAtTime(opts.position.x, this.ctx.currentTime)
          p.positionY.setValueAtTime(opts.position.y, this.ctx.currentTime)
          p.positionZ.setValueAtTime(opts.position.z, this.ctx.currentTime)
        } catch {}
        src.connect(p)
        p.connect(g)
      } else {
        src.connect(g)
      }
      g.connect(this.master)
      src.start()
      return
    }

    // Fallback synthetic percussive sound for footsteps/landing when no file
    if (name === 'footstep' || name === 'landing') {
      // If context not available yet, create a tiny offline-like effect via AudioContext when possible
      if (!this.ctx) {
        try {
          this.createContext()
        } catch {}
      }
      if (!this.ctx || !this.master) return
      const dur = name === 'footstep' ? 0.12 : 0.18
      const sampleRate = this.ctx.sampleRate
      const frames = Math.floor(sampleRate * dur)
      const buffer = this.ctx.createBuffer(1, frames, sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < frames; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-6 * i / frames)
      }
      const s = this.ctx.createBufferSource()
      s.buffer = buffer
      const g = this.ctx.createGain()
      g.gain.value = typeof opts?.volume === 'number' ? opts!.volume : 0.6
      s.connect(g)
      g.connect(this.master)
      s.start()
      return
    }

    // unknown name — no-op
  }
}
