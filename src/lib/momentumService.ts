/**
 * Momentum Analysis Engine (StockAnalytix)
 * ----------------------------------------
 * Pure computation layer. Takes already-fetched Yahoo Finance data + the
 * existing multi-timeframe analysis + top-down market context and produces the
 * full Momentum research payload.
 *
 * Design rules (per product spec):
 *  - This is NOT a prediction engine. Research language only.
 *  - Never invent unavailable data. Missing inputs => clean "Data Unavailable"
 *    state, and the Momentum Score is normalized over only the available
 *    components (with a Data Coverage %).
 *  - Never mark momentum "Strong" when the stock is overextended, volume is
 *    weak, sector is weak, earnings/sales trend is poor, or data is thin.
 */

import { SMA, EMA, RSI, ADX } from "technicalindicators";

export const MOMENTUM_DISCLAIMER =
  "Research support only. Not buy/sell advice. No guaranteed prediction. Always verify data independently.";

const UNAVAILABLE = "Data Unavailable";

// ---------- small helpers ----------

function num(v: any): number | null {
  if (v === null || v === undefined) return null;
  // yahoo-finance2 sometimes returns { raw, fmt }
  if (typeof v === "object" && v.raw !== undefined) v = v.raw;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function pct(v: number | null, digits = 1): string {
  return v === null ? UNAVAILABLE : `${v >= 0 ? "" : ""}${v.toFixed(digits)}%`;
}

function ratio(v: number | null, digits = 2): string {
  return v === null ? UNAVAILABLE : v.toFixed(digits);
}

function lastN<T>(arr: T[] | undefined | null, n: number): T[] {
  if (!arr || !Array.isArray(arr)) return [];
  return arr.slice(-n);
}

function returnOver(closes: number[], lookback: number): number | null {
  if (!closes || closes.length <= lookback) return null;
  const cur = closes[closes.length - 1];
  const prev = closes[closes.length - 1 - lookback];
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function sma(values: number[], period: number): number | null {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// ====================================================================
// PART 4 — PRICE STRENGTH
// ====================================================================
function computePriceStrength(
  closes: number[],
  currentPrice: number,
  stockReturn1M: number | null,
  sectorReturn1M: number | null,
  indexReturn1M: number | null,
) {
  const r1W = returnOver(closes, 5);
  const r1M = stockReturn1M ?? returnOver(closes, 21);
  const r3M = returnOver(closes, 63);
  const r6M = returnOver(closes, 126);
  const r1Y = returnOver(closes, 252);

  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);

  const aboveMa = (ma: number | null) =>
    ma === null ? "N/A" : currentPrice > ma ? "Above" : "Below";

  const vsSector =
    sectorReturn1M !== null && r1M !== null ? r1M - sectorReturn1M : null;
  const vsIndex =
    indexReturn1M !== null && r1M !== null ? r1M - indexReturn1M : null;

  // Scoring (0-100) over available components
  let score = 0;
  let maxScore = 0;
  const add = (cond: boolean | null, weight: number) => {
    if (cond === null) return;
    maxScore += weight;
    if (cond) score += weight;
  };
  add(r1W !== null ? r1W > 0 : null, 8);
  add(r1M !== null ? r1M > 0 : null, 12);
  add(r3M !== null ? r3M > 0 : null, 14);
  add(r6M !== null ? r6M > 0 : null, 12);
  add(r1Y !== null ? r1Y > 0 : null, 10);
  add(vsIndex !== null ? vsIndex > 0 : null, 12);
  add(vsSector !== null ? vsSector > 0 : null, 12);
  add(ma10 !== null ? currentPrice > ma10 : null, 5);
  add(ma20 !== null ? currentPrice > ma20 : null, 5);
  add(ma50 !== null ? currentPrice > ma50 : null, 5);
  add(ma200 !== null ? currentPrice > ma200 : null, 5);

  const normalized = maxScore > 0 ? Math.round((score / maxScore) * 100) : null;

  let rating = UNAVAILABLE;
  let ratingCode = "NA";
  if (normalized !== null) {
    if (normalized >= 85) {
      rating = "A+ — Strong outperformer";
      ratingCode = "A+";
    } else if (normalized >= 70) {
      rating = "A — Outperforming";
      ratingCode = "A";
    } else if (normalized >= 58) {
      rating = "B — Improving";
      ratingCode = "B";
    } else if (normalized >= 45) {
      rating = "C — Neutral / Mixed";
      ratingCode = "C";
    } else if (normalized >= 30) {
      rating = "D — Weak";
      ratingCode = "D";
    } else {
      rating = "E — Very weak";
      ratingCode = "E";
    }
  }

  const dataMissing = maxScore < 60;
  let explanation: string;
  if (normalized === null) {
    explanation =
      "Price strength cannot be fully calculated due to limited return/sector data.";
  } else if (normalized >= 58) {
    explanation =
      "Price strength is improving because the stock is holding above key moving averages and broadly outperforming its sector/index over recent periods.";
  } else if (normalized >= 45) {
    explanation =
      "Price strength is mixed. Some timeframes are positive while others lag; relative strength vs sector/index is not yet decisive.";
  } else {
    explanation =
      "Price strength is weak. The stock is below several key moving averages and is lagging recent return benchmarks.";
  }
  if (dataMissing && normalized !== null) {
    explanation +=
      " Note: price strength cannot be fully calculated due to limited return/sector data.";
  }

  return {
    available: normalized !== null,
    rating,
    ratingCode,
    score: normalized,
    returns: {
      "1W": r1W,
      "1M": r1M,
      "3M": r3M,
      "6M": r6M,
      "1Y": r1Y,
    },
    returnsDisplay: {
      "1W": pct(r1W),
      "1M": pct(r1M),
      "3M": pct(r3M),
      "6M": pct(r6M),
      "1Y": pct(r1Y),
    },
    vsSector: vsSector,
    vsIndex: vsIndex,
    vsSectorDisplay: vsSector === null ? UNAVAILABLE : pct(vsSector),
    vsIndexDisplay: vsIndex === null ? UNAVAILABLE : pct(vsIndex),
    movingAverages: {
      ma10: aboveMa(ma10),
      ma20: aboveMa(ma20),
      ma50: aboveMa(ma50),
      ma200: aboveMa(ma200),
    },
    explanation,
  };
}

// ====================================================================
// PART 5 — BUYER DEMAND
// ====================================================================
function computeBuyerDemand(candles: any[]) {
  const valid = (candles || []).filter(
    (c) => c && c.close != null && c.volume != null,
  );
  if (valid.length < 10) {
    return {
      available: false,
      rating: "Data Insufficient",
      explanation:
        "Buyer demand cannot be calculated. Volume/price history is insufficient from current provider.",
      metrics: {},
    };
  }

  const window = valid.slice(-25);
  const volumes = valid.map((c) => Number(c.volume) || 0);
  const avg20 = sma(volumes, 20) ?? 1;
  const lastVol = volumes[volumes.length - 1];
  const relVol = avg20 > 0 ? lastVol / avg20 : null;

  let upVol = 0;
  let downVol = 0;
  let accumulationDays = 0;
  let distributionDays = 0;
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1].close;
    const cur = window[i].close;
    const vol = Number(window[i].volume) || 0;
    if (cur > prev) {
      upVol += vol;
      if (vol > avg20 * 1.0) accumulationDays++;
    } else if (cur < prev) {
      downVol += vol;
      if (vol > avg20 * 1.25) distributionDays++;
    }
  }
  const upDownRatio = downVol > 0 ? upVol / downVol : upVol > 0 ? 3 : null;

  // Volume confirmation: last bar direction vs volume
  const last = window[window.length - 1];
  const prevC = window[window.length - 2];
  let volumeConfirmation = "Neutral volume";
  if (last && prevC) {
    const up = last.close > prevC.close;
    const heavy = (Number(last.volume) || 0) > avg20 * 1.3;
    if (up && heavy) volumeConfirmation = "Price up with volume confirmation";
    else if (up && !heavy) volumeConfirmation = "Price up on weak volume (caution)";
    else if (!up && heavy)
      volumeConfirmation = "Price down on heavy volume (distribution pressure)";
    else volumeConfirmation = "Price down on light volume";
  }

  // Rating
  let rating = "Neutral Demand";
  if (upDownRatio !== null) {
    if (
      upDownRatio >= 1.6 &&
      accumulationDays >= distributionDays + 2 &&
      (relVol ?? 0) >= 1
    )
      rating = "Strong Accumulation";
    else if (upDownRatio >= 1.2 && accumulationDays >= distributionDays)
      rating = "Positive Demand";
    else if (distributionDays >= accumulationDays + 2 || upDownRatio < 0.7)
      rating = "Distribution Pressure";
    else if (upDownRatio < 0.95) rating = "Weak Demand";
    else rating = "Neutral Demand";
  } else {
    rating = "Data Insufficient";
  }

  let explanation: string;
  if (rating === "Strong Accumulation")
    explanation =
      "Up-day volume meaningfully exceeds down-day volume with several accumulation days. Buyer demand looks healthy, but always verify on the chart.";
  else if (rating === "Positive Demand")
    explanation =
      "Buying interest is modestly ahead of selling. Demand is improving but not yet decisive — watch for volume confirmation on up moves.";
  else if (rating === "Distribution Pressure")
    explanation =
      "Down-day volume is dominating with elevated distribution days. This points to supply/distribution pressure — confirmation needed before assuming demand.";
  else if (rating === "Weak Demand")
    explanation =
      "Up/down volume balance is soft. Demand is weak; breakouts without volume should be treated as low quality.";
  else
    explanation =
      "Up and down volume are roughly balanced. Demand is neutral — wait for clearer volume confirmation.";

  return {
    available: true,
    rating,
    explanation,
    metrics: {
      upDownVolumeRatio: upDownRatio === null ? UNAVAILABLE : upDownRatio.toFixed(2),
      accumulationDays,
      distributionDays,
      relativeVolume: relVol === null ? UNAVAILABLE : relVol.toFixed(2) + "x",
      volumeConfirmation,
    },
  };
}

