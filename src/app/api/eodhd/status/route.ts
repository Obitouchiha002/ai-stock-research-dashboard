import { NextResponse } from "next/server";
import { eodhdRealTime, eodhdKeyKind, eodhdConfigured } from "@/lib/eodhd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verifies the EODHD pipe. AAPL.US works even on the free "demo" token, so this
// confirms connectivity before a paid key is added.
export async function GET() {
  const kind = eodhdKeyKind();
  try {
    const rt = await eodhdRealTime("AAPL.US");
    return NextResponse.json({
      ok: true,
      keyKind: kind,
      configured: eodhdConfigured(),
      sample: { symbol: "AAPL.US", close: rt?.close ?? rt?.previousClose ?? null, timestamp: rt?.timestamp ?? null },
      note: kind === "configured"
        ? "Live key working — full-universe scan & fundamentals can be switched on."
        : "Demo token working (AAPL only). Add a free/paid EODHD_API_KEY env var to unlock real data.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, keyKind: kind, error: e?.message || String(e) }, { status: 502 });
  }
}
