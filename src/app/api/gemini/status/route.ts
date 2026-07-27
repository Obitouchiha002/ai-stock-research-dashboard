import { NextRequest, NextResponse } from "next/server";

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
// force-dynamic prevents build-time prerendering of this handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const configured = !!process.env.GEMINI_API_KEY;
    const len = configured ? String(process.env.GEMINI_API_KEY).length : 0;
    return NextResponse.json({ configured, keyLength: configured ? len : 0 });
  } catch (e: any) {
    return NextResponse.json({ configured: false, error: e?.message || String(e) }, { status: 500 });
  }
}