// ====================================================================
// PART 6 — GROUP / SECTOR RANK
// ====================================================================
function computeSectorRank(
  marketContext: any,
  sector: string,
  industry: string,
  priceStrong: boolean,
  stockReturn1M: number | null,
) {
  const sectorCtx = marketContext?.sectorContext;
  const available = sectorCtx && sectorCtx.available;

  const sectorReturn1M = available ? num(sectorCtx.return1M) : null;
  const sectorReturn3M = available ? num(sectorCtx.return3M) : null;
  const sectorTrend = available ? sectorCtx.trend : null;
  const stockVsSector =
    sectorReturn1M !== null && stockReturn1M !== null
      ? stockReturn1M - sectorReturn1M
      : null;

  let label = "Sector Data Unavailable";
  if (available) {
    const strengthLabel = marketContext?.sectorStrengthLabel || "";
    if (strengthLabel.includes("Strong") || (sectorTrend?.includes("Uptrend") && (sectorReturn1M ?? 0) > 0))
      label = "Sector Outperforming";
    else if (sectorTrend?.includes("Uptrend")) label = "Sector Improving";
    else if (sectorTrend?.includes("Downtrend")) label = "Sector Weak";
    else label = "Sector Neutral";
  }

  // Cluster logic
  let clusterNote = "";
  const sectorStrong = label === "Sector Outperforming" || label === "Sector Improving";
  if (!available) {
    clusterNote = "Peer momentum comparison unavailable from current provider.";
  } else if (priceStrong && sectorStrong) {
    clusterNote =
      "Cluster strength visible. Stock momentum is supported by sector strength.";
  } else if (priceStrong && !sectorStrong) {
    clusterNote =
      "Stock is moving against weak sector support. Confirmation needed.";
  } else if (!priceStrong && sectorStrong) {
    clusterNote =
      "Sector is firm but the stock is lagging its group. Watch for the stock to catch up.";
  } else {
    clusterNote = "Neither the stock nor its sector shows clear momentum yet.";
  }

  return {
    available,
    sector: sector || UNAVAILABLE,
    industry: industry || UNAVAILABLE,
    sectorReturn1M: sectorReturn1M === null ? UNAVAILABLE : pct(sectorReturn1M),
    sectorReturn3M: sectorReturn3M === null ? UNAVAILABLE : pct(sectorReturn3M),
    stockVsSector: stockVsSector === null ? UNAVAILABLE : pct(stockVsSector),
    sectorTrend: sectorTrend || UNAVAILABLE,
    label,
    clusterNote,
    sectorStrong,
  };
}

// ====================================================================
// PARTS 8 & 9 — QUARTERLY EPS & SALES GROWTH TREND
// ====================================================================
function trendLabelFromSeries(growths: number[], kind: "EPS" | "Sales") {
  if (growths.length === 0) return `${kind === "EPS" ? "EPS" : "Sales"} Data Unavailable`;
  const positives = growths.filter((g) => g > 0).length;
  const last = growths[growths.length - 1];
  const accelerating =
    growths.length >= 2 && growths[growths.length - 1] > growths[growths.length - 2];
  if (last < 0 && positives <= growths.length / 2)
    return `Negative ${kind} Trend`;
  if (positives === growths.length && accelerating)
    return `Accelerating ${kind} Growth`;
  if (positives >= Math.ceil(growths.length * 0.6))
    return accelerating ? `Accelerating ${kind} Growth` : `Stable ${kind} Growth`;
  if (last < 0) return `Decelerating ${kind} Growth`;
  return `Mixed ${kind} Trend`;
}

function computeQuarterlyEps(summary: any) {
  const hist = summary?.earningsHistory?.history || [];
  const chartQ = summary?.earnings?.earningsChart?.quarterly || [];

  // Prefer earningsHistory (has actual EPS + period date)
  let quarters: { label: string; eps: number | null }[] = [];
  if (hist.length > 0) {
    quarters = hist.map((h: any) => ({
      label: h.quarter
        ? new Date(h.quarter).toISOString().split("T")[0]
        : h.period || "",
      eps: num(h.epsActual),
    }));
  } else if (chartQ.length > 0) {
    quarters = chartQ.map((q: any) => ({
      label: q.date || "",
      eps: num(q.actual),
    }));
  }

  quarters = quarters.filter((q) => q.eps !== null);
  if (quarters.length === 0) {
    return {
      available: false,
      trendLabel: "Data Unavailable",
      quarters: [],
      note: "Quarterly EPS data unavailable from current provider.",
    };
  }

  const rows = quarters.map((q, i) => {
    const prev = i > 0 ? quarters[i - 1].eps : null;
    const yoy = i >= 4 ? quarters[i - 4].eps : null;
    const qoq =
      prev !== null && prev !== 0 && q.eps !== null
        ? ((q.eps - prev) / Math.abs(prev)) * 100
        : null;
    const yoyG =
      yoy !== null && yoy !== 0 && q.eps !== null
        ? ((q.eps - yoy) / Math.abs(yoy)) * 100
        : null;
    return {
      quarter: q.label,
      eps: q.eps,
      epsDisplay: q.eps === null ? UNAVAILABLE : q.eps.toFixed(2),
      qoq: qoq === null ? UNAVAILABLE : pct(qoq),
      yoy: yoyG === null ? UNAVAILABLE : pct(yoyG),
      qoqRaw: qoq,
      yoyRaw: yoyG,
      positive: (q.eps ?? 0) >= 0,
    };
  });

  const growths = rows
    .map((r) => (r.qoqRaw !== null ? r.qoqRaw : null))
    .filter((g): g is number => g !== null);
  const trendLabel = trendLabelFromSeries(growths, "EPS");

  return {
    available: true,
    trendLabel,
    quarters: rows,
    note:
      rows.length < 5
        ? "Year-over-year EPS growth shown where ≥5 quarters are available from provider."
        : "",
  };
}

