import YahooFinance from "yahoo-finance2";
import { subDays } from "date-fns";
import * as TI from "technicalindicators";
import { detectChartPatterns } from "./chartPatternService";

const yahooFinance = new YahooFinance();

/**
 * Candlestick pattern scanner.
 *
 * The `technicalindicators` detectors answer "is this pattern present at the END
 * of the supplied window?". So we slide a 5-candle window across recent history
 * and record every hit, giving a dated list instead of only the latest bar.
 *
 * Research language only — a pattern is context, never a buy/sell instruction.
 */
export type PatternType = "Bullish" | "Bearish" | "Neutral";

type Entry = {
  fn: (input: any) => boolean;
  name: string;
  type: PatternType;
  reliability: "High" | "Medium" | "Low";
  meaning: string;
};

const C: any = TI;

// Only include detectors the installed package actually exposes.
const CATALOG: Entry[] = (
  [
    // ---- Bullish ----
    { fn: C.bullishengulfingpattern, name: "Bullish Engulfing", type: "Bullish", reliability: "High", meaning: "A big up candle fully covers the prior down candle — buyers took control." },
    { fn: C.morningstar, name: "Morning Star", type: "Bullish", reliability: "High", meaning: "Three-bar reversal after a decline: sell-off, pause, then a strong push up." },
    { fn: C.morningdojistar, name: "Morning Doji Star", type: "Bullish", reliability: "High", meaning: "Morning Star with a doji middle — indecision resolving upward." },
    { fn: C.threewhitesoldiers, name: "Three White Soldiers", type: "Bullish", reliability: "High", meaning: "Three strong up candles in a row — sustained buying." },
    { fn: C.hammerpattern, name: "Hammer", type: "Bullish", reliability: "Medium", meaning: "Long lower wick after a fall — sellers pushed down but buyers recovered the close." },
    { fn: C.piercingline, name: "Piercing Line", type: "Bullish", reliability: "Medium", meaning: "Gap down then a close back above the midpoint of the prior red candle." },
    { fn: C.bullishharami, name: "Bullish Harami", type: "Bullish", reliability: "Medium", meaning: "Small up candle inside a large down candle — selling momentum stalling." },
    { fn: C.bullishharamicross, name: "Bullish Harami Cross", type: "Bullish", reliability: "Medium", meaning: "Harami whose inside bar is a doji — a sharper pause in selling." },
    { fn: C.tweezerbottom, name: "Tweezer Bottom", type: "Bullish", reliability: "Medium", meaning: "Two bars share almost the same low — support held twice." },
    { fn: C.bullishmarubozu, name: "Bullish Marubozu", type: "Bullish", reliability: "Medium", meaning: "Up candle with almost no wicks — buying from open to close." },
    { fn: C.dragonflydoji, name: "Dragonfly Doji", type: "Bullish", reliability: "Medium", meaning: "Open and close near the high after a deep wick — rejection of lower prices." },
    { fn: C.bullishinvertedhammerstick, name: "Inverted Hammer", type: "Bullish", reliability: "Low", meaning: "Long upper wick after a decline — an early attempt by buyers." },
    // ---- Bearish ----
    { fn: C.bearishengulfingpattern, name: "Bearish Engulfing", type: "Bearish", reliability: "High", meaning: "A big down candle fully covers the prior up candle — sellers took control." },
    { fn: C.eveningstar, name: "Evening Star", type: "Bearish", reliability: "High", meaning: "Three-bar reversal after a rise: rally, pause, then a strong drop." },
    { fn: C.eveningdojistar, name: "Evening Doji Star", type: "Bearish", reliability: "High", meaning: "Evening Star with a doji middle — indecision resolving downward." },
    { fn: C.threeblackcrows, name: "Three Black Crows", type: "Bearish", reliability: "High", meaning: "Three strong down candles in a row — sustained selling." },
    { fn: C.shootingstar, name: "Shooting Star", type: "Bearish", reliability: "Medium", meaning: "Long upper wick after a rally — buyers pushed up but gave it all back." },
    { fn: C.darkcloudcover, name: "Dark Cloud Cover", type: "Bearish", reliability: "Medium", meaning: "Gap up then a close back below the midpoint of the prior green candle." },
    { fn: C.bearishharami, name: "Bearish Harami", type: "Bearish", reliability: "Medium", meaning: "Small down candle inside a large up candle — buying momentum stalling." },
    { fn: C.bearishharamicross, name: "Bearish Harami Cross", type: "Bearish", reliability: "Medium", meaning: "Harami whose inside bar is a doji — a sharper pause in buying." },
    { fn: C.hangingman, name: "Hanging Man", type: "Bearish", reliability: "Medium", meaning: "Hammer shape after a rally — long lower wick warns of supply." },
    { fn: C.tweezertop, name: "Tweezer Top", type: "Bearish", reliability: "Medium", meaning: "Two bars share almost the same high — resistance held twice." },
    { fn: C.bearishmarubozu, name: "Bearish Marubozu", type: "Bearish", reliability: "Medium", meaning: "Down candle with almost no wicks — selling from open to close." },
    { fn: C.gravestonedoji, name: "Gravestone Doji", type: "Bearish", reliability: "Medium", meaning: "Open and close near the low after a tall wick — rejection of higher prices." },
    // ---- Neutral ----
    // NOTE: spinning tops are deliberately excluded — they fire on most bars with
    // a small body and drown out the meaningful signals.
    { fn: C.doji, name: "Doji", type: "Neutral", reliability: "Low", meaning: "Open and close nearly equal — indecision; usually needs the next bar to confirm." },
    { fn: C.abandonedbaby, name: "Abandoned Baby", type: "Bullish", reliability: "High", meaning: "Gapped doji isolated between two bars — a rare, sharp reversal signal." },
  ] as Entry[]
).filter((e) => typeof e.fn === "function");

