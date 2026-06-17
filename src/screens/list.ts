import { program } from '../data/program'
import { liftTags } from '../lib/focus'
import { getSession } from '../data/program'
import { isFinished, finish, unfinish } from '../lib/progress'
import { listWorkouts, getFinishedForSession } from '../lib/workouts'
import { bestE1rmKg, bestE1rmLb } from '../lib/e1rm'
import { getUnit, setUnit } from '../lib/unit'
import type { Unit } from '../lib/logger-model'
import { KG_TO_LB, BAR_LB } from '../lib/load'
import { supabase } from '../lib/supabase'
import { gsap } from 'gsap'

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function fullDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${DOW[new Date(y, m - 1, d).getDay()]}, ${MONTHS[m - 1]} ${d}`
}

const TAG_COLOR: Record<string, string> = {
  SQUAT: '#e23b3b', BENCH: '#3b74e6', DEADLIFT: '#e3b341', ACCESSORY: '#8c9bb0',
}

function tagChip(t: string): string {
  const c = TAG_COLOR[t] ?? '#8c9bb0'
  return `<span class="ltag" style="color:${c};background:${c}1f;border:1px solid ${c}55">${t}</span>`
}

// Heaviest barbell load the COACH prescribes for a lift across the whole program.
function maxCoachKgFor(match: RegExp): number {
  let max = 0
  for (const s of program.sessions)
    for (const e of s.exercises) {
      if (e.equipment !== 'barbell' || !match.test(e.nameEn)) continue
      const w = e.weight
      if (w.kind === 'single') max = Math.max(max, w.kg)
      else if (w.kind === 'range') max = Math.max(max, w.maxKg)
      else if (w.kind === 'progression') max = Math.max(max, ...w.kg)
      else if (w.kind === 'perSet') max = Math.max(max, ...w.steps.map((x) => x.kg))
    }
  return max
}

// Heaviest barbell weight the user has actually LOGGED for a lift (lb → kg).
// Logged barbell weight is PLATE weight (excl. bar); add the bar so the logged PR
// is the full lifted weight, comparable to the coach's (total) numbers.
function maxLoggedKgFor(match: RegExp): number {
  let maxLb = 0
  for (const w of listWorkouts()) {
    if (w.status !== 'finished') continue
    for (const ex of w.exercises) {
      if (ex.equipment !== 'barbell' || !match.test(ex.nameEn)) continue
      for (const s of ex.sets) if (s.done && s.weightLb !== null) maxLb = Math.max(maxLb, s.weightLb)
    }
  }
  return maxLb > 0 ? Math.round((maxLb + BAR_LB) / KG_TO_LB) : 0
}

// Best of the coach's prescription and the user's logged actuals.
function maxKgFor(match: RegExp): number {
  return Math.max(maxCoachKgFor(match), maxLoggedKgFor(match))
}

// Coach/best Max for a lift in the chosen unit (coach prescribes kg; lb is a conversion).
function maxChip(match: RegExp, unit: Unit): string {
  const kg = maxKgFor(match)
  const v = unit === 'kg' ? kg : Math.round(kg * KG_TO_LB)
  return `${v}<span class="u">${unit}</span>`
}

// User's best estimated 1RM for a lift from logged sets in the chosen unit; '—' if none.
function e1rmChip(match: RegExp, unit: Unit): string {
  const v = unit === 'kg' ? bestE1rmKg(listWorkouts(), match) : bestE1rmLb(listWorkouts(), match)
  return v === null ? '—' : `~${v}<span class="u">${unit}</span>`
}

// The earliest chronological session not yet finished; null if all are done.
function firstUnfinished(): number | null {
  for (const s of program.sessions) if (!isFinished(s.num)) return s.num
  return null
}

export function renderList(el: HTMLElement) {
  const total = program.sessions.length
  let unit = getUnit()
  const LIFTS: RegExp[] = [/deadlift/i, /squat/i, /bench/i]
  el.innerHTML = `
    <div class="screen">
      <div class="hero-h">
        <div><div class="k">Program · Jan–Jun 2026</div><h1>${program.title}</h1></div>
        <div class="hero-actions">
          <a class="hist-link" href="#/history" aria-label="History">History</a>
          <span class="lang">EN · RU</span>
          ${supabase ? '<button class="signout" id="signout" type="button" aria-label="Sign out">⎋</button>' : ''}
        </div>
      </div>
      <div class="stats">
        <div class="chip"><div class="n mono"><span id="donecount">0</span><span style="color:var(--dim)">/${total}</span></div><div class="l">Done</div></div>
        <div class="chip"><div class="n mono" id="upnext">—</div><div class="l">Up next</div></div>
      </div>
      <div class="unit-row">
        <div class="unit-toggle" role="group" aria-label="Weight unit">
          <button class="ut ${unit === 'kg' ? 'on' : ''}" data-unit="kg" type="button">kg</button>
          <button class="ut ${unit === 'lb' ? 'on' : ''}" data-unit="lb" type="button">lb</button>
        </div>
      </div>
      <div class="stats2" id="maxRow">
        <div class="chip2"><div class="n2 mono" style="color:#e3b341">${maxChip(/deadlift/i, unit)}</div><div class="l2">Max Deadlift</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#e23b3b">${maxChip(/squat/i, unit)}</div><div class="l2">Max Squat</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#3b74e6">${maxChip(/bench/i, unit)}</div><div class="l2">Max Bench</div></div>
      </div>
      <div class="stats2" id="e1rmRow">
        <div class="chip2"><div class="n2 mono" style="color:#e3b341">${e1rmChip(/deadlift/i, unit)}</div><div class="l2">~1RM Deadlift</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#e23b3b">${e1rmChip(/squat/i, unit)}</div><div class="l2">~1RM Squat</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#3b74e6">${e1rmChip(/bench/i, unit)}</div><div class="l2">~1RM Bench</div></div>
      </div>
      <div id="rows">
        ${[...program.sessions].reverse().map((s) => `
          <div class="wrow" data-num="${s.num}" role="link" tabindex="0">
            <button class="wnum ${isFinished(s.num) ? 'done' : ''}" type="button" aria-label="Mark day finished" aria-pressed="${isFinished(s.num)}">${s.num}</button>
            <div class="wmeta">
              <div class="wdate">${fullDate(s.date)}</div>
              <div class="wtags">
                ${liftTags(s.exercises).map(tagChip).join('')}
                <span class="wcount">${s.exercises.length} exercises</span>
              </div>
            </div>
            <div class="arr">›</div>
          </div>`).join('')}
      </div>
    </div>`

  const rows = el.querySelector('#rows')!
  const upnextEl = el.querySelector('#upnext')!
  const doneEl = el.querySelector('#donecount')!

  // Recompute the done count and which session is "up next" (first unfinished),
  // and move the green highlight accordingly. Runs on render and after each toggle.
  function refreshProgress() {
    const next = firstUnfinished()
    const done = program.sessions.filter((s) => isFinished(s.num)).length
    doneEl.textContent = String(done)
    upnextEl.innerHTML = next === null
      ? '<span style="color:var(--mint)">✓</span>'
      : `${next}<span style="color:var(--dim)">/${total}</span>`
    rows.querySelectorAll<HTMLElement>('.wrow').forEach((r) => {
      r.classList.toggle('next', Number(r.dataset.num) === next)
    })
  }

  rows.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const row = target.closest<HTMLElement>('.wrow')
    if (!row) return
    const num = Number(row.dataset.num)
    const numBtn = target.closest<HTMLButtonElement>('.wnum')
    if (numBtn) {
      // tap the number to mark a day done (skipped — no logged workout) or un-mark it
      const willFinish = !isFinished(num)
      if (willFinish) {
        if (!confirm('Skip this day? It will be marked done without a logged workout.')) return
        finish(num, getSession(num)?.exercises ?? [])
      } else {
        // un-mark: warn, and reassure if a logged workout exists (it's not deleted)
        const msg = getFinishedForSession(num)
          ? 'Unmark this day? Your logged workout stays in History.'
          : 'Unmark this day?'
        if (!confirm(msg)) return
        unfinish(num)
      }
      numBtn.classList.toggle('done', willFinish)
      numBtn.setAttribute('aria-pressed', String(willFinish))
      refreshProgress()
      return
    }
    location.hash = `#/session/${num}`
  })

  refreshProgress()

  // kg/lb toggle: repaint the Max + ~1RM chip values in place (no full re-render,
  // so the row entry animation isn't replayed) and persist the shared unit setting.
  const maxRow = el.querySelector('#maxRow')!
  const e1rmRow = el.querySelector('#e1rmRow')!
  function paintChips() {
    maxRow.querySelectorAll<HTMLElement>('.n2').forEach((n, i) => { n.innerHTML = maxChip(LIFTS[i], unit) })
    e1rmRow.querySelectorAll<HTMLElement>('.n2').forEach((n, i) => { n.innerHTML = e1rmChip(LIFTS[i], unit) })
  }
  el.querySelectorAll<HTMLButtonElement>('.ut').forEach((btn) => {
    btn.addEventListener('click', () => {
      const u = btn.dataset.unit as Unit
      if (u === unit) return
      unit = u
      setUnit(u)
      el.querySelectorAll('.ut').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.unit === u))
      paintChips()
    })
  })

  el.querySelector('#signout')?.addEventListener('click', async () => {
    await supabase?.auth.signOut()
    location.reload()
  })

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduce) gsap.from('#rows .wrow', { y: 14, opacity: 0, duration: 0.4, stagger: 0.03, ease: 'power2.out' })
}
