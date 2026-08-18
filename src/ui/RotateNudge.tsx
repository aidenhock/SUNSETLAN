import { useCallback, useEffect, useState } from 'react'

/**
 * "Turn your phone" — shown over the world (never over /classic) when a
 * small touch screen is held upright. The island reads far better wide,
 * but portrait IS playable, so this is a nudge with a way past it, not
 * a gate: a visitor whose phone has rotation lock on must never be
 * stuck outside their own portfolio.
 *
 * Where the browser allows it (Android Chrome) the button does the real
 * thing — fullscreen, then `screen.orientation.lock('landscape')`. iOS
 * implements neither, so there the button can only ask, and if the view
 * is still upright a few seconds later we spell out how to switch off
 * Portrait Orientation Lock, which is the actual reason turning the
 * phone did nothing.
 */

const DISMISS_KEY = 'sl-rotate-nudge'
/** Phones, not tablets: an iPad in portrait plays fine. */
const QUERY = '(orientation: portrait) and (max-width: 820px) and (pointer: coarse)'
/** How long to wait before assuming rotation isn't going to happen. */
const HELP_AFTER_MS = 5000

const canLock = () =>
  typeof screen !== 'undefined' &&
  typeof screen.orientation?.lock === 'function' &&
  typeof document.documentElement.requestFullscreen === 'function'

const isApple = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))

/** Fullscreen + landscape where supported; false if the browser refuses. */
async function tryLockLandscape(): Promise<boolean> {
  if (!canLock()) return false
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    await screen.orientation.lock('landscape')
    return true
  } catch {
    // Safari, or a refused fullscreen request: fall back to asking.
    return false
  }
}

export function RotateNudge() {
  const [portrait, setPortrait] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const sync = () => setPortrait(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // Still upright after a few seconds? Then turning the phone isn't
  // working, and the help is worth more than the animation.
  useEffect(() => {
    if (!portrait || dismissed) {
      setShowHelp(false)
      return
    }
    const t = setTimeout(() => setShowHelp(true), HELP_AFTER_MS)
    return () => clearTimeout(t)
  }, [portrait, dismissed])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Private mode just means the nudge can return this visit.
    }
  }, [])

  const goLandscape = useCallback(async () => {
    const locked = await tryLockLandscape()
    // The lock rotates the screen, which fires the media query and hides
    // this by itself. If it didn't work, show the way out instead.
    if (!locked) setShowHelp(true)
  }, [])

  if (!portrait || dismissed) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotate-nudge-title"
      data-rotate-nudge
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-ink px-8 text-center text-sand"
    >
      <svg
        viewBox="0 0 64 64"
        className="animate-tip-phone h-20 w-20 text-lagoon"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="20" y="6" width="24" height="52" rx="4" />
        <line x1="28" y1="52" x2="36" y2="52" />
      </svg>

      <div className="space-y-2">
        <h2 id="rotate-nudge-title" className="font-display text-xl font-bold">
          Turn your phone sideways
        </h2>
        <p className="text-sm text-sand/75">
          The island is wider than it is tall — landscape gives you the whole horizon.
        </p>
      </div>

      {canLock() ? (
        <button
          type="button"
          onClick={goLandscape}
          className="rounded-lg bg-lagoon px-5 py-2.5 font-display text-sm font-bold text-ink"
        >
          Go landscape
        </button>
      ) : (
        // iOS gives us no lock to call, so the only useful button is the
        // one that explains why turning the phone may do nothing.
        !showHelp && (
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="rounded-lg bg-lagoon px-5 py-2.5 font-display text-sm font-bold text-ink"
          >
            Nothing happening?
          </button>
        )
      )}

      {showHelp && (
        <div className="max-w-xs rounded-lg border border-sand/20 bg-sand/5 p-3 text-left text-xs leading-relaxed text-sand/80">
          <p className="font-display text-sm text-sand">Turned it and nothing happened?</p>
          {isApple() ? (
            <p className="mt-1">
              Portrait Orientation Lock is on. Swipe down from the top-right corner to open
              Control Center, tap the padlock-with-arrow button so it stops glowing, then turn
              the phone again.
            </p>
          ) : (
            <p className="mt-1">
              Auto-rotate is off. Swipe down from the top of the screen and tap the
              auto-rotate (or screen rotation) tile, then turn the phone again.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={dismiss}
        className="rounded-lg border border-sand/30 px-4 py-2 font-display text-sm text-sand/85"
      >
        Play in portrait anyway
      </button>
    </div>
  )
}
