/**
 * A progress rail of dots that light up as you go: everything you've
 * already seen glows, the rail fills left to right behind them, and the
 * one you're on wears a ring. Used for the build log's chapters and for
 * a mural's pictures, so both read as "how far through am I".
 *
 * Seen-ness is passed in, never stored here — the caller decides
 * whether that means this visit or forever (today: this visit only).
 */
export function StepDots({
  count,
  current,
  seen,
  onSelect,
  label,
  itemLabel,
}: {
  count: number
  current: number
  /** Which steps have been viewed; drives the glow and the fill. */
  seen: boolean[]
  onSelect: (index: number) => void
  /** Accessible name for the whole rail. */
  label: string
  /** Accessible name for one dot, e.g. "Chapter 3: The terrain". */
  itemLabel: (index: number) => string
}) {
  if (count < 2) return null
  // The rail fills to the furthest step reached, not to the current one:
  // stepping back shouldn't un-light what you've already read.
  let furthest = 0
  for (let i = 0; i < count; i++) if (seen[i]) furthest = i
  const fill = (furthest / (count - 1)) * 100

  return (
    <div className="relative py-2" role="group" aria-label={label}>
      {/* Rail: the dim track, then the lit portion over it. */}
      <div className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-ink/15" />
      <div
        className="absolute left-1 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-lagoon shadow-[0_0_8px_rgba(53,167,160,0.7)] transition-[width] duration-500 ease-out"
        style={{ width: `calc((100% - 0.5rem) * ${fill / 100})` }}
      />
      <ol className="relative flex items-center justify-between">
        {Array.from({ length: count }, (_, i) => {
          const isSeen = Boolean(seen[i])
          const isCurrent = i === current
          return (
            <li key={i} className="flex">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-label={itemLabel(i)}
                aria-current={isCurrent ? 'step' : undefined}
                data-seen={isSeen || undefined}
                className={`block rounded-full transition-all duration-500 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lagoon ${
                  isCurrent
                    ? 'h-3.5 w-3.5 bg-lagoon shadow-[0_0_12px_3px_rgba(53,167,160,0.85)] ring-2 ring-white/80'
                    : isSeen
                      ? 'h-2.5 w-2.5 bg-lagoon shadow-[0_0_9px_2px_rgba(53,167,160,0.65)]'
                      : 'h-2.5 w-2.5 bg-ink/20 hover:bg-ink/35'
                }`}
              />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
