/**
 * Debug-gated logging. Off by default so production console stays quiet.
 *
 * Enable any of these:
 *   - URL:          `?debug` or `?debug=1`
 *   - localStorage: `localStorage.debug = '1'` (persists across reloads)
 *   - runtime:      `setDebug(true)` from the console
 *
 * Use `dlog`/`dwarn` for developer-only tracing (AI state, spawn tries, hit
 * math). Genuine failures the user should always see stay on plain
 * `console.warn`/`console.error`.
 */
let enabled = false
try {
  enabled =
    new URLSearchParams(location.search).has('debug') ||
    localStorage.getItem('debug') === '1'
} catch {
  // SSR / no-DOM contexts: leave disabled.
}

export function isDebug(): boolean {
  return enabled
}

/** Toggle debug logging at runtime (e.g. from the browser console). */
export function setDebug(on: boolean): void {
  enabled = on
}

/** Verbose, developer-only log. No-op unless debug is enabled. */
export function dlog(...args: unknown[]): void {
  if (enabled) console.log(...args)
}

/** Developer-only warning. No-op unless debug is enabled. */
export function dwarn(...args: unknown[]): void {
  if (enabled) console.warn(...args)
}
