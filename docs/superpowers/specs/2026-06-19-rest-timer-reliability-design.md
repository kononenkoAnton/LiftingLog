# Rest-timer reliability when locked/backgrounded — design

**Date:** 2026-06-19 · **Effort:** S–M · **Branch:** `feat/rest-timer-reliability` (off `main`).

## Problem

The rest timer drives its countdown with `setInterval` and plays the gong
(`playRestDone()`) + `navigator.vibrate` when `remain <= 0` (`src/screens/logging.ts`).
Mobile browsers throttle/suspend timers in backgrounded tabs, and **iOS Safari
suspends the page's JS entirely on screen-lock** — so when the lifter pockets the
phone to rest, the interval never reaches 0 and the gong never fires. The cue is
useless in exactly the situation it exists for.

## Goal

Make the end-of-rest cue fire **on schedule even while the screen is locked**, with
**no backend**, and degrade gracefully when the OS defeats us.

Decided behavior (from brainstorming):
1. **Primary — silent audio keep-alive** holds the page alive so the existing timer
   fires the gong on time. Best-effort (proven web-timer technique).
2. **Safety net — catch-up on return**: if the keep-alive was killed (OS low-power,
   mute switch), recompute from wall-clock on refocus and fire the (late) cue +
   correct the display.

## Approach (chosen: silent looping `<audio>`)

An actively-playing media element keeps iOS from suspending the page. We start a
near-silent looping clip inside the set-complete tap (the gesture iOS requires to
begin audio — we already call `unlockAudio()` there) and stop it when rest ends.
While it plays, the existing rest `setInterval` keeps ticking → `playRestDone()`
fires at 0. Rejected alternatives: Web Audio oscillator (iOS suspends
`AudioContext` aggressively in background — worse fit); Web Push (needs a
backend/push server the app deliberately avoids).

## Architecture

### New module — `src/lib/keepalive.ts` (side-effect-only, mirrors `sound.ts`)

```ts
export function startKeepAlive(): void  // idempotent; .play() the looping clip (best-effort, catches rejection)
export function stopKeepAlive(): void   // idempotent; pause + reset
```

- Module-scoped detached `HTMLAudioElement` for `public/silence.mp3`, `loop = true`.
  Detached (not in `el`) so it survives `draw()`'s `innerHTML` rebuilds and plays
  continuously from ✓ until rest ends.
- `.volume` is ignored on iOS, so silence lives in the **asset**, not in JS.

### Audio asset — `public/silence.mp3` + `scripts/make-silence.mjs`

License-clean generated clip (same synthesis pattern as `scripts/make-gong.mjs`),
~1 s loop. Start as **true digital silence**; if real-device testing shows iOS still
suspends, switch the script to a **−60 dBFS tone** (inaudible but non-zero signal).
Confirm `vite.config.ts` `workbox.globPatterns` precaches `*.mp3` (gong is already
shipped that way) so it works offline.

### `src/screens/logging.ts` — lifecycle wiring (small refactors to centralize teardown)

- **`endRest()`** = `rest = null; stopKeepAlive()`. Replace every scattered
  `rest = null` (Skip, pause, un-check the rest's set, delete set/exercise, swap)
  with it. Add `stopKeepAlive()` into `clearAll()` (covers Back/Finish/Cancel and the
  `current() === null` bail).
- **`startKeepAlive()`** in the ✓ handler where `rest` is armed (logging mode only;
  `edit` mode has no timer — the existing `!edit` guard gates this).
- **`fireRestDone()`** — extract the interval's `remain <= 0` block (gong + vibrate +
  `restCompleteToast` + `endRest` + blur active input + `draw`) so the interval *and*
  the catch-up share one completion path.

### Catch-up on return (safety net)

A single `visibilitychange` listener registered **once per `renderLogging`** (not per
`draw`, to avoid duplicates), removed on exit via a `teardown()` wrapper that does
`document.removeEventListener(...) + clearAll()` and is called wherever
`clearAll(); onExit()` is today (Back, Finish, Cancel, Done, the `!w` bail). On
becoming visible with an active rest:
- `Date.now() >= rest.endMs` → `fireRestDone()` (late gong, correct state).
- else → refresh the displayed remaining time (covers a throttled interval while
  hidden).

The timer is already wall-clock (`rest.endMs`), so remaining time is always correct
on return regardless of throttling.

### Pure helper (for the one testable bit)

```ts
// src/lib/logger-model.ts — the pure, unit-tested home (keepalive.ts holds the audio side-effects)
export function isRestElapsed(endMs: number, nowMs: number): boolean // nowMs >= endMs
```

Used by the catch-up condition so it's unit-testable without DOM/audio.

## Error handling & known limits (document, don't fight)

- Every `play()` is best-effort and caught — no throws, no regression to the gong.
- Hard platform limits, noted in docs not solved: iOS **physical mute switch**
  silences all web audio (gong won't sound — catch-up still corrects state on
  return); **iOS has no Vibration API**; iOS **low-power mode** can still suspend. The
  keep-alive provides best-effort *liveness*; the catch-up guarantees *correctness*.

## Testing

- Pure model untouched → all **140 existing tests stay green**.
- `keepalive.ts` is side-effect-only (like `sound.ts`, not unit-tested). Add a unit
  test for `isRestElapsed` (elapsed / not-yet / exact boundary).
- **Manual device test plan (where the real risk lives):** on a real iPhone — (1)
  start a rest, lock the screen, confirm the gong fires at ~0; (2) force the
  keep-alive to die (long background / low-power), return to the app, confirm the
  catch-up fires the late cue and the display is correct.

## Docs to keep in sync

- `CLAUDE.md`: add `src/lib/keepalive.ts` + `scripts/make-silence.mjs` to **Key
  files**; update the rest-timer line in **Conventions** (keep-alive + catch-up +
  mute-switch caveat).
- `README.md`: a line under PWA about background timer behavior + limits.
- No parser/catalog/load-math change → no `update-program`/catalog skill updates.

## Out of scope

Web Push / true OS notifications (needs a backend); Screen Wake Lock (user pockets
the phone — wants the screen *off*); keeping the keep-alive running for the whole
session (battery, no benefit — the elapsed clock already self-corrects from
wall-clock); fixing the iOS mute-switch / no-vibration limits (platform).
