"use client";

import React, { useState } from "react";
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  Users,
  Layers,
  BarChart3,
  LineChart as LineIcon,
  Building2,
  ShieldCheck,
  Split,
  Droplets,
  Crosshair,
  Sparkles,
  Download,
  AlertTriangle,
  Info,
  Loader2,
  Activity,
  CalendarClock,
  Play,
  RotateCcw,
  GitCompare,
  Database,
  CheckCircle2,
  XCircle,
  Eye,
} from "lucide-react";
import {
  BarChart,
  Bar,
  ComposedChart,
  Area,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  Legend,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  getMomentumWatch,
  saveMomentumWatch,
  removeMomentumWatch,
} from "@/lib/storage";
import { downloadExcel } from "@/lib/exportUtils";

const UNAVAILABLE = "Data Unavailable";

// ---- shared color helpers (research-language, not advice) ----
function viewColor(label: string): string {
  const l = (label || "").toLowerCase();
  if (l.includes("strong") && !l.includes("weak")) return "emerald";
  if (l.includes("improving") || l.includes("positive") || l.includes("accelerating") || l.includes("outperform"))
    return "emerald";
  if (l.includes("early") || l.includes("stable") || l.includes("reasonable") || l.includes("healthy"))
    return "sky";
  if (l.includes("overextended") || l.includes("avoid") || l.includes("distribution") || l.includes("negative") || l.includes("weak") || l.includes("expensive"))
    return "rose";
  if (l.includes("mixed") || l.includes("watch") || l.includes("neutral") || l.includes("pullback") || l.includes("insufficient") || l.includes("unavailable"))
    return "amber";
  return "slate";
}

const colorClasses: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sky: "bg-sky-50 text-sky-700 border-sky-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  slate: "bg-slate-50 text-slate-600 border-slate-200",
};

