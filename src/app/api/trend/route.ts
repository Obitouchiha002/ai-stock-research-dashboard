import { NextRequest, NextResponse } from "next/server";
import { evaluateTrends } from "@/lib/trendService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const stocks: { symbol: string; name?: string }[] = Array.isArray(body.stocks) ? body.stocks : [];
    if (stocks.length === 0) return NextResponse.json({ error: "Provide at least one stock." }, { status: 400 });
    const results = await evaluateTrends(stocks);
    return NextResponse.json({ generatedAt: new Date().toISOString(), results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
