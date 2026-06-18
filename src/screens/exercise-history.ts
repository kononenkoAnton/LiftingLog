// Per-exercise history: every done set for one exercise (matched by exact
// exerciseRef) over time, newest first. Reached by tapping an exercise name in
// History. Exercise names are trusted, but built with createElement + textContent
// to match History's safe DOM construction (no innerHTML for dynamic text).
import { listWorkouts } from '../lib/workouts'
import { allSetsForRef, setWeightDisplay, type Unit, type ExerciseOccurrence } from '../lib/logger-model'
import { getUnit, setUnit } from '../lib/unit'

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export function renderExerciseHistory(el: HTMLElement, ref: string) {
  let unit = getUnit()

  const card = (o: ExerciseOccurrence): HTMLElement => {
    const root = document.createElement('div')
    root.className = 'exh-card'
    const head = document.createElement('div')
    head.className = 'exh-date'
    head.textContent = dateLabel(o.dateIso)
    root.appendChild(head)
    for (const s of o.sets) {
      const row = document.createElement('div')
      row.className = 'hist-set'
      const repStr = s.reps === null ? '–' : `${s.reps}${o.isTimed ? 's' : ''}`
      row.textContent = `${setWeightDisplay(s.weightLb, o.equipment, unit)} × ${repStr}`
      root.appendChild(row)
    }
    return root
  }

  const draw = () => {
    const occ = allSetsForRef(listWorkouts(), ref)
    const hasData = occ.length > 0
    const sessions = occ.length

    el.innerHTML = `
      <div class="screen">
        <a class="back" href="#/history">‹ History</a>
        <div class="hist-top">
          <div><h1 class="hist-h" id="exTitle"></h1><div class="ex-sub" id="exSub"></div></div>
          ${hasData ? `<div class="unit-toggle" role="group" aria-label="Weight unit">
            <button class="ut ${unit === 'kg' ? 'on' : ''}" data-unit="kg" type="button">kg</button>
            <button class="ut ${unit === 'lb' ? 'on' : ''}" data-unit="lb" type="button">lb</button>
          </div>` : ''}
        </div>
        ${hasData ? '<div id="exList"></div>' : '<div class="note">No logged sets yet.</div>'}
      </div>`

    el.querySelector('#exTitle')!.textContent = occ[0]?.nameEn ?? 'Exercise'
    const sub = el.querySelector('#exSub') as HTMLElement
    const subParts = []
    if (hasData && occ[0].nameRu && occ[0].nameRu !== occ[0].nameEn) subParts.push(occ[0].nameRu)
    if (hasData) subParts.push(`${sessions} session${sessions === 1 ? '' : 's'}`)
    if (subParts.length) sub.textContent = subParts.join(' · ')
    else sub.remove()

    el.querySelectorAll<HTMLButtonElement>('.ut').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.dataset.unit as Unit
        if (u === unit) return
        unit = u; setUnit(u); draw()
      })
    })

    const list = el.querySelector('#exList')
    if (list) occ.forEach((o) => list.appendChild(card(o)))
  }

  draw()
}
