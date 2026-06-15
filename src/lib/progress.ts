// Per-session progress with a storage SEAM: a sync in-memory cache hydrated by
// loadProgress() and written through on finish/unfinish. Today the backing store
// is localStorage; Stage 3 swaps in Supabase behind the same functions without
// touching the screens.
//
// A "finished" session stores a SNAPSHOT of its exercises at finish time, so the
// app can lock finished days to what was actually done while unfinished days keep
// showing the latest parse.
import type { Exercise } from '../data/types'
import { supabase } from './supabase'
import { toast } from './toast'

export type Snapshot = Exercise[]
interface Entry { at: string; snapshot: Snapshot | null }

const KEY = 'liftinglog:logs'
let cache: Record<string, Entry> = {}
let userId: string | null = null

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

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  if (userId) return userId
  const { data: { session } } = await supabase.auth.getSession()
  userId = session?.user?.id ?? null
  return userId
}

/** Hydrate the cache. Call once at startup (after auth) before rendering. */
export async function loadProgress(): Promise<void> {
  if (!supabase) { cache = readLocal(); return }
  await currentUserId()
  const { data, error } = await supabase
    .from('progress')
    .select('session_num, snapshot, finished_at')
  if (error) console.error('[progress] load failed', error)
  cache = {}
  if (data) {
    for (const r of data) cache[String(r.session_num)] = { at: r.finished_at, snapshot: r.snapshot }
  }
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
  if (!supabase) { writeLocal(); return }
  const uid = await currentUserId()
  if (!uid) { toast('Not signed in — can’t save', 'error'); return }
  // Omit user_id — the column defaults to auth.uid() server-side, so it always
  // matches the RLS "with check (auth.uid() = user_id)" for the signed-in user.
  const { error } = await supabase.from('progress').upsert(
    { session_num: num, snapshot },
    { onConflict: 'user_id,session_num' },
  )
  if (error) { console.error('[progress] save failed', error); toast(`Save failed: ${error.message}`, 'error') }
  else toast('Saved ✓')
}

export async function unfinish(num: number): Promise<void> {
  delete cache[String(num)]
  if (!supabase) { writeLocal(); return }
  const uid = await currentUserId()
  if (!uid) return
  const { error } = await supabase.from('progress').delete().eq('session_num', num)
  if (error) { console.error('[progress] delete failed', error); toast(`Delete failed: ${error.message}`, 'error') }
}
