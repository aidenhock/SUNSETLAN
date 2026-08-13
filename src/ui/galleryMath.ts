/** Pure pagination + viewer-navigation math for the photo gallery
 * (Phase 4). Kept free of React so vitest pins every edge: page
 * slicing, the "7–12 of 13" label, wrap-around navigation, and the
 * ±1 neighbor set the viewer preloads. */

export const PER_PAGE = 6

export function pageCount(total: number, perPage = PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage))
}

/** The page a photo index lives on — the grid follows the viewer. */
export function pageOf(index: number, perPage = PER_PAGE): number {
  return Math.floor(index / perPage)
}

/** Half-open [start, end) slice of a page. */
export function pageRange(page: number, total: number, perPage = PER_PAGE): { start: number; end: number } {
  const start = page * perPage
  return { start, end: Math.min(start + perPage, total) }
}

/** "7–12 of 13" (1-based, en dash); single-item pages read "13 of 13". */
export function pageLabel(page: number, total: number, perPage = PER_PAGE): string {
  const { start, end } = pageRange(page, total, perPage)
  return start + 1 === end ? `${end} of ${total}` : `${start + 1}–${end} of ${total}`
}

/** Continuous wrap-around across ALL photos (never per-page). */
export function wrapIndex(i: number, total: number): number {
  return ((i % total) + total) % total
}

/** The viewer preloads these (±1, wrapped, deduped, never the current). */
export function neighborIndices(i: number, total: number): number[] {
  if (total <= 1) return []
  const prev = wrapIndex(i - 1, total)
  const next = wrapIndex(i + 1, total)
  return prev === next ? [prev] : [prev, next]
}