function computeQuarterlySales(summary: any) {
  const incomeQ = summary?.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
  const finChartQ = summary?.earnings?.financialsChart?.quarterly || [];

  let quarters: { label: string; revenue: number | null }[] = [];
  if (incomeQ.length > 0) {
    quarters = incomeQ
      .slice()
      .reverse()
      .map((s: any) => ({
        label: s.endDate ? new Date(s.endDate).toISOString().split("T")[0] : "",
        revenue: num(s.totalRevenue),
      }));
  } else if (finChartQ.length > 0) {
    quarters = finChartQ.map((q: any) => ({
      label: q.date || "",
      revenue: num(q.revenue),
    }));
  }

  quarters = quarters.filter((q) => q.revenue !== null);
  if (quarters.length === 0) {
    return {
      available: false,
      trendLabel: "Data Unavailable",
      quarters: [],
      note: "Quarterly sales/revenue data unavailable from current provider.",
    };
  }

  const rows = quarters.map((q, i) => {
    const prev = i > 0 ? quarters[i - 1].revenue : null;
    const yoy = i >= 4 ? quarters[i - 4].revenue : null;
    const qoq =
      prev !== null && prev !== 0 && q.revenue !== null
        ? ((q.revenue - prev) / Math.abs(prev)) * 100
        : null;
    const yoyG =
      yoy !== null && yoy !== 0 && q.revenue !== null
        ? ((q.revenue - yoy) / Math.abs(yoy)) * 100
        : null;
    return {
      quarter: q.label,
      revenue: q.revenue,
      revenueDisplay: q.revenue === null ? UNAVAILABLE : formatBig(q.revenue),
      qoq: qoq === null ? UNAVAILABLE : pct(qoq),
      yoy: yoyG === null ? UNAVAILABLE : pct(yoyG),
      qoqRaw: qoq,
      yoyRaw: yoyG,
    };
  });

  const growths = rows
    .map((r) => (r.qoqRaw !== null ? r.qoqRaw : null))
    .filter((g): g is number => g !== null);
  const trendLabel = trendLabelFromSeries(growths, "Sales");

  return {
    available: true,
    trendLabel,
    quarters: rows,
    note:
      rows.length < 5
        ? "Year-over-year sales growth shown where ≥5 quarters are available from provider."
        : "",
  };
}

function formatBig(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(0);
}

// ====================================================================
// PART 10 — FORWARD EPS / FORWARD PE
// ====================================================================
function computeForwardValuation(summary: any, currentPrice: number) {
  const trend = summary?.earningsTrend?.trend || [];
  const stats = summary?.defaultKeyStatistics || {};
  const detail = summary?.summaryDetail || {};

  const currentEps = num(stats.trailingEps);
  const currentPe = num(detail.trailingPE);

  // Find forward FY estimates from earningsTrend (period "0y" = current FY, "+1y" = next FY)
  const yearEstimates = trend
    .filter((t: any) => t.period === "0y" || t.period === "+1y" || t.period === "+2y")
    .map((t: any) => {
      const eps = num(t?.earningsEstimate?.avg);
      const endYear = t.endDate ? new Date(t.endDate).getFullYear() : null;
      return { period: t.period, eps, fy: endYear };
    })
    .filter((e: any) => e.eps !== null);

  const rows = yearEstimates.map((e: any) => {
    const fpe = e.eps && e.eps !== 0 ? currentPrice / e.eps : null;
    return {
      fyLabel: e.fy ? `FY${e.fy}` : e.period,
      projectedEps: e.eps,
      projectedEpsDisplay: e.eps === null ? UNAVAILABLE : e.eps.toFixed(2),
      forwardPe: fpe,
      forwardPeDisplay: fpe === null ? UNAVAILABLE : fpe.toFixed(2),
    };
  });

  const forwardEpsStat = num(stats.forwardEps);
  const forwardPeStat = num(detail.forwardPE);

  // Growth expectation: next FY eps vs current
  let epsGrowthExpectation: number | null = null;
  if (rows.length >= 2 && rows[0].projectedEps && rows[1].projectedEps) {
    epsGrowthExpectation =
      ((rows[1].projectedEps - rows[0].projectedEps) /
        Math.abs(rows[0].projectedEps)) *
      100;
  } else if (forwardEpsStat && currentEps) {
    epsGrowthExpectation =
      ((forwardEpsStat - currentEps) / Math.abs(currentEps)) * 100;
  }

  const available = rows.length > 0 || forwardPeStat !== null;

  // Valuation label based on nearest forward PE
  const nearestFpe =
    rows.find((r: any) => r.forwardPe !== null)?.forwardPe ?? forwardPeStat;
  let label = "Data Unavailable";
  if (nearestFpe !== null) {
    const growthSupports = (epsGrowthExpectation ?? 0) > 15;
    if (nearestFpe < 18) label = "Reasonable";
    else if (nearestFpe < 30)
      label = growthSupports ? "Attractive if growth supports valuation" : "Reasonable";
    else if (nearestFpe < 45)
      label = growthSupports ? "Attractive if growth supports valuation" : "Expensive";
    else label = "Very Expensive";
  }

  return {
    available,
    currentPrice,
    currentEps: currentEps === null ? UNAVAILABLE : currentEps.toFixed(2),
    currentPe: currentPe === null ? UNAVAILABLE : currentPe.toFixed(2),
    forwardEps: forwardEpsStat === null ? UNAVAILABLE : forwardEpsStat.toFixed(2),
    forwardPe: forwardPeStat === null ? UNAVAILABLE : forwardPeStat.toFixed(2),
    epsGrowthExpectation:
      epsGrowthExpectation === null ? UNAVAILABLE : pct(epsGrowthExpectation),
    projections: rows,
    label,
    note: available
      ? ""
      : "Projected EPS unavailable from current provider. Analyst estimates not available for this symbol.",
  };
}

// ====================================================================
// PART 11 & 12 — OWNERSHIP TREND + FUND HOLDERS
// ====================================================================
function computeOwnership(summary: any) {
  const major = summary?.majorHoldersBreakdown || {};
  const instPct = num(major.institutionsPercentHeld);
  const insiderPct = num(major.insidersPercentHeld);
  const instCount = num(major.institutionsCount);
  const instFloatPct = num(major.institutionsFloatPercentHeld);

  // Yahoo does not provide India FII/DII/promoter or quarter-over-quarter
  // institutional %; present what is available and mark the rest unavailable.
  const available = instPct !== null || insiderPct !== null;

  let label = "Data Unavailable";
  if (available) {
    if (instPct !== null && instPct > 0.6) label = "Institutional Interest Improving";
    else if (instPct !== null && instPct > 0.3) label = "Stable Ownership";
    else if (instPct !== null) label = "Low Institutional Footprint";
    else label = "Stable Ownership";
  }

  return {
    available,
    institutionsPercent:
      instPct === null ? UNAVAILABLE : (instPct * 100).toFixed(2) + "%",
    insidersPercent:
      insiderPct === null ? UNAVAILABLE : (insiderPct * 100).toFixed(2) + "%",
    institutionsFloatPercent:
      instFloatPct === null ? UNAVAILABLE : (instFloatPct * 100).toFixed(2) + "%",
    institutionsCount: instCount === null ? UNAVAILABLE : String(instCount),
    label,
    // Fields the provider (Yahoo) does not expose for most symbols:
    mutualFundHolding: UNAVAILABLE,
    fiiHolding: UNAVAILABLE,
    diiHolding: UNAVAILABLE,
    promoterHolding: UNAVAILABLE,
    publicHolding: UNAVAILABLE,
    quarterlyTrend: UNAVAILABLE,
    note:
      "Quarter-over-quarter FII/DII/promoter ownership trend is unavailable from the current provider. Institutional snapshot shown where available. Increasing institutional ownership is a quality/momentum confirmation factor but is not a guaranteed positive.",
  };
}

