import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

// Vercel: yahoo-finance2 needs the Node runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Batch quote endpoint — one call, many symbols, fetched in parallel.
 * Powers the watchlist so a whole category refreshes fast.
 *
 * POST { symbols: string[] }  ->  { quotes: Record<symbol, QuoteLite> }
 */
type QuoteLite = {
  symbol: string;
  name: string | null;
  price: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  prevClose: number | null;
  time: number | null;
  currency: string | null;
  marketState: string | null;
  ok: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbols: string[] = Array.isArray(body.symbols) ? body.symbols : [];
    const clean = Array.from(
      new Set(
        symbols
          .map((s) => String(s || "").trim().toUpperCase())
          .filter(Boolean),
      ),
    ).slice(0, 60); // bound the fan-out

    if (clean.length === 0) {
      return NextResponse.json({ quotes: {} });
    }

    const results = await Promise.all(
      clean.map(async (symbol): Promise<QuoteLite> => {
        try {
          const q: any = await yahooFinance.quote(symbol);
          const price = q?.regularMarketPrice ?? q?.currentPrice ?? null;
          const num = (v: any) => (typeof v === "number" ? v : null);
          let time: number | null = null;
          if (q?.regularMarketTime) {
            const t = Number(q.regularMarketTime);
            if (!Number.isNaN(t)) time = t > 1e12 ? t : t * 1000;
          }
          return {
            symbol,
            name: q?.shortName || q?.longName || null,
            price: typeof price === "number" ? price : null,
            change: num(q?.regularMarketChange),
            changePct: num(q?.regularMarketChangePercent),
            open: num(q?.regularMarketOpen),
            dayHigh: num(q?.regularMarketDayHigh),
            dayLow: num(q?.regularMarketDayLow),
            prevClose: num(q?.regularMarketPreviousClose),
            time,
            currency: q?.currency || null,
            marketState: q?.marketState || null,
            ok: price != null,
          };
        } catch {
          return {
            symbol,
            name: null,
            price: null,
            change: null,
            changePct: null,
            open: null,
            dayHigh: null,
            dayLow: null,
            prevClose: null,
            time: null,
            currency: null,
            marketState: null,
            ok: false,
          };
        }
      }),
    );

    const quotes: Record<string, QuoteLite> = {};
    for (const r of results) quotes[r.symbol] = r;

    return NextResponse.json({ quotes, count: results.length, generatedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
