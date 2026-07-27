/**
 * Analytics engine (StockAnalytix) — Quant / statistical, NOT prediction.
 * --------------------------------------------------------------------
 *  - Seasonality: average return per calendar month over available history.
 *  - Backtest / Signal Edge: for well-defined historical signals (RSI cross,
 *    MA reclaim, uptrend regime, golden cross), measure the FORWARD N-day
 *    return distribution — i.e. "historically, after this signal, what happened
 *    next?". This is descriptive statistics of the past, not a forecast.
 *
 * Accuracy rules: every number is computed from real candles. Where history is
 * too short, the section returns a clean "insufficient" state. Research
 * language only; results explicitly note that past behaviour does not predict
 * the future.
 */
import { SMA, RSI } from "technicalindicators";

export const ANALYTICS_DISCLAIMER =
  "Research support only. Historical statistics, not a prediction. Past behaviour does not guarantee future results. Always verify data independently.";

function toDate(d: any): Date {
  return d instanceof Date ? d : new Date(d);
}
function padFront<T>(arr: T[], len: number): (T | null)[] {
  const miss = len - arr.length;
  return miss > 0 ? [...Array(miss).fill(null), ...arr] : arr;
}

// ====================================================================
// SEASONALITY — average return per calendar month
// ====================================================================
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function computeSeasonality(candles: any[]) {
  const valid = (candles || []).filter((c) => c && c.close != null);
  if (valid.length < 60) {
    return { available: false, months: [], note: "Not enough history to compute seasonality." };
  }

  // Build month-end closes, then month-over-month returns grouped by calendar month.
  const byMonth: Record<string, { last: number; year: number; month: number }> = {};
  for (const c of valid) {
    const d = toDate(c.date);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    byMonth[key] = { last: Number(c.close), year: d.getUTCFullYear(), month: d.getUTCMonth() };
  }
  const ordered = Object.values(byMonth).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  );

  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1].last;
    const cur = ordered[i].last;
    if (prev > 0) {
      const ret = ((cur - prev) / prev) * 100;
      buckets[ordered[i].month].push(ret);
    }
  }

  const months = MONTHS.map((name, m) => {
    const arr = buckets[m];
    if (arr.length === 0)
      return { month: name, avgReturn: null, winRate: null, years: 0, display: "—", winDisplay: "—" };
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const wins = arr.filter((r) => r > 0).length;
    const winRate = (wins / arr.length) * 100;
    return {
      month: name,
      avgReturn: Number(avg.toFixed(2)),
      winRate: Number(winRate.toFixed(0)),
      years: arr.length,
      display: `${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%`,
      winDisplay: `${winRate.toFixed(0)}%`,
    };
  });

  const best = months.filter((m) => m.avgReturn !== null).sort((a, b) => (b.avgReturn as number) - (a.avgReturn as number))[0];
  const worst = months.filter((m) => m.avgReturn !== null).sort((a, b) => (a.avgReturn as number) - (b.avgReturn as number))[0];

  return {
    available: true,
    months,
    yearsCovered: ordered.length > 0 ? Math.round((ordered.length) / 12) : 0,
    best: best ? `${best.month} (${best.display})` : "—",
    worst: worst ? `${worst.month} (${worst.display})` : "—",
    note: "Average month-over-month return per calendar month across available years. Descriptive only.",
  };
}

// ====================================================================
// BACKTEST / SIGNAL EDGE — forward returns after historical signals
// ====================================================================
function fwdReturn(closes: number[], i: number, horizon: number): number | null {
  const j = i + horizon;
  if (j >= closes.length) return null;
  const base = closes[i];
  if (!base) return null;
  return ((closes[j] - base) / base) * 100;
}

function summarize(returns: number[]) {
  if (returns.length === 0) return { count: 0, avg: null, win: null, best: null, worst: null };
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const win = (returns.filter((r) => r > 0).length / returns.length) * 100;
  return {
    count: returns.length,
    avg: Number(avg.toFixed(2)),
    win: Number(win.toFixed(0)),
    best: Number(Math.max(...returns).toFixed(1)),
    worst: Number(Math.min(...returns).toFixed(1)),
  };
}

