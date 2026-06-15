import { openExercisePicker } from '../components/exercise-picker'

export function renderExercises(el: HTMLElement) {
  el.innerHTML = `
    <div class="screen">
      <a class="back" href="#/">‹ Program</a>
      <h1 style="font-size:22px;font-weight:800;margin:8px 0 14px">Exercise catalog</h1>
      <button class="finish-pill" id="openPicker" type="button">Open picker</button>
      <div id="pickResult" class="note" style="margin-top:16px"></div>
    </div>`
  el.querySelector('#openPicker')!.addEventListener('click', async () => {
    const chosen = await openExercisePicker({ lang: 'en', multi: true })
    const out = el.querySelector('#pickResult')!
    out.textContent = chosen.length ? chosen.map((e) => `${e.nameEn} / ${e.nameRu}`).join('\n') : 'Nothing picked'
  })
}
