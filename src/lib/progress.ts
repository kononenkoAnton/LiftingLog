// Per-session progress with a storage SEAM: a sync in-memory cache hydrated by
// loadProgress() and written through on finish/unfinish. Today the backing store
// is localStorage; Stage 3 swaps in Supabase behind the same functions without
// touching the screens.
//
// A "finished" session stores a SNAPSHOT of its exercises at finish time, so the
// app can lock finished days to what was actually done while unfinished days keep
// showing the latest parse.
import type { Exercise } from '../data/types'

export type Snapshot = Exercise[]
interface Entry { at: string; snapshot: Snapshot | null }

const KEY = 'liftinglog:logs'
let cache: Record<string, Entry> = {}

function readLocal(): Record<string, Entry> {
  try {
    const raw = localStorage.getItem(KEY)
    const obj = raw ? JSON.parse(raw) : null
    const finished = obj?.finished
    if (finished && typeof finished === 'object') {
      const out: Record<string, Entry> = {}
      for (const [num, v] of Object.entries(finished)) {
        // migrate old shape ({num: true}) → entry with no snapshot
        out[num] = v === true ? { at: '', snapshot: null } : (v as Entry)
      }
      return out
    }
  } catch { /* corrupt or unavailable */ }
  return {}
}

function writeLocal(): void {
  try { localStorage.setItem(KEY, JSON.stringify({ finished: cache })) } catch { /* ignore */ }
}

/** Hydrate the cache. Call once at startup before rendering. */
export async function loadProgress(): Promise<void> {
  cache = readLocal()
}

export function isFinished(num: number): boolean {
  return cache[String(num)] !== undefined
}

/** The exercises snapshot taken when the day was finished (null if unknown). */
export function getSnapshot(num: number): Snapshot | null {
  return cache[String(num)]?.snapshot ?? null
}

export function finishedCount(): number {
  return Object.keys(cache).length
}

export async function finish(num: number, snapshot: Snapshot): Promise<void> {
  cache[String(num)] = { at: new Date().toISOString(), snapshot } // optimistic
  writeLocal()
}

export async function unfinish(num: number): Promise<void> {
  delete cache[String(num)]
  writeLocal()
}
