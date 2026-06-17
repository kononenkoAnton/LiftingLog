# Home-screen kg/lb unit toggle — design (2026-06-17)

> Follow-up to the estimated-1RM chips (`2026-06-17-e1rm-chips-design.md`). Stacked
> on branch `feat/e1rm-chips` (PR #4). Adds a visible kg/lb toggle to the home
> screen so the Max and ~1RM chips can be read in either unit.

## Problem

The home-screen chips (Max + the new ~1RM row) are **kg-only**. A kg/lb toggle
already exists on the **History** screen (`liftinglog:unit`, defaults to kg), but
the home screen doesn't read it. This is a US user whose gym racks lb plates, so
seeing lb on the headline stats is useful.

We deliberately reject "tap the chip to toggle": no affordance (a stat chip doesn't
look tappable), scope ambiguity (one chip vs all), and risk of Home/History
disagreeing. Instead we reuse History's explicit, discoverable control.

## Decisions (locked in brainstorming)

1. **Reuse History's `kg|lb` segmented toggle** (`.unit-toggle` / `.ut` styles) on
   the home screen, in the hero-actions row next to `History` / `EN·RU`.
2. **Shared state.** Extract `getUnit` / `setUnit` / `UNIT_KEY` from `history.ts`
   into `src/lib/unit.ts` so Home and History read/write the same `liftinglog:unit`
   key and always agree. History keeps identical behavior.
3. **Both chip rows convert** (Max + ~1RM) to the selected unit. Toggling persists
   and repaints the chips in place (no full re-render — preserves the row entry
   animation).
4. **Round once from the precise value.** ~1RM is computed in lb then rounded to kg;
   converting that rounded kg back to lb would double-round (~1 lb off). So
   `e1rm.ts` keeps the precise full-lb internally and exposes both `bestE1rmKg`
   (unchanged) and `bestE1rmLb`.
5. **Accepted trade-off:** in lb the **Max** chips show a *conversion* of the
   coach's kg (155 kg → 342 lb), no longer the literal coach number. Consistent with
   how History already converts everything.

## Components

### New: `src/lib/unit.ts`

```ts
import type { Unit } from './logger-model'           // 'kg' | 'lb'

export const UNIT_KEY = 'liftinglog:unit'
export const getUnit = (): Unit => { /* localStorage read, defaults to 'kg' */ }
export const setUnit = (u: Unit): void => { /* localStorage write, swallow errors */ }
```

### Changed: `src/screens/history.ts`

Remove the local `UNIT_KEY` / `getUnit` / `setUnit` (lines 12–14); import them from
`../lib/unit`. No behavior change.

### Changed: `src/lib/e1rm.ts`

Refactor the aggregation so the per-set max full-lb is computed once (internal
helper), with two exported rounders:
- `bestE1rmKg(history, match)` — `round(maxFullLb / KG_TO_LB)` (unchanged result).
- `bestE1rmLb(history, match)` — `round(maxFullLb)`.
Both return `null` when no qualifying set.

### Changed: `src/screens/list.ts`

- Import `getUnit`, `setUnit` from `../lib/unit`, `bestE1rmLb` from `../lib/e1rm`,
  and `kgToLb` (or use `KG_TO_LB`) from `../lib/load`.
- Replace the inline chip expressions with unit-aware helpers:
  - `maxChip(match, unit)` → `<n><span class="u">unit</span>`, converting `maxKgFor`
    to lb when `unit === 'lb'`.
  - `e1rmChip(match, unit)` → `~<n><span class="u">unit</span>` or `—`, using
    `bestE1rmKg` / `bestE1rmLb` per unit.
- Add the `kg|lb` toggle markup to `hero-actions`. Give the two `.stats2` rows ids
  (`maxRow`, `e1rmRow`) so a `paintChips(unit)` helper can rewrite each `.n2`'s
  innerHTML in place. Wire `.ut` clicks: ignore same-unit, else `setUnit`, toggle
  `.on` classes, `paintChips`.

### Styling

No new CSS — reuse existing `.unit-toggle` / `.ut` / `.ut.on` and `.hero-actions`.
`.hero-h` uses `justify-content:space-between` with an ellipsis-truncating title, so
the extra control degrades gracefully at 390px.

## Testing

- `e1rm.test.ts`: add `bestE1rmLb` cases — null on empty; a known set's full lb
  (e.g. `1×135` → `(135+45)×(1+1/30)=186` lb); confirms it does NOT double-round
  (matches `round(maxFullLb)`, not `round(kgToLb(bestE1rmKg))`).
- Full suite stays green; `bestE1rmKg` results unchanged.

## Verification

In a real browser at ~390px: toggle flips both rows kg↔lb; the setting persists and
matches History (set lb on Home → History opens in lb and vice-versa); the header
does not overflow / the title is not clipped; zero console errors.

## Out of scope

- Configurable kg bar / kg plate inventory (Tier B #7) — this is display conversion
  only, the conversion already exists.
- Any change to the History screen's behavior beyond the import refactor.
