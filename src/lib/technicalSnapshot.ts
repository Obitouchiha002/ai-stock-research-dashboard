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

// Moving-average stack read — where price sits relative to the 10/20/50/200
// SMAs. Research language only (no buy/sell).
export type MaStack = { label: string; tone: "bull" | "bear" | "warn" | "info" } | null;
function maStackRead(price: number | null, s10: number | null, s20: number | null, s50: number | null, s200: number | null): MaStack {
  if (price == null || s10 == null || s20 == null || s50 == null || s200 == null) return null;
  const p = price;
  // Perfect bullish / bearish alignment (CMP>10>20>50>200 / CMP<10<20<50<200).
  if (p > s10 && s10 > s20 && s20 > s50 && s50 > s200) return { label: "Perfect uptrend", tone: "bull" };
  if (p < s10 && s10 < s20 && s20 < s50 && s50 < s200) return { label: "Perfect downtrend", tone: "bear" };
  // Above both long-term averages (50 & 200).
  if (p > s50 && p > s200) {
    if (p > s10 && p > s20) return { label: "Strong uptrend", tone: "bull" };            // above all
    if (p < s10 && p < s20) return { label: "Uptrend · pullback", tone: "warn" };
    return { label: "Uptrend intact", tone: "bull" };
  }
  // Below both long-term averages.
  if (p < s50 && p < s200) {
    if (p < s10 && p < s20) return { label: "Downtrend", tone: "bear" };                  // below all
    return { label: "Downtrend · bounce", tone: "warn" };                                 // short-term bounce
  }
  // Between the 50 and 200 — early turns.
  if (p > s200 && p < s50) {
    if (p > s10 && p > s20) return { label: "Recovering < 50-DMA", tone: "warn" };        // reclaimed short MAs
    return { label: "Below 50-DMA", tone: "warn" };
  }
  if (p < s200 && p > s50) return { label: "Above 50 · below 200", tone: "info" };         // mixed / basing
  return { label: "Mixed / choppy", tone: "info" };
}

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
  sma10: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  trend: "Uptrend" | "Downtrend" | "Sideways" | "—";
  vsSma50Pct: number | null;
  vsSma200Pct: number | null;
  maStack: MaStack;
  diUp: boolean | null; // +DI > -DI (trend leaning up)
  // Volume momentum.
  volVs5Pct: number | null;   // latest volume vs 5-bar average
  volVs10Pct: number | null;  // latest volume vs 10-bar average
  volRising: boolean | null;
  // RSI behaviour.
  rsiTrend: "rising" | "falling" | "stagnant" | "—";
  divergence: "bullish" | "bearish" | null;
  near52w: "high" | "low" | null;
  // Weighted overall read.
  overall: { label: string; tone: "bull" | "bear" | "warn" | "info" } | null;
  // Candlestick-driven technical action (a chart signal, not personalised advice).
  action: "Buy" | "Sell" | "Hold";
  // Key levels + a light chart-pattern read.
  support: number | null;
  resistance: number | null;
  pivot: number | null;
  chartPattern: { label: string; tone: "bull" | "bear" | "warn" | "info" } | null;
  // Basic read of the latest candle (fallback when no named formation).
  lastCandle: { label: string; tone: "bull" | "bear" | "info" } | null;
  signals: Signal[];
  patterns: CandlePattern[];
};

const last = (a: (number | null)[]): number | null => {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i];
  return null;
};
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);

export type SnapshotOpts = { rsiOverbought?: number; rsiOversold?: number; adxTrend?: number; diSpread?: number; volSurge?: number };

