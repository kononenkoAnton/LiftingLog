// Progress / Trends — estimated-1RM trend per main barbell lift, as an inline SVG
// sparkline, with a per-lift drill-down. 100% reads of already-stored finished
// workouts. All rendered text is trusted/derived (no user input), so innerHTML is
// safe here; the sparkline SVG comes from the pure sparklineSvg() helper.
import { listWorkouts } from '../lib/workouts'
import { e1rmSeries, bestE1rmKg, bestE1rmLb } from '../lib/e1rm'
import { sparklineSvg } from '../components/sparkline-svg'
import { getUnit, setUnit } from '../lib/unit'
import { KG_TO_LB, BAR_LB } from '../lib/load'
import type { Unit } from '../lib/logger-model'

type LiftKey = 'deadlift' | 'squat' | 'bench'
interface LiftDef { key: LiftKey; label: string; match: RegExp; color: string }

// Same order + accent colors as the home Max / ~1RM chips.
const LIFTS: LiftDef[] = [
  { key: 'deadlift', label: 'Deadlift', match: /deadlift/i, color: '#e3b341' },
  { key: 'squat', label: 'Squat', match: /squat/i, color: '#e23b3b' },
  { key: 'bench', label: 'Bench', match: /bench/i, color: '#3b74e6' },
]

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// Full lb (incl. bar) → the chosen display unit, rounded once.
const toUnit = (fullLb: number, unit: Unit) =>
  unit === 'kg' ? Math.round(fullLb / KG_TO_LB) : Math.round(fullLb)

const bestStr = (match: RegExp, unit: Unit) => {
  const v = unit === 'kg' ? bestE1rmKg(listWorkouts(), match) : bestE1rmLb(listWorkouts(), match)
  return v === null ? '—' : `~${v}<span class="u">${unit}</span>`
}

const unitToggle = (unit: Unit) => `
  <div class="unit-toggle" role="group" aria-label="Weight unit">
    <button class="ut ${unit === 'kg' ? 'on' : ''}" data-unit="kg" type="button">kg</button>
    <button class="ut ${unit === 'lb' ? 'on' : ''}" data-unit="lb" type="button">lb</button>
  </div>`

// Wire the kg/lb toggle: persist the shared unit and re-render via `redraw`.
function bindUnitToggle(el: HTMLElement, unit: Unit, set: (u: Unit) => void, redraw: () => void) {
  el.querySelectorAll<HTMLButtonElement>('.ut').forEach((btn) => {
    btn.addEventListener('click', () => {
      const u = btn.dataset.unit as Unit
      if (u === unit) return
      set(u); setUnit(u); redraw()
    })
  })
}

export function renderProgress(el: HTMLElement) {
  let unit = getUnit()

  const cardHtml = (lift: LiftDef) => {
    const series = e1rmSeries(listWorkouts(), lift.match)
    const spark = series.length
      ? sparklineSvg(series.map((p) => p.e1rmFullLb), { color: lift.color })
      : '<span class="prog-empty">No logged sets yet</span>'
    return `
      <button class="prog-card" data-lift="${lift.key}" type="button">
        <div class="prog-card-top">
          <span class="prog-name">${lift.label}</span>
          <span class="prog-best mono" style="color:${lift.color}">${bestStr(lift.match, unit)}</span>
        </div>
        <div class="prog-spark">${spark}</div>
        ${series.length === 1 ? '<div class="prog-hint">Log more to see a trend</div>' : ''}
      </button>`
  }

  const draw = () => {
    el.innerHTML = `
      <div class="screen">
        <a class="back" href="#/">‹ Program</a>
        <div class="hist-top">
          <h1 class="hist-h">Progress</h1>
          ${unitToggle(unit)}
        </div>
        <div class="prog-cards">${LIFTS.map(cardHtml).join('')}</div>
        <a class="hist-link prog-bw-link" href="#/bodyweight">Bodyweight ›</a>
      </div>`

    bindUnitToggle(el, unit, (u) => { unit = u }, draw)
    el.querySelector('.prog-cards')!.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.prog-card')
      if (card) location.hash = `#/progress/${card.dataset.lift}`
    })
  }

  draw()
}

export function renderProgressDetail(el: HTMLElement, liftKey: string) {
  const lift = LIFTS.find((l) => l.key === liftKey)
  if (!lift) { location.hash = '#/progress'; return }
  let unit = getUnit()

  const rowHtml = (p: { dateIso: string; e1rmFullLb: number; weightLb: number; reps: number }) => `
    <div class="prog-row">
      <span class="prog-date">${dateLabel(p.dateIso)}</span>
      <span class="prog-set mono">${toUnit(p.weightLb + BAR_LB, unit)} ${unit} × ${p.reps}</span>
      <span class="prog-e1 mono" style="color:${lift.color}">~${toUnit(p.e1rmFullLb, unit)}<span class="u">${unit}</span></span>
    </div>`

  const draw = () => {
    const series = e1rmSeries(listWorkouts(), lift.match)
    el.innerHTML = `
      <div class="screen">
        <a class="back" href="#/progress">‹ Progress</a>
        <div class="hist-top">
          <h1 class="hist-h" style="color:${lift.color}">${lift.label}</h1>
          ${unitToggle(unit)}
        </div>
        ${series.length === 0
          ? '<div class="note">No logged sets yet.</div>'
          : `
          <div class="prog-chart">${sparklineSvg(series.map((p) => p.e1rmFullLb), { color: lift.color })}</div>
          <div class="prog-best-big mono" style="color:${lift.color}">Best ${bestStr(lift.match, unit)}</div>
          <div class="prog-list">${[...series].reverse().map(rowHtml).join('')}</div>`}
      </div>`

    bindUnitToggle(el, unit, (u) => { unit = u }, draw)
  }

  draw()
}