function computeFundHolders(summary: any) {
  const fund = summary?.fundOwnership?.ownershipList || [];
  const inst = summary?.institutionOwnership?.ownershipList || [];
  const list = fund.length > 0 ? fund : inst;

  if (!list || list.length === 0) {
    return {
      available: false,
      holders: [],
      note: "Detailed mutual fund holder data unavailable from current provider.",
    };
  }

  const holders = list.slice(0, 10).map((h: any) => {
    const p = num(h.pctHeld);
    return {
      name: h.organization || "Unknown holder",
      pctHeld: p === null ? UNAVAILABLE : (p * 100).toFixed(2) + "%",
      value: num(h.value) !== null ? formatBig(num(h.value) as number) : UNAVAILABLE,
      change: UNAVAILABLE, // provider does not expose QoQ change reliably
      reportDate: h.reportDate
        ? new Date(h.reportDate).toISOString().split("T")[0]
        : UNAVAILABLE,
    };
  });

  return {
    available: true,
    holders,
    note: "Change vs previous quarter is not exposed by the current provider.",
  };
}

// ====================================================================
// PART 13, 14, 15 — QUALITY RATIOS / DILUTION / CASH FLOW
// ====================================================================
function computeQualityRatios(summary: any) {
  const fin = summary?.financialData || {};
  const stats = summary?.defaultKeyStatistics || {};

  const roe = num(fin.returnOnEquity);
  const roa = num(fin.returnOnAssets);
  const debtEquity = num(fin.debtToEquity);
  const opMargin = num(fin.operatingMargins);
  const netMargin = num(fin.profitMargins);
  const fcf = num(fin.freeCashflow);
  const ocf = num(fin.operatingCashflow);
  const ebitda = num(fin.ebitda);
  const totalDebt = num(fin.totalDebt);

  // ROCE proxy: EBIT-based unavailable from Yahoo financialData; approximate
  // with ROA when EBITDA/capital-employed not derivable. Mark as approx.
  const roce = roa; // proxy; clearly labelled in UI as approximate
  // Interest coverage: not directly exposed; leave unavailable
  const interestCoverage = null;
  const ltDebtEquity = debtEquity; // Yahoo only exposes total debt/equity

  let score = 0;
  let max = 0;
  const add = (cond: boolean | null, w: number) => {
    if (cond === null) return;
    max += w;
    if (cond) score += w;
  };
  add(roe !== null ? roe > 0.15 : null, 25);
  add(roa !== null ? roa > 0.07 : null, 15);
  add(debtEquity !== null ? debtEquity < 80 : null, 20);
  add(opMargin !== null ? opMargin > 0.12 : null, 15);
  add(netMargin !== null ? netMargin > 0.08 : null, 10);
  add(fcf !== null ? fcf > 0 : null, 15);

  const normalized = max > 0 ? Math.round((score / max) * 100) : null;
  let label = "Data Incomplete";
  if (normalized !== null) {
    if (max < 50) label = "Data Incomplete";
    else if (normalized >= 75) label = "Strong Quality";
    else if (normalized >= 60) label = "Good Quality";
    else if (normalized >= 40) label = "Average Quality";
    else label = "Weak Quality";
  }

  return {
    available: normalized !== null,
    label,
    score: normalized,
    coverage: max,
    metrics: {
      roe: roe === null ? UNAVAILABLE : (roe * 100).toFixed(2) + "%",
      roce: roce === null ? UNAVAILABLE : (roce * 100).toFixed(2) + "% (approx)",
      roa: roa === null ? UNAVAILABLE : (roa * 100).toFixed(2) + "%",
      debtEquity: debtEquity === null ? UNAVAILABLE : (debtEquity / 100).toFixed(2),
      ltDebtEquity:
        ltDebtEquity === null ? UNAVAILABLE : (ltDebtEquity / 100).toFixed(2),
      operatingMargin: opMargin === null ? UNAVAILABLE : (opMargin * 100).toFixed(2) + "%",
      netProfitMargin: netMargin === null ? UNAVAILABLE : (netMargin * 100).toFixed(2) + "%",
      freeCashFlow: fcf === null ? UNAVAILABLE : formatBig(fcf),
      operatingCashFlow: ocf === null ? UNAVAILABLE : formatBig(ocf),
      interestCoverage: interestCoverage === null ? UNAVAILABLE : ratio(interestCoverage),
      ebitda: ebitda === null ? UNAVAILABLE : formatBig(ebitda),
      totalDebt: totalDebt === null ? UNAVAILABLE : formatBig(totalDebt),
    },
    explanation:
      normalized === null
        ? "Quality ratios are incomplete from the current provider; confidence is reduced rather than scored negatively."
        : normalized >= 60
          ? "High returns on capital with controlled debt and positive cash flow point to good business quality."
          : "Quality is mixed. Some of returns, debt, margins or cash flow are below preferred thresholds.",
  };
}

function computeDilution(summary: any) {
  const stats = summary?.defaultKeyStatistics || {};
  const sharesNow = num(stats.sharesOutstanding);
  // Historical share count is not reliably exposed by Yahoo; net insider
  // purchase activity is the closest available signal.
  const netInsider = num(summary?.netSharePurchaseActivity?.netPercentInsiderShares);

  if (sharesNow === null) {
    return {
      available: false,
      label: "Data unavailable",
      sharesOutstanding: UNAVAILABLE,
      sharesPrevYear: UNAVAILABLE,
      changePercent: UNAVAILABLE,
      note: "Equity dilution data unavailable.",
    };
  }

  return {
    available: true,
    label: "Historical comparison unavailable",
    sharesOutstanding: formatBig(sharesNow),
    sharesPrevYear: UNAVAILABLE,
    changePercent: UNAVAILABLE,
    netInsiderActivity:
      netInsider === null ? UNAVAILABLE : (netInsider * 100).toFixed(2) + "%",
    note: "Current shares outstanding shown. Prior-year share count is unavailable from the current provider, so a precise dilution % cannot be computed. Bonus/split adjustments are not applied.",
  };
}

function computeCashFlow(summary: any) {
  const fin = summary?.financialData || {};
  const cfHist = summary?.cashflowStatementHistory?.cashflowStatements || [];
  const ocf = num(fin.operatingCashflow);
  const fcf = num(fin.freeCashflow);
  const netIncome = num(summary?.defaultKeyStatistics?.netIncomeToCommon);

  // Cash conversion quality: OCF vs net income
  let conversion: number | null = null;
  if (ocf !== null && netIncome !== null && netIncome !== 0) {
    conversion = ocf / netIncome;
  }

  const available = ocf !== null || fcf !== null;
  let label = "Data Unavailable";
  if (available) {
    if (fcf !== null && fcf > 0 && (ocf ?? 0) > 0) {
      label =
        conversion !== null && conversion >= 1
          ? "Strong Cash Flow"
          : "Healthy Cash Flow";
    } else if ((ocf ?? 0) > 0) label = "Healthy Cash Flow";
    else if ((ocf ?? 1) < 0 || (fcf ?? 1) < 0) label = "Negative Cash Flow";
    else label = "Weak Cash Flow";
  }

  return {
    available,
    label,
    operatingCashFlow: ocf === null ? UNAVAILABLE : formatBig(ocf),
    freeCashFlow: fcf === null ? UNAVAILABLE : formatBig(fcf),
    cashConversion: conversion === null ? UNAVAILABLE : conversion.toFixed(2) + "x",
    explanation:
      "If profit is growing but cash flow is weak, quality of earnings may need deeper review.",
  };
}