export type DetectedPattern = {
  name: string;
  type: PatternType;
  reliability: "High" | "Medium" | "Low";
  meaning: string;
  date: string;
  close: number;
  /** % move over the 5 bars after the pattern — null if it is still too recent. */
  after5dPct: number | null;
};

const WINDOW = 5;

export function scanPatterns(rows: any[], lookback = 90): DetectedPattern[] {
  const opens = rows.map((r) => Number(r.open));
  const highs = rows.map((r) => Number(r.high));
  const lows = rows.map((r) => Number(r.low));
  const closes = rows.map((r) => Number(r.close));
  const dates = rows.map((r) => {
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    return d.toISOString().split("T")[0];
  });

  const n = rows.length;
  const start = Math.max(WINDOW - 1, n - lookback);
  const found: DetectedPattern[] = [];

  for (let i = start; i < n; i++) {
    const w = {
      open: opens.slice(i - WINDOW + 1, i + 1),
      high: highs.slice(i - WINDOW + 1, i + 1),
      low: lows.slice(i - WINDOW + 1, i + 1),
      close: closes.slice(i - WINDOW + 1, i + 1),
    };
    for (const p of CATALOG) {
      let hit = false;
      try {
        hit = !!p.fn(w);
      } catch {
        hit = false;
      }
      if (!hit) continue;
      // suppress the same pattern repeating on back-to-back bars
      const dup = found.some((f) => f.name === p.name && Math.abs(dates.indexOf(f.date) - i) <= 2);
      if (dup) continue;
      const fwd = i + 5 < n ? ((closes[i + 5] - closes[i]) / closes[i]) * 100 : null;
      found.push({
        name: p.name,
        type: p.type,
        reliability: p.reliability,
        meaning: p.meaning,
        date: dates[i],
        close: closes[i],
        after5dPct: fwd,
      });
    }
  }
  // newest first
  return found.reverse();
}

