-- 26 Weeks: database setup.
-- Paste this whole file into Supabase -> SQL Editor -> New query, then press Run.

-- One row per day: what she did, protein, creatine, lifts and notes.
create table if not exists public.days (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  lift        text check (lift in ('A', 'B')),
  sculpt      boolean not null default false,
  bonus       boolean not null default false,  -- Lagree or core
  walk        boolean not null default false,
  creatine    boolean not null default false,
  pt          boolean not null default false,  -- physical therapy done
  protein     boolean not null default false,  -- goal ticked by hand
  protein_log jsonb   not null default '[]',   -- [{ "g": 25, "label": "Shake" }, ...]
  sets        jsonb   not null default '{}',   -- { "hip_thrust": [{ "w": 65, "r": 10 }, ...] }
  note        text    not null default '',
  updated_at  timestamptz not null default now(),
  primary key (user_id, date)
);

-- Added after launch (safe to re-run).
alter table public.days add column if not exists pt boolean not null default false;

-- One row per morning measurement.
create table if not exists public.measures (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  weight     numeric,
  fat        numeric,
  waist      numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Let signed-in users reach these two tables (signed-out visitors get nothing).
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.days, public.measures to authenticated;

-- Row-level security: each person can only ever see and change their own rows.
alter table public.days     enable row level security;
alter table public.measures enable row level security;

drop policy if exists "own days" on public.days;
create policy "own days" on public.days
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own measures" on public.measures;
create policy "own measures" on public.measures
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
