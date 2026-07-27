/**
 * Stock Evaluation Engine (StockAnalytix) — MarketSmith / CAN SLIM-inspired.
 * --------------------------------------------------------------------------
 * Builds an accurate, transparent stock evaluation from REAL computed data:
 *   - CAN SLIM Checklist (7 criteria, Pass / Watch / Fail / Data insufficient)
 *   - Composite Evaluation Rating (transparent blend of accurate sub-metrics)
 *   - Accumulation/Distribution Grade (A–E)
 *   - SMR-style Quality Grade (Sales · Margins · ROE)
 *   - Alpha / Beta (regression of stock returns vs index returns)
 *   - Multi-year fundamentals (annual revenue / EPS where the provider has them)
 *
 * Accuracy rules:
 *   - Every criterion shows the ACTUAL value it used.
 *   - Nothing is invented. Missing inputs => "Data insufficient" (never a fake Pass/Fail).
 *   - Composite is OUR blend, explicitly NOT a market-wide 1–99 percentile
 *     (a true percentile needs a full-universe database we do not maintain).
 *   - Research language only. No buy/sell advice. No prediction.
 */

export const EVALUATION_DISCLAIMER =
  "Research support only. Not buy/sell advice. No guaranteed prediction. Always verify data independently.";

const UNAVAILABLE = "Data Unavailable";
const INSUFFICIENT = "Data insufficient";

function n(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v.raw !== undefined) v = v.raw;
  const x = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? x : null;
}
function pct(v: number | null, d = 1) {
  return v === null ? INSUFFICIENT : `${v.toFixed(d)}%`;
}

// ====================================================================
// CAN SLIM CHECKLIST
// ====================================================================
type Criterion = {
  code: string;
  name: string;
  status: "Pass" | "Watch" | "Fail" | "Data insufficient";
  detail: string;
  value: string;
};

function grade3(value: number | null, pass: number, watch: number): "Pass" | "Watch" | "Fail" | "Data insufficient" {
  if (value === null) return "Data insufficient";
  if (value >= pass) return "Pass";
  if (value >= watch) return "Watch";
  return "Fail";
}

