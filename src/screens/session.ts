import { getSession, program } from '../data/program'
import type { Exercise, Weight } from '../data/types'
import { computeBarbellLoad, kgToLb } from '../lib/load'
import { mountBarbell } from '../components/barbell'
import { PLATE_COLOR } from '../components/barbell-svg'
import { isFinished, toggleFinished } from '../lib/progress'
import { gsap } from 'gsap'

// Distinct per-set loads for a barbell lift (progression / per-set scheme), else
// null. Each entry is a weight the bar is loaded to for one (or more) sets.
function stepWeightsOf(w: Weight): number[] | null {
  if (w.kind === 'progression') return w.kg
  if (w.kind === 'perSet') return w.steps.map((s) => s.kg)
  return null
}

function primaryKg(w: Weight): number | null {
  if (w.kind === 'single') return w.kg
  if (w.kind === 'range') return w.maxKg
  if (w.kind === 'progression') return Math.max(...w.kg)
  if (w.kind === 'perSet') return Math.max(...w.steps.map((s) => s.kg))
  return null
}

function weightLabel(w: Weight, perImplement?: boolean): string {
  const suffix = perImplement ? ' each' : ''
  if (w.kind === 'single') return `${w.kg} kg${suffix}`
  if (w.kind === 'range') return `${w.minKg}–${w.maxKg} kg${suffix}`
  if (w.kind === 'progression') return `${w.kg.join('→')} kg`
  if (w.kind === 'perSet') return w.steps.map((s) => `${s.kg}×${s.reps}`).join(', ')
  if (w.kind === 'qualitative') return w.level[0].toUpperCase() + w.level.slice(1)
  return 'Bodyweight'
}

function platesText(perSide: { plate: number; count: number }[]): string {
  if (!perSide.length) return 'empty bar'
  return perSide
    .map((p) => {
      const c = PLATE_COLOR[p.plate] ?? '#9aa7b8'
      const style = `background:${c}22;color:${c};border:1px solid ${c}66`
      return `<span class="pl" style="${style}">${p.count > 1 ? p.count + '×' : ''}${p.plate}</span>`
    })
    .join('')
}

// `steps` + `stepIdx` drive the per-set loading; selKg is steps[stepIdx] (or the
// single/range value). Step chips re-load the bar without leaving the screen.
function heroFor(e: Exercise, steps: number[] | null, stepIdx: number, selKg: number | null): string {
  if (e.equipment === 'barbell' && selKg !== null) {
    const load = computeBarbellLoad(selKg)
    // Multiple per-set loads → the step selector IS the headline (tap to load).
    // Single load → one big centered value. Both carry the kg unit.
    const headline = steps && steps.length > 1
      ? `<div class="steps">${steps
          .map((kg, i) => `<button class="step ${i === stepIdx ? 'on' : ''}" data-step="${i}" type="button">${kg}<span class="u">kg</span></button>`)
          .join('')}</div>`
      : `<div class="big">${weightLabel(e.weight)}</div>`
    return `
      <div class="hero">
        ${headline}
        <div class="conv mono">= ${kgToLb(selKg).toFixed(0)} lb → ${load.totalLb} lb total</div>
        <div id="bb"></div>
        <div class="pside"><span style="color:var(--dim)">Per side · lb</span>
          <span class="mono"><span class="pl bar">45 bar</span> ${platesText(load.plates)}</span></div>
      </div>`
  }
  const kg = primaryKg(e.weight)
  return `
    <div class="hero">
      <div class="big">${weightLabel(e.weight, e.perImplement)}</div>
      <div class="conv mono">${kg !== null ? '= ' + kgToLb(kg).toFixed(0) + ' lb' + (e.perImplement ? ' each' : '') : ''}</div>
    </div>`
}

