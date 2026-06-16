# Data, Sync & Hosting — Design Spec

**Date:** 2026-06-13
**Status:** Approved (direction) — staged implementation
**Decisions:** Supabase for user state · incremental parse (keep + append) · single user

## Goal

Make the program update itself from the Doc (parse only new sessions), keep
finished days locked to what was actually done, let unfinished days reflect the
latest Doc, and persist progress durably (cross-device) — hosted online.

## Two data domains (kept separate)

1. **Canonical program** — the latest parse of the Google Doc. Ships as static
   `src/data/program.json` (deployed with the app). No per-user notion. Updated
   by the incremental parser on a schedule.
2. **User state** — per user: finished days + a **snapshot of each finished day's
   content at finish time**, and (later) logged sets / rest-timer / notes. Lives
   in Supabase (Postgres). Small.

## Rendering rule (the heart of it)

For session N:
- **Finished** → render the stored **snapshot** (locked to what you did).
- **Not finished** → render the **canonical** latest (trainer edits to upcoming
  days appear automatically).
- A finished day whose canonical content now differs from its snapshot → show a
  small "trainer updated this after you finished" badge.

This makes "compare unfinished on changes" automatic and "don't disturb finished"
explicit, with no diff engine.

## Incremental parser

`scripts/parse-program.mjs`:
- **Default (incremental):** read existing `program.json`; keep every session that
  already exists (by `num`) **verbatim** (preserves hand-authored descriptions);
  append only sessions with a new `num`. Report kept/appended counts.
- **`--full`:** regenerate everything from the Doc (overwrites; for a clean rebuild).
- Edited *existing* sessions are an edge case: handle with a future `--refresh <num>`
  rather than clobbering hand-polish by default.
- Runs in CI on a schedule (GitHub Action cron) → commits `program.json` → static
  redeploy. Parsing stays in Node; no edge-runtime port.

## Supabase schema (single user)

```sql
create table public.progress (
  user_id     uuid not null references auth.users(id)
                default (auth.jwt() ->> 'sub')::uuid,   -- see note
  session_num int  not null,
  finished_at timestamptz not null default now(),
  snapshot    jsonb not null,            -- the session's exercises at finish time
  primary key (user_id, session_num)
);
alter table public.progress enable row level security;
grant select, insert, update, delete on public.progress to authenticated;
create policy "own rows" on public.progress
  for all
  using  (user_id = (auth.jwt() ->> 'sub')::uuid)
  with check (user_id = (auth.jwt() ->> 'sub')::uuid);

-- reserved for the logger (Phase 2+)
-- create table set_logs ( user_id uuid, session_num int, ex_order int,
--   set_index int, weight_kg numeric, reps_done int, note text, logged_at timestamptz );
```

**IMPORTANT (learned the hard way):** use `(auth.jwt() ->> 'sub')::uuid`, NOT
`auth.uid()`, in the default and the policy. On projects using Supabase's newer
JWT signing keys, `auth.uid()` can return NULL even for a valid `authenticated`
request — which makes every insert fail the RLS `with check`. Reading `sub`
straight from the JWT claims avoids that. The client also omits `user_id` on
insert and lets this default fill it, so the row can never mismatch the check.

Auth: Supabase email + password, one account (created in the dashboard with Auto
Confirm). RLS scopes every row to the JWT's `sub`.

## Client integration

- Refactor `src/lib/progress.ts` into a small **async** interface:
  `list()`, `isFinished(num)`, `finish(num, snapshot)`, `unfinish(num)`.
  Two implementations: `LocalProgress` (localStorage, now) and `SupabaseProgress`
  (later) — same interface, so screens don't change when we switch.
- `finish(num, snapshot)` stores the session's current exercises as the snapshot.
- Screens load progress on render (await), then apply the rendering rule.
- Supabase client reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from env
  (gitignored `.env`, set in the host dashboard for production).

## Hosting

- Frontend: static Vite build → Vercel / Netlify / Cloudflare Pages (any; already
  `base: './'`). Set the two `VITE_SUPABASE_*` env vars there.
- Parse: GitHub Action cron (`.github/workflows/parse.yml`) running `npm run parse`,
  committing `program.json`. The Doc is public, so no secret needed to fetch.
- Backend: Supabase project (DB + auth + API).

## Staged plan

- **Stage 1 — Incremental parser + CI** (no accounts). `keep + append`, `--full`,
  GitHub Action workflow. Update the `update-program` skill to document both modes.
- **Stage 2 — Snapshot + rendering rule** (localStorage-backed via the async seam).
  Delivers finished-locking / unfinished-latest / changed-badge with no backend.
- **Stage 3 — Supabase** (needs your project). Add `SupabaseProgress` + auth + env;
  migrate from localStorage.
- **Stage 4 — Deploy** frontend + wire env vars + enable the cron.

## Your setup checklist (for Stage 3/4)

1. Create a free Supabase project; run the schema SQL above (SQL editor).
2. Enable Email auth; create your single user.
3. Copy Project URL + anon key → I'll wire them via `.env` (gitignored) and the
   host's env settings. (anon key is safe client-side; RLS protects data.)
4. Pick a host (Vercel/Netlify/Pages); connect the repo; set the two env vars.

## Out of scope (now)

Logger (sets/timer/notes), trainer accounts, multi-athlete. Schema leaves room.

## Workout logger storage (added 2026-06-15, Spec B / plan B1)

`workouts` table — **one JSONB row per workout** (deviation from the original
two-table `workouts`+`logged_sets` proposal; chosen for single-user simplicity and
exact parity with the localStorage offline mirror). Migration: `supabase/workouts.sql`.
Same `(auth.jwt() ->> 'sub')::uuid` RLS as `progress`; the DB `status` column is
authoritative. The client (`src/lib/workouts.ts`) keeps an active-workout cache
hydrated at boot, writes through to localStorage always and Supabase when configured
(`upsert … onConflict: 'id'`), and computes the "Last actual" reference client-side
(`logger-model.lastActualFor`) over fetched finished workouts. Logged exercises are
keyed by a stable identity ref — catalog id for catalog exercises, `coach:<slug(nameEn)>`
for prescribed lifts (NOT session order, so "Last" matches the same movement across
sessions). Cancelling a workout DELETES its row ("all progress lost").
