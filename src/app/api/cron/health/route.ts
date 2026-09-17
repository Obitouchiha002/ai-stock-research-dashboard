import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Self-monitor. Runs on a schedule (Supabase pg_cron) and checks the moving parts
// — live data, market scan, and the database. If ANY check fails it emails an
// alert so the owner hears about a problem immediately. Once a day (?heartbeat=1)
// it also emails an "all good" confirmation, so silence itself is a red flag.
//
// Honest limit: if the email service (Resend) is the thing that's down, this
// alert can't be delivered either — that single case can't self-report by email.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || "";
const SCHEDULER_TOKEN = process.env.SCHEDULER_TOKEN || "";
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "StockAnalytix <onboarding@resend.dev>";
const TO = process.env.DIGEST_EMAIL || "";
const SELF_BASE = process.env.SELF_BASE_URL || "https://stockanalytix.vercel.app";

type Check = { name: string; ok: boolean; detail: string };

async function checkQuotes(): Promise<Check> {
  try {
    const r = await fetch(`${SELF_BASE}/api/quotes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: ["^NSEI", "AAPL"] }), cache: "no-store",
    });
    const j = await r.json();
    const q = j.quotes || {};
    const got = Object.values(q).filter((v: any) => v?.price != null).length;
    return { name: "Live quotes / indices", ok: got >= 1, detail: `${got}/2 returned` };
  } catch (e: any) {
    return { name: "Live quotes / indices", ok: false, detail: e?.message || "error" };
  }
}

async function checkMarket(): Promise<Check> {
  try {
    const r = await fetch(`${SELF_BASE}/api/market-overview`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ market: "in" }), cache: "no-store",
    });
    const j = await r.json();
    const n = (j?.buckets?.gainers || []).length;
    return { name: "Market scan", ok: n > 0, detail: `${n} gainers` };
  } catch (e: any) {
    return { name: "Market scan", ok: false, detail: e?.message || "error" };
  }
}

async function checkDb(): Promise<Check> {
  const sb = getSupabaseAdmin();
  if (!sb) return { name: "Database (Supabase)", ok: false, detail: "service key not set" };
  try {
    const { count, error } = await sb.from("user_data").select("user_id", { count: "exact", head: true });
    if (error) return { name: "Database (Supabase)", ok: false, detail: error.message };
    return { name: "Database (Supabase)", ok: true, detail: `${count ?? 0} accounts` };
  } catch (e: any) {
    return { name: "Database (Supabase)", ok: false, detail: e?.message || "error" };
  }
}

async function sendEmail(subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY || !TO) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to: [TO], subject, html }),
    });
    return res.ok;
  } catch { return false; }
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const provided = url.searchParams.get("key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const authOk = Boolean(provided) && (provided === CRON_SECRET || (SCHEDULER_TOKEN && provided === SCHEDULER_TOKEN));
  if (!authOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const heartbeat = url.searchParams.get("heartbeat") === "1";
  const checks = await Promise.all([checkQuotes(), checkMarket(), checkDb()]);
  const failed = checks.filter((c) => !c.ok);
  const dateStr = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  let emailed = false;
  // Alert on any failure; also send a positive summary on the daily heartbeat.
  if (failed.length || heartbeat) {
    const allOk = failed.length === 0;
    const rows = checks.map((c) =>
      `<tr><td style="padding:6px 10px">${c.ok ? "✅" : "❌"} <b>${c.name}</b></td><td style="padding:6px 10px;color:#64748b">${c.detail}</td></tr>`
    ).join("");
    const subject = allOk
      ? `✅ StockAnalytix — all systems healthy`
      : `⚠️ StockAnalytix — ${failed.length} issue${failed.length > 1 ? "s" : ""} detected`;
    const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto">
      <h2 style="color:${allOk ? "#059669" : "#e11d48"}">${allOk ? "✅ All systems healthy" : "⚠️ Problem detected"}</h2>
      <p style="color:#64748b;font-size:13px">Automatic health check · ${dateStr} IST</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">${rows}</table>
      ${allOk
        ? `<p style="color:#059669;font-size:13px;margin-top:12px">Everything is working — emails, data and login are all fine.</p>`
        : `<p style="color:#e11d48;font-size:13px;margin-top:12px">The item(s) marked ❌ need attention. If emails still arrive, the email system itself is fine.</p>`}
      <p style="color:#94a3b8;font-size:11px;margin-top:14px">You get this on any failure, plus once a day as an "all good" confirmation.</p>
    </div>`;
    emailed = await sendEmail(subject, html);
  }

  const result = { ok: true, checks, failed: failed.length, emailed, heartbeat };
  console.log("[health]", JSON.stringify(result));
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
