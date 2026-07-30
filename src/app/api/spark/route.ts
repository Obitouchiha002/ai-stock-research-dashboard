import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

// Vercel: yahoo-finance2 needs the Node runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Compact sparkline endpoint for the dashboard ticker strip.
 * One call gives, per symbol: a downsampled intraday close series plus the
 * latest price and day change — enough to draw a mini chart and a % badge.
 *
 * POST { symbols: string[] } -> { data: Record<symbol, SparkLite> }
 */
type SparkLite = {
  symbol: string;
  series: number[];
  price: number | null;
  change: number | null;
  changePct: number | null;
  currency: string | null;
};

// 60s cache — the strip refreshes on a slow cadence and many viewers share it.
const CACHE = new Map<string, { data: SparkLite; exp: number }>();
const CACHE_TTL = 60_000;

// Keep at most N points so the payload stays tiny.
function downsample(arr: number[], max = 28): number[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbols: string[] = Array.isArray(body.symbols) ? body.symbols : [];
    const clean = Array.from(
      new Set(symbols.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)),
    ).slice(0, 20);
    if (clean.length === 0) return NextResponse.json({ data: {} });

    const now = Date.now();
    const period1 = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const results = await Promise.all(
      clean.map(async (symbol): Promise<SparkLite> => {
        const hit = CACHE.get(symbol);
        if (hit && hit.exp > now) return hit.data;
        try {
          const chart: any = await yahooFinance.chart(symbol, { period1, interval: "1h" });
          const rows = (chart?.quotes || []).filter((q: any) => q && q.close != null);
          const closes = rows.map((r: any) => Number(r.close)).filter((n: number) => Number.isFinite(n));
          const meta = chart?.meta || {};
          const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : closes[closes.length - 1] ?? null;
          // previousClose = the actual prior session close → true DAY change,
          // matching /api/quotes. (chartPreviousClose is the close before the
          // whole 6-day window, which would give a multi-day change.)
          const prev = Number.isFinite(meta.previousClose)
            ? meta.previousClose
            : Number.isFinite(meta.chartPreviousClose)
              ? meta.chartPreviousClose
              : null;
          const change = price != null && prev != null ? price - prev : null;
          const changePct = change != null && prev ? (change / prev) * 100 : null;
          const data: SparkLite = {
            symbol,
            series: downsample(closes),
            price: price ?? null,
            change,
            changePct,
            currency: meta.currency || null,
          };
          if (data.series.length) CACHE.set(symbol, { data, exp: now + CACHE_TTL });
          return data;
        } catch {
          if (hit) return hit.data;
          return { symbol, series: [], price: null, change: null, changePct: null, currency: null };
        }
      }),
    );

    if (CACHE.size > 200) for (const [k, v] of CACHE) if (v.exp <= now) CACHE.delete(k);

    const data: Record<string, SparkLite> = {};
    for (const r of results) data[r.symbol] = r;
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
