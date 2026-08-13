/**
 * Privacy-friendly analytics stub, gated behind a single env flag.
 *
 * Contract:
 * - `VITE_ANALYTICS` unset, empty, or `'off'` (the default): {@link initAnalytics}
 *   does nothing — no network calls, no globals, no side effects.
 * - Any other value: logs one `console.info` line noting analytics is enabled
 *   by flag but no provider is wired. Wiring an actual vendor (script tag,
 *   network call) is a deliberate human decision and is intentionally NOT
 *   done here.
 */
export function initAnalytics(): void {
  const flag: string | undefined = import.meta.env.VITE_ANALYTICS

  if (!flag || flag === 'off') {
    return
  }

  console.info(
    `analytics: enabled by VITE_ANALYTICS=${flag}, but no provider is wired (deliberate — adding a vendor requires a human decision)`,
  )
}
