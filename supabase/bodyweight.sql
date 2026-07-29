-- Bodyweight tracking. One row per (user, local day); the lifter's actual
-- bodyweight in kilograms. Re-logging a day upserts. Run this in the Supabase
-- SQL editor (same project as the `workouts` / `progress` tables).
-- RLS uses (auth.jwt() ->> 'sub')::uuid because this project's newer JWT signing
-- keys make auth.uid() return null (same pattern as workouts.sql).

create table if not exists public.bodyweight (
  user_id    uuid not null default (auth.jwt() ->> 'sub')::uuid,
  day        date not null,
  weight_kg  numeric not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.bodyweight enable row level security;

create policy "own bodyweight" on public.bodyweight
  for all
  using ((auth.jwt() ->> 'sub')::uuid = user_id)
  with check ((auth.jwt() ->> 'sub')::uuid = user_id);

grant select, insert, update, delete on public.bodyweight to authenticated;
