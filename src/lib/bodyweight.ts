// Bodyweight storage seam — mirrors progress.ts. A sync in-memory cache hydrated
// once at boot (loadBodyweight), written through to localStorage (offline-safe
// mirror, like workouts.ts) and Supabase when configured. One row per local day;
// re-logging overwrites. Stores kilograms only (project convention).
import { supabase } from './supabase'
import { toast } from './toast'
import type { BodyEntry } from './bodyweight-model'

const KEY = 'liftinglog:bodyweight'
let cache: Record<string, number> = {} // day 'YYYY-MM-DD' → kg
let userId: string | null = null

function readLocal(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY)
    const obj = raw ? JSON.parse(raw) : null
    if (obj && typeof obj === 'object') return obj as Record<string, number>
  } catch { /* corrupt or unavailable */ }
  return {}
}

function writeLocal(): void {
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* ignore */ }
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  if (userId) return userId
  const { data: { session } } = await supabase.auth.getSession()
  userId = session?.user?.id ?? null
  return userId
}

/** Local calendar date as 'YYYY-MM-DD' (NOT toISOString — that's UTC and could roll the day). */
export function todayLocalIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Hydrate the cache. Call once at startup (after auth) before rendering. */
export async function loadBodyweight(): Promise<void> {
  if (!supabase) { cache = readLocal(); return }
  await currentUserId()
  const { data, error } = await supabase
    .from('bodyweight')
    .select('day, weight_kg')
  if (error) { console.error('[bodyweight] load failed', error); cache = readLocal(); return }
  cache = {}
  if (data) for (const r of data) cache[String(r.day)] = Number(r.weight_kg)
}

/** All entries oldest → newest (for the sparkline). */
export function listBodyweight(): BodyEntry[] {
  return Object.entries(cache)
    .map(([day, weightKg]) => ({ day, weightKg }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

/** A single day's kg, or null (used to prefill the quick-add input with today). */
export function getBodyweight(day: string): number | null {
  return cache[day] ?? null
}

/** Upsert one day's bodyweight (write-through). Re-logging overwrites. */
export async function logBodyweight(day: string, kg: number): Promise<void> {
  cache[day] = kg // optimistic
  writeLocal()
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) { toast('Not signed in — saving locally', 'info'); return }
  const { error } = await supabase.from('bodyweight').upsert(
    { day, weight_kg: kg },
    { onConflict: 'user_id,day' },
  )
  if (error) { console.error('[bodyweight] save failed', error); toast(`Save failed: ${error.message}`, 'error') }
}

/** Delete one day's bodyweight. */
export async function deleteBodyweight(day: string): Promise<void> {
  delete cache[day]
  writeLocal()
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) return
  const { error } = await supabase.from('bodyweight').delete().eq('day', day)
  if (error) { console.error('[bodyweight] delete failed', error); toast(`Delete failed: ${error.message}`, 'error') }
}