function computeCanSlim(momentum: any, summary: any, marketContext: any): {
  criteria: Criterion[];
  passes: number;
  fails: number;
  watches: number;
  insufficient: number;
  scorePct: number | null;
  summaryLabel: string;
} {
  const criteria: Criterion[] = [];

  // C — Current quarterly EPS growth (latest YoY).
  // Prefer Yahoo's direct earningsQuarterlyGrowth (most-recent quarter YoY);
  // fall back to a computed YoY from the quarterly EPS series if needed.
  const qGrowthStat = n(summary?.defaultKeyStatistics?.earningsQuarterlyGrowth);
  const epsRows = momentum?.quarterlyEps?.quarters || [];
  let computedYoY: number | null = null;
  for (let i = epsRows.length - 1; i >= 0; i--) {
    if (epsRows[i].yoyRaw !== null && epsRows[i].yoyRaw !== undefined) {
      computedYoY = epsRows[i].yoyRaw;
      break;
    }
  }
  const cVal = qGrowthStat !== null ? qGrowthStat * 100 : computedYoY;
  const cSource = qGrowthStat !== null ? "provider quarterly YoY" : "computed from quarterly EPS";
  criteria.push({
    code: "C",
    name: "Current Quarterly Earnings",
    status: grade3(cVal, 25, 10),
    value: cVal === null ? INSUFFICIENT : pct(cVal),
    detail:
      cVal === null
        ? "Quarterly EPS YoY growth not available from current provider."
        : `Latest quarter EPS YoY growth ${pct(cVal)} (${cSource}; CAN SLIM target ≥25%).`,
  });

  // A — Annual earnings growth (3yr EPS CAGR if available, else earningsGrowth)
  const annualGrowth =
    n(momentum?.multiYear?.epsCagr3y) ??
    (n(summary?.financialData?.earningsGrowth) !== null
      ? (n(summary?.financialData?.earningsGrowth) as number) * 100
      : null);
  criteria.push({
    code: "A",
    name: "Annual Earnings Growth",
    status: grade3(annualGrowth, 25, 10),
    value: annualGrowth === null ? INSUFFICIENT : pct(annualGrowth),
    detail:
      annualGrowth === null
        ? "Annual earnings growth not available from current provider."
        : `Annual earnings growth ${pct(annualGrowth)} (CAN SLIM target ≥25%).`,
  });

  // N — New high / proximity to 52-week high
  const price = n(momentum?.baseline?.startPrice) ?? n(momentum?.priceStrength?.currentPrice);
  const hi = n(momentum?.company?.fiftyTwoWeekHigh) ?? n(momentum?.candleExtras?.fiftyTwoWeekHigh);
  let pctFromHigh: number | null = null;
  if (price !== null && hi !== null && hi > 0) pctFromHigh = ((price - hi) / hi) * 100;
  let nStatus: Criterion["status"] = "Data insufficient";
  if (pctFromHigh !== null) {
    if (pctFromHigh >= -5) nStatus = "Pass"; // within 5% of high / at new high
    else if (pctFromHigh >= -15) nStatus = "Watch";
    else nStatus = "Fail";
  }
  criteria.push({
    code: "N",
    name: "New High (price leadership)",
    status: nStatus,
    value: pctFromHigh === null ? INSUFFICIENT : `${pctFromHigh.toFixed(1)}% from 52W high`,
    detail:
      pctFromHigh === null
        ? "52-week high / price unavailable."
        : `Price is ${Math.abs(pctFromHigh).toFixed(1)}% ${pctFromHigh >= 0 ? "above" : "below"} the 52-week high (leaders trade near highs).`,
  });

  // S — Supply & Demand (accumulation vs distribution + volume confirmation)
  const bd = momentum?.buyerDemand;
  let sStatus: Criterion["status"] = "Data insufficient";
  let sDetail = "Volume/demand data insufficient.";
  if (bd?.available) {
    const r = bd.rating;
    if (r === "Strong Accumulation") sStatus = "Pass";
    else if (r === "Positive Demand") sStatus = "Pass";
    else if (r === "Neutral Demand") sStatus = "Watch";
    else sStatus = "Fail";
    sDetail = `${r}. Up/Down volume ratio ${bd.metrics?.upDownVolumeRatio}, accumulation ${bd.metrics?.accumulationDays} vs distribution ${bd.metrics?.distributionDays} days.`;
  }
  criteria.push({
    code: "S",
    name: "Supply & Demand (volume)",
    status: sStatus,
    value: bd?.available ? bd.rating : INSUFFICIENT,
    detail: sDetail,
  });

  // L — Leader not Laggard (relative strength vs index/sector)
  const ps = momentum?.priceStrength;
  const vsIdx = n(ps?.vsIndex);
  const vsSec = n(ps?.vsSector);
  let lStatus: Criterion["status"] = "Data insufficient";
  let lDetail = "Relative strength vs index/sector unavailable.";
  if (vsIdx !== null || vsSec !== null) {
    const beats = [vsIdx, vsSec].filter((x) => x !== null && (x as number) > 0).length;
    const avail = [vsIdx, vsSec].filter((x) => x !== null).length;
    lStatus = beats === avail && avail > 0 ? "Pass" : beats > 0 ? "Watch" : "Fail";
    lDetail = `Stock vs index: ${vsIdx === null ? "n/a" : pct(vsIdx)}, vs sector: ${vsSec === null ? "n/a" : pct(vsSec)} (1M). Leaders outperform their group/index.`;
  } else if (ps?.ratingCode && ps.ratingCode !== "NA") {
    lStatus = ["A+", "A", "B"].includes(ps.ratingCode) ? "Pass" : ps.ratingCode === "C" ? "Watch" : "Fail";
    lDetail = `Price-strength rating ${ps.ratingCode} (relative comparison limited).`;
  }
  criteria.push({
    code: "L",
    name: "Leader not Laggard",
    status: lStatus,
    value: vsIdx !== null ? `vs Index ${pct(vsIdx)}` : ps?.ratingCode || INSUFFICIENT,
    detail: lDetail,
  });

  // I — Institutional Sponsorship
  const own = momentum?.ownership;
  let iStatus: Criterion["status"] = "Data insufficient";
  let iDetail = "Institutional ownership trend not provided by current provider for this symbol.";
  let iValue = INSUFFICIENT;
  if (own?.available && own.institutionsPercent !== UNAVAILABLE) {
    const instPct = n(own.institutionsPercent);
    iValue = own.institutionsPercent;
    if (instPct !== null) {
      iStatus = instPct >= 30 ? "Pass" : instPct >= 10 ? "Watch" : "Fail";
      iDetail = `Institutions hold ${own.institutionsPercent}${own.institutionsCount !== UNAVAILABLE ? ` across ${own.institutionsCount} holders` : ""}. (Quarter-over-quarter change not exposed by provider.)`;
    }
  }
  criteria.push({
    code: "I",
    name: "Institutional Sponsorship",
    status: iStatus,
    value: iValue,
    detail: iDetail,
  });

  // M — Market Direction (overall index trend)
  const mkt = marketContext?.marketContext;
  let mStatus: Criterion["status"] = "Data insufficient";
  let mDetail = "Market index trend unavailable.";
  let mValue = INSUFFICIENT;
  if (mkt?.available) {
    const t = mkt.trend || "";
    mValue = t;
    if (t.includes("Uptrend")) mStatus = "Pass";
    else if (t.includes("Neutral") || t === "") mStatus = "Watch";
    else mStatus = "Fail";
    mDetail = `Broad market index (${mkt.symbol || "index"}) is in a ${t}. ~3/4 of stocks follow the general market direction.`;
  }
  criteria.push({
    code: "M",
    name: "Market Direction",
    status: mStatus,
    value: mValue,
    detail: mDetail,
  });

  const passes = criteria.filter((c) => c.status === "Pass").length;
  const watches = criteria.filter((c) => c.status === "Watch").length;
  const fails = criteria.filter((c) => c.status === "Fail").length;
  const insufficient = criteria.filter((c) => c.status === "Data insufficient").length;
  const evaluable = criteria.length - insufficient;
  const scorePct = evaluable > 0 ? Math.round(((passes + watches * 0.5) / evaluable) * 100) : null;

  let summaryLabel = INSUFFICIENT;
  if (scorePct !== null) {
    if (scorePct >= 80) summaryLabel = "Strong CAN SLIM profile";
    else if (scorePct >= 60) summaryLabel = "Constructive — watch for confirmation";
    else if (scorePct >= 40) summaryLabel = "Mixed profile";
    else summaryLabel = "Weak CAN SLIM profile";
  }

  return { criteria, passes, fails, watches, insufficient, scorePct, summaryLabel };
}

