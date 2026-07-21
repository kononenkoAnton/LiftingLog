# LiftingLog — Design Brief (Full Visual Redesign)

> A self-contained brief for a designer doing a **full visual redesign** of LiftingLog.
> Motion and layout are open to reinvention; **functionality, flows, and data rules are
> frozen.** You should be able to design from this document alone, but
> [`SPEC.md`](./SPEC.md) is the authoritative source for exact functional behavior — read
> it when a rule's detail matters (e.g. how barbell weight is displayed).
>
> **Companion docs:** [`SPEC.md`](./SPEC.md) = what the app does (functional spec).
> This file = what it should look/feel like and the constraints a redesign must respect.

---

## 0. The one-paragraph product

LiftingLog is a **mobile-first PWA** used by **one lifter, on the gym floor**, to (a)
read their coach's prescribed workout for the day and (b) **log the sets they actually
do** against it — then review history and strength trends. It is **bilingual (English
primary / Russian secondary)**, converts the coach's kilograms to pounds, and shows
**exact barbell plate loading**. It works offline and installs to the home screen.

**Design north star:** *glanceable and thumb-operable mid-set, with sweaty hands, often
one-handed, sometimes with the phone about to lock.* Clarity and tap-size beat density
and decoration.

---

## 1. Redesign contract — frozen vs. free

| ❄️ FROZEN — must survive the redesign | 🎨 FREE — redesign at will |
|---|---|
| All screens & routes (see SPEC §2, §4) | Color palette & overall visual language |
| Every user flow (start→log→finish→history; skip; edit; swap) | Typography (typefaces, scale, weights) |
| All screen **states** (§8 below) incl. locked ✓, "trainer updated" badge, disabled cross-day start, skipped badge | Layout, spacing, grid, composition |
| Domain display rules (coach **total** vs logged **plates**; "each"; "w/ bar"; BW; timed `s`) | Iconography (currently raw Unicode glyphs — please replace) |
| The two **persistent fixed bars** (rest timer; active-workout) existing | Motion / transitions / micro-interactions |
| All **copy meaning** (you may reword; keep EN+RU and the meaning) | Component shapes (cards, chips, buttons, pills) |
| **Hard constraints** in §3 (iOS/PWA/offline/touch) | Empty/loading illustrations & states styling |

If a redesign would remove or merge a state or flow, that's a **functionality change** —
flag it, don't assume it.

---

## 2. Users & context

- **One user per account** (the lifter). A separate person (the coach) only *reads* an
  exported text log — never uses the app.
- **Environment:** gym, phone in hand between sets, bright or dim, possibly gloved/chalked
  hands, frequent screen-locks. Rest timer must be **readable at a glance** and its
  controls **big**.
- **Tone:** focused, confident, "training tool," not playful/gamified. Think a quality
  stopwatch or a pro audio app, not a consumer streak-app.

---

## 3. Hard constraints (non-negotiable, even in a redesign)

These come from the platform and the use-case, not from the current visuals:

1. **Mobile-first, single column.** Design at **~390 px**; content is capped at **480 px**
   wide and centered (it must not sprawl on tablets/desktop). No horizontal scroll, ever.
2. **Editable fields must render at `font-size ≥ 16px`.** iOS Safari auto-zooms a focused
   smaller input and the layout then traps the zoom off-screen. Applies to every text
   input/textarea (weight, reps, search, coach message, login). (`<select>` is exempt.)
3. **Safe-area insets.** Respect `env(safe-area-inset-*)` top and bottom (notch / home
   indicator). Fixed bottom bars must clear the home indicator.
4. **Two fixed bottom bars exist** and content must never hide behind them:
   - **Rest-timer bar** (only while resting) — timer + −15/+15/Skip.
   - **Active-workout bar** (while a workout is active, off the logger) — "Resume · Day N" + clock.
5. **Offline / PWA.** App shell loads offline; design must not assume network for chrome.
   It's installable (home-screen icon, splash) — icon/splash art is in scope.