function Pill({ label }: { label: string }) {
  const c = colorClasses[viewColor(label)];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-bold ${c}`}>
      {label || UNAVAILABLE}
    </span>
  );
}

function Card({
  title,
  icon,
  children,
  onInfo,
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onInfo?: () => void;
  badge?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            {icon}
          </span>
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {badge && <Pill label={badge} />}
          {onInfo && (
            <button
              onClick={onInfo}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 print:hidden"
              aria-label="Explain"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  const v = value === undefined || value === null || value === "" ? UNAVAILABLE : String(value);
  const muted = v === UNAVAILABLE;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className={`text-xs font-bold ${muted ? "text-slate-400 italic" : "text-slate-800"}`}>
        {v}
      </span>
    </div>
  );
}

function Unavailable({ note }: { note: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <span>{note || UNAVAILABLE}</span>
    </div>
  );
}

export default function MomentumTab({
  symbol,
  market,
  openDrawer,
  pdfMode = false,
  onLoaded,
}: {
  symbol: string;
  market: string;
  openDrawer?: (d: any) => void;
  pdfMode?: boolean;
  onLoaded?: (m: any) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [m, setM] = useState<any | null>(null);
  const [deepDive, setDeepDive] = useState<any | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  // 15-Day Watch + What-Changed
  const [watch, setWatch] = useState<any | null>(null);
  const [whatChanged, setWhatChanged] = useState<any | null>(null);
  const [wcLoading, setWcLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    setDeepDive(null);
    try {
      const res = await fetch("/api/momentum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, market }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Momentum analysis failed");
      setM(json.momentum);
      if (onLoaded) onLoaded(json.momentum);
    } catch (e: any) {
      setError(e.message || "Momentum analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-load when the symbol changes / on first mount
  React.useEffect(() => {
    if (symbol) load();
    setWatch(getMomentumWatch(symbol));
    setWhatChanged(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // ---- 15-Day Watch handlers (Phase 3) ----
  const TRADING_DAYS = 15;
  const startWatch = () => {
    if (!m?.baseline) return;
    const w = {
      ...m.baseline,
      startDate: new Date().toISOString(),
      startTradingDayCount: 0,
    };
    saveMomentumWatch(w);
    setWatch(getMomentumWatch(symbol));
    setWhatChanged(null);
  };
  const resetWatch = () => {
    removeMomentumWatch(symbol);
    setWatch(null);
    setWhatChanged(null);
  };
  const exportWatch = () => {
    if (!watch) return;
    const payload = {
      watchBaseline: watch,
      current: m
        ? { snapshot: m.snapshot, priceStrength: m.priceStrength, buyerDemand: m.buyerDemand, scenarios: m.scenarios }
        : null,
      whatChanged: whatChanged || "Not generated",
      disclaimer: m?.disclaimer,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `15DayWatch_${(symbol || "stock").replace(/\W/g, "_")}_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const runWhatChanged = async () => {
    if (!m || !watch) return;
    setWcLoading(true);
    try {
      const res = await fetch("/api/momentum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatChanged: true, baseline: watch, current: m }),
      });
      const json = await res.json();
      setWhatChanged(json.whatChanged);
    } catch (e: any) {
      setWhatChanged({ error: e.message || "What-Changed analysis failed." });
    } finally {
      setWcLoading(false);
    }
  };

  const runDeepDive = async () => {
    if (!m) return;
    setDeepLoading(true);
    try {
      const res = await fetch("/api/momentum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deepDive: true, momentum: m }),
      });
      const json = await res.json();
      setDeepDive(json.aiDeepDive);
    } catch (e: any) {
      setDeepDive({ error: e.message || "AI deep dive failed." });
    } finally {
      setDeepLoading(false);
    }
  };

  const exportData = () => {
    if (!m) return;
    const payload = { ...m, aiMomentumDeepDive: deepDive || "Not generated" };
    // CSV (flat key sections) + JSON bundle; provider-agnostic, never breaks PDF.
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Momentum_${(symbol || "stock").replace(/\W/g, "_")}_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    if (!m) return;
    const snap = m.snapshot || {};
    const sections = [
      {
        title: "Momentum Snapshot",
        rows: [
          ["Metric", "Value"],
          ["Momentum Score", `${snap.momentumScore ?? "—"} / 100`],
          ["Momentum View", snap.finalMomentumView],
          ["Price Strength", snap.priceStrengthRating],
          ["Buyer Demand", snap.buyerDemandRating],
          ["RSI Condition", snap.rsiCondition],
          ["ADX Strength", snap.adxTrendStrength],
          ["Extension Risk", snap.extensionRisk],
          ["Sector Support", snap.sectorSupport],
          ["News Impact", snap.newsImpact],
          ["EPS Trend", snap.epsTrend],
          ["Sales Trend", snap.salesTrend],
          ["Data Coverage", `${snap.dataCoverage}%`],
        ],
      },
      {
        title: "Company",
        rows: [
          ["Field", "Value"],
          ["Sector", m.company?.sector],
          ["Industry", m.company?.industry],
          ["Market Cap", m.company?.marketCap],
          ["Beta", m.company?.beta],
          ["52W High", m.company?.fiftyTwoWeekHigh],
          ["52W Low", m.company?.fiftyTwoWeekLow],
          ["ROE", m.company?.roe],
        ],
      },
      {
        title: "Quality Ratios",
        rows: [["Metric", "Value"], ...Object.entries(m.qualityRatios?.metrics || {}).map(([k, v]) => [k, v as string])],
      },
      {
        title: "Quarterly EPS",
        rows: [["Quarter", "EPS", "QoQ", "YoY"], ...(m.quarterlyEps?.quarters || []).map((q: any) => [q.quarter, q.epsDisplay, q.qoq, q.yoy])],
      },
      {
        title: "Momentum Score Breakdown",
        rows: [["Component", "Weight", "Points"], ...(m.momentumScore?.breakdown || []).map((b: any) => [b.component, b.weight, b.points])],
      },
    ];
    downloadExcel(
      `Momentum_${(symbol || "stock").replace(/\W/g, "_")}_${new Date().toISOString().split("T")[0]}`,
      `${m.name || symbol} — Momentum Report`,
      sections,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="font-medium text-sm">Building momentum research…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto">
        <Unavailable note={error} />
        <button
          onClick={load}
          className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!m) return null;

  const snap = m.snapshot;

  return (
    <div className="space-y-5">
      {/* Disclaimer */}
      <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        {m.disclaimer}
      </div>

      {/* Header actions */}
      {!pdfMode && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500 font-medium">
            Data coverage: <span className="font-bold text-slate-700">{snap.dataCoverage}%</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={runDeepDive}
              disabled={deepLoading}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50"
            >
              {deepLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              AI Momentum Deep Dive
              <span className="text-[9px] font-black text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded">PAID</span>
            </button>
            <button
              onClick={exportData}
              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" /> Export Momentum Data
            </button>
            <button
              onClick={exportExcel}
              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          </div>
        </div>
      )}

      {/* 1. SNAPSHOT */}
      <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex flex-col items-center justify-center sm:border-r sm:border-indigo-100 sm:pr-6">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="9" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={`${(2 * Math.PI * 42 * (snap.momentumScore ?? 0)) / 100} ${2 * Math.PI * 42}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-slate-900">{snap.momentumScore ?? "—"}</span>
                <span className="text-[10px] font-bold text-slate-400">/ 100</span>
              </div>
            </div>
            <div className="mt-2">
              <Pill label={snap.finalMomentumView} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 flex-1">
            <Stat label="Momentum View" value={snap.finalMomentumView} />
            <Stat label="15-Day Watch" value={watch ? watchStatusLabel(watch) : "Not started"} />
            <Stat label="Price Strength" value={snap.priceStrengthRating} />
            <Stat label="Buyer Demand" value={snap.buyerDemandRating} />
            <Stat label="Volume Confirm" value={snap.volumeConfirmation} />
            <Stat label="RSI Condition" value={snap.rsiCondition} />
            <Stat label="ADX Strength" value={snap.adxTrendStrength} />
            <Stat label="Extension Risk" value={snap.extensionRisk} />
            <Stat label="Sector Support" value={snap.sectorSupport} />
            <Stat label="News Impact" value={snap.newsImpact} />
            <Stat label="EPS Trend" value={snap.epsTrend} />
            <Stat label="Sales Trend" value={snap.salesTrend} />
          </div>
        </div>
      </div>

      {/* PHASE 2 — MOMENTUM GRAPHS */}
      <MomentumGraphs m={m} />

      {/* PHASE 6 — DATA COVERAGE */}
      <DataCoverageCard coverage={m.dataCoverage} />

      {/* PHASE 4 — SCENARIO ENGINE */}
      <ScenarioEngine scenarios={m.scenarios} />

      {/* PHASE 3 — 15-DAY MOMENTUM WATCH */}
      <FifteenDayWatch
        m={m}
        watch={watch}
        whatChanged={whatChanged}
        wcLoading={wcLoading}
        onStart={startWatch}
        onReset={resetWatch}
        onExport={exportWatch}
        onWhatChanged={runWhatChanged}
        tradingDays={TRADING_DAYS}
      />

      {/* AI DEEP DIVE result */}
      {deepDive && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5">
          <h3 className="text-sm font-black text-indigo-700 flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" /> AI Momentum Deep Dive
          </h3>
          {deepDive.error ? (
            <Unavailable note={deepDive.error} />
          ) : (
            <div className="space-y-3 text-sm text-slate-700">
              {deepDive.momentumSummary && <p className="font-medium">{deepDive.momentumSummary}</p>}
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ["Business Profile", deepDive.businessProfile],
                  ["Price Strength", deepDive.priceStrengthView],
                  ["Buyer Demand", deepDive.buyerDemandView],
                  ["Quarterly Growth", deepDive.quarterlyGrowthView],
                  ["Ownership", deepDive.ownershipView],
                  ["Quality", deepDive.qualityView],
                  ["Sector Support", deepDive.sectorSupportView],
                  ["Short-Term Setup", deepDive.shortTermSetup],
                ]
                  .filter(([, v]) => v)
                  .map(([t, v]) => (
                    <div key={t as string} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1">{t}</div>
                      <div className="text-xs leading-relaxed">{v as string}</div>
                    </div>
                  ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <ListBlock title="Key Positives" items={deepDive.keyPositives} tone="emerald" />
                <ListBlock title="Key Risks" items={deepDive.keyRisks} tone="rose" />
                <ListBlock title="Data Limitations" items={deepDive.dataLimitations} tone="amber" />
                <ListBlock title="What To Track Next" items={deepDive.whatToTrackNext} tone="sky" />
              </div>
              {deepDive.finalMomentumView && (
                <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 text-xs font-semibold text-indigo-800">
                  {deepDive.finalMomentumView}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* 7. COMPANY MASTER DATA */}
        <Card title="Company / Master Data" icon={<Building2 className="w-4 h-4" />}>
          <p className="text-xs text-slate-600 leading-relaxed mb-3">{m.company.description}</p>
          <Stat label="Sector" value={m.company.sector} />
          <Stat label="Industry" value={m.company.industry} />
          <Stat label="Market Cap" value={`${m.company.marketCap} (${m.company.marketCapCategory})`} />
          <Stat label="Beta" value={m.company.beta} />
          <Stat label="52W High" value={m.company.fiftyTwoWeekHigh} />
          <Stat label="52W Low" value={m.company.fiftyTwoWeekLow} />
          <Stat label="Funds Holding" value={m.company.fundsHolding} />
          <Stat label="Shares Held by Funds" value={m.company.sharesHeldByFunds} />
          <Stat label="Long-Term Debt" value={m.company.longTermDebt} />
          <Stat label="LT Debt / Equity" value={m.company.longTermDebtEquity} />
          <Stat label="ROE" value={m.company.roe} />
          <Stat label="ROCE (approx)" value={m.company.roce} />
          <div className="mt-2 text-[10px] text-slate-400 italic">{m.company.dataSourceStatus}</div>
        </Card>

        {/* 4. PRICE STRENGTH */}
        <Card
          title="Price Strength"
          icon={<TrendingUp className="w-4 h-4" />}
          badge={m.priceStrength.rating}
          onInfo={openDrawer ? () => openDrawer({
            title: "Price Strength",
            value: m.priceStrength.rating,
            interpretation: `Score ${m.priceStrength.score ?? "—"}/100`,
            meaning: "Price strength blends multi-period returns with relative strength vs index/sector and position against key moving averages.",
            whyMatters: "Leaders trend above rising MAs and outperform their group. Weak relative strength is an early momentum warning.",
          }) : undefined}
        >
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 mb-3 text-center">
            {Object.entries(m.priceStrength.returnsDisplay).map(([k, v]) => (
              <div key={k} className="bg-slate-50 rounded-lg py-2">
                <div className="text-[9px] font-bold text-slate-400">{k}</div>
                <div className={`text-[11px] font-bold ${String(v).startsWith("-") ? "text-rose-600" : v === UNAVAILABLE ? "text-slate-400" : "text-emerald-600"}`}>{v as string}</div>
              </div>
            ))}
          </div>
          <Stat label="vs Index (1M)" value={m.priceStrength.vsIndexDisplay} />
          <Stat label="vs Sector (1M)" value={m.priceStrength.vsSectorDisplay} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mt-2">
            {Object.entries(m.priceStrength.movingAverages).map(([k, v]) => (
              <div key={k} className={`text-center rounded-lg py-1.5 text-[10px] font-bold ${v === "Above" ? "bg-emerald-50 text-emerald-700" : v === "Below" ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-400"}`}>
                {k.toUpperCase()}<br />{v as string}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">{m.priceStrength.explanation}</p>
        </Card>

        {/* 5. BUYER DEMAND */}
        <Card title="Buyer Demand" icon={<Users className="w-4 h-4" />} badge={m.buyerDemand.rating}>
          {m.buyerDemand.available ? (
            <>
              <Stat label="Up/Down Volume Ratio" value={m.buyerDemand.metrics.upDownVolumeRatio} />
              <Stat label="Accumulation Days" value={m.buyerDemand.metrics.accumulationDays} />
              <Stat label="Distribution Days" value={m.buyerDemand.metrics.distributionDays} />
              <Stat label="Relative Volume" value={m.buyerDemand.metrics.relativeVolume} />
              <Stat label="Volume Confirmation" value={m.buyerDemand.metrics.volumeConfirmation} />
              <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">{m.buyerDemand.explanation}</p>
            </>
          ) : (
            <Unavailable note={m.buyerDemand.explanation} />
          )}
        </Card>

        {/* 6. SECTOR RANK */}
        <Card title="Group / Sector Rank" icon={<Layers className="w-4 h-4" />} badge={m.sectorRank.label}>
          <Stat label="Sector" value={m.sectorRank.sector} />
          <Stat label="Industry" value={m.sectorRank.industry} />
          <Stat label="Sector Return 1M" value={m.sectorRank.sectorReturn1M} />
          <Stat label="Sector Return 3M" value={m.sectorRank.sectorReturn3M} />
          <Stat label="Stock vs Sector" value={m.sectorRank.stockVsSector} />
          <Stat label="Sector Trend" value={m.sectorRank.sectorTrend} />
          <div className={`mt-3 text-[11px] leading-relaxed rounded-xl p-3 border ${colorClasses[viewColor(m.sectorRank.clusterNote)]}`}>
            {m.sectorRank.clusterNote}
          </div>
        </Card>

        {/* 8. QUARTERLY EPS */}
        <QuarterTable
          title="Quarterly EPS Growth Trend"
          icon={<BarChart3 className="w-4 h-4" />}
          section={m.quarterlyEps}
          valueKey="epsDisplay"
          valueHead="EPS"
        />

        {/* 9. QUARTERLY SALES */}
        <QuarterTable
          title="Quarterly Sales Growth Trend"
          icon={<BarChart3 className="w-4 h-4" />}
          section={m.quarterlySales}
          valueKey="revenueDisplay"
          valueHead="Revenue"
        />

        {/* 10. FORWARD EPS / PE */}
        <Card title="Forward EPS / Forward PE" icon={<LineIcon className="w-4 h-4" />} badge={m.forwardValuation.label}>
          {m.forwardValuation.available ? (
            <>
              <Stat label="Current Price" value={m.forwardValuation.currentPrice} />
              <Stat label="Current EPS" value={m.forwardValuation.currentEps} />
              <Stat label="Current PE" value={m.forwardValuation.currentPe} />
              <Stat label="Forward EPS" value={m.forwardValuation.forwardEps} />
              <Stat label="Forward PE" value={m.forwardValuation.forwardPe} />
              <Stat label="EPS Growth Expectation" value={m.forwardValuation.epsGrowthExpectation} />
              {m.forwardValuation.projections.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {m.forwardValuation.projections.map((p: any) => (
                    <div key={p.fyLabel} className="bg-slate-50 rounded-xl p-2 text-center">
                      <div className="text-[10px] font-bold text-slate-400">{p.fyLabel}</div>
                      <div className="text-xs font-bold text-slate-800">EPS {p.projectedEpsDisplay}</div>
                      <div className="text-[11px] text-indigo-600 font-bold">PE {p.forwardPeDisplay}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Unavailable note={m.forwardValuation.note} />
          )}
        </Card>

        {/* 11. OWNERSHIP TREND */}
        <Card title="Ownership Trend" icon={<Users className="w-4 h-4" />} badge={m.ownership.label}>
          <Stat label="Institutions %" value={m.ownership.institutionsPercent} />
          <Stat label="Institutions (float) %" value={m.ownership.institutionsFloatPercent} />
          <Stat label="Insiders %" value={m.ownership.insidersPercent} />
          <Stat label="Institutions Count" value={m.ownership.institutionsCount} />
          <Stat label="Mutual Fund %" value={m.ownership.mutualFundHolding} />
          <Stat label="FII / FPI %" value={m.ownership.fiiHolding} />
          <Stat label="DII %" value={m.ownership.diiHolding} />
          <Stat label="Promoter %" value={m.ownership.promoterHolding} />
          <div className="mt-2 text-[10px] text-slate-400 italic leading-relaxed">{m.ownership.note}</div>
        </Card>

        {/* 12. FUND HOLDERS */}
        <Card title="Important Fund Holders" icon={<Building2 className="w-4 h-4" />}>
          {m.fundHolders.available ? (
            <div className="space-y-1">
              {m.fundHolders.holders.map((h: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                  <span className="font-medium text-slate-700 truncate pr-2">{h.name}</span>
                  <span className="font-bold text-slate-800 shrink-0">{h.pctHeld}</span>
                </div>
              ))}
              <div className="mt-2 text-[10px] text-slate-400 italic">{m.fundHolders.note}</div>
            </div>
          ) : (
            <Unavailable note={m.fundHolders.note} />
          )}
        </Card>

        {/* 13. QUALITY RATIOS */}
        <Card title="Quality Ratios" icon={<ShieldCheck className="w-4 h-4" />} badge={m.qualityRatios.label}>
          {Object.entries({
            ROE: m.qualityRatios.metrics.roe,
            ROCE: m.qualityRatios.metrics.roce,
            ROA: m.qualityRatios.metrics.roa,
            "Debt/Equity": m.qualityRatios.metrics.debtEquity,
            "LT Debt/Equity": m.qualityRatios.metrics.ltDebtEquity,
            "Operating Margin": m.qualityRatios.metrics.operatingMargin,
            "Net Margin": m.qualityRatios.metrics.netProfitMargin,
            "Free Cash Flow": m.qualityRatios.metrics.freeCashFlow,
            "Operating CF": m.qualityRatios.metrics.operatingCashFlow,
            "Interest Coverage": m.qualityRatios.metrics.interestCoverage,
          }).map(([k, v]) => (
            <Stat key={k} label={k} value={v} />
          ))}
          <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">{m.qualityRatios.explanation}</p>
        </Card>

        {/* 14. DILUTION */}
        <Card title="Equity Dilution Check" icon={<Split className="w-4 h-4" />} badge={m.dilution.label}>
          <Stat label="Shares Outstanding" value={m.dilution.sharesOutstanding} />
          <Stat label="Shares (Prev Year)" value={m.dilution.sharesPrevYear} />
          <Stat label="Share Count Change %" value={m.dilution.changePercent} />
          <Stat label="Net Insider Activity" value={m.dilution.netInsiderActivity} />
          <div className="mt-2 text-[10px] text-slate-400 italic leading-relaxed">{m.dilution.note}</div>
        </Card>

        {/* 15. CASH FLOW */}
        <Card title="Cash Flow Trend" icon={<Droplets className="w-4 h-4" />} badge={m.cashFlow.label}>
          {m.cashFlow.available ? (
            <>
              <Stat label="Operating Cash Flow" value={m.cashFlow.operatingCashFlow} />
              <Stat label="Free Cash Flow" value={m.cashFlow.freeCashFlow} />
              <Stat label="Cash Conversion (OCF/NI)" value={m.cashFlow.cashConversion} />
              <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">{m.cashFlow.explanation}</p>
            </>
          ) : (
            <Unavailable note="Cash flow data unavailable from current provider." />
          )}
        </Card>
      </div>

      {/* 16. SHORT-TERM SETUP (full width) */}
      <Card title="Short-Term Momentum Setup" icon={<Crosshair className="w-4 h-4" />} badge={m.shortTermSetup.label}>
        {m.shortTermSetup.available ? (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Stat label="RSI" value={m.shortTermSetup.rsi} />
              <Stat label="ADX" value={m.shortTermSetup.adx} />
              <Stat label="Volume Confirmation" value={m.shortTermSetup.volumeConfirmation} />
              <Stat label="Extension Risk" value={m.shortTermSetup.extensionRisk} />
            </div>
            <div>
              <Stat label="Key Support" value={m.shortTermSetup.levels.keySupport} />
              <Stat label="Key Resistance" value={m.shortTermSetup.levels.keyResistance} />
              <Stat label="Breakout Confirmation" value={m.shortTermSetup.levels.breakoutConfirmation} />
              <Stat label="Failure Level" value={m.shortTermSetup.levels.failureLevel} />
              <Stat label="Pullback Zone" value={m.shortTermSetup.levels.pullbackZone} />
            </div>
            <ul className="sm:col-span-2 space-y-1.5 mt-1">
              {m.shortTermSetup.notes.map((n: string, i: number) => (
                <li key={i} className="text-[11px] text-slate-600 flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                  {n}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Unavailable note="Short-term setup cannot be generated. Data insufficient." />
        )}
      </Card>

      {/* 17. MOMENTUM SCORE BREAKDOWN (full width) */}
      <Card title="Momentum Score Breakdown" icon={<Gauge className="w-4 h-4" />} badge={`${m.momentumScore.score ?? "—"} / 100`}>
        <div className="space-y-2">
          {m.momentumScore.breakdown.map((b: any) => (
            <div key={b.component} className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">{b.component}</span>
              <span className={`font-bold ${b.available ? "text-slate-800" : "text-slate-400 italic"}`}>{b.points}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-500">Data Coverage</span>
          <span className="font-bold text-indigo-600">{m.momentumScore.dataCoverage}%</span>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">{m.momentumScore.explanation}</p>
      </Card>

      {/* 20. PEER MOMENTUM (secondary) */}
      <Card title="Peer Momentum (Secondary)" icon={<Users className="w-4 h-4" />}>
        <Unavailable note={m.peerMomentum.note} />
      </Card>
    </div>
  );
}

function ListBlock({ title, items, tone }: { title: string; items?: string[]; tone: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`rounded-xl p-3 border ${colorClasses[tone] || colorClasses.slate}`}>
      <div className="text-[10px] font-black uppercase tracking-wide mb-1">{title}</div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-xs leading-snug">• {it}</li>
        ))}
      </ul>
    </div>
  );
}

function QuarterTable({
  title,
  icon,
  section,
  valueKey,
  valueHead,
}: {
  title: string;
  icon: React.ReactNode;
  section: any;
  valueKey: string;
  valueHead: string;
}) {
  if (!section.available) {
    return (
      <Card title={title} icon={icon} badge="Data Unavailable">
        <Unavailable note={section.note} />
      </Card>
    );
  }
  const chartData = section.quarters.map((q: any) => ({
    name: String(q.quarter).slice(2),
    growth: q.qoqRaw ?? 0,
  }));
  return (
    <Card title={title} icon={icon} badge={section.trendLabel}>
      <div className="h-24 mb-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} />
            <RechartsTooltip formatter={(v: any) => `${Number(v).toFixed(1)}% QoQ`} />
            <Bar dataKey="growth" radius={[3, 3, 0, 0]}>
              {chartData.map((d: any, i: number) => (
                <Cell key={i} fill={d.growth >= 0 ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-slate-400 text-left">
              <th className="font-bold py-1">Quarter</th>
              <th className="font-bold py-1 text-right">{valueHead}</th>
              <th className="font-bold py-1 text-right">QoQ</th>
              <th className="font-bold py-1 text-right">YoY</th>
            </tr>
          </thead>
          <tbody>
            {section.quarters.map((q: any, i: number) => (
              <tr key={i} className="border-t border-slate-50">
                <td className="py-1 font-medium text-slate-600">{q.quarter}</td>
                <td className="py-1 text-right font-bold text-slate-800">{q[valueKey]}</td>
                <td className={`py-1 text-right font-bold ${String(q.qoq).startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>{q.qoq}</td>
                <td className={`py-1 text-right font-bold ${q.yoy === UNAVAILABLE ? "text-slate-400" : String(q.yoy).startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>{q.yoy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {section.note && <div className="mt-2 text-[10px] text-slate-400 italic">{section.note}</div>}
    </Card>
  );
}

// ============ helpers for the 15-day watch ============
function tradingDaysSince(iso: string): number {
  if (!iso) return 0;
  const start = new Date(iso).getTime();
  const now = Date.now();
  const calDays = Math.max(0, (now - start) / (1000 * 60 * 60 * 24));
  return Math.floor((calDays * 5) / 7); // approx trading days
}
function watchStatusLabel(watch: any): string {
  const d = tradingDaysSince(watch.startDate);
  return d >= 15 ? "Review complete" : `Day ${d} of 15`;
}
function num(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function Delta({ base, cur, suffix = "", invert = false }: { base: any; cur: any; suffix?: string; invert?: boolean }) {
  const b = num(base);
  const c = num(cur);
  if (b === null || c === null) return <span className="text-slate-400 italic text-xs">n/a</span>;
  const diff = c - b;
  const up = diff > 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = diff === 0 ? "text-slate-400" : good ? "text-emerald-600" : "text-rose-600";
  return (
    <span className={`text-xs font-bold inline-flex items-center gap-1 ${color}`}>
      {diff !== 0 && <Icon className="w-3 h-3" />}
      {diff > 0 ? "+" : ""}{diff.toFixed(2)}{suffix}
    </span>
  );
}

// ============ PHASE 2 — MOMENTUM GRAPHS ============
function MomentumGraphs({ m }: { m: any }) {
  const pts: any[] = m?.series?.points || [];
  const ps = m?.priceStrength;
  const ce = m?.candleExtras || {};
  const tick = { fontSize: 9, fill: "#94a3b8" };

  // Price strength returns bar data
  const psData = ps
    ? [
        { name: "1W", v: num(ps.returns?.["1W"]) },
        { name: "1M", v: num(ps.returns?.["1M"]) },
        { name: "3M", v: num(ps.returns?.["3M"]) },
        { name: "6M", v: num(ps.returns?.["6M"]) },
        { name: "1Y", v: num(ps.returns?.["1Y"]) },
        { name: "vs Sec", v: num(ps.vsSector) },
        { name: "vs Idx", v: num(ps.vsIndex) },
      ].filter((d) => d.v !== null)
    : [];

  // Extension data
  const extData = [
    { name: "10MA", v: num(pts[pts.length - 1]?.distMa10) },
    { name: "20MA", v: num(pts[pts.length - 1]?.distMa20) },
    { name: "10d", v: num(ce.runUp10) },
    { name: "15d", v: num(ce.runUp15) },
    { name: "20d", v: num(ce.runUp20) },
  ].filter((d) => d.v !== null);

  return (
    <div className="space-y-5">
      {/* Momentum Trend graph */}
      <Card title="Momentum Trend Graph" icon={<Activity className="w-4 h-4" />} badge={m?.snapshot?.finalMomentumView}>
        {pts.length > 5 ? (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={pts} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={tick} minTickGap={40} />
                  <YAxis yAxisId="price" tick={tick} domain={["auto", "auto"]} width={44} />
                  <YAxis yAxisId="mom" orientation="right" tick={tick} domain={[0, 100]} width={28} />
                  <RechartsTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Area yAxisId="price" type="monotone" dataKey="close" name="Close" stroke="#6366f1" fill="#eef2ff" strokeWidth={2} dot={false} />
                  <Line yAxisId="price" type="monotone" dataKey="ma10" name="10 MA" stroke="#10b981" dot={false} strokeWidth={1} />
                  <Line yAxisId="price" type="monotone" dataKey="ma20" name="20 MA" stroke="#f59e0b" dot={false} strokeWidth={1} />
                  <Line yAxisId="mom" type="monotone" dataKey="momentum" name="Momentum" stroke="#ec4899" dot={false} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="h-16 mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={pts} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <RechartsTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: any) => [Number(v).toLocaleString(), "Volume"]} />
                  <Bar dataKey="volume" name="Volume" radius={[2, 2, 0, 0]}>
                    {pts.map((p, i) => (
                      <Cell key={i} fill={p.volAvg && p.volume > p.volAvg ? "#818cf8" : "#cbd5e1"} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Pink = momentum score (right axis, 0–100). Bars = volume (indigo when above 20-period average).</p>
          </>
        ) : (
          <Unavailable note="Not enough historical candles to plot the momentum trend." />
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Price Strength graph */}
        <Card title="Price Strength Graph" icon={<TrendingUp className="w-4 h-4" />} badge={ps?.rating}>
          {psData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={psData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={tick} interval={0} />
                  <YAxis tick={tick} />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <RechartsTooltip formatter={(v: any) => `${Number(v).toFixed(2)}%`} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                    {psData.map((d, i) => (
                      <Cell key={i} fill={(d.v as number) >= 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Unavailable note="Return data insufficient to plot price strength." />
          )}
          {ps && (ps.vsSectorDisplay === UNAVAILABLE || ps.vsIndexDisplay === UNAVAILABLE) && (
            <div className="mt-2 text-[10px] text-amber-600">Sector/index comparison unavailable from current provider.</div>
          )}
        </Card>

        {/* Buyer Demand graph */}
        <Card title="Buyer Demand Graph" icon={<Users className="w-4 h-4" />} badge={m?.buyerDemand?.rating}>
          {pts.length > 5 ? (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={pts.slice(-30)} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={tick} minTickGap={30} />
                    <YAxis tick={tick} />
                    <RechartsTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="volume" name="Volume" radius={[2, 2, 0, 0]}>
                      {pts.slice(-30).map((p, i) => (
                        <Cell key={i} fill={p.volAvg && p.volume > p.volAvg ? "#6366f1" : "#cbd5e1"} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="volAvg" name="20-avg" stroke="#f59e0b" dot={false} strokeWidth={1.5} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-x-4 mt-1">
                <Stat label="Up/Down Vol Ratio" value={m.buyerDemand.metrics?.upDownVolumeRatio} />
                <Stat label="Relative Volume" value={m.buyerDemand.metrics?.relativeVolume} />
                <Stat label="Accumulation Days" value={m.buyerDemand.metrics?.accumulationDays} />
                <Stat label="Distribution Days" value={m.buyerDemand.metrics?.distributionDays} />
              </div>
            </>
          ) : (
            <Unavailable note="Volume history insufficient to plot buyer demand." />
          )}
        </Card>

        {/* RSI / ADX graph */}
        <Card title="RSI / ADX Momentum Graph" icon={<LineIcon className="w-4 h-4" />}>
          {pts.length > 5 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={pts} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={tick} minTickGap={40} />
                  <YAxis tick={tick} domain={[0, 100]} />
                  <ReferenceArea y1={70} y2={100} fill="#fee2e2" fillOpacity={0.5} />
                  <ReferenceArea y1={0} y2={30} fill="#dcfce7" fillOpacity={0.5} />
                  <ReferenceLine y={25} stroke="#94a3b8" strokeDasharray="2 2" />
                  <RechartsTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="rsi" name="RSI" stroke="#6366f1" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="adx" name="ADX" stroke="#0ea5e9" dot={false} strokeWidth={1.5} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Unavailable note="Not enough candles to plot RSI/ADX." />
          )}
          <p className="text-[10px] text-slate-400 mt-1">Red zone = overbought (RSI&gt;70), green = oversold (&lt;30). ADX dashed line at 25 = trend strength threshold.</p>
        </Card>

        {/* Extension Risk graph */}
        <Card title="Extension Risk Graph" icon={<Crosshair className="w-4 h-4" />} badge={m?.snapshot?.extensionRisk}>
          {extData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={extData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={tick} interval={0} />
                  <YAxis tick={tick} />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <RechartsTooltip formatter={(v: any) => `${Number(v).toFixed(2)}%`} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                    {extData.map((d, i) => (
                      <Cell key={i} fill={(d.v as number) > 12 ? "#ef4444" : (d.v as number) > 6 ? "#f59e0b" : "#10b981"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Unavailable note="Distance-from-MA / run-up data insufficient." />
          )}
          <p className="text-[10px] text-slate-400 mt-1">Distance from 10/20 MA and run-up over last 10/15/20 sessions. Amber/red = stretched.</p>
        </Card>
      </div>
    </div>
  );
}

// ============ PHASE 6 — DATA COVERAGE CARD ============
function DataCoverageCard({ coverage }: { coverage: any }) {
  if (!coverage) return null;
  const rows = [
    ["Price Data", coverage.price],
    ["Technical Data", coverage.technical],
    ["Financial Data", coverage.financial],
    ["Ownership Data", coverage.ownership],
    ["News Data", coverage.news],
  ] as [string, any][];
  return (
    <Card title="Data Coverage" icon={<Database className="w-4 h-4" />}>
      <div className="space-y-3">
        {rows.map(([label, c]) => (
          <div key={label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-slate-600">{label}</span>
              <span className={`font-bold ${c.pct >= 80 ? "text-emerald-600" : c.pct >= 50 ? "text-sky-600" : c.pct > 0 ? "text-amber-600" : "text-slate-400"}`}>
                {c.pct}% · {c.label}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${c.pct >= 80 ? "bg-emerald-500" : c.pct >= 50 ? "bg-sky-500" : c.pct > 0 ? "bg-amber-500" : "bg-slate-300"}`}
                style={{ width: `${Math.max(2, c.pct)}%` }}
              />
            </div>
            {c.reasons?.length > 0 && (
              <div className="mt-1 text-[10px] text-slate-400">{c.reasons.join(" ")}</div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-slate-400 italic">
        Price &amp; technical values are computed from candle data where possible — only genuinely provider-dependent fields (financials, ownership, news) show as unavailable.
      </p>
    </Card>
  );
}

// ============ PHASE 4 — SCENARIO ENGINE ============
function ScenarioEngine({ scenarios }: { scenarios: any }) {
  if (!scenarios) return null;
  if (!scenarios.available) {
    return (
      <Card title="Next 15-Day Momentum Scenarios" icon={<Eye className="w-4 h-4" />}>
        <Unavailable note={scenarios.note} />
      </Card>
    );
  }
  const statusColor: Record<string, string> = {
    Confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Watching: "bg-amber-50 text-amber-700 border-amber-200",
    "Not Confirmed": "bg-slate-50 text-slate-500 border-slate-200",
  };
  return (
    <Card title="Next 15-Day Momentum Scenarios" icon={<Eye className="w-4 h-4" />}>
      <p className="text-[11px] text-slate-400 mb-3 -mt-2">Conditional scenarios — not predictions. Status reflects how many conditions are currently met.</p>
      <div className="grid md:grid-cols-3 gap-3">
        {scenarios.scenarios.map((s: any) => (
          <div key={s.key} className="rounded-xl border border-slate-200 p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-black text-slate-800">{s.title}</h4>
            </div>
            <span className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-md border mb-2 ${statusColor[s.status] || statusColor["Not Confirmed"]}`}>
              {s.status}
            </span>
            <div className="space-y-1.5 text-[11px] text-slate-600 flex-1">
              <div><span className="font-bold text-slate-400">Trigger:</span> {s.triggerLevel}</div>
              <div><span className="font-bold text-slate-400">Confirm:</span> {s.confirmationSignal}</div>
              <div><span className="font-bold text-slate-400">Risk:</span> {s.riskSignal}</div>
              <div><span className="font-bold text-slate-400">Monitor:</span> {s.whatToMonitor}</div>
            </div>
            <p className="mt-2 text-[11px] font-medium text-indigo-700 bg-indigo-50 rounded-lg p-2">{s.output}</p>
          </div>
        ))}
      </div>
      {scenarios.note && <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2 border border-amber-100">{scenarios.note}</div>}
    </Card>
  );
}

// ============ PHASE 3 — 15-DAY MOMENTUM WATCH ============
function FifteenDayWatch({ m, watch, whatChanged, wcLoading, onStart, onReset, onExport, onWhatChanged, tradingDays }: any) {
  const cur = m?.baseline;
  const snap = m?.snapshot;
  return (
    <Card title="15-Day Momentum Watch" icon={<CalendarClock className="w-4 h-4" />} badge={watch ? watchStatusLabel(watch) : "Not started"}>
      <p className="text-[11px] text-slate-400 -mt-2 mb-3">
        Not a prediction. A plan for what to monitor over the next {tradingDays} trading days.
      </p>

      {!watch ? (
        <div className="text-center py-6">
          <p className="text-sm text-slate-500 mb-4">Save a baseline snapshot to start tracking how momentum evolves.</p>
          <button onClick={onStart} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold inline-flex items-center gap-2 hover:bg-indigo-700">
            <Play className="w-4 h-4" /> Start 15-Day Momentum Watch
          </button>
        </div>
      ) : (
        <>
          {(() => {
            const d = tradingDaysSince(watch.startDate);
            const progress = Math.min(100, (d / 15) * 100);
            return (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-600">{d >= 15 ? "15-day review complete" : `Day ${d} of 15-day watch`}</span>
                  <span className="text-slate-400">Started {new Date(watch.startDate).toLocaleDateString()}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.max(3, progress)}%` }} />
                </div>
                {/* milestone markers */}
                <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                  <span>Day 0</span><span>Day 5</span><span>Day 10</span><span>Day 15</span>
                </div>
              </div>
            );
          })()}

          {/* Baseline vs current comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="py-1 font-bold">Metric</th>
                  <th className="py-1 font-bold text-right">Start</th>
                  <th className="py-1 font-bold text-right">Now</th>
                  <th className="py-1 font-bold text-right">Change</th>
                </tr>
              </thead>
              <tbody>
                <WatchRow label="Price" base={watch.startPrice} cur={cur?.startPrice} fix={2} />
                <WatchRow label="Momentum Score" base={watch.momentumScore} cur={snap?.momentumScore} fix={0} />
                <WatchRow label="RSI" base={watch.rsi} cur={cur?.rsi} fix={0} />
                <WatchRow label="ADX" base={watch.adx} cur={cur?.adx} fix={0} />
                <WatchRow label="Relative Volume" base={parseFloat(watch.relativeVolume)} cur={parseFloat(cur?.relativeVolume)} fix={2} suffix="x" />
              </tbody>
            </table>
          </div>

          {/* What changed (computed, non-AI) */}
          <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-2">What changed since tracking started</div>
            <ul className="space-y-1 text-[11px] text-slate-600">
              <li>• Trend: {watch.trend || "n/a"} → <span className="font-bold">{cur?.trend || "n/a"}</span></li>
              <li>• Sector: {watch.sectorStrength} → <span className="font-bold">{cur?.sectorStrength}</span></li>
              <li>• Extension risk: {watch.extensionRisk || "n/a"} → <span className="font-bold">{cur?.extensionRisk || "n/a"}</span></li>
              <li>• News: {watch.newsSentiment} → <span className="font-bold">{cur?.newsSentiment}</span></li>
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={onWhatChanged} disabled={wcLoading} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50">
              {wcLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCompare className="w-3.5 h-3.5" />}
              Analyze What Changed
            </button>
            <button onClick={onExport} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 hover:bg-slate-50">
              <Download className="w-3.5 h-3.5" /> Export 15-Day Watch Report
            </button>
            <button onClick={onReset} className="px-3 py-1.5 bg-white border border-rose-200 text-rose-600 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 hover:bg-rose-50">
              <RotateCcw className="w-3.5 h-3.5" /> Reset 15-Day Watch
            </button>
          </div>

          {/* AI What Changed result */}
          {whatChanged && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              {whatChanged.error ? (
                <Unavailable note={whatChanged.error} />
              ) : (
                <div className="space-y-2 text-xs text-slate-700">
                  <p className="font-medium">{whatChanged.changeSummary}</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {[
                      ["Price", whatChanged.priceChange],
                      ["Momentum Score", whatChanged.momentumScoreChange],
                      ["RSI", whatChanged.rsiChange],
                      ["ADX", whatChanged.adxChange],
                      ["Volume", whatChanged.volumeChange],
                      ["Support/Resistance", whatChanged.supportResistanceChange],
                      ["News Impact", whatChanged.newsImpact],
                    ].filter(([, v]) => v).map(([t, v]) => (
                      <div key={t as string} className="bg-slate-50 rounded-lg p-2">
                        <span className="text-[10px] font-black uppercase text-slate-400">{t}</span>
                        <div className="text-[11px]">{v as string}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {whatChanged.setupImproved && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Setup improved</span>}
                    {whatChanged.setupWeakened && <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold inline-flex items-center gap-1"><XCircle className="w-3 h-3" />Setup weakened</span>}
                  </div>
                  {whatChanged.finalWatchView && (
                    <div className="bg-indigo-50 rounded-lg p-2 text-[11px] font-semibold text-indigo-800">{whatChanged.finalWatchView}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function WatchRow({ label, base, cur, fix, suffix = "" }: { label: string; base: any; cur: any; fix: number; suffix?: string }) {
  const b = num(base);
  const c = num(cur);
  return (
    <tr className="border-t border-slate-50">
      <td className="py-1 font-medium text-slate-600">{label}</td>
      <td className="py-1 text-right text-slate-500">{b === null ? "n/a" : b.toFixed(fix) + suffix}</td>
      <td className="py-1 text-right font-bold text-slate-800">{c === null ? "n/a" : c.toFixed(fix) + suffix}</td>
      <td className="py-1 text-right"><Delta base={base} cur={cur} suffix={suffix} /></td>
    </tr>
  );
}
