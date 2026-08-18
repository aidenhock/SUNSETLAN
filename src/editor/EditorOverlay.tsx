import { useEffect, useMemo, useState } from 'react'
import { controlsRuntime } from '../controls/usePlanetController'
import { useStore } from '../store/useStore'
import { PROP_REGISTRY } from '../scene/propRegistry'
import { serialize, usePlacementRuntime, warningsFor } from '../scene/placementRuntime'
import { useEditorInput } from './useEditorInput'

/**
 * The editor's panel: a palette to place from, a form for whatever is
 * selected, the guardrail warnings, and the two ways out — clipboard or
 * straight to disk through the dev server.
 *
 * Dev only. This module contains the marker string "placement-editor",
 * which `scripts/check-prod-bundle.mjs` greps for to prove none of it
 * ever reaches a production build.
 */

const BAND = (lat: number) =>
  lat >= 66 ? 'plateau' : lat >= 24 ? 'grass' : lat >= 15 ? 'sand' : 'water'

export function EditorOverlay() {
  // Arrows nudge, Q/E rotate, Delete removes, Ctrl+Z walks the stack.
  useEditorInput()
  const list = usePlacementRuntime((s) => s.list)
  const selectedId = usePlacementRuntime((s) => s.selectedId)
  const brush = usePlacementRuntime((s) => s.brush)
  const setBrush = usePlacementRuntime((s) => s.setBrush)
  const setField = usePlacementRuntime((s) => s.setField)
  const remove = usePlacementRuntime((s) => s.remove)
  const duplicate = usePlacementRuntime((s) => s.duplicate)
  const undo = usePlacementRuntime((s) => s.undo)
  const redo = usePlacementRuntime((s) => s.redo)
  const drawCalls = usePlacementRuntime((s) => s.drawCalls)
  const past = usePlacementRuntime((s) => s.past.length)
  const future = usePlacementRuntime((s) => s.future.length)
  const [status, setStatus] = useState<string | null>(null)
  const [freeFly, setFreeFly] = useState(false)

  const selected = list.find((p) => p.id === selectedId)
  const warnings = useMemo(() => warningsFor(list, drawCalls), [list, drawCalls])
  const mine = warnings.filter((w) => !w.id || w.id === selectedId)

  // Mouse-look captures the pointer, which would leave every editor
  // click raycasting from a stale position — so the editor switches the
  // camera to drag-to-orbit while it is open, and hands it back after.
  useEffect(() => {
    const store = useStore.getState()
    const previous = store.settings.cameraMode
    controlsRuntime.editing = true
    if (previous === 'pointerLock') {
      store.setCameraMode('orbit')
      document.exitPointerLock?.()
    }
    return () => {
      controlsRuntime.editing = false
      useStore.getState().setCameraMode(previous)
    }
  }, [])

  // Free-fly: pull the camera right out so anywhere on this face of the
  // planet is one click away, instead of walking there.
  useEffect(() => {
    controlsRuntime.camDist = freeFly ? 70 : null
    return () => {
      controlsRuntime.camDist = null
    }
  }, [freeFly])

  // While something is selected the arrow keys nudge it, so the player
  // must stop reading them as movement.
  useEffect(() => {
    controlsRuntime.suppressInput = Boolean(selectedId)
    return () => {
      controlsRuntime.suppressInput = false
    }
  }, [selectedId])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(serialize(list))
      setStatus(`Copied ${list.length} placements`)
    } catch {
      setStatus('Clipboard refused — use Write instead')
    }
  }

  const write = async () => {
    try {
      const res = await fetch('/__write-placements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialize(list),
      })
      const body = (await res.json()) as { ok?: boolean; error?: string; count?: number }
      setStatus(res.ok ? `Wrote ${body.count} placements to disk` : `Refused: ${body.error}`)
    } catch (err) {
      setStatus(`Write failed: ${(err as Error).message}`)
    }
  }

  return (
    <div className="pointer-events-auto fixed top-4 right-4 z-50 flex max-h-[92vh] w-80 flex-col gap-3 overflow-y-auto rounded-xl bg-ink/95 p-3 font-display text-xs text-sand shadow-2xl">
      <div className="flex items-center gap-2">
        <span className="font-bold tracking-wide">World editor</span>
        <span className="ml-auto rounded bg-sand/10 px-1.5 py-0.5">{list.length} placed</span>
        <span
          className={`rounded px-1.5 py-0.5 ${drawCalls > 50 ? 'bg-red-500/30' : 'bg-sand/10'}`}
          title="Live draw calls"
        >
          {drawCalls} draws
        </span>
      </div>

      {/* Palette */}
      <div>
        <p className="mb-1 text-sand/60">Place (click the ground)</p>
        <div className="flex flex-wrap gap-1">
          {Object.keys(PROP_REGISTRY).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setBrush(brush === type ? null : type)}
              className={`rounded px-2 py-1 ${
                brush === type ? 'bg-lagoon text-ink' : 'bg-sand/10 hover:bg-sand/20'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Selection */}
      {selected ? (
        <div className="space-y-2 rounded-lg bg-sand/5 p-2">
          <p className="font-bold">{selected.label}</p>
          <p className="text-sand/60">
            {selected.id} · {selected.type} · {selected.kind}
          </p>
          <p className="tabular-nums text-sand/80">
            lat {selected.lat.toFixed(2)} · long {selected.long.toFixed(2)} ·{' '}
            <span className="text-lagoon">{BAND(selected.lat)}</span>
          </p>
          <p className="tabular-nums text-sand/80">
            yaw {selected.yawDeg.toFixed(1)}° <span className="text-sand/50">(Q / E)</span>
          </p>
          <label className="block">
            scale {selected.scale.toFixed(2)}
            <input
              type="range"
              min={0.3}
              max={2.5}
              step={0.05}
              value={selected.scale}
              onChange={(e) => setField(selected.id, { scale: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <label className="block">
            blocker{' '}
            {selected.blockerRadiusM === undefined
              ? 'none'
              : `${selected.blockerRadiusM.toFixed(2)} m`}
            <input
              type="range"
              min={0}
              max={4}
              step={0.05}
              value={selected.blockerRadiusM ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value)
                setField(selected.id, { blockerRadiusM: v === 0 ? undefined : v })
              }}
              className="w-full"
            />
          </label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => duplicate(selected.id)}
              className="rounded bg-sand/10 px-2 py-1 hover:bg-sand/20"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => remove(selected.id)}
              className="rounded bg-red-500/30 px-2 py-1 hover:bg-red-500/50"
            >
              Delete
            </button>
          </div>
          <p className="text-sand/50">Drag to move · arrows nudge 0.25 m</p>
        </div>
      ) : (
        <p className="rounded-lg bg-sand/5 p-2 text-sand/60">
          Click a marker to select it. Nothing selected — WASD still walks.
        </p>
      )}

      {/* Guardrails */}
      {mine.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-red-500/15 p-2 text-[11px] leading-snug">
          {mine.slice(0, 4).map((w, i) => (
            <li key={i}>⚠ {w.message}</li>
          ))}
          {mine.length > 4 && <li className="text-sand/60">+{mine.length - 4} more</li>}
        </ul>
      )}

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={undo}
          disabled={past === 0}
          className="rounded bg-sand/10 px-2 py-1 disabled:opacity-30"
        >
          Undo ({past})
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={future === 0}
          className="rounded bg-sand/10 px-2 py-1 disabled:opacity-30"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={() => setFreeFly((f) => !f)}
          className={`rounded px-2 py-1 ${freeFly ? 'bg-lagoon text-ink' : 'bg-sand/10'}`}
        >
          Free-fly
        </button>
      </div>

      <div className="flex gap-1">
        <button
          type="button"
          onClick={copy}
          className="flex-1 rounded bg-sand/15 px-2 py-1.5 font-bold hover:bg-sand/25"
        >
          Copy placements
        </button>
        <button
          type="button"
          onClick={write}
          className="flex-1 rounded bg-lagoon px-2 py-1.5 font-bold text-ink"
        >
          Write placements
        </button>
      </div>
      {status && <p className="text-lagoon">{status}</p>}
      <p className="text-sand/40">
        Total warnings: {warnings.length}. F2 closes the editor.
      </p>
    </div>
  )
}
