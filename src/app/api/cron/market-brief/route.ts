import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Daily Market Overview email — one whole-market wrap, once a day.
//
// Calls /api/market-overview for the US and India universes (the same scan the
// Market Overview page uses) and emails a compact table digest: top gainers,
// losers, most-active, fresh 52-week highs and names near all-time highs — per
// market. Research support only; never buy/sell advice.
//
// Self-fetches the PUBLIC production alias (not url.origin) for the same reason
// the consolidated brief does: Vercel Cron hits the protected deployment URL.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || "";
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "StockAnalytix <onboarding@resend.dev>";
const SELF_BASE = process.env.SELF_BASE_URL || "https://stockanalytix.vercel.app";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
const fmtN = (n: number, d = 2) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const sym$ = (cur?: string | null) => (cur === "INR" ? "₹" : cur === "USD" ? "$" : cur ? `${cur} ` : "");

function pctSpan(p?: number | null) {
  if (p == null) return `<span style="color:#94a3b8">—</span>`;
  const up = p >= 0;
  return `<span style="color:${up ? "#059669" : "#e11d48"};font-weight:700">${up ? "+" : ""}${fmtN(p)}%</span>`;
}

// Compact "Symbol · price · change%" table for one bucket. Falls back to nothing
// when the bucket is empty (section is then skipped).
function bucketTable(title: string, rows: any[], n = 8): string {
  const body = (rows || [])
    .slice(0, n)
    .map((r) => {
      const cur = sym$(r.currency);
      return `<tr style="border-top:1px solid #e2e8f0">
        <td style="padding:6px 10px"><b style="color:#0f172a">${esc(r.symbol)}</b> <span style="color:#94a3b8;font-size:12px">${esc((r.name || "").slice(0, 26))}</span></td>
        <td style="padding:6px 10px;text-align:right;color:#334155">${r.price != null ? `${cur}${fmtN(r.price)}` : "—"}</td>
        <td style="padding:6px 10px;text-align:right">${pctSpan(r.changePct)}</td>
      </tr>`;
    })
    .join("");
  if (!body) return "";
  return `<div style="margin:14px 0 4px;font-weight:800;color:#0f172a;font-size:14px">${title}</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px">
      <tbody>${body}</tbody>
    </table>`;
}

function marketBlock(flag: string, label: string, buckets: any): string {
  if (!buckets) return "";
  const parts = [
    bucketTable("🚀 Top gainers", buckets.gainers),
    bucketTable("🔻 Top losers", buckets.losers),
    bucketTable("🔥 Most active", buckets.mostActive),
    bucketTable("⬆️ New 52-week highs", buckets.newHighs, 6),
    bucketTable("🎯 Near all-time high", buckets.nearAth, 6),
  ].filter(Boolean);
  if (!parts.length) return "";
  return `<div style="margin-top:18px">
    <div style="font-size:16px;font-weight:800;color:#4f46e5">${flag} ${label}</div>
    ${parts.join("")}
  </div>`;
}

async function fetchMarket(market: "us" | "in"): Promise<any> {
  try {
    const r = await fetch(`${SELF_BASE}/api/market-overview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ market }),
      cache: "no-store",
    });
    const j = await r.json();
    return j?.buckets || null;
  } catch {
    return null;
  }
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const provided = url.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!RESEND_KEY) return NextResponse.json({ skipped: true, reason: "RESEND_API_KEY not set" });
  const to = process.env.DIGEST_EMAIL;
  if (!to) return NextResponse.json({ skipped: true, reason: "DIGEST_EMAIL not set" });

  // Both universes in parallel so wall-clock ≈ the slower single scan.
  const [us, ind] = await Promise.all([fetchMarket("us"), fetchMarket("in")]);

  const blocks = [marketBlock("🇮🇳", "India (NSE)", ind), marketBlock("🇺🇸", "United States (S&P)", us)].filter(Boolean);
  if (!blocks.length) {
    return NextResponse.json({ sent: false, reason: "No market data available this run." });
  }

  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:660px;margin:auto;padding:4px 2px">
    <div style="display:flex;align-items:baseline;gap:10px">
      <h2 style="color:#4f46e5;margin:0">📈 Daily Market Overview</h2>
      <span style="color:#94a3b8;font-size:12px">${esc(dateStr)}</span>
    </div>
    <p style="color:#64748b;font-size:12px;margin:4px 0 0">The day's movers across the US and Indian markets.</p>
    ${blocks.join("")}
    <p style="color:#94a3b8;font-size:11px;margin-top:18px;line-height:1.5">
      Live scan of the tracked universes. Research support only — not buy/sell advice. Verify independently.
    </p>
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject: `📈 Daily Market Overview — ${dateStr}`, html }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Email failed: ${res.status} ${t.slice(0, 160)}` }, { status: 502 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "send failed" }, { status: 502 });
  }
  return NextResponse.json({ sent: true, to, markets: { us: !!us, in: !!ind } });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
