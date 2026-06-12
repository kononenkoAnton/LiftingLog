import { program } from '../data/program'
import { liftTags } from '../lib/focus'
import { isFinished, toggleFinished } from '../lib/progress'
import { gsap } from 'gsap'

function checkEl(done: boolean): string {
  return `<button class="wcheck ${done ? 'done' : ''}" type="button" aria-label="Mark day finished" aria-pressed="${done}">${done ? '✓' : ''}</button>`
}

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

function topPullKg(): number {
  let max = 0
  for (const s of program.sessions)
    for (const e of s.exercises)
      if (/deadlift/i.test(e.nameEn)) {
        const w = e.weight
        if (w.kind === 'single') max = Math.max(max, w.kg)
        if (w.kind === 'range') max = Math.max(max, w.maxKg)
        if (w.kind === 'progression') max = Math.max(max, ...w.kg)
        if (w.kind === 'perSet') max = Math.max(max, ...w.steps.map((x) => x.kg))
      }
  return max
}

export function renderList(el: HTMLElement) {
  const next = 1
  el.innerHTML = `
    <div class="screen">
      <div class="hero-h">
        <div><div class="k">Program · Jan–Jun 2026</div><h1>${program.title}</h1></div>
        <span class="lang">EN · RU</span>
      </div>
      <div class="stats">
        <div class="chip"><div class="n mono">${program.sessions.length}</div><div class="l">Sessions</div></div>
        <div class="chip"><div class="n mono">${next}<span style="color:var(--dim)">/${program.sessions.length}</span></div><div class="l">Up next</div></div>
        <div class="chip"><div class="n mono">${topPullKg()}<span style="font-size:11px">kg</span></div><div class="l">Top pull</div></div>
      </div>
      <div id="rows">
        ${[...program.sessions].reverse().map((s) => `
          <div class="wrow ${s.num === next ? 'next' : ''}" data-num="${s.num}" role="link" tabindex="0">
            <div class="wnum ${s.num === next ? 'next' : ''}">${s.num}</div>
            <div class="wmeta">
              <div class="wdate">${fullDate(s.date)}</div>
              <div class="wtags">
                ${liftTags(s.exercises).map(tagChip).join('')}
                <span class="wcount">${s.exercises.length} exercises</span>
              </div>
            </div>
            <div class="arr">›</div>
            ${checkEl(isFinished(s.num))}
          </div>`).join('')}
      </div>
    </div>`

  const rows = el.querySelector('#rows')!
  rows.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const row = target.closest<HTMLElement>('.wrow')
    if (!row) return
    const num = Number(row.dataset.num)
    const check = target.closest<HTMLButtonElement>('.wcheck')
    if (check) {
      const done = toggleFinished(num) // toggle without navigating
      check.classList.toggle('done', done)
      check.textContent = done ? '✓' : ''
      check.setAttribute('aria-pressed', String(done))
      return
    }
    location.hash = `#/session/${num}`
  })

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduce) gsap.from('#rows .wrow', { y: 14, opacity: 0, duration: 0.4, stagger: 0.03, ease: 'power2.out' })
}
