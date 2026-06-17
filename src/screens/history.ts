// Past finished workouts. SECURITY: workout/exercise names are trusted, but the
// coach message is USER TEXT — rendered via textContent only.
import { listWorkouts } from '../lib/workouts'
import { workoutDurationSec, trainerLog, setWeightDisplay, type Unit } from '../lib/logger-model'
import { getUnit, setUnit } from '../lib/unit'
import type { Workout } from '../lib/logger-types'
import { toast } from '../lib/toast'

const fmtDur = (sec: number) => `${Math.floor(sec / 60)}m`
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

let openId: string | null = null

export function renderHistory(el: HTMLElement) {
  let unit = getUnit()
  const draw = () => {
    const finished = listWorkouts()
      .filter((w) => w.status === 'finished')
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))

    el.innerHTML = `
      <div class="screen">
        <a class="back" href="#/">‹ Program</a>
        <div class="hist-top">
          <h1 class="hist-h">History</h1>
          ${finished.length ? `<div class="unit-toggle" role="group" aria-label="Weight unit">
            <button class="ut ${unit === 'kg' ? 'on' : ''}" data-unit="kg" type="button">kg</button>
            <button class="ut ${unit === 'lb' ? 'on' : ''}" data-unit="lb" type="button">lb</button>
          </div>` : ''}
        </div>
        ${finished.length ? `<div id="histList"></div>` : '<div class="note">No finished workouts yet.</div>'}
      </div>`

    el.querySelectorAll<HTMLButtonElement>('.ut').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.dataset.unit as Unit
        if (u === unit) return
        unit = u; setUnit(u); draw()
      })
    })

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
          const repStr = s.reps === null ? '–' : `${s.reps}${ex.isTimed ? 's' : ''}`
          row.textContent = `${done} ${setWeightDisplay(s.weightLb, ex.equipment, unit)} × ${repStr}`
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
      const copyBtn = document.createElement('button')
      copyBtn.className = 'trainer-btn'
      copyBtn.type = 'button'
      copyBtn.textContent = '📋 Copy for trainer (kg)'
      copyBtn.addEventListener('click', async () => {
        const text = trainerLog(w)
        try { await navigator.clipboard.writeText(text); toast('Copied for trainer ✓', 'info') }
        catch { toast(text, 'info') }
      })
      body.appendChild(copyBtn)
      root.appendChild(body)
    }
    return root
  }

  draw()
}
