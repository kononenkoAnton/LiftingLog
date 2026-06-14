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