// Build the latest-bar technical snapshot + human-readable signals from OHLC.
// Thresholds default to the classic 70 / 30 / 25 but the caller can override
// them so signals follow the user's own settings.
export function buildSnapshot(candles: { open?: number; high: number; low: number; close: number; volume?: number }[], opts: SnapshotOpts = {}): TechSnapshot {
  const OB = opts.rsiOverbought ?? 70;
  const OS = opts.rsiOversold ?? 30;
  const ADX_TREND = opts.adxTrend ?? 25;
  const DI_SPREAD = opts.diSpread ?? 5;
  const VOL_SURGE = opts.volSurge ?? 50;
  const empty: TechSnapshot = {
    ok: false, price: null, rsi: null, rsiPrev: null, adx: null, plusDI: null, minusDI: null,
    sma10: null, sma20: null, sma50: null, sma200: null, trend: "—", vsSma50Pct: null, vsSma200Pct: null,
    maStack: null, diUp: null, volVs5Pct: null, volVs10Pct: null, volRising: null,
    rsiTrend: "—", divergence: null, near52w: null, overall: null, action: "Hold",
    support: null, resistance: null, pivot: null, chartPattern: null, lastCandle: null, signals: [], patterns: [],
  };
  if (!candles || candles.length < 30) return empty;
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);

  const rsiArr = rsi(closes, 14);
  const adxRes = adx(highs, lows, closes, 14);
  const sma10Arr = sma(closes, 10);
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
  const s10 = last(sma10Arr);
  const s20 = last(sma20Arr);
  const s50 = last(sma50Arr);
  const s200 = last(sma200Arr);
  const maStack = maStackRead(price, s10, s20, s50, s200);
  const diUp = pdi != null && mdi != null ? pdi > mdi : null;

  // --- Volume momentum ---
  const volArr = candles.map((c) => (typeof c.volume === "number" ? c.volume : null));
  const lastVol = volArr[volArr.length - 1];
  // Average the PRIOR n bars (exclude the current bar so its own volume doesn't
  // dilute the baseline — a true 2× day should read ~+100%).
  const volClean = volArr.filter((x): x is number => x != null);
  const avgOf = (n: number) => { const v = volClean.slice(-(n + 1), -1); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const avg5 = avgOf(5), avg10 = avgOf(10);
  const volVs5 = lastVol != null && avg5 ? ((lastVol - avg5) / avg5) * 100 : null;
  const volVs10 = lastVol != null && avg10 ? ((lastVol - avg10) / avg10) * 100 : null;
  const volRising = volVs5 != null ? volVs5 > 0 : null;

  // --- RSI behaviour (rising / falling / stagnant over ~4 bars) ---
  const rsiVals = rsiArr.filter((x): x is number => x != null);
  let rsiTrend: TechSnapshot["rsiTrend"] = "—";
  if (rsiVals.length >= 4) {
    const back = rsiVals[rsiVals.length - 4];
    const d = (rsiNow as number) - back;
    rsiTrend = d > 2 ? "rising" : d < -2 ? "falling" : "stagnant";
  }
  // --- Divergence (approx over ~10 bars) ---
  let divergence: TechSnapshot["divergence"] = null;
  {
    const n = closes.length, k = 10;
    if (n > k && rsiArr[n - 1] != null && rsiArr[n - 1 - k] != null) {
      const pC = (closes[n - 1] - closes[n - 1 - k]) / closes[n - 1 - k];
      const rC = (rsiArr[n - 1] as number) - (rsiArr[n - 1 - k] as number);
      if (pC > 0.02 && rC < -3) divergence = "bearish"; // price up, RSI down
      else if (pC < -0.02 && rC > 3) divergence = "bullish"; // price down, RSI up
    }
  }
  // --- Near 52-week (≈252 sessions) high / low ---
  let near52w: TechSnapshot["near52w"] = null;
  if (price != null) {
    const win = closes.slice(-252);
    const hi = Math.max(...win), lo = Math.min(...win);
    if (hi > 0 && (hi - price) / hi <= 0.03) near52w = "high";
    else if (lo > 0 && (price - lo) / lo <= 0.03) near52w = "low";
  }

  const vs50 = price != null && s50 ? ((price - s50) / s50) * 100 : null;
  const vs200 = price != null && s200 ? ((price - s200) / s200) * 100 : null;

  // Trend: price vs SMA50/200 + DI dominance.
  let trend: TechSnapshot["trend"] = "Sideways";
  if (price != null && s50 != null && s200 != null) {
    if (price > s50 && s50 >= s200) trend = "Uptrend";
    else if (price < s50 && s50 <= s200) trend = "Downtrend";
    else trend = "Sideways";
  } else trend = "—";

  // --- Candlesticks + a basic latest-candle read + weighted overall verdict ---
  const patterns = detectCandles(candles, trend);
  let lastCandle: TechSnapshot["lastCandle"] = null;
  { const lc = candles[candles.length - 1];
    if (lc && lc.open != null) {
      const body = lc.close - lc.open, range = Math.max(lc.high - lc.low, 1e-9);
      const upW = lc.high - Math.max(lc.open, lc.close), loW = Math.min(lc.open, lc.close) - lc.low;
      if (Math.abs(body) / range < 0.12) lastCandle = { label: "Small body / flat", tone: "info" };
      else if (body > 0) lastCandle = { label: loW > Math.abs(body) ? "Up · long lower wick" : "Up candle", tone: "bull" };
      else lastCandle = { label: upW > Math.abs(body) ? "Down · long upper wick" : "Down candle", tone: "bear" };
    } }
  const overall = overallRead({ rsi: rsiNow, rsiTrend, ob: OB, os: OS, adx: adxNow, adxTrend: ADX_TREND, diUp, maStack, volRising, divergence, pattern: patterns[0] || null });
  // Candlestick-led action → falls back to the overall verdict when no candle.
  let action: TechSnapshot["action"] = "Hold";
  const pTone = patterns[0]?.tone;
  if (pTone === "bull") action = "Buy";
  else if (pTone === "bear") action = "Sell";
  else if (overall?.label?.startsWith("Bottoming")) action = "Buy";
  else if (overall?.label?.startsWith("Topping")) action = "Sell";
  else if (overall?.tone === "bull") action = "Buy";
  else if (overall?.tone === "bear") action = "Sell";

  // --- Support / Resistance (Donchian swing) + pivot + a light chart-pattern read ---
  let support: number | null = null, resistance: number | null = null, pivot: number | null = null;
  let chartPattern: TechSnapshot["chartPattern"] = null;
  if (price != null && candles.length >= 25) {
    const N = 20;
    resistance = Math.max(...highs.slice(-N));
    support = Math.min(...lows.slice(-N));
    const lb = candles[candles.length - 1];
    pivot = (lb.high + lb.low + lb.close) / 3;
    const tr: number[] = [];
    for (let i = 1; i < closes.length; i++) tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const recentATR = mean(tr.slice(-7)), priorATR = mean(tr.slice(-28, -7));
    const mv = closes[closes.length - 1] / closes[Math.max(0, closes.length - 15)] - 1;
    if (price >= resistance * 0.998) chartPattern = { label: "Donchian breakout ↑", tone: "bull" };
    else if (price <= support * 1.002) chartPattern = { label: "Donchian breakdown ↓", tone: "bear" };
    else if (priorATR > 0 && recentATR < priorATR * 0.6) chartPattern = { label: "Squeeze · coiling", tone: "warn" };  // strong volatility contraction (triangle)
    else if (priorATR > 0 && Math.abs(mv) > 0.08 && recentATR < priorATR * 0.8) chartPattern = { label: mv > 0 ? "Bull flag" : "Bear flag", tone: mv > 0 ? "bull" : "bear" };
    else {
      // Honest range read — where price sits in the 20-bar channel (not a fake pattern).
      const span = resistance - support;
      const pos = span > 0 ? (price - support) / span : 0.5;
      if (pos >= 0.66) chartPattern = { label: "Upper channel", tone: "bull" };
      else if (pos <= 0.34) chartPattern = { label: "Lower channel", tone: "bear" };
      else chartPattern = { label: "Range-bound (mid)", tone: "info" };
    }
  }

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
    if (adxNow >= ADX_TREND && pdi != null && mdi != null && Math.abs(pdi - mdi) >= DI_SPREAD) {
      if (pdi > mdi) signals.push({ key: "adx-bull", label: `Strong uptrend (ADX ${Math.round(adxNow)})`, tone: "bull" });
      else signals.push({ key: "adx-bear", label: `Strong downtrend (ADX ${Math.round(adxNow)})`, tone: "bear" });
    } else if (adxNow < 20) {
      signals.push({ key: "adx-weak", label: `Weak/no trend (ADX ${Math.round(adxNow)})`, tone: "info" });
    }
  }
  // Volume surge vs the 5-bar average (user-tunable threshold).
  if (volVs5 != null && volVs5 >= VOL_SURGE) signals.push({ key: "vol-surge", label: `Volume surge +${Math.round(volVs5)}%`, tone: volRising ? "bull" : "warn" });
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

  return {
    ok: true,
    price: r2(price), rsi: r2(rsiNow), rsiPrev: r2(rsiPrev), adx: r2(adxNow), plusDI: r2(pdi), minusDI: r2(mdi),
    sma10: r2(s10), sma20: r2(s20), sma50: r2(s50), sma200: r2(s200), trend,
    vsSma50Pct: r2(vs50), vsSma200Pct: r2(vs200), maStack, diUp,
    volVs5Pct: r2(volVs5), volVs10Pct: r2(volVs10), volRising,
    rsiTrend, divergence, near52w, overall, action,
    support: r2(support), resistance: r2(resistance), pivot: r2(pivot), chartPattern, lastCandle,
    signals, patterns,
  };
}

