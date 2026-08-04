import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { evalConditions, type ComboRaw } from "@/lib/comboEval";
import type { ScreenConditions } from "@/lib/storage";

const yf = new YahooFinance();

// Live technical screener. Computes a stock's metrics (MAs, RSI, ADX, 52-week
// range, ATH/ATL, support/resistance) then evaluates the user's combination.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sma(arr: number[], p: number): number | null {
  if (arr.length < p) return null;
  let s = 0;
  for (let i = arr.length - p; i < arr.length; i++) s += arr[i];
  return s / p;
}

function rsi14(closes: number[]): number | null {
  const p = 14;
  if (closes.length < p + 1) return null;
  let gain = 0, loss = 0;
  for (let i = closes.length - p; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  const avgG = gain / p, avgL = loss / p;
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

// Wilder's ADX(14) from OHLC.
function adx14(highs: number[], lows: number[], closes: number[]): number | null {
  const n = Math.min(highs.length, lows.length, closes.length);
  if (n < 30) return null;
  const tr: number[] = [], pDM: number[] = [], mDM: number[] = [];
  for (let i = 1; i < n; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    pDM.push(up > down && up > 0 ? up : 0);
    mDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const p = 14;
  const smooth = (arr: number[]) => {
    if (arr.length < p) return [];
    let s = arr.slice(0, p).reduce((a, b) => a + b, 0);
    const out = [s];
    for (let i = p; i < arr.length; i++) { s = s - s / p + arr[i]; out.push(s); }
    return out;
  };
  const trS = smooth(tr), pS = smooth(pDM), mS = smooth(mDM);
  const dx: number[] = [];
  for (let i = 0; i < trS.length; i++) {
    if (!trS[i]) { dx.push(0); continue; }
    const pdi = (100 * pS[i]) / trS[i];
    const mdi = (100 * mS[i]) / trS[i];
    const sum = pdi + mdi;
    dx.push(sum ? (100 * Math.abs(pdi - mdi)) / sum : 0);
  }
  if (dx.length < p) return null;
  let adx = dx.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < dx.length; i++) adx = (adx * (p - 1) + dx[i]) / p;
  return adx;
}

async function evalSymbol(symbol: string, name: string, c: ScreenConditions) {
  try {
    const period1 = new Date(Date.now() - 400 * 86400000).toISOString().split("T")[0];
    const [chart, quote] = await Promise.all([
      yf.chart(symbol, { period1, interval: "1d" }).catch(() => null),
      yf.quote(symbol).catch(() => null),
    ]);
    const rows = ((chart as any)?.quotes || []).filter((q: any) => q && q.close != null);
    const closes: number[] = rows.map((r: any) => Number(r.close)).filter((x: number) => Number.isFinite(x));
    if (closes.length < 30) return { symbol, name, ok: false, reason: "Not enough history" };
    const highs: number[] = rows.map((r: any) => Number(r.high ?? r.close)).filter((x: number) => Number.isFinite(x));
    const lows: number[] = rows.map((r: any) => Number(r.low ?? r.close)).filter((x: number) => Number.isFinite(x));

    const price = closes[closes.length - 1];
    const dma10 = sma(closes, 10), dma20 = sma(closes, 20), dma50 = sma(closes, 50), dma200 = sma(closes, 200);
    const rsi = rsi14(closes);
    const adx = adx14(highs, lows, closes);

    const q: any = quote || {};
    const high52 = Number.isFinite(q.fiftyTwoWeekHigh) ? q.fiftyTwoWeekHigh : Math.max(...closes);
    const low52 = Number.isFinite(q.fiftyTwoWeekLow) ? q.fiftyTwoWeekLow : Math.min(...closes);
    const pctFromHigh = high52 ? ((price - high52) / high52) * 100 : null;
    const pctFromLow = low52 ? ((price - low52) / low52) * 100 : null;

    // ~3-month swing high/low as a rough resistance/support.
    const win = 63;
    const recentHigh = highs.length ? Math.max(...highs.slice(-win)) : null;
    const recentLow = lows.length ? Math.min(...lows.slice(-win)) : null;

    // ATH/ATL only when asked — full-history monthly bars (cheap).
    let ath: number | null = null, atl: number | null = null;
    if (c.atAth || c.atAtl) {
      try {
        const mc: any = await yf.chart(symbol, { period1: "1980-01-01", interval: "1mo" });
        const mrows = (mc?.quotes || []).filter((r: any) => r && r.high != null && r.low != null);
        const mh = mrows.map((r: any) => Number(r.high)).filter((x: number) => Number.isFinite(x));
        const ml = mrows.map((r: any) => Number(r.low)).filter((x: number) => Number.isFinite(x));
        ath = mh.length ? Math.max(...mh) : null;
        atl = ml.length ? Math.min(...ml) : null;
      } catch { /* history unavailable */ }
    }

    let earningsGrowth: number | null = null;
    if (c.earningsUp) {
      try {
        const qs: any = await yf.quoteSummary(symbol, { modules: ["defaultKeyStatistics"] });
        const g = qs?.defaultKeyStatistics?.earningsQuarterlyGrowth;
        earningsGrowth = typeof g === "number" ? g * 100 : null;
      } catch { /* fundamentals unavailable */ }
    }

    const raw: ComboRaw = {
      price, dma10, dma20, dma50, dma200, rsi, adx,
      pctFromHigh, pctFromLow, recentHigh, recentLow, ath, atl, earningsGrowth,
    };
    const { passed, match } = evalConditions(raw, c);

    return {
      symbol,
      name: q.shortName || q.longName || name || symbol,
      ok: true,
      price,
      currency: q.currency || (/\.(NS|BO)$/i.test(symbol) ? "INR" : "USD"),
      changePct: typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null,
      dma10, dma20, dma50, dma200,
      rsi: rsi != null ? Math.round(rsi) : null,
      adx: adx != null ? Math.round(adx) : null,
      pctFromHigh: pctFromHigh != null ? Number(pctFromHigh.toFixed(1)) : null,
      pctFromLow: pctFromLow != null ? Number(pctFromLow.toFixed(1)) : null,
      recentHigh, recentLow, ath, atl,
      earningsGrowth: earningsGrowth != null ? Number(earningsGrowth.toFixed(1)) : null,
      passed, match,
    };
  } catch (e: any) {
    return { symbol, name, ok: false, reason: e?.message || "error" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw: any[] = Array.isArray(body.symbols) ? body.symbols : [];
    const items = raw
      .map((s) => (typeof s === "string" ? { symbol: s, name: s } : { symbol: String(s?.symbol || ""), name: String(s?.name || s?.symbol || "") }))
      .map((s) => ({ symbol: s.symbol.trim().toUpperCase(), name: s.name }))
      .filter((s) => s.symbol);
    const seen = new Set<string>();
    const uniq = items.filter((s) => (seen.has(s.symbol) ? false : (seen.add(s.symbol), true))).slice(0, 40);
    if (!uniq.length) return NextResponse.json({ results: [], capped: false });

    const conditions: ScreenConditions = body.conditions || {};
    const results = await Promise.all(uniq.map((s) => evalSymbol(s.symbol, s.name, conditions)));
    return NextResponse.json({ results, capped: items.length > 40, scanned: uniq.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
