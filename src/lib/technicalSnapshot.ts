// Shared technical-indicator math + a per-stock "snapshot" used by the
// Portfolio → AI Analysis feature (technical watch + AI analyst report).
// RSI / SMA / ADX math mirrors src/app/api/chart/route.ts exactly so the
// numbers agree with the Chart Analytics page (single source of truth).

export type Nullable = (number | null)[];

export function sma(values: (number | null)[], period: number): (number | null)[] {
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

export function rsi(closes: number[], period = 14): (number | null)[] {
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

export function adx(highs: number[], lows: number[], closes: number[], period = 14): { adx: Nullable; plusDI: Nullable; minusDI: Nullable } {
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

export type Signal = { key: string; label: string; tone: "bull" | "bear" | "warn" | "info" };

// A candlestick pattern on the most recent bars, with a plain-language read and
// a research-framed "what to watch" (NOT buy/sell advice).
export type CandlePattern = {
  key: string;
  name: string;
  tone: "bull" | "bear" | "info";
  meaning: string; // what the pattern typically indicates
  watch: string;   // what to watch / research next (research language)
};

type OHLC = { open?: number; high: number; low: number; close: number };

// Detect notable candlestick patterns on the latest bars. Context (trend) is
// used so e.g. a hammer only counts as a reversal hint after weakness.
export function detectCandles(candles: OHLC[], trend: TechSnapshot["trend"]): CandlePattern[] {
  const n = candles.length;
  if (n < 3 || candles[n - 1].open == null) return [];
  const c0 = candles[n - 1], c1 = candles[n - 2], c2 = candles[n - 3];
  const o0 = c0.open as number, o1 = c1.open as number, o2 = c2.open as number;
  const body = (o: number, c: number) => Math.abs(c - o);
  const range = (h: number, l: number) => Math.max(h - l, 1e-9);
  const b0 = body(o0, c0.close), b1 = body(o1, c1.close), b2 = body(o2, c2.close);
  const r0 = range(c0.high, c0.low);
  const upper0 = c0.high - Math.max(o0, c0.close);
  const lower0 = Math.min(o0, c0.close) - c0.low;
  const bull0 = c0.close > o0, bull1 = c1.close > o1, bull2 = c2.close > o2;
  const out: CandlePattern[] = [];

  // Bullish / bearish engulfing (2-bar reversal).
  if (!bull1 && bull0 && c0.close >= o1 && o0 <= c1.close && b0 > b1) {
    out.push({ key: "bull-engulf", name: "Bullish Engulfing", tone: "bull",
      meaning: "A strong up-candle fully covers the prior down-candle — buyers took control.",
      watch: "Watch for a higher close on the next bar to confirm; a drop back below the pattern low would negate it." });
  }
  if (bull1 && !bull0 && o0 >= c1.close && c0.close <= o1 && b0 > b1) {
    out.push({ key: "bear-engulf", name: "Bearish Engulfing", tone: "bear",
      meaning: "A strong down-candle fully covers the prior up-candle — sellers took control.",
      watch: "Watch whether the next bar confirms weakness; holding above the pattern high would ease the signal." });
  }
  // Morning / evening star (3-bar reversal).
  const mid2 = (o2 + c2.close) / 2;
  if (!bull2 && b2 > r0 * 0.4 && b1 < b2 * 0.5 && bull0 && c0.close > mid2) {
    out.push({ key: "morning-star", name: "Morning Star", tone: "bull",
      meaning: "A down day, a small indecision candle, then a strong up day — a classic bottoming sequence.",
      watch: "Often marks a potential trough; watch for continued higher closes to confirm the turn." });
  }
  if (bull2 && b2 > r0 * 0.4 && b1 < b2 * 0.5 && !bull0 && c0.close < mid2) {
    out.push({ key: "evening-star", name: "Evening Star", tone: "bear",
      meaning: "An up day, a small indecision candle, then a strong down day — a classic topping sequence.",
      watch: "Often marks a potential peak; watch for continued lower closes to confirm the turn." });
  }
  // Hammer (bullish only after weakness).
  if (lower0 >= b0 * 2 && upper0 <= b0 * 0.6 && b0 > 0 && (trend === "Downtrend" || trend === "Sideways")) {
    out.push({ key: "hammer", name: "Hammer", tone: "bull",
      meaning: "Price sold off hard then closed near the high — a long lower wick shows buyers stepped in.",
      watch: "A reversal hint after weakness; watch for an up-close next bar before reading too much into it." });
  }
  // Shooting star (bearish only after strength).
  if (upper0 >= b0 * 2 && lower0 <= b0 * 0.6 && b0 > 0 && (trend === "Uptrend" || trend === "Sideways")) {
    out.push({ key: "shooting-star", name: "Shooting Star", tone: "bear",
      meaning: "Price ran up then closed near the low — a long upper wick shows sellers rejected the highs.",
      watch: "A possible exhaustion sign after a run-up; watch whether the next bar confirms the stall." });
  }
  // Doji (indecision) — only if nothing stronger fired.
  if (out.length === 0 && b0 <= r0 * 0.1) {
    out.push({ key: "doji", name: "Doji", tone: "info",
      meaning: "Open and close are nearly equal — the session ended in a tug-of-war with no clear winner.",
      watch: "Indecision after a move can precede a turn; watch the direction of the next candle for a cue." });
  }
  return out.slice(0, 2);
}

export type TechSnapshot = {
  ok: boolean;
  price: number | null;
  rsi: number | null;
  rsiPrev: number | null;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  trend: "Uptrend" | "Downtrend" | "Sideways" | "—";
  vsSma50Pct: number | null;
  vsSma200Pct: number | null;
  signals: Signal[];
  patterns: CandlePattern[];
};

const last = (a: (number | null)[]): number | null => {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i];
  return null;
};
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);

export type SnapshotOpts = { rsiOverbought?: number; rsiOversold?: number; adxTrend?: number };

// Build the latest-bar technical snapshot + human-readable signals from OHLC.
// Thresholds default to the classic 70 / 30 / 25 but the caller can override
// them so signals follow the user's own settings.
export function buildSnapshot(candles: { open?: number; high: number; low: number; close: number }[], opts: SnapshotOpts = {}): TechSnapshot {
  const OB = opts.rsiOverbought ?? 70;
  const OS = opts.rsiOversold ?? 30;
  const ADX_TREND = opts.adxTrend ?? 25;
  const empty: TechSnapshot = {
    ok: false, price: null, rsi: null, rsiPrev: null, adx: null, plusDI: null, minusDI: null,
    sma20: null, sma50: null, sma200: null, trend: "—", vsSma50Pct: null, vsSma200Pct: null, signals: [], patterns: [],
  };
  if (!candles || candles.length < 30) return empty;
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);

  const rsiArr = rsi(closes, 14);
  const adxRes = adx(highs, lows, closes, 14);
  const sma20Arr = sma(closes, 20);
  const sma50Arr = sma(closes, 50);
  const sma200Arr = sma(closes, 200);

  const price = closes[closes.length - 1] ?? null;
  const rsiNow = last(rsiArr);
  // Previous RSI (bar before last non-null) — lets the UI show direction.
  let rsiPrev: number | null = null;
  { let seen = 0; for (let i = rsiArr.length - 1; i >= 0; i--) { if (rsiArr[i] != null) { seen++; if (seen === 2) { rsiPrev = rsiArr[i]; break; } } } }
  const adxNow = last(adxRes.adx);
  const pdi = last(adxRes.plusDI);
  const mdi = last(adxRes.minusDI);
  const s20 = last(sma20Arr);
  const s50 = last(sma50Arr);
  const s200 = last(sma200Arr);

  const vs50 = price != null && s50 ? ((price - s50) / s50) * 100 : null;
  const vs200 = price != null && s200 ? ((price - s200) / s200) * 100 : null;

  // Trend: price vs SMA50/200 + DI dominance.
  let trend: TechSnapshot["trend"] = "Sideways";
  if (price != null && s50 != null && s200 != null) {
    if (price > s50 && s50 >= s200) trend = "Uptrend";
    else if (price < s50 && s50 <= s200) trend = "Downtrend";
    else trend = "Sideways";
  } else trend = "—";

  const signals: Signal[] = [];
  if (rsiNow != null) {
    if (rsiNow >= OB) signals.push({ key: "rsi-ob", label: `RSI ${Math.round(rsiNow)} · overbought`, tone: "warn" });
    else if (rsiNow <= OS) signals.push({ key: "rsi-os", label: `RSI ${Math.round(rsiNow)} · oversold`, tone: "warn" });
    // Fresh cross of the 50 mid-line = momentum shift.
    if (rsiPrev != null) {
      if (rsiPrev < 50 && rsiNow >= 50) signals.push({ key: "rsi-up50", label: "RSI crossed above 50", tone: "bull" });
      if (rsiPrev > 50 && rsiNow <= 50) signals.push({ key: "rsi-dn50", label: "RSI dropped below 50", tone: "bear" });
    }
  }
  if (adxNow != null) {
    if (adxNow >= ADX_TREND && pdi != null && mdi != null) {
      if (pdi > mdi) signals.push({ key: "adx-bull", label: `Strong uptrend (ADX ${Math.round(adxNow)})`, tone: "bull" });
      else signals.push({ key: "adx-bear", label: `Strong downtrend (ADX ${Math.round(adxNow)})`, tone: "bear" });
    } else if (adxNow < 20) {
      signals.push({ key: "adx-weak", label: `Weak/no trend (ADX ${Math.round(adxNow)})`, tone: "info" });
    }
  }
  if (price != null && s50 != null) {
    if (price < s50) signals.push({ key: "below-50", label: "Price below 50-DMA", tone: "bear" });
    else signals.push({ key: "above-50", label: "Price above 50-DMA", tone: "bull" });
  }
  if (price != null && s200 != null && price < s200) {
    signals.push({ key: "below-200", label: "Price below 200-DMA", tone: "bear" });
  }
  // Golden / death cross (50 vs 200), detected on the latest bar.
  if (s50 != null && s200 != null) {
    const p50 = sma50Arr[sma50Arr.length - 2];
    const p200 = sma200Arr[sma200Arr.length - 2];
    if (p50 != null && p200 != null) {
      if (p50 <= p200 && s50 > s200) signals.push({ key: "golden", label: "Golden cross (50↑200)", tone: "bull" });
      if (p50 >= p200 && s50 < s200) signals.push({ key: "death", label: "Death cross (50↓200)", tone: "bear" });
    }
  }

  const patterns = detectCandles(candles, trend);

  return {
    ok: true,
    price: r2(price), rsi: r2(rsiNow), rsiPrev: r2(rsiPrev), adx: r2(adxNow), plusDI: r2(pdi), minusDI: r2(mdi),
    sma20: r2(s20), sma50: r2(s50), sma200: r2(s200), trend,
    vsSma50Pct: r2(vs50), vsSma200Pct: r2(vs200), signals, patterns,
  };
}
