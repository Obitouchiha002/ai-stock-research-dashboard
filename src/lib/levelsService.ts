import YahooFinance from "yahoo-finance2";
import { subDays } from "date-fns";

const yahooFinance = new YahooFinance();

/**
 * Support & resistance from swing pivots.
 *
 * A single min()/max() of recent prices is not a level — it's just the extreme.
 * Real levels are prices the market has turned at repeatedly. So we:
 *   1. find swing pivots (a bar whose high/low is the extreme within ±k bars),
 *   2. cluster pivots that sit within a % tolerance of each other,
 *   3. score each cluster by how many times it was touched and how recently,
 *   4. label it support or resistance relative to the current price.
 */
export type Level = {
  price: number;
  type: "Support" | "Resistance";
  touches: number;
  strength: "Strong" | "Moderate" | "Weak";
  lastTouch: string;
  distancePct: number; // signed: + = above current price
};

function findPivots(highs: number[], lows: number[], k: number) {
  const highPivots: { i: number; price: number }[] = [];
  const lowPivots: { i: number; price: number }[] = [];
  for (let i = k; i < highs.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isHigh = false;
      if (lows[j] <= lows[i]) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highPivots.push({ i, price: highs[i] });
    if (isLow) lowPivots.push({ i, price: lows[i] });
  }
  return { highPivots, lowPivots };
}

export async function detectLevels(symbol: string) {
  const period1 = subDays(new Date(), 400).toISOString().split("T")[0];
  const chartRes: any = await yahooFinance.chart(symbol, { period1, interval: "1d" }).catch(() => null);
  const rows = (chartRes?.quotes || []).filter((q: any) => q && q.close != null && q.high != null && q.low != null);
  if (rows.length < 40) {
    return { symbol, ok: false, reason: "Not enough history for level detection.", levels: [] as Level[] };
  }

  const highs = rows.map((r: any) => Number(r.high));
  const lows = rows.map((r: any) => Number(r.low));
  const closes = rows.map((r: any) => Number(r.close));
  const dates = rows.map((r: any) => {
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    return d.toISOString().split("T")[0];
  });
  const current = closes[closes.length - 1];

  const { highPivots, lowPivots } = findPivots(highs, lows, 5);
  const all = [...highPivots, ...lowPivots];
  if (all.length === 0) {
    return { symbol, ok: false, reason: "No swing pivots found.", levels: [] as Level[] };
  }

  // Cluster pivots that sit within ~1.5% of each other.
  const TOL = 0.015;
  const sorted = [...all].sort((a, b) => a.price - b.price);
  const clusters: { prices: number[]; idxs: number[] }[] = [];
  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    const anchor = last ? last.prices[0] : null;
    if (last && anchor != null && Math.abs(p.price - anchor) / anchor <= TOL) {
      last.prices.push(p.price);
      last.idxs.push(p.i);
    } else {
      clusters.push({ prices: [p.price], idxs: [p.i] });
    }
  }

  const levels: Level[] = clusters
    .map((c) => {
      const price = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
      const touches = c.prices.length;
      const lastIdx = Math.max(...c.idxs);
      const recent = lastIdx > rows.length - 60; // touched in the last ~3 months
      const strength: Level["strength"] =
        touches >= 3 || (touches === 2 && recent) ? "Strong" : touches === 2 ? "Moderate" : "Weak";
      return {
        price,
        type: (price >= current ? "Resistance" : "Support") as Level["type"],
        touches,
        strength,
        lastTouch: dates[lastIdx],
        distancePct: ((price - current) / current) * 100,
      };
    })
    // drop single-touch noise far from price
    .filter((l) => l.touches >= 2 || Math.abs(l.distancePct) < 12);

  const supports = levels
    .filter((l) => l.type === "Support")
    .sort((a, b) => b.price - a.price)   // nearest below first
    .slice(0, 4);
  const resistances = levels
    .filter((l) => l.type === "Resistance")
    .sort((a, b) => a.price - b.price)   // nearest above first
    .slice(0, 4);

  const nearestSupport = supports[0] || null;
  const nearestResistance = resistances[0] || null;
  // Where price sits inside the nearest band (0% = at support, 100% = at resistance)
  let positionPct: number | null = null;
  if (nearestSupport && nearestResistance && nearestResistance.price > nearestSupport.price) {
    positionPct =
      ((current - nearestSupport.price) / (nearestResistance.price - nearestSupport.price)) * 100;
  }

  return {
    symbol,
    ok: true,
    current,
    supports,
    resistances,
    nearestSupport,
    nearestResistance,
    positionPct,
    levels: [...resistances, ...supports],
  };
}
