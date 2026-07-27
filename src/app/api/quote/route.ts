import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
// force-dynamic prevents build-time prerendering of this handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

    const quote = await yahooFinance.quote(symbol);
    const price = quote?.regularMarketPrice ?? quote?.currentPrice ?? null;
    let time = null;
    if (quote?.regularMarketTime) {
      // sometimes provided as epoch seconds
      const t = Number(quote.regularMarketTime);
      if (!Number.isNaN(t) && t > 1e9) time = new Date(t * 1000).toISOString();
    }
    if (!time) time = new Date().toISOString();

    return NextResponse.json({ price, time, raw: quote });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
