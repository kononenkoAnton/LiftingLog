// Workout storage seam. Same shape as progress.ts: an in-memory cache hydrated by
// loadWorkouts() at boot, written through to localStorage (offline-safe) and to
// Supabase when configured. A workout is stored as one JSONB row (see plan B1).
import { supabase } from './supabase'
import { toast } from './toast'
import { buildWorkoutExercises } from './logger-model'
import type { Session } from '../data/types'
import type { Workout } from './logger-types'

const ACTIVE_KEY = 'liftinglog:activeWorkout'
const HIST_KEY = 'liftinglog:workouts'

let active: Workout | null = null
let history: Workout[] = []
let userId: string | null = null

function readLocal<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback }
  catch { return fallback }
}
function writeLocalActive() {
  try {
    if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active))
    else localStorage.removeItem(ACTIVE_KEY)
  } catch { /* ignore */ }
}
function writeLocalHistory() {
  try { localStorage.setItem(HIST_KEY, JSON.stringify(history)) } catch { /* ignore */ }
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  if (userId) return userId
  const { data: { session } } = await supabase.auth.getSession()
  userId = session?.user?.id ?? null
  return userId
}

// Map a DB row {data: Workout} → Workout. `data` holds the full nested workout.
function rowToWorkout(r: { data: Workout }): Workout { return r.data }

/** Hydrate active + history. Call once at boot (after auth), like loadProgress(). */
export async function loadWorkouts(): Promise<void> {
  if (!supabase) {
    active = readLocal<Workout | null>(ACTIVE_KEY, null)
    history = readLocal<Workout[]>(HIST_KEY, [])
    return
  }
  await currentUserId()
  const { data, error } = await supabase
    .from('workouts')
    .select('data, status, started_at')
    .order('started_at', { ascending: false })
  if (error) { console.error('[workouts] load failed', error); active = null; history = []; return }
  const all = (data ?? []).map(rowToWorkout)
  active = all.find((w) => w.status === 'active') ?? null
  history = all.filter((w) => w.status !== 'active')
}

function uuid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16)
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Create a fresh active workout from a session's coach prescription and persist it. */
export function startWorkout(session: Session): Workout {
  // Guard double-tap: reuse the existing active workout for this session.
  if (active && active.status === 'active' && active.sessionNum === session.num) return active
  const w: Workout = {
    id: uuid(),
    sessionNum: session.num,
    startedAt: new Date().toISOString(),
    endedAt: null,
    pausedMs: 0,
    pausedAt: null,
    status: 'active',
    coachMessage: '',
    exercises: buildWorkoutExercises(session),
  }
  active = w
  writeLocalActive()
  void saveActiveWorkout(w)
  return w
}

export function getActiveWorkout(): Workout | null { return active }
export function listWorkouts(): Workout[] { return history }

/** Persist the active workout (write-through). Safe to call on every edit. */
export async function saveActiveWorkout(w: Workout): Promise<void> {
  active = w
  writeLocalActive()
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) { toast('Not signed in — saving locally', 'info'); return }
  const { error } = await supabase.from('workouts').upsert({
    id: w.id, session_num: w.sessionNum, started_at: w.startedAt,
    ended_at: w.endedAt, status: w.status, data: w,
  })
  if (error) { console.error('[workouts] save failed', error); toast(`Save failed: ${error.message}`, 'error') }
}

/** Finish: mark finished, stamp endedAt, move from active → history. */
export async function finishWorkout(w: Workout, coachMessage: string, nowIso: string): Promise<void> {
  const finished: Workout = { ...w, status: 'finished', endedAt: nowIso, coachMessage, pausedAt: null }
  await saveActiveWorkout(finished) // upserts the finished row
  history = [finished, ...history.filter((h) => h.id !== finished.id)]
  active = null
  writeLocalActive()
  writeLocalHistory()
}

/** Cancel: drop the active workout (mark cancelled in the store, clear active). */
export async function cancelWorkout(): Promise<void> {
  const w = active
  active = null
  writeLocalActive()
  if (!w) return
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) return
  const { error } = await supabase.from('workouts').update({ status: 'cancelled', data: { ...w, status: 'cancelled' } }).eq('id', w.id)
  if (error) console.error('[workouts] cancel failed', error)
}
