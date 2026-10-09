import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { subDays } from "date-fns";
import { US_UNIVERSE, IN_UNIVERSE } from "@/lib/marketUniverse";
import { eodhdBulkEodExtended, eodhdConfigured } from "@/lib/eodhd";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const n2 = (v: any) => (typeof v === "number" ? v : Number(v));
// US overview straight from the EODHD bulk — top 1000 by mcap, any date (the
// calendar). Day move here is the day's own candle (open→close), since the bulk
// carries no previous close; 52w highs/lows & most-active are exact as-of-date.
function usOverviewFromBulk(all: any[], date: string | undefined) {
  const asOf = (Array.isArray(all) && all[0]?.date) || date || new Date().toISOString().slice(0, 10);
  const rows = (Array.isArray(all) ? all : [])
    .filter((r) => r && r.type === "Common Stock" && n2(r.close) > 1 && n2(r.MarketCapitalization) > 0 && n2(r.hi_250d) > 0 && n2(r.lo_250d) > 0)
    .sort((a, b) => n2(b.MarketCapitalization) - n2(a.MarketCapitalization))
    .slice(0, 1000)
    .map((r) => {
      const close = n2(r.close), open = n2(r.open);
      return {
        symbol: r.code, name: String(r.name || r.code).slice(0, 40), price: Math.round(close * 100) / 100,
        changePct: open > 0 ? Math.round(((close - open) / open) * 1000) / 10 : null,
        volume: n2(r.volume), high52: n2(r.hi_250d), low52: n2(r.lo_250d),
        marketCap: n2(r.MarketCapitalization), currency: "$",
      } as Row;
    });
  const near = (p: number | null, ref: number | null, dir: "hi" | "lo") => p != null && ref != null && ref > 0 && (dir === "hi" ? p >= ref * 0.985 : p <= ref * 1.015);
  const dvol = (r: Row) => (r.price || 0) * (r.volume || 0);
  return {
    market: "us", asOf, currency: "$", universe: rows.length, source: "eodhd", dayMoveIsCandle: true,
    buckets: {
      newHighs: rows.filter((r) => near(r.price, r.high52, "hi")).sort((a, b) => (b.changePct || 0) - (a.changePct || 0)).slice(0, 25),
      newLows: rows.filter((r) => near(r.price, r.low52, "lo")).sort((a, b) => (a.changePct || 0) - (b.changePct || 0)).slice(0, 25),
      mostActive: [...rows].sort((a, b) => dvol(b) - dvol(a)).slice(0, 25),
      gainers: [...rows].filter((r) => r.changePct != null).sort((a, b) => (b.changePct || 0) - (a.changePct || 0)).slice(0, 25),
      losers: [...rows].filter((r) => r.changePct != null).sort((a, b) => (a.changePct || 0) - (b.changePct || 0)).slice(0, 25),
      nearAth: rows.filter((r) => near(r.price, r.high52, "hi")).slice(0, 15),
    },
  };
}

const yahooFinance = new YahooFinance();
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = { symbol: string; name: string; price: number | null; changePct: number | null; volume: number | null; high52: number | null; low52: number | null; marketCap: number | null; currency: string; ath?: number | null; vwap?: number | null; nearAthPct?: number | null };

// Warm-instance cache (post-close data changes slowly).
const cache: Record<string, { at: number; data: any }> = {};
const TTL = 10 * 60 * 1000;

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const c = i++; out[c] = await fn(items[c]); } }));
  return out;
}

