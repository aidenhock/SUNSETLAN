import * as THREE from 'three'
import { useStore } from '../store/useStore'
import { ShuffleBag } from './bag'

/**
 * Audio core (CLAUDE.md Audio system, 3C). FULLY LAZY: nothing here
 * constructs an AudioContext, fetches, or generates buffers before
 * `armAudio` runs on the first user gesture. File-pool-first with a
 * procedural fallback per category; shuffle-bag depth 2 on every pool;
 * decode-once cache; positional categories downmix to mono.
 */

export type Category =
  | 'music'
  | 'waves'
  | 'seagulls'
  | 'crabs'
  | 'campfire'
  | 'splash'
  | 'ui'
  | 'footsteps-sand'
  | 'footsteps-grass'
  | 'footsteps-dock'

/** Categories that play through PositionalAudio and therefore mono. */
const POSITIONAL: ReadonlySet<string> = new Set([
  'waves',
  'seagulls',
  'crabs',
  'campfire',
  'splash',
  'footsteps-sand',
  'footsteps-grass',
  'footsteps-dock',
])

// Drop a file into src/assets/audio/<category>/ → it joins the pool
// with zero code changes (Vite hashes + copies; fetches stay lazy).
const FILES = import.meta.glob('../assets/audio/*/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const poolUrls = new Map<string, string[]>()
for (const [path, url] of Object.entries(FILES)) {
  const category = path.split('/').at(-2) ?? ''
  const list = poolUrls.get(category) ?? []
  list.push(url)
  poolUrls.set(category, list)
}
for (const list of poolUrls.values()) list.sort()

/** Procedural fallbacks register here (procedural.ts); called lazily
 * post-gesture, results cached like decoded files. */
const fallbacks = new Map<string, (ctx: AudioContext) => AudioBuffer>()
export function registerFallback(category: Category, make: (ctx: AudioContext) => AudioBuffer) {
  fallbacks.set(category, make)
}

interface AudioRuntime {
  armed: boolean
  listener: THREE.AudioListener | null
  ctx: AudioContext | null
  buses: { music: GainNode; world: GainNode; ui: GainNode } | null
}
export const audioRuntime: AudioRuntime = { armed: false, listener: null, ctx: null, buses: null }

const bags = new Map<string, ShuffleBag>()
const bufferCache = new Map<string, AudioBuffer>() // url or `proc:<category>`
const decoding = new Map<string, Promise<AudioBuffer | null>>()

function bagFor(category: string, poolSize: number): ShuffleBag {
  let bag = bags.get(category)
  if (!bag) {
    bag = new ShuffleBag(poolSize)
    bags.set(category, bag)
  } else {
    bag.resize(poolSize)
  }
  return bag
}

function downmix(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  if (buffer.numberOfChannels === 1) return buffer
  const mono = ctx.createBuffer(1, buffer.length, buffer.sampleRate)
  const out = mono.getChannelData(0)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) out[i] += data[i] / buffer.numberOfChannels
  }
  return mono
}

async function decodeUrl(url: string, mono: boolean): Promise<AudioBuffer | null> {
  const ctx = audioRuntime.ctx
  if (!ctx) return null
  const cached = bufferCache.get(url)
  if (cached) return cached
  let pending = decoding.get(url)
  if (!pending) {
    pending = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        const final = mono ? downmix(ctx, buf) : buf
        bufferCache.set(url, final)
        return final
      })
      .catch(() => null)
    decoding.set(url, pending)
  }
  return pending
}

/** Resolve the next buffer for a category: file pool via the bag, else
 * the registered procedural fallback. Null until armed/decoded. */
export async function nextBuffer(category: Category): Promise<AudioBuffer | null> {
  const ctx = audioRuntime.ctx
  if (!ctx) return null
  const urls = poolUrls.get(category)
  if (urls && urls.length > 0) {
    const pick = bagFor(category, urls.length).next()
    return decodeUrl(urls[pick], POSITIONAL.has(category))
  }
  const make = fallbacks.get(category)
  if (!make) return null
  const key = `proc:${category}`
  let buf = bufferCache.get(key)
  if (!buf) {
    buf = make(ctx)
    bufferCache.set(key, buf)
  }
  return buf
}

/** Pool size (0 = fallback territory) — for emitters that schedule. */
export function poolSize(category: Category): number {
  return poolUrls.get(category)?.length ?? 0
}

