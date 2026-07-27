import { NextRequest, NextResponse } from "next/server";
import { evaluateTrends, STATE_LABEL } from "@/lib/trendService";

// Scheduled trend-change email. Triggered by Vercel Cron (see vercel.json)
// after market close. Because trend changes are detected intrinsically from the
// latest daily bar (bar-over-bar on closes), this needs NO stored state — one
// daily run catches that day's changes. Safe no-op until configured.
//
// Env to send:
//   CRON_SECRET     shared secret (Vercel Cron sends it as a Bearer token)
//   TREND_SYMBOLS   comma list; falls back to DIGEST_SYMBOLS if unset
//   DIGEST_EMAIL    recipient
//   RESEND_API_KEY  Resend API key
//   RESEND_FROM     verified sender (defaults to onboarding@resend.dev)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function esc(s: string) {
  return String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

function buildEmail(rows: { name: string; symbol: string; state: string; events: any[] }[]) {
  const items = rows
    .map((r) => {
      const evs = r.events.map((e) => `<li style="color:${e.kind === "bull" ? "#059669" : "#e11d48"}">${esc(e.message)}</li>`).join("");
      return `<tr><td style="padding:14px;border-bottom:1px solid #e2e8f0">
        <div style="font-weight:800;color:#0f172a">${esc(r.name)} <span style="color:#94a3b8;font-weight:400">${esc(r.symbol)}</span> · <span style="color:#475569">${esc(STATE_LABEL[r.state as keyof typeof STATE_LABEL] || r.state)}</span></div>
        <ul style="margin:6px 0;padding-left:18px;font-size:14px">${evs}</ul>
      </td></tr>`;
    })
    .join("");
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto">
    <h2 style="color:#4f46e5">🔔 Trend Alerts</h2>
    <p style="color:#64748b;font-size:13px">Moving-average trend changes on today's close · ${new Date().toLocaleString()}</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px">${items}</table>
    <p style="color:#94a3b8;font-size:11px;margin-top:16px">Research support only. Not buy/sell advice. Based on daily moving averages (10/20/50/200). Verify independently.</p>
  </div>`;
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const symbols = (process.env.TREND_SYMBOLS || process.env.DIGEST_SYMBOLS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const email = process.env.DIGEST_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Trend Alerts <onboarding@resend.dev>";

  if (symbols.length === 0 || !email || !resendKey) {
    return NextResponse.json({
      skipped: true,
      reason: "Not configured. Set TREND_SYMBOLS (or DIGEST_SYMBOLS), DIGEST_EMAIL, RESEND_API_KEY.",
    });
  }

  const results = await evaluateTrends(symbols.map((symbol) => ({ symbol })));
  const changed = results
    .filter((r) => r.ok && (r.events?.length || 0) > 0)
    .map((r) => ({ name: r.name!, symbol: r.symbol, state: r.state!, events: r.events! }));

  if (changed.length === 0) {
    return NextResponse.json({ sent: false, reason: "No trend changes on today's bar.", scanned: results.length });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `🔔 Trend Alerts — ${changed.length} change${changed.length > 1 ? "s" : ""} today`,
      html: buildEmail(changed),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: `Email failed: ${res.status} ${t.slice(0, 200)}` }, { status: 502 });
  }
  return NextResponse.json({ sent: true, to: email, changes: changed.length });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
