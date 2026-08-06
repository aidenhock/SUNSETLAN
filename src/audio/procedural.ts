import { registerFallback } from './core'

/**
 * Procedural fallback sources (CLAUDE.md Audio system): tiny, seeded
 * where practical, generated lazily post-gesture and cached by the
 * core. Pure Float32Array fills are exported for vitest determinism;
 * AudioBuffer wrappers stay context-bound.
 */

/** mulberry32 — the project's seeded rng (playbook §3). */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Karplus-Strong pluck into `out` (pure, deterministic per seed). */
export function fillPluck(out: Float32Array, sampleRate: number, freq: number, seed: number) {
  const N = Math.max(2, Math.round(sampleRate / freq))
  const ring = new Float32Array(N)
  const rng = mulberry32(seed)
  for (let i = 0; i < N; i++) ring[i] = rng() * 2 - 1
  for (let i = 0; i < out.length; i++) {
    const j = i % N
    const k = (i + 1) % N
    const v = 0.5 * (ring[j] + ring[k]) * 0.996
    out[i] += ring[j]
    ring[j] = v
  }
}

/** Island chord table (I–vi–IV–V territory), uke-voiced. */
export const UKE_CHORDS: ReadonlyArray<ReadonlyArray<number>> = [
  [392.0, 261.63, 329.63, 523.25], // C
  [392.0, 261.63, 329.63, 440.0], // Am
  [349.23, 261.63, 349.23, 440.0], // F
  [392.0, 293.66, 392.0, 493.88], // G
]

/** One strummed chord: 4 staggered plucks, normalized. */
export function fillStrum(
  out: Float32Array,
  sampleRate: number,
  freqs: ReadonlyArray<number>,
  seed: number,
  strumMs = 26,
) {
  const stagger = Math.round((strumMs / 1000) * sampleRate)
  freqs.forEach((f, i) => {
    const start = i * stagger
    fillPluck(out.subarray(start), sampleRate, f, seed + i * 101)
  })
  let peak = 0
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / peak) * 0.7
}

function monoBuffer(ctx: AudioContext, seconds: number): [AudioBuffer, Float32Array] {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate)
  return [buf, buf.getChannelData(0)]
}

export function makeStrumBuffer(ctx: AudioContext, chordIndex: number, seed: number): AudioBuffer {
  const [buf, data] = monoBuffer(ctx, 1.6)
  fillStrum(data, ctx.sampleRate, UKE_CHORDS[chordIndex % UKE_CHORDS.length], seed)
  return buf
}

/** Generative lo-fi pad loop — seamless BY CONSTRUCTION: chords sit in
 * cyclically wrapped raised-cosine windows, so sample 0 continues the
 * last chord's tail exactly. Minecraft-menu energy. */
function makeLofiLoop(ctx: AudioContext): AudioBuffer {
  const chordDur = 8
  const len = UKE_CHORDS.length * chordDur
  const [buf, data] = monoBuffer(ctx, len)
  const sr = ctx.sampleRate
  const total = data.length
  const rng = mulberry32(20260806)
  for (let c = 0; c < UKE_CHORDS.length; c++) {
    const center = (c + 0.5) * chordDur
    for (const f of UKE_CHORDS[c]) {
      for (const [mult, amp] of [
        [0.5, 0.5],
        [1, 0.32],
        [1.5, 0.12],
      ] as const) {
        const w = 2 * Math.PI * f * mult
        const phase = rng() * 2 * Math.PI
        for (let i = 0; i < total; i++) {
          const t = i / sr
          // Cyclic distance to the chord's center → wrapped window.
          let d = Math.abs(((t - center + len / 2 + len) % len) - len / 2)
          if (d > chordDur) continue
          const win = 0.5 + 0.5 * Math.cos((Math.PI * d) / chordDur)
          data[i] += Math.sin(w * t + phase) * amp * win * 0.045
        }
      }
    }
  }
  // Sparse plucks, kept clear of the loop seam so tails never truncate.
  for (let p = 0; p < 10; p++) {
    const at = Math.floor((rng() * (len - 3) + 0.5) * sr)
    const chord = UKE_CHORDS[Math.floor(rng() * 4)]
    const tmp = new Float32Array(Math.min(sr * 2, total - at))
    fillPluck(tmp, sr, chord[Math.floor(rng() * 4)] * 2, 7000 + p)
    for (let i = 0; i < tmp.length; i++) data[at + i] += tmp[i] * 0.05
  }
  return buf
}

/** Shaped noise burst (one-pole lowpass + exponential decay). */
function fillBurst(
  data: Float32Array,
  sr: number,
  rng: () => number,
  { lp = 0.25, decay = 18, gain = 0.6 }: { lp?: number; decay?: number; gain?: number },
) {
  let y = 0
  for (let i = 0; i < data.length; i++) {
    const t = i / sr
    y += lp * ((rng() * 2 - 1) - y)
    data[i] += y * Math.exp(-decay * t) * gain
  }
}