/** ±8% rate + small gain jitter (CLAUDE.md humanize rule). */
export function humanize(): { rate: number; gain: number } {
  return { rate: 1 + (Math.random() * 2 - 1) * 0.08, gain: 1 + (Math.random() * 2 - 1) * 0.1 }
}

/** One-shot on a 2D bus (ui / non-positional world cues). */
export async function play2d(category: Category, bus: 'music' | 'world' | 'ui', gain = 1) {
  const rt = audioRuntime
  if (!rt.ctx || !rt.buses) return
  const buffer = await nextBuffer(category)
  if (!buffer) return
  const h = humanize()
  const src = rt.ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = h.rate
  const g = rt.ctx.createGain()
  g.gain.value = gain * h.gain
  src.connect(g).connect(rt.buses[bus])
  src.start()
}

/** Route a three.js Audio/PositionalAudio's output through a bus. */
export function routeToBus(audio: THREE.Audio | THREE.PositionalAudio, bus: 'music' | 'world' | 'ui') {
  const rt = audioRuntime
  if (!rt.buses || !rt.listener) return
  audio.gain.disconnect()
  audio.gain.connect(rt.buses[bus])
}

/** One-shot through an existing PositionalAudio node (world bus). */
export async function playAt(category: Category, node: THREE.PositionalAudio, gain = 1) {
  const buffer = await nextBuffer(category)
  if (!buffer) return
  if (node.isPlaying) node.stop()
  const h = humanize()
  node.setBuffer(buffer)
  node.setPlaybackRate(h.rate)
  node.setVolume(gain * h.gain)
  node.play()
}

/** Aiden's jump rule: two DIFFERENT bag picks, precisely gapMs apart
 * (WebAudio-scheduled — never setTimeout). */
export async function playDoubleTap(
  category: Category,
  bus: 'music' | 'world' | 'ui',
  gain: number,
  gapMs: number,
) {
  const rt = audioRuntime
  if (!rt.ctx || !rt.buses) return
  const [a, b] = await Promise.all([nextBuffer(category), nextBuffer(category)])
  if (!a) return
  const t0 = rt.ctx.currentTime + 0.02
  const taps: Array<[AudioBuffer, number]> = [
    [a, t0],
    [b ?? a, t0 + gapMs / 1000],
  ]
  for (const [buffer, at] of taps) {
    const h = humanize()
    const src = rt.ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = h.rate
    const g = rt.ctx.createGain()
    g.gain.value = gain * h.gain
    src.connect(g).connect(rt.buses[bus])
    src.start(at)
  }
}

const gestureCallbacks: Array<() => void> = []
/** Run a callback once audio is armed (immediately if already). */
export function onArmed(cb: () => void) {
  if (audioRuntime.armed) cb()
  else gestureCallbacks.push(cb)
}

/** Create the context, listener, and buses. Idempotent; call ONLY from
 * a user-gesture handler. */
export function armAudio(camera: THREE.Camera) {
  if (audioRuntime.armed) return
  const listener = new THREE.AudioListener()
  camera.add(listener)
  const ctx = listener.context
  const mk = () => {
    const g = ctx.createGain()
    g.connect(listener.getInput())
    return g
  }
  audioRuntime.listener = listener
  audioRuntime.ctx = ctx
  audioRuntime.buses = { music: mk(), world: mk(), ui: mk() }
  audioRuntime.armed = true
  // Mute hard-zeroes the master (the listener's own gain) INSTANTLY —
  // a direct value write, not setMasterVolume's setTargetAtTime ramp
  // (which is neither instant nor guaranteed to finish on a suspended
  // clock).
  const applyMute = (muted: boolean) => {
    listener.gain.gain.cancelScheduledValues(0)
    listener.gain.gain.value = muted ? 0 : 1
  }
  applyMute(useStore.getState().muted)
  useStore.subscribe((s, prev) => {
    if (s.muted !== prev.muted) applyMute(s.muted)
  })
  if (ctx.state === 'suspended') void ctx.resume()
  for (const cb of gestureCallbacks.splice(0)) cb()
  const w = window as unknown as { __audioArmed?: boolean; __audioDebug?: () => unknown }
  w.__audioArmed = true
  w.__audioDebug = () => ({
    master: listener.getMasterVolume(),
    music: audioRuntime.buses?.music.gain.value ?? 0,
    world: audioRuntime.buses?.world.gain.value ?? 0,
    ui: audioRuntime.buses?.ui.gain.value ?? 0,
  })
}