/** Anatomy + plain-English read of a single candle. */
function analyseCandle(rows: any[], i: number, volAvg: number | null) {
  const o = Number(rows[i].open), h = Number(rows[i].high), l = Number(rows[i].low), c = Number(rows[i].close);
  const range = Math.max(h - l, 1e-9);
  const body = Math.abs(c - o);
  const bodyPct = (body / range) * 100;
  const upperWickPct = ((h - Math.max(o, c)) / range) * 100;
  const lowerWickPct = ((Math.min(o, c) - l) / range) * 100;
  const closePosition = ((c - l) / range) * 100; // 100 = closed at the high
  const prevClose = i > 0 ? Number(rows[i - 1].close) : null;
  const changePct = prevClose ? ((c - prevClose) / prevClose) * 100 : null;
  const gapPct = prevClose ? ((o - prevClose) / prevClose) * 100 : null;
  const vol = rows[i].volume != null ? Number(rows[i].volume) : null;
  const volVsAvg = vol != null && volAvg ? vol / volAvg : null;

  const up = c >= o;
  let type: string;
  if (bodyPct < 10) type = "Doji — indecision";
  else if (bodyPct > 70) type = up ? "Strong bullish body" : "Strong bearish body";
  else if (lowerWickPct > 50) type = "Long lower wick — buyers defended";
  else if (upperWickPct > 50) type = "Long upper wick — sellers capped it";
  else type = up ? "Normal bullish candle" : "Normal bearish candle";

  const where =
    closePosition >= 70 ? "closed near the day's high" :
    closePosition <= 30 ? "closed near the day's low" :
    "closed mid-range";
  const volNote =
    volVsAvg == null ? "" :
    volVsAvg >= 1.5 ? ` on heavy volume (${volVsAvg.toFixed(1)}× the 20-day average)` :
    volVsAvg <= 0.6 ? ` on light volume (${volVsAvg.toFixed(1)}× average)` :
    " on average volume";

  return {
    date: (rows[i].date instanceof Date ? rows[i].date : new Date(rows[i].date)).toISOString().split("T")[0],
    open: o, high: h, low: l, close: c,
    changePct, gapPct,
    bodyPct, upperWickPct, lowerWickPct, closePosition,
    volume: vol, volVsAvg,
    type,
    reading: `Price ${where}${volNote}.`,
  };
}

/** How each pattern actually resolved on THIS stock in the past (not a forecast). */
function computeBaseRates(rows: any[], horizon = 5) {
  const closes = rows.map((r) => Number(r.close));
  const opens = rows.map((r) => Number(r.open));
  const highs = rows.map((r) => Number(r.high));
  const lows = rows.map((r) => Number(r.low));
  const n = rows.length;
  const agg: Record<string, { type: PatternType; hits: number[]; }> = {};

  for (let i = WINDOW - 1; i < n - horizon; i++) {
    const w = {
      open: opens.slice(i - WINDOW + 1, i + 1),
      high: highs.slice(i - WINDOW + 1, i + 1),
      low: lows.slice(i - WINDOW + 1, i + 1),
      close: closes.slice(i - WINDOW + 1, i + 1),
    };
    for (const p of CATALOG) {
      let hit = false;
      try { hit = !!p.fn(w); } catch { hit = false; }
      if (!hit) continue;
      const fwd = ((closes[i + horizon] - closes[i]) / closes[i]) * 100;
      if (!agg[p.name]) agg[p.name] = { type: p.type, hits: [] };
      agg[p.name].hits.push(fwd);
    }
  }

  return Object.entries(agg)
    .filter(([, v]) => v.hits.length >= 3)
    .map(([name, v]) => {
      const higher = v.hits.filter((x) => x > 0).length;
      const avg = v.hits.reduce((a, b) => a + b, 0) / v.hits.length;
      return {
        name,
        type: v.type,
        occurrences: v.hits.length,
        higherCount: higher,
        winRate: (higher / v.hits.length) * 100,
        avgMovePct: avg,
        horizon,
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences);
}

/** Recent-window summary: how the last N bars actually behaved. */
function summariseWindow(rows: any[], patterns: DetectedPattern[], bars: number) {
  const slice = rows.slice(-bars);
  const closes = slice.map((r) => Number(r.close));
  const highs = slice.map((r) => Number(r.high));
  const lows = slice.map((r) => Number(r.low));
  const dates = slice.map((r) => (r.date instanceof Date ? r.date : new Date(r.date)).toISOString().split("T")[0]);

  let up = 0, down = 0, flat = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) up++;
    else if (closes[i] < closes[i - 1]) down++;
    else flat++;
  }

  // current run of consecutive up / down closes
  let streakDir: "up" | "down" | "flat" = "flat", streak = 0;
  for (let i = closes.length - 1; i > 0; i--) {
    const dir = closes[i] > closes[i - 1] ? "up" : closes[i] < closes[i - 1] ? "down" : "flat";
    if (streak === 0) { streakDir = dir; streak = 1; }
    else if (dir === streakDir) streak++;
    else break;
  }

  const hi = Math.max(...highs), lo = Math.min(...lows);
  const last = closes[closes.length - 1];
  const first = closes[0];
  const inWindow = new Set(dates);
  const recent = patterns.filter((p) => inWindow.has(p.date));

  return {
    bars: slice.length,
    from: dates[0],
    to: dates[dates.length - 1],
    upDays: up,
    downDays: down,
    flatDays: flat,
    netChangePct: ((last - first) / first) * 100,
    high: hi,
    low: lo,
    rangePosition: ((last - lo) / Math.max(hi - lo, 1e-9)) * 100,
    streakDir,
    streak,
    bullishPatterns: recent.filter((p) => p.type === "Bullish").length,
    bearishPatterns: recent.filter((p) => p.type === "Bearish").length,
    neutralPatterns: recent.filter((p) => p.type === "Neutral").length,
    patterns: recent,
  };
}