function makeSplash(ctx: AudioContext): AudioBuffer {
  const [buf, data] = monoBuffer(ctx, 0.4)
  fillBurst(data, ctx.sampleRate, mulberry32(11), { lp: 0.35, decay: 9, gain: 0.8 })
  return buf
}

function makeCrabSkitter(ctx: AudioContext): AudioBuffer {
  const [buf, data] = monoBuffer(ctx, 0.22)
  const rng = mulberry32(22)
  for (let c = 0; c < 4; c++) {
    const at = Math.floor((0.02 + c * 0.05) * ctx.sampleRate)
    fillBurst(data.subarray(at), ctx.sampleRate, rng, { lp: 0.8, decay: 90, gain: 0.5 })
  }
  return buf
}

function makeBlip(ctx: AudioContext): AudioBuffer {
  const [buf, data] = monoBuffer(ctx, 0.09)
  const sr = ctx.sampleRate
  for (let i = 0; i < data.length; i++) {
    const t = i / sr
    const f = 880 - 220 * (t / 0.09)
    data[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-28 * t) * 0.5
  }
  return buf
}

function makeWaveSwell(ctx: AudioContext): AudioBuffer {
  const [buf, data] = monoBuffer(ctx, 3)
  const sr = ctx.sampleRate
  const rng = mulberry32(33)
  let y = 0
  for (let i = 0; i < data.length; i++) {
    const t = i / sr
    const cyc = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 3) // seamless swell
    y += 0.12 * ((rng() * 2 - 1) - y)
    data[i] = y * cyc * 0.7
  }
  return buf
}

function makeGullCry(ctx: AudioContext): AudioBuffer {
  const [buf, data] = monoBuffer(ctx, 0.7)
  const sr = ctx.sampleRate
  for (const [start, dur] of [
    [0, 0.28],
    [0.36, 0.24],
  ] as const) {
    const s0 = Math.floor(start * sr)
    for (let i = 0; i < dur * sr && s0 + i < data.length; i++) {
      const t = i / sr
      const f = 1150 - 420 * (t / dur)
      const env = Math.sin((Math.PI * t) / dur) ** 2
      data[s0 + i] += Math.sin(2 * Math.PI * f * t) * env * 0.3
    }
  }
  return buf
}

function makeCrackle(ctx: AudioContext): AudioBuffer {
  const [buf, data] = monoBuffer(ctx, 2.4)
  const rng = mulberry32(44)
  // Bed of soft lowpassed noise + sparse pops.
  let y = 0
  for (let i = 0; i < data.length; i++) {
    y += 0.06 * ((rng() * 2 - 1) - y)
    data[i] = y * 0.25
  }
  for (let p = 0; p < 26; p++) {
    const at = Math.floor(rng() * (data.length - 2000))
    fillBurst(data.subarray(at), ctx.sampleRate, rng, { lp: 0.9, decay: 220, gain: 0.5 })
  }
  return buf
}

let registered = false
/** Wire every category's fallback (idempotent; import-time safe — the
 * builders only run lazily post-gesture via the core cache). */
export function registerProceduralFallbacks() {
  if (registered) return
  registered = true
  registerFallback('music', makeLofiLoop)
  registerFallback('waves', makeWaveSwell)
  registerFallback('seagulls', makeGullCry)
  registerFallback('campfire', makeCrackle)
  registerFallback('crabs', makeCrabSkitter)
  registerFallback('splash', makeSplash)
  registerFallback('ui', makeBlip)
  // Footstep pools have library files; a soft burst covers empty dev
  // folders so the mechanic still audibly works.
  registerFallback('footsteps-grass', (ctx) => {
    const [buf, data] = monoBuffer(ctx, 0.16)
    fillBurst(data, ctx.sampleRate, mulberry32(55), { lp: 0.2, decay: 40, gain: 0.5 })
    return buf
  })
  registerFallback('footsteps-sand', (ctx) => {
    const [buf, data] = monoBuffer(ctx, 0.16)
    fillBurst(data, ctx.sampleRate, mulberry32(56), { lp: 0.4, decay: 34, gain: 0.5 })
    return buf
  })
  registerFallback('footsteps-dock', (ctx) => {
    const [buf, data] = monoBuffer(ctx, 0.2)
    // Hollow/woody: low sine knock under the burst.
    fillBurst(data, ctx.sampleRate, mulberry32(57), { lp: 0.3, decay: 30, gain: 0.4 })
    const sr = ctx.sampleRate
    for (let i = 0; i < data.length; i++) {
      const t = i / sr
      data[i] += Math.sin(2 * Math.PI * 130 * t) * Math.exp(-24 * t) * 0.35
    }
    return buf
  })
}
