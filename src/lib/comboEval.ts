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
  changePct?: number | null; // day change %
};

const ORDER = ["price", "10", "20", "50", "200"];

// Metrics a custom rule can reference (raw-field key -> label used in the UI).
export const RULE_METRICS: { k: string; label: string }[] = [
  { k: "price", label: "Price" },
  { k: "dma10", label: "10-DMA" },
  { k: "dma20", label: "20-DMA" },
  { k: "dma50", label: "50-DMA" },
  { k: "dma200", label: "200-DMA" },
  { k: "rsi", label: "RSI" },
  { k: "adx", label: "ADX" },
  { k: "pctFromHigh", label: "% from 52w high" },
  { k: "pctFromLow", label: "% from 52w low" },
  { k: "changePct", label: "Day change %" },
  { k: "earningsGrowth", label: "EPS growth %" },
];

function evalRule(r: ComboRaw, rule: any): boolean {
  const left = (r as any)[rule?.left];
  const right = rule?.rightType === "metric" ? (r as any)[rule?.rightMetric] : rule?.rightVal;
  if (left == null || right == null) return false;
  const a = Number(left), b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  switch (rule.op) {
    case ">": return a > b;
    case ">=": return a >= b;
    case "<": return a < b;
    case "<=": return a <= b;
    case "=": return a === b || Math.abs(a - b) <= Math.abs(b) * 0.005; // ~equal (0.5%)
    default: return false;
  }
}

const INVERT: Record<string, string> = { ">": "<", "<": ">", ">=": "<=", "<=": ">=", "=": "=" };

// Compile a chain (boxes joined by operators, e.g. Price < 10-DMA < 20-DMA) into
// pairwise AND rules. A value box can only sit on the right of a comparison, so
// a value-then-metric link is flipped (value < metric  ⇔  metric > value).
// Both-value links are meaningless for screening and are dropped.
export function chainToRules(chain: any[] | undefined): any[] {
  const nodes = (chain || []).filter(Boolean);
  const rules: any[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    const op = b?.op || ">";
    const aMetric = a?.kind === "metric" ? a.metric : null;
    const bMetric = b?.kind === "metric" ? b.metric : null;
    if (aMetric && bMetric) {
      rules.push({ id: `c${i}`, left: aMetric, op, rightType: "metric", rightMetric: bMetric, join: "and" });
    } else if (aMetric && !bMetric) {
      rules.push({ id: `c${i}`, left: aMetric, op, rightType: "value", rightVal: Number(b?.value), join: "and" });
    } else if (!aMetric && bMetric) {
      rules.push({ id: `c${i}`, left: bMetric, op: INVERT[op] || op, rightType: "value", rightVal: Number(a?.value), join: "and" });
    }
    // both values → skip
  }
  return rules;
}

// Evaluate multiple chain-groups: each group is AND-ed within itself, then the
// groups' boolean results are combined left-to-right by each group's join
// (and/or) — so (a AND b) OR (c AND d) is respected, unlike a flat rule fold.
export function evalChainGroups(r: ComboRaw, groups: any[] | undefined): { has: boolean; pass: boolean } {
  const gs = (groups || [])
    .map((g) => ({ join: g?.join, rules: chainToRules(g?.nodes) }))
    .filter((g) => g.rules.length);
  if (!gs.length) return { has: false, pass: false };
  let res: boolean | null = null;
  for (const g of gs) {
    const gp = evalRules(r, g.rules).pass; // all links within a group are AND
    res = res === null ? gp : g.join === "or" ? res || gp : res && gp;
  }
  return { has: true, pass: !!res };
}

// Combine rules left-to-right using each rule's connector to the previous one.
function evalRules(r: ComboRaw, rules: any[] | undefined): { has: boolean; pass: boolean } {
  const valid = (rules || []).filter((x) => x && x.left && x.op);
  if (!valid.length) return { has: false, pass: false };
  let res = evalRule(r, valid[0]);
  for (let i = 1; i < valid.length; i++) {
    const cur = evalRule(r, valid[i]);
    res = valid[i].join === "or" ? res || cur : res && cur;
  }
  return { has: true, pass: res };
}

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

  // Preset conditions must all pass; custom rules are evaluated separately and
  // AND-ed with the presets.
  const presetKeys = Object.keys(passed);
  const presetHas = presetKeys.length > 0;
  const presetPass = presetKeys.every((k) => passed[k]);
  // Priority: grouped chains (with AND/OR) → single legacy chain → freeform rules.
  const groups = (c as any).chainGroups;
  let rules: { has: boolean; pass: boolean };
  if (Array.isArray(groups) && groups.length) {
    rules = evalChainGroups(r, groups);
  } else {
    const chainRules = chainToRules((c as any).chain);
    const effectiveRules = chainRules.length ? chainRules : (c as any).rules;
    rules = evalRules(r, effectiveRules);
  }
  if (rules.has) passed.rules = rules.pass;
  const match =
    !presetHas && !rules.has
      ? false
      : (presetHas ? presetPass : true) && (rules.has ? rules.pass : true);
  return { passed, match };
}