// ====================================================================
// PART 16 — SHORT-TERM MOMENTUM SETUP
// ====================================================================
function computeShortTermSetup(mtf: any, sectorStrong: boolean) {
  const daily = mtf?.daily;
  const hourly = mtf?.hourly;
  const weekly = mtf?.weekly;
  if (!daily || daily.error) {
    return {
      available: false,
      label: "Data Insufficient",
      notes: ["Daily timeframe data is insufficient to build a short-term setup."],
      levels: {},
    };
  }

  const ext = mtf?.extensionRisk || {};
  const rsi = daily.rsi;
  const adx = daily.adx;
  const dist10 = daily?.ema?.dist10 ?? 0;
  const dist20 = daily?.ema?.dist20 ?? 0;
  const volOk = (daily.volumeSignal || "").includes("Strong");
  const support = daily.support?.[0];
  const resistance = daily.resistance?.[1];
  const price = daily.currentPrice;

  let label = "Mixed Setup";
  const notes: string[] = [];

  const extended = ext.riskLevel === "High" || dist20 > 12;
  const uptrend = (daily.trend || "").includes("Uptrend");
  const hourlyUp = (hourly?.trend || "").includes("Uptrend");

  if (extended) {
    label = "Avoid Chasing";
    notes.push("Avoid chasing because the stock is extended from its short MAs.");
  } else if (uptrend && volOk && hourlyUp && (rsi ?? 0) < 70) {
    label = "Positive Setup with Confirmation";
    notes.push("Multi-timeframe trend is aligned with volume confirmation.");
  } else if (uptrend && price && resistance && price >= resistance * 0.98 && !volOk) {
    label = "Watch for Breakout";
    notes.push("Watch above resistance with volume.");
  } else if (uptrend && (rsi ?? 100) < 45) {
    label = "Pullback Watch";
    notes.push("Wait for pullback near the 20 MA before fresh participation.");
  } else if ((daily.trend || "").includes("Downtrend")) {
    label = "Weak Setup";
    notes.push("Daily trend is down; setup is weak.");
  } else {
    label = "Mixed Setup";
    notes.push("Setup is mixed; wait for clearer confirmation.");
  }

  if (!volOk) notes.push("Volume confirmation needed on the next up move.");
  if ((weekly?.trend || "").includes("Downtrend"))
    notes.push("Weekly trend is not yet supportive; weekly resistance may be nearby.");
  if (!sectorStrong) notes.push("Sector support is soft; confirmation preferred.");
  if (extended) notes.push("Fresh entry risk is elevated at current extension.");

  return {
    available: true,
    label,
    rsi: rsi ?? UNAVAILABLE,
    adx: adx ?? UNAVAILABLE,
    volumeConfirmation: volOk ? "Present" : "Needed",
    extensionRisk: ext.riskLevel || "Low",
    levels: {
      keySupport: support ? support.toFixed(2) : UNAVAILABLE,
      keyResistance: resistance ? resistance.toFixed(2) : UNAVAILABLE,
      breakoutConfirmation: resistance ? (resistance * 1.01).toFixed(2) : UNAVAILABLE,
      failureLevel: support ? (support * 0.99).toFixed(2) : UNAVAILABLE,
      pullbackZone:
        daily?.ema?.[20] != null ? Number(daily.ema[20]).toFixed(2) : UNAVAILABLE,
    },
    notes,
  };
}

// ====================================================================
// PART 17 — MOMENTUM SCORE (weighted, normalized over available data)
// ====================================================================
function computeMomentumScore(parts: {
  priceStrength: any;
  buyerDemand: any;
  mtf: any;
  sectorRank: any;
  eps: any;
  sales: any;
  ownership: any;
  extensionRisk: any;
}) {
  // weight definition per spec
  const components: { key: string; weight: number; value: number | null }[] = [];

  // Price Strength: 20
  components.push({
    key: "Price Strength",
    weight: 20,
    value: parts.priceStrength.score !== null ? parts.priceStrength.score / 100 : null,
  });

  // Buyer Demand / Volume: 15
  let bd: number | null = null;
  if (parts.buyerDemand.available) {
    const map: Record<string, number> = {
      "Strong Accumulation": 1,
      "Positive Demand": 0.75,
      "Neutral Demand": 0.5,
      "Weak Demand": 0.3,
      "Distribution Pressure": 0.1,
    };
    bd = map[parts.buyerDemand.rating] ?? 0.5;
  }
  components.push({ key: "Buyer Demand / Volume", weight: 15, value: bd });

  // Multi-timeframe Alignment: 20
  const align =
    typeof parts.mtf?.alignmentScore === "number"
      ? parts.mtf.alignmentScore / 100
      : null;
  components.push({ key: "Multi-timeframe Alignment", weight: 20, value: align });

  // Sector / Group Strength: 15
  let sect: number | null = null;
  if (parts.sectorRank.available) {
    const map: Record<string, number> = {
      "Sector Outperforming": 1,
      "Sector Improving": 0.7,
      "Sector Neutral": 0.5,
      "Sector Weak": 0.2,
    };
    sect = map[parts.sectorRank.label] ?? 0.5;
  }
  components.push({ key: "Sector / Group Strength", weight: 15, value: sect });

  // Quarterly EPS Trend: 10
  components.push({
    key: "Quarterly EPS Trend",
    weight: 10,
    value: trendScore(parts.eps),
  });

  // Sales Growth Trend: 10
  components.push({
    key: "Sales Growth Trend",
    weight: 10,
    value: trendScore(parts.sales),
  });

  // Ownership Trend: 5
  let own: number | null = null;
  if (parts.ownership.available) {
    const map: Record<string, number> = {
      "Strong Institutional Accumulation": 1,
      "Institutional Interest Improving": 0.7,
      "Stable Ownership": 0.5,
      "Low Institutional Footprint": 0.35,
      "Institutional Selling": 0.1,
    };
    own = map[parts.ownership.label] ?? 0.5;
  }
  components.push({ key: "Ownership Trend", weight: 5, value: own });

  // Extension Risk: 5 — REDUCES score when overextended
  let extVal: number | null = null;
  const risk = parts.extensionRisk?.riskLevel;
  if (risk) {
    extVal = risk === "High" ? 0 : risk === "Medium" ? 0.5 : 1;
  }
  components.push({ key: "Extension Risk", weight: 5, value: extVal });

  // Normalize over available components
  let earned = 0;
  let availableWeight = 0;
  const breakdown = components.map((c) => {
    const contribution = c.value === null ? null : c.value * c.weight;
    if (c.value !== null) {
      earned += contribution as number;
      availableWeight += c.weight;
    }
    return {
      component: c.key,
      weight: c.weight,
      available: c.value !== null,
      points:
        c.value === null ? UNAVAILABLE : `${(c.value * c.weight).toFixed(1)} / ${c.weight}`,
    };
  });

  const totalWeight = components.reduce((a, c) => a + c.weight, 0);
  const dataCoverage = Math.round((availableWeight / totalWeight) * 100);
  const score =
    availableWeight > 0 ? Math.round((earned / availableWeight) * 100) : null;

  let label = "Data Insufficient";
  if (score !== null) {
    if (score >= 80) label = "Strong Momentum";
    else if (score >= 65) label = "Improving Momentum";
    else if (score >= 50) label = "Mixed / Watchlist";
    else if (score >= 35) label = "Weak Momentum";
    else label = "Poor Momentum / Avoid Chasing";
  }

  let explanation: string;
  if (score === null)
    explanation =
      "Momentum score cannot be computed — too few components are available from the current provider.";
  else
    explanation = `Score ${score}/100 (${label}) based on ${dataCoverage}% data coverage. Components are weighted and normalized over available data; extension risk reduces the score when the stock is overextended.`;

  return { score, label, dataCoverage, breakdown, explanation };
}

function trendScore(section: any): number | null {
  if (!section || !section.available) return null;
  const label: string = section.trendLabel || "";
  if (label.startsWith("Accelerating")) return 1;
  if (label.startsWith("Stable")) return 0.75;
  if (label.startsWith("Mixed")) return 0.5;
  if (label.startsWith("Decelerating")) return 0.25;
  if (label.startsWith("Negative")) return 0;
  return null;
}

// ====================================================================
// PHASE 6 — CANDLE-COMPUTED TIME SERIES (for graphs)
// ====================================================================
function padFront<T>(arr: T[], len: number): (T | null)[] {
  const missing = len - arr.length;
  return missing > 0 ? [...Array(missing).fill(null), ...arr] : arr;
}

