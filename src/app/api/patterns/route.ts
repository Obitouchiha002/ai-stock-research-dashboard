import { NextRequest, NextResponse } from "next/server";
import { detectPatterns } from "@/lib/patternService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol || "").trim().toUpperCase();
    const interval = body.interval === "1wk" ? "1wk" : "1d";
    if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
    const result = await detectPatterns(symbol, interval);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