// ====================================================================
// COMPOSITE EVALUATION RATING (transparent blend, NOT a market percentile)
// ====================================================================
function computeComposite(momentum: any, marketContext: any) {
  const parts: { key: string; weight: number; value: number | null; note: string }[] = [];

  // EPS strength from quarterly trend
  const epsLabel: string = momentum?.quarterlyEps?.trendLabel || "";
  let epsVal: number | null = null;
  if (momentum?.quarterlyEps?.available) {
    if (epsLabel.startsWith("Accelerating")) epsVal = 1;
    else if (epsLabel.startsWith("Stable")) epsVal = 0.75;
    else if (epsLabel.startsWith("Mixed")) epsVal = 0.5;
    else if (epsLabel.startsWith("Decelerating")) epsVal = 0.3;
    else if (epsLabel.startsWith("Negative")) epsVal = 0;
  }
  parts.push({ key: "Earnings (EPS) Strength", weight: 25, value: epsVal, note: epsLabel || INSUFFICIENT });

  // Relative price strength
  const psScore = n(momentum?.priceStrength?.score);
  parts.push({
    key: "Relative Price Strength",
    weight: 30,
    value: psScore === null ? null : psScore / 100,
    note: momentum?.priceStrength?.rating || INSUFFICIENT,
  });

  // Buyer demand / Acc-Dis
  let bdVal: number | null = null;
  if (momentum?.buyerDemand?.available) {
    const map: Record<string, number> = {
      "Strong Accumulation": 1,
      "Positive Demand": 0.75,
      "Neutral Demand": 0.5,
      "Weak Demand": 0.3,
      "Distribution Pressure": 0.1,
    };
    bdVal = map[momentum.buyerDemand.rating] ?? 0.5;
  }
  parts.push({ key: "Buyer Demand (Acc/Dis)", weight: 20, value: bdVal, note: momentum?.buyerDemand?.rating || INSUFFICIENT });

  // Group / sector strength
  let secVal: number | null = null;
  if (momentum?.sectorRank?.available) {
    const map: Record<string, number> = {
      "Sector Outperforming": 1,
      "Sector Improving": 0.7,
      "Sector Neutral": 0.5,
      "Sector Weak": 0.2,
    };
    secVal = map[momentum.sectorRank.label] ?? 0.5;
  }
  parts.push({ key: "Industry Group Strength", weight: 15, value: secVal, note: momentum?.sectorRank?.label || INSUFFICIENT });

  // Market direction
  let mVal: number | null = null;
  const mkt = marketContext?.marketContext;
  if (mkt?.available) {
    mVal = (mkt.trend || "").includes("Uptrend") ? 1 : (mkt.trend || "").includes("Downtrend") ? 0.2 : 0.5;
  }
  parts.push({ key: "Market Direction", weight: 10, value: mVal, note: mkt?.trend || INSUFFICIENT });

  let earned = 0;
  let availWeight = 0;
  const breakdown = parts.map((p) => {
    if (p.value !== null) {
      earned += p.value * p.weight;
      availWeight += p.weight;
    }
    return {
      component: p.key,
      weight: p.weight,
      available: p.value !== null,
      points: p.value === null ? INSUFFICIENT : `${(p.value * p.weight).toFixed(1)} / ${p.weight}`,
      note: p.note,
    };
  });

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const coverage = Math.round((availWeight / totalWeight) * 100);
  const rating = availWeight > 0 ? Math.round((earned / availWeight) * 100) : null;

  let label = INSUFFICIENT;
  if (rating !== null) {
    if (rating >= 80) label = "Top-tier profile";
    else if (rating >= 65) label = "Above average";
    else if (rating >= 50) label = "Average / watchlist";
    else if (rating >= 35) label = "Below average";
    else label = "Weak profile";
  }

  return {
    rating,
    label,
    coverage,
    breakdown,
    note: "Composite is a transparent blend of accurate sub-metrics — it is NOT a market-wide 1–99 percentile (that requires a full-universe database).",
  };
}