export function computeMomentumSeries(candles: any[]) {
  const valid = (candles || []).filter((c) => c && c.close != null);
  if (valid.length < 30) return { available: false, points: [] };

  const closes = valid.map((c) => Number(c.close));
  const highs = valid.map((c) => Number(c.high ?? c.close));
  const lows = valid.map((c) => Number(c.low ?? c.close));
  const volumes = valid.map((c) => Number(c.volume) || 0);

  const sma10 = padFront(SMA.calculate({ period: 10, values: closes }), closes.length);
  const sma20 = padFront(SMA.calculate({ period: 20, values: closes }), closes.length);
  const sma50 = padFront(SMA.calculate({ period: 50, values: closes }), closes.length);
  const sma200 = padFront(SMA.calculate({ period: 200, values: closes }), closes.length);
  const ema10 = padFront(EMA.calculate({ period: 10, values: closes }), closes.length);
  const ema20 = padFront(EMA.calculate({ period: 20, values: closes }), closes.length);
  const rsiArr = padFront(RSI.calculate({ period: 14, values: closes }), closes.length);
  const adxRaw = ADX.calculate({ period: 14, high: highs, low: lows, close: closes }).map(
    (a: any) => a.adx,
  );
  const adxArr = padFront(adxRaw, closes.length);
  const volAvg20 = padFront(SMA.calculate({ period: 20, values: volumes }), closes.length);

  // Daily momentum proxy (0-100), blended from price vs MA20, RSI, ADX and 5-day slope.
  const momentum: (number | null)[] = closes.map((c, i) => {
    const m20 = sma20[i] as number | null;
    const rsi = rsiArr[i] as number | null;
    const adx = adxArr[i] as number | null;
    if (m20 === null || rsi === null) return null;
    const distPct = ((c - m20) / m20) * 100; // +/- around MA20
    const slope = i >= 5 ? ((c - closes[i - 5]) / closes[i - 5]) * 100 : 0;
    let score =
      50 +
      Math.max(-20, Math.min(20, distPct * 2)) + // trend position
      (rsi - 50) * 0.5 + // RSI tilt
      (adx !== null ? Math.max(-5, Math.min(10, (adx - 20) * 0.5)) : 0) + // trend strength
      Math.max(-10, Math.min(10, slope)); // short slope
    return Math.round(Math.max(0, Math.min(100, score)));
  });

  // Output the last ~120 points for a clean graph
  const out = Math.min(120, valid.length);
  const startI = valid.length - out;
  const points = [];
  for (let i = startI; i < valid.length; i++) {
    const ma10v = (sma10[i] as number | null);
    const ma20v = (sma20[i] as number | null);
    points.push({
      date:
        valid[i].date instanceof Date
          ? valid[i].date.toISOString().split("T")[0]
          : String(valid[i].date).split("T")[0],
      close: Number(closes[i].toFixed(2)),
      ma10: ma10v != null ? Number(ma10v.toFixed(2)) : null,
      ma20: ma20v != null ? Number(ma20v.toFixed(2)) : null,
      ma50: sma50[i] != null ? Number((sma50[i] as number).toFixed(2)) : null,
      ma200: sma200[i] != null ? Number((sma200[i] as number).toFixed(2)) : null,
      ema10: ema10[i] != null ? Number((ema10[i] as number).toFixed(2)) : null,
      ema20: ema20[i] != null ? Number((ema20[i] as number).toFixed(2)) : null,
      volume: volumes[i],
      volAvg: volAvg20[i] != null ? Math.round(volAvg20[i] as number) : null,
      rsi: rsiArr[i] != null ? Math.round(rsiArr[i] as number) : null,
      adx: adxArr[i] != null ? Math.round(adxArr[i] as number) : null,
      momentum: momentum[i],
      distMa10: ma10v != null ? Number((((closes[i] - ma10v) / ma10v) * 100).toFixed(2)) : null,
      distMa20: ma20v != null ? Number((((closes[i] - ma20v) / ma20v) * 100).toFixed(2)) : null,
    });
  }
  return { available: true, points };
}

// Candle-computed extras (Phase 6): 52w hi/lo, volatility, run-ups.
function computeCandleExtras(candles: any[], currentPrice: number) {
  const valid = (candles || []).filter((c) => c && c.close != null);
  const closes = valid.map((c) => Number(c.close));
  if (closes.length < 5) {
    return {
      fiftyTwoWeekHigh: UNAVAILABLE,
      fiftyTwoWeekLow: UNAVAILABLE,
      volatility: UNAVAILABLE,
      runUp10: UNAVAILABLE,
      runUp15: UNAVAILABLE,
      runUp20: UNAVAILABLE,
    };
  }
  const yr = closes.slice(-252);
  const hi = Math.max(...yr);
  const lo = Math.min(...yr);
  // Annualized volatility from daily log returns
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1);
  const vol = Math.sqrt(variance) * Math.sqrt(252) * 100;
  const runUp = (n: number) => {
    if (closes.length <= n) return null;
    const past = closes[closes.length - 1 - n];
    return past ? ((currentPrice - past) / past) * 100 : null;
  };
  return {
    fiftyTwoWeekHigh: yr.length >= 200 ? hi.toFixed(2) : `${hi.toFixed(2)} (partial year)`,
    fiftyTwoWeekLow: yr.length >= 200 ? lo.toFixed(2) : `${lo.toFixed(2)} (partial year)`,
    volatility: vol ? vol.toFixed(1) + "% (annualized)" : UNAVAILABLE,
    runUp10: pctOrNa(runUp(10)),
    runUp15: pctOrNa(runUp(15)),
    runUp20: pctOrNa(runUp(20)),
  };
}
function pctOrNa(v: number | null) {
  return v === null ? UNAVAILABLE : pct(v);
}

// ====================================================================
// PHASE 6 — DATA COVERAGE
// ====================================================================
function computeDataCoverage(
  candleCount: number,
  sections: {
    priceStrength: any;
    qualityRatios: any;
    quarterlyEps: any;
    quarterlySales: any;
    forwardValuation: any;
    ownership: any;
    fundHolders: any;
  },
  news: any,
) {
  const cov = (pctVal: number, label: string, reasons: string[]) => ({
    pct: Math.round(pctVal),
    label,
    reasons,
  });

  // Price data: from candle count
  const priceReasons: string[] = [];
  let pricePct = 100;
  if (candleCount < 252) {
    pricePct = Math.min(95, Math.round((candleCount / 252) * 100));
    priceReasons.push("Less than 1 year of candles — long-period returns limited.");
  }
  if (candleCount < 60) priceReasons.push("Not enough historical candles for 3M/6M context.");

  // Technical: computable from candles
  const techPct = candleCount >= 200 ? 100 : candleCount >= 50 ? 85 : 50;
  const techReasons =
    candleCount < 200 ? ["SMA200 needs ~200 candles; using shorter MAs where needed."] : [];

  // Financial
  let finScore = 0;
  const finParts = [
    sections.qualityRatios.available,
    sections.quarterlyEps.available,
    sections.quarterlySales.available,
    sections.forwardValuation.available,
  ];
  finScore = (finParts.filter(Boolean).length / finParts.length) * 100;
  const finReasons: string[] = [];
  if (!sections.quarterlyEps.available)
    finReasons.push("Quarterly EPS requires financial statement data not provided by current provider.");
  if (!sections.forwardValuation.available)
    finReasons.push("Forward EPS requires analyst estimates (unavailable for this symbol).");

  // Ownership
  const ownPct = (sections.ownership.available ? 50 : 0) + (sections.fundHolders.available ? 50 : 0);
  const ownReasons: string[] = [];
  if (!sections.fundHolders.available)
    ownReasons.push("Fund/FII/MF holdings not provided by current data provider for this symbol.");

  // News
  const newsAvail = news && news.count > 0;
  const newsPct = newsAvail ? Math.min(100, news.count * 10) : 0;
  const newsReasons = newsAvail
    ? []
    : ["Live news not available for this symbol from current provider."];

  const label = (p: number) =>
    p >= 80 ? "Strong" : p >= 50 ? "Partial" : p > 0 ? "Limited" : "Unavailable";

  return {
    price: cov(pricePct, label(pricePct), priceReasons),
    technical: cov(techPct, label(techPct), techReasons),
    financial: cov(finScore, label(finScore), finReasons),
    ownership: cov(ownPct, label(ownPct), ownReasons),
    news: cov(newsPct, label(newsPct), newsReasons),
  };
}

