// Pure model for the workout logger. No DOM, no storage, no Date.now() — callers
// pass `now` in so these stay deterministic and unit-testable.
import type { Equipment } from '../data/types'

// Per-lift rest defaults. MUST stay in sync with scripts/build-catalog.mjs `restFor`
// (that bakes defaultRestSec into the catalog; this resolves it for coach lifts).
export function restDefaultFor(nameEn: string, equipment: Equipment): number {
  const n = nameEn.toLowerCase()
  if (n.includes('squat')) return 90
  if (n.includes('bench')) return 150
  if (n.includes('deadlift')) return equipment === 'barbell' ? 300 : 90
  return equipment === 'barbell' ? 180 : 90
}

/** Elapsed seconds, excluding paused time. Pass `nowMs` (Date.now()) from the caller. */
export function workoutDurationSec(
  w: { startedAt: string; endedAt: string | null; pausedMs: number },
  nowMs: number,
): number {
  const end = w.endedAt ? Date.parse(w.endedAt) : nowMs
  return Math.max(0, Math.round((end - Date.parse(w.startedAt) - w.pausedMs) / 1000))
}