// ====================================================================
// ACCUMULATION / DISTRIBUTION GRADE (A–E)
// ====================================================================
function computeAccDisGrade(buyerDemand: any) {
  if (!buyerDemand?.available) {
    return { grade: INSUFFICIENT, rating: INSUFFICIENT, detail: "Volume/demand data insufficient.", metrics: {} };
  }
  const map: Record<string, string> = {
    "Strong Accumulation": "A",
    "Positive Demand": "B",
    "Neutral Demand": "C",
    "Weak Demand": "D",
    "Distribution Pressure": "E",
  };
  const grade = map[buyerDemand.rating] || "C";
  return {
    grade,
    rating: buyerDemand.rating,
    detail: `Based on 13-session up/down volume and accumulation vs distribution days. Up/Down ratio ${buyerDemand.metrics?.upDownVolumeRatio}, relative volume ${buyerDemand.metrics?.relativeVolume}.`,
    metrics: buyerDemand.metrics || {},
  };
}

// ====================================================================
// SMR-STYLE QUALITY GRADE (Sales · Margins · ROE)
// ====================================================================
function computeSmrGrade(summary: any, momentum: any) {
  const fin = summary?.financialData || {};
  const revG = n(fin.revenueGrowth) !== null ? (n(fin.revenueGrowth) as number) * 100 : null;
  const opMargin = n(fin.operatingMargins) !== null ? (n(fin.operatingMargins) as number) * 100 : null;
  const netMargin = n(fin.profitMargins) !== null ? (n(fin.profitMargins) as number) * 100 : null;
  const roe = n(fin.returnOnEquity) !== null ? (n(fin.returnOnEquity) as number) * 100 : null;

  let score = 0;
  let max = 0;
  const add = (cond: boolean | null, w: number) => {
    if (cond === null) return;
    max += w;
    if (cond) score += w;
  };
  add(revG !== null ? revG >= 15 : null, 35);
  add(netMargin !== null ? netMargin >= 8 : null, 20);
  add(opMargin !== null ? opMargin >= 12 : null, 20);
  add(roe !== null ? roe >= 17 : null, 25);

  const pctScore = max > 0 ? (score / max) * 100 : null;
  let grade = INSUFFICIENT;
  if (pctScore !== null) {
    if (max < 40) grade = INSUFFICIENT;
    else if (pctScore >= 80) grade = "A";
    else if (pctScore >= 60) grade = "B";
    else if (pctScore >= 40) grade = "C";
    else if (pctScore >= 20) grade = "D";
    else grade = "E";
  }
  return {
    grade,
    metrics: {
      salesGrowth: pct(revG),
      operatingMargin: pct(opMargin),
      netMargin: pct(netMargin),
      roe: pct(roe),
    },
    detail: "Sales growth, profit margins and ROE combined (O'Neil's SMR concept). Targets: sales ≥15%, ROE ≥17%.",
  };
}