// ====================================================================
// PHASE 4 — MOMENTUM SCENARIO ENGINE (conditional, not prediction)
// ====================================================================
function computeScenarios(input: {
  mtf: any;
  buyerDemand: any;
  sectorRank: any;
  priceStrength: any;
  shortTermSetup: any;
}) {
  const daily = input.mtf?.daily;
  if (!daily || daily.error) {
    return {
      available: false,
      note: "Scenario engine needs daily candle data, which is insufficient for this symbol.",
      scenarios: [],
    };
  }
  const price = daily.currentPrice;
  const resistance = daily.resistance?.[1];
  const support = daily.support?.[0];
  const rsi = daily.rsi ?? 50;
  const adx = daily.adx ?? 0;
  const volStrong = (daily.volumeSignal || "").includes("Strong");
  const sectorStrong = input.sectorRank?.sectorStrong;
  const relVolStr = input.buyerDemand?.metrics?.relativeVolume || "";
  const relVol = parseFloat(relVolStr) || 1;
  const ema20 = daily?.ema?.[20];
  const ext = input.mtf?.extensionRisk?.riskLevel;

  const fmt = (n: any) => (typeof n === "number" ? n.toFixed(2) : UNAVAILABLE);

  // 1. Bullish Confirmation
  const bullMet = [
    price && resistance ? price >= resistance * 0.99 : false,
    relVol >= 1.5 || volStrong,
    rsi >= 60 && rsi < 70,
    adx >= 25,
    !!sectorStrong,
  ].filter(Boolean).length;
  const bull = {
    key: "bullish",
    title: "Bullish Confirmation Scenario",
    triggerLevel: resistance ? `Close above ${fmt(resistance)} (resistance)` : UNAVAILABLE,
    confirmationSignal: "Volume above ~1.5x average, RSI 60–70, ADX rising above 25, sector supportive",
    riskSignal: "Breakout fails / closes back below resistance on light volume",
    whatToMonitor: "Daily close vs resistance, volume confirmation, RSI staying below 70",
    status: bullMet >= 4 ? "Confirmed" : bullMet >= 2 ? "Watching" : "Not Confirmed",
    output:
      "Momentum may improve if price sustains above resistance with volume confirmation.",
  };

  // 2. Pullback / Healthy Retest
  const nearMa = ema20 && price ? Math.abs((price - ema20) / ema20) * 100 <= 4 : false;
  const pullMet = [
    nearMa,
    rsi >= 45 && rsi <= 60,
    !(input.buyerDemand?.rating === "Distribution Pressure"),
    support && price ? price > support : false,
  ].filter(Boolean).length;
  const pull = {
    key: "pullback",
    title: "Pullback / Healthy Retest Scenario",
    triggerLevel: ema20 ? `Pullback near 20 MA (${fmt(ema20)})` : "Pullback toward 10/20 MA",
    confirmationSignal: "RSI cools to 45–60, volume normal (not distribution), support holds",
    riskSignal: "Heavy selling volume into the pullback / support gives way",
    whatToMonitor: "Behaviour near 10/20 MA, whether selling volume stays controlled",
    status: pullMet >= 3 ? "Watching" : "Not Confirmed",
    output:
      "Setup may become cleaner if price cools near a moving average without heavy selling.",
  };

  // 3. Weakening
  const weakMet = [
    support && price ? price < support : false,
    rsi < 45,
    (daily.trend || "").includes("Downtrend"),
    input.buyerDemand?.rating === "Distribution Pressure",
  ].filter(Boolean).length;
  const weak = {
    key: "weakening",
    title: "Weakening Scenario",
    triggerLevel: support ? `Close below ${fmt(support)} (support)` : UNAVAILABLE,
    confirmationSignal: "RSI below 45, ADX confirms downtrend, heavy selling volume",
    riskSignal: "Sustained closes below support with rising down-volume",
    whatToMonitor: "Support level, RSI deterioration, distribution days",
    status: weakMet >= 3 ? "Confirmed" : weakMet >= 1 ? "Watching" : "Not Confirmed",
    output: "Momentum weakens if support breaks with volume and RSI deteriorates.",
  };

  return {
    available: true,
    note: ext === "High" ? "Extension risk is elevated — avoid chasing; prefer confirmation." : "",
    scenarios: [bull, pull, weak],
  };
}

