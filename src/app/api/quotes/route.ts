import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { loadDurableQuotes, saveDurableQuotes } from "@/lib/quoteCache";

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
  marketCap: number | null;
  ok: boolean;
};

// Short-lived per-symbol cache. Several pollers (dashboard, markets, alert
// monitor) request overlapping symbols; this collapses them so each symbol
// hits Yahoo at most once per TTL, and a transient failure serves the last
// good value instead of blanks. Per warm instance — a cold start just re-warms.
const CACHE = new Map<string, { data: QuoteLite; exp: number }>();
const CACHE_TTL = 12_000; // ms
// Last-known-good value per symbol, kept beyond the TTL. Yahoo frequently returns
// a 200 with a null price under load — a "soft failure" that isn't an exception.
// When a fetch comes back empty (soft-fail or thrown), we serve this instead of a
// blank, so indices and scans never suddenly show "—". Bounded to stay small.
const LAST = new Map<string, QuoteLite>();

// Map one raw Yahoo quote object → QuoteLite (null if it has no usable price).
function quoteFromRaw(symbol: string, q: any): QuoteLite | null {
  const price = q?.regularMarketPrice ?? q?.currentPrice ?? null;
  if (typeof price !== "number") return null;
  const num = (v: any) => (typeof v === "number" ? v : null);
  let time: number | null = null;
  if (q?.regularMarketTime) {
    const t = Number(q.regularMarketTime);
    if (!Number.isNaN(t)) time = t > 1e12 ? t : t * 1000;
  }
  return {
    symbol,
    name: q?.shortName || q?.longName || null,
    price,
    change: num(q?.regularMarketChange),
    changePct: num(q?.regularMarketChangePercent),
    open: num(q?.regularMarketOpen),
    dayHigh: num(q?.regularMarketDayHigh),
    dayLow: num(q?.regularMarketDayLow),
    prevClose: num(q?.regularMarketPreviousClose),
    time,
    currency: q?.currency || null,
    marketState: q?.marketState || null,
    marketCap: num(q?.marketCap) ?? (typeof q?.sharesOutstanding === "number" ? Math.round(q.sharesOutstanding * price) : null),
    ok: true,
  };
}

// Batch-fetch many symbols with FEW Yahoo calls: quote() accepts an array, so we
// chunk by 50 instead of firing one HTTP request per symbol (150 symbols → ~3
// requests, not 150). The single biggest load-latency win. Returns only the
// symbols that came back with a price; missing ones fall back to last-known-good.
async function fetchQuotesBatch(symbols: string[]): Promise<Map<string, QuoteLite>> {
  const out = new Map<string, QuoteLite>();
  if (!symbols.length) return out;
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 50) chunks.push(symbols.slice(i, i + 50));
  await Promise.all(
    chunks.map(async (ch) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const qs: any = await yahooFinance.quote(ch);
          for (const q of Array.isArray(qs) ? qs : [qs]) {
            const sym = String(q?.symbol || "").toUpperCase();
            if (!sym) continue;
            const lite = quoteFromRaw(sym, q);
            if (lite) out.set(sym, lite);
          }
          break;
        } catch {
          if (attempt === 0) { await new Promise((r) => setTimeout(r, 300)); continue; }
        }
      }
    }),
  );
  return out;
}

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
    ).slice(0, 520); // bound the fan-out (fits the ~500-symbol breadth basket)

    if (clean.length === 0) {
      return NextResponse.json({ quotes: {} });
    }

    const now = Date.now();
    // Serve fresh-cached symbols instantly; only the rest go to Yahoo — in ONE
    // batched call set, not one request per symbol.
    const cachedResults = new Map<string, QuoteLite>();
    const toFetch: string[] = [];
    for (const symbol of clean) {
      const hit = CACHE.get(symbol);
      if (hit && hit.exp > now) cachedResults.set(symbol, hit.data);
      else toFetch.push(symbol);
    }

    const fetched = await fetchQuotesBatch(toFetch);
    const freshFetched: { symbol: string; data: QuoteLite }[] = [];
    for (const [sym, lite] of fetched) {
      CACHE.set(sym, { data: lite, exp: now + CACHE_TTL });
      LAST.set(sym, lite);
      freshFetched.push({ symbol: sym, data: lite });
    }

    const results: QuoteLite[] = clean.map((symbol) => {
      const cached = cachedResults.get(symbol);
      if (cached) return cached;
      const fresh = fetched.get(symbol);
      if (fresh) return fresh;
      // Yahoo didn't return this one — show the last-known-good instead of a
      // blank (a slightly stale value beats "—").
      const stale = LAST.get(symbol) || CACHE.get(symbol)?.data;
      if (stale && stale.price != null) return stale;
      return {
        symbol, name: null, price: null, change: null, changePct: null,
        open: null, dayHigh: null, dayLow: null, prevClose: null, time: null,
        currency: null, marketState: null, marketCap: null, ok: false,
      };
    });

    // Backfill symbols that are STILL blank (Yahoo soft-failed and the in-memory
    // last-good was empty — e.g. right after a serverless cold start) from the
    // durable Supabase cache, so a value shows instead of "—".
    const blanks = results.filter((r) => r.price == null).map((r) => r.symbol);
    if (blanks.length) {
      const durable = await loadDurableQuotes(blanks);
      for (let i = 0; i < results.length; i++) {
        if (results[i].price != null) continue;
        const d = durable[results[i].symbol];
        if (d && d.price != null) {
          LAST.set(results[i].symbol, d as QuoteLite); // re-warm in-memory
          results[i] = d as QuoteLite;
        }
      }
    }

    // Persist freshly-fetched quotes so the NEXT cold start can serve them.
    await saveDurableQuotes(freshFetched);
    // Keep the caches from growing unbounded on a long-lived instance.
    if (LAST.size > 800) { let i = 0; for (const k of LAST.keys()) { if (i++ > 400) LAST.delete(k); } }
    if (CACHE.size > 600) {
      for (const [k, v] of CACHE) if (v.exp <= now) CACHE.delete(k);
    }

    const quotes: Record<string, QuoteLite> = {};
    for (const r of results) quotes[r.symbol] = r;

    return NextResponse.json({ quotes, count: results.length, generatedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
