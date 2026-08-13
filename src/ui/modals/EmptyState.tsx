/** Friendly per-category empty state (Phase 4): while a content
 * category is still unfilled, its modal shows this instead of an empty
 * grid — the site must never look broken mid-content-fill. */
export function EmptyState({ icon, headline, sub }: { icon: string; headline: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink/15 px-6 py-12 text-center">
      <span aria-hidden className="text-4xl">
        {icon}
      </span>
      <p className="font-display text-lg font-semibold">{headline}</p>
      <p className="max-w-sm text-sm leading-relaxed text-ink/70">{sub}</p>
    </div>
  )
}
