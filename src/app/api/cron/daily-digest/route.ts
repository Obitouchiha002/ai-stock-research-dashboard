import { NextRequest, NextResponse } from "next/server";
import { runDigest } from "@/lib/digestService";

// Scheduled daily digest -> email. Triggered by Vercel Cron (see vercel.json).
// Safe no-op until configured, so it never errors on an unconfigured deploy.
//
// Required env to actually send:
//   CRON_SECRET      shared secret; Vercel Cron sends it as a Bearer token
//   DIGEST_SYMBOLS   comma list, e.g. "AAPL,RELIANCE.NS,TCS.NS"
//   DIGEST_EMAIL     recipient address
//   RESEND_API_KEY   Resend API key (https://resend.com)
//   RESEND_FROM      verified sender, e.g. "Digest <digest@yourdomain.com>"
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function esc(s: string) {
  return String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

function buildEmailHtml(result: any): string {
  const rows = (result.digests || [])
    .map((d: any) => {
      const up = (d.changePct ?? 0) >= 0;
      const chg =
        d.changePct != null
          ? `<span style="color:${up ? "#059669" : "#e11d48"};font-weight:700">${up ? "+" : ""}${d.changePct.toFixed(2)}%</span>`
          : "";
      const bullets = (d.bullets || []).slice(0, 5).map((b: string) => `<li>${esc(b)}</li>`).join("");
      const links = (d.news || [])
        .slice(0, 3)
        .map((n: any) => `<a href="${esc(n.url)}" style="color:#4f46e5;font-size:12px">${esc(n.title)}</a>`)
        .join("<br/>");
      return `
      <tr><td style="padding:16px;border-bottom:1px solid #e2e8f0">
        <div style="font-weight:800;color:#0f172a">${esc(d.name)} <span style="color:#94a3b8;font-size:12px">${esc(d.symbol)}</span> &nbsp; ${chg}</div>
        <ul style="margin:8px 0;padding-left:18px;color:#334155;font-size:14px">${bullets || `<li>${esc(d.summary || "No material developments.")}</li>`}</ul>
        ${links ? `<div style="margin-top:6px">${links}</div>` : ""}
      </td></tr>`;
    })
    .join("");

  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto">
    <h2 style="color:#4f46e5">📈 Daily Stock Digest</h2>
    <p style="color:#64748b;font-size:13px">What changed in the last 24 hours · ${new Date(result.generatedAt).toLocaleString()}</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px">${rows}</table>
    <p style="color:#94a3b8;font-size:11px;margin-top:16px">${esc(result.disclaimer || "")}</p>
  </div>`;
}

async function handle(req: NextRequest) {
  // Auth: require the Bearer secret when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const symbols = (process.env.DIGEST_SYMBOLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const email = process.env.DIGEST_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (symbols.length === 0 || !email || !resendKey || !from) {
    return NextResponse.json({
      skipped: true,
      reason: "Not configured. Set DIGEST_SYMBOLS, DIGEST_EMAIL, RESEND_API_KEY, RESEND_FROM.",
      have: { symbols: symbols.length, email: !!email, resendKey: !!resendKey, from: !!from },
    });
  }

  const result = await runDigest(symbols.map((symbol) => ({ symbol })));

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `📈 Daily Stock Digest — ${new Date().toLocaleDateString()}`,
      html: buildEmailHtml(result),
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: `Email failed: ${res.status} ${t.slice(0, 200)}` }, { status: 502 });
  }
  return NextResponse.json({ sent: true, to: email, count: result.digests.length });
}

// Vercel Cron issues a GET; POST kept for manual triggering.
export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
