import YahooFinance from "yahoo-finance2";
import { subDays } from "date-fns";

const yahooFinance = new YahooFinance();

/**
 * Moving-average-stack trend engine.
 *
 * Key design: trend state is evaluated on CONFIRMED DAILY CLOSES (not live
 * intraday price), and trend CHANGES are detected intrinsically by comparing
 * the last daily bar to the one before it. This means:
 *   - no intraday whipsaw (a price hovering at a MA can't flip the state),
 *   - change detection is self-contained (needs no stored history), so it works
 *     identically in the app and in a stateless cron job,
 *   - reproducible: the same bar always yields the same events.
 */

export type TrendState = "strong_up" | "up" | "neutral" | "down" | "strong_down";

const STATE_RANK: Record<TrendState, number> = { strong_down: 0, down: 1, neutral: 2, up: 3, strong_up: 4 };
export const STATE_LABEL: Record<TrendState, string> = {
  strong_up: "Strong Uptrend",
  up: "Uptrend",
  neutral: "Neutral",
  down: "Downtrend",
  strong_down: "Strong Downtrend",
};

function smaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function classify(price: number, m10: number, m20: number, m50: number, m200: number): { state: TrendState; score: number } {
  const bulls = [price > m10, m10 > m20, m20 > m50, m50 > m200].filter(Boolean).length;
  const state: TrendState =
    bulls === 4 ? "strong_up" : bulls === 3 ? "up" : bulls === 2 ? "neutral" : bulls === 1 ? "down" : "strong_down";
  return { state, score: bulls };
}

export type TrendEvent = { type: string; message: string; kind: "bull" | "bear" };
export type TrendResult = {
  symbol: string;
  name: string;
  ok: boolean;
  reason?: string;
  price?: number;
  currency?: string;
  changePct?: number | null;
  state?: TrendState;
  prevState?: TrendState;
  score?: number;
  ma?: { m10: number | null; m20: number | null; m50: number | null; m200: number | null };
  stack?: { pOver10: boolean; m10Over20: boolean; m20Over50: boolean; m50Over200: boolean };
  golden?: boolean;
  aboveMA200?: boolean;
  has200?: boolean;
  barDate?: string;
  changedToday?: boolean;
  events?: TrendEvent[];
};