6. **Touch targets:** aim for **≥ 44×44 px** on every interactive control. ⚠️ The current
   build uses many smaller controls (24–38 px) — treat enlarging them as a redesign goal,
   not a pattern to copy.
7. **Bilingual everywhere:** English primary, Russian as a secondary line (or toggle if you
   redesign that). Russian text uses Cyrillic — leave room (often longer than EN). The
   coach export is **Russian-only**.
8. **Reduced motion:** all motion must have a `prefers-reduced-motion` off-state.
9. **kg/lb is a user toggle** shown on several screens; both unit strings must fit.

---

## 4. Current visual system (baseline — replace freely, but here's what exists)

The current theme is a dark "Reactor" look. Treat it as a **starting reference**, not a
spec. Tokens live in `src/styles/theme.css` + `app.css`.

### 4.1 Color tokens
| Token | Value | Role |
|---|---|---|
| `--bg` | `#070b14` | App background (near-black navy) |
| `--bg2` | `#0b1220` | Slightly raised panel |
| `--ink` | `#dbe6f0` | Primary text |
| `--dim` | `#7d8ba0` | Secondary / muted text & labels |
| `--mint` | `#27e6b4` | **Primary accent** — actions, success, "live" |
| `--blue` | `#5ea8ff` | **Secondary accent** — exercise names, info buttons |
| `--card` | `rgba(255,255,255,.04)` | Card fill |
| `--line` | `rgba(255,255,255,.08)` | Borders / dividers |
| `--radius` | `16px` | Base corner radius |

Background is `--bg` under two soft radial gradients (mint top-right, blue bottom-left).
Primary CTA = mint gradient (`160deg, #27e6b4 → #159c79`) with near-black text `#04210f`.

### 4.2 Semantic colors (meaning-bearing — keep the *mapping*, restyle the hues)
| Meaning | Current |
|---|---|
| **Squat** | red `#e23b3b` |
| **Bench** | blue `#3b74e6` |
| **Deadlift** | gold `#e3b341` |
| **Accessory** | grey `#8c9bb0` |
| Destructive (delete/cancel) | red text `#ff7a7a`/`#ff9a9a` on `rgba(226,59,59,.12)` |
| Warning ("trainer updated") | gold `#e3b341` on tint |
| Success / live / rest | mint `--mint` |

**Barbell plate colors** (the colored plate pills + the SVG) — a deliberate, distinct hue
per plate so loading is countable at a glance:
`45 = #e23b3b (red) · 35 = #3b74e6 (blue) · 25 = #e6c52e (yellow) · 10 = #32d46e (green) · 5 = #e6852e (orange) · 2.5 = #a06bf0 (purple)`.
(2.5 lb is defined but unused — no microplates in the program.)

### 4.3 Typography
- **Sans:** Inter (UI). **Mono:** JetBrains Mono (numbers, timers, dates, plate chips).
- Numbers being in mono is intentional — weights/timers/plate counts read as data.
- Current scale (px / weight): hero number **40/800**; H1 **26/800**; step chips **24/800
  mono**; section numbers **18–20/800**; exercise name **16–20/800**; body **12–14**;
  labels **10–12**; micro all-caps tracked labels **8–10**. Letter-spacing: tight (−.02em)
  on big headings, wide (.08–.18em) + uppercase on micro labels.

### 4.4 Spacing, shape, elevation
- Screen padding ~18px; element gaps 8–12px.
- Radii: cards 12–14px, hero/login 18px, inputs 8–11px, pills/chips 5–20px (fully round
  for tags/toggles).
- Mostly **flat** (borders + faint translucent fills, not shadows). Exceptions: the
  rest bar uses **backdrop blur**; the post-finish celebration toast uses a big soft
  shadow `0 12px 44px rgba(0,0,0,.5)`.

### 4.5 Iconography
Currently **raw Unicode/emoji glyphs** (▶ ⏸ ✓ ✕ − ‹ › ⬡ ⟳ 📋 🗑 ✎ ⎋ ⇄). This is a known
weakness — **designing a proper icon set is in scope.**

