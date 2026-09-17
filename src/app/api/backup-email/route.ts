import { NextRequest, NextResponse } from "next/server";

// Email a full data backup (JSON) to the owner's inbox. Called from the app with
// the user's current data bundle; the JSON is attached so it can be re-imported
// later. Sends only to DIGEST_EMAIL (the account owner) — never an arbitrary
// address — since the free email sender can only deliver to the owner anyway.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "StockAnalytix <onboarding@resend.dev>";
  const to = process.env.DIGEST_EMAIL;
  if (!key) return NextResponse.json({ ok: false, error: "Email not configured (RESEND_API_KEY)." });
  if (!to) return NextResponse.json({ ok: false, error: "No backup email set (DIGEST_EMAIL)." });

  const body = await req.json().catch(() => ({}));
  const bundle = body?.bundle;
  if (!bundle || typeof bundle !== "object") {
    return NextResponse.json({ ok: false, error: "No data to back up." });
  }

  const json = JSON.stringify(bundle, null, 2);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  const date = new Date().toISOString().slice(0, 10);
  const keys = Object.keys(bundle).length;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `🗄️ StockAnalytix data backup — ${date}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
          <h2 style="color:#4f46e5">🗄️ Your StockAnalytix backup</h2>
          <p style="color:#334155">Attached is a full JSON backup of your data (${keys} sections) as of ${date}.
          Keep this email — it can be re-imported to restore everything.</p>
          <p style="color:#94a3b8;font-size:12px">Automated backup. Contains your saved app data only — no passwords or keys.</p>
        </div>`,
        attachments: [{ filename: `stockanalytix-backup-${date}.json`, content: b64 }],
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ ok: false, error: j?.message || `send failed (${res.status})` });
    return NextResponse.json({ ok: true, to });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "send failed" });
  }
}