export async function evaluateTrend(symbol: string, name?: string): Promise<TrendResult> {
  try {
    const period1 = subDays(new Date(), 340).toISOString().split("T")[0];
    const [chartRes, quote] = await Promise.all([
      yahooFinance.chart(symbol, { period1, interval: "1d" }).catch(() => null),
      yahooFinance.quote(symbol).catch(() => null),
    ]);
    const rows = ((chartRes as any)?.quotes || []).filter((q: any) => q && q.close != null);
    if (rows.length < 30) return { symbol, name: name || symbol, ok: false, reason: "Not enough history" };

    const closes: number[] = rows.map((r: any) => Number(r.close));
    const n = closes.length;
    const s10 = smaSeries(closes, 10);
    const s20 = smaSeries(closes, 20);
    const s50 = smaSeries(closes, 50);
    const s200 = smaSeries(closes, 200);

    const iLast = n - 1;
    const iPrev = n - 2;
    if (s50[iLast] == null || s50[iPrev] == null || s10[iLast] == null || s20[iLast] == null) {
      return { symbol, name: name || symbol, ok: false, reason: "Not enough history" };
    }

    const has200 = s200[iLast] != null && s200[iPrev] != null;
    const at = (i: number) => {
      const m200 = has200 ? (s200[i] as number) : (s50[i] as number); // fall back to 50 as long-term ref
      return { price: closes[i], m10: s10[i] as number, m20: s20[i] as number, m50: s50[i] as number, m200 };
    };
    const cur = at(iLast);
    const prev = at(iPrev);

    const nowC = classify(cur.price, cur.m10, cur.m20, cur.m50, cur.m200);
    const prevC = classify(prev.price, prev.m10, prev.m20, prev.m50, prev.m200);

    const goldenNow = cur.m50 > cur.m200;
    const goldenPrev = prev.m50 > prev.m200;
    const above200Now = cur.price > cur.m200;
    const above200Prev = prev.price > prev.m200;

    const name2 = (quote as any)?.shortName || (quote as any)?.longName || name || symbol;
    const events: TrendEvent[] = [];
    // state transition (one, most specific)
    if (nowC.state === "strong_up" && prevC.state !== "strong_up")
      events.push({ type: "perfectUp", kind: "bull", message: `${name2}: Perfect Uptrend formed — Price > 10 > 20 > 50 > 200 DMA` });
    else if (nowC.state === "strong_down" && prevC.state !== "strong_down")
      events.push({ type: "perfectDown", kind: "bear", message: `${name2}: Perfect Downtrend formed — Price < 10 < 20 < 50 < 200 DMA` });
    else if (STATE_RANK[nowC.state] > STATE_RANK[prevC.state])
      events.push({ type: "trendUp", kind: "bull", message: `${name2}: Trend turning up (${STATE_LABEL[prevC.state]} → ${STATE_LABEL[nowC.state]})` });
    else if (STATE_RANK[nowC.state] < STATE_RANK[prevC.state])
      events.push({ type: "trendDown", kind: "bear", message: `${name2}: Trend weakening (${STATE_LABEL[prevC.state]} → ${STATE_LABEL[nowC.state]})` });
    // crosses / 200-DMA (independent), only meaningful with a real 200-DMA
    if (has200) {
      if (goldenNow && !goldenPrev) events.push({ type: "goldenCross", kind: "bull", message: `${name2}: Golden Cross — 50-DMA crossed above 200-DMA` });
      if (!goldenNow && goldenPrev) events.push({ type: "deathCross", kind: "bear", message: `${name2}: Death Cross — 50-DMA crossed below 200-DMA` });
      if (above200Now && !above200Prev) events.push({ type: "reclaim200", kind: "bull", message: `${name2}: reclaimed its 200-DMA` });
      if (!above200Now && above200Prev) events.push({ type: "lost200", kind: "bear", message: `${name2}: lost its 200-DMA (trend warning)` });
    }

    const lastDate: Date = rows[iLast].date instanceof Date ? rows[iLast].date : new Date(rows[iLast].date);
    const barDate = lastDate.toISOString().split("T")[0];
    const changePct = prev.price ? ((cur.price - prev.price) / prev.price) * 100 : null;

    return {
      symbol,
      name: name2,
      ok: true,
      price: cur.price,
      currency: (quote as any)?.currency || (/\.(NS|BO)$/i.test(symbol) ? "INR" : "USD"),
      changePct,
      state: nowC.state,
      prevState: prevC.state,
      score: nowC.score,
      ma: { m10: cur.m10, m20: cur.m20, m50: cur.m50, m200: has200 ? cur.m200 : null },
      stack: { pOver10: cur.price > cur.m10, m10Over20: cur.m10 > cur.m20, m20Over50: cur.m20 > cur.m50, m50Over200: cur.m50 > cur.m200 },
      golden: goldenNow,
      aboveMA200: above200Now,
      has200,
      barDate,
      changedToday: nowC.state !== prevC.state,
      events,
    };
  } catch (e: any) {
    return { symbol, name: name || symbol, ok: false, reason: e?.message || "error" };
  }
}

export async function evaluateTrends(stocks: { symbol: string; name?: string }[]): Promise<TrendResult[]> {
  const clean = stocks
    .map((s) => ({ symbol: String(s.symbol || "").trim().toUpperCase(), name: s.name }))
    .filter((s) => s.symbol)
    .slice(0, 30);
  return Promise.all(clean.map((s) => evaluateTrend(s.symbol, s.name)));
}
