import { NextRequest, NextResponse } from "next/server";
import { buildEmergency, fetchQuotes, fetchNews, rowsFrom, MOVE_THRESHOLD } from "@/lib/briefKit";

// Emergency auto-alert — the 4th, event-driven email. Runs a few times during
// market hours; for each cloud-synced user it checks their holdings + watchlist
// and, the moment one moves >=7% intraday, sends a focused alert with the news
// behind it. Deduped per stock per day (Upstash) so the same move never spams.
// If nothing crossed the threshold, it sends nothing. Research support only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STORE_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const STORE_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
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

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const provided = url.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || provided !== CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!STORE_URL || !STORE_TOKEN) return NextResponse.json({ error: "Cloud store not configured" }, { status: 503 });
  if (!RESEND_KEY) return NextResponse.json({ skipped: true, reason: "RESEND_API_KEY not set" });

  const now = new Date();
  const day = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const reset = url.searchParams.get("reset") === "1"; // clear today's seen (testing)

  const codesRes = await redis(["SMEMBERS", "sync:index"]);
  const codes: string[] = Array.isArray(codesRes?.result) ? codesRes.result : [];

  let checked = 0, emailed = 0, fired = 0;
  for (const code of codes) {
    try {
      const bRes = await redis(["GET", `sync:${code}`]);
      const raw = bRes?.result;
      if (!raw) continue;
      const bundle = (typeof raw === "string" ? JSON.parse(raw) : raw)?.bundle || {};
      const email = bundle?.sa_settings?.alertEmail;
      if (!email) continue;

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
      const movers = rows.filter((r) => r.changePct != null && Math.abs(r.changePct) >= MOVE_THRESHOLD);
      if (!movers.length) continue;

      // Dedup: only alert on stocks not already alerted today for this user.
      const seenKey = `emerg:${code}:${day}`;
      let seen: string[] = [];
      if (!reset) {
        try {
          const sRes = await redis(["GET", seenKey]);
          if (sRes?.result) seen = typeof sRes.result === "string" ? JSON.parse(sRes.result) : sRes.result;
        } catch { /* fresh */ }
      }
      const seenSet = new Set(seen);
      const fresh = movers.filter((m) => !seenSet.has(m.symbol));
      if (!fresh.length) continue;

      fresh.forEach((m) => seenSet.add(m.symbol));
      await redis(["SET", seenKey, JSON.stringify(Array.from(seenSet)), "EX", String(36 * 60 * 60)]);

      const news = await fetchNews(fresh.map((m) => m.symbol), 2, 6);
      const { subject, html } = buildEmergency(fresh, news, dateStr);
      fired += fresh.length;
      if (await sendResend(email, subject, html)) emailed++;
    } catch { /* one bad bundle shouldn't stop the rest */ }
  }

  const result = { ok: true, users: codes.length, checked, emailed, fired };
  console.log("[emergency]", JSON.stringify(result));
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
