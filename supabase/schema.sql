-- StockAnalytix — Supabase schema
-- Run this ONCE in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
-- It creates one table that holds each user's data bundle, protected so a user
-- can only ever read/write their OWN row (Row-Level Security).

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  bundle     jsonb        not null default '{}'::jsonb,
  updated_at timestamptz  not null default now()
);

alter table public.user_data enable row level security;

-- Drop old copies of the policies if re-running, then recreate.
drop policy if exists "own row select" on public.user_data;
drop policy if exists "own row insert" on public.user_data;
drop policy if exists "own row update" on public.user_data;

create policy "own row select" on public.user_data
  for select using (auth.uid() = user_id);

create policy "own row insert" on public.user_data
  for insert with check (auth.uid() = user_id);

create policy "own row update" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
