import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { eodhdBulkEodExtended, eodhdConfigured } from "@/lib/eodhd";
import { NIFTY500 } from "@/lib/universe";

// Full-market screener.
//   US  → one EODHD bulk-EOD extended call scans the whole US exchange; an
//         optional ?date=YYYY-MM-DD pulls that past day's bulk (the calendar),
//         so you can see each screen AS OF any date. Top 1000 by market cap.
//   IN  → EODHD has no India stocks, so India screens the NSE Nifty 500 via
//         Yahoo (52w high/low, 50/200-DMA, volume all come on the quote).
//         Live/today only — Yahoo has no historical bulk, so no India calendar.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const num = (v: any) => (typeof v === "number" ? v : Number(v));

type Row = { symbol: string; name: string; close: number; fromHigh: number; fromLow: number; volRatio: number | null; ema50: number; ema200: number; mcapB: number };

// Per market+date cache (bulk/quotes change at most once a day).
const CACHE: Record<string, { data: any; at: number }> = {};
const isToday = (d?: string) => !d || d === new Date().toISOString().slice(0, 10);

function screens(rows: Row[], N = 30) {
  return {
    near52High: rows.filter((r) => r.fromHigh >= -2).sort((a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0)).slice(0, N),
    near52Low: rows.filter((r) => r.fromLow <= 2).sort((a, b) => a.fromLow - b.fromLow).slice(0, N),
    volSurge: rows.filter((r) => (r.volRatio ?? 0) >= 2).sort((a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0)).slice(0, N),
    uptrend: rows.filter((r) => r.close > r.ema50 && r.ema50 > r.ema200).sort((a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0)).slice(0, N),
  };
}

// US: EODHD bulk extended (optionally a past date), top 1000 US common stocks.
async function usRows(date?: string): Promise<{ rows: Row[]; asOf: string }> {
  const all: any[] = await eodhdBulkEodExtended("US", date);
  const asOf = (Array.isArray(all) && all[0]?.date) || date || new Date().toISOString().slice(0, 10);
  const rows = (Array.isArray(all) ? all : [])
    .filter((r) => r && r.type === "Common Stock" && num(r.close) > 1 && num(r.MarketCapitalization) > 0 && num(r.hi_250d) > 0 && num(r.lo_250d) > 0)
    .sort((a, b) => num(b.MarketCapitalization) - num(a.MarketCapitalization))
    .slice(0, 1000)
    .map((r) => {
      const close = num(r.close);
      return {
        symbol: r.code, name: String(r.name || r.code).slice(0, 40), close: Math.round(close * 100) / 100,
        fromHigh: Math.round(((close - num(r.hi_250d)) / num(r.hi_250d)) * 1000) / 10,
        fromLow: Math.round(((close - num(r.lo_250d)) / num(r.lo_250d)) * 1000) / 10,
        volRatio: num(r.avgvol_14d) > 0 ? Math.round((num(r.volume) / num(r.avgvol_14d)) * 10) / 10 : null,
        ema50: num(r.ema_50d), ema200: num(r.ema_200d), mcapB: Math.round(num(r.MarketCapitalization) / 1e8) / 10,
      };
    });
  return { rows, asOf };
}

// India: Yahoo quotes for the Nifty 500 (52w / 50-200-DMA / volume all on quote).
async function inRows(): Promise<{ rows: Row[]; asOf: string }> {
  const rows: Row[] = [];
  for (let i = 0; i < NIFTY500.length; i += 50) {
    const chunk = NIFTY500.slice(i, i + 50);
    try {
      const qs: any = await yahooFinance.quote(chunk);
      for (const q of Array.isArray(qs) ? qs : [qs]) {
        const close = num(q?.regularMarketPrice);
        const hi = num(q?.fiftyTwoWeekHigh), lo = num(q?.fiftyTwoWeekLow);
        if (!(close > 0) || !(hi > 0) || !(lo > 0)) continue;
        const avgVol = num(q?.averageDailyVolume10Day) || num(q?.averageDailyVolume3Month);
        rows.push({
          symbol: q.symbol, name: String(q.shortName || q.longName || q.symbol).slice(0, 40), close: Math.round(close * 100) / 100,
          fromHigh: Math.round(((close - hi) / hi) * 1000) / 10,
          fromLow: Math.round(((close - lo) / lo) * 1000) / 10,
          volRatio: avgVol > 0 ? Math.round((num(q?.regularMarketVolume) / avgVol) * 10) / 10 : null,
          ema50: num(q?.fiftyDayAverage), ema200: num(q?.twoHundredDayAverage),
          mcapB: num(q?.marketCap) > 0 ? Math.round(num(q.marketCap) / 1e8) / 10 : 0,
        });
      }
    } catch { /* skip a bad chunk */ }
  }
  rows.sort((a, b) => b.mcapB - a.mcapB);
  return { rows, asOf: new Date().toISOString().slice(0, 10) };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const market: "us" | "in" = body.market === "in" ? "in" : "us";
    let date: string | undefined = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : undefined;
    const today = new Date().toISOString().slice(0, 10);
    if (date && date >= today) date = undefined; // today or future → live

    if (market === "in" && date) {
      return NextResponse.json({ error: "India has no historical data (EODHD doesn't cover NSE stocks) — showing today only.", market, noHistory: true }, { status: 200 });
    }
    if (market === "us" && !eodhdConfigured()) {
      return NextResponse.json({ error: "US screener needs an EODHD key." }, { status: 503 });
    }

    const key = `${market}:${date || "latest"}`;
    const cached = CACHE[key];
    // Live data caches for the day; a past date never changes, so cache it hard.
    if (cached && (!isToday(date) || Date.now() - cached.at < 3 * 3600_000)) {
      return NextResponse.json({ ...cached.data, cached: true });
    }

    const { rows, asOf } = market === "in" ? await inRows() : await usRows(date);
    if (!rows.length) return NextResponse.json({ error: "No market data for that day." }, { status: 502 });

    const data = { market, asOf, requestedDate: date || today, universe: rows.length, ...screens(rows) };
    CACHE[key] = { data, at: Date.now() };
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
