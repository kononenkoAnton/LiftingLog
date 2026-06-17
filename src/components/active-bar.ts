// Persistent "active workout" bar — a fixed bottom bar shown on every screen while
// a workout is active, EXCEPT the logger itself and the active day's own schedule
// (both live at #/session/<activeDay>, where a Resume button already exists). One
// tap resumes straight into the logger. Lives on <body>, outside the routed #app.
import { getActiveWorkout } from '../lib/workouts'
import { workoutDurationSec } from '../lib/logger-model'

let bar: HTMLElement | null = null
let onResume: ((sessionNum: number) => void) | null = null

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

function refresh() {
  if (!bar) return
  const w = getActiveWorkout()
  const num = w?.sessionNum ?? null // null = ad-hoc workout (no day route) → no bar
  // The active day's route (#/session/N) is shared by the logger and that day's
  // schedule — hide there; show on every other screen.
  const show = num !== null && location.hash !== `#/session/${num}`
  document.body.classList.toggle('has-active-bar', show)
  if (!show || !w) { bar.style.display = 'none'; return }
  bar.style.display = 'flex'
  const time = w.pausedAt ? 'paused' : fmt(workoutDurationSec(w, Date.now()))
  // Trusted content (day number + time) — no user text.
  bar.innerHTML =
    `<span class="ab-label">▶ Resume workout · Day ${num}</span>` +
    `<span class="ab-time mono">${time}</span>`
}

export function mountActiveBar(onResumeCb: (sessionNum: number) => void) {
  onResume = onResumeCb
  bar = document.createElement('div')
  bar.className = 'active-bar'
  bar.style.display = 'none'
  bar.addEventListener('click', () => {
    const w = getActiveWorkout()
    if (w && w.sessionNum !== null && onResume) onResume(w.sessionNum)
  })
  document.body.appendChild(bar)
  window.addEventListener('hashchange', refresh)
  setInterval(refresh, 1000) // drives the live clock + catches start/finish/cancel
  refresh()
}
