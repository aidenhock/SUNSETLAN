import { create } from 'zustand'
import { placementsHeader, placements as fileP, type Placement } from '../content/placements'
import { latLongToUnit } from '../controls/planetMath'
import { blockers, fenceBlockersFor, PLANET_RADIUS } from './planetConfig'
import { groundAltitudeAt } from '../controls/terrain'

/**
 * The world's live placement list.
 *
 * The scene reads placements through this store rather than straight
 * from the JSON, so dragging a prop moves it immediately instead of on
 * reload. In production nothing ever mutates it: it is initialised from
 * the file and never touched, so the world is exactly the file.
 *
 * `version` is the cheap subscription: consumers that rebuild expensive
 * things (instanced matrices, the controller's blocker list) depend on
 * the number rather than the array identity.
 *
 * Every mutation goes through `commit`, which pushes the previous list
 * onto an undo stack — a plain command stack, since a placement list is
 * small enough to snapshot whole.
 */

/** Metres → degrees on this planet, for nudging in a straight line. */
const M_PER_DEG_LAT = (Math.PI * PLANET_RADIUS) / 180
export const degPerMetreLat = 1 / M_PER_DEG_LAT
export const degPerMetreLong = (lat: number) =>
  degPerMetreLat / Math.max(0.15, Math.cos((lat * Math.PI) / 180))

/** The waterline, for the "you placed this in the sea" warning. */
const WATERLINE_LAT = 15

export interface PlacementWarning {
  id: string
  kind: 'underwater' | 'overlap' | 'budget'
  message: string
}

interface PlacementRuntime {
  list: Placement[]
  selectedId: string | null
  version: number
  past: Placement[][]
  future: Placement[][]
  /** Set by the scene each frame so the panel can show live draw calls. */
  drawCalls: number
  /** Prop type armed for placing; the next ground click spends it. */
  brush: string | null

  select: (id: string | null) => void
  moveTo: (id: string, lat: number, long: number) => void
  nudge: (id: string, east: number, north: number) => void
  rotate: (id: string, deltaDeg: number) => void
  setField: (id: string, patch: Partial<Placement>) => void
  add: (type: string, lat: number, long: number) => string
  remove: (id: string) => void
  duplicate: (id: string) => string | null
  undo: () => void
  redo: () => void
  setDrawCalls: (n: number) => void
  setBrush: (type: string | null) => void
}

/**
 * Blockers live in a module array the controller holds by reference, so
 * rebuild it IN PLACE and a moved prop's collision moves with it. The
 * cemetery's fence is generated rather than authored, so it is
 * regenerated from wherever the plot now sits.
 */
function rebuildBlockers(list: Placement[]) {
  const fromPlacements = list
    .filter((p) => p.kind !== 'interactable' && p.blockerRadiusM !== undefined)
    .map((p) => ({ unit: latLongToUnit(p.lat, p.long), radius: p.blockerRadiusM! }))
  const cem = list.find((p) => p.id === 'cemetery')
  const fence = (cem ? fenceBlockersFor(cem) : []).map((f) => ({
    unit: latLongToUnit(f.lat, f.long),
    radius: f.radius,
  }))
  blockers.length = 0
  blockers.push(...fromPlacements, ...fence)
}

/** A fresh id that can't collide with an existing one. */
function newId(list: Placement[], type: string): string {
  let n = 1
  const taken = new Set(list.map((p) => p.id))
  while (taken.has(`${type}-${String(n).padStart(2, '0')}`)) n++
  return `${type}-${String(n).padStart(2, '0')}`
}

