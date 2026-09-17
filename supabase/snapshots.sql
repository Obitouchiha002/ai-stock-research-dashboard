-- StockAnalytix — daily portfolio snapshots (performance over time)
-- Run once in Supabase → SQL Editor. Stores one row per user per day with the
-- portfolio's value and cost, split by currency (India ₹ / US $), so returns and
-- P&L can be charted over weeks/months. Protected by Row-Level Security.

create table if not exists public.portfolio_snapshots (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  snap_date   date        not null,
  in_value    numeric     not null default 0,   -- India holdings market value (₹)
  in_invested numeric     not null default 0,   -- India cost basis (₹)
  us_value    numeric     not null default 0,   -- US holdings market value ($)
  us_invested numeric     not null default 0,   -- US cost basis ($)
  holdings    integer     not null default 0,
  created_at  timestamptz not null default now(),
  primary key (user_id, snap_date)
);

alter table public.portfolio_snapshots enable row level security;

drop policy if exists "snap select own" on public.portfolio_snapshots;
create policy "snap select own" on public.portfolio_snapshots
  for select using (auth.uid() = user_id);
-- Writes come only from the server (service_role bypasses RLS), so no user
-- insert/update policy is needed.