export function renderSession(el: HTMLElement, n: number) {
  const s = getSession(n)
  if (!s) { el.innerHTML = '<div class="screen">Session not found · <a href="#/">back</a></div>'; return }
  let focusIdx = s.exercises.findIndex((e) => e.equipment === 'barbell')
  if (focusIdx < 0) focusIdx = 0
  let stepIdx = 0 // selected step within a progression/per-set lift

  const draw = (animate = true) => {
    const e = s.exercises[focusIdx]
    const steps = e.equipment === 'barbell' ? stepWeightsOf(e.weight) : null
    if (steps && stepIdx >= steps.length) stepIdx = 0
    const selKg = steps ? steps[stepIdx] : primaryKg(e.weight)
    // per-set schemes carry their own reps; otherwise use the exercise reps
    const reps = e.weight.kind === 'perSet' ? e.weight.steps[stepIdx].reps : e.reps

    el.innerHTML = `
      <div class="screen">
        <div class="shead">
          <a class="back" href="#/">‹ Program · ${s.dateLabel}</a>
          <button class="finish-pill ${isFinished(s.num) ? 'done' : ''}" id="finishBtn" type="button">${isFinished(s.num) ? '✓ Finished' : 'Mark finished'}</button>
        </div>
        <div class="daynav">
          <button class="daybtn" id="prevDay" type="button" aria-label="Previous day" ${getSession(s.num - 1) ? '' : 'disabled'}>‹</button>
          <span class="daylabel">Day ${s.num} / ${program.sessions.length}</span>
          <button class="daybtn" id="nextDay" type="button" aria-label="Next day" ${getSession(s.num + 1) ? '' : 'disabled'}>›</button>
        </div>
        <span class="tag">⬡ ${e.equipment} · #${e.order}</span>
        <div class="exname">${e.nameEn}</div>
        <div class="exru">${e.nameRu}</div>
        ${heroFor(e, steps, stepIdx, selKg)}
        <div class="reps">
          <div class="b"><div class="n mono">${e.sets ?? '—'}</div><div class="l">Sets</div></div>
          <div class="b"><div class="n mono">${reps || '—'}</div><div class="l">Reps</div></div>
        </div>
        <div class="note">${e.descEn}<br><span style="opacity:.7">${e.descRu}</span>
          ${e.notesEn ? `<br><br>${e.notesEn}<br><span style="opacity:.7">${e.notesRu ?? ''}</span>` : ''}</div>
        <div style="margin-top:14px" id="mini"></div>
      </div>`

    const finishBtn = el.querySelector<HTMLButtonElement>('#finishBtn')!
    finishBtn.addEventListener('click', () => {
      const done = toggleFinished(s.num)
      finishBtn.classList.toggle('done', done)
      finishBtn.textContent = done ? '✓ Finished' : 'Mark finished'
    })

    const go = (num: number) => { if (getSession(num)) location.hash = `#/session/${num}` }
    el.querySelector('#prevDay')!.addEventListener('click', () => go(s.num - 1))
    el.querySelector('#nextDay')!.addEventListener('click', () => go(s.num + 1))

    // step chips: tap to load that weight on the bar (no full-screen re-animate)
    el.querySelectorAll<HTMLButtonElement>('.step').forEach((btn) => {
      btn.addEventListener('click', () => { stepIdx = Number(btn.dataset.step); draw(false) })
    })

    const mini = el.querySelector('#mini')!
    s.exercises.forEach((x, i) => {
      if (i === focusIdx) return
      const row = document.createElement('div')
      row.className = 'exmini'
      row.innerHTML = `<div class="i">${x.order}</div>
        <div class="exmini-name"><div class="t">${x.nameEn}</div><div class="tr">${x.nameRu}</div></div>
        <div class="w">${weightLabel(x.weight, x.perImplement)}</div>`
      row.addEventListener('click', () => { focusIdx = i; stepIdx = 0; draw() })
      mini.appendChild(row)
    })

    const bb = el.querySelector<HTMLElement>('#bb')
    if (bb && e.equipment === 'barbell' && selKg !== null) mountBarbell(bb, computeBarbellLoad(selKg).plates)

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (animate && !reduce) gsap.from('.screen > *', { y: 12, opacity: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out' })
  }
  draw()
}
