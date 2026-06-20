// Bodyweight screen (#/bodyweight): log today's bodyweight, view the trend as a
// sparkline, edit/delete past entries. Reads/writes the bodyweight seam. Rendered
// values are numbers/derived dates (no free-text), so innerHTML is safe (like
// progress.ts); inputs are wired via listeners. Editable inputs use .lg-inp (16px,
// iOS-zoom-safe).
import { listBodyweight, getBodyweight, logBodyweight, deleteBodyweight, todayLocalIso } from '../lib/bodyweight'
import { parseWeightInput, formatWeight } from '../lib/bodyweight-model'
import { sparklineSvg } from '../components/sparkline-svg'
import { getUnit, setUnit } from '../lib/unit'
import { toast } from '../lib/toast'
import type { Unit } from '../lib/logger-model'

const BW_COLOR = '#2ea043' // green accent (distinct from the lift colors)

const dateLabel = (day: string) =>
  new Date(day + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function renderBodyweight(el: HTMLElement) {
  let unit = getUnit()
  let editingDay: string | null = null

  const rowHtml = (day: string, kg: number) => {
    if (day === editingDay) {
      return `
        <div class="bw-row editing" data-day="${day}">
          <span class="bw-date">${dateLabel(day)}</span>
          <input class="lg-inp bw-row-inp" type="number" inputmode="decimal" step="0.1" min="0"
                 value="${formatWeight(kg, unit)}" aria-label="Edit ${dateLabel(day)}">
          <span class="bw-unit">${unit}</span>
          <button class="bw-save" data-day="${day}" type="button">Save</button>
          <button class="bw-cancel" type="button">Cancel</button>
        </div>`
    }
    return `
      <div class="bw-row" data-day="${day}">
        <span class="bw-date">${dateLabel(day)}</span>
        <span class="bw-weight mono">${formatWeight(kg, unit)} ${unit}</span>
        <button class="bw-edit" data-day="${day}" type="button" aria-label="Edit">✎</button>
        <button class="bw-del" data-day="${day}" type="button" aria-label="Delete">✕</button>
      </div>`
  }

  const showErr = (msg: string) => {
    const e = el.querySelector('#bwErr') as HTMLElement
    e.textContent = msg
    e.hidden = false
  }

  const draw = () => {
    const entries = listBodyweight()       // oldest → newest
    const rows = [...entries].reverse()     // newest first for the list
    const todayKg = getBodyweight(todayLocalIso())
    const prefill = todayKg !== null ? formatWeight(todayKg, unit) : ''

    el.innerHTML = `
      <div class="screen">
        <a class="back" href="#/">‹ Program</a>
        <div class="hist-top">
          <h1 class="hist-h">Bodyweight</h1>
          <div class="unit-toggle" role="group" aria-label="Weight unit">
            <button class="ut ${unit === 'kg' ? 'on' : ''}" data-unit="kg" type="button">kg</button>
            <button class="ut ${unit === 'lb' ? 'on' : ''}" data-unit="lb" type="button">lb</button>
          </div>
        </div>

        <div class="bw-add">
          <input class="lg-inp bw-inp" id="bwInput" type="number" inputmode="decimal" step="0.1" min="0"
                 placeholder="0.0" value="${prefill}" aria-label="Today's bodyweight">
          <span class="bw-unit">${unit}</span>
          <button class="bw-log" id="bwLog" type="button">${todayKg !== null ? 'Update today' : 'Log today'}</button>
        </div>
        <div class="bw-err" id="bwErr" hidden></div>

        ${entries.length
          ? `<div class="prog-chart">${sparklineSvg(entries.map((e) => e.weightKg), { color: BW_COLOR })}</div>`
          : '<div class="note">No entries yet. Log your bodyweight above.</div>'}

        <div class="bw-list">${rows.map((e) => rowHtml(e.day, e.weightKg)).join('')}</div>
      </div>`

    // Unit toggle
    el.querySelectorAll<HTMLButtonElement>('.ut').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.dataset.unit as Unit
        if (u === unit) return
        unit = u; setUnit(u); draw()
      })
    })

    // Quick-add (today)
    const logToday = async () => {
      const input = el.querySelector('#bwInput') as HTMLInputElement
      const kg = parseWeightInput(input.value, unit)
      if (kg === null) { showErr('Enter a valid weight'); return }
      await logBodyweight(todayLocalIso(), kg)
      toast('Saved ✓')
      draw()
    }
    el.querySelector('#bwLog')!.addEventListener('click', () => void logToday())
    el.querySelector('#bwInput')!.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void logToday()
    })

    // Row edit / save / cancel / delete
    el.querySelectorAll<HTMLButtonElement>('.bw-edit').forEach((b) =>
      b.addEventListener('click', () => { editingDay = b.dataset.day!; draw() }))
    el.querySelectorAll<HTMLButtonElement>('.bw-cancel').forEach((b) =>
      b.addEventListener('click', () => { editingDay = null; draw() }))
    el.querySelectorAll<HTMLButtonElement>('.bw-save').forEach((b) =>
      b.addEventListener('click', () => void (async () => {
        const day = b.dataset.day!
        const input = el.querySelector('.bw-row.editing .bw-row-inp') as HTMLInputElement
        const kg = parseWeightInput(input.value, unit)
        if (kg === null) { showErr('Enter a valid weight'); return }
        await logBodyweight(day, kg)
        editingDay = null; draw()
      })()))
    el.querySelectorAll<HTMLButtonElement>('.bw-del').forEach((b) =>
      b.addEventListener('click', () => void (async () => {
        const day = b.dataset.day!
        if (!confirm(`Delete bodyweight for ${dateLabel(day)}?`)) return
        await deleteBodyweight(day)
        if (editingDay === day) editingDay = null
        draw()
      })()))
  }

  draw()
}
