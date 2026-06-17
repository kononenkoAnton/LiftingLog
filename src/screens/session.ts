import { getSession, program } from '../data/program'
import type { Exercise, Weight } from '../data/types'
import { computeBarbellLoad, kgToLb, roundUpToStep } from '../lib/load'
import { mountBarbell } from '../components/barbell'
import { PLATE_COLOR } from '../components/barbell-svg'
import { isFinished, getSnapshot, finish, unfinish } from '../lib/progress'
import { gsap } from 'gsap'
import { getActiveWorkout, startWorkout, getFinishedForSession } from '../lib/workouts'
import { renderLogging } from './logging'
import { trainerLog } from '../lib/logger-model'
import { toast } from '../lib/toast'

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
  if (e.equipment === 'barbell' && e.weight.kind === 'range' && selKg !== null) {
    // A range → a slider; drag to any 2.5 kg step and the bar loads live.
    const w = e.weight
    const load = computeBarbellLoad(selKg)
    return `
      <div class="hero">
        <div class="big" id="rangeVal">${selKg} kg</div>
        <div class="rangerow">
          <span class="rend">${w.minKg}</span>
          <input class="rslider" id="rangeSlider" type="range" min="${w.minKg}" max="${w.maxKg}" step="2.5" value="${selKg}" aria-label="Weight within range">
          <span class="rend">${w.maxKg}</span>
        </div>
        <div class="conv mono" id="rangeConv">= ${load.totalLb} lb total</div>
        <div id="bb"></div>
        <div class="pside"><span style="color:var(--dim)">Per side · lb</span>
          <span class="mono" id="rangePside"><span class="pl bar">45 bar</span> ${platesText(load.plates)}</span></div>
      </div>`
  }
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
        <div class="conv mono">= ${load.totalLb} lb total</div>
        <div id="bb"></div>
        <div class="pside"><span style="color:var(--dim)">Per side · lb</span>
          <span class="mono"><span class="pl bar">45 bar</span> ${platesText(load.plates)}</span></div>
      </div>`
  }
  const kg = primaryKg(e.weight)
  return `
    <div class="hero">
      <div class="big">${weightLabel(e.weight, e.perImplement)}</div>
      <div class="conv mono">${kg !== null ? '= ' + roundUpToStep(kgToLb(kg), 5) + ' lb' + (e.perImplement ? ' each' : '') : ''}</div>
    </div>`
}

export function renderSession(el: HTMLElement, n: number) {
  const s = getSession(n)
  if (!s) { el.innerHTML = '<div class="screen">Session not found · <a href="#/">back</a></div>'; return }

  // A workout active for THIS day no longer auto-enters logging — the day shows its
  // coach schedule with a "Resume workout" button, so the logger's back link can
  // land here (one level up) instead of the program root.
  const active = getActiveWorkout()
  const activeThisDay = active && active.sessionNum === n ? active : null
  const otherActive = active && active.sessionNum !== n ? active : null

  let focusIdx = s.exercises.findIndex((e) => e.equipment === 'barbell')
  if (focusIdx < 0) focusIdx = 0
  let stepIdx = 0 // selected step within a progression/per-set lift

  const draw = (animate = true) => {
    const logged = getFinishedForSession(s.num)
    // Finished days render their locked snapshot; unfinished show the latest parse.
    const snap = isFinished(s.num) ? getSnapshot(s.num) : null
    const exercises = snap ?? s.exercises
    const changed = !!snap && JSON.stringify(snap) !== JSON.stringify(s.exercises)
    const e = exercises[focusIdx]
    const steps = e.equipment === 'barbell' ? stepWeightsOf(e.weight) : null
    if (steps && stepIdx >= steps.length) stepIdx = 0
    // range lifts default to the lighter end (the slider takes it from there)
    const selKg = e.equipment === 'barbell' && e.weight.kind === 'range'
      ? e.weight.minKg
      : steps ? steps[stepIdx] : primaryKg(e.weight)
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
        ${changed ? '<div class="changed-badge">⟳ Trainer updated this day after you finished it</div>' : ''}
        ${heroFor(e, steps, stepIdx, selKg)}
        <div class="reps">
          <div class="b"><div class="n mono">${e.sets ?? '—'}</div><div class="l">Sets</div></div>
          <div class="b"><div class="n mono">${reps || '—'}</div><div class="l">Reps</div></div>
        </div>
        <div class="note">${e.descEn}<br><span style="opacity:.7">${e.descRu}</span>
          ${e.notesEn ? `<br><br>${e.notesEn}<br><span style="opacity:.7">${e.notesRu ?? ''}</span>` : ''}</div>
        <div style="margin-top:14px" id="mini"></div>
        ${activeThisDay
          ? `<button class="lg-start" id="resumeBtn" type="button">▶ Resume workout</button>`
          : otherActive
            ? `<a class="lg-start resume" href="#/session/${otherActive.sessionNum}">Resume active workout · Day ${otherActive.sessionNum} ›</a>`
            : logged
              ? `<button class="lg-start" id="editBtn" type="button">✎ Edit workout</button>`
              : `<button class="lg-start" id="startBtn" type="button">▶ Start Session</button>`}
        ${logged ? `<button class="trainer-btn" id="trainerBtn" type="button">📋 Copy for trainer</button>` : ''}
      </div>`

    const finishBtn = el.querySelector<HTMLButtonElement>('#finishBtn')!
    finishBtn.addEventListener('click', async () => {
      if (isFinished(s.num)) await unfinish(s.num)
      else await finish(s.num, s.exercises) // snapshot the canonical content now
      draw(false)
    })

    const startBtn = el.querySelector<HTMLButtonElement>('#startBtn')
    if (startBtn) startBtn.addEventListener('click', () => { startWorkout(s); renderLogging(el, n, () => renderSession(el, n)) })

    const resumeBtn = el.querySelector<HTMLButtonElement>('#resumeBtn')
    if (resumeBtn) resumeBtn.addEventListener('click', () => renderLogging(el, n, () => renderSession(el, n)))

    const editBtn = el.querySelector<HTMLButtonElement>('#editBtn')
    if (editBtn && logged) editBtn.addEventListener('click', () => renderLogging(el, n, () => renderSession(el, n), logged))

    const trainerBtn = el.querySelector<HTMLButtonElement>('#trainerBtn')
    if (trainerBtn && logged) trainerBtn.addEventListener('click', async () => {
      const text = trainerLog(logged)
      try { await navigator.clipboard.writeText(text); toast('Copied for trainer ✓', 'info') }
      catch { toast(text, 'info') }
    })

    const go = (num: number) => { if (getSession(num)) location.hash = `#/session/${num}` }
    el.querySelector('#prevDay')!.addEventListener('click', () => go(s.num - 1))
    el.querySelector('#nextDay')!.addEventListener('click', () => go(s.num + 1))

    // step chips: tap to load that weight on the bar (no full-screen re-animate)
    el.querySelectorAll<HTMLButtonElement>('.step').forEach((btn) => {
      btn.addEventListener('click', () => { stepIdx = Number(btn.dataset.step); draw(false) })
    })

    // range slider: live-update the bar/conversion/plates without re-rendering
    const slider = el.querySelector<HTMLInputElement>('#rangeSlider')
    if (slider) {
      slider.addEventListener('input', () => {
        const val = Number(slider.value)
        const load = computeBarbellLoad(val)
        el.querySelector('#rangeVal')!.textContent = `${val} kg`
        el.querySelector('#rangeConv')!.textContent = `= ${load.totalLb} lb total`
        el.querySelector('#rangePside')!.innerHTML = `<span class="pl bar">45 bar</span> ${platesText(load.plates)}`
        const bbEl = el.querySelector<HTMLElement>('#bb')
        if (bbEl) mountBarbell(bbEl, load.plates)
      })
    }

    const mini = el.querySelector('#mini')!
    exercises.forEach((x, i) => {
      if (i === focusIdx) return
      const row = document.createElement('div')
      row.className = 'exmini'
      // per-side plate breakdown for barbell lifts, so loading is visible without
      // opening each exercise (uses the top/working weight)
      const miniKg = x.equipment === 'barbell' ? primaryKg(x.weight) : null
      const miniPlates = miniKg !== null
        ? `<div class="exmini-pl">${platesText(computeBarbellLoad(miniKg).plates)}<span class="exmini-side">/ side · lb</span></div>`
        : ''
      row.innerHTML = `<div class="i">${x.order}</div>
        <div class="exmini-name"><div class="t">${x.nameEn}</div><div class="tr">${x.nameRu}</div>${miniPlates}</div>
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
