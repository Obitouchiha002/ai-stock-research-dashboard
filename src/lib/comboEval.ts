// Single source of truth for evaluating a combination against a stock's raw
// metrics. Used by the /api/screen route (server) and the background
// ComboMonitor (client), so the two never drift apart.
import type { ScreenConditions } from "@/lib/storage";

export type ComboRaw = {
  price?: number | null;
  dma10?: number | null;
  dma20?: number | null;
  dma50?: number | null;
  dma200?: number | null;
  rsi?: number | null;
  adx?: number | null;
  pctFromHigh?: number | null; // % of 52w high (negative = below)
  pctFromLow?: number | null; // % above 52w low (positive)
  recentHigh?: number | null; // ~3-month high (resistance)
  recentLow?: number | null; // ~3-month low (support)
  ath?: number | null;
  atl?: number | null;
  earningsGrowth?: number | null; // quarterly EPS YoY, %
};

const ORDER = ["price", "10", "20", "50", "200"];

export function evalConditions(
  r: ComboRaw,
  c: ScreenConditions,
): { passed: Record<string, boolean>; match: boolean } {
  const passed: Record<string, boolean> = {};
  const price = r.price ?? null;
  const ref200 = r.dma200 ?? r.dma50 ?? null;

  if (c.maStack) {
    const picked = (c.stackLevels && c.stackLevels.length ? c.stackLevels : ORDER).filter((l) => ORDER.includes(l));
    const valMap: Record<string, number | null | undefined> = { price, "10": r.dma10, "20": r.dma20, "50": r.dma50, "200": ref200 };
    const vals = ORDER.filter((l) => picked.includes(l)).map((l) => valMap[l]);
    passed.maStack = vals.length >= 2 && vals.every((v) => v != null) && vals.every((v, i) => i === 0 || (vals[i - 1] as number) > (v as number));
  }
  if (c.above200) passed.above200 = ref200 != null && price != null && price > ref200;
  if (c.golden) passed.golden = r.dma50 != null && ref200 != null && r.dma50 > ref200;
  if (c.adx) passed.adx = r.adx != null && r.adx >= (c.adxMin ?? 20);
  if (c.rsiStrong) passed.rsiStrong = r.rsi != null && r.rsi >= (c.rsiMin ?? 55);
  if (c.nearHigh) passed.nearHigh = r.pctFromHigh != null && r.pctFromHigh >= -Math.abs(c.nearPct ?? 5);
  if (c.near52wLow) passed.near52wLow = r.pctFromLow != null && r.pctFromLow <= Math.abs(c.nearLowPct ?? 5);
  if (c.atAth) passed.atAth = r.ath != null && price != null && price >= r.ath * 0.98;
  if (c.atAtl) passed.atAtl = r.atl != null && price != null && price <= r.atl * 1.02;
  if (c.nearSupport) passed.nearSupport = r.recentLow != null && price != null && ((price - r.recentLow) / r.recentLow) * 100 <= Math.abs(c.supportPct ?? 3);
  if (c.nearResistance) passed.nearResistance = r.recentHigh != null && price != null && ((r.recentHigh - price) / r.recentHigh) * 100 <= Math.abs(c.resistancePct ?? 3);
  if (c.earningsUp) passed.earningsUp = r.earningsGrowth != null && r.earningsGrowth > 0;
  if (c.priceRule) {
    const val = Number(c.priceVal);
    passed.priceRule = price != null && Number.isFinite(val) && ((c.priceOp || ">") === ">" ? price > val : price < val);
  }

  const keys = Object.keys(passed);
  return { passed, match: keys.length > 0 && keys.every((k) => passed[k]) };
}