// ====================================================================
// ALPHA / BETA (regression of stock daily returns vs index daily returns)
// ====================================================================
function dailyReturns(candles: any[]): { date: string; ret: number }[] {
  const out: { date: string; ret: number }[] = [];
  for (let i = 1; i < candles.length; i++) {
    const p0 = n(candles[i - 1].close);
    const p1 = n(candles[i].close);
    if (p0 && p1 && p0 > 0) {
      const d = candles[i].date;
      out.push({
        date: d instanceof Date ? d.toISOString().split("T")[0] : String(d).split("T")[0],
        ret: (p1 - p0) / p0,
      });
    }
  }
  return out;
}

function computeAlphaBeta(stockCandles: any[], indexCandles: any[], betaFallback: number | null, indexName: string) {
  const s = dailyReturns(stockCandles || []);
  const idx = dailyReturns(indexCandles || []);
  if (s.length < 30 || idx.length < 30) {
    return {
      available: betaFallback !== null,
      beta: betaFallback === null ? INSUFFICIENT : betaFallback.toFixed(2),
      alpha: INSUFFICIENT,
      detail:
        betaFallback === null
          ? "Not enough overlapping history to compute beta/alpha."
          : `Beta from provider; alpha needs more overlapping index history.`,
      indexName,
    };
  }
  // Align by date
  const idxMap = new Map(idx.map((r) => [r.date, r.ret]));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of s) {
    if (idxMap.has(r.date)) {
      ys.push(r.ret);
      xs.push(idxMap.get(r.date) as number);
    }
  }
  if (xs.length < 30) {
    return {
      available: betaFallback !== null,
      beta: betaFallback === null ? INSUFFICIENT : betaFallback.toFixed(2),
      alpha: INSUFFICIENT,
      detail: "Insufficient overlapping dates for regression.",
      indexName,
    };
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  let varx = 0;
  for (let i = 0; i < xs.length; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    varx += (xs[i] - mx) ** 2;
  }
  const beta = varx > 0 ? cov / varx : null;
  const alphaDaily = beta !== null ? my - beta * mx : null;
  const alphaAnnual = alphaDaily !== null ? alphaDaily * 252 * 100 : null;

  return {
    available: beta !== null,
    beta: beta === null ? INSUFFICIENT : beta.toFixed(2),
    alpha: alphaAnnual === null ? INSUFFICIENT : `${alphaAnnual.toFixed(1)}%`,
    detail: `Regressed ${xs.length} overlapping daily returns vs ${indexName}. Beta = sensitivity to the index; Alpha = annualized excess return not explained by the index.`,
    indexName,
  };
}