### 4.6 Layering (z-index)
Picker sheet (60) > rest bar (40) > active bar (fixed bottom) > content. Toast/celebration
float on top.

---

## 5. Information architecture

Single-page app, hash routes, no nav bar — navigation is via the Home hub + back links +
the two fixed bars. (Full route table: SPEC §2.)

```
Home (#/)  ──tap day──▶  Session detail (#/session/:n)  ──Start/Resume──▶  Logger
  │  ├─ History (#/history) ──tap workout──▶ expanded ──tap exercise──▶ Exercise history (#/exercise/:ref)
  │  └─ Progress (#/progress) ──tap lift──▶ Progress detail (#/progress/:lift)
  └─ (auth gate) Login   ·   Exercise picker = modal sheet over any logging context
Persistent: Active-workout bar (fixed bottom, everywhere a workout is active except the logger)
```

A redesign **may** introduce a bottom tab bar / global nav — that's a structural design
proposal worth making (today there's none), as long as the routes still exist.

---

## 6. Screens — wireframes, priorities, states

Low-fi layouts of the **current** structure at ~390px. Use as a content/priority
reference; recompose freely.

### 6.1 Home / Program list — `#/`
```
┌──────────────────────────────────────────┐
│ PROGRAM · JAN–JUN 2026      History Progr.│  ← kicker + nav links + EN·RU + ⎋ signout
│ The Block                                 │  ← program title (H1)
│ ┌────────────┐ ┌────────────┐             │
│ │ 12 /65     │ │ 13/65      │             │  ← Done · Up next stat chips
│ │ DONE       │ │ UP NEXT    │             │
│ └────────────┘ └────────────┘             │
│            [ kg | lb ]                     │  ← shared unit toggle
│ ┌─────┐┌─────┐┌─────┐                      │
│ │210kg││180kg││140kg│  Max  D / S / B      │  ← Max chips (coach+logged best)
│ └─────┘└─────┘└─────┘                      │
│ ┌─────┐┌─────┐┌─────┐                      │
│ │~225 ││~190 ││~150 │  ~1RM D / S / B      │  ← estimated-1RM chips
│ └─────┘└─────┘└─────┘                      │
│ ┌──[12]  MON, FEB 3   SQUAT BENCH  7 ex ›─┐│  ← session rows (newest first);
│ │  [11]  FRI, JAN 30  DEADLIFT     6 ex › ││     number = finished toggle (green),
│ │  ...                                    ││     row = open; "up next" row highlighted
└──────────────────────────────────────────┘
```
**Priority:** today's "up next" → quick stats → day list. **States:** 0 done (fresh),
all done (✓), kg vs lb, finished rows (green number) vs up-next (highlight). Empty ~1RM/Max
chips show `—`.

### 6.2 Session detail — `#/session/:n`
```
‹ Program · Day 12                         ← back
[‹]   Day 12 / 65   [›]                     ← day stepper
⬡ BARBELL · #1
Back Squat / Приседания со штангой          ← EN name + RU sub
┌── HERO ─────────────────────────────────┐
│              100 kg                       │  ← big weight (or slider / step chips)
│           = 225 lb total                 │
│        ▭▬▬█═══════█▬▬▭   (barbell SVG)    │
│  Per side · lb   45 bar  [2×45][25][10]  │  ← colored plate pills
└──────────────────────────────────────────┘
[ 5 Sets ]   [ 5 Reps ]
▎coach description EN / RU, notes…
─ other exercises (mini list, tap to focus) ─
[ ▶ Start Session ]                         ← primary CTA (context-dependent)
```
**Hero variants:** single weight · **range → slider** (drag, live plates) · **progression
/ per-set → step chips** (tap to load) · non-barbell (no plates; "each" for dumbbell pairs).
**CTA states:** Start · Resume (active here) · "Finish your Day N workout…" (disabled,
other day active) · ✎ Edit + 📋 Copy + 🗑 Delete (already logged) · ✓ Skipped badge ·
⟳ "Trainer updated this day after you finished it" badge.

### 6.3 Logger — (rendered at `#/session/:n`, logging mode)
```
‹ Schedule
[⏸] 12:34                              [✕]   ← pause + elapsed clock + cancel
DAY 12 · LOGGING
┌── Back Squat / Приседания ───────── [✕] ─┐
│ ⇄ Front Squat            (swap pill)     │  ← only if a coach "(or…)" alt exists
│ Coach · 100 kg × 5 · Last 185×5          │  ← reference line
│ Set    lb        Reps      ✓             │  ← header (lb·ea / Sec variants)
│  1   [ 180 ]   [  5  ]    [✓]   [−]      │  ← set row; ✓ locked until valid
│      [2×45][25][10] /side · 225 lb w/bar │  ← live plate line (barbell only)
│  2   [ 180 ]   [  5  ]    [ ]   [−]      │
│  + Add set                               │
└──────────────────────────────────────────┘
[ + Add Exercise ]
MESSAGE TO COACH (OPTIONAL)
[ textarea … ]
[ Finish ]
┌── (fixed) − 15   1:27   +15      Skip ───┐  ← rest bar, only while resting
```
**Most complex screen.** Variants: weight column = `lb` / `lb · ea` (per-implement);
reps column = `Reps` / `Sec` (timed hold). Row states: empty, valid (✓ active), done
(tinted), locked ✓ (greyed). Edit mode: no clock/cancel/rest, header says "Editing",
button says "Done". This table is dense at 390px — **a key redesign target** (consider
larger steppers, bigger ✓, clearer plate line).

### 6.4 History — `#/history`
```
‹ Program          History        [kg|lb]
┌─ Day 12 · 47m · 7 ex        Feb 3, 26 ──┐  ← collapsed; tap to expand
│  Total lifted · 12,400 kg               │
└──────────────────────────────────────────┘
  (expanded:)
  Back Squat ›            ← links to exercise history
    ✓ 185 lb (230 w/ bar) × 5
    ✓ 185 lb (230 w/ bar) × 5
    Volume · 2,100 kg
  Coach message: left knee tight on set 2
  [ 📋 Copy for trainer (kg) ]
```
**States:** empty ("No finished workouts yet."), collapsed/expanded, kg/lb, with/without
coach message, deep-linked auto-expanded (`#/history/:id` after finishing).

### 6.5 Exercise history — `#/exercise/:ref`
```
‹ History
Back Squat                         [kg|lb]
Приседания · 6 sessions
┌─ MON, FEB 3 ─────────────────────────────┐
│  185 lb (230 w/ bar) × 5                  │
│  185 lb (230 w/ bar) × 5                  │
└──────────────────────────────────────────┘
┌─ MON, JAN 27 … ─────────────────────────┐
```
**States:** empty; kg/lb; with/without RU subtitle.

### 6.6 Progress / Trends — `#/progress` (+ `:lift` detail)
```
‹ Program          Progress       [kg|lb]
┌─ Deadlift                 ~225 kg ──────┐
│   ╱╲___╱▔▔╲___╱▔  (sparkline)           │  ← tap → detail
└──────────────────────────────────────────┘
┌─ Squat                    ~190 kg ──────┐ …
Detail: big chart + "Best ~225 kg" + per-session list (date · set · ~1RM)
```
**States:** no data ("No logged sets yet"), single point ("Log more to see a trend"),
trend. Three lifts (deadlift/squat/bench), each color-coded.

### 6.7 Exercise picker (modal sheet)
```
[✕]      Add exercise        [ Add 2 ]
[ Search…                              ]
[ Any body part ▾ ] [ Any equipment ▾ ]
Frequently used                            ← bold accent, underlined
 (B) Back Squat (5)                  ✓
 (D) Deadlift (3)
A
 (A) Arnold Press
 …
```
**States:** default (frequent + A–Z), searching, filtered, no matches, single- vs
multi-select (multi shows "Add N" + checkmarks).

### 6.8 Login (auth gate, only if Supabase configured)
```
        LIFTINGLOG
        Sign in
        [ Email                  ]
        [ Password               ]
        [ Log in ]
        (message line)
```
**States:** idle, "Signing in…", error message. Centered card, max 320px.

### 6.9 Persistent active-workout bar & toasts
- **Active bar** (fixed bottom): `▶ Resume workout · Day 12      12:34`. Mint, bold,
  one big tap target.
- **Toasts:** small pill, bottom; info/error variants ("Copied for trainer ✓", "Saved ✓",
  "Save failed: …").
- **Rest-complete celebration:** larger centered toast with shadow when the gong fires.

---

## 7. Component inventory (design a system for these)

| Component | Where | Variants / states |
|---|---|---|
| Stat chip | Home | value+label; `—` empty |
| Max / ~1RM chip | Home | per-lift color; kg/lb; `—`/`~` |
| Lift tag | Home rows | SQUAT/BENCH/DEADLIFT/ACCESSORY colors |
| Session row | Home | default, up-next (highlight), number-as-finished-toggle (on/off) |
| Unit toggle | Home/History/Progress/ExHistory | kg\|lb segmented |
| Day stepper | Session | prev/next, disabled at ends |
| Weight hero | Session | single · range slider · step chips · non-barbell |
| Barbell SVG + plate pills | Session/Logger | per-plate colors; "empty bar" |
| Primary CTA | Session/Logger | start/resume/disabled/edit |
| Secondary buttons | Session | copy / delete / add (info vs destructive) |
| Badge | Session | skipped (mint) · trainer-updated (gold) |
| Set row | Logger | inputs + ✓ (idle/valid/done/locked) + delete; lb·ea / Sec variants |
| Plate line | Logger | live per-side + "w/ bar"; "bar only" |
| Swap pill | Logger | ⇄ alternative |
| Coach/last reference line | Logger | coach only / last only / both |
| Clock + pause | Logger | running / paused / "Editing" |
| Rest bar | Logger | fixed; −15/+15/Skip; counting/elapsed |
| Coach-message field | Logger | textarea, ≥16px |
| History card | History | collapsed / expanded |
| Set line (read-only) | History/ExHistory | barbell "w/bar" / BW / "each" / timed `s` |
| Volume line | History | per-workout & per-exercise |
| Sparkline | Progress | empty / 1 pt / trend; per-lift color |
| Progress row | Progress detail | date · set · ~1RM |
| Picker sheet | global | search, filters, frequent, A–Z, empty, multi |
| Picker row | Picker | avatar + name + RU + meta; selected |
| Active bar | global | resume + clock; paused |
| Toast | global | info / error / rest-complete celebration |
| Login card | Login | idle / loading / error |

---

## 8. States matrix (don't lose these)

| Screen | Empty | Loading | Error | Special states |
|---|---|---|---|---|
| Boot | — | hydrating store | (falls back to local) | not-signed-in → Login (only if Supabase set) |
| Home | 0 finished | — | — | all-done ✓; up-next highlight; kg/lb |
| Session | — | — | "Session not found" | finished/locked snapshot; skipped; trainer-updated; active-here; other-day-active (disabled); already-logged |
| Logger | "No exercises — add one" | autosaves | "Save failed" toast | resting; paused; edit mode; locked ✓; unfinished-on-finish confirm |
| History | "No finished workouts yet." | — | — | expanded; deep-linked; kg/lb; coach-msg present |
| Exercise history | "No logged sets yet." | — | — | kg/lb; RU subtitle present/absent |
| Progress | "No logged sets yet." | — | — | single-point hint; per-lift |
| Picker | "No matches" | — | — | searching; filtered; multi-select |
| Login | — | "Signing in…" | error message | — |
| Offline | n/a | shell from cache | writes queue locally | (data syncs when back online) |

---

## 9. Motion & interaction

**Current:** GSAP staggered fade/translate-in on Home rows and Session elements
(~0.35–0.4s, power2.out). Range slider live-updates plates. Picker re-renders on
search. Rest bar counts down; gong + (Android) vibrate at 0; **on phone-lock the visual
catches up to wall-clock on return**. Toast fade in/out.

**You may redesign all of it.** Suggested opportunities: set-complete confirmation (the ✓
tap is the emotional beat — make it satisfying), rest-timer urgency near 0, plate
loading animation, finish→history transition, number transitions on the unit toggle.

**Required:** every motion has a `prefers-reduced-motion: reduce` resting state (no
animation). Don't gate information behind motion.

---

## 10. Microcopy & i18n

**Pattern:** English primary, Russian secondary (sub-line or via the lift's existing
RU name). Keep both. Russian strings are longer — design for overflow/wrap.

**Number/unit formatting (keep meanings):**
- Weights shown in the user's unit (kg default). Barbell read-outs show plates **and**
  "(N w/ bar)" total. Dumbbell pairs append **"each"**. Bodyweight shows **"BW"** /
  "BW +N". Timed holds show seconds (`s` EN / `с` RU). Plates shown as colored pills.
- Trainer export is **Russian only**, weights in **kg as full lifted weight** ("б/в" for
  bodyweight, "(кажд.)" for per-implement).

**Representative strings** (reword freely, keep intent): Home — "Done", "Up next", "Max
Deadlift", "~1RM Squat", "N exercises"; confirms — "Skip this day? It will be marked done
without a logged workout.", "Unmark this day? Your logged workout stays in History."
Session — "Start Session" / "Log this day", "Edit workout", "Copy for trainer", "Delete
workout", "Per side · lb", "empty bar". Logger — "Schedule", "Day N · logging", "Coach ·
…", "Last …", "Add set", "Add Exercise", "Message to coach (optional)", placeholder "e.g.
left knee tight on set 2", "Finish"/"Done", "bar only", confirms ("Some sets aren't marked
done. Finish anyway?", "Cancel this workout? All progress will be lost."), validation
("Numbers only", "Enter weight and reps first"). History — "Total lifted · …", "Volume ·
…", "Copy for trainer (kg)", "No finished workouts yet." Progress — "No logged sets yet.",
"Log more to see a trend.", "Best ~…". Picker — "Add exercise", "Search…", "Any body
part", "Frequently used", "Add N", "No matches". Login — "Sign in", "Log in", "Signing
in…". Toasts — "Copied for trainer ✓", "Saved ✓", "Workout deleted".

---

## 11. What to deliver back

To hand off cleanly to engineering (vanilla TS + CSS variables; no component framework):
1. **Design tokens** — color, type scale, spacing, radius, elevation (map to CSS custom
   properties; we currently use `--bg/--ink/--mint/...`).
2. **Component library** — each component in §7 with all its states.
3. **Screen comps** — each screen in §6 at 390px, including the key states from §8 (not
   just the happy path).
4. **Icon set** — replacing the Unicode glyphs (§4.5).
5. **PWA assets** — app icon (192/512), apple-touch-icon, favicon, optional splash.
6. **Motion specs** — durations/easings + the reduced-motion fallback.
7. **Redlines / spacing** at 390px, plus how it scales to the 480px cap.

---

## 12. Known weak spots / opportunities (good places to push)

- **Touch targets** are too small (24–38px) — enlarge across the board.
- **Logger set table** is dense and fiddly at 390px — the highest-value screen to rethink.
- **Unicode/emoji icons** look inconsistent — needs a real icon set.
- **No global nav** — every screen relies on back links; a tab bar / hub is worth proposing.
- **Dark-only** today — a light theme could be in scope if desired.
- **Rest timer** is the signature moment (used mid-set, glanced at, sometimes locked) —
  worth strong, legible, large treatment.
- **Plate pills + barbell viz** are a distinctive asset — lean into making loading
  beautiful and instantly countable.

---

*For any functional detail not covered here — exact rounding, what counts as volume, how
e1RM is computed, persistence — see [`SPEC.md`](./SPEC.md). When in doubt, behavior is
frozen; ask before changing it.*
