import { NextRequest, NextResponse } from "next/server";
import { runDigest, type StockInput } from "@/lib/digestService";
import { runWithUsage, currentUsage } from "@/lib/aiClient";

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const stocks: StockInput[] = Array.isArray(body.stocks) ? body.stocks : [];
    if (stocks.length === 0) {
      return NextResponse.json({ error: "Provide at least one stock." }, { status: 400 });
    }
    const { result, aiTokens } = await runWithUsage(async () => {
      const r = await runDigest(stocks);
      const u = currentUsage();
      return { result: r, aiTokens: u?.tokens ?? 0, usage: u };
    });
    return NextResponse.json({ ...result, aiTokens });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
