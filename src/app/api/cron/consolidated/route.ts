import { NextRequest, NextResponse } from "next/server";
import { evalConditions } from "@/lib/comboEval";
import { evaluateTrends } from "@/lib/trendService";

// ---------------------------------------------------------------------------
// ONE consolidated brief — twice a day, everything in a single table email.
//
// Replaces the old fragmented mails (separate price-alert, combo, digest and
// trend emails, each firing on its own cycle). Instead, this single cron runs
// pre-open and post-close, reads every cloud-synced user's bundle, and sends
// ONE email per user with all sections stacked as tables:
//   1. Portfolio snapshot   (price · day% · trend)
//   2. Price levels reached  (target/stop/support/resistance currently crossed)
//   3. Combinations matched  (their saved combos hitting now)
//   4. Trend changes         (MA state flips on the latest daily close)
//
// It is a SNAPSHOT digest, not a fire-once alert stream, so it keeps no
// seen-state — each run simply reports the current picture. Research support
// only; never buy/sell advice.
//
// Env: CRON_SECRET, RESEND_API_KEY, (optional) RESEND_FROM, KV/Upstash store.
// The recipient is each user's own alertEmail (set in the app's Alerts panel).
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STORE_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const STORE_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "StockAnalytix <onboarding@resend.dev>";

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

const esc = (s: unknown) =>
  String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sym$ = (cur?: string | null) => (cur === "INR" ? "₹" : cur === "USD" ? "$" : cur ? `${cur} ` : "");
const pctCell = (p?: number | null) => {
  if (p == null) return `<td style="padding:8px 10px;text-align:right;color:#94a3b8">—</td>`;
  const up = p >= 0;
  return `<td style="padding:8px 10px;text-align:right;font-weight:700;color:${up ? "#059669" : "#e11d48"}">${up ? "+" : ""}${fmt(p)}%</td>`;
};

function section(title: string, head: string, rows: string): string {
  if (!rows) return "";
  return `
  <div style="margin:18px 0 6px;font-weight:800;color:#0f172a;font-size:15px">${title}</div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px">
    <thead><tr style="background:#f1f5f9;color:#475569;text-align:left">${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

const th = (t: string, align: "left" | "right" = "left") =>
  `<th style="padding:8px 10px;font-weight:700;text-align:${align}">${t}</th>`;
const td = (t: string, align: "left" | "right" = "left", extra = "") =>
  `<td style="padding:8px 10px;text-align:${align};${extra}">${t}</td>`;

type Bundle = any;

function buildUserEmail(bundle: Bundle, quotes: Record<string, any>, comboRows: any[], trends: any[]) {
  const portfolio: any[] = Array.isArray(bundle.sa_portfolio) ? bundle.sa_portfolio : [];
  const watchlist: any[] = Array.isArray(bundle.sa_watchlist) ? bundle.sa_watchlist : [];
  const alerts: any[] = Array.isArray(bundle.sa_price_alerts) ? bundle.sa_price_alerts : [];
  const combos: any[] = Array.isArray(bundle.sa_combinations) ? bundle.sa_combinations : [];

  // ---- 1. Holdings + watchlist snapshot (sorted by day change) -----------
  // Price + day% only — reliably filled for every stock. Per-stock MA trend is
  // heavy (needs full history per symbol and Yahoo rate-limits bulk history
  // from server IPs), so trend lives in its own "Trend changes" section below
  // rather than a mostly-blank column here.
  const snapItems = [
    ...portfolio.map((h) => ({ symbol: String(h.symbol || "").toUpperCase(), name: h.name, tag: "Holding" })),
    ...watchlist.map((w) => ({ symbol: String(w.symbol || "").toUpperCase(), name: w.name, tag: "Watch" })),
  ].filter((x, i, arr) => x.symbol && arr.findIndex((y) => y.symbol === x.symbol) === i);

  const snapRows = snapItems
    .map((it) => {
      const q = quotes[it.symbol];
      const price = q?.price;
      const cur = sym$(q?.currency);
      const name = q?.name || it.name || it.symbol;
      return {
        chg: q?.changePct ?? null,
        html: `<tr style="border-top:1px solid #e2e8f0">
          ${td(`<b style="color:#0f172a">${esc(name)}</b> <span style="color:#94a3b8">${esc(it.symbol)}</span> <span style="color:#c7cdd6">·</span> <span style="color:#64748b">${it.tag}</span>`)}
          ${td(price != null ? `${cur}${fmt(price)}` : "—", "right", "color:#334155")}
          ${pctCell(q?.changePct)}
        </tr>`,
      };
    })
    .sort((a, b) => (b.chg ?? -999) - (a.chg ?? -999))
    .map((r) => r.html)
    .join("");
  const snapshot = section(
    `📊 Portfolio &amp; Watchlist — ${snapItems.length} stocks`,
    th("Stock") + th("Price", "right") + th("Day", "right"),
    snapRows,
  );

  // ---- 2. Price levels currently reached ---------------------------------
  const levelRows: string[] = [];
  for (const a of alerts) {
    if (!a || a.status === "paused") continue;
    const s = String(a.symbol || "").toUpperCase();
    const q = quotes[s];
    const price = q?.price;
    if (price == null) continue;
    const cur = sym$(q?.currency);
    for (const lv of LEVELS) {
      const target = a.levels?.[lv.key];
      if (target == null) continue;
      const hit = lv.dir === "up" ? price >= target : price <= target;
      if (!hit) continue;
      levelRows.push(`<tr style="border-top:1px solid #e2e8f0">
        ${td(`<b>${esc(s)}</b>`)}
        ${td(esc(lv.label), "left", lv.dir === "up" ? "color:#059669" : "color:#e11d48")}
        ${td(`${cur}${fmt(target)}`, "right", "color:#64748b")}
        ${td(`${cur}${fmt(price)}`, "right", "color:#0f172a;font-weight:700")}
      </tr>`);
    }
  }
  const levels = section(
    "🎯 Price levels reached",
    th("Stock") + th("Level") + th("Your price", "right") + th("Now", "right"),
    levelRows.join(""),
  );

  // ---- 3. Combinations matched -------------------------------------------
  const comboRowsHtml: string[] = [];
  for (const combo of combos) {
    for (const r of comboRows) {
      if (!evalConditions(r, combo.conditions || {}).match) continue;
      const s = String(r.symbol).toUpperCase();
      comboRowsHtml.push(`<tr style="border-top:1px solid #e2e8f0">
        ${td(`<b>${esc(s)}</b>`)}
        ${td(esc(combo.label || combo.name || "combination"), "left", "color:#4f46e5;font-weight:600")}
      </tr>`);
    }
  }
  const matched = section(
    "🧩 Combinations matched",
    th("Stock") + th("Combination"),
    comboRowsHtml.join(""),
  );

  // ---- 4. Trend changes on the latest daily close ------------------------
  const trendRows: string[] = [];
  for (const t of trends) {
    if (!t?.ok || !(t.events?.length)) continue;
    const evs = t.events
      .map((e: any) => `<div style="color:${e.kind === "bull" ? "#059669" : "#e11d48"}">${esc(e.message)}</div>`)
      .join("");
    trendRows.push(`<tr style="border-top:1px solid #e2e8f0">${td(evs)}</tr>`);
  }
  const trendChanges = section(
    "🔔 Trend changes (latest close)",
    th("Moving-average signal"),
    trendRows.join(""),
  );

  const hasContent = Boolean(snapRows || levelRows.length || comboRowsHtml.length || trendRows.length);
  if (!hasContent) return null;

  return { snapshot, levels, matched, trendChanges };
}