async function athFor(sym: string): Promise<number | null> {
  try {
    const ch: any = await yahooFinance.chart(sym, { period1: "1990-01-01", interval: "1mo" }).catch(() => null);
    const hs = (ch?.quotes || []).map((q: any) => q?.high).filter((x: any) => typeof x === "number");
    return hs.length ? Math.max(...hs) : null;
  } catch { return null; }
}
async function vwapFor(sym: string): Promise<number | null> {
  try {
    const period1 = subDays(new Date(), 2).toISOString().split("T")[0];
    const ch: any = await yahooFinance.chart(sym, { period1, interval: "5m" }).catch(() => null);
    const rows = (ch?.quotes || []).filter((q: any) => q && q.close != null && q.volume);
    if (rows.length < 3) return null;
    // Use the latest session only.
    const lastDay = new Date(rows[rows.length - 1].date).toDateString();
    const day = rows.filter((r: any) => new Date(r.date).toDateString() === lastDay);
    let pv = 0, v = 0;
    day.forEach((r: any) => { const tp = (r.high + r.low + r.close) / 3; pv += tp * r.volume; v += r.volume; });
    return v ? Math.round((pv / v) * 100) / 100 : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const market: "us" | "in" = body.market === "in" ? "in" : "us";
    const today = new Date().toISOString().slice(0, 10);
    let date: string | undefined = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : undefined;
    if (date && date >= today) date = undefined;
    const ckey = `${market}:${date || "latest"}`;
    if (!body.force && cache[ckey] && (date || Date.now() - cache[ckey].at < TTL)) return NextResponse.json({ ...cache[ckey].data, cached: true });

    // US → EODHD bulk (top 1000, any date). India has no EODHD stocks → Yahoo.
    if (market === "us" && eodhdConfigured()) {
      const all: any[] = await eodhdBulkEodExtended("US", date);
      if (!Array.isArray(all) || !all.length) return NextResponse.json({ error: "No market data for that day." }, { status: 502 });
      const data = usOverviewFromBulk(all, date);
      cache[ckey] = { at: Date.now(), data };
      return NextResponse.json(data);
    }
    if (market === "in" && date) {
      // India has no EODHD history — read our own daily snapshot for that day.
      const sb = getSupabaseAdmin();
      if (sb) {
        const { data: snap } = await sb.from("market_snapshots").select("data").eq("snap_date", date).eq("market", "in").eq("kind", "overview").maybeSingle();
        if (snap?.data) return NextResponse.json({ ...snap.data, requestedDate: date, fromSnapshot: true });
      }
      return NextResponse.json({ error: "No India snapshot for that day yet — India history builds daily from when tracking started.", noHistory: true }, { status: 200 });
    }

    const universe = market === "in" ? IN_UNIVERSE : US_UNIVERSE;
    const cur = market === "in" ? "₹" : "$";

    // 1) Chunked quote scan over the whole universe.
    const bySym: Record<string, any> = {};
    const chunks: string[][] = [];
    for (let k = 0; k < universe.length; k += 25) chunks.push(universe.slice(k, k + 25));
    await mapLimit(chunks, 6, async (ch) => {
      for (let a = 0; a < 2; a++) {
        try { const qs = await yahooFinance.quote(ch); (Array.isArray(qs) ? qs : [qs]).forEach((q: any) => { if (q?.symbol) bySym[q.symbol] = q; }); break; } catch { /* retry */ }
      }
    });

    const rows: Row[] = Object.values(bySym).map((q: any) => ({
      symbol: q.symbol, name: q.shortName || q.longName || q.symbol,
      price: typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null,
      changePct: typeof q.regularMarketChangePercent === "number" ? Math.round(q.regularMarketChangePercent * 100) / 100 : null,
      volume: typeof q.regularMarketVolume === "number" ? q.regularMarketVolume : null,
      high52: typeof q.fiftyTwoWeekHigh === "number" ? q.fiftyTwoWeekHigh : null,
      low52: typeof q.fiftyTwoWeekLow === "number" ? q.fiftyTwoWeekLow : null,
      marketCap: typeof q.marketCap === "number" ? q.marketCap : null,
      currency: q.currency === "INR" ? "₹" : q.currency === "USD" ? "$" : cur,
    })).filter((r) => r.price != null);

    // Within ~1.5% of the 52-week extreme counts as "at / near" it.
    const near = (p: number | null, ref: number | null, dir: "hi" | "lo") => p != null && ref != null && ref > 0 && (dir === "hi" ? p >= ref * 0.985 : p <= ref * 1.015);
    const dollarVol = (r: Row) => (r.price || 0) * (r.volume || 0);

    const newHighs = rows.filter((r) => near(r.price, r.high52, "hi")).sort((a, b) => (b.changePct || 0) - (a.changePct || 0)).slice(0, 25);
    const newLows = rows.filter((r) => near(r.price, r.low52, "lo")).sort((a, b) => (a.changePct || 0) - (b.changePct || 0)).slice(0, 25);
    const mostActive = [...rows].sort((a, b) => dollarVol(b) - dollarVol(a)).slice(0, 25);
    const gainers = [...rows].filter((r) => r.changePct != null).sort((a, b) => (b.changePct || 0) - (a.changePct || 0)).slice(0, 25);
    const losers = [...rows].filter((r) => r.changePct != null).sort((a, b) => (a.changePct || 0) - (b.changePct || 0)).slice(0, 25);

    // 2) ATH + VWAP for a focused subset (top actives + top gainers).
    const subset = Array.from(new Set([...mostActive.slice(0, 12), ...gainers.slice(0, 12), ...newHighs.slice(0, 8)].map((r) => r.symbol)));
    const bySymRow: Record<string, Row> = {}; rows.forEach((r) => (bySymRow[r.symbol] = r));
    await mapLimit(subset, 8, async (sym) => {
      const [ath, vwap] = await Promise.all([athFor(sym), vwapFor(sym)]);
      const r = bySymRow[sym]; if (!r) return;
      r.ath = ath != null ? Math.round(ath * 100) / 100 : null;
      r.vwap = vwap;
      r.nearAthPct = ath && r.price ? Math.round(((r.price - ath) / ath) * 1000) / 10 : null;
    });
    const nearAth = subset.map((s) => bySymRow[s]).filter((r) => r && r.nearAthPct != null && r.nearAthPct >= -3).sort((a, b) => (b.nearAthPct || 0) - (a.nearAthPct || 0)).slice(0, 15);

    // If Yahoo throttled this sweep and almost nothing came back, don't return a
    // near-empty scan — serve the last good one so the page never blanks out.
    if (rows.length < 25 && cache[ckey]?.data) {
      return NextResponse.json({ ...cache[ckey].data, cached: true, stale: true });
    }

    const data = {
      market, currency: cur, scanned: rows.length,
      buckets: { newHighs, newLows, mostActive, gainers, losers, nearAth },
    };
    cache[ckey] = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
