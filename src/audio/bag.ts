/**
 * Shuffle-bag with DEPTH-2 anti-repeat (CLAUDE.md Audio system): a pick
 * is never one of the LAST TWO played from the pool. Pools of ≤2 items
 * degrade gracefully — 2 items alternate (depth 1), 1 item repeats.
 * Pure and rng-injectable for the vitest invariant.
 */
export class ShuffleBag {
  private history: number[] = []

  constructor(
    private size: number,
    private rng: () => number = Math.random,
  ) {}

  /** Update the pool size (files can be hot-added in dev). */
  resize(size: number) {
    this.size = size
    this.history = this.history.filter((i) => i < size)
  }

  next(): number {
    if (this.size <= 0) return 0
    const depth = Math.min(2, this.size - 1)
    // slice(-0) is slice(0) — the WHOLE history — so guard depth 0.
    const banned = depth > 0 ? this.history.slice(-depth) : []
    const allowed: number[] = []
    for (let i = 0; i < this.size; i++) {
      if (!banned.includes(i)) allowed.push(i)
    }
    const pick = allowed[Math.floor(this.rng() * allowed.length)]
    this.history.push(pick)
    if (this.history.length > 2) this.history.shift()
    return pick
  }
}