export async function detectPatterns(symbol: string, interval: "1d" | "1wk" = "1d") {
  // 2 years of daily history so the historical base rates have enough samples.
  const period1 = subDays(new Date(), interval === "1wk" ? 1900 : 760).toISOString().split("T")[0];
  const chartRes: any = await yahooFinance.chart(symbol, { period1, interval }).catch(() => null);
  const rows = (chartRes?.quotes || []).filter(
    (q: any) => q && q.close != null && q.open != null && q.high != null && q.low != null,
  );
  if (rows.length < 10) {
    return { symbol, interval, ok: false, reason: "Not enough candle history.", patterns: [] as DetectedPattern[] };
  }

  const patterns = scanPatterns(rows, interval === "1wk" ? 60 : 90);
  const counts = {
    bullish: patterns.filter((p) => p.type === "Bullish").length,
    bearish: patterns.filter((p) => p.type === "Bearish").length,
    neutral: patterns.filter((p) => p.type === "Neutral").length,
  };

  // ---- today's (latest closed) candle ----
  const n = rows.length;
  const volSlice = rows.slice(-21, -1).map((r: any) => Number(r.volume)).filter((v: number) => v > 0);
  const volAvg = volSlice.length ? volSlice.reduce((a: number, b: number) => a + b, 0) / volSlice.length : null;
  const today = analyseCandle(rows, n - 1, volAvg);
  const prev = n >= 2 ? analyseCandle(rows, n - 2, volAvg) : null;
  const todayPatterns = patterns.filter((p) => p.date === today.date);

  // ---- last-30-bar summary ----
  const window = interval === "1wk" ? 26 : 30;
  const last30 = summariseWindow(rows, patterns, window);

  // ---- historical base rates on this very stock ----
  const baseRates = computeBaseRates(rows, interval === "1wk" ? 3 : 5);
  const todayBaseRates = todayPatterns
    .map((p) => baseRates.find((b) => b.name === p.name))
    .filter(Boolean) as ReturnType<typeof computeBaseRates>;

  // ---- factual levels to watch on the next bar (no forecast, just the numbers) ----
  const watch = {
    above: today.high,
    below: today.low,
    prevClose: prev ? prev.close : null,
    windowHigh: last30.high,
    windowLow: last30.low,
    note:
      `A close above ${today.high.toFixed(2)} would extend today's range upward; ` +
      `a close below ${today.low.toFixed(2)} would break it downward. ` +
      `These are reference levels from the data, not a forecast.`,
  };

  // ---- classical multi-bar chart shapes (Double Top, H&S, triangles, …) ----
  const chart = detectChartPatterns(rows, interval === "1wk" ? 160 : 260);

  return {
    symbol,
    interval,
    ok: true,
    scanned: Math.min(rows.length, interval === "1wk" ? 60 : 90),
    historyBars: rows.length,
    chart,
    counts,
    // A plain read of the balance — not advice.
    bias:
      counts.bullish > counts.bearish
        ? "More bullish patterns recently"
        : counts.bearish > counts.bullish
          ? "More bearish patterns recently"
          : "Mixed / balanced",
    today: { ...today, patterns: todayPatterns, baseRates: todayBaseRates },
    prev,
    last30,
    baseRates,
    patterns,
  };
}