export function computeBacktest(candles: any[]) {
  const valid = (candles || []).filter((c) => c && c.close != null);
  if (valid.length < 220) {
    return { available: false, signals: [], note: "Not enough history (need ~1 year+) to backtest signals." };
  }
  const closes = valid.map((c) => Number(c.close));
  const highs = valid.map((c) => Number(c.high ?? c.close));
  const lows = valid.map((c) => Number(c.low ?? c.close));
  const len = closes.length;

  const sma50 = padFront(SMA.calculate({ period: 50, values: closes }), len);
  const sma200 = padFront(SMA.calculate({ period: 200, values: closes }), len);
  const rsi = padFront(RSI.calculate({ period: 14, values: closes }), len);

  const HORIZONS = [5, 10, 20];
  const cross = (arr: (number | null)[], i: number, level: number) =>
    i > 0 && arr[i - 1] != null && arr[i] != null && (arr[i - 1] as number) < level && (arr[i] as number) >= level;

  // signal -> list of trigger indices (avoid clustering: skip if within 3 days of last)
  const signalDefs: { key: string; name: string; desc: string; test: (i: number) => boolean }[] = [
    {
      key: "rsi50",
      name: "RSI crosses above 50",
      desc: "Momentum turning up from neutral.",
      test: (i) => cross(rsi, i, 50),
    },
    {
      key: "rsi30",
      name: "RSI reclaims 30 (oversold bounce)",
      desc: "Price bouncing out of oversold.",
      test: (i) => cross(rsi, i, 30),
    },
    {
      key: "ma50",
      name: "Price reclaims 50-DMA",
      desc: "Close crosses back above the 50-day average.",
      test: (i) =>
        i > 0 &&
        sma50[i] != null &&
        sma50[i - 1] != null &&
        closes[i - 1] < (sma50[i - 1] as number) &&
        closes[i] >= (sma50[i] as number),
    },
    {
      key: "uptrend",
      name: "Uptrend regime (price > 50 > 200 DMA)",
      desc: "Every day the stock is in a clean uptrend stack.",
      test: (i) =>
        sma50[i] != null &&
        sma200[i] != null &&
        closes[i] > (sma50[i] as number) &&
        (sma50[i] as number) > (sma200[i] as number),
    },
    {
      key: "golden",
      name: "Golden cross (50 crosses above 200)",
      desc: "50-DMA crosses above the 200-DMA.",
      test: (i) =>
        i > 0 &&
        sma50[i] != null &&
        sma200[i] != null &&
        sma50[i - 1] != null &&
        sma200[i - 1] != null &&
        (sma50[i - 1] as number) <= (sma200[i - 1] as number) &&
        (sma50[i] as number) > (sma200[i] as number),
    },
  ];

  const signals = signalDefs.map((def) => {
    const triggers: number[] = [];
    let last = -10;
    for (let i = 0; i < len; i++) {
      if (def.test(i)) {
        // For regime signals (uptrend) sample without clustering filter would
        // overcount adjacent days; keep a 1-day spacing for event signals.
        if (def.key === "uptrend" || i - last >= 3) {
          triggers.push(i);
          last = i;
        }
      }
    }
    const horizons = HORIZONS.map((h) => {
      const rets = triggers
        .map((i) => fwdReturn(closes, i, h))
        .filter((r): r is number => r !== null);
      return { horizon: h, ...summarize(rets) };
    });
    const base = horizons.find((h) => h.horizon === 20) || horizons[0];
    let edge = "Neutral";
    if (base.avg !== null && base.win !== null) {
      if (base.avg > 1.5 && base.win >= 55) edge = "Positive historical edge";
      else if (base.avg < -1 || base.win < 45) edge = "Negative historical edge";
      else edge = "Mixed / no clear edge";
    } else edge = "Insufficient samples";
    return {
      key: def.key,
      name: def.name,
      desc: def.desc,
      occurrences: triggers.length,
      horizons,
      edge,
    };
  });

  return {
    available: true,
    signals,
    historyDays: len,
    note: "Forward returns measured 5 / 10 / 20 trading days after each historical signal. Descriptive statistics of the past — not a forecast.",
  };
}

export function computeAnalytics(candles: any[]) {
  return {
    generatedAt: new Date().toISOString(),
    disclaimer: ANALYTICS_DISCLAIMER,
    seasonality: computeSeasonality(candles),
    backtest: computeBacktest(candles),
  };
}
