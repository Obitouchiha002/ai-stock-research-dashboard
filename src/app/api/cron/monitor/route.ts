import { NextRequest, NextResponse } from "next/server";
import { evalConditions } from "@/lib/comboEval";

// ---------------------------------------------------------------------------
// Server-side alert monitor — the "works even when the app is closed" path.
//
// The client already backs up every user's data (price alerts, combinations,
// watchlist/portfolio, the alert email) to Upstash under their sync code. This
// endpoint, hit by a scheduler (Vercel Cron or a free external pinger), reads
// each synced bundle, fetches live prices/metrics, evaluates the SAME rules the
// in-app monitors use, and emails whatever newly fired — no browser required.
//
// It emails factual crossings of the user's OWN levels / their OWN saved combos.
// Never buy/sell advice. Requires: cloud sync ON (so the bundle exists) and the
// user's email set in Settings/Alerts.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STORE_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const STORE_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

async function redis(command: (string | number)[]): Promise<any> {
  const res = await fetch(STORE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${STORE_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`store responded ${res.status}`);
  return res.json();
}

const LEVELS: { key: string; dir: "up" | "down"; label: string }[] = [
  { key: "target", dir: "up", label: "Target" },
  { key: "r2", dir: "up", label: "Resistance R2" },
  { key: "r1", dir: "up", label: "Resistance R1" },
  { key: "sl", dir: "down", label: "Stop-Loss" },
  { key: "s1", dir: "down", label: "Support" },
];

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cmp = (a: number, op: string, b: number) =>
  op === ">" ? a > b : op === ">=" ? a >= b : op === "<" ? a < b : op === "<=" ? a <= b : Math.abs(a - b) <= Math.abs(b) * 0.001;

type Seen = { levels: string[]; live: string[] };

// Evaluate one user's bundle and return the email lines that newly fired, plus
// the seen-state to persist so the next run doesn't re-email the same thing.
function evaluate(bundle: any, quotes: Record<string, any>, rows: any[], prev: Seen) {
  const lines: string[] = [];
  const newLevels = new Set(prev.levels || []);
  const prevLive = new Set(prev.live || []);
  const nowLive = new Set<string>();

  const rowBySym = new Map(rows.map((r) => [String(r.symbol).toUpperCase(), r]));

  // ---- Price alerts (levels + custom condition) --------------------------
  const alerts: any[] = Array.isArray(bundle.sa_price_alerts) ? bundle.sa_price_alerts : [];
  for (const a of alerts) {
    if (!a || a.status === "paused") continue;
    const sym = String(a.symbol || "").toUpperCase();
    const q = quotes[sym];
    const price = q?.price;
    if (price == null) continue;
    const cur = q?.currency === "INR" ? "₹" : "$";

    for (const lv of LEVELS) {
      const t = a.levels?.[lv.key];
      if (t == null) continue;
      const hit = lv.dir === "up" ? price >= t : price <= t;
      const key = `lvl:${a.id}:${lv.key}`;
      if (hit && !newLevels.has(key)) {
        newLevels.add(key);
        lines.push(`${sym} reached your ${lv.label} (${cur}${fmt(t)}) — now ${cur}${fmt(price)}.`);
      }
    }

    if (a.condition) {
      const isPct = a.condition.metric === "changePct";
      const mv = isPct ? q?.changePct : price;
      if (mv != null) {
        const loOk = a.condition.lo == null || cmp(Number(a.condition.lo), a.condition.loOp || "<", Number(mv));
        const hit = loOk && cmp(Number(mv), a.condition.op, Number(a.condition.value));
        const key = `cond:${a.id}`;
        if (hit) {
          nowLive.add(key);
          if (!prevLive.has(key)) {
            const shown = isPct ? `${fmt(mv)}%` : `${cur}${fmt(mv)}`;
            const tgt = isPct ? `${a.condition.value}%` : `${cur}${fmt(a.condition.value)}`;
            lines.push(`${sym}: ${isPct ? "Day change" : "Price"} ${a.condition.op} ${tgt} — now ${shown}.${a.name ? ` (${a.name})` : ""}`);
          }
        }
      }
    }
  }

  // ---- Combinations: attachments (targeted) + global scan ----------------
  const combos: any[] = Array.isArray(bundle.sa_combinations) ? bundle.sa_combinations : [];
  const comboById = new Map(combos.map((c) => [c.id, c]));

  const attach: { symbol: string; comboId: string }[] = [];
  (Array.isArray(bundle.sa_watchlist) ? bundle.sa_watchlist : []).forEach((w: any) => {
    if (w?.comboId) attach.push({ symbol: String(w.symbol || "").toUpperCase(), comboId: w.comboId });
  });
  const plans = bundle.sa_market_plans && typeof bundle.sa_market_plans === "object" ? bundle.sa_market_plans : {};
  Object.entries(plans).forEach(([sym, p]: any) => {
    if (p?.comboId) attach.push({ symbol: String(sym).toUpperCase(), comboId: p.comboId });
  });
  const attachedPairs = new Set<string>();
  for (const a of attach) {
    const combo = comboById.get(a.comboId);
    const r = rowBySym.get(a.symbol);
    if (!combo || !r) continue;
    const key = `att:${a.comboId}:${a.symbol}`;
    attachedPairs.add(`${a.comboId}:${a.symbol}`);
    if (evalConditions(r, combo.conditions || {}).match) {
      nowLive.add(key);
      if (!prevLive.has(key)) lines.push(`🎯 ${a.symbol} matched your attached combo "${combo.label || combo.name}".`);
    }
  }
  for (const combo of combos) {
    for (const r of rows) {
      const sym = String(r.symbol).toUpperCase();
      if (attachedPairs.has(`${combo.id}:${sym}`)) continue; // targeted path handled it
      if (!evalConditions(r, combo.conditions || {}).match) continue;
      const key = `cmb:${combo.id}:${sym}`;
      nowLive.add(key);
      if (!prevLive.has(key)) lines.push(`${sym} now matches your "${combo.label || combo.name}" combination.`);
    }
  }

  return { lines, seen: { levels: Array.from(newLevels), live: Array.from(nowLive) } as Seen };
}

async function handle(req: NextRequest) {
  // DISABLED — folded into the single twice-daily consolidated brief
  // (/api/cron/consolidated). This endpoint used to drip ONE email per newly
  // matched stock. It is now a harmless no-op so any lingering external pinger
  // (cron-job.org / UptimeRobot / etc.) can no longer make it send mail.
  return NextResponse.json({ ok: true, disabled: true, note: "Use /api/cron/consolidated (consolidated twice-daily brief)." });

  // eslint-disable-next-line no-unreachable
  // Auth: accept ?key=<secret> or Vercel Cron's "Authorization: Bearer <secret>".
  const url = new URL(req.url);
  const provided = url.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!STORE_URL || !STORE_TOKEN) {
    return NextResponse.json({ error: "Cloud store not configured" }, { status: 503 });
  }

  const origin = url.origin || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  // One-off maintenance: ?reset=1 clears the per-user "already-sent" memory so
  // whatever currently matches fires (and emails) once on the next evaluation.
  const reset = url.searchParams.get("reset") === "1";
  const codesRes = await redis(["SMEMBERS", "sync:index"]);
  const codes: string[] = Array.isArray(codesRes?.result) ? codesRes.result : [];

  let checkedUsers = 0, emailed = 0, totalFired = 0;

  for (const code of codes) {
    try {
      const bRes = await redis(["GET", `sync:${code}`]);
      const raw = bRes?.result;
      if (!raw) continue;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const bundle = parsed?.bundle || {};
      const email = bundle?.sa_settings?.alertEmail;
      if (!email) continue; // can't notify without a recipient

      const alerts: any[] = Array.isArray(bundle.sa_price_alerts) ? bundle.sa_price_alerts : [];
      const combos: any[] = Array.isArray(bundle.sa_combinations) ? bundle.sa_combinations : [];
      const wl: any[] = Array.isArray(bundle.sa_watchlist) ? bundle.sa_watchlist : [];
      const pf: any[] = Array.isArray(bundle.sa_portfolio) ? bundle.sa_portfolio : [];
      const plans = bundle.sa_market_plans && typeof bundle.sa_market_plans === "object" ? bundle.sa_market_plans : {};
      const attachedSyms = [
        ...wl.filter((w) => w?.comboId).map((w) => String(w.symbol || "").toUpperCase()),
        ...Object.entries(plans).filter(([, p]: any) => p?.comboId).map(([s]) => String(s).toUpperCase()),
      ];
      if (!alerts.length && !combos.length && !attachedSyms.length) continue;
      checkedUsers++;

      // Quotes for price alerts.
      const quotes: Record<string, any> = {};
      const alertSyms = Array.from(new Set(alerts.map((a) => String(a.symbol || "").toUpperCase()).filter(Boolean)));
      if (alertSyms.length && origin) {
        try {
          const r = await fetch(`${origin}/api/quotes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: alertSyms }), cache: "no-store" });
          const j = await r.json();
          Object.assign(quotes, j.quotes || {});
        } catch { /* skip price alerts this run */ }
      }

      // Metrics for combinations.
      let rows: any[] = [];
      const comboSyms = Array.from(new Set([
        ...wl.map((w) => String(w.symbol || "").toUpperCase()),
        ...pf.map((h) => String(h.symbol || "").toUpperCase()),
        ...attachedSyms,
      ].filter(Boolean)));
      if ((combos.length || attachedSyms.length) && comboSyms.length && origin) {
        const trigger = {
          earningsUp: combos.some((c) => c.conditions?.earningsUp),
          atAth: combos.some((c) => c.conditions?.atAth),
          atAtl: combos.some((c) => c.conditions?.atAtl),
        };
        try {
          const r = await fetch(`${origin}/api/screen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: comboSyms, conditions: trigger }), cache: "no-store" });
          const j = await r.json();
          rows = (j.results || []).filter((x: any) => x.ok);
        } catch { /* skip combos this run */ }
      }

      // Load prior seen-state (unless resetting), evaluate, persist.
      let prev: Seen = { levels: [], live: [] };
      if (!reset) {
        try {
          const sRes = await redis(["GET", `cronseen:${code}`]);
          if (sRes?.result) prev = typeof sRes.result === "string" ? JSON.parse(sRes.result) : sRes.result;
        } catch { /* fresh */ }
      }

      const { lines, seen } = evaluate(bundle, quotes, rows, prev);
      await redis(["SET", `cronseen:${code}`, JSON.stringify(seen), "EX", String(30 * 24 * 60 * 60)]);

      if (lines.length && origin) {
        totalFired += lines.length;
        const subject = `StockAnalytix · ${lines.length} alert${lines.length === 1 ? "" : "s"} triggered`;
        const text = `Your StockAnalytix alerts just triggered:\n\n${lines.map((l) => `• ${l}`).join("\n")}\n\n— Research support only, not buy/sell advice.`;
        try {
          const r = await fetch(`${origin}/api/alert-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: email, subject, text }), cache: "no-store" });
          const j = await r.json().catch(() => ({}));
          if (j?.ok) emailed++;
        } catch { /* try next run */ }
      }
    } catch {
      /* one bad bundle shouldn't stop the rest */
    }
  }

  return NextResponse.json({ ok: true, users: codes.length, checked: checkedUsers, emailed, fired: totalFired });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
