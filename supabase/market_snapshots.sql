-- Our own daily market history — so India (which EODHD has no historical bulk
-- for) builds a calendar over time: a cron stores each day's screener + overview
-- results, and the screener/overview endpoints read a past India date from here.
-- US keeps using EODHD's historical bulk directly, but is snapshotted too so the
-- app owns a consistent record either way.
--
-- One row per (date, market, kind). `data` is the same JSON the API returns.
create table if not exists public.market_snapshots (
  snap_date   date        not null,
  market      text        not null,   -- 'in' | 'us'
  kind        text        not null,   -- 'screener' | 'overview'
  data        jsonb       not null,
  created_at  timestamptz not null default now(),
  primary key (snap_date, market, kind)
);

-- Server (service_role) writes & reads only — no anon/auth access.
alter table public.market_snapshots enable row level security;
