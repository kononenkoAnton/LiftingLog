// Tiny on-screen toast so failures (esp. sync) are visible without the console.
export function toast(message: string, kind: 'error' | 'info' = 'info') {
  const t = document.createElement('div')
  t.className = `toast ${kind}`
  t.textContent = message
  document.body.appendChild(t)
  requestAnimationFrame(() => t.classList.add('show'))
  setTimeout(() => {
    t.classList.remove('show')
    setTimeout(() => t.remove(), 300)
  }, kind === 'error' ? 7000 : 2500)
}

/**
 * A brief, centered, non-blocking notice that the rest timer finished. Fades + scales
 * in, holds, then animates out (~1.6s). pointer-events are off (CSS) so logging stays
 * tappable underneath. De-dupes: a second call replaces any visible one.
 */
export function restCompleteToast(message = '🔔 Rest complete') {
  document.querySelector('.toast-center')?.remove()
  const t = document.createElement('div')
  t.className = 'toast-center'
  t.textContent = message
  document.body.appendChild(t)
  requestAnimationFrame(() => t.classList.add('show'))
  setTimeout(() => {
    t.classList.remove('show')
    setTimeout(() => t.remove(), 350)
  }, 1600)
}