// ====================================================================
// PART 3 — MOMENTUM SNAPSHOT + assembly
// ====================================================================
export function computeMomentum(input: {
  symbol: string;
  name: string;
  quote: any;
  summary: any;
  mtf: any;
  marketContext: any;
  dailyCandles: any[]; // [{date, close, high, low, open, volume}]
  sector: string;
  industry: string;
  news?: any; // { count, sentiment, score, articles }
}) {
  const { quote, summary, mtf, marketContext } = input;
  const news = input.news || { count: 0, sentiment: "Neutral", score: 0, articles: [] };
  const currentPrice =
    num(quote?.regularMarketPrice) ??
    (input.dailyCandles.length
      ? num(input.dailyCandles[input.dailyCandles.length - 1].close)
      : null) ??
    0;

  const closes = (input.dailyCandles || [])
    .map((c) => num(c.close))
    .filter((c): c is number => c !== null);

  const stockReturn1M = returnOver(closes, 21);
  const sectorReturn1M = marketContext?.sectorContext?.available
    ? num(marketContext.sectorContext.return1M)
    : null;
  const indexReturn1M = marketContext?.marketContext?.available
    ? num(marketContext.marketContext.return1M)
    : null;

  // ---- Company / master data (Part 7) ----
  const detail = summary?.summaryDetail || {};
  const profile = summary?.summaryProfile || {};
  const fin = summary?.financialData || {};
  const stats = summary?.defaultKeyStatistics || {};
  const marketCap = num(quote?.marketCap) ?? num(detail.marketCap);
  let mcCategory = UNAVAILABLE;
  if (marketCap !== null) {
    if (marketCap >= 1e11) mcCategory = "Mega Cap";
    else if (marketCap >= 1e10) mcCategory = "Large Cap";
    else if (marketCap >= 2e9) mcCategory = "Mid Cap";
    else if (marketCap >= 3e8) mcCategory = "Small Cap";
    else mcCategory = "Micro Cap";
  }
  const longSummary = profile.longBusinessSummary || "";
  const company = {
    name: input.name,
    description: longSummary
      ? longSummary.split(". ").slice(0, 3).join(". ").trim()
      : "Business profile data may be limited from current provider.",
    fullDescription: longSummary,
    sector: input.sector || UNAVAILABLE,
    industry: input.industry || UNAVAILABLE,
    marketCap: marketCap === null ? UNAVAILABLE : formatBig(marketCap),
    marketCapCategory: mcCategory,
    beta: num(detail.beta) === null ? UNAVAILABLE : (num(detail.beta) as number).toFixed(2),
    fiftyTwoWeekHigh:
      num(detail.fiftyTwoWeekHigh) === null
        ? UNAVAILABLE
        : (num(detail.fiftyTwoWeekHigh) as number).toFixed(2),
    fiftyTwoWeekLow:
      num(detail.fiftyTwoWeekLow) === null
        ? UNAVAILABLE
        : (num(detail.fiftyTwoWeekLow) as number).toFixed(2),
    longTermDebt:
      num(fin.totalDebt) === null ? UNAVAILABLE : formatBig(num(fin.totalDebt) as number),
    longTermDebtEquity:
      num(fin.debtToEquity) === null
        ? UNAVAILABLE
        : ((num(fin.debtToEquity) as number) / 100).toFixed(2),
    roe:
      num(fin.returnOnEquity) === null
        ? UNAVAILABLE
        : ((num(fin.returnOnEquity) as number) * 100).toFixed(2) + "%",
    roce:
      num(fin.returnOnAssets) === null
        ? UNAVAILABLE
        : ((num(fin.returnOnAssets) as number) * 100).toFixed(2) + "% (approx)",
    fundsHolding:
      num(summary?.majorHoldersBreakdown?.institutionsCount) === null
        ? UNAVAILABLE
        : String(num(summary?.majorHoldersBreakdown?.institutionsCount)),
    sharesHeldByFunds:
      num(summary?.majorHoldersBreakdown?.institutionsPercentHeld) === null
        ? UNAVAILABLE
        : (
            (num(summary?.majorHoldersBreakdown?.institutionsPercentHeld) as number) *
            100
          ).toFixed(2) + "%",
    dataSourceStatus: longSummary
      ? "Live from provider"
      : "Business profile data may be limited from current provider.",
  };

  // ---- Sections ----
  const priceStrength = computePriceStrength(
    closes,
    currentPrice,
    stockReturn1M,
    sectorReturn1M,
    indexReturn1M,
  );
  const priceStrong = (priceStrength.score ?? 0) >= 58;

  const buyerDemand = computeBuyerDemand(input.dailyCandles);
  const sectorRank = computeSectorRank(
    marketContext,
    input.sector,
    input.industry,
    priceStrong,
    stockReturn1M,
  );
  const quarterlyEps = computeQuarterlyEps(summary);
  const quarterlySales = computeQuarterlySales(summary);
  const forwardValuation = computeForwardValuation(summary, currentPrice);
  const ownership = computeOwnership(summary);
  const fundHolders = computeFundHolders(summary);
  const qualityRatios = computeQualityRatios(summary);
  const dilution = computeDilution(summary);
  const cashFlow = computeCashFlow(summary);
  const shortTermSetup = computeShortTermSetup(mtf, sectorRank.sectorStrong);

  const momentumScore = computeMomentumScore({
    priceStrength,
    buyerDemand,
    mtf,
    sectorRank,
    eps: quarterlyEps,
    sales: quarterlySales,
    ownership,
    extensionRisk: mtf?.extensionRisk,
  });

  // ---- Snapshot + final momentum view (Part 3) ----
  const extension = mtf?.extensionRisk || {};
  const volumeConfirm = buyerDemand?.metrics?.volumeConfirmation || UNAVAILABLE;

  let finalView = "Data Insufficient";
  const s = momentumScore.score;
  const overextended = extension.riskLevel === "High";
  const weakVolume =
    buyerDemand.available &&
    ["Weak Demand", "Distribution Pressure"].includes(buyerDemand.rating);
  const weakSector = sectorRank.available && sectorRank.label === "Sector Weak";
  const poorEarnings =
    (quarterlyEps.available && quarterlyEps.trendLabel.startsWith("Negative")) ||
    (quarterlySales.available && quarterlySales.trendLabel.startsWith("Negative"));
  const dataInsufficient = momentumScore.dataCoverage < 45 || s === null;

  if (dataInsufficient) {
    finalView = "Data Insufficient";
  } else if (overextended && (s ?? 0) >= 65) {
    finalView = "Overextended Momentum";
  } else if ((s ?? 0) >= 80 && !overextended && !weakVolume && !weakSector && !poorEarnings) {
    finalView = "Strong Momentum";
  } else if ((s ?? 0) >= 65) {
    finalView = "Improving Momentum";
  } else if ((s ?? 0) >= 55 && priceStrong) {
    finalView = "Early Momentum";
  } else if ((s ?? 0) >= 45) {
    finalView = "Mixed Momentum";
  } else {
    finalView = "Weak Momentum";
  }

  // ---- News impact (Phase 7-lite / feeds snapshot, score context) ----
  let newsImpact = "No live news";
  if (news.count > 0) {
    newsImpact =
      news.sentiment === "Positive"
        ? "Positive news flow"
        : news.sentiment === "Negative"
          ? "Negative news flow"
          : "Neutral news flow";
  }

  // ---- Phase 6/4 enrichments ----
  const series = computeMomentumSeries(input.dailyCandles);
  const candleExtras = computeCandleExtras(input.dailyCandles, currentPrice);
  const dataCoverage = computeDataCoverage(
    closes.length,
    { priceStrength, qualityRatios, quarterlyEps, quarterlySales, forwardValuation, ownership, fundHolders },
    news,
  );
  const scenarios = computeScenarios({
    mtf,
    buyerDemand,
    sectorRank,
    priceStrength,
    shortTermSetup,
  });

  // Backfill 52w hi/lo from candles when the provider value was unavailable.
  if (company.fiftyTwoWeekHigh === UNAVAILABLE && candleExtras.fiftyTwoWeekHigh !== UNAVAILABLE)
    company.fiftyTwoWeekHigh = candleExtras.fiftyTwoWeekHigh;
  if (company.fiftyTwoWeekLow === UNAVAILABLE && candleExtras.fiftyTwoWeekLow !== UNAVAILABLE)
    company.fiftyTwoWeekLow = candleExtras.fiftyTwoWeekLow;

  const snapshot = {
    momentumScore: s,
    momentumScoreLabel: momentumScore.label,
    priceStrengthRating: priceStrength.ratingCode,
    buyerDemandRating: buyerDemand.rating,
    volumeConfirmation: volumeConfirm,
    rsiCondition: mtf?.daily?.rsiLabel || UNAVAILABLE,
    adxTrendStrength: mtf?.daily?.adxLabel || UNAVAILABLE,
    sectorRank: sectorRank.label,
    sectorSupport: sectorRank.sectorStrong ? "Supportive" : sectorRank.available ? "Soft" : UNAVAILABLE,
    epsTrend: quarterlyEps.trendLabel,
    salesTrend: quarterlySales.trendLabel,
    ownershipTrend: ownership.label,
    shortTermSetup: shortTermSetup.label,
    extensionRisk: extension.riskLevel || UNAVAILABLE,
    newsImpact,
    finalMomentumView: finalView,
    dataCoverage: momentumScore.dataCoverage,
  };

  // ---- Baseline snapshot for the 15-Day Momentum Watch (Phase 3) ----
  const daily = mtf?.daily || {};
  const baseline = {
    symbol: input.symbol,
    stockName: input.name,
    startPrice: currentPrice,
    supportZones: daily.support || null,
    resistanceZones: daily.resistance || null,
    rsi: daily.rsi ?? null,
    adx: daily.adx ?? null,
    volume: input.dailyCandles.length
      ? Number(input.dailyCandles[input.dailyCandles.length - 1].volume) || null
      : null,
    relativeVolume: buyerDemand?.metrics?.relativeVolume ?? null,
    ma10: daily?.sma?.[10] ?? null,
    ma20: daily?.sma?.[20] ?? null,
    ma50: daily?.sma?.[50] ?? null,
    ma200: daily?.sma?.[200] ?? null,
    momentumScore: s,
    trend: daily.trend ?? null,
    extensionRisk: extension.riskLevel ?? null,
    sectorStrength: sectorRank.label,
    newsSentiment: news.sentiment || "Neutral",
  };

  return {
    symbol: input.symbol,
    name: input.name,
    generatedAt: new Date().toISOString(),
    disclaimer: MOMENTUM_DISCLAIMER,
    snapshot,
    company,
    candleExtras,
    priceStrength,
    buyerDemand,
    sectorRank,
    quarterlyEps,
    quarterlySales,
    forwardValuation,
    ownership,
    fundHolders,
    qualityRatios,
    dilution,
    cashFlow,
    shortTermSetup,
    momentumScore,
    series,
    dataCoverage,
    scenarios,
    baseline,
    news: { count: news.count, sentiment: news.sentiment, articles: news.articles || [] },
    // Peer momentum (Part 20) — secondary; provider peers not exposed by Yahoo
    peerMomentum: {
      available: false,
      peers: [],
      note: "Peer momentum comparison unavailable from current provider.",
    },
  };
}

export type MomentumResult = ReturnType<typeof computeMomentum>;