function wrapEmail(sess: "am" | "pm", parts: NonNullable<ReturnType<typeof buildUserEmail>>, dateStr: string) {
  const heading = sess === "am" ? "☀️ Morning Brief" : "🌆 Evening Brief";
  const sub = sess === "am" ? "Pre-market snapshot" : "Post-close wrap";
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:660px;margin:auto;padding:4px 2px">
    <div style="display:flex;align-items:baseline;gap:10px">
      <h2 style="color:#4f46e5;margin:0">${heading}</h2>
      <span style="color:#94a3b8;font-size:12px">${sub} · ${esc(dateStr)}</span>
    </div>
    ${parts.snapshot}
    ${parts.levels}
    ${parts.matched}
    ${parts.trendChanges}
    <p style="color:#94a3b8;font-size:11px;margin-top:18px;line-height:1.5">
      One consolidated brief · sent twice daily. Prices &amp; day-change are live; trend is from daily moving averages (10/20/50/200).
      Research support only — not buy/sell advice. Verify independently.
    </p>
  </div>`;
}

// Quotes for many symbols, resilient to Yahoo throttling server IPs: request in
// small batches (a big single call loses its tail chunks), retry each batch, and
// do a final sweep for any symbol still missing a price. Keyed UPPERCASE so the
// snapshot lookup always matches.
async function fetchQuotes(origin: string, syms: string[]): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  if (!origin || !syms.length) return out;
  const BATCH = 20;
  const post = async (batch: string[]) => {
    const r = await fetch(`${origin}/api/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: batch }),
      cache: "no-store",
    });
    const j = await r.json();
    return (j.quotes || {}) as Record<string, any>;
  };
  for (let i = 0; i < syms.length; i += BATCH) {
    const batch = syms.slice(i, i + BATCH);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const q = await post(batch);
        let got = 0;
        for (const [k, v] of Object.entries(q)) {
          const key = k.toUpperCase();
          if ((v as any)?.price != null || !(key in out)) out[key] = v;
          if ((v as any)?.price != null) got++;
        }
        if (got >= batch.length * 0.6) break; // good coverage → next batch
      } catch { /* retry once */ }
    }
  }
  // Final sweep for anything still without a price.
  const missing = syms.filter((s) => out[s]?.price == null);
  if (missing.length) {
    try {
      const q = await post(missing.slice(0, 30));
      for (const [k, v] of Object.entries(q)) if ((v as any)?.price != null) out[k.toUpperCase()] = v;
    } catch { /* best effort */ }
  }
  return out;
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
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!STORE_URL || !STORE_TOKEN) {
    return NextResponse.json({ error: "Cloud store not configured" }, { status: 503 });
  }
  if (!RESEND_KEY) {
    return NextResponse.json({ skipped: true, reason: "RESEND_API_KEY not set" });
  }

  // Session: explicit ?session= wins; else derive from the UTC hour
  // (morning runs land before ~08:00 UTC, evening after).
  const qSess = url.searchParams.get("session");
  const sess: "am" | "pm" = qSess === "am" || qSess === "pm" ? qSess : new Date().getUTCHours() < 8 ? "am" : "pm";
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  // IMPORTANT: self-fetch the PUBLIC production alias, not url.origin. Vercel Cron
  // invokes the deployment-specific URL (…-hash.vercel.app), which sits behind
  // Deployment Protection — fetching /api/quotes there returns an auth page, not
  // JSON, so every price came back blank. The production alias is public.
  const origin = process.env.SELF_BASE_URL || "https://stockanalytix.vercel.app";

  const codesRes = await redis(["SMEMBERS", "sync:index"]);
  const codes: string[] = Array.isArray(codesRes?.result) ? codesRes.result : [];

  let checked = 0, emailed = 0;

  for (const code of codes) {
    try {
      const bRes = await redis(["GET", `sync:${code}`]);
      const raw = bRes?.result;
      if (!raw) continue;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const bundle = parsed?.bundle || {};
      const email = bundle?.sa_settings?.alertEmail;
      if (!email) continue;

      const portfolio: any[] = Array.isArray(bundle.sa_portfolio) ? bundle.sa_portfolio : [];
      const watchlist: any[] = Array.isArray(bundle.sa_watchlist) ? bundle.sa_watchlist : [];
      const alerts: any[] = Array.isArray(bundle.sa_price_alerts) ? bundle.sa_price_alerts : [];
      const combos: any[] = Array.isArray(bundle.sa_combinations) ? bundle.sa_combinations : [];
      if (!portfolio.length && !watchlist.length && !alerts.length) continue;
      checked++;

      // Symbols to price: everything the user tracks.
      const allSyms = Array.from(
        new Set(
          [
            ...portfolio.map((h) => String(h.symbol || "").toUpperCase()),
            ...watchlist.map((w) => String(w.symbol || "").toUpperCase()),
            ...alerts.map((a) => String(a.symbol || "").toUpperCase()),
          ].filter(Boolean),
        ),
      );

      // Live quotes (batched + retried) for the snapshot + level checks.
      const quotes = await fetchQuotes(origin, allSyms);

      // Screen metrics only if the user has combinations to evaluate.
      let comboRows: any[] = [];
      const comboSyms = Array.from(
        new Set([...portfolio, ...watchlist].map((x: any) => String(x.symbol || "").toUpperCase()).filter(Boolean)),
      );
      if (combos.length && comboSyms.length && origin) {
        try {
          const trigger = {
            earningsUp: combos.some((c) => c.conditions?.earningsUp),
            atAth: combos.some((c) => c.conditions?.atAth),
            atAtl: combos.some((c) => c.conditions?.atAtl),
          };
          const r = await fetch(`${origin}/api/screen`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbols: comboSyms, conditions: trigger }),
            cache: "no-store",
          });
          const j = await r.json();
          comboRows = (j.results || []).filter((x: any) => x.ok);
        } catch { /* combos section omitted this run */ }
      }

      // MA trend state + trend-change events (capped at 30 by the service).
      let trends: any[] = [];
      const trendSyms = [...portfolio, ...watchlist]
        .map((x: any) => ({ symbol: String(x.symbol || "").toUpperCase(), name: x.name }))
        .filter((x) => x.symbol);
      if (trendSyms.length) {
        try {
          trends = await evaluateTrends(trendSyms);
        } catch { /* trend sections omitted this run */ }
      }

      const parts = buildUserEmail(bundle, quotes, comboRows, trends);
      if (!parts) continue;

      const html = wrapEmail(sess, parts, dateStr);
      const subject = `${sess === "am" ? "☀️ Morning" : "🌆 Evening"} Brief — StockAnalytix · ${dateStr}`;
      if (await sendResend(email, subject, html)) emailed++;
    } catch {
      /* one bad bundle shouldn't stop the rest */
    }
  }

  return NextResponse.json({ ok: true, session: sess, users: codes.length, checked, emailed });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
