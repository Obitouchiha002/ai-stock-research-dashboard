import { NextRequest, NextResponse } from "next/server";

// Sends a real alert email via Resend. Called by the client alert monitor the
// moment a price condition triggers. Requires RESEND_API_KEY; the recipient is
// the address the user set in the app. Returns ok:false (not an error status) so
// the client can surface a gentle "email not configured" without breaking.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const to = String(body.to || "").trim();
  const subject = String(body.subject || "StockAnalytix alert").slice(0, 200);
  const text = String(body.text || "").slice(0, 4000);

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "StockAnalytix <onboarding@resend.dev>";
  if (!key) return NextResponse.json({ ok: false, error: "Email not set up (RESEND_API_KEY missing on server)." });
  if (!to) return NextResponse.json({ ok: false, error: "No recipient email set." });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ ok: false, error: j?.message || `send failed (${res.status})` });
    return NextResponse.json({ ok: true, id: j?.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "send failed" });
  }
}