// ====================================================================
// MULTI-YEAR FUNDAMENTALS (annual revenue / EPS where provider has them)
// ====================================================================
function computeMultiYear(summary: any) {
  const yearly = summary?.earnings?.financialsChart?.yearly || [];
  const epsHist = summary?.incomeStatementHistory?.incomeStatementHistory || [];

  if (yearly.length === 0) {
    return { available: false, years: [], epsCagr3y: null, revCagr3y: null, note: "Annual financial history unavailable from current provider." };
  }

  const years = yearly.map((y: any, i: number) => {
    const rev = n(y.revenue);
    const earn = n(y.earnings);
    return {
      year: String(y.date),
      revenue: rev,
      revenueDisplay: rev === null ? INSUFFICIENT : formatBig(rev),
      earnings: earn,
      earningsDisplay: earn === null ? INSUFFICIENT : formatBig(earn),
    };
  });

  // 3-year CAGR (first vs last available)
  const cagr = (a: number | null, b: number | null, periods: number) => {
    if (a === null || b === null || a <= 0 || periods <= 0) return null;
    return (Math.pow(b / a, 1 / periods) - 1) * 100;
  };
  const revVals = years.map((y: any) => y.revenue).filter((v: any) => v !== null);
  const earnVals = years.map((y: any) => y.earnings).filter((v: any) => v !== null);
  const revCagr3y = revVals.length >= 2 ? cagr(revVals[0], revVals[revVals.length - 1], revVals.length - 1) : null;
  const epsCagr3y = earnVals.length >= 2 ? cagr(earnVals[0], earnVals[earnVals.length - 1], earnVals.length - 1) : null;

  return {
    available: true,
    years,
    epsCagr3y,
    revCagr3y,
    note: years.length < 4 ? "Limited annual history available from provider." : "",
  };
}

function formatBig(x: number): string {
  const a = Math.abs(x);
  if (a >= 1e12) return (x / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return (x / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (x / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (x / 1e3).toFixed(2) + "K";
  return x.toFixed(0);
}

// ====================================================================
// ASSEMBLY
// ====================================================================
export function computeEvaluation(input: {
  momentum: any;
  summary: any;
  marketContext: any;
  stockCandles: any[];
  indexCandles: any[];
  indexName: string;
}) {
  const { momentum, summary, marketContext, stockCandles, indexCandles, indexName } = input;

  const multiYear = computeMultiYear(summary);
  // attach epsCagr3y so CAN SLIM "A" can use it
  if (momentum) momentum.multiYear = { epsCagr3y: multiYear.epsCagr3y };

  const canSlim = computeCanSlim(momentum, summary, marketContext);
  const composite = computeComposite(momentum, marketContext);
  const accDis = computeAccDisGrade(momentum?.buyerDemand);
  const smr = computeSmrGrade(summary, momentum);
  const betaFallback = n(summary?.defaultKeyStatistics?.beta) ?? n(summary?.summaryDetail?.beta);
  const alphaBeta = computeAlphaBeta(stockCandles, indexCandles, betaFallback, indexName);

  return {
    symbol: momentum?.symbol,
    name: momentum?.name,
    generatedAt: new Date().toISOString(),
    disclaimer: EVALUATION_DISCLAIMER,
    canSlim,
    composite,
    accDis,
    smr,
    alphaBeta,
    multiYear,
    // surface a few headline ratings for the snapshot
    headline: {
      compositeRating: composite.rating,
      compositeLabel: composite.label,
      canSlimScore: canSlim.scorePct,
      canSlimPasses: `${canSlim.passes}/${canSlim.criteria.length}`,
      accDisGrade: accDis.grade,
      smrGrade: smr.grade,
      beta: alphaBeta.beta,
      alpha: alphaBeta.alpha,
    },
  };
}

export type EvaluationResult = ReturnType<typeof computeEvaluation>;
