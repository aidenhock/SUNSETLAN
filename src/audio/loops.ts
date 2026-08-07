import { audioRuntime, nextBuffer, registerVoice, type Category } from './core'

/**
 * Crossfading bag-pick looper (3C): Aiden's cuts are short, so a
 * seamless bed comes from equal-length linear crossfades between
 * successive shuffle-bag picks — the depth-2 bag guarantees the bed
 * never repeats back-to-back. One level GainNode per loop; callers
 * lerp its gain for proximity/night scaling.
 */
export class CrossfadeLoop {
  private out: GainNode | null = null
  private endTime = 0
  private pending = false

  constructor(
    private category: Category,
    private fade = 0.5,
  ) {}

  /** The loop's level node (created lazily, connected to `target`). */
  level(target: AudioNode): GainNode | null {
    const ctx = audioRuntime.ctx
    if (!ctx) return null
    if (!this.out) {
      this.out = ctx.createGain()
      this.out.gain.value = 0
      this.out.connect(target)
    }
    return this.out
  }

  /** Call per frame — schedules the next pick when the current one
   * approaches its fade-out. */
  update(target: AudioNode) {
    const ctx = audioRuntime.ctx
    if (!ctx) return
    const out = this.level(target)
    if (!out) return
    if (!this.pending && ctx.currentTime > this.endTime - this.fade) {
      this.pending = true
      void nextBuffer(this.category).then((buffer) => {
        this.pending = false
        const c = audioRuntime.ctx
        if (!buffer || !c || !this.out) return
        const t0 = Math.max(c.currentTime + 0.02, this.endTime - this.fade)
        const src = c.createBufferSource()
        src.buffer = buffer
        const g = c.createGain()
        const end = t0 + buffer.duration
        const mid = Math.max(t0 + this.fade, end - this.fade)
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.linearRampToValueAtTime(1, Math.min(t0 + this.fade, end))
        g.gain.setValueAtTime(1, mid)
        g.gain.linearRampToValueAtTime(0.0001, end)
        src.connect(g).connect(this.out)
        // Two overlap by design during the crossfade; three means a
        // stall piled them up — drop the oldest.
        registerVoice(`loop:${this.category}`, src, 3)
        src.start(t0)
        this.endTime = end
      })
    }
  }
}
