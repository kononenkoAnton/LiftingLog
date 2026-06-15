import { program } from '../data/program'
import { liftTags } from '../lib/focus'
import { getSession } from '../data/program'
import { isFinished, finish, unfinish } from '../lib/progress'
import { listWorkouts } from '../lib/workouts'
import { KG_TO_LB } from '../lib/load'
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
function maxLoggedKgFor(match: RegExp): number {
  let maxLb = 0
  for (const w of listWorkouts()) {
    if (w.status !== 'finished') continue
    for (const ex of w.exercises) {
      if (ex.equipment !== 'barbell' || !match.test(ex.nameEn)) continue
      for (const s of ex.sets) if (s.done && s.weightLb !== null) maxLb = Math.max(maxLb, s.weightLb)
    }
  }
  return maxLb > 0 ? Math.round(maxLb / KG_TO_LB) : 0
}

// Best of the coach's prescription and the user's logged actuals.
function maxKgFor(match: RegExp): number {
  return Math.max(maxCoachKgFor(match), maxLoggedKgFor(match))
}

// The earliest chronological session not yet finished; null if all are done.
function firstUnfinished(): number | null {
  for (const s of program.sessions) if (!isFinished(s.num)) return s.num
  return null
}

export function renderList(el: HTMLElement) {
  const total = program.sessions.length
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
      <div class="stats2">
        <div class="chip2"><div class="n2 mono" style="color:#e3b341">${maxKgFor(/deadlift/i)}<span class="u">kg</span></div><div class="l2">Max Deadlift</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#e23b3b">${maxKgFor(/squat/i)}<span class="u">kg</span></div><div class="l2">Max Squat</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#3b74e6">${maxKgFor(/bench/i)}<span class="u">kg</span></div><div class="l2">Max Bench</div></div>
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
      // tap the number to toggle finished, without navigating
      const done = !isFinished(num)
      if (done) finish(num, getSession(num)?.exercises ?? [])
      else unfinish(num)
      numBtn.classList.toggle('done', done)
      numBtn.setAttribute('aria-pressed', String(done))
      refreshProgress()
      return
    }
    location.hash = `#/session/${num}`
  })

  refreshProgress()

  el.querySelector('#signout')?.addEventListener('click', async () => {
    await supabase?.auth.signOut()
    location.reload()
  })

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduce) gsap.from('#rows .wrow', { y: 14, opacity: 0, duration: 0.4, stagger: 0.03, ease: 'power2.out' })
}
