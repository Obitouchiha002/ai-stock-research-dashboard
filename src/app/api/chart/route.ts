import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { subDays } from "date-fns";

const yahooFinance = new YahooFinance();

// Vercel: yahoo-finance2 needs the Node runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RANGE_DAYS: Record<string, number> = {
  "1mo": 31,
  "3mo": 93,
  "6mo": 186,
  "1y": 372,
  "2y": 744,
  "5y": 1830,
  "10y": 3660,
  // "Lifetime": far enough back to cover any listing; Yahoo clamps to the
  // stock's first trading day, so this effectively returns full history.
  max: 20000,
};

function sma(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  const window: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { out.push(null); continue; }
    window.push(v);
    sum += v;
    if (window.length > period) sum -= window.shift() as number;
    out.push(window.length >= period ? sum / period : null);
  }
  return out;
}

function ema(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { out.push(prev); continue; }
    prev = prev == null ? v : v * k + prev * (1 - k);
    out.push(i >= period - 1 ? prev : null);
  }
  return out;
}

// RSI (Wilder's smoothing). Same length as input; nulls until warmed up.
function rsi(closes: number[], period = 14): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = Array(n).fill(null);
  if (n <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (ch > 0 ? ch : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (ch < 0 ? -ch : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// ADX (Wilder's DMI/ADX) — the classic 3 lines: ADX + +DI + -DI.
// Same length as input; nulls until warmed up.
type Nullable = (number | null)[];
function adx(highs: number[], lows: number[], closes: number[], period = 14): { adx: Nullable; plusDI: Nullable; minusDI: Nullable } {
  const n = closes.length;
  const adxOut: Nullable = Array(n).fill(null);
  const pdiOut: Nullable = Array(n).fill(null);
  const mdiOut: Nullable = Array(n).fill(null);
  if (n <= period * 2) return { adx: adxOut, plusDI: pdiOut, minusDI: mdiOut };
  const tr = Array(n).fill(0), plusDM = Array(n).fill(0), minusDM = Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  let atr = 0, sPlus = 0, sMinus = 0;
  for (let i = 1; i <= period; i++) { atr += tr[i]; sPlus += plusDM[i]; sMinus += minusDM[i]; }
  const dx: Nullable = Array(n).fill(null);
  for (let i = period + 1; i < n; i++) {
    atr = atr - atr / period + tr[i];
    sPlus = sPlus - sPlus / period + plusDM[i];
    sMinus = sMinus - sMinus / period + minusDM[i];
    const pDI = atr === 0 ? 0 : (100 * sPlus) / atr;
    const mDI = atr === 0 ? 0 : (100 * sMinus) / atr;
    pdiOut[i] = pDI;
    mdiOut[i] = mDI;
    const denom = pDI + mDI;
    dx[i] = denom === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / denom;
  }
  const firstIdx = period * 2;
  if (firstIdx < n) {
    let sumDx = 0, cnt = 0;
    for (let i = period + 1; i <= firstIdx && i < n; i++) { if (dx[i] != null) { sumDx += dx[i]!; cnt++; } }
    if (cnt > 0) {
      let val = sumDx / cnt;
      adxOut[firstIdx] = val;
      for (let i = firstIdx + 1; i < n; i++) {
        if (dx[i] == null) continue;
        val = (val * (period - 1) + dx[i]!) / period;
        adxOut[i] = val;
      }
    }
  }
  return { adx: adxOut, plusDI: pdiOut, minusDI: mdiOut };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol || "").trim().toUpperCase();
    const range = String(body.range || "1y");
    const interval = String(body.interval || "1d"); // 1d | 1wk | 1h
    if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

    const days = RANGE_DAYS[range] || 372;
    const period1 = subDays(new Date(), days).toISOString().split("T")[0];

    const [chartRes, quote] = await Promise.all([
      yahooFinance.chart(symbol, { period1, interval: interval as any }).catch(() => null),
      yahooFinance.quote(symbol).catch(() => null),
    ]);

    const quotes = (chartRes as any)?.quotes || [];
    const rows = quotes.filter((q: any) => q && q.close != null && q.open != null);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No chart data for this symbol/timeframe." }, { status: 404 });
    }

    const intraday = interval === "1h";
    // How far a wick may run beyond the body before we treat it as a bad tick.
    // Interval-aware: hourly moves a couple %, monthly can swing ~50%.
    const capPct = interval === "1h" ? 0.05 : interval === "1d" ? 0.15 : interval === "1wk" ? 0.30 : 0.5;

    // Pass 1 — sanitise OHLC (Yahoo occasionally emits absurd highs/lows).
    const times: (string | number)[] = [];
    const opens: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    const closes: number[] = [];
    const volumes: number[] = [];
    for (const r of rows) {
      const d: Date = r.date instanceof Date ? r.date : new Date(r.date);
      const open = Number(r.open);
      const close = Number(r.close);
      let high = Number(r.high);
      let low = Number(r.low);
      const maxHigh = Math.max(open, close) * (1 + capPct);
      const minLow = Math.min(open, close) * (1 - capPct);
      if (!(high > 0) || high > maxHigh) high = Math.max(open, close);
      if (!(low > 0) || low < minLow) low = Math.min(open, close);
      high = Math.max(high, open, close);
      low = Math.min(low, open, close);

      times.push(intraday ? Math.floor(d.getTime() / 1000) : d.toISOString().split("T")[0]);
      opens.push(open);
      highs.push(high);
      lows.push(low);
      closes.push(close);
      volumes.push(r.volume != null ? Number(r.volume) : 0);
    }

    // Pass 2 — indicators on sanitised data.
    const sma10 = sma(closes, 10);
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const rsi14 = rsi(closes, 14);
    const rsiSig = sma(rsi14, 9); // RSI signal line (9-SMA of RSI)
    const adx14 = adx(highs, lows, closes, 14);

    const candles = times.map((time, i) => ({
      time,
      open: opens[i],
      high: highs[i],
      low: lows[i],
      close: closes[i],
      volume: volumes[i],
      sma10: sma10[i],
      sma20: sma20[i],
      sma50: sma50[i],
      sma200: sma200[i],
      rsi: rsi14[i],
      rsiSignal: rsiSig[i],
      adx: adx14.adx[i],
      plusDI: adx14.plusDI[i],
      minusDI: adx14.minusDI[i],
    }));

    const q: any = quote || {};
    return NextResponse.json({
      symbol,
      name: q.shortName || q.longName || symbol,
      currency: q.currency || (/\.(NS|BO)$/i.test(symbol) ? "INR" : "USD"),
      price: q.regularMarketPrice ?? closes[closes.length - 1],
      changePct: typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null,
      interval,
      range,
      candles,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
