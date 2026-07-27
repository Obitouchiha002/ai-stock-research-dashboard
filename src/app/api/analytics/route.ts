import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();
import { subDays } from "date-fns";
import { normalizeSymbol } from "@/lib/symbolNormalizer";
import { computeAnalytics } from "@/lib/analyticsService";

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
// force-dynamic prevents build-time prerendering of this handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const market = body.market || "US";
    let query = body.symbol || body.query;
    query = query && typeof query === "string" ? query.trim() : null;
    if (!query) return NextResponse.json({ error: "symbol is required" }, { status: 400 });

    // Resolve symbol
    const norm = normalizeSymbol(query, market);
    const trySymbols = norm ? norm.possibleSymbols : [query];
    let symbol = query;
    let resolved = false;
    for (const sym of trySymbols) {
      try {
        const q: any = await yahooFinance.quote(sym);
        if (q && q.regularMarketPrice) {
          symbol = q.symbol;
          resolved = true;
          break;
        }
      } catch {
        /* next */
      }
    }
    if (!resolved) {
      try {
        const sr: any = await yahooFinance.search(query);
        const best = sr.quotes?.find((q: any) => q.quoteType === "EQUITY") || sr.quotes?.[0];
        if (best) symbol = best.symbol;
      } catch {
        /* fall through */
      }
    }

    // ~4 years of daily candles so the backtest and seasonality have depth.
    const start = subDays(new Date(), 365 * 4 + 30);
    const chart: any = await yahooFinance
      .chart(symbol, { period1: start.toISOString().split("T")[0], interval: "1d" })
      .catch(() => null);
    const candles = (chart?.quotes || []).filter((q: any) => q && q.close != null);

    if (candles.length === 0) {
      return NextResponse.json(
        { error: `Analytics unavailable: no history for '${query}' from current provider.` },
        { status: 404 },
      );
    }

    const analytics = computeAnalytics(candles);
    return NextResponse.json({ analytics: { symbol, ...analytics } });
  } catch (error: any) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error in analytics module." },
      { status: 500 },
    );
  }
}
