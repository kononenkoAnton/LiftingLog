-- Workout logger storage. One row per workout; the full nested workout (exercises,
-- sets, notes, pausedMs) lives in `data jsonb`. Top-level columns are for filtering.
-- Run this in the Supabase SQL editor (same project as the `progress` table).
-- RLS uses (auth.jwt() ->> 'sub')::uuid because this project's newer JWT signing
-- keys make auth.uid() return null (see the progress table for the same pattern).

create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default (auth.jwt() ->> 'sub')::uuid,
  session_num int,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  status      text not null default 'active',
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.workouts enable row level security;

create policy "own workouts" on public.workouts
  for all
  using ((auth.jwt() ->> 'sub')::uuid = user_id)
  with check ((auth.jwt() ->> 'sub')::uuid = user_id);

grant select, insert, update, delete on public.workouts to authenticated;

create index if not exists workouts_user_started
  on public.workouts (user_id, started_at desc);
