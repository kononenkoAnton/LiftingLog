// A full-screen picker sheet. Resolves with the chosen exercises (multi-select),
// or [] if dismissed. Pure search/filter logic lives in lib/catalog.ts.
//
// SECURITY: catalog names are trusted static data, so innerHTML is fine here.
// The logger's user-entered notes are NOT — those must use textContent.
import { loadCatalog, searchCatalog, filterCatalog, groupAlphabetical } from '../lib/catalog'
import type { CatalogExercise } from '../data/catalog-types'
import type { Equipment } from '../data/types'

export interface PickerOptions { lang?: 'en' | 'ru'; multi?: boolean }

export function openExercisePicker(opts: PickerOptions = {}): Promise<CatalogExercise[]> {
  const lang = opts.lang ?? 'en'
  const all = loadCatalog()
  const bodyParts = [...new Set(all.map((e) => e.bodyPart))].sort()
  const equipment = [...new Set(all.map((e) => e.equipment))].sort()

  return new Promise((resolve) => {
    const picked = new Set<string>()
    let query = ''
    let fBody = ''
    let fEquip = ''

    const root = document.createElement('div')
    root.className = 'picker'
    document.body.appendChild(root)

    const close = (result: CatalogExercise[]) => { root.remove(); resolve(result) }

    const render = () => {
      let list = searchCatalog(all, query)
      list = filterCatalog(list, {
        bodyPart: fBody || undefined,
        // select values come from the catalog's own equipment set, so this cast is safe
        equipment: (fEquip || undefined) as Equipment | undefined,
      })
      const groups = groupAlphabetical(list, lang)
      const nameOf = (e: CatalogExercise) => (lang === 'ru' ? e.nameRu : e.nameEn)

      root.innerHTML = `
        <div class="picker-head">
          <button class="picker-x" id="pkX" type="button">✕</button>
          <span class="picker-title">Add exercise</span>
          <button class="picker-add" id="pkAdd" type="button">${picked.size ? `Add ${picked.size}` : 'Add'}</button>
        </div>
        <input class="picker-search" id="pkSearch" placeholder="Search…" value="${query}">
        <div class="picker-filters">
          <select id="pkBody"><option value="">Any body part</option>${bodyParts.map((b) => `<option ${b === fBody ? 'selected' : ''}>${b}</option>`).join('')}</select>
          <select id="pkEquip"><option value="">Any equipment</option>${equipment.map((q) => `<option ${q === fEquip ? 'selected' : ''}>${q}</option>`).join('')}</select>
        </div>
        <div class="picker-list" id="pkList">
          ${groups.map((g) => `
            <div class="picker-letter">${g.letter}</div>
            ${g.items.map((e) => `
              <div class="picker-row ${picked.has(e.id) ? 'on' : ''}" data-id="${e.id}">
                <div class="picker-av">${nameOf(e).charAt(0)}</div>
                <div class="picker-meta"><div class="t">${nameOf(e)}</div><div class="s">${e.bodyPart} · ${e.equipment}</div></div>
                <div class="picker-check">${picked.has(e.id) ? '✓' : ''}</div>
              </div>`).join('')}
          `).join('') || '<div class="picker-empty">No matches</div>'}
        </div>`

      root.querySelector('#pkX')!.addEventListener('click', () => close([]))
      root.querySelector('#pkAdd')!.addEventListener('click', () =>
        close(all.filter((e) => picked.has(e.id))))
      const search = root.querySelector<HTMLInputElement>('#pkSearch')!
      search.addEventListener('input', () => {
        query = search.value
        const caret = search.selectionStart ?? query.length
        render() // full re-render; restore focus + caret on the fresh input node
        const next = root.querySelector<HTMLInputElement>('#pkSearch')!
        next.focus()
        next.setSelectionRange(caret, caret)
      })
      root.querySelector<HTMLSelectElement>('#pkBody')!.addEventListener('change', (ev) => { fBody = (ev.target as HTMLSelectElement).value; render() })
      root.querySelector<HTMLSelectElement>('#pkEquip')!.addEventListener('change', (ev) => { fEquip = (ev.target as HTMLSelectElement).value; render() })
      root.querySelectorAll<HTMLElement>('.picker-row').forEach((row) => {
        row.addEventListener('click', () => {
          const id = row.dataset.id!
          if (picked.has(id)) picked.delete(id)
          else { picked.add(id); if (!opts.multi) { close(all.filter((e) => picked.has(e.id))); return } }
          render()
        })
      })
    }
    render()
  })
}
