// Silent keep-alive loop for the rest timer. iOS suspends a backgrounded page's JS
// (screen-lock), so the rest-timer setInterval stops and the gong never fires when the
// phone is pocketed. An ACTIVELY PLAYING media element keeps the page alive, so we loop
// a near-silent clip (public/silence.wav) for the duration of a rest period. Like
// sound.ts's unlockAudio, .play() must first run inside a user gesture (the set-complete
// ✓ tap). Best-effort: a blocked/killed loop just means the catch-up on return handles
// correctness. Mirrors sound.ts (side-effect-only; not unit-tested).
const SILENCE_URL = `${import.meta.env.BASE_URL}silence.wav`

let el: HTMLAudioElement | null = null

function audio(): HTMLAudioElement {
  if (!el) {
    el = new Audio(SILENCE_URL)
    el.loop = true
    el.preload = 'auto'
  }
  return el
}

/** Start the silent loop to keep the page alive during rest. Idempotent; best-effort. */
export function startKeepAlive(): void {
  const a = audio()
  void a.play().catch(() => { /* blocked — catch-up on return handles correctness */ })
}

/** Stop the silent loop. Idempotent. */
export function stopKeepAlive(): void {
  if (!el) return
  el.pause()
  try { el.currentTime = 0 } catch { /* not ready yet */ }
}
