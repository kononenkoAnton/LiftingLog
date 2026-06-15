// Past finished workouts. SECURITY: workout/exercise names are trusted, but the
// coach message is USER TEXT — rendered via textContent only.
import { listWorkouts } from '../lib/workouts'
import { workoutDurationSec } from '../lib/logger-model'
import type { Workout } from '../lib/logger-types'

const fmtDur = (sec: number) => `${Math.floor(sec / 60)}m`
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

let openId: string | null = null

export function renderHistory(el: HTMLElement) {
  const draw = () => {
    const finished = listWorkouts()
      .filter((w) => w.status === 'finished')
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))

    el.innerHTML = `
      <div class="screen">
        <a class="back" href="#/">‹ Program</a>
        <h1 class="hist-h">History</h1>
        ${finished.length ? `<div id="histList"></div>` : '<div class="note">No finished workouts yet.</div>'}
      </div>`

    const list = el.querySelector('#histList')
    if (list) finished.forEach((w) => list.appendChild(card(w)))
  }

  const card = (w: Workout): HTMLElement => {
    const root = document.createElement('div')
    root.className = 'hist-card'
    const head = document.createElement('button')
    head.className = 'hist-head'
    head.type = 'button'
    const dur = w.endedAt ? workoutDurationSec(w, Date.parse(w.endedAt)) : 0
    head.textContent = `Day ${w.sessionNum ?? '—'} · ${dateLabel(w.startedAt)} · ${fmtDur(dur)} · ${w.exercises.length} ex`
    head.addEventListener('click', () => { openId = openId === w.id ? null : w.id; draw() })
    root.appendChild(head)

    if (openId === w.id) {
      const body = document.createElement('div')
      body.className = 'hist-body'
      for (const ex of w.exercises) {
        const exEl = document.createElement('div')
        exEl.className = 'hist-ex'
        const nm = document.createElement('div')
        nm.className = 'hist-exname'
        nm.textContent = ex.nameEn
        exEl.appendChild(nm)
        for (const s of ex.sets) {
          const row = document.createElement('div')
          row.className = 'hist-set'
          const done = s.done ? '✓' : '·'
          row.textContent = `${done} ${s.weightLb ?? '–'} lb × ${s.reps ?? '–'}`
          exEl.appendChild(row)
        }
        body.appendChild(exEl)
      }
      if (w.coachMessage) {
        const m = document.createElement('div')
        m.className = 'hist-msg'
        m.textContent = `Coach message: ${w.coachMessage}`
        body.appendChild(m)
      }
      root.appendChild(body)
    }
    return root
  }

  draw()
}
