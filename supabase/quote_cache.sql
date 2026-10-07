-- Durable last-known-good quote cache.
-- Survives Vercel serverless cold starts so /api/quotes can backfill a blank
-- (Yahoo soft-fail) with the last good value instead of showing "—".
-- Written & read only by the server (service_role, which bypasses RLS); RLS is
-- enabled with NO policy so anon/auth clients can't touch it.

create table if not exists public.quote_cache (
  symbol      text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now()
);

alter table public.quote_cache enable row level security;
