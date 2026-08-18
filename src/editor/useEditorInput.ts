import { useEffect } from 'react'
import { usePlacementRuntime } from '../scene/placementRuntime'

/**
 * Editor keys. Arrows nudge the selection a quarter metre (the
 * controller stops reading them as movement while something is
 * selected), Q and E rotate it five degrees, Delete removes it, and
 * Ctrl+Z / Ctrl+Shift+Z walk the command stack.
 *
 * Capture phase: these must win over the game's own handlers.
 */
const NUDGE_M = 0.25
const ROTATE_DEG = 5

export function useEditorInput() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = usePlacementRuntime.getState()
      const id = s.selectedId
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.code === 'KeyZ') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && e.code === 'KeyY') {
        e.preventDefault()
        s.redo()
        return
      }
      if (!id) return
      // Typing in the panel's inputs must not drive the world.
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return

      switch (e.code) {
        case 'ArrowUp':
          s.nudge(id, 0, NUDGE_M)
          break
        case 'ArrowDown':
          s.nudge(id, 0, -NUDGE_M)
          break
        case 'ArrowRight':
          s.nudge(id, NUDGE_M, 0)
          break
        case 'ArrowLeft':
          s.nudge(id, -NUDGE_M, 0)
          break
        case 'KeyQ':
          s.rotate(id, -ROTATE_DEG)
          break
        case 'KeyE':
          s.rotate(id, ROTATE_DEG)
          break
        case 'Delete':
        case 'Backspace':
          s.remove(id)
          break
        case 'KeyD':
          if (e.shiftKey) s.duplicate(id)
          else return
          break
        case 'Escape':
          s.select(null)
          return
        default:
          return
      }
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