// Weighted overall read — blends MA stack (primary trend), ADX/DI (momentum),
// RSI (momentum + extremes), volume (confirmation) and the candlestick pattern
// into one plain-language verdict. Research language, not buy/sell.
function overallRead(x: {
  rsi: number | null; rsiTrend: TechSnapshot["rsiTrend"]; ob: number; os: number;
  adx: number | null; adxTrend: number; diUp: boolean | null; maStack: MaStack;
  volRising: boolean | null; divergence: TechSnapshot["divergence"]; pattern: CandlePattern | null;
}): TechSnapshot["overall"] {
  let score = 0;
  const ml = x.maStack?.label || "";
  if (ml === "Perfect uptrend") score += 2;
  else if (ml === "Uptrend intact") score += 1;
  else if (ml === "Uptrend · below 20-DMA") score += 0;
  else if (ml === "Below 50-DMA") score -= 1;
  else if (ml === "Downtrend") score -= 1.5;
  else if (ml === "Perfect downtrend") score -= 2;
  // Momentum (ADX + DI).
  if (x.adx != null && x.adx >= x.adxTrend && x.diUp != null) score += x.diUp ? 1 : -1;
  // RSI direction.
  if (x.rsiTrend === "rising") score += 0.7;
  else if (x.rsiTrend === "falling") score -= 0.7;
  // Volume confirmation (amplifies the existing lean).
  if (x.volRising) score += score >= 0 ? 0.4 : -0.4;
  // Candle.
  if (x.pattern?.tone === "bull") score += 0.6;
  else if (x.pattern?.tone === "bear") score -= 0.6;

  const rsi = x.rsi;
  // Special turning-point reads take priority when extremes align with a signal.
  if (rsi != null && rsi <= x.os && (x.rsiTrend === "rising" || x.pattern?.tone === "bull" || x.divergence === "bullish"))
    return { label: "Bottoming — may be turning up", tone: "warn" };
  if (rsi != null && rsi >= x.ob && (x.rsiTrend === "falling" || x.pattern?.tone === "bear" || x.divergence === "bearish"))
    return { label: "Topping — losing steam", tone: "warn" };
  if (x.divergence === "bearish" && score > 0) return { label: "Uptrend but weakening (bearish divergence)", tone: "warn" };
  if (x.divergence === "bullish" && score < 0) return { label: "Downtrend but firming (bullish divergence)", tone: "warn" };

  if (score >= 2.5) return { label: "Strong uptrend", tone: "bull" };
  if (score >= 1) return { label: "Uptrend", tone: "bull" };
  if (score > -1) return { label: "Sideways / range", tone: "info" };
  if (score > -2.5) return { label: "Downtrend", tone: "bear" };
  return { label: "Strong downtrend", tone: "bear" };
}
