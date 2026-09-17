import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/briefKit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Daily portfolio snapshot. For each logged-in account it computes the portfolio's
// market value and cost basis (qty x price) split by currency, and stores one row
// per day in portfolio_snapshots — the history that powers performance / P&L over
// time. Scheduled via Supabase pg_cron (post-close). Research support only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || "";
const SCHEDULER_TOKEN = process.env.SCHEDULER_TOKEN || "";
const SELF_BASE = process.env.SELF_BASE_URL || "https://stockanalytix.vercel.app";

const num = (v: any) => (typeof v === "number" && isFinite(v) ? v : Number(v));
const isNum = (v: any) => typeof v === "number" && isFinite(v);

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const provided = url.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const authOk = Boolean(provided) && (provided === CRON_SECRET || (SCHEDULER_TOKEN && provided === SCHEDULER_TOKEN));
  if (!authOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: rows, error } = await sb.from("user_data").select("user_id, bundle");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let users = 0, saved = 0;
  for (const row of rows || []) {
    try {
      const bundle = (row as any).bundle || {};
      const holdings: any[] = Array.isArray(bundle.sa_portfolio) ? bundle.sa_portfolio : [];
      if (!holdings.length) continue;
      users++;

      const syms = Array.from(new Set(holdings.map((h) => String(h.symbol || "").toUpperCase()).filter(Boolean)));
      const quotes = await fetchQuotes(SELF_BASE, syms);

      let inV = 0, inI = 0, usV = 0, usI = 0;
      for (const h of holdings) {
        const sym = String(h.symbol || "").toUpperCase();
        const shares = num(h.shares);
        const buy = num(h.buyPrice);
        const q = quotes[sym];
        const ltp = isNum(num(h.currentPrice)) ? num(h.currentPrice) : q?.price;
        if (!isNum(shares) || !isNum(ltp)) continue;
        const india = h.market === "Indian Stocks" || sym.endsWith(".NS") || sym.endsWith(".BO") || q?.currency === "INR";
        const value = shares * ltp;
        const invested = isNum(buy) ? shares * buy : 0;
        if (india) { inV += value; inI += invested; }
        else { usV += value; usI += invested; }
      }

      const { error: upErr } = await sb.from("portfolio_snapshots").upsert(
        {
          user_id: (row as any).user_id,
          snap_date: today,
          in_value: Math.round(inV * 100) / 100,
          in_invested: Math.round(inI * 100) / 100,
          us_value: Math.round(usV * 100) / 100,
          us_invested: Math.round(usI * 100) / 100,
          holdings: holdings.length,
        },
        { onConflict: "user_id,snap_date" },
      );
      if (!upErr) saved++;
    } catch { /* one bad user shouldn't stop the rest */ }
  }

  const result = { ok: true, users, saved, date: today };
  console.log("[snapshot]", JSON.stringify(result));
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
