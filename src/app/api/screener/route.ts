import { NextRequest, NextResponse } from "next/server";
import { eodhdBulkEodExtended, eodhdConfigured } from "@/lib/eodhd";

// Full-market screener — one EODHD bulk-EOD call pulls the WHOLE US exchange
// (~44k symbols) in a single request, then we rank it into the classic screens:
// near 52-week highs (breakouts), near 52-week lows, volume surges, and strong
// uptrends. This scale is only possible with EODHD's bulk endpoint; Yahoo would
// need tens of thousands of calls. Result is tiny (top N per screen).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const num = (v: any) => (typeof v === "number" ? v : Number(v));

// Daily cache (bulk EOD changes once a day). Per warm instance; a cold start
// just re-scans. Keeps us from pulling 20 MB on every page load.
let CACHE: { date: string; data: any } | null = null;

export async function POST(req: NextRequest) {
  try {
    if (!eodhdConfigured()) {
      return NextResponse.json({ error: "Screener needs an EODHD key." }, { status: 503 });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (CACHE && CACHE.date === today) return NextResponse.json({ ...CACHE.data, cached: true });

    const all: any[] = await eodhdBulkEodExtended("US");
    if (!Array.isArray(all) || !all.length) {
      return NextResponse.json({ error: "No market data returned." }, { status: 502 });
    }

    // Universe: the TOP 1000 US common stocks by market cap (drops ETFs,
    // warrants, penny names), then the screens run within that large-cap set.
    const rows = all
      .filter((r) =>
        r && r.type === "Common Stock" &&
        num(r.close) > 1 && num(r.MarketCapitalization) > 0 &&
        num(r.hi_250d) > 0 && num(r.lo_250d) > 0,
      )
      .sort((a, b) => num(b.MarketCapitalization) - num(a.MarketCapitalization))
      .slice(0, 1000)
      .map((r) => {
        const close = num(r.close);
        return {
          symbol: r.code,
          name: String(r.name || r.code).slice(0, 40),
          close: Math.round(close * 100) / 100,
          fromHigh: Math.round(((close - num(r.hi_250d)) / num(r.hi_250d)) * 1000) / 10,
          fromLow: Math.round(((close - num(r.lo_250d)) / num(r.lo_250d)) * 1000) / 10,
          volRatio: num(r.avgvol_14d) > 0 ? Math.round((num(r.volume) / num(r.avgvol_14d)) * 10) / 10 : null,
          ema50: num(r.ema_50d),
          ema200: num(r.ema_200d),
          mcapB: Math.round(num(r.MarketCapitalization) / 1e8) / 10, // $ billions
        };
      });

    const N = 30;
    const data = {
      asOf: all[0]?.date || today,
      universe: rows.length,
      // At / just under the 52-week high, ordered by volume confirmation.
      near52High: rows.filter((r) => r.fromHigh >= -2).sort((a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0)).slice(0, N),
      // At / just above the 52-week low.
      near52Low: rows.filter((r) => r.fromLow <= 2).sort((a, b) => a.fromLow - b.fromLow).slice(0, N),
      // Today's volume well above its 14-day average.
      volSurge: rows.filter((r) => (r.volRatio ?? 0) >= 2).sort((a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0)).slice(0, N),
      // Price > 50-EMA > 200-EMA — a clean uptrend stack.
      uptrend: rows.filter((r) => r.close > r.ema50 && r.ema50 > r.ema200).sort((a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0)).slice(0, N),
    };

    CACHE = { date: today, data };
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
