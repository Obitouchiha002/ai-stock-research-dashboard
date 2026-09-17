-- StockAnalytix — reliable email scheduler on Supabase (replaces Vercel Hobby cron)
-- Run this ONCE in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- It enables the scheduler extensions and creates jobs that call the app's email
-- endpoints on time, every weekday, using the SCHEDULER_TOKEN (safe: it only lets
-- these endpoints run, nothing else).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Clear any previous StockAnalytix jobs so this file is safe to re-run.
do $$
declare j record;
begin
  for j in select jobname from cron.job where jobname like 'sa-%' loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

-- Times are UTC. IST = UTC + 5:30.
-- Morning brief  02:30 UTC = 08:00 IST
select cron.schedule('sa-brief-morning', '30 2 * * 1-5', $$
  select net.http_get(url := 'https://stockanalytix.vercel.app/api/cron/brief?slot=morning&key=207ea32e0eec3729f6a113ce514b2e5b71000ff8f30a5d3f', timeout_milliseconds := 55000);
$$);

-- Midday brief   07:00 UTC = 12:30 IST
select cron.schedule('sa-brief-midday', '0 7 * * 1-5', $$
  select net.http_get(url := 'https://stockanalytix.vercel.app/api/cron/brief?slot=midday&key=207ea32e0eec3729f6a113ce514b2e5b71000ff8f30a5d3f', timeout_milliseconds := 55000);
$$);

-- Evening brief  10:45 UTC = 16:15 IST
select cron.schedule('sa-brief-evening', '45 10 * * 1-5', $$
  select net.http_get(url := 'https://stockanalytix.vercel.app/api/cron/brief?slot=evening&key=207ea32e0eec3729f6a113ce514b2e5b71000ff8f30a5d3f', timeout_milliseconds := 55000);
$$);

-- Emergency (>=7% move) checks — India morning/afternoon + US session
select cron.schedule('sa-emergency-in1', '0 5 * * 1-5', $$
  select net.http_get(url := 'https://stockanalytix.vercel.app/api/cron/emergency?key=207ea32e0eec3729f6a113ce514b2e5b71000ff8f30a5d3f', timeout_milliseconds := 55000);
$$);
select cron.schedule('sa-emergency-in2', '0 8 * * 1-5', $$
  select net.http_get(url := 'https://stockanalytix.vercel.app/api/cron/emergency?key=207ea32e0eec3729f6a113ce514b2e5b71000ff8f30a5d3f', timeout_milliseconds := 55000);
$$);
select cron.schedule('sa-emergency-us', '0 15 * * 1-5', $$
  select net.http_get(url := 'https://stockanalytix.vercel.app/api/cron/emergency?key=207ea32e0eec3729f6a113ce514b2e5b71000ff8f30a5d3f', timeout_milliseconds := 55000);
$$);

-- Self-monitor: emails an alert if anything is broken. Runs a few times a day.
select cron.schedule('sa-health-1', '0 6 * * *', $$
  select net.http_get(url := 'https://stockanalytix.vercel.app/api/cron/health?key=207ea32e0eec3729f6a113ce514b2e5b71000ff8f30a5d3f', timeout_milliseconds := 55000);
$$);
select cron.schedule('sa-health-2', '0 12 * * *', $$
  select net.http_get(url := 'https://stockanalytix.vercel.app/api/cron/health?key=207ea32e0eec3729f6a113ce514b2e5b71000ff8f30a5d3f', timeout_milliseconds := 55000);
$$);
-- Once a day, send an "all good" confirmation even when nothing is wrong (08:30 IST).
select cron.schedule('sa-health-daily', '0 3 * * *', $$
  select net.http_get(url := 'https://stockanalytix.vercel.app/api/cron/health?heartbeat=1&key=207ea32e0eec3729f6a113ce514b2e5b71000ff8f30a5d3f', timeout_milliseconds := 55000);
$$);

-- Daily portfolio snapshot (after US close ~20:30 UTC) — powers performance / P&L over time.
select cron.schedule('sa-snapshot', '30 20 * * 1-5', $$
  select net.http_get(url := 'https://stockanalytix.vercel.app/api/cron/snapshot?key=207ea32e0eec3729f6a113ce514b2e5b71000ff8f30a5d3f', timeout_milliseconds := 55000);
$$);

-- Check the scheduled jobs:
--   select jobname, schedule, active from cron.job where jobname like 'sa-%';