export const usePlacementRuntime = create<PlacementRuntime>((set, get) => {
  const commit = (mutate: (list: Placement[]) => Placement[]) =>
    set((s) => {
      const next = mutate(s.list)
      rebuildBlockers(next)
      return {
        list: next,
        past: [...s.past, s.list].slice(-100),
        future: [],
        version: s.version + 1,
      }
    })

  return {
    list: fileP.map((p) => ({ ...p })),
    selectedId: null,
    version: 0,
    past: [],
    future: [],
    drawCalls: 0,
    brush: null,

    select: (selectedId) => set({ selectedId }),

    moveTo: (id, lat, long) =>
      commit((list) => list.map((p) => (p.id === id ? { ...p, lat, long } : p))),

    nudge: (id, east, north) =>
      commit((list) =>
        list.map((p) => {
          if (p.id !== id) return p
          const lat = p.lat + north * degPerMetreLat
          return { ...p, lat, long: p.long + east * degPerMetreLong(lat) }
        }),
      ),

    rotate: (id, deltaDeg) =>
      commit((list) =>
        list.map((p) =>
          p.id === id ? { ...p, yawDeg: Math.round(((p.yawDeg + deltaDeg) % 360) * 10) / 10 } : p,
        ),
      ),

    setField: (id, patch) =>
      commit((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p))),

    add: (type, lat, long) => {
      const id = newId(get().list, type)
      commit((list) => [
        ...list,
        {
          id,
          type,
          kind: 'prop',
          label: `${type[0].toUpperCase()}${type.slice(1)} (new)`,
          lat,
          long,
          yawDeg: 0,
          scale: 1,
          blockerRadiusM: 1,
        },
      ])
      set({ selectedId: id })
      return id
    },

    remove: (id) => {
      commit((list) => list.filter((p) => p.id !== id))
      if (get().selectedId === id) set({ selectedId: null })
    },

    duplicate: (id) => {
      const src = get().list.find((p) => p.id === id)
      if (!src) return null
      const copy: Placement = {
        ...src,
        id: newId(get().list, src.type),
        label: `${src.label} (copy)`,
        // Offset a metre east so the copy isn't hidden inside the original.
        long: src.long + degPerMetreLong(src.lat),
      }
      commit((list) => [...list, copy])
      set({ selectedId: copy.id })
      return copy.id
    },

    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1]
        if (!prev) return s
        rebuildBlockers(prev)
        return {
          list: prev,
          past: s.past.slice(0, -1),
          future: [s.list, ...s.future].slice(0, 100),
          version: s.version + 1,
        }
      }),

    redo: () =>
      set((s) => {
        const next = s.future[0]
        if (!next) return s
        rebuildBlockers(next)
        return {
          list: next,
          past: [...s.past, s.list],
          future: s.future.slice(1),
          version: s.version + 1,
        }
      }),

    setDrawCalls: (drawCalls) => set({ drawCalls }),
    setBrush: (brush) => set({ brush }),
  }
})

/**
 * Guardrails: what's wrong with the world right now. Recomputed on
 * demand (a click, a drag release), never per frame.
 */
export function warningsFor(list: Placement[], drawCalls: number): PlacementWarning[] {
  const out: PlacementWarning[] = []
  for (const p of list) {
    if (p.lat < WATERLINE_LAT) {
      out.push({
        id: p.id,
        kind: 'underwater',
        message: `${p.id} is past the waterline (lat ${p.lat.toFixed(1)} < ${WATERLINE_LAT}) — it will stand in the sea.`,
      })
    } else if (groundAltitudeAt(p.lat, p.long) <= 0.02 && p.type !== 'dock' && p.type !== 'rift') {
      out.push({
        id: p.id,
        kind: 'underwater',
        message: `${p.id} sits at sea level — check it isn't in the surf.`,
      })
    }
    if (p.blockerRadiusM === undefined) continue
    for (const q of list) {
      if (q.id === p.id || q.blockerRadiusM === undefined) continue
      // Only report each pair once.
      if (q.id < p.id) continue
      const arc =
        latLongToUnit(p.lat, p.long).angleTo(latLongToUnit(q.lat, q.long)) * PLANET_RADIUS
      if (arc < (p.blockerRadiusM + q.blockerRadiusM) * 0.6) {
        out.push({
          id: p.id,
          kind: 'overlap',
          message: `${p.id} and ${q.id} overlap (${arc.toFixed(2)} m apart) — the player will get wedged.`,
        })
      }
    }
  }
  if (drawCalls > 100) {
    out.push({
      id: '',
      kind: 'budget',
      message: `${drawCalls} draw calls — over the desktop budget of 100.`,
    })
  } else if (drawCalls > 50) {
    out.push({
      id: '',
      kind: 'budget',
      message: `${drawCalls} draw calls — over the mobile budget of 50.`,
    })
  }
  return out
}

/** The file's shape, ready for the clipboard or the dev-server write. */
export function serialize(list: Placement[]): string {
  const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp
  return (
    JSON.stringify(
      {
        $comment: placementsHeader,
        placements: list.map((p) => ({
          ...p,
          lat: round(p.lat),
          long: round((p.long + 360) % 360),
          // 2 dp, not 1: the file carries yaws like 51.57 (a baked
          // hand-rotation), and rounding harder made the round-trip lossy.
          yawDeg: round(p.yawDeg, 2),
          scale: round(p.scale, 3),
          ...(p.blockerRadiusM === undefined ? {} : { blockerRadiusM: round(p.blockerRadiusM, 2) }),
        })),
      },
      null,
      2,
    ) + '\n'
  )
}
