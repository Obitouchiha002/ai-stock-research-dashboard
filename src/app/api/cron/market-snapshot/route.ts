import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Daily India market history. EODHD has no NSE historical bulk, so we build our
// own: each day this stores India's screener + overview results, and the
// screener/overview endpoints read a past India date back from here (the India
// calendar). Run once per day after the NSE close (a pg_cron job). US already
// has EODHD's native history, so it isn't snapshotted.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET || "";
const SCHEDULER_TOKEN = process.env.SCHEDULER_TOKEN || "";
const SELF_BASE = process.env.SELF_BASE_URL || "https://stockanalytix.vercel.app";

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const provided = url.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const authOk = Boolean(provided) && (provided === CRON_SECRET || (SCHEDULER_TOKEN && provided === SCHEDULER_TOKEN));
  if (!authOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ skipped: true, reason: "no supabase admin" });

  const today = new Date().toISOString().slice(0, 10);
  const jobs = [
    { kind: "screener", path: "/api/screener" },
    { kind: "overview", path: "/api/market-overview" },
  ];
  const rows: any[] = [];
  for (const j of jobs) {
    try {
      const r = await fetch(`${SELF_BASE}${j.path}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market: "in", force: true }), cache: "no-store",
      });
      const data = await r.json();
      if (data && !data.error) rows.push({ snap_date: data.asOf || today, market: "in", kind: j.kind, data });
    } catch { /* skip a failed job */ }
  }
  if (rows.length) {
    await sb.from("market_snapshots").upsert(rows, { onConflict: "snap_date,market,kind" });
  }
  const result = { ok: true, stored: rows.length, date: today };
  console.log("[market-snapshot]", JSON.stringify(result));
  return NextResponse.json(result);
}
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
