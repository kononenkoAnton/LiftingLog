import { getSession } from '../data/program'
import type { Exercise, Weight } from '../data/types'
import { computeBarbellLoad, kgToLb } from '../lib/load'
import { mountBarbell } from '../components/barbell'
import { PLATE_COLOR } from '../components/barbell-svg'
import { gsap } from 'gsap'

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

function heroFor(e: Exercise): string {
  const kg = primaryKg(e.weight)
  if (e.equipment === 'barbell' && kg !== null) {
    const load = computeBarbellLoad(kg)
    return `
      <div class="hero">
        <div class="big">${weightLabel(e.weight)}</div>
        <div class="conv mono">= ${kgToLb(kg).toFixed(0)} lb → ${load.totalLb} lb total</div>
        <div id="bb"></div>
        <div class="pside"><span style="color:var(--dim)">Per side · lb</span>
          <span class="mono"><span class="pl bar">45 bar</span> ${platesText(load.plates)}</span></div>
      </div>`
  }
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

  const draw = () => {
    const e = s.exercises[focusIdx]
    el.innerHTML = `
      <div class="screen">
        <a class="back" href="#/">‹ Program · ${s.dateLabel}</a>
        <span class="tag">⬡ ${e.equipment} · #${e.order}</span>
        <div class="exname">${e.nameEn}</div>
        <div class="exru">${e.nameRu}</div>
        ${heroFor(e)}
        <div class="reps">
          <div class="b"><div class="n mono">${e.sets ?? '—'}</div><div class="l">Sets</div></div>
          <div class="b"><div class="n mono">${e.reps}</div><div class="l">Reps</div></div>
        </div>
        <div class="note">${e.descEn}<br><span style="opacity:.7">${e.descRu}</span>
          ${e.notesEn ? `<br><br>${e.notesEn}<br><span style="opacity:.7">${e.notesRu ?? ''}</span>` : ''}</div>
        <div style="margin-top:14px" id="mini"></div>
      </div>`

    const mini = el.querySelector('#mini')!
    s.exercises.forEach((x, i) => {
      if (i === focusIdx) return
      const row = document.createElement('div')
      row.className = 'exmini'
      row.innerHTML = `<div class="i">${x.order}</div><div class="t">${x.nameEn}</div>
        <div class="w">${weightLabel(x.weight, x.perImplement)}</div>`
      row.addEventListener('click', () => { focusIdx = i; draw() })
      mini.appendChild(row)
    })

    const bb = el.querySelector<HTMLElement>('#bb')
    if (bb && e.equipment === 'barbell') {
      const kg = primaryKg(e.weight)
      if (kg !== null) mountBarbell(bb, computeBarbellLoad(kg).plates)
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce) gsap.from('.screen > *', { y: 12, opacity: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out' })
  }
  draw()
}
