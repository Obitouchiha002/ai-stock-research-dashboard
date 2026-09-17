import { NextRequest, NextResponse } from "next/server";
import {
  buildBrief, fetchQuotes, fetchMarket, fetchNews, rowsFrom,
  MOVE_THRESHOLD, SLOT_META, type Slot, type BriefData,
} from "@/lib/briefKit";
import { evalConditions } from "@/lib/comboEval";
import { getAllCronUsers } from "@/lib/cronUsers";

// The three scheduled daily briefs (morning / midday / evening) — one rich,
// well-formatted email per cloud-synced user: big (>=7%) movers with the news
// behind them, India and US separated, your holdings + watchlist, and (morning
// & evening) the broad market overview. Research support only, never advice.
//
// Slot comes from ?slot=; falls back to the UTC hour so a query-stripped cron
// still picks the right one. Self-fetches the PUBLIC alias (Vercel Cron hits the
// protected deployment URL, which would return an auth page instead of data).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STORE_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const STORE_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
const SCHEDULER_TOKEN = process.env.SCHEDULER_TOKEN || "";
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "StockAnalytix <onboarding@resend.dev>";
const SELF_BASE = process.env.SELF_BASE_URL || "https://stockanalytix.vercel.app";

async function redis(command: (string | number)[]): Promise<any> {
  const res = await fetch(STORE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${STORE_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`store ${res.status}`);
  return res.json();
}

async function sendResend(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function slotFrom(url: URL): Slot {
  const q = url.searchParams.get("slot");
  if (q === "morning" || q === "midday" || q === "evening") return q;
  const hr = new Date().getUTCHours(); // 02:30→morning, 07:00→midday, 10:45→evening
  return hr < 5 ? "morning" : hr < 9 ? "midday" : "evening";
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const provided = url.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const authOk = Boolean(provided) && (provided === CRON_SECRET || (SCHEDULER_TOKEN && provided === SCHEDULER_TOKEN));
  if (!authOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESEND_KEY) return NextResponse.json({ skipped: true, reason: "RESEND_API_KEY not set" });

  const slot = slotFrom(url);
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const showMarket = slot === "morning" || slot === "evening";

  // Market overview is user-independent — fetch once and share across users.
  const [marketIN, marketUS] = showMarket
    ? await Promise.all([fetchMarket(SELF_BASE, "in"), fetchMarket(SELF_BASE, "us")])
    : [null, null];

  // Every user, from Supabase accounts + legacy sync codes, deduped by email.
  const users = await getAllCronUsers();

  let checked = 0, emailed = 0;
  for (const { email, bundle } of users) {
    try {
      const portfolio: any[] = Array.isArray(bundle.sa_portfolio) ? bundle.sa_portfolio : [];
      const watchlist: any[] = Array.isArray(bundle.sa_watchlist) ? bundle.sa_watchlist : [];
      const items = [
        ...portfolio.map((h) => ({ symbol: String(h.symbol || "").toUpperCase(), name: h.name })),
        ...watchlist.map((w) => ({ symbol: String(w.symbol || "").toUpperCase(), name: w.name })),
      ].filter((x) => x.symbol);
      if (!items.length) continue;
      checked++;

      const quotes = await fetchQuotes(SELF_BASE, Array.from(new Set(items.map((i) => i.symbol))));
      const rows = rowsFrom(items, quotes);
      const india = rows.filter((r) => r.region === "in");
      const us = rows.filter((r) => r.region === "us");
      const movers = rows.filter((r) => r.changePct != null && Math.abs(r.changePct) >= MOVE_THRESHOLD);
      const news = await fetchNews(movers.map((m) => m.symbol), 2, 6);

      // Combinations that match now (midday/evening only). Metrics from /api/screen.
      let matched: { symbol: string; label: string }[] = [];
      const combos: any[] = Array.isArray(bundle.sa_combinations) ? bundle.sa_combinations : [];
      if (SLOT_META[slot].combos && combos.length) {
        try {
          const syms = Array.from(new Set(items.map((i) => i.symbol)));
          const trigger = {
            earningsUp: combos.some((c) => c.conditions?.earningsUp),
            atAth: combos.some((c) => c.conditions?.atAth),
            atAtl: combos.some((c) => c.conditions?.atAtl),
          };
          const sr = await fetch(`${SELF_BASE}/api/screen`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbols: syms, conditions: trigger }),
            cache: "no-store",
          });
          const sj = await sr.json();
          const comboRows = (sj.results || []).filter((x: any) => x.ok);
          const seenPair = new Set<string>();
          for (const combo of combos) {
            for (const cr of comboRows) {
              if (!evalConditions(cr, combo.conditions || {}).match) continue;
              const key = `${combo.id}:${String(cr.symbol).toUpperCase()}`;
              if (seenPair.has(key)) continue;
              seenPair.add(key);
              matched.push({ symbol: String(cr.symbol).toUpperCase(), label: combo.label || combo.name || "combination" });
            }
          }
        } catch { /* combos optional */ }
      }

      const data: BriefData = { india, us, movers, news, marketIN, marketUS, combos: matched };
      const { subject, html } = buildBrief(slot, data, dateStr);
      if (await sendResend(email, subject, html)) emailed++;
    } catch { /* one bad bundle shouldn't stop the rest */ }
  }

  const result = { ok: true, slot, users: users.length, checked, emailed, market: showMarket };
  console.log("[brief]", JSON.stringify(result));
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
