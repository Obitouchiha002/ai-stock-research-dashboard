/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  TrendingUp,
  AlertTriangle,
  Loader2,
  CandlestickChart,
  Printer,
  Activity,
  ShieldAlert,
  Settings,
  ChevronRight,
  X,
  Clock,
  RefreshCw,
  BarChart2,
  FileText,
  Eye,
  Zap,
  Save,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  ExternalLink,
  Target,
  PieChart,
  CheckCircle2,
  ChevronDown,
  Download,
  Bookmark,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  LineChart,
  Line,
  CartesianGrid,
  ComposedChart,
  Bar,
  ReferenceLine,
  ReferenceArea,
  Label,
  Legend,
} from "recharts";
import { motion, AnimatePresence } from "motion/react";

import {
  saveToWatchlist,
  saveReport,
  addNotification,
  saveRecentSearch,
  getRecentSearches,
  isInWatchlist,
  saveAlert,
  getLastAnalysis,
  saveLastAnalysis,
  getLastAnalysisTab,
  saveLastAnalysisTab,
  logAiUsageDetailed,
} from "@/lib/storage";
import jsPDF from "jspdf";
import MomentumTab from "@/components/MomentumTab";
import EvaluationTab from "@/components/EvaluationTab";
import AnalyticsTab from "@/components/AnalyticsTab";
import ResearchNoteTab from "@/components/ResearchNoteTab";
import StockNotes from "@/components/StockNotes";
import { useGlobal } from "@/context/GlobalContext";
import { toJpeg } from "html-to-image";

// Chart indicator side panel: grouped so the long chip row becomes scannable.
// Each swatch colour matches the line actually drawn on the chart.
const CHART_TOGGLE_META: Record<string, { label: string; color: string }> = {
  ma10: { label: "MA 10", color: "bg-sky-500" },
  ma20: { label: "MA 20", color: "bg-amber-500" },
  ma50: { label: "MA 50", color: "bg-violet-500" },
  ma200: { label: "MA 200", color: "bg-red-600" },
  rsi: { label: "RSI (14)", color: "bg-violet-600" },
  adx: { label: "ADX + DI", color: "bg-indigo-600" },
  rs: { label: "Price Strength", color: "bg-teal-600" },
  volume: { label: "Volume", color: "bg-slate-400" },
  supportRes: { label: "S/R Zones", color: "bg-emerald-500" },
  patterns: { label: "Patterns", color: "bg-pink-500" },
};
const CHART_TOGGLE_GROUPS = [
  { label: "Moving Averages", keys: ["ma10", "ma20", "ma50", "ma200"] },
  { label: "Indicators", keys: ["rsi", "adx", "rs"] },
  { label: "Overlays", keys: ["volume", "supportRes", "patterns"] },
];

/**
 * Rich hover card for the price chart. Recharts' default tooltip dumps the raw
 * `candle: [low, high]` array and lists series awkwardly; this reads the full
 * datum and shows OHLC, volume, every enabled moving average and price-strength
 * — each with its own colour — so a hover explains the whole bar.
 */
const MA_ROWS: { key: string; ekey: string; label: string; color: string }[] = [
  { key: "sma10", ekey: "ema10", label: "MA 10", color: "#0ea5e9" },
  { key: "sma20", ekey: "ema20", label: "MA 20", color: "#f59e0b" },
  { key: "sma50", ekey: "ema50", label: "MA 50", color: "#8b5cf6" },
  { key: "sma200", ekey: "ema200", label: "MA 200", color: "#dc2626" },
];

function PriceChartTooltip({ active, payload, maType }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const fmt = (n: any, dp = 2) =>
    n == null || !Number.isFinite(Number(n))
      ? "—"
      : Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const up = d.close >= d.open;
  const ema = maType === "EMA";
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 backdrop-blur shadow-lg px-2.5 py-2 text-[11px] leading-tight pointer-events-none">
      <div className="font-black text-slate-500 mb-1">{String(d.date || "").slice(0, 16)}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span className="text-slate-400 font-bold">Open</span><span className="text-right font-black text-slate-800">{fmt(d.open)}</span>
        <span className="text-slate-400 font-bold">High</span><span className="text-right font-black text-slate-800">{fmt(d.high)}</span>
        <span className="text-slate-400 font-bold">Low</span><span className="text-right font-black text-slate-800">{fmt(d.low)}</span>
        <span className="text-slate-400 font-bold">Close</span>
        <span className={`text-right font-black ${up ? "text-emerald-600" : "text-rose-600"}`}>{fmt(d.close)}</span>
        {d.volume != null && (
          <>
            <span className="text-slate-400 font-bold">Vol</span>
            <span className="text-right font-black text-slate-800">{Number(d.volume).toLocaleString()}</span>
          </>
        )}
      </div>
      {(() => {
        const shown = MA_ROWS.filter((r) => d[ema ? r.ekey : r.key] != null);
        const hasRs = d.rsLine != null;
        if (!shown.length && !hasRs) return null;
        return (
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 space-y-0.5">
            {shown.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 font-bold text-slate-500">
                  <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                  {r.label}
                </span>
                <span className="font-black text-slate-800 tabular-nums">{fmt(d[ema ? r.ekey : r.key])}</span>
              </div>
            ))}
            {hasRs && (
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 font-bold text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-teal-600" />
                  Price Strength
                </span>
                <span className="font-black text-slate-800 tabular-nums">{fmt(d.rsLine, 1)}</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

const CustomCandlestick = (props: any) => {
  const { x, y, width, height, payload } = props;
  const isGrowing = payload.close >= payload.open;
  const color = isGrowing ? "#10b981" : "#ef4444";

  // payload contains { open, high, low, close }
  // We need to map y-values. Since we can't easily get the YAxis scale inside the pure shape without more context,
  // we can use a trick: pass max/min domain, OR better yet:
  // Let recharts handle the YAxis, and we construct an errorBar-like structure.
  // Actually, setting up Y scale inside custom shape requires access to `yAxis`.
  // Recharts passes `y` and `height` based on the dataKey.
  // If we use dataKey="candle" where candle = [low, high], then `y` is top (high) and `height` is high-low.
  // We don't have direct mapping for open/close easily unless we do `[low, high]` and use payload values to calculate ratios.

  const highEnd = y;
  const totalHeight = height;
  const range = payload.high - payload.low;

  if (range === 0) return null;

  const openRatio = (payload.high - payload.open) / range;
  const closeRatio = (payload.high - payload.close) / range;

  const bodyTop = highEnd + Math.min(openRatio, closeRatio) * totalHeight;
  const bodyHeight = Math.abs(openRatio - closeRatio) * totalHeight || 1; // min 1px

  const midX = x + width / 2;

  return (
    <g>
      {/* Wick */}
      <line
        x1={midX}
        y1={highEnd}
        x2={midX}
        y2={highEnd + totalHeight}
        stroke={color}
        strokeWidth={1}
      />
      {/* Body */}
      <rect
        x={x}
        y={bodyTop}
        width={width}
        height={bodyHeight}
        fill={color}
        stroke={color}
      />
    </g>
  );
};

function AnalyzeContent() {
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") || "";
  const initialTab = searchParams.get("tab") || "";

  // Workspace controls
  const [query, setQuery] = useState(initialSymbol);
  // Market is shared with the global top-bar selector (US / NSE / BSE).
  const { market, setMarket } = useGlobal();
  const [timeframe, setTimeframe] = useState("1Y");
  const [depth, setDepth] = useState("Standard");
  const [profile, setProfile] = useState("Short-term Investor");
  const [riskTolerance, setRiskTolerance] = useState("Moderate");
  const [includeNews, setIncludeNews] = useState(true);
  const [includeAI, setIncludeAI] = useState(true);
  // True while the AI write-up is still being fetched after the data has painted.
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState("");
  const [autoSave, setAutoSave] = useState(false);

  // Data states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<any | null>(null);
  const [suggestions, setSuggestions] = useState<
    Array<{ symbol: string; name: string }>
  >([]);

  // UI states
  const [activeTab, setActiveTab] = useState("chart");
  // Trimmed set: Chart is the landing tab; the rest sit behind "More".
  // (Overview, Valuation, Risk, Top-down, Scorecard, Fundamentals removed.)
  const [moreTabOpen, setMoreTabOpen] = useState(false);
  const TAB_LABELS: Record<string, string> = {
    chart: "Chart", technical: "Technical",
    news: "News", "ai-report": "AI Report", evaluation: "Evaluation", research: "Research", notes: "Notes",
  };
  const PRIMARY_TABS = ["chart", "technical"];
  const MORE_TABS = ["news", "ai-report", "evaluation", "research", "notes"];
  const ALL_TABS = [...PRIMARY_TABS, ...MORE_TABS];
  // A saved/URL tab that no longer exists (e.g. the removed "overview") falls
  // back to Chart so the page never lands on a blank tab.
  const okTab = (t: string) => (ALL_TABS.includes(t) ? t : "chart");
  const [chartType, setChartType] = useState("Area");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  // Momentum module: captured when the Momentum tab loads, reused in the PDF.
  const [momentumData, setMomentumData] = useState<any | null>(null);

  // Chart UI states
  const [chartTimeframe, setChartTimeframe] = useState<
    "hourly" | "daily" | "weekly"
  >("daily");
  const [chartMaType, setChartMaType] = useState<"SMA" | "EMA">("SMA");
  const [chartToggles, setChartToggles] = useState({
    ma10: false,
    ma20: true,
    ma50: true,
    ma200: true,
    rsi: false,
    adx: false,
    rs: false,
    volume: true,
    supportRes: true,
    patterns: true,
  });
  // Relative strength vs the stock's home benchmark (S&P 500 / Nifty 500)
  const [rsData, setRsData] = useState<any | null>(null);
  const [rsLoading, setRsLoading] = useState(false);
  const [rsPeers, setRsPeers] = useState<string[]>([]);
  const [rsPeerInput, setRsPeerInput] = useState("");
  const [rsRange, setRsRange] = useState<"3mo" | "6mo" | "1y" | "2y">("1y");
  const [rsMode, setRsMode] = useState<"price" | "ratio">("price");
  const [rsError, setRsError] = useState("");
  // Candlestick patterns detected across recent history
  const [patData, setPatData] = useState<any | null>(null);
  const [patInterval, setPatInterval] = useState<"1d" | "1wk">("1d");
  // AI "complete report" generated from the candle/pattern + level + chart data.
  const [patReport, setPatReport] = useState<string>("");
  const [patReportLoading, setPatReportLoading] = useState(false);
  const [patReportErr, setPatReportErr] = useState("");
  const [reportMode, setReportMode] = useState<"simple" | "detailed">("simple");

  // Build an AI chart report from the candle/pattern + level + chart-intelligence
  // data already loaded. "simple" is a short plain-language read (the default);
  // "detailed" is the full breakdown. Research only — the prompt forbids advice.
  const genPatReport = async (mode: "simple" | "detailed" = reportMode) => {
    const tkr = data?.stock?.ticker;
    if (!tkr) return;
    setPatReportLoading(true);
    setPatReportErr("");
    setPatReport("");
    try {
      const ci = data?.chartIntelligence?.[chartTimeframe] || null;
      const ctx = {
        symbol: tkr,
        name: data?.stock?.name,
        price: data?.stock?.currentPrice,
        interval: patInterval,
        candle: patData?.today || null,
        window: patData?.last30 || null,
        patterns: patData?.today?.patterns || [],
        baseRates: patData?.today?.baseRates || [],
        chart: ci ? { trend: ci.trend, setup: ci.setup, patterns: ci.patterns } : null,
        levels: lvlData?.ok ? { supports: lvlData.supports, resistances: lvlData.resistances, pivot: lvlData.pivot } : null,
      };
      const simplePrompt = `You are explaining ${tkr}'s chart to a normal investor in PLAIN, simple English (no jargon). Using ONLY the data below, write a SHORT read — about 90-120 words total:\n• One line: what the main candle/chart pattern right now is, and in simple words what it usually means.\n• One line: the trend (up / down / sideways) in plain words.\n• One line: the nearest support price below and nearest resistance price above (with the numbers).\n• One line: what to simply watch next.\nKeep it friendly and short. Use • bullets, no headings, no tables. Research/education ONLY — NO buy/sell advice, NO recommendations, NO price predictions.\n\nDATA:\n${JSON.stringify(ctx)}`;
      const detailedPrompt = `You are a technical analyst. Write a COMPLETE, factual chart report for ${tkr} using ONLY the data below. Cover, with clear short markdown headings: (1) Current candle & recent window, (2) Classical chart patterns present and how they historically resolved on THIS stock (use the base rates with their win-rate / average move), (3) Trend & structure, (4) Key support/resistance levels, (5) What to watch next. Be specific with the actual numbers. This is research/education ONLY — do NOT give buy/sell advice, recommendations, or price predictions; describe factually.\n\nDATA:\n${JSON.stringify(ctx)}`;
      const prompt = mode === "detailed" ? detailedPrompt : simplePrompt;
      const res = await fetch("/api/gemini/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "Failed to generate report.");
      setPatReport(j.text || "No report generated.");
      logAiUsageDetailed("Chart AI Report", j.usage ?? { tokens: j.aiTokens });
    } catch (e: any) {
      setPatReportErr(e?.message || "Could not generate report right now.");
    } finally {
      setPatReportLoading(false);
    }
  };
  const [patView, setPatView] = useState<"today" | "window" | "chart" | "history">("today");
  // Technical tab is huge — show one section at a time as a card, no long scroll.
  const [techView, setTechView] = useState<"indicators" | "levels" | "strength" | "candle">("indicators");
  const [patLoading, setPatLoading] = useState(false);
  // Pivot-based support & resistance levels
  const [lvlData, setLvlData] = useState<any | null>(null);
  const [lvlLoading, setLvlLoading] = useState(false);

  // Chart zoom (data window) + fullscreen
  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const [zoomWin, setZoomWin] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [isChartFs, setIsChartFs] = useState(false);

  // Reset zoom when timeframe or analyzed stock changes
  React.useEffect(() => {
    setZoomWin(null);
  }, [chartTimeframe, data?.stock?.ticker]);

  // Track fullscreen state (Escape / browser exit)
  React.useEffect(() => {
    const onFs = () =>
      setIsChartFs(
        !!document.fullscreenElement &&
          document.fullscreenElement === chartContainerRef.current,
      );
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /**
   * Candles for the current timeframe, with the relative-strength series
   * stitched on by date when the RS overlay is switched on.
   *
   * RS is computed on daily closes, so on the hourly timeframe every bar of a
   * given day carries that day's RS value — the line is a daily step, not a
   * fabricated intraday reading.
   */
  const allCandles = React.useMemo(() => {
    const candles: any[] = data?.chartIntelligence?.[chartTimeframe]?.candles || [];
    if (!chartToggles.rs || !rsData?.series?.length || !candles.length) return candles;

    const rsMap = new Map<string, any>();
    for (const r of rsData.series) rsMap.set(r.date, r);
    const peers: string[] = rsData.peers || [];

    return candles.map((c: any) => {
      const row = rsMap.get(String(c.date).slice(0, 10));
      if (!row) return c;
      const merged: any = { ...c, rsLine: row.rsSmooth ?? row.rs };
      for (const p of peers) merged[`rsLine_${p}`] = row[`rsSmooth_${p}`] ?? row[`rs_${p}`];
      return merged;
    });
  }, [data?.chartIntelligence, chartTimeframe, chartToggles.rs, rsData]);

  const getAllCandles = (): any[] => allCandles;
  const getVisibleCandles = (): any[] => {
    const all = getAllCandles();
    if (!zoomWin) return all;
    return all.slice(zoomWin.start, zoomWin.end);
  };
  // Apply a zoom factor (<1 = in, >1 = out) anchored at ratio (0..1) across the window.
  const applyZoom = (factor: number, anchorRatio = 0.5) => {
    const all = getAllCandles();
    const len = all.length;
    if (len < 10) return;
    const cur = zoomWin || { start: 0, end: len };
    const curCount = cur.end - cur.start;
    const minCount = Math.min(20, len);
    let newCount = Math.round(curCount * factor);
    newCount = Math.max(minCount, Math.min(len, newCount));
    if (newCount >= len) {
      setZoomWin(null);
      return;
    }
    const anchorIdx = cur.start + anchorRatio * curCount;
    let start = Math.round(anchorIdx - anchorRatio * newCount);
    start = Math.max(0, Math.min(len - newCount, start));
    setZoomWin({ start, end: start + newCount });
  };
  // Native (non-passive) wheel listener so preventDefault works for zoom gestures.
  React.useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      applyZoom(e.deltaY < 0 ? 0.8 : 1.25, ratio);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTimeframe, data, zoomWin, activeTab]);

  const toggleChartFullscreen = async () => {
    const el = chartContainerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // Fullscreen API may be blocked (e.g. some mobile browsers) — ignore.
    }
  };

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerData, setDrawerData] = useState<any>(null);

  useEffect(() => {
    const cached = getLastAnalysis();
    if (initialSymbol) {
      // Coming in with a symbol: if the cache already holds it, restore
      // instantly; otherwise run a fresh analysis.
      if (cached?.data && cached.query?.toUpperCase() === initialSymbol.toUpperCase()) {
        setQuery(cached.query);
        setData(cached.data);
        setActiveTab(okTab(initialTab || getLastAnalysisTab()));
      } else {
        setQuery(initialSymbol);
        if (initialTab) setActiveTab(okTab(initialTab));
        handleAnalyzeQuery(initialSymbol);
      }
    } else if (cached?.data) {
      // No symbol in the URL (e.g. opened from the sidebar): restore the last
      // analysis so nothing has to be redone.
      setQuery(cached.query || "");
      setData(cached.data);
      setActiveTab(okTab(getLastAnalysisTab()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSymbol]);

  // Remember which tab is open so returning lands on the same one.
  useEffect(() => {
    if (data) saveLastAnalysisTab(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Relative strength: load once the toggle is on (and whenever the stock changes).
  useEffect(() => {
    const ticker = data?.stock?.ticker;
    // needed by the chart's RS panel and by the Technical tab section
    if ((!chartToggles.rs && activeTab !== "technical") || !ticker) return;
    let cancelled = false;
    setRsLoading(true);
    setRsError("");
    fetch("/api/relative-strength", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: ticker, range: rsRange, peers: rsPeers }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.error) setRsError(j.error);
        else setRsData(j);
      })
      .catch((e) => { if (!cancelled) setRsError(String(e?.message || e)); })
      .finally(() => { if (!cancelled) setRsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartToggles.rs, activeTab, data?.stock?.ticker, rsRange, rsPeers]);

  // Comparison legs are dropped when the analysed stock changes — peers picked
  // for one company are meaningless against another.
  useEffect(() => {
    setRsPeers([]);
    setRsPeerInput("");
  }, [data?.stock?.ticker]);

  // Candlestick patterns: load when the Technical tab is opened.
  useEffect(() => {
    const ticker = data?.stock?.ticker;
    if (activeTab !== "technical" || !ticker) return;
    if (patData?.symbol === ticker && patData?.interval === patInterval) return;
    let cancelled = false;
    setPatLoading(true);
    fetch("/api/patterns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: ticker, interval: patInterval }),
    })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setPatData(j.error ? { ok: false, reason: j.error } : j); })
      .catch((e) => { if (!cancelled) setPatData({ ok: false, reason: String(e?.message || e) }); })
      .finally(() => { if (!cancelled) setPatLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, data?.stock?.ticker, patInterval]);

  // Support & resistance levels: load when the Technical tab is opened.
  useEffect(() => {
    const ticker = data?.stock?.ticker;
    if (activeTab !== "technical" || !ticker) return;
    if (lvlData?.symbol === ticker) return;
    let cancelled = false;
    setLvlLoading(true);
    fetch("/api/levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: ticker }),
    })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setLvlData(j.error ? { ok: false, reason: j.error } : j); })
      .catch((e) => { if (!cancelled) setLvlData({ ok: false, reason: String(e?.message || e) }); })
      .finally(() => { if (!cancelled) setLvlLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, data?.stock?.ticker]);

  const handleAnalyzeQuery = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError("");
    setData(null);
    setMomentumData(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery.trim(),
          market,
          timeframe,
          depth,
          profile,
          riskTolerance,
          // Phase 1: everything except the AI write-up. Prices, chart and
          // technicals come back in a couple of seconds instead of waiting
          // ~20s for the model, which was almost all of the old wait.
          skipAi: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (
          json.isUnsupported &&
          json.suggestions &&
          json.suggestions.length > 0
        ) {
          setSuggestions(json.suggestions);
        }
        throw new Error(json.error || "Failed to analyze stock");
      }
      setSuggestions([]);
      setData(json);
      setActiveTab("chart");
      // Cache the full result so leaving and returning restores it instantly.
      saveLastAnalysis({ query: searchQuery.trim(), data: json, at: Date.now() });
      saveLastAnalysisTab("chart");
      // Phase 2: fetch the AI report in the background and merge it in when it
      // lands. The page is already usable while this runs.
      if (includeAI) {
        setAiPending(true);
        setAiError("");
        fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchQuery.trim(), market, timeframe, depth, profile, riskTolerance,
          }),
        })
          .then((r) => r.json())
          .then((full) => {
            if (!full?.final?.aiReport) return;
            setData((prev: any) => {
              // Guard against a stale response arriving after the user has
              // moved on to a different symbol.
              if (!prev || prev.stock?.ticker !== json.stock?.ticker) return prev;
              const merged = { ...prev, final: full.final, aiTokens: full.aiTokens, usage: full.usage };
              saveLastAnalysis({ query: searchQuery.trim(), data: merged, at: Date.now() });
              return merged;
            });
            logAiUsageDetailed("Stock Analysis", full.usage ?? { tokens: full.aiTokens });
          })
          .catch((e) => {
            // Silently ending the pending state left the report section blank
            // forever with no indication anything had gone wrong.
            setAiError(String(e?.message || e));
          })
          .finally(() => setAiPending(false));
      }
      saveRecentSearch({
        symbol: json.stock.ticker,
        name: json.stock.name,
        currentPrice: json.stock.currentPrice,
        change: json.pricePerformance.oneDay,
      });
      if (autoSave) {
        saveReport({
          symbol: json.stock.ticker,
          name: json.stock.name,
          data: json,
        });
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during analysis.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    handleAnalyzeQuery(query);
  };

  const handleCreateChartAlerts = () => {
    if (
      !data ||
      !data.stock ||
      !data.chartIntelligence ||
      !data.chartIntelligence[chartTimeframe]
    )
      return;

    const tfData = data.chartIntelligence[chartTimeframe];
    if (tfData.support && tfData.support[1]) {
      saveAlert({
        symbol: data.stock.ticker,
        condition: "price_drops_below",
        value: tfData.support[1].toFixed(2),
        description: `Price falls below support (${chartTimeframe})`,
      });
    }
    if (tfData.resistance && tfData.resistance[0]) {
      saveAlert({
        symbol: data.stock.ticker,
        condition: "price_crosses_above",
        value: tfData.resistance[0].toFixed(2),
        description: `Price breaks resistance (${chartTimeframe})`,
      });
    }
    saveAlert({
      symbol: data.stock.ticker,
      condition: "rsi_above",
      value: 60,
      description: `RSI crosses above 60 (${chartTimeframe})`,
    });
    saveAlert({
      symbol: data.stock.ticker,
      condition: "rsi_below",
      value: 40,
      description: `RSI crosses below 40 (${chartTimeframe})`,
    });

    addNotification(
      "Chart alerts created and saved to local storage.",
      "success",
    );
  };

  const [watchlistStatus, setWatchlistStatus] = useState<string>("");
  const handlePdfGeneration = async () => {
    if (!data || !data.stock?.ticker) {
      setError(
        "PDF cannot be generated because report data is incomplete. Please analyze stock again.",
      );
      return;
    }

    // PDF validation as requested by QA test
    const isValidReport =
      data.stock?.name &&
      data.stock?.ticker &&
      data.final?.totalScore !== undefined &&
      (data.final?.aiReport || data.aiReport);
    if (!isValidReport) {
      setError("PDF export failed. Please re-analyze the stock and try again.");
      return;
    }

    setPdfGenerating(true);

    try {
      // Build the PDF programmatically with jsPDF (vector text). This avoids the
      // blank-page problem caused by Tailwind v4 oklch() colors breaking DOM
      // screenshot libraries, and produces a clean, selectable, professional report.
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const W = pdf.internal.pageSize.getWidth();
      const H = pdf.internal.pageSize.getHeight();
      const M = 42;
      const CW = W - M * 2;
      let y = M;

      const INDIGO: [number, number, number] = [79, 70, 229];
      const DARK: [number, number, number] = [30, 41, 59];
      const GRAY: [number, number, number] = [100, 116, 139];
      const LIGHT: [number, number, number] = [241, 245, 249];
      const GREEN: [number, number, number] = [16, 185, 129];
      const RED: [number, number, number] = [225, 29, 72];
      const tc = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);
      const fc = (c: [number, number, number]) => pdf.setFillColor(c[0], c[1], c[2]);
      const sv = (v: any, f = "N/A") =>
        v === undefined || v === null || v === "" ? f : String(v);

      let pageNo = 0;
      const footer = () => {
        pageNo++;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        tc(GRAY);
        pdf.text(
          "Research support only. Not buy/sell advice. No guaranteed prediction. Always verify data independently.",
          M,
          H - 26,
        );
        pdf.text(`StockAnalytix • ${sv(data.stock.name)} (${sv(data.stock.ticker)})`, M, H - 16);
        pdf.text(`Page ${pageNo}`, W - M, H - 16, { align: "right" });
      };
      const ensure = (need: number) => {
        if (y + need > H - 46) {
          footer();
          pdf.addPage();
          y = M;
        }
      };
      const section = (title: string) => {
        ensure(40);
        fc(INDIGO);
        pdf.roundedRect(M, y, CW, 20, 3, 3, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10.5);
        pdf.setTextColor(255, 255, 255);
        pdf.text(title.toUpperCase(), M + 8, y + 13.5);
        y += 30;
      };
      const kv = (pairs: [string, any][]) => {
        pdf.setFontSize(9);
        const colW = CW / 2;
        pairs.forEach(([k, v], i) => {
          const col = i % 2;
          const x = M + col * colW;
          if (col === 0) ensure(17);
          pdf.setFont("helvetica", "normal");
          tc(GRAY);
          pdf.text(sv(k), x, y + 10);
          pdf.setFont("helvetica", "bold");
          tc(DARK);
          const vs = sv(v);
          const vfit = pdf.splitTextToSize(vs, colW - 96)[0] || vs;
          pdf.text(vfit, x + colW - 10, y + 10, { align: "right" });
          if (col === 1) y += 16;
        });
        if (pairs.length % 2 === 1) y += 16;
        y += 8;
      };
      const para = (label: string, text: any) => {
        const t = sv(text, "");
        if (!t) return;
        ensure(26);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9.5);
        tc(INDIGO);
        pdf.text(label, M, y);
        y += 13;
        pdf.setFont("helvetica", "normal");
        tc(DARK);
        pdf.splitTextToSize(t, CW).forEach((ln: string) => {
          ensure(13);
          pdf.text(ln, M, y);
          y += 12.5;
        });
        y += 6;
      };
      const bullets = (label: string, items: any[]) => {
        if (!items || !items.length) return;
        ensure(20);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9.5);
        tc(INDIGO);
        pdf.text(label, M, y);
        y += 13;
        pdf.setFont("helvetica", "normal");
        tc(DARK);
        items.forEach((it) => {
          pdf.splitTextToSize("•  " + String(it), CW - 6).forEach((ln: string, li: number) => {
            ensure(13);
            pdf.text(ln, M + (li === 0 ? 0 : 10), y);
            y += 12.5;
          });
        });
        y += 6;
      };

      const ai = data.final?.aiReport || data.aiReport || {};
      const cur = data.stock?.currency && data.stock.currency !== "USD"
        ? ` ${data.stock.currency}`
        : "";
      const priceStr = data.stock?.currentPrice
        ? (data.stock.currency === "USD" ? "$" : "") + data.stock.currentPrice + cur
        : "N/A";

      // ---- Cover header ----
      fc(INDIGO);
      pdf.rect(0, 0, W, 5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(19);
      tc(DARK);
      pdf.text("StockAnalytix Research Report", M, y + 6);
      y += 22;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      tc(GRAY);
      pdf.text(`Generated ${new Date().toLocaleString()}`, M, y + 4);
      y += 22;

      // Stock identity box
      fc(LIGHT);
      pdf.roundedRect(M, y, CW, 64, 4, 4, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      tc(DARK);
      pdf.text(sv(data.stock?.name), M + 12, y + 22);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      tc(GRAY);
      pdf.text(
        `${sv(data.stock?.ticker)} • ${sv(data.stock?.exchange)} • ${sv(data.stock?.sector)}`,
        M + 12,
        y + 38,
      );
      pdf.text(
        `Market Cap: ${sv(data.stock?.marketCap)}    Price: ${priceStr}`,
        M + 12,
        y + 53,
      );
      // Score chip
      const score = data.final?.totalScore ?? data.scorecard?.total ?? 0;
      const bias = sv(data.final?.bias || data.scorecard?.label);
      fc(score >= 65 ? GREEN : score >= 50 ? INDIGO : RED);
      pdf.roundedRect(W - M - 120, y + 12, 108, 40, 4, 4, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(20);
      pdf.text(`${score}/100`, W - M - 66, y + 30, { align: "center" });
      pdf.setFontSize(7.5);
      pdf.text(bias.slice(0, 22), W - M - 66, y + 44, { align: "center" });
      y += 80;

      // ---- Sections ----
      section("Overall Assessment");
      kv([
        ["Overall Score", `${score} / 100`],
        ["Research View", bias],
        ["Confidence", sv(data.final?.confidence || data.scorecard?.confidence)],
        ["Data Quality", data.scorecard?.dataQualityScore != null ? `${data.scorecard.dataQualityScore}%` : "N/A"],
      ]);
      para("Summary", ai.executiveSummary || ai.quickSummary);

      section("Price Performance");
      kv([
        ["1 Day", sv(data.pricePerformance?.oneDay)],
        ["1 Month", sv(data.pricePerformance?.oneMonth)],
        ["6 Month", sv(data.pricePerformance?.sixMonth)],
        ["1 Year", sv(data.pricePerformance?.oneYear)],
        ["52W High", sv(data.pricePerformance?.fiftyTwoWeekHigh)],
        ["52W Low", sv(data.pricePerformance?.fiftyTwoWeekLow)],
      ]);

      section("Technical Analysis");
      kv([
        ["Trend", sv(data.technical?.trend)],
        ["RSI (14)", sv(data.technical?.rsi)],
        ["MACD", sv(data.technical?.macd)],
        ["50 DMA", sv(data.technical?.dma50)],
        ["200 DMA", sv(data.technical?.dma200)],
        ["Volume", sv(data.technical?.volumeView)],
        ["Support", sv(data.technical?.support)],
        ["Resistance", sv(data.technical?.resistance)],
      ]);
      para("Technical View", ai.technicalView);

      section("Fundamentals");
      kv([
        ["P/E", sv(data.fundamental?.pe)],
        ["P/B", sv(data.fundamental?.pb)],
        ["EPS", sv(data.fundamental?.eps)],
        ["ROE", sv(data.fundamental?.roe)],
        ["ROA", sv(data.fundamental?.roa)],
        ["Debt/Equity", sv(data.fundamental?.debtToEquity)],
        ["Profit Margin", sv(data.fundamental?.profitMargin)],
        ["Operating Margin", sv(data.fundamental?.operatingMargin)],
        ["Revenue Growth", sv(data.fundamental?.revenueGrowth)],
        ["Free Cash Flow", sv(data.fundamental?.freeCashFlow)],
      ]);
      para("Fundamental View", ai.fundamentalView);

      section("Valuation");
      kv([
        ["Valuation", sv(data.valuation?.view || data.valuation?.label)],
        ["Score", `${sv(data.valuation?.score)} / 20`],
      ]);
      para("Valuation View", ai.valuationView);

      section("Top-Down / Market Context");
      kv([
        ["Alignment Score", sv(data.topDownData?.alignmentScore)],
        ["Alignment", sv(data.topDownData?.alignmentLabel)],
        ["Sector Strength", sv(data.topDownData?.sectorStrengthLabel)],
      ]);
      para("Market Context", ai.topDownView || data.topDownData?.conclusion);

      section("Momentum View");
      para("Momentum", ai.momentumView);
      para("Price Strength", ai.priceStrengthView);
      para("Buyer Demand", ai.buyerDemandView);
      para("Short-Term Setup", ai.shortTermSetupView);
      if (momentumData?.snapshot) {
        kv([
          ["Momentum Score", `${momentumData.snapshot.momentumScore ?? "N/A"} / 100`],
          ["Momentum View", sv(momentumData.snapshot.finalMomentumView)],
          ["Price Strength", sv(momentumData.priceStrength?.rating)],
          ["Buyer Demand", sv(momentumData.buyerDemand?.rating)],
        ]);
      }

      section("Risk Assessment");
      kv([
        ["Risk Level", sv(data.risk?.riskLevel)],
        ["Safety Score", `${sv(data.risk?.score)} / 10`],
      ]);
      bullets("Key Risks", data.risk?.keyRisks || ai.keyRisks);

      section("AI Research Conclusion");
      bullets("Key Positives", ai.keyPositives);
      bullets("Key Risks", ai.keyRisks);
      para("Investor View", ai.investorView);
      para("Trader View", ai.traderView);
      bullets("What To Track Next", ai.whatToTrackNext);
      para("Final Research View", ai.finalResearchView || ai.finalConclusion);

      // Disclaimer block
      ensure(70);
      fc(LIGHT);
      pdf.roundedRect(M, y, CW, 56, 4, 4, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      tc(DARK);
      pdf.text("Disclaimer", M + 10, y + 16);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      tc(GRAY);
      pdf.splitTextToSize(
        "Research support only. Not buy/sell advice. No guaranteed prediction. Always verify data independently. This report is auto-generated by StockAnalytix using AI models and third-party data. Due to data unavailability, AI variance, or rate limits, metrics can be inaccurate or outdated.",
        CW - 20,
      ).forEach((ln: string, i: number) => pdf.text(ln, M + 10, y + 30 + i * 10));
      y += 66;

      footer();
      const dateStr = new Date().toISOString().split("T")[0];
      const safeTicker = String(data.stock.ticker).replace(/[^a-zA-Z0-9]/g, "_");
      pdf.save(`StockAnalytix_${safeTicker}_Report_${dateStr}.pdf`);
    } catch (e) {
      console.error("PDF generation failed:", e);
      setError("PDF export failed. Please re-analyze the stock and try again.");
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleToggleWatchlist = () => {
    if (!data) return;
    saveToWatchlist({
      symbol: data.stock.ticker,
      name: data.stock.name,
      exchange: data.stock.exchange,
      currentPrice: data.stock.currentPrice,
      change: data.pricePerformance.oneDay,
      score: data.final.totalScore,
      view: data.final.bias,
      risk: data.risk.riskLevel,
    });
    addNotification({
      type: "success",
      message: `${data.stock.ticker} added to Watchlist.`,
    });
    setWatchlistStatus("Added");
    setTimeout(() => setWatchlistStatus(""), 2000);
  };

  const [saveStatus, setSaveStatus] = useState<string>("");
  const handleSaveReportBtn = () => {
    if (!data) return;
    saveReport({
      symbol: data.stock.ticker,
      name: data.stock.name,
      exchange: data.stock.exchange,
      score: data.final.totalScore,
      view: data.final.bias,
      risk: data.risk.riskLevel,
      data: data,
    });
    addNotification({
      type: "success",
      message: `Report for ${data.stock.ticker} saved.`,
    });
    setSaveStatus("Saved");
    setTimeout(() => setSaveStatus(""), 2000);
  };

  const openDrawer = (metric: any) => {
    setDrawerData(metric);
    setDrawerOpen(true);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-500";
    if (score >= 50) return "text-amber-500";
    return "text-rose-500";
  };

  const getBgScoreColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 50) return "bg-amber-500";
    return "bg-rose-500";
  };

  const MetricCard = ({ title, value, score, type, onClickData }: any) => (
    <motion.div
      whileHover={{
        y: -2,
        boxShadow:
          "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
      }}
      onClick={() => openDrawer(onClickData)}
      className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm cursor-pointer transition-all duration-200 hover:border-indigo-200 group"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
        {score !== undefined && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${score > 70 ? "bg-emerald-100 text-emerald-700" : score > 40 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}
          >
            {score}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between">
        <span
          className={`text-xl font-bold ${type === "positive" ? "text-emerald-600" : type === "negative" ? "text-rose-600" : "text-slate-800"}`}
        >
          {value || "N/A"}
        </span>
        <ChevronRight className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  );

  return (
    <div className="analyze-page min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-12 overflow-x-hidden">
      {/* 1. Analyze Space Top Control Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 print:hidden relative isolate">
        <div className="max-w-full mx-auto px-4 py-3">
          <div className="flex flex-col xl:flex-row gap-4 items-center justify-between">
            <div className="flex flex-1 w-full gap-3 items-center">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm">
                <Activity className="w-4 h-4" />
              </div>
              <form
                onSubmit={handleAnalyze}
                className="relative w-full max-w-sm flex"
              >
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Enter Ticker (e.g. AAPL, RELIANCE.NS)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-slate-100 border-none rounded-lg py-2 pl-9 pr-3 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </form>
              <div className="hidden lg:flex gap-2">
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  className="bg-slate-100 border-none text-xs rounded-lg px-2 py-2 font-semibold text-slate-600 hover:bg-slate-200 transition focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option>US</option>
                  <option>NSE</option>
                  <option>BSE</option>
                </select>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="bg-slate-100 border-none text-xs rounded-lg px-2 py-2 font-semibold text-slate-600 hover:bg-slate-200 transition focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option>1D</option>
                  <option>1W</option>
                  <option>1M</option>
                  <option>3M</option>
                  <option>6M</option>
                  <option>1Y</option>
                  <option>3Y</option>
                  <option>5Y</option>
                </select>
                <select
                  value={depth}
                  onChange={(e) => setDepth(e.target.value)}
                  className="bg-slate-100 border-none text-xs rounded-lg px-2 py-2 font-semibold text-slate-600 hover:bg-slate-200 transition focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option>Quick</option>
                  <option>Standard</option>
                  <option>Deep</option>
                </select>
                <select
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  className="bg-slate-100 border-none text-xs rounded-lg px-2 py-2 font-semibold text-slate-600 hover:bg-slate-200 transition focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option>Trader</option>
                  <option>Short-term Investor</option>
                  <option>Long-term Investor</option>
                </select>
                <select
                  value={riskTolerance}
                  onChange={(e) => setRiskTolerance(e.target.value)}
                  className="bg-slate-100 border-none text-xs rounded-lg px-2 py-2 font-semibold text-slate-600 hover:bg-slate-200 transition focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option>Conservative</option>
                  <option>Moderate</option>
                  <option>Aggressive</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full xl:w-auto overflow-x-auto no-scrollbar justify-start xl:justify-end">
              <div className="hidden md:flex items-center gap-3 mr-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeNews}
                    onChange={(e) => setIncludeNews(e.target.checked)}
                    className="rounded text-indigo-500 focus:ring-indigo-500"
                  />{" "}
                  News
                </label>
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAI}
                    onChange={(e) => setIncludeAI(e.target.checked)}
                    className="rounded text-indigo-500 focus:ring-indigo-500"
                  />{" "}
                  AI Report
                </label>
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSave}
                    onChange={(e) => setAutoSave(e.target.checked)}
                    className="rounded text-indigo-500 focus:ring-indigo-500"
                  />{" "}
                  Auto Save
                </label>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={loading || !query}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm whitespace-nowrap flex items-center gap-2 group"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 group-hover:scale-110 transition-transform" />
                )}
                {loading ? "Analyzing..." : "Analyze Stock"}
                {includeAI && (
                  <span className="text-[9px] font-black text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded">PAID AI</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-full mx-auto px-4 mt-6">
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl flex items-center gap-3 mb-4">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-sm font-medium">{error}</p>
          </div>

          {suggestions && suggestions.length > 0 && (
            <div className="bg-white border text-center border-slate-200 shadow-sm p-6 rounded-xl mt-4">
              <h3 className="text-lg font-bold text-slate-800 mb-2">
                Did you mean:
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                Choose from the suggested entities below to analyze
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {suggestions.map((s) => (
                  <div
                    key={s.symbol}
                    className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between group hover:border-indigo-300 hover:shadow-sm transition-all"
                  >
                    <div className="text-left">
                      <div className="font-bold text-slate-800">{s.symbol}</div>
                      <div className="text-xs text-slate-500 line-clamp-1">
                        {s.name}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setQuery(s.symbol);
                        handleAnalyzeQuery(s.symbol);
                      }}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center gap-1 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors"
                    >
                      Analyze <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && !data && (
        <div className="max-w-full mx-auto px-4 mt-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-16 text-center w-full max-w-3xl mx-auto mt-12 animate-pulse">
            <div className="h-10 w-10 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-6" />
            <h3 className="text-xl font-bold text-slate-800 mb-2">
              Analyzing Data Streams
            </h3>
            <p className="text-slate-500 text-sm">
              Structuring technical indicators, parsing fundamentals, and
              analyzing sentiments...
            </p>
          </div>
        </div>
      )}

      {!loading && !data && (
        <div className="max-w-3xl mx-auto px-4 mt-10 sm:mt-16 pb-20">
          <div className="text-center">
            {/* Animated icon */}
            <div className="relative w-20 h-20 mx-auto mb-6">
              <span className="absolute inset-0 rounded-2xl bg-indigo-400/30 animate-ping" />
              <span className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Activity className="w-9 h-9 text-white" />
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Analyze any stock in seconds</h2>
            <p className="text-slate-500 font-medium mt-2 max-w-md mx-auto">
              Enter a ticker above — or tap one below — for live charts, technicals, momentum, risk &amp; an AI report.
            </p>

            {getRecentSearches().length > 0 && (
              <div className="mt-7">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Recent</div>
                <div className="flex flex-wrap justify-center gap-2">
                  {getRecentSearches().slice(0, 6).map((r: any) => (
                    <button key={r.symbol} onClick={() => { setQuery(r.symbol); handleAnalyzeQuery(r.symbol); }}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 hover:-translate-y-0.5 transition">
                      {String(r.symbol).replace(/\.(NS|BO)$/i, "")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Popular</div>
              <div className="flex flex-wrap justify-center gap-2">
                {["AAPL", "NVDA", "MSFT", "TSLA", "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"].map((s) => (
                  <button key={s} onClick={() => { setQuery(s); handleAnalyzeQuery(s); }}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:-translate-y-0.5 transition">
                    {s.replace(/\.(NS|BO)$/i, "")}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-10 max-w-2xl mx-auto">
              {[
                { icon: CandlestickChart, label: "Live Charts" },
                { icon: Activity, label: "Technicals" },
                { icon: Zap, label: "AI Report" },
                { icon: FileText, label: "Research" },
              ].map((f, i) => (
                <div key={f.label} className="bg-white border border-slate-200 rounded-xl px-3 py-4 flex flex-col items-center gap-2 hover:shadow-sm transition" style={{ animation: `fadeInUp 0.4s ease ${i * 0.06}s both` }}>
                  <f.icon className="w-5 h-5 text-indigo-500" />
                  <span className="text-[12px] font-bold text-slate-600">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data && !loading && (
        <div className="max-w-full mx-auto px-4 w-full flex flex-col pt-6 pb-20">
          {/* OFFSCREEN PDF EXPORT CANVAS */}
          <div
            id="pdf-report-content"
            className="absolute top-[-9999px] left-[-9999px] w-[1000px] pointer-events-none bg-white text-slate-900 p-8 z-[-1]"
          >
            {/* Header */}
            <div className="border-b-2 border-slate-800 pb-4 mb-6">
              <h1 className="text-4xl font-black mb-1">
                StockAnalytix MVP Research Report
              </h1>
              <p className="text-slate-600 font-medium">
                Auto-generated on {new Date().toLocaleDateString()}
              </p>
            </div>

            {/* 1. Cover Summary */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="block text-xs font-bold text-slate-500 uppercase">
                  Asset
                </span>
                <span className="text-2xl font-black">
                  {data.stock?.name || "Data unavailable"} (
                  {data.stock?.ticker || "Data unavailable"})
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="block text-xs font-bold text-slate-500 uppercase">
                  Final View
                </span>
                <span className="text-2xl font-black text-indigo-700">
                  {data.final?.bias || "Data unavailable"}
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="block text-xs font-bold text-slate-500 uppercase">
                  Analysis Confidence
                </span>
                <span className="text-2xl font-black">
                  {data.final?.confidence || "Data unavailable"}
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="block text-xs font-bold text-slate-500 uppercase">
                  Data Quality Score
                </span>
                <span className="text-2xl font-black">
                  {data.scorecard?.dataQualityScore ?? "Data unavailable"}/100
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="block text-xs font-bold text-slate-500 uppercase">
                  Current Price
                </span>
                <span className="text-2xl font-black">
                  {data.stock.currency === "INR" ? "₹" : "$"}
                  {data.stock?.currentPrice}
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="block text-xs font-bold text-slate-500 uppercase">
                  Final Score
                </span>
                <span className="text-2xl font-black">
                  {data.final?.totalScore}/100
                </span>
              </div>
            </div>

            {/* AI Summary */}
            <div className="mb-6 border border-slate-200 p-5 rounded-xl">
              <h3 className="text-lg font-bold text-slate-800 mb-2 border-b border-slate-100 pb-2">
                AI Summary
              </h3>
              <p className="text-sm font-medium leading-relaxed">
                {data.final?.aiReport?.quickSummary || "Data unavailable"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Detailed Metrics */}
              <div>
                <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-3">
                  Price Performance
                </h3>
                <ul className="text-sm space-y-2">
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>1D Change:</span>{" "}
                    <span className="font-bold">
                      {data.pricePerformance?.oneDay}
                    </span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>1M Return:</span>{" "}
                    <span className="font-bold">
                      {data.pricePerformance?.oneMonth}
                    </span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>6M Return:</span>{" "}
                    <span className="font-bold">
                      {data.pricePerformance?.sixMonth}
                    </span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>1Y Return:</span>{" "}
                    <span className="font-bold">
                      {data.pricePerformance?.oneYear}
                    </span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-3">
                  Technical View
                </h3>
                <ul className="text-sm space-y-2">
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>Trend:</span>{" "}
                    <span className="font-bold">{data.technical?.trend}</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>RSI:</span>{" "}
                    <span className="font-bold">{data.technical?.rsi}</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>MACD:</span>{" "}
                    <span className="font-bold">{data.technical?.macd}</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>Score:</span>{" "}
                    <span className="font-bold">
                      {data.technical?.score}/25
                    </span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-3">
                  Valuation View
                </h3>
                <ul className="text-sm space-y-2">
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>Status:</span>{" "}
                    <span className="font-bold">{data.valuation?.label}</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>P/E:</span>{" "}
                    <span className="font-bold">{data.fundamental?.pe}</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>P/B:</span>{" "}
                    <span className="font-bold">{data.fundamental?.pb}</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>Score:</span>{" "}
                    <span className="font-bold">
                      {data.valuation?.score}/20
                    </span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-3">
                  Fundamental View
                </h3>
                <ul className="text-sm space-y-2">
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>Revenue Growth:</span>{" "}
                    <span className="font-bold">
                      {data.fundamental?.revenueGrowth}
                    </span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>Profit Margin:</span>{" "}
                    <span className="font-bold">
                      {data.fundamental?.profitMargin}
                    </span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>ROE:</span>{" "}
                    <span className="font-bold">{data.fundamental?.roe}</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-100 pb-1">
                    <span>Score:</span>{" "}
                    <span className="font-bold">
                      {data.fundamental?.score}/30
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Top-Down & Chart View (Deep Report) */}
            {depth === "deep" && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-3">
                    Top-Down Context
                  </h3>
                  <ul className="text-sm space-y-2">
                    <li className="flex justify-between border-b border-slate-100 pb-1">
                      <span>Index Trend:</span>{" "}
                      <span className="font-bold">
                        {data.topDownData?.marketContext?.trend || "N/A"}
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-slate-100 pb-1">
                      <span>Sector Strength:</span>{" "}
                      <span className="font-bold">
                        {data.topDownData?.sectorStrengthLabel || "N/A"}
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-slate-100 pb-1">
                      <span>Cluster Note:</span>{" "}
                      <span className="font-bold text-[10px] w-2/3 text-right">
                        {data.topDownData?.conclusion || "N/A"}
                      </span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-bold border-b border-slate-200 pb-2 mb-3">
                    Chart Intelligence
                  </h3>
                  <ul className="text-sm space-y-2">
                    <li className="flex justify-between border-b border-slate-100 pb-1">
                      <span>Daily Pattern:</span>{" "}
                      <span className="font-bold text-[10px] w-2/3 text-right">
                        {data.chartIntelligence?.daily?.patterns?.[0]?.name ||
                          "None"}
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-slate-100 pb-1">
                      <span>Extension Risk:</span>{" "}
                      <span className="font-bold">
                        {data.chartIntelligence?.extensionRisk?.riskLevel ||
                          "N/A"}
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-slate-100 pb-1">
                      <span>Daily ADX:</span>{" "}
                      <span className="font-bold">
                        {data.chartIntelligence?.daily?.adxLabel || "N/A"}
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-slate-100 pb-1">
                      <span>Chart Setup View:</span>{" "}
                      <span className="font-bold text-[10px] w-2/3 text-right">
                        {data.chartIntelligence?.daily?.view || "N/A"}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* AI Insights & Limitations */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <h4 className="font-bold text-emerald-800 mb-2">
                  Key Positives
                </h4>
                <ul className="list-disc pl-4 text-xs text-emerald-700 space-y-1">
                  {data.final?.aiReport?.keyPositives?.map(
                    (item: string, i: number) => <li key={i}>{item}</li>,
                  ) || <li>Data unavailable</li>}
                </ul>
              </div>
              <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
                <h4 className="font-bold text-rose-800 mb-2">Key Risks</h4>
                <ul className="list-disc pl-4 text-xs text-rose-700 space-y-1">
                  {data.final?.aiReport?.keyRisks?.map(
                    (item: string, i: number) => <li key={i}>{item}</li>,
                  ) || <li>Data unavailable</li>}
                </ul>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <h4 className="font-bold text-amber-800 mb-2">
                  Data Limitations
                </h4>
                <ul className="list-disc pl-4 text-xs text-amber-700 space-y-1">
                  {data.final?.aiReport?.dataLimitations?.length > 0 ? (
                    data.final?.aiReport?.dataLimitations?.map(
                      (item: string, i: number) => <li key={i}>{item}</li>,
                    )
                  ) : (
                    <li>Complete data found.</li>
                  )}
                  {data.scorecard?.missingDataMessage && (
                    <li>{data.scorecard.missingDataMessage}</li>
                  )}
                </ul>
              </div>
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <h4 className="font-bold text-indigo-800 mb-2">
                  What To Track Next
                </h4>
                <ul className="list-disc pl-4 text-xs text-indigo-700 space-y-1">
                  {data.final?.aiReport?.whatToTrackNext?.map(
                    (item: string, i: number) => <li key={i}>{item}</li>,
                  ) || <li>Data unavailable</li>}
                </ul>
              </div>
            </div>

            {/* MOMENTUM SECTION (Part 23) */}
            <div className="mt-6 pt-4 border-t-2 border-slate-200">
              <h2 className="text-2xl font-black mb-3">Momentum Analysis</h2>
              {momentumData ? (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                      <div className="text-xs text-slate-500 font-bold">
                        Momentum Score
                      </div>
                      <div className="text-2xl font-black text-indigo-700">
                        {momentumData.snapshot?.momentumScore ?? "—"}/100
                      </div>
                      <div className="text-xs font-bold text-slate-600">
                        {momentumData.snapshot?.finalMomentumView}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <div className="text-xs text-slate-500 font-bold">
                        Price Strength
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {momentumData.priceStrength?.rating}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <div className="text-xs text-slate-500 font-bold">
                        Buyer Demand
                      </div>
                      <div className="text-lg font-bold text-slate-800">
                        {momentumData.buyerDemand?.rating}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <strong>Sector / Group:</strong>{" "}
                      {momentumData.sectorRank?.label}
                    </div>
                    <div>
                      <strong>EPS Trend:</strong>{" "}
                      {momentumData.quarterlyEps?.trendLabel}
                    </div>
                    <div>
                      <strong>Sales Trend:</strong>{" "}
                      {momentumData.quarterlySales?.trendLabel}
                    </div>
                    <div>
                      <strong>Forward PE:</strong>{" "}
                      {momentumData.forwardValuation?.forwardPe} (
                      {momentumData.forwardValuation?.label})
                    </div>
                    <div>
                      <strong>Ownership:</strong>{" "}
                      {momentumData.ownership?.label}
                    </div>
                    <div>
                      <strong>Quality:</strong>{" "}
                      {momentumData.qualityRatios?.label}
                    </div>
                    <div>
                      <strong>Cash Flow:</strong> {momentumData.cashFlow?.label}
                    </div>
                    <div>
                      <strong>Dilution:</strong> {momentumData.dilution?.label}
                    </div>
                    <div>
                      <strong>Short-Term Setup:</strong>{" "}
                      {momentumData.shortTermSetup?.label}
                    </div>
                    <div>
                      <strong>Data Coverage:</strong>{" "}
                      {momentumData.momentumScore?.dataCoverage}%
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">
                    {momentumData.momentumScore?.explanation}
                  </p>
                  <p className="text-[11px] text-slate-500 italic">
                    {momentumData.disclaimer}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Open the Momentum tab to include detailed momentum analysis in
                  this report. Momentum is computed on demand and shows a clean
                  unavailable state when provider data is limited.
                </p>
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-6">
              <h4 className="font-bold text-sm text-slate-800 mb-1">
                Disclaimer
              </h4>
              <p className="text-xs text-slate-600 font-medium">
                Research support only. Not buy/sell advice. No guaranteed
                prediction. Always verify data independently. This report is
                auto-generated by StockAnalytix MVP using advanced AI models and
                generalized data streams. Due to data unavailability, AI
                hallucination, or rate-limits, metrics can be inaccurate or
                outdated.
              </p>
            </div>
          </div>

          {/* 2. Sticky Stock Header — compact and readable on phones */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 sm:p-5 mb-6 sticky top-16 sm:top-20 z-30 print:static print:shadow-none print:border-b">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 lg:gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase tracking-widest truncate max-w-[45vw]">
                    {data.stock.sector || "EQUITY"}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 uppercase tracking-widest">
                    {data.stock.exchange}:{data.stock.ticker}
                  </span>
                  <a href={`/compare?symbol=${encodeURIComponent(data.stock.ticker)}`} title="Compare & Relative Strength"
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-50 text-violet-600 uppercase tracking-widest hover:bg-violet-100 transition inline-flex items-center gap-1">
                    ⚖ Compare
                  </a>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-baseline gap-2 truncate">
                  <span className="truncate">{data.stock.name}</span>
                  <span className="text-sm font-semibold text-slate-400 shrink-0">
                    ({data.stock.currency})
                  </span>
                </h1>
              </div>

              {/* price on the left, score gauge on the right — one tidy row */}
              <div className="flex items-center justify-between gap-3 w-full lg:w-auto">
                <div className="lg:text-right">
                  <div className="text-[11px] sm:text-sm font-semibold text-slate-500">
                    Current Price
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-slate-800 font-mono tracking-tight flex gap-2 items-baseline lg:justify-end">
                    {data.stock.currency === "INR" ? "₹" : "$"}
                    {data.stock.currentPrice}
                    <span
                      className={`text-sm sm:text-base font-bold ${data.pricePerformance.oneDay?.startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}
                    >
                      {data.pricePerformance.oneDay}
                    </span>
                  </div>
                </div>

                <div className="h-10 w-px bg-slate-200 hidden md:block"></div>

                <div
                  className="flex items-center gap-3 cursor-pointer group shrink-0"
                  onClick={() =>
                    openDrawer({
                      title: "Final Score Detail",
                      value: data.final.totalScore,
                      score: data.final.totalScore,
                      meaning:
                        "The overall weighted score based on technicals, fundamentals, valuation, news, and risk.",
                      whyMatters:
                        "Provides a consolidated view to quickly identify strong or weak assets.",
                      interpretation: data.final.bias,
                    })
                  }
                >
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-semibold text-slate-500 group-hover:text-indigo-600 transition-colors">
                      Final Score
                    </div>
                    <div className="text-lg font-bold text-slate-800">
                      {data.final.bias}
                    </div>
                  </div>
                  <div className="relative w-10 h-10 sm:w-12 sm:h-12">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="50%"
                        cy="50%"
                        r="40%"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="transparent"
                        className="text-slate-100"
                      />
                      <circle
                        cx="50%"
                        cy="50%"
                        r="40%"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="transparent"
                        strokeDasharray="251.2"
                        strokeDashoffset={
                          251.2 - (data.final.totalScore / 100) * 251.2
                        }
                        className={getScoreColor(data.final.totalScore)}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">
                      {data.final.totalScore}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 sm:pt-5 border-t border-slate-100">
              <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0">
                <div className="flex gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar min-w-0">
                  {PRIMARY_TABS.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3.5 py-2 text-[14px] font-bold rounded-lg transition-colors relative whitespace-nowrap ${activeTab === tab ? "text-indigo-700 bg-indigo-50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
                    >
                      {TAB_LABELS[tab]}
                      {activeTab === tab && (
                        <motion.div
                          layoutId="activetab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full"
                        />
                      )}
                    </button>
                  ))}
                </div>
                {/* More — the remaining deep-dive tabs, one click away */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setMoreTabOpen((o) => !o)}
                    className={`flex items-center gap-1 px-3.5 py-2 text-[14px] font-bold rounded-lg transition-colors whitespace-nowrap ${
                      MORE_TABS.includes(activeTab) ? "text-indigo-700 bg-indigo-50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    {MORE_TABS.includes(activeTab) ? TAB_LABELS[activeTab] : "More"}
                    <ChevronDown className={`w-4 h-4 transition-transform ${moreTabOpen ? "rotate-180" : ""}`} />
                  </button>
                  {moreTabOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMoreTabOpen(false)} />
                      <div className="absolute right-0 sm:left-0 top-full mt-2 z-40 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 max-h-[65vh] overflow-y-auto">
                        {MORE_TABS.map((tab) => (
                          <button
                            key={tab}
                            onClick={() => {
                              setActiveTab(tab);
                              setMoreTabOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-[14px] font-bold rounded-lg transition-colors ${
                              activeTab === tab ? "text-indigo-700 bg-indigo-50" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                          >
                            {TAB_LABELS[tab]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="hidden sm:flex gap-2 print:hidden">
                <button
                  onClick={handleToggleWatchlist}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Bookmark className="w-3.5 h-3.5" />{" "}
                  {watchlistStatus || "Watchlist"}
                </button>
                <button
                  onClick={handleSaveReportBtn}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" /> {saveStatus || "Save"}
                </button>
                <button
                  onClick={handlePdfGeneration}
                  disabled={pdfGenerating}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {pdfGenerating ? (
                    <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-600 rounded-full animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {pdfGenerating ? "Generating PDF..." : "PDF"}
                </button>
              </div>
            </div>
          </div>

          {/* 3. Tab Content */}
          <div className="flex-1 min-h-[260px] sm:min-h-[400px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                {/* OVERVIEW TAB */}
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <MetricCard
                        title="Market Cap"
                        value={data.stock.marketCap}
                        onClickData={{
                          title: "Market Cap",
                          value: data.stock.marketCap,
                          meaning: "Total value of all outstanding shares.",
                          whyMatters:
                            "Indicates the size and maturity of the company.",
                        }}
                      />
                      <MetricCard
                        title="Trend"
                        value={data.technical.trend}
                        score={data.technical.score}
                        type={
                          data.technical.trend?.includes("Up")
                            ? "positive"
                            : "negative"
                        }
                        onClickData={{
                          title: "Technical Trend",
                          value: data.technical.trend,
                          meaning: "The current direction of the stock price.",
                          whyMatters:
                            "Trend following is a core technical strategy.",
                        }}
                      />
                      <MetricCard
                        title="Valuation"
                        value={data.valuation.view}
                        score={data.valuation.score}
                        type={
                          data.valuation.score > 12
                            ? "positive"
                            : data.valuation.score < 8
                              ? "negative"
                              : ""
                        }
                        onClickData={{
                          title: "Valuation View",
                          value: data.valuation.view,
                          meaning:
                            "Assessment of stock price relative to intrinsic value metrics.",
                          whyMatters:
                            "Buying undervalued stocks offers a margin of safety.",
                        }}
                      />
                      <MetricCard
                        title="Risk Level"
                        value={data.risk.riskLevel}
                        score={data.risk.score}
                        type={data.risk.score < 5 ? "negative" : "positive"}
                        onClickData={{
                          title: "Risk Level",
                          value: data.risk.riskLevel,
                          meaning: "Overall assessment of downside hazards.",
                          whyMatters:
                            "Capital preservation relies on understanding risks.",
                        }}
                      />
                      <MetricCard
                        title="1M Return"
                        value={data.pricePerformance.oneMonth}
                        type={
                          data.pricePerformance.oneMonth?.startsWith("-")
                            ? "negative"
                            : "positive"
                        }
                        onClickData={{
                          title: "1M Return",
                          value: data.pricePerformance.oneMonth,
                          meaning: "Stock return over the last month.",
                        }}
                      />
                      <MetricCard
                        title="1Y Return"
                        value={data.pricePerformance.oneYear}
                        type={
                          data.pricePerformance.oneYear?.startsWith("-")
                            ? "negative"
                            : "positive"
                        }
                        onClickData={{
                          title: "1Y Return",
                          value: data.pricePerformance.oneYear,
                          meaning: "Stock return over the last year.",
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-sm font-bold text-slate-800">
                            Mini Chart (100D)
                          </h3>
                          <button
                            onClick={() => setActiveTab("chart")}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                          >
                            Open Full Chart <ArrowUpRight className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="h-[280px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={data.chartData || []}
                              margin={{
                                top: 5,
                                right: 0,
                                left: -25,
                                bottom: 0,
                              }}
                            >
                              <defs>
                                <linearGradient
                                  id="colorMiniPrice"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="5%"
                                    stopColor="#4f46e5"
                                    stopOpacity={0.3}
                                  />
                                  <stop
                                    offset="95%"
                                    stopColor="#4f46e5"
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                              </defs>
                              <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                              />
                              <YAxis
                                domain={["auto", "auto"]}
                                tick={{ fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => val.toFixed(0)}
                              />
                              <RechartsTooltip
                                contentStyle={{
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="price"
                                stroke="#4f46e5"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorMiniPrice)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="flex flex-col gap-6">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between flex-1">
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                              <Zap className="w-4 h-4 text-indigo-500" /> AI
                              Quick Summary
                            </h3>
                            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl">
                              {data.final.aiReport?.quickSummary ||
                                "AI Summary unavailable or not requested."}
                            </p>
                          </div>
                          <div className="space-y-4 pt-4 mt-auto">
                            <div>
                              <h4 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider text-emerald-700">
                                Key Positives
                              </h4>
                              <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4 marker:text-emerald-500">
                                {data.final.aiReport?.keyPositives?.map(
                                  (p: string, i: number) => (
                                    <li key={i}>{p}</li>
                                  ),
                                ) || <li>None listed.</li>}
                              </ul>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider text-rose-700">
                                Key Risks
                              </h4>
                              <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4 marker:text-rose-500">
                                {data.final.aiReport?.keyRisks?.map(
                                  (r: string, i: number) => (
                                    <li key={i}>{r}</li>
                                  ),
                                ) || <li>None listed.</li>}
                              </ul>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />{" "}
                              Data Quality
                            </span>
                            <span className="text-lg font-black">
                              {data.scorecard?.dataQualityScore ?? "N/A"}/100
                            </span>
                          </h3>
                          <div className="mb-3">
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-emerald-500 h-full"
                                style={{
                                  width: `${data.scorecard?.dataQualityScore || 0}%`,
                                }}
                              ></div>
                            </div>
                            <div className="text-xs font-bold text-slate-500 text-right mt-1">
                              {data.final?.confidence || "Medium Confidence"}
                            </div>
                          </div>
                          {data.scorecard?.missingDataMessage && (
                            <div className="text-xs text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-100 font-medium leading-relaxed">
                              {data.scorecard.missingDataMessage}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOP-DOWN VIEW TAB */}
                {activeTab === "top-down" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                          <Target className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">
                          Cluster Strength Score
                        </h3>
                        <div className="text-5xl font-black text-indigo-600 tracking-tighter mb-2">
                          {data.topDownData?.alignmentScore ?? "N/A"}
                          <span className="text-lg text-slate-400">/100</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-500 mb-4">
                          {data.topDownData?.alignmentLabel}
                        </p>
                        <p className="text-sm font-medium text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          {data.topDownData?.conclusion}
                        </p>
                      </div>

                      <div className="space-y-4">
                        {/* Market Index View */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                            <Target className="w-3.5 h-3.5" /> Market Index
                          </h4>
                          {data.topDownData?.marketContext &&
                          !data.topDownData.marketContext.error ? (
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-800">
                                {data.topDownData.marketContext.symbol}
                              </span>
                              <span
                                className={`text-xs font-bold px-2 py-1 rounded-lg ${data.topDownData.marketContext.trend?.includes("Uptrend") ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                              >
                                {data.topDownData.marketContext.trend}
                              </span>
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500">
                              Index data unavailable from current provider.
                            </div>
                          )}
                        </div>

                        {/* Sector View */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                            <PieChart className="w-3.5 h-3.5" /> Sector Index
                          </h4>
                          {data.topDownData?.sectorContext &&
                          !data.topDownData.sectorContext.error ? (
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-800">
                                  {data.topDownData.sectorSymbol}
                                </span>
                                <span
                                  className={`text-xs font-bold px-2 py-1 rounded-lg ${data.topDownData.sectorContext.trend?.includes("Uptrend") ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                                >
                                  {data.topDownData.sectorContext.trend}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">
                                  1M Return
                                </span>
                                <span
                                  className={`font-semibold ${data.topDownData.sectorContext.return1M > 0 ? "text-emerald-600" : "text-rose-600"}`}
                                >
                                  {(
                                    data.topDownData.sectorContext.return1M || 0
                                  ).toFixed(2)}
                                  %
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500">
                              Sector data unavailable from current provider.
                            </div>
                          )}
                        </div>

                        {/* Stock View */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                            <ArrowUpRight className="w-3.5 h-3.5" /> Current
                            Stock
                          </h4>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-800">
                                {data.stock.ticker}
                              </span>
                              <span
                                className={`text-xs font-bold px-2 py-1 rounded-lg ${data.technical.trend?.includes("Uptrend") ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                              >
                                {data.technical.trend}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">1M Return</span>
                              <span
                                className={`font-semibold ${parseFloat(data.pricePerformance.oneMonth || 0) > 0 ? "text-emerald-600" : "text-rose-600"}`}
                              >
                                {data.pricePerformance.oneMonth}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* CHART TAB */}
                {activeTab === "chart" && (
                  <div className="flex flex-col gap-6">
                    {/* TOP: Timeframe Cards */}
                    {data.chartIntelligence && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {["hourly", "daily", "weekly"].map((tf) => {
                          const tfData = data.chartIntelligence[tf];
                          const isSelected = chartTimeframe === tf;
                          if (!tfData || tfData.error) return null;
                          return (
                            <button
                              key={tf}
                              onClick={() => setChartTimeframe(tf as any)}
                              className={`p-4 rounded-2xl border text-left transition-all ${isSelected ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-500" : "bg-white border-slate-200 hover:border-indigo-100 hover:shadow-sm"}`}
                            >
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                  {tf} View
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tfData.trend?.includes("Uptrend") ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                                >
                                  {tfData.trend}
                                </span>
                              </div>
                              <div className="space-y-1 mb-3">
                                <div className="flex justify-between text-xs">
                                  <span className="text-slate-500">RSI</span>
                                  <span className="font-semibold text-slate-700">
                                    {tfData.rsi ?? "N/A"} ({tfData.rsiLabel})
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-slate-500">ADX</span>
                                  <span className="font-semibold text-slate-700">
                                    {tfData.adx ?? "N/A"} ({tfData.adxLabel})
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-slate-500">
                                    Support
                                  </span>
                                  <span className="font-semibold text-emerald-600">
                                    {tfData.support?.[0]?.toFixed(2)} -{" "}
                                    {tfData.support?.[1]?.toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-slate-500">
                                    Resistance
                                  </span>
                                  <span className="font-semibold text-rose-600">
                                    {tfData.resistance?.[0]?.toFixed(2)} -{" "}
                                    {tfData.resistance?.[1]?.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                              <div className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 flex items-center gap-1">
                                <Eye className="w-3 h-3" />{" "}
                                {tfData.view || "Neutral"}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* MAIN CHART AREA */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-5 shadow-sm grid grid-cols-1 xl:grid-cols-[1fr_232px] gap-4 sm:gap-5">
                      {/* ---- LEFT: chart column ---- */}
                      <div className="min-w-0 flex flex-col">
                      <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
                        <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                          {["Candlestick", "Line", "Area"].map((type) => (
                            <button
                              key={type}
                              onClick={() => setChartType(type)}
                              className={`px-3 sm:px-4 py-1.5 text-xs font-bold rounded-md transition-shadow ${chartType === type ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={handleCreateChartAlerts}
                          className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold hover:bg-amber-100 flex items-center gap-1.5"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Create Level Alerts
                        </button>
                      </div>
                      {/* Chart zoom + fullscreen toolbar */}
                      <div className="flex items-center justify-end gap-1.5 mb-2 flex-wrap">
                        {zoomWin && (
                          <span className="text-[10px] font-bold text-indigo-600 mr-1">
                            Zoomed: {getVisibleCandles().length} /{" "}
                            {getAllCandles().length} candles
                          </span>
                        )}
                        <button
                          onClick={() => applyZoom(0.8)}
                          title="Zoom in"
                          className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                        >
                          <ZoomIn className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => applyZoom(1.25)}
                          title="Zoom out"
                          className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                        >
                          <ZoomOut className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setZoomWin(null)}
                          title="Reset zoom"
                          className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={toggleChartFullscreen}
                          title={isChartFs ? "Exit fullscreen (Esc)" : "Fullscreen"}
                          className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                        >
                          {isChartFs ? (
                            <Minimize2 className="w-4 h-4" />
                          ) : (
                            <Maximize2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <div
                        ref={chartContainerRef}
                        style={isChartFs ? { height: "100vh" } : undefined}
                        className={`w-full rounded-xl border p-2 sm:p-4 h-[360px] sm:h-[440px] lg:h-[480px] ${isChartFs ? "bg-white border-transparent relative !p-8 !h-screen" : "bg-slate-50 border-slate-100"}`}
                      >
                        {isChartFs && (
                          <button
                            onClick={toggleChartFullscreen}
                            className="absolute top-4 right-4 z-10 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 flex items-center gap-1.5"
                          >
                            <Minimize2 className="w-3.5 h-3.5" /> Exit (Esc)
                          </button>
                        )}
                        {!data.chartIntelligence ||
                        !data.chartIntelligence[chartTimeframe] ||
                        data.chartIntelligence[chartTimeframe].error ? (
                          <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm font-medium">
                            Chart data unavailable for {chartTimeframe}{" "}
                            timeframe.
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={getVisibleCandles()}
                              margin={{
                                top: 10,
                                right: 0,
                                left: -20,
                                bottom: 0,
                              }}
                            >
                              <defs>
                                <linearGradient
                                  id="colorFullPrice"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="5%"
                                    stopColor="#4f46e5"
                                    stopOpacity={0.3}
                                  />
                                  <stop
                                    offset="95%"
                                    stopColor="#4f46e5"
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                              </defs>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke="#e2e8f0"
                              />
                              <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10, fill: "#64748b" }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                                tickFormatter={(v) => v?.substring(0, 10)}
                              />
                              <YAxis
                                yAxisId="left"
                                domain={["auto", "auto"]}
                                tick={{ fontSize: 10, fill: "#64748b" }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => val?.toFixed(0)}
                                orientation="right"
                              />
                              <YAxis
                                yAxisId="right"
                                domain={[0, 100]}
                                tick={{ fontSize: 10, fill: "#8b5cf6" }}
                                tickLine={false}
                                axisLine={false}
                                orientation="left"
                                hide={!chartToggles.rsi && !chartToggles.adx}
                              />
                              <YAxis
                                yAxisId="volume"
                                domain={[0, (dataMax: number) => dataMax * 4]}
                                tick={false}
                                axisLine={false}
                                hide
                              />
                              {/* RS rides its own scale — rebased to 100, nothing
                                  to do with the price axis. */}
                              <YAxis
                                yAxisId="rs"
                                domain={["auto", "auto"]}
                                tick={{ fontSize: 10, fill: "#0d9488" }}
                                tickLine={false}
                                axisLine={false}
                                orientation="left"
                                width={38}
                                tickFormatter={(v) => (v == null ? "" : Number(v).toFixed(0))}
                                hide={!chartToggles.rs}
                              />
                              <RechartsTooltip
                                content={<PriceChartTooltip maType={chartMaType} />}
                                offset={18}
                                allowEscapeViewBox={{ x: true, y: false }}
                                wrapperStyle={{ zIndex: 50 }}
                              />

                              {chartToggles.supportRes &&
                                data.chartIntelligence[chartTimeframe]
                                  .support && (
                                  <ReferenceArea
                                    yAxisId="left"
                                    y1={
                                      data.chartIntelligence[chartTimeframe]
                                        .support[0]
                                    }
                                    y2={
                                      data.chartIntelligence[chartTimeframe]
                                        .support[1]
                                    }
                                    fill="#10b981"
                                    fillOpacity={0.1}
                                  />
                                )}
                              {chartToggles.supportRes &&
                                data.chartIntelligence[chartTimeframe]
                                  .resistance && (
                                  <ReferenceArea
                                    yAxisId="left"
                                    y1={
                                      data.chartIntelligence[chartTimeframe]
                                        .resistance[0]
                                    }
                                    y2={
                                      data.chartIntelligence[chartTimeframe]
                                        .resistance[1]
                                    }
                                    fill="#ef4444"
                                    fillOpacity={0.1}
                                  />
                                )}

                              {chartType === "Candlestick" && (
                                <Bar
                                  yAxisId="left"
                                  dataKey="candle"
                                  shape={<CustomCandlestick />}
                                  isAnimationActive={false}
                                />
                              )}
                              {chartType === "Area" && (
                                <Area
                                  yAxisId="left"
                                  type="monotone"
                                  dataKey="close"
                                  stroke="#4f46e5"
                                  strokeWidth={2.5}
                                  fillOpacity={1}
                                  fill="url(#colorFullPrice)"
                                />
                              )}
                              {chartType === "Line" && (
                                <Line
                                  yAxisId="left"
                                  type="monotone"
                                  dataKey="close"
                                  stroke="#4f46e5"
                                  strokeWidth={2.5}
                                  dot={false}
                                />
                              )}

                              {/* Moving averages — one distinct colour each, bold enough to read */}
                              {chartToggles.ma10 && (
                                <Line
                                  yAxisId="left"
                                  type="monotone"
                                  dataKey={
                                    chartMaType === "SMA" ? "sma10" : "ema10"
                                  }
                                  name="MA 10"
                                  stroke="#0ea5e9"
                                  strokeWidth={2.5}
                                  dot={false}
                                />
                              )}
                              {chartToggles.ma20 && (
                                <Line
                                  yAxisId="left"
                                  type="monotone"
                                  dataKey={
                                    chartMaType === "SMA" ? "sma20" : "ema20"
                                  }
                                  name="MA 20"
                                  stroke="#f59e0b"
                                  strokeWidth={2.5}
                                  dot={false}
                                />
                              )}
                              {chartToggles.ma50 && (
                                <Line
                                  yAxisId="left"
                                  type="monotone"
                                  dataKey={
                                    chartMaType === "SMA" ? "sma50" : "ema50"
                                  }
                                  name="MA 50"
                                  stroke="#8b5cf6"
                                  strokeWidth={2.5}
                                  dot={false}
                                />
                              )}
                              {chartToggles.ma200 && (
                                <Line
                                  yAxisId="left"
                                  type="monotone"
                                  dataKey={
                                    chartMaType === "SMA" ? "sma200" : "ema200"
                                  }
                                  name="MA 200"
                                  stroke="#dc2626"
                                  strokeWidth={3}
                                  dot={false}
                                />
                              )}

                              {/* Relative strength overlaid on its own scale:
                                  vs the benchmark, plus one line per peer. */}
                              {chartToggles.rs && rsData?.series?.length > 0 && (
                                <Line
                                  yAxisId="rs"
                                  type="monotone"
                                  dataKey="rsLine"
                                  name={`Strength vs ${rsData.benchmarkLabel}`}
                                  stroke="#0d9488"
                                  strokeWidth={2.5}
                                  dot={false}
                                  connectNulls
                                />
                              )}
                              {chartToggles.rs &&
                                (rsData?.peers || []).map((p: string, i: number) => (
                                  <Line
                                    key={`rs-${p}`}
                                    yAxisId="rs"
                                    type="monotone"
                                    dataKey={`rsLine_${p}`}
                                    name={`Strength vs ${p}`}
                                    stroke={["#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9"][i % 4]}
                                    strokeWidth={2}
                                    strokeDasharray="5 3"
                                    dot={false}
                                    connectNulls
                                  />
                                ))}

                              {/* RSI/ADX moved to synced sub-panels below the chart */}
                              {chartToggles.volume && (
                                <Bar
                                  yAxisId="volume"
                                  dataKey="volume"
                                  fill="#cbd5e1"
                                  opacity={0.5}
                                  maxBarSize={20}
                                />
                              )}
                              {chartToggles.patterns &&
                                data.chartIntelligence[chartTimeframe].patterns
                                  ?.length > 0 &&
                                data.chartIntelligence[
                                  chartTimeframe
                                ].patterns.map((pm: any, idx: number) => (
                                  <ReferenceLine
                                    key={idx}
                                    yAxisId="left"
                                    x={pm.date}
                                    stroke="#94a3b8"
                                    strokeDasharray="3 3"
                                  >
                                    <Label
                                      value={pm.name}
                                      position="insideTopLeft"
                                      fill={
                                        pm.intent === "Bullish"
                                          ? "#10b981"
                                          : pm.intent === "Bearish"
                                            ? "#ef4444"
                                            : "#64748b"
                                      }
                                      fontSize={10}
                                      fontWeight="bold"
                                    />
                                  </ReferenceLine>
                                ))}
                            </ComposedChart>
                          </ResponsiveContainer>
                        )}
                      </div>

                      {/* SYNCED INDICATOR SUB-PANELS (Tier 3) — share the zoom window */}
                      {chartToggles.rsi &&
                        data.chartIntelligence?.[chartTimeframe] &&
                        !data.chartIntelligence[chartTimeframe].error && (
                          <div className="mt-3 bg-white rounded-xl border border-slate-200 px-4 pt-3 pb-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                              <span className="text-xs font-black text-violet-600">RSI (14)</span>
                              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                <span className="w-3 h-0.5 rounded bg-violet-500" /> RSI
                              </span>
                              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                <span className="w-3 h-0.5 rounded bg-amber-500" /> Signal (9)
                              </span>
                              <span className="text-[11px] font-medium text-slate-400">30 / 50 / 70</span>
                            </div>
                            <div className="h-36">
                              <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                  data={getVisibleCandles()}
                                  margin={{ top: 4, right: 0, left: -18, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                  <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 11, fill: "#64748b" }}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={40}
                                    tickFormatter={(v) => (v ? String(v).substring(5, 10) : "")}
                                  />
                                  <YAxis
                                    domain={[0, 100]}
                                    ticks={[30, 50, 70]}
                                    tick={{ fontSize: 11, fill: "#64748b" }}
                                    width={30}
                                  />
                                  <ReferenceArea y1={70} y2={100} fill="#fee2e2" fillOpacity={0.6} />
                                  <ReferenceArea y1={0} y2={30} fill="#dcfce7" fillOpacity={0.6} />
                                  <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="2 2" />
                                  <RechartsTooltip
                                    contentStyle={{ fontSize: 12, borderRadius: 8, fontWeight: 700 }}
                                    labelFormatter={(l: any) => String(l).slice(0, 16)}
                                    formatter={(val: any, name: any) => [val == null ? "—" : Number(val).toFixed(1), name]}
                                  />
                                  <Line type="monotone" dataKey="rsi" name="RSI" stroke="#7c3aed" strokeWidth={3} dot={false} />
                                  <Line type="monotone" dataKey="rsiSignal" name="Signal" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                </ComposedChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}
                      {chartToggles.adx &&
                        data.chartIntelligence?.[chartTimeframe] &&
                        !data.chartIntelligence[chartTimeframe].error && (
                          <div className="mt-3 bg-white rounded-xl border border-slate-200 px-4 pt-3 pb-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                              <span className="text-xs font-black text-indigo-600">ADX (14) — trend strength</span>
                              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                <span className="w-3 h-0.5 rounded bg-indigo-600" /> ADX
                              </span>
                              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                <span className="w-3 h-0.5 rounded bg-green-500" /> +DI
                              </span>
                              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                <span className="w-3 h-0.5 rounded bg-red-500" /> −DI
                              </span>
                              <span className="text-[11px] font-medium text-slate-400">25 = trending</span>
                            </div>
                            <div className="h-36">
                              <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                  data={getVisibleCandles()}
                                  margin={{ top: 4, right: 0, left: -18, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                  <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 11, fill: "#64748b" }}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={40}
                                    tickFormatter={(v) => (v ? String(v).substring(5, 10) : "")}
                                  />
                                  <YAxis
                                    domain={[0, "auto"]}
                                    tick={{ fontSize: 11, fill: "#64748b" }}
                                    width={30}
                                  />
                                  <ReferenceLine y={25} stroke="#94a3b8" strokeDasharray="2 2" />
                                  <RechartsTooltip
                                    contentStyle={{ fontSize: 12, borderRadius: 8, fontWeight: 700 }}
                                    labelFormatter={(l: any) => String(l).slice(0, 16)}
                                    formatter={(val: any, name: any) => [val == null ? "—" : Number(val).toFixed(1), name]}
                                  />
                                  <Line type="monotone" dataKey="plusDI" name="+DI" stroke="#22c55e" strokeWidth={2} dot={false} />
                                  <Line type="monotone" dataKey="minusDI" name="−DI" stroke="#ef4444" strokeWidth={2} dot={false} />
                                  <Line type="monotone" dataKey="adx" name="ADX" stroke="#4f46e5" strokeWidth={3} dot={false} />
                                </ComposedChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                      {/* RELATIVE STRENGTH vs benchmark index */}
                      {chartToggles.rs && (
                        <div className="mt-3 bg-white rounded-xl border border-slate-200 px-4 pt-3 pb-2.5">
                          {/* header: title, verdict, mode */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
                            <span className="text-[13px] font-black text-teal-700">
                              Price Strength{rsData ? ` — ${rsData.symbol}` : ""}
                            </span>
                            {rsData?.summary && (
                              <span
                                className={`text-[11.5px] font-black px-2 py-0.5 rounded ${
                                  rsData.summary.outperformancePct > 1
                                    ? "bg-emerald-50 text-emerald-700"
                                    : rsData.summary.outperformancePct < -1
                                      ? "bg-rose-50 text-rose-700"
                                      : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {rsData.summary.verdict} {rsData.benchmarkLabel}{" "}
                                {rsData.summary.outperformancePct >= 0 ? "+" : ""}
                                {rsData.summary.outperformancePct.toFixed(1)}%
                              </span>
                            )}
                            {rsData?.summary && rsData.legs?.length > 2 && (
                              <span className="text-[11.5px] font-bold text-slate-500">
                                rank {rsData.summary.rankOfStock}/{rsData.summary.totalLegs}
                              </span>
                            )}
                            <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5">
                              {([
                                ["price", "Price shape"],
                                ["ratio", "Strength ratio"],
                              ] as const).map(([k, label]) => (
                                <button
                                  key={k}
                                  onClick={() => setRsMode(k)}
                                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-black transition ${
                                    rsMode === k ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* inline peer picker — same peers as the Technical tab */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                            <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                              Compare
                            </span>
                            {rsPeers.map((p) => (
                              <span
                                key={p}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[11.5px] font-black text-slate-700"
                              >
                                {p}
                                <button
                                  onClick={() => setRsPeers((v) => v.filter((x) => x !== p))}
                                  className="text-slate-400 hover:text-rose-600"
                                  aria-label={`Remove ${p}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {rsPeers.length < 4 && (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const v = rsPeerInput.trim().toUpperCase();
                                  if (!v || rsPeers.includes(v) || v === rsData?.symbol) return setRsPeerInput("");
                                  setRsPeers((p) => [...p, v]);
                                  setRsPeerInput("");
                                }}
                                className="flex items-center gap-1.5"
                              >
                                <input
                                  value={rsPeerInput}
                                  onChange={(e) => setRsPeerInput(e.target.value)}
                                  placeholder={/\.(NS|BO)$/i.test(rsData?.symbol || "") ? "TCS.NS" : "MSFT"}
                                  className="w-24 px-2 py-1 rounded-md border border-slate-200 text-[11.5px] font-bold focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400"
                                />
                                <button
                                  type="submit"
                                  className="px-2 py-1 rounded-md bg-teal-600 text-white text-[11.5px] font-black hover:bg-teal-700"
                                >
                                  +
                                </button>
                              </form>
                            )}
                            {!!rsData?.failedPeers?.length && (
                              <span className="text-[11px] font-bold text-amber-700">
                                no data for {rsData.failedPeers.join(", ")}
                              </span>
                            )}
                          </div>

                          <div className="h-48">
                            {rsLoading || !rsData ? (
                              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">
                                {rsLoading ? "Computing price strength…" : rsError || "Price strength unavailable."}
                              </div>
                            ) : (
                              (() => {
                                const legs: any[] = rsData.legs || [];
                                const COLORS = ["#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9"];
                                const colorOf = (l: any, i: number) =>
                                  l.kind === "stock" ? "#4f46e5"
                                  : l.kind === "benchmark" ? "#94a3b8"
                                  : COLORS[Math.max(0, i - 2) % COLORS.length];
                                return (
                                  <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={rsData.series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                      <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 11, fill: "#64748b" }}
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={40}
                                        tickFormatter={(v) => (v ? String(v).substring(5, 10) : "")}
                                      />
                                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#64748b" }} width={38} />
                                      {/* 100 = level with where it started */}
                                      <ReferenceLine y={100} stroke="#64748b" strokeDasharray="4 3" />
                                      <RechartsTooltip
                                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                        formatter={(val: any, name: any) => [Number(val).toFixed(1), name]}
                                      />
                                      <Legend wrapperStyle={{ fontSize: 11.5, fontWeight: 700 }} />
                                      {rsMode === "price"
                                        ? legs.map((l, i) => (
                                            <Line
                                              key={l.symbol}
                                              type="monotone"
                                              dataKey={l.symbol}
                                              name={l.label}
                                              stroke={colorOf(l, i)}
                                              strokeWidth={l.kind === "stock" ? 3 : 2}
                                              strokeDasharray={l.kind === "benchmark" ? "5 4" : undefined}
                                              dot={false}
                                            />
                                          ))
                                        : [
                                            <Line
                                              key="rs"
                                              type="monotone"
                                              dataKey="rsSmooth"
                                              name={`vs ${rsData.benchmarkLabel}`}
                                              stroke="#0d9488"
                                              strokeWidth={3}
                                              dot={false}
                                            />,
                                            ...(rsData.peers || []).map((p: string, i: number) => (
                                              <Line
                                                key={p}
                                                type="monotone"
                                                dataKey={`rsSmooth_${p}`}
                                                name={`vs ${p}`}
                                                stroke={COLORS[i % COLORS.length]}
                                                strokeWidth={2.5}
                                                dot={false}
                                              />
                                            )),
                                          ]}
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                );
                              })()
                            )}
                          </div>

                          {/* compact head-to-head strip */}
                          {!!rsData?.pairwise?.length && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {rsData.pairwise.map((p: any) => {
                                const level = p.leader === "Level";
                                const stockLeads = p.leader === rsData.symbol;
                                return (
                                  <span
                                    key={p.peer}
                                    className={`px-2 py-0.5 rounded-md text-[11.5px] font-black ${
                                      level ? "bg-slate-100 text-slate-600"
                                      : stockLeads ? "bg-emerald-50 text-emerald-700"
                                      : "bg-rose-50 text-rose-700"
                                    }`}
                                  >
                                    vs {p.peer}:{" "}
                                    {level ? "level" : `${p.leader} +${Math.abs(p.leadPct).toFixed(1)}%`}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          <p className="text-[11.5px] text-slate-500 mt-1.5">
                            {rsMode === "price"
                              ? "Every line rebased to 100 at the start — the highest line gained the most over this window."
                              : `${rsData?.symbol || "The stock"} divided by the other symbol, rebased to 100. Rising = it is winning that pair, falling = the other one is.`}{" "}
                            Describes what already happened — not advice.
                          </p>
                        </div>
                      )}
                      </div>
                      {/* ---- RIGHT: indicator side panel ---- */}
                      <aside className="xl:border-l xl:border-slate-100 xl:pl-5">
                        <div className="xl:sticky xl:top-24 space-y-4">
                          {/* MA type */}
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                              MA Type
                            </div>
                            <div className="flex p-1 bg-slate-100 rounded-lg">
                              {["SMA", "EMA"].map((mType) => (
                                <button
                                  key={mType}
                                  onClick={() => setChartMaType(mType as any)}
                                  className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-md transition ${chartMaType === mType ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                >
                                  {mType}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* grouped indicator toggles */}
                          {CHART_TOGGLE_GROUPS.map((group) => (
                            <div key={group.label}>
                              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                                {group.label}
                              </div>
                              <div className="space-y-1">
                                {group.keys.map((key) => {
                                  const isActive = (chartToggles as any)[key];
                                  const meta = CHART_TOGGLE_META[key];
                                  return (
                                    <button
                                      key={key}
                                      onClick={() =>
                                        setChartToggles((prev) => ({
                                          ...prev,
                                          [key]: !prev[key as keyof typeof chartToggles],
                                        }))
                                      }
                                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition ${
                                        isActive
                                          ? "bg-indigo-50 text-indigo-700"
                                          : "text-slate-500 hover:bg-slate-50"
                                      }`}
                                    >
                                      {/* colour swatch = the line drawn on the chart */}
                                      <span
                                        className={`w-4 h-1 rounded-full shrink-0 ${isActive ? meta.color : "bg-slate-300"}`}
                                      />
                                      <span className="text-xs font-bold flex-1 truncate">{meta.label}</span>
                                      {/* on/off pill */}
                                      <span
                                        className={`w-8 h-4 rounded-full relative shrink-0 transition ${isActive ? "bg-indigo-600" : "bg-slate-200"}`}
                                      >
                                        <span
                                          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${isActive ? "left-4" : "left-0.5"}`}
                                        />
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </aside>
                    </div>
                    {/* CHART DECISION SUMMARY & CHECKLIST */}
                    {data.chartIntelligence && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <PieChart className="w-4 h-4 text-indigo-500" />{" "}
                            Chart Decision Summary
                          </h3>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="text-xs font-semibold text-slate-500">
                                Current Setup Label
                              </span>
                              <span className="text-xs font-bold text-slate-900 bg-white px-2 py-1 rounded shadow-sm">
                                {data.chartIntelligence.setupLabel}
                              </span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="text-xs font-semibold text-slate-500">
                                Trend Quality
                              </span>
                              <span className="text-xs font-bold text-slate-900">
                                {data.chartIntelligence.alignmentLabel}
                              </span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="text-xs font-semibold text-slate-500">
                                RSI Condition
                              </span>
                              <span className="text-xs font-bold text-slate-900">
                                {data.chartIntelligence[chartTimeframe]
                                  ?.rsiLabel || "N/A"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="text-xs font-semibold text-slate-500">
                                ADX Strength
                              </span>
                              <span className="text-xs font-bold text-slate-900">
                                {data.chartIntelligence[chartTimeframe]
                                  ?.adxLabel || "N/A"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="text-xs font-semibold text-slate-500">
                                Volume Confirmation
                              </span>
                              <span className="text-xs font-bold text-slate-900">
                                {data.chartIntelligence[chartTimeframe]
                                  ?.volumeSignal || "N/A"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="text-xs font-semibold text-slate-500">
                                Support Nearby
                              </span>
                              <span className="text-xs font-bold text-emerald-600">
                                {data.chartIntelligence[
                                  chartTimeframe
                                ]?.support?.[0]?.toFixed(2)}{" "}
                                -{" "}
                                {data.chartIntelligence[
                                  chartTimeframe
                                ]?.support?.[1]?.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="text-xs font-semibold text-slate-500">
                                Resistance Nearby
                              </span>
                              <span className="text-xs font-bold text-rose-600">
                                {data.chartIntelligence[
                                  chartTimeframe
                                ]?.resistance?.[0]?.toFixed(2)}{" "}
                                -{" "}
                                {data.chartIntelligence[
                                  chartTimeframe
                                ]?.resistance?.[1]?.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="text-xs font-semibold text-slate-500">
                                Extension Risk
                              </span>
                              <span
                                className={`text-xs font-bold px-2 py-1 rounded shadow-sm ${data.chartIntelligence.extensionRisk?.riskLevel === "High" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}
                              >
                                {
                                  data.chartIntelligence.extensionRisk
                                    ?.riskLevel
                                }
                              </span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="text-xs font-semibold text-slate-500">
                                Final Chart View
                              </span>
                              <span className="text-xs font-bold text-slate-900 bg-white px-2 py-1 rounded shadow-sm">
                                {data.chartIntelligence[chartTimeframe]?.view ||
                                  "N/A"}
                              </span>
                            </div>
                            {data.chartIntelligence.extensionRisk?.message && (
                              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 font-semibold mt-4 text-center">
                                {data.chartIntelligence.extensionRisk.message}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />{" "}
                            Chart Setup Checklist
                          </h3>
                          <div className="space-y-2">
                            {[
                              {
                                label: "Price above 20 MA",
                                pass:
                                  !data.chartIntelligence.daily?.error &&
                                  data.chartIntelligence.daily?.currentPrice >
                                    (data.chartIntelligence.daily?.ema?.[
                                      "20"
                                    ] || 0),
                              },
                              {
                                label: "Price above 50 MA",
                                pass:
                                  !data.chartIntelligence.daily?.error &&
                                  data.chartIntelligence.daily?.currentPrice >
                                    (data.chartIntelligence.daily?.ema?.[
                                      "50"
                                    ] || 0),
                              },
                              {
                                label: "Price above 200 MA",
                                pass:
                                  !data.chartIntelligence.daily?.error &&
                                  data.chartIntelligence.daily?.currentPrice >
                                    (data.chartIntelligence.daily?.ema?.[
                                      "200"
                                    ] || 0),
                              },
                              {
                                label: "RSI healthy (40-65)",
                                pass:
                                  !data.chartIntelligence.daily?.error &&
                                  data.chartIntelligence.daily?.rsi >= 40 &&
                                  data.chartIntelligence.daily?.rsi <= 65,
                              },
                              {
                                label: "ADX confirms trend",
                                pass:
                                  !data.chartIntelligence.daily?.error &&
                                  data.chartIntelligence.daily?.adx > 25,
                              },
                              {
                                label: "Volume confirms move",
                                pass:
                                  !data.chartIntelligence.daily?.error &&
                                  data.chartIntelligence.daily?.volumeSignal?.includes(
                                    "Strong",
                                  ),
                              },
                              {
                                label: "Not too extended from 10 MA",
                                pass:
                                  data.chartIntelligence.extensionRisk
                                    ?.riskLevel !== "High",
                              },
                              {
                                label: "Near support or breaking resistance",
                                pass:
                                  !data.chartIntelligence.daily?.error &&
                                  (data.chartIntelligence.daily?.currentPrice <
                                    data.chartIntelligence.daily?.support?.[1] *
                                      1.05 ||
                                    data.chartIntelligence.daily?.currentPrice >
                                      data.chartIntelligence.daily
                                        ?.resistance?.[0] *
                                        0.98),
                              },
                              {
                                label: "Weekly chart not blocking move",
                                pass:
                                  !data.chartIntelligence.weekly?.error &&
                                  !data.chartIntelligence.weekly?.trend?.includes(
                                    "Downtrend",
                                  ),
                              },
                            ].map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 relative"
                              >
                                <span className="text-xs font-semibold text-slate-600">
                                  {item.label}
                                </span>
                                {item.pass ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                    Pass
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 shadow-sm">
                                    Fail/Neutral
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TECHNICAL TAB */}
                {activeTab === "technical" && (
                  <div className="space-y-6">
                    {/* Compact score header — always on top */}
                    <div className="flex items-center justify-between gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm">
                      <div className="min-w-0">
                        <span className="text-slate-400 font-black uppercase tracking-wider text-[10.5px]">
                          Technical Assessment
                        </span>
                        <div className="text-[15px] font-black text-slate-800 leading-snug mt-0.5 truncate">
                          {data.technical.summary}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-baseline gap-0.5">
                        <span className="text-2xl font-black text-indigo-600 font-mono tracking-tighter tabular-nums">
                          {data.technical.score}
                        </span>
                        <span className="text-[13px] font-bold text-slate-400">/25</span>
                      </div>
                    </div>

                    {/* Section picker as premium cards — tap one to open its
                        detail below. Fills the width and reads far richer than
                        a row of plain pills. */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {([
                        { id: "indicators", title: "Indicators", desc: "RSI, MACD, moving averages & trend at a glance", icon: Activity, tint: "bg-indigo-50 text-indigo-600" },
                        { id: "levels", title: "Support / Resistance", desc: "Key price levels the stock has turned at", icon: BarChart2, tint: "bg-rose-50 text-rose-600" },
                        { id: "strength", title: "Price Strength", desc: "Performance vs its benchmark & peers", icon: TrendingUp, tint: "bg-teal-50 text-teal-600" },
                        { id: "candle", title: "Candle Read", desc: "Today's candle & classical chart patterns", icon: CandlestickChart, tint: "bg-violet-50 text-violet-600" },
                      ] as const).map((c) => {
                        const Icon = c.icon;
                        const active = techView === c.id;
                        return (
                          <button
                            key={c.id}
                            onClick={() => setTechView(c.id)}
                            className={`group text-left rounded-2xl border p-4 transition-all ${
                              active
                                ? "border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200 shadow-sm"
                                : "border-slate-200 bg-white hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`w-10 h-10 rounded-xl grid place-items-center ${c.tint}`}>
                                <Icon className="w-5 h-5" strokeWidth={2.4} />
                              </span>
                              <ChevronRight className={`w-4 h-4 transition-colors ${active ? "text-indigo-500" : "text-slate-300 group-hover:text-indigo-400"}`} />
                            </div>
                            <div className="mt-3 text-[15px] font-black text-slate-900 leading-tight">{c.title}</div>
                            <p className="text-[11.5px] text-slate-500 mt-1 leading-snug">{c.desc}</p>
                          </button>
                        );
                      })}
                    </div>

                    {techView === "indicators" && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                      <h3 className="text-[12px] font-black uppercase tracking-wider text-slate-400 mb-3">Key indicators</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                      {([
                        { icon: Activity, tint: "bg-indigo-50 text-indigo-600", label: "RSI (14)", value: data.technical.rsi, data: { title: "RSI (14)", value: data.technical.rsi, meaning: "Relative Strength Index measures momentum.", interpretation: "Above 70 is overbought, below 30 is oversold.", whyMatters: "Helps identify potential reversal points." } },
                        { icon: LineChart, tint: "bg-violet-50 text-violet-600", label: "MACD", value: data.technical.macd, data: { title: "MACD", value: data.technical.macd, meaning: "Moving Average Convergence Divergence." } },
                        { icon: TrendingUp, tint: "bg-sky-50 text-sky-600", label: "50 DMA", value: data.technical.dma50, data: { title: "50 DMA", value: data.technical.dma50, meaning: "50-day simple moving average.", whyMatters: "Represents medium-term trend line." } },
                        { icon: TrendingUp, tint: "bg-blue-50 text-blue-600", label: "200 DMA", value: data.technical.dma200, data: { title: "200 DMA", value: data.technical.dma200, meaning: "200-day simple moving average.", whyMatters: "Represents long-term trend line." } },
                        { icon: BarChart2, tint: "bg-amber-50 text-amber-600", label: "Volume Signal", value: data.technical.volumeView, data: { title: "Volume Signal", value: data.technical.volumeView, meaning: "Trading volume relative to recent average.", whyMatters: "Confirms price moves. High volume up-move is bullish." } },
                        { icon: Zap, tint: "bg-emerald-50 text-emerald-600", label: "Trend Status", value: data.technical.trend, data: { title: "Trend Status", value: data.technical.trend, meaning: "Overall direction based on moving averages." } },
                      ] as const).map((m, i) => {
                        const Icon = m.icon;
                        return (
                          <button
                            key={i}
                            onClick={() => openDrawer(m.data)}
                            className="group text-left flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 hover:bg-white hover:border-indigo-300 hover:shadow-md transition"
                          >
                            <span className={`shrink-0 w-9 h-9 rounded-lg grid place-items-center ${m.tint}`}>
                              <Icon className="w-[18px] h-[18px]" strokeWidth={2.4} />
                            </span>
                            <div className="min-w-0">
                              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">
                                {m.label}
                              </div>
                              <div className="text-[15px] font-black text-slate-900 leading-[1.15] line-clamp-2 group-hover:text-indigo-700 transition-colors">
                                {m.value || "N/A"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    </div>
                    )}

                    {techView === "levels" && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100">
                        <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                          <BarChart2 className="w-4 h-4 text-indigo-600" /> Support &amp; Resistance
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Swing-pivot levels the price has actually turned at (last ~1 year).
                        </p>
                      </div>
                      {lvlLoading ? (
                        <div className="px-5 py-8 text-center text-sm text-slate-400 font-medium">Finding levels…</div>
                      ) : !lvlData?.ok ? (
                        <div className="px-5 py-8 text-center text-sm text-slate-400 font-medium">
                          {lvlData?.reason || "Levels unavailable."}
                        </div>
                      ) : (
                        <>
                          {/* The position panel only exists when there is a level
                              on BOTH sides. Declaring three columns while
                              rendering two would leave the same empty gutter
                              this layout was rebuilt to remove. */}
                          <div
                            className={`grid grid-cols-1 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 ${
                              lvlData.positionPct != null
                                ? "lg:grid-cols-2 xl:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]"
                                : "lg:grid-cols-2"
                            }`}
                          >
                            {/* where price sits between the nearest levels */}
                            {lvlData.positionPct != null && (
                              <div className="px-5 py-4 lg:col-span-2 xl:col-span-1 border-b border-slate-100 xl:border-b-0">
                                <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                                  Position in range
                                </div>
                                <div className="flex items-baseline justify-between mb-1.5">
                                  <span className="text-[13px] font-black text-emerald-600 tabular-nums">
                                    {lvlData.nearestSupport.price.toFixed(2)}
                                  </span>
                                  <span className="text-[15px] font-black text-slate-900 tabular-nums">
                                    {lvlData.current.toFixed(2)}
                                  </span>
                                  <span className="text-[13px] font-black text-rose-600 tabular-nums">
                                    {lvlData.nearestResistance.price.toFixed(2)}
                                  </span>
                                </div>
                                <div className="relative h-2 rounded-full bg-gradient-to-r from-emerald-200 via-slate-100 to-rose-200">
                                  <span
                                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-slate-900 ring-2 ring-white shadow"
                                    style={{ left: `${Math.min(97, Math.max(3, lvlData.positionPct))}%` }}
                                  />
                                </div>
                                <p className="text-[11.5px] text-slate-500 mt-1.5">
                                  <span className="font-black text-slate-700">{lvlData.positionPct.toFixed(0)}%</span> of
                                  the way from support to resistance
                                </p>
                              </div>
                            )}

                            <LevelColumn
                              title="Resistance (above)"
                              tone="rose"
                              levels={lvlData.resistances}
                              empty="No overhead resistance in the last year — price is at or near its highest level, so there are no prior swing highs above it."
                            />
                            <LevelColumn
                              title="Support (below)"
                              tone="emerald"
                              levels={lvlData.supports}
                              empty="No clear support pivots below the current price."
                            />
                          </div>
                          <p className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-[11.5px] text-slate-500 italic">
                            More touches = a level the market respected more often. Levels are zones, not exact prices.
                          </p>
                        </>
                      )}
                    </div>

                    )}

                    {techView === "strength" && (
                    <div>

                      {/* Price Strength — stock vs benchmark and vs any peers */}
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                          <div>
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                              <TrendingUp className="w-5 h-5 text-teal-600" /> Price Strength &amp; Comparison
                            </h3>
                            <p className="text-[13px] text-slate-500 mt-0.5">
                              Every line rebased to 100 on day one, so the shapes are directly comparable whatever the
                              share prices are. Add peers to compare stock against stock.
                            </p>
                          </div>
                          <div className="flex rounded-lg bg-slate-100 p-1">
                            {(["3mo", "6mo", "1y", "2y"] as const).map((r) => (
                              <button
                                key={r}
                                onClick={() => setRsRange(r)}
                                className={`px-2.5 py-1.5 rounded-md text-[12.5px] font-black transition ${
                                  rsRange === r ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                }`}
                              >
                                {r === "3mo" ? "3M" : r === "6mo" ? "6M" : r === "1y" ? "1Y" : "2Y"}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* peer picker */}
                        <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-100">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[12px] font-black uppercase tracking-wide text-slate-500 mr-1">
                              Compare with
                            </span>
                            {rsPeers.map((p) => (
                              <span
                                key={p}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[12.5px] font-black text-slate-700"
                              >
                                {p}
                                <button
                                  onClick={() => setRsPeers((v) => v.filter((x) => x !== p))}
                                  className="text-slate-400 hover:text-rose-600"
                                  aria-label={`Remove ${p}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {rsPeers.length < 4 && (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const v = rsPeerInput.trim().toUpperCase();
                                  if (!v || rsPeers.includes(v) || v === rsData?.symbol) return setRsPeerInput("");
                                  setRsPeers((p) => [...p, v]);
                                  setRsPeerInput("");
                                }}
                                className="flex items-center gap-2"
                              >
                                <input
                                  value={rsPeerInput}
                                  onChange={(e) => setRsPeerInput(e.target.value)}
                                  placeholder={/\.(NS|BO)$/i.test(rsData?.symbol || "") ? "e.g. TCS.NS" : "e.g. MSFT"}
                                  className="w-36 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12.5px] font-bold focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
                                />
                                <button
                                  type="submit"
                                  className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-[12.5px] font-black hover:bg-teal-700"
                                >
                                  Add
                                </button>
                              </form>
                            )}
                            <div className="ml-auto flex rounded-lg bg-slate-200/70 p-1">
                              {([
                                ["price", "Price shape"],
                                ["ratio", "Strength ratio"],
                              ] as const).map(([k, label]) => (
                                <button
                                  key={k}
                                  onClick={() => setRsMode(k)}
                                  className={`px-3 py-1.5 rounded-md text-[12.5px] font-black transition ${
                                    rsMode === k ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {!!rsData?.failedPeers?.length && (
                            <p className="text-[12px] text-amber-700 mt-2">
                              ⚠ No price history found for {rsData.failedPeers.join(", ")} — check the symbol (Indian
                              stocks need a <code className="font-mono">.NS</code> suffix).
                            </p>
                          )}
                        </div>

                        {rsLoading || (!rsData && !rsError) ? (
                          <div className="px-5 py-12 text-center text-sm text-slate-400 font-medium">
                            {rsLoading ? "Computing price strength…" : "Price strength unavailable."}
                          </div>
                        ) : rsError && !rsData ? (
                          <div className="px-5 py-12 text-center text-sm text-slate-500 font-medium">{rsError}</div>
                        ) : (
                          (() => {
                            const legs: any[] = rsData.legs || [];
                            const COLORS = ["#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9"];
                            const colorOf = (l: any, i: number) =>
                              l.kind === "stock" ? "#4f46e5"
                              : l.kind === "benchmark" ? "#94a3b8"
                              : COLORS[Math.max(0, i - 2) % COLORS.length];
                            const winners = rsData.ranked || [];
                            return (
                              <div className="p-5 space-y-5">
                                {/* headline vs benchmark */}
                                <div
                                  className={`rounded-xl px-4 py-3.5 ${
                                    rsData.summary.outperformancePct > 1 ? "bg-emerald-50"
                                    : rsData.summary.outperformancePct < -1 ? "bg-rose-50"
                                    : "bg-slate-50"
                                  }`}
                                >
                                  <div className="text-[11.5px] font-black uppercase tracking-wider text-slate-500">
                                    {rsData.symbol} vs {rsData.benchmarkLabel} · {rsData.sessions} sessions
                                  </div>
                                  <div className="flex flex-wrap items-baseline gap-3 mt-1">
                                    <span
                                      className={`text-2xl font-black ${
                                        rsData.summary.outperformancePct > 1 ? "text-emerald-700"
                                        : rsData.summary.outperformancePct < -1 ? "text-rose-700"
                                        : "text-slate-700"
                                      }`}
                                    >
                                      {rsData.summary.verdict} {rsData.summary.outperformancePct >= 0 ? "+" : ""}
                                      {rsData.summary.outperformancePct.toFixed(1)}%
                                    </span>
                                    {legs.length > 2 && (
                                      <span className="text-[13px] font-bold text-slate-500">
                                        rank {rsData.summary.rankOfStock} of {rsData.summary.totalLegs} in this comparison
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* the chart */}
                                <div className="h-[300px]">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={rsData.series} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                      <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={50}
                                        tickFormatter={(v) => (v ? String(v).substring(2, 7) : "")}
                                      />
                                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#94a3b8" }} width={44} />
                                      <ReferenceLine y={100} stroke="#64748b" strokeDasharray="4 3" />
                                      <RechartsTooltip
                                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                        formatter={(val: any, name: any) => [Number(val).toFixed(1), name]}
                                      />
                                      <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                                      {rsMode === "price"
                                        ? legs.map((l, i) => (
                                            <Line
                                              key={l.symbol}
                                              type="monotone"
                                              dataKey={l.symbol}
                                              name={l.label}
                                              stroke={colorOf(l, i)}
                                              strokeWidth={l.kind === "stock" ? 3 : 2}
                                              strokeDasharray={l.kind === "benchmark" ? "5 4" : undefined}
                                              dot={false}
                                            />
                                          ))
                                        : [
                                            <Line
                                              key="rs"
                                              type="monotone"
                                              dataKey="rsSmooth"
                                              name={`vs ${rsData.benchmarkLabel}`}
                                              stroke="#0d9488"
                                              strokeWidth={3}
                                              dot={false}
                                            />,
                                            ...(rsData.peers || []).map((p: string, i: number) => (
                                              <Line
                                                key={p}
                                                type="monotone"
                                                dataKey={`rsSmooth_${p}`}
                                                name={`vs ${p}`}
                                                stroke={COLORS[i % COLORS.length]}
                                                strokeWidth={2.5}
                                                dot={false}
                                              />
                                            )),
                                          ]}
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                </div>

                                <p className="text-[12.5px] text-slate-600">
                                  {rsMode === "price" ? (
                                    <>
                                      <span className="font-black">Price shape:</span> each line is that symbol&apos;s own
                                      price rebased to 100. The line that ends highest gained the most over this window.
                                    </>
                                  ) : (
                                    <>
                                      <span className="font-black">Strength ratio:</span> {rsData.symbol} divided by the other
                                      symbol, rebased to 100. <span className="text-emerald-700 font-bold">Rising</span> =
                                      {" "}{rsData.symbol} is winning that pair;{" "}
                                      <span className="text-rose-700 font-bold">falling</span> = the other one is. This
                                      holds even when both are falling.
                                    </>
                                  )}
                                </p>

                                {/* leaderboard + trailing windows */}
                                <div className="overflow-x-auto rounded-xl border border-slate-200">
                                  <table className="w-full text-[13px] [&_th]:!px-2.5 [&_td]:!px-2.5 sm:[&_th]:!px-4 sm:[&_td]:!px-4">
                                    <thead className="bg-slate-50 text-slate-500">
                                      <tr>
                                        <th className="text-left px-4 py-2.5 font-black uppercase tracking-wide text-[11px]">#</th>
                                        <th className="text-left px-4 py-2.5 font-black uppercase tracking-wide text-[11px]">Symbol</th>
                                        <th className="text-right px-4 py-2.5 font-black uppercase tracking-wide text-[11px]">Window</th>
                                        {["1M", "3M", "6M", "1Y"].map((w) => (
                                          <th key={w} className={`text-right px-4 py-2.5 font-black uppercase tracking-wide text-[11px] ${w === "1Y" ? "" : "hidden md:table-cell"}`}>{w}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {winners.map((r: any) => {
                                        const leg = legs.find((l) => l.symbol === r.symbol);
                                        const isStock = r.kind === "stock";
                                        return (
                                          <tr key={r.symbol} className={isStock ? "bg-indigo-50/50" : "hover:bg-slate-50/60"}>
                                            <td className="px-4 py-2.5">
                                              <span
                                                className={`inline-grid place-items-center w-6 h-6 rounded-lg text-[11.5px] font-black ${
                                                  r.rank === 1 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"
                                                }`}
                                              >
                                                {r.rank}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                              <span className={`font-black ${isStock ? "text-indigo-700" : "text-slate-900"}`}>
                                                {r.label}
                                              </span>
                                              {isStock && (
                                                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-700">
                                                  THIS STOCK
                                                </span>
                                              )}
                                              {r.kind === "benchmark" && (
                                                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-500">
                                                  INDEX
                                                </span>
                                              )}
                                            </td>
                                            <td className={`px-4 py-2.5 text-right font-black tabular-nums ${r.changePct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                              {r.changePct >= 0 ? "+" : ""}{r.changePct.toFixed(1)}%
                                            </td>
                                            {["1M", "3M", "6M", "1Y"].map((w) => {
                                              const v = leg?.windows?.[w];
                                              return (
                                                <td
                                                  key={w}
                                                  className={`px-4 py-2.5 text-right font-bold tabular-nums ${w === "1Y" ? "" : "hidden md:table-cell"} ${
                                                    v == null ? "text-slate-300" : v >= 0 ? "text-emerald-600" : "text-rose-600"
                                                  }`}
                                                >
                                                  {v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>

                                {/* head-to-head */}
                                {!!rsData.pairwise?.length && (
                                  <div>
                                    <div className="text-[12px] font-black uppercase tracking-wide text-slate-500 mb-2">
                                      Head to head
                                    </div>
                                    <div className="grid sm:grid-cols-2 gap-2.5">
                                      {rsData.pairwise.map((p: any) => {
                                        const stockLeads = p.leader === rsData.symbol;
                                        const level = p.leader === "Level";
                                        return (
                                          <div
                                            key={p.peer}
                                            className={`rounded-xl border px-4 py-3 ${
                                              level ? "border-slate-200 bg-slate-50"
                                              : stockLeads ? "border-emerald-200 bg-emerald-50/50"
                                              : "border-rose-200 bg-rose-50/50"
                                            }`}
                                          >
                                            <div className="text-[13px] font-black text-slate-900">
                                              {rsData.symbol} vs {p.peer}
                                            </div>
                                            <div
                                              className={`text-[15px] font-black mt-0.5 ${
                                                level ? "text-slate-600" : stockLeads ? "text-emerald-700" : "text-rose-700"
                                              }`}
                                            >
                                              {level
                                                ? "Level over this window"
                                                : `${p.leader} ahead by ${Math.abs(p.leadPct).toFixed(1)}%`}
                                            </div>
                                            <div className="text-[12px] text-slate-500 tabular-nums mt-0.5">
                                              RS now {p.rsNow.toFixed(1)} (100 = level at the start)
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                <p className="text-[12px] text-slate-500 italic">
                                  This ranks what has already happened over the selected window. Past relative
                                  performance is not a reason to expect the same order to continue, and nothing here is
                                  buy or sell advice.
                                </p>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    </div>

                    )}

                    {/* ---- CANDLE READ: today, recent window, historical base rates ---- */}
                    {techView === "candle" && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
                        <div>
                          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <CandlestickChart className="w-5 h-5 text-indigo-600" />
                            Candle Read
                          </h3>
                          <p className="text-[13px] text-slate-500 mt-0.5">
                            Today&apos;s candle, the recent window, classical chart patterns, and how these patterns
                            actually resolved on this stock before.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex rounded-lg bg-slate-100 p-1" title="Simple = short plain-English read · Detailed = full breakdown">
                            {(["simple", "detailed"] as const).map((m) => (
                              <button
                                key={m}
                                onClick={() => { setReportMode(m); if (patReport || patReportErr) genPatReport(m); }}
                                className={`px-2.5 py-1.5 rounded-md text-[12px] font-black capitalize transition ${
                                  reportMode === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => genPatReport()}
                            disabled={patReportLoading || !patData?.ok}
                            className="px-3 py-1.5 rounded-lg text-[13px] font-black flex items-center gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                            title="Generate an AI chart report from the pattern, levels & trend data"
                          >
                            {patReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            AI Report
                          </button>
                          <div className="flex rounded-lg bg-slate-100 p-1">
                            {(["1d", "1wk"] as const).map((iv) => (
                              <button
                                key={iv}
                                onClick={() => setPatInterval(iv)}
                                className={`px-3 py-1.5 rounded-md text-[13px] font-black transition ${
                                  patInterval === iv ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                }`}
                              >
                                {iv === "1d" ? "Daily" : "Weekly"}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* AI complete report */}
                      {(patReportLoading || patReport || patReportErr) && (
                        <div className="px-5 py-4 border-b border-slate-100 bg-indigo-50/40">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h4 className="text-[13px] font-black text-indigo-800 flex items-center gap-1.5">
                              <Zap className="w-4 h-4" /> AI Chart Report
                            </h4>
                            {patReport && !patReportLoading && (
                              <button onClick={() => setPatReport("")} className="text-[11px] font-bold text-slate-400 hover:text-slate-700">clear</button>
                            )}
                          </div>
                          {patReportLoading ? (
                            <div className="flex items-center gap-2 text-[13px] text-slate-500 py-3">
                              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" /> Reading the chart, patterns, levels & history…
                            </div>
                          ) : patReportErr ? (
                            <div className="text-[13px] text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{patReportErr}</div>
                          ) : (
                            <div className="text-[13.5px] text-slate-700 whitespace-pre-wrap leading-relaxed">{patReport}</div>
                          )}
                          <p className="mt-2 text-[10px] text-slate-400 italic">Factual chart reading from live data. Not buy/sell advice.</p>
                        </div>
                      )}

                      {/* view switcher */}
                      <div className="flex border-b border-slate-100 bg-slate-50/60 overflow-x-auto">
                        {([
                          ["today", patInterval === "1wk" ? "This Week's Candle" : "Today's Candle"],
                          ["window", patInterval === "1wk" ? "Last 26 Weeks" : "Last 30 Days"],
                          ["chart", "Chart Patterns"],
                          ["history", "Pattern Track Record"],
                        ] as const).map(([k, label]) => (
                          <button
                            key={k}
                            onClick={() => setPatView(k as any)}
                            className={`px-5 py-3 text-[13px] font-black whitespace-nowrap border-b-2 transition ${
                              patView === k
                                ? "border-indigo-600 text-indigo-700 bg-white"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {patLoading ? (
                        <div className="px-5 py-12 text-center text-sm text-slate-400 font-medium">
                          Reading candles…
                        </div>
                      ) : !patData?.ok ? (
                        <div className="px-5 py-12 text-center text-sm text-slate-400 font-medium">
                          {patData?.reason || "Candle data unavailable for this symbol."}
                        </div>
                      ) : patView === "today" ? (
                        <div className="p-5 space-y-5">
                          {/* --- headline candle --- */}
                          {(() => {
                            const t = patData.today;
                            const upDay = (t.changePct ?? 0) >= 0;
                            return (
                              <>
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                  <div>
                                    <div className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
                                      {t.date}
                                    </div>
                                    <div className="flex items-baseline gap-3 mt-1">
                                      <span className="text-3xl font-black text-slate-900 tabular-nums">
                                        {t.close.toFixed(2)}
                                      </span>
                                      <span
                                        className={`text-lg font-black tabular-nums ${
                                          upDay ? "text-emerald-600" : "text-rose-600"
                                        }`}
                                      >
                                        {t.changePct != null
                                          ? `${t.changePct >= 0 ? "+" : ""}${t.changePct.toFixed(2)}%`
                                          : "—"}
                                      </span>
                                    </div>
                                  </div>
                                  <div
                                    className={`px-3.5 py-2 rounded-xl text-[13px] font-black ${
                                      t.type.startsWith("Strong bullish") || t.type.startsWith("Long lower")
                                        ? "bg-emerald-50 text-emerald-700"
                                        : t.type.startsWith("Strong bearish") || t.type.startsWith("Long upper")
                                          ? "bg-rose-50 text-rose-700"
                                          : t.type.startsWith("Doji")
                                            ? "bg-amber-50 text-amber-700"
                                            : upDay
                                              ? "bg-emerald-50 text-emerald-700"
                                              : "bg-rose-50 text-rose-700"
                                    }`}
                                  >
                                    {t.type}
                                  </div>
                                </div>

                                {/* OHLC */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {[
                                    ["Open", t.open],
                                    ["High", t.high],
                                    ["Low", t.low],
                                    ["Close", t.close],
                                  ].map(([label, v]: any) => (
                                    <div key={label} className="bg-slate-50 rounded-xl px-4 py-3">
                                      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                        {label}
                                      </div>
                                      <div className="text-[17px] font-black text-slate-900 tabular-nums mt-0.5">
                                        {Number(v).toFixed(2)}
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {/* anatomy */}
                                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                                  <div className="text-[12px] font-black uppercase tracking-wide text-slate-500">
                                    Candle anatomy
                                  </div>
                                  {[
                                    ["Real body", t.bodyPct, upDay ? "bg-emerald-500" : "bg-rose-500"],
                                    ["Upper wick", t.upperWickPct, "bg-rose-400"],
                                    ["Lower wick", t.lowerWickPct, "bg-emerald-400"],
                                  ].map(([label, pct, color]: any) => (
                                    <div key={label} className="flex items-center gap-3">
                                      <span className="w-24 text-[13px] font-bold text-slate-600 shrink-0">{label}</span>
                                      <div className="flex-1 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full ${color} rounded-full`}
                                          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                                        />
                                      </div>
                                      <span className="w-12 text-right text-[13px] font-black text-slate-700 tabular-nums">
                                        {pct.toFixed(0)}%
                                      </span>
                                    </div>
                                  ))}
                                  <div className="pt-2 border-t border-slate-200">
                                    <div className="flex items-center justify-between text-[12px] font-bold text-slate-500 mb-1.5">
                                      <span>Closed at the low</span>
                                      <span>Closed at the high</span>
                                    </div>
                                    <div className="relative h-2.5 bg-gradient-to-r from-rose-200 via-slate-200 to-emerald-200 rounded-full">
                                      <div
                                        className="absolute -top-1 w-1.5 h-[18px] bg-slate-900 rounded-full"
                                        style={{
                                          left: `calc(${Math.max(0, Math.min(100, t.closePosition))}% - 3px)`,
                                        }}
                                      />
                                    </div>
                                    <p className="text-[13px] text-slate-700 font-semibold mt-2.5">{t.reading}</p>
                                    {t.gapPct != null && Math.abs(t.gapPct) >= 0.5 && (
                                      <p className="text-[13px] text-slate-600 mt-1">
                                        Opened with a{" "}
                                        <span className={t.gapPct >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                                          {t.gapPct >= 0 ? "gap up" : "gap down"} of {Math.abs(t.gapPct).toFixed(2)}%
                                        </span>{" "}
                                        against the previous close.
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* named patterns on this bar */}
                                <div>
                                  <div className="text-[12px] font-black uppercase tracking-wide text-slate-500 mb-2">
                                    Named patterns on this candle
                                  </div>
                                  {!t.patterns?.length ? (
                                    <div className="bg-slate-50 rounded-xl px-4 py-3.5 text-[13px] text-slate-600">
                                      No textbook pattern completed on this bar — the anatomy above is the read for today.
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {t.patterns.map((p: any, i: number) => {
                                        const br = t.baseRates?.find((b: any) => b.name === p.name);
                                        const tone =
                                          p.type === "Bullish"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : p.type === "Bearish"
                                              ? "bg-rose-50 text-rose-700 border-rose-200"
                                              : "bg-slate-100 text-slate-600 border-slate-200";
                                        return (
                                          <div key={i} className={`rounded-xl border px-4 py-3.5 ${tone}`}>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="text-[15px] font-black">{p.name}</span>
                                              <span className="text-[12px] font-bold opacity-70">
                                                {p.type} · {p.reliability} reliability
                                              </span>
                                            </div>
                                            <p className="text-[13px] mt-1 opacity-90">{p.meaning}</p>
                                            {br && (
                                              <p className="text-[13px] font-bold mt-2 pt-2 border-t border-current/15">
                                                On this stock it fired {br.occurrences} times in ~2 years — price was higher{" "}
                                                {br.horizon} bars later {br.higherCount} times ({br.winRate.toFixed(0)}%), average
                                                move {br.avgMovePct >= 0 ? "+" : ""}
                                                {br.avgMovePct.toFixed(2)}%.
                                              </p>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* reference levels */}
                                <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-3.5">
                                  <div className="text-[12px] font-black uppercase tracking-wide text-indigo-700 mb-2">
                                    Reference levels for the next bar
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {[
                                      ["Above", t.high, "text-emerald-700"],
                                      ["Below", t.low, "text-rose-700"],
                                      [patInterval === "1wk" ? "26w high" : "30d high", patData.last30.high, "text-slate-700"],
                                      [patInterval === "1wk" ? "26w low" : "30d low", patData.last30.low, "text-slate-700"],
                                    ].map(([label, v, cls]: any) => (
                                      <div key={label}>
                                        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                          {label}
                                        </div>
                                        <div className={`text-[16px] font-black tabular-nums ${cls}`}>
                                          {Number(v).toFixed(2)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-[12px] text-slate-600 mt-2.5 italic">
                                    These are levels read off the data — a close beyond one extends or breaks today&apos;s range.
                                    They are not a forecast of tomorrow.
                                  </p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      ) : patView === "window" ? (
                        <div className="p-5 space-y-5">
                          {(() => {
                            const l = patData.last30;
                            return (
                              <>
                                <div className="text-[13px] font-bold text-slate-500">
                                  {l.from} → {l.to} · {l.bars} bars
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                  {[
                                    {
                                      label: "Net change",
                                      value: `${l.netChangePct >= 0 ? "+" : ""}${l.netChangePct.toFixed(2)}%`,
                                      cls: l.netChangePct >= 0 ? "text-emerald-600" : "text-rose-600",
                                    },
                                    { label: "Up bars", value: l.upDays, cls: "text-emerald-600" },
                                    { label: "Down bars", value: l.downDays, cls: "text-rose-600" },
                                    {
                                      label: "Current streak",
                                      value: `${l.streak} ${l.streakDir}`,
                                      cls: l.streakDir === "up" ? "text-emerald-600" : l.streakDir === "down" ? "text-rose-600" : "text-slate-600",
                                    },
                                    { label: "Window high", value: l.high.toFixed(2), cls: "text-slate-800" },
                                    { label: "Window low", value: l.low.toFixed(2), cls: "text-slate-800" },
                                    {
                                      label: "Bullish patterns",
                                      value: l.bullishPatterns,
                                      cls: "text-emerald-600",
                                    },
                                    { label: "Bearish patterns", value: l.bearishPatterns, cls: "text-rose-600" },
                                  ].map((s) => (
                                    <div key={s.label} className="bg-slate-50 rounded-xl px-4 py-3">
                                      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                        {s.label}
                                      </div>
                                      <div className={`text-[19px] font-black tabular-nums mt-0.5 ${s.cls}`}>
                                        {s.value}
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="bg-slate-50 rounded-xl p-4">
                                  <div className="flex items-center justify-between text-[12px] font-black uppercase tracking-wide text-slate-500 mb-2">
                                    <span>Where price sits in this range</span>
                                    <span className="text-slate-800">{l.rangePosition.toFixed(0)}%</span>
                                  </div>
                                  <div className="relative h-3 bg-gradient-to-r from-rose-200 via-amber-100 to-emerald-200 rounded-full">
                                    <div
                                      className="absolute -top-1 w-1.5 h-5 bg-slate-900 rounded-full"
                                      style={{ left: `calc(${Math.max(0, Math.min(100, l.rangePosition))}% - 3px)` }}
                                    />
                                  </div>
                                  <div className="flex justify-between text-[12px] font-bold text-slate-500 mt-1.5 tabular-nums">
                                    <span>{l.low.toFixed(2)}</span>
                                    <span>{l.high.toFixed(2)}</span>
                                  </div>
                                </div>

                                <div>
                                  <div className="text-[12px] font-black uppercase tracking-wide text-slate-500 mb-2">
                                    Patterns inside this window ({l.patterns.length})
                                  </div>
                                  {!l.patterns.length ? (
                                    <div className="bg-slate-50 rounded-xl px-4 py-3.5 text-[13px] text-slate-600">
                                      No textbook patterns completed in this window.
                                    </div>
                                  ) : (
                                    <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                                      {l.patterns.map((p: any, i: number) => (
                                        <div key={i} className="px-4 py-3 flex flex-wrap items-center gap-2 hover:bg-slate-50/60">
                                          <span
                                            className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                                              p.type === "Bullish"
                                                ? "bg-emerald-50 text-emerald-700"
                                                : p.type === "Bearish"
                                                  ? "bg-rose-50 text-rose-700"
                                                  : "bg-slate-100 text-slate-600"
                                            }`}
                                          >
                                            {p.type}
                                          </span>
                                          <span className="text-[14px] font-black text-slate-900">{p.name}</span>
                                          <span className="text-[12px] font-bold text-slate-400">{p.date}</span>
                                          {p.after5dPct != null && (
                                            <span className="ml-auto text-[13px] font-black tabular-nums">
                                              <span className="text-slate-400 font-bold">what followed: </span>
                                              <span className={p.after5dPct >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                                {p.after5dPct >= 0 ? "+" : ""}
                                                {p.after5dPct.toFixed(1)}%
                                              </span>
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      ) : patView === "chart" ? (
                        <div className="p-5 space-y-4">
                          {(() => {
                            const ch = patData.chart;
                            if (!ch?.ok) {
                              return (
                                <div className="bg-slate-50 rounded-xl px-4 py-3.5 text-[13px] text-slate-600">
                                  {ch?.reason || "Chart-pattern data unavailable for this symbol."}
                                </div>
                              );
                            }
                            return (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-[13px] text-slate-600">
                                    Multi-week shapes traced from {ch.pivots.length} swing highs and lows across the last{" "}
                                    {ch.scanned} bars — Double Top/Bottom, Head &amp; Shoulders, Triple Top/Bottom,
                                    triangles, wedges and ranges.
                                  </p>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="px-2.5 py-1 rounded-lg text-[12px] font-black bg-emerald-50 text-emerald-700">
                                      {ch.counts.bullish} Bullish
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg text-[12px] font-black bg-rose-50 text-rose-700">
                                      {ch.counts.bearish} Bearish
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg text-[12px] font-black bg-slate-100 text-slate-600">
                                      {ch.counts.neutral} Neutral
                                    </span>
                                  </div>
                                </div>

                                {!ch.patterns.length ? (
                                  <div className="bg-slate-50 rounded-xl px-4 py-8 text-center text-[13px] text-slate-600">
                                    No classical chart pattern has completed in this window. Price has not built a
                                    recognisable Double Top, Head &amp; Shoulders, triangle or range.
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {ch.patterns.map((p: any, i: number) => {
                                      const tone =
                                        p.bias === "Bullish"
                                          ? { rail: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800", banner: "bg-emerald-50 text-emerald-800 border-emerald-100", txt: "text-emerald-700", bar: "bg-emerald-500" }
                                          : p.bias === "Bearish"
                                            ? { rail: "bg-rose-500", chip: "bg-rose-100 text-rose-800", banner: "bg-rose-50 text-rose-800 border-rose-100", txt: "text-rose-700", bar: "bg-rose-500" }
                                            : { rail: "bg-slate-400", chip: "bg-slate-200 text-slate-700", banner: "bg-slate-50 text-slate-700 border-slate-200", txt: "text-slate-600", bar: "bg-slate-400" };
                                      return (
                                        <div key={i} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                          {/* left accent rail keyed to the bias */}
                                          <div className={`absolute inset-y-0 left-0 w-1.5 ${tone.rail}`} />

                                          <div className="pl-5 pr-4 py-4 space-y-3.5">
                                            {/* Header — pattern name + status pills on the left, timeline on the right */}
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[17px] font-black text-slate-900 tracking-tight">{p.name}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${tone.chip}`}>
                                                  {p.bias}
                                                </span>
                                                <span
                                                  className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                                                    p.status === "Confirmed"
                                                      ? "bg-indigo-100 text-indigo-800"
                                                      : "bg-amber-100 text-amber-800"
                                                  }`}
                                                >
                                                  {p.status === "Confirmed" ? "Broke out" : "Forming"}
                                                </span>
                                              </div>
                                              <div className="text-right shrink-0">
                                                <div className="text-[13px] font-black text-slate-600 tabular-nums">
                                                  {p.from} → {p.to}
                                                </div>
                                                <div className="text-[11px] font-bold text-slate-400 tabular-nums">
                                                  {p.bars} bars{p.brokeOn ? ` · broke ${p.brokeOn}` : ""}
                                                </div>
                                              </div>
                                            </div>

                                            {/* Plain-language verdict — the hero line */}
                                            <div className={`rounded-xl border px-3.5 py-2.5 ${tone.banner}`}>
                                              <span className="text-[13.5px] font-black leading-snug">
                                                {p.status === "Confirmed"
                                                  ? p.after10dPct != null
                                                    ? `Price closed ${p.bias === "Bullish" ? "above" : "below"} ${p.breakLevel.toFixed(2)} on ${p.brokeOn}, and over the next 10 bars it moved ${p.after10dPct >= 0 ? "+" : ""}${p.after10dPct.toFixed(1)}%.`
                                                    : `Price closed ${p.bias === "Bullish" ? "above" : "below"} ${p.breakLevel.toFixed(2)} on ${p.brokeOn} — too recent to say what followed.`
                                                  : `The shape is complete but price has not closed ${p.bias === "Bullish" ? "above" : "below"} ${p.breakLevel.toFixed(2)} yet, so nothing is confirmed.`}
                                              </span>
                                            </div>

                                            <p className="text-[13px] text-slate-600 leading-relaxed">{p.meaning}</p>

                                            {/* Metrics as four discrete stat tiles — read as cards, not drifting numbers */}
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                                              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                                                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 truncate">
                                                  {p.breakLabel}
                                                </div>
                                                <div className="text-[17px] font-black text-slate-900 tabular-nums mt-0.5">
                                                  {p.breakLevel.toFixed(2)}
                                                </div>
                                              </div>
                                              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                                                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                                                  Measured move
                                                </div>
                                                <div className={`text-[17px] font-black tabular-nums mt-0.5 ${tone.txt}`}>
                                                  {p.target != null ? p.target.toFixed(2) : "—"}
                                                </div>
                                              </div>
                                              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                                                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
                                                  Shape quality
                                                </div>
                                                <div className="flex items-center gap-2 mt-1.5">
                                                  <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                    <div
                                                      className={`h-full rounded-full ${
                                                        p.quality >= 70 ? "bg-emerald-500" : p.quality >= 45 ? "bg-amber-500" : "bg-slate-400"
                                                      }`}
                                                      style={{ width: `${Math.max(0, Math.min(100, p.quality))}%` }}
                                                    />
                                                  </div>
                                                  <span className="text-[13px] font-black text-slate-700 tabular-nums">
                                                    {p.quality}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                                                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 truncate">
                                                  {p.brokeOn ? "What followed (10 bars)" : "Broke out on"}
                                                </div>
                                                <div className="text-[17px] font-black tabular-nums mt-0.5">
                                                  {p.after10dPct != null ? (
                                                    <span className={p.after10dPct >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                                      {p.after10dPct >= 0 ? "+" : ""}
                                                      {p.after10dPct.toFixed(1)}%
                                                    </span>
                                                  ) : p.brokeOn ? (
                                                    <span className="text-slate-500 text-[13px]">too recent</span>
                                                  ) : (
                                                    <span className="text-slate-400 text-[13px]">—</span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>

                                            {/* Swing points footer */}
                                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                              <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400 mr-1">
                                                Swing points
                                              </span>
                                              {p.points.map((pt: any, j: number) => (
                                                <span
                                                  key={j}
                                                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${
                                                    pt.kind === "H" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                                                  }`}
                                                  title={pt.date}
                                                >
                                                  {pt.kind} {pt.price.toFixed(2)}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                <p className="text-[12px] text-slate-500 italic">
                                  &ldquo;Measured move&rdquo; is the textbook projection of the pattern&apos;s own height from
                                  its break level — a mechanical reference number, not a forecast. Note the
                                  &ldquo;what followed&rdquo; column: these shapes do not always resolve the way the
                                  textbook says.
                                </p>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="p-5 space-y-4">
                          <p className="text-[13px] text-slate-600">
                            Every pattern that has fired on <span className="font-black text-slate-900">{patData.symbol}</span>{" "}
                            across {patData.historyBars} bars of history, and what price actually did in the following{" "}
                            {patInterval === "1wk" ? 3 : 5} bars. Past frequency — not a probability for the next occurrence.
                          </p>
                          {!patData.baseRates?.length ? (
                            <div className="bg-slate-50 rounded-xl px-4 py-3.5 text-[13px] text-slate-600">
                              Not enough repeat occurrences to build a track record.
                            </div>
                          ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                              <table className="w-full text-[13px]">
                                <thead className="bg-slate-50 text-slate-500">
                                  <tr>
                                    <th className="text-left px-4 py-2.5 font-black uppercase tracking-wide text-[11px]">
                                      Pattern
                                    </th>
                                    <th className="text-left px-4 py-2.5 font-black uppercase tracking-wide text-[11px] hidden sm:table-cell">
                                      Type
                                    </th>
                                    <th className="text-right px-4 py-2.5 font-black uppercase tracking-wide text-[11px]">
                                      Times seen
                                    </th>
                                    <th className="text-right px-4 py-2.5 font-black uppercase tracking-wide text-[11px]">
                                      Higher after
                                    </th>
                                    <th className="text-right px-4 py-2.5 font-black uppercase tracking-wide text-[11px]">
                                      Avg move
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {patData.baseRates.map((b: any) => (
                                    <tr key={b.name} className="hover:bg-slate-50/60">
                                      <td className="px-4 py-2.5 font-black text-slate-900">{b.name}</td>
                                      <td className="px-4 py-2.5 hidden sm:table-cell">
                                        <span
                                          className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                                            b.type === "Bullish"
                                              ? "bg-emerald-50 text-emerald-700"
                                              : b.type === "Bearish"
                                                ? "bg-rose-50 text-rose-700"
                                                : "bg-slate-100 text-slate-600"
                                          }`}
                                        >
                                          {b.type}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-bold text-slate-700 tabular-nums">
                                        {b.occurrences}
                                      </td>
                                      <td className="px-4 py-2.5 text-right tabular-nums">
                                        <span
                                          className={`font-black ${
                                            b.winRate >= 60
                                              ? "text-emerald-600"
                                              : b.winRate <= 40
                                                ? "text-rose-600"
                                                : "text-slate-600"
                                          }`}
                                        >
                                          {b.winRate.toFixed(0)}%
                                        </span>
                                        <span className="text-slate-400 font-bold ml-1">
                                          ({b.higherCount}/{b.occurrences})
                                        </span>
                                      </td>
                                      <td
                                        className={`px-4 py-2.5 text-right font-black tabular-nums ${
                                          b.avgMovePct >= 0 ? "text-emerald-600" : "text-rose-600"
                                        }`}
                                      >
                                        {b.avgMovePct >= 0 ? "+" : ""}
                                        {b.avgMovePct.toFixed(2)}%
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-[12px] text-slate-500 italic">
                        Historical frequencies describe what has already happened on this stock — they are not a probability
                        for the next bar and nothing here predicts tomorrow. Research support only. Not buy/sell advice. No
                        guaranteed prediction. Always verify data independently.
                      </div>
                    </div>
                    )}
                  </div>
                )}

                {/* FUNDAMENTALS TAB */}
                {activeTab === "fundamentals" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <div>
                        <span className="text-slate-500 font-bold uppercase tracking-wider text-xs">
                          Fundamental Assessment
                        </span>
                        <div className="text-xl font-bold text-slate-800 mt-1">
                          {data.fundamental.summary}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-black text-indigo-600 font-mono tracking-tighter">
                          {data.fundamental.score}
                          <span className="text-base text-slate-400">/30</span>
                        </div>
                      </div>
                    </div>
                    {(!data.fundamental.roe ||
                      data.fundamental.roe.includes("unavailable") ||
                      data.fundamental.pe.includes("unavailable")) && (
                      <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-semibold flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <p>
                          Fundamental data is partially unavailable from the
                          current source. Missing metrics are excluded from the
                          calculated score.
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      <MetricCard
                        title="P/E Ratio"
                        value={data.fundamental.pe}
                        onClickData={{
                          title: "Price to Earnings (P/E)",
                          value: data.fundamental.pe,
                          meaning: "Price-to-Earnings Ratio.",
                          whyMatters:
                            "Shows what the market is willing to pay for $1 of earnings.",
                        }}
                      />
                      <MetricCard
                        title="P/B Ratio"
                        value={data.fundamental.pb}
                        onClickData={{
                          title: "Price to Book (P/B)",
                          value: data.fundamental.pb,
                          meaning: "Price-to-Book Ratio.",
                          whyMatters:
                            "Compares market cap to book value of equity.",
                        }}
                      />
                      <MetricCard
                        title="EPS TTm"
                        value={data.fundamental.eps}
                        onClickData={{
                          title: "Earnings Per Share",
                          value: data.fundamental.eps,
                          meaning:
                            "Company profit divided by outstanding shares.",
                        }}
                      />
                      <MetricCard
                        title="ROE"
                        value={data.fundamental.roe}
                        onClickData={{
                          title: "Return on Equity",
                          value: data.fundamental.roe,
                          meaning: "Return on Equity.",
                          whyMatters:
                            "Measures management profitability on shareholder capital.",
                        }}
                      />
                      <MetricCard
                        title="ROA"
                        value={data.fundamental.roa}
                        onClickData={{
                          title: "Return on Assets",
                          value: data.fundamental.roa,
                          meaning: "Return on Assets.",
                        }}
                      />
                      <MetricCard
                        title="Debt/Equity"
                        value={data.fundamental.debtToEquity}
                        onClickData={{
                          title: "Debt to Equity",
                          value: data.fundamental.debtToEquity,
                          meaning:
                            "Measures financial leverage and balance sheet risk.",
                        }}
                      />
                      <MetricCard
                        title="Profit Margin"
                        value={data.fundamental.profitMargin}
                        onClickData={{
                          title: "Net Profit Margin",
                          value: data.fundamental.profitMargin,
                          meaning: "Percentage of revenue kept as net income.",
                        }}
                      />
                      <MetricCard
                        title="Rev Growth"
                        value={data.fundamental.revenueGrowth}
                        onClickData={{
                          title: "Revenue Growth (YoY)",
                          value: data.fundamental.revenueGrowth,
                          meaning: "Year-over-year revenue growth.",
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* VALUATION TAB */}
                {activeTab === "valuation" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <div>
                        <span className="text-slate-500 font-bold uppercase tracking-wider text-xs">
                          Valuation Assessment
                        </span>
                        <div className="text-xl font-bold text-slate-800 mt-1">
                          {data.valuation.summary}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-black text-indigo-600 font-mono tracking-tighter">
                          {data.valuation.score}
                          <span className="text-base text-slate-400">/20</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-2xl mx-auto shadow-sm flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-indigo-50 text-indigo-600 flex items-center justify-center rounded-full mb-6">
                        <PieChart className="w-8 h-8" />
                      </div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                        Final Valuation Label
                      </div>
                      <div
                        className={`text-5xl font-black mb-4 tracking-tight ${data.valuation.score > 12 ? "text-emerald-500" : data.valuation.score < 8 ? "text-rose-500" : "text-slate-800"}`}
                      >
                        {data.valuation.view}
                      </div>
                      <p className="text-slate-500 text-base max-w-md">
                        Based on integrated fundamental multipliers. An
                        undervalued status suggests a potential margin of
                        safety.
                      </p>
                    </div>
                  </div>
                )}

                {/* MOMENTUM TAB */}
                {activeTab === "momentum" && data?.stock?.ticker && (
                  <MomentumTab
                    symbol={data.stock.ticker}
                    market={market}
                    openDrawer={openDrawer}
                    onLoaded={setMomentumData}
                  />
                )}

                {/* EVALUATION TAB (CAN SLIM / ratings) */}
                {activeTab === "evaluation" && data?.stock?.ticker && (
                  <EvaluationTab symbol={data.stock.ticker} market={market} />
                )}

                {/* ANALYTICS TAB (seasonality + backtest) */}
                {activeTab === "analytics" && data?.stock?.ticker && (
                  <AnalyticsTab symbol={data.stock.ticker} market={market} />
                )}

                {/* RESEARCH NOTE TAB (full CANSLIM report) */}
                {activeTab === "research" && data?.stock?.ticker && (
                  <ResearchNoteTab symbol={data.stock.ticker} market={market} />
                )}

                {/* NOTES TAB (your text/voice notes for this stock) */}
                {activeTab === "notes" && data?.stock?.ticker && (
                  <div className="max-w-2xl">
                    <StockNotes symbol={data.stock.ticker} stockName={data.stock.name} />
                  </div>
                )}

                {/* NEWS TAB */}
                {activeTab === "news" && (
                  <div className="space-y-6">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-sm gap-4">
                      <div>
                        <span className="text-slate-500 font-bold uppercase tracking-wider text-xs">
                          News & Sentiment
                        </span>
                        <div className="text-xl font-bold text-slate-800 mt-1 flex items-center gap-2">
                          Detected Sentiment:
                          <span
                            className={`px-3 py-1 text-sm font-black rounded-lg ${data.news.sentiment === "Positive" ? "bg-emerald-100 text-emerald-700" : data.news.sentiment === "Negative" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}
                          >
                            {data.news.sentiment}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-black text-indigo-600 font-mono tracking-tighter">
                          {data.news.score}
                          <span className="text-base text-slate-400">/15</span>
                        </div>
                      </div>
                    </div>

                    {(!data.news.latestNews ||
                      data.news.latestNews.length === 0) && (
                      <div className="p-12 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-500 font-medium">
                        No recent news found for this ticker. Sentiment score is
                        kept baseline.
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.news.latestNews?.map((news: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group flex flex-col h-full"
                        >
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                            {news.source}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500" />
                          </div>
                          <div className="font-bold text-slate-800 text-lg leading-tight mb-3 group-hover:text-indigo-600 transition-colors">
                            {news.headline}
                          </div>
                          <div className="text-sm text-slate-500 mt-auto line-clamp-3">
                            {news.summary}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* RISK TAB */}
                {activeTab === "risk" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <div>
                        <span className="text-slate-500 font-bold uppercase tracking-wider text-xs">
                          Risk Assessment
                        </span>
                        <div className="text-xl font-bold text-slate-800 mt-1">
                          Overall Risk Level is{" "}
                          <span
                            className={
                              data.risk.riskLevel === "High"
                                ? "text-rose-600"
                                : data.risk.riskLevel === "Low"
                                  ? "text-emerald-600"
                                  : "text-amber-600"
                            }
                          >
                            {data.risk.riskLevel}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-black text-indigo-600 font-mono tracking-tighter">
                          {data.risk.score}
                          <span className="text-base text-slate-400">/10</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-rose-200 transition-colors">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-rose-500" /> Key
                          Risk Factors
                        </h3>
                        {data.risk.keyRisks?.length > 0 ? (
                          <ul className="space-y-4">
                            {data.risk.keyRisks.map(
                              (risk: string, i: number) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-3 bg-rose-50/50 p-3 rounded-lg border border-rose-100"
                                >
                                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                  <span className="text-slate-700 font-semibold text-sm leading-relaxed">
                                    {risk}
                                  </span>
                                </li>
                              ),
                            )}
                          </ul>
                        ) : (
                          <div className="p-4 text-slate-500 bg-slate-50 rounded-lg text-sm font-semibold">
                            No severe risk factors detected. General market
                            volatility applies.
                          </div>
                        )}
                      </div>

                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center">
                        <div
                          className="w-20 h-20 rounded-full border-8 mb-6 flex items-center justify-center bg-slate-50 text-3xl font-black mx-auto
                            ${data.risk.score >= 8 ? 'border-emerald-100 text-emerald-600' : data.risk.score <= 4 ? 'border-rose-100 text-rose-600' : 'border-amber-100 text-amber-600'}"
                        >
                          {data.risk.score}
                        </div>
                        <h4 className="text-xl font-bold text-slate-800 mb-2">
                          Safety Score
                        </h4>
                        <p className="text-slate-500 text-sm max-w-sm">
                          Higher scores indicate lower expected risk based on
                          fundamentals, technical stability, and valuation
                          cushions.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* SCORECARD TAB */}
                {activeTab === "scorecard" && (
                  <div className="space-y-6 flex justify-center">
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-lg max-w-2xl w-full">
                      <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center p-3 bg-indigo-50 text-indigo-600 rounded-2xl mb-4">
                          <Target className="w-8 h-8" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                          Master Scorecard
                        </h2>
                        <p className="text-slate-500 mt-2 font-medium">
                          Algorithmic weighting of 5 key metrics.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center group cursor-default">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                              1
                            </div>
                            <span className="font-bold text-slate-700 text-lg group-hover:text-indigo-600 transition-colors">
                              Technical Analysis
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{
                                  width: `${(data.technical.score / 25) * 100}%`,
                                }}
                              ></div>
                            </div>
                            <span className="font-mono font-black text-indigo-600 text-xl w-16 text-right">
                              {data.technical.score}{" "}
                              <span className="text-slate-400 text-sm">
                                / 25
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center group cursor-default">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                              2
                            </div>
                            <span className="font-bold text-slate-700 text-lg group-hover:text-indigo-600 transition-colors">
                              Fundamentals
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{
                                  width: `${(data.fundamental.score / 30) * 100}%`,
                                }}
                              ></div>
                            </div>
                            <span className="font-mono font-black text-indigo-600 text-xl w-16 text-right">
                              {data.fundamental.score}{" "}
                              <span className="text-slate-400 text-sm">
                                / 30
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center group cursor-default">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                              3
                            </div>
                            <span className="font-bold text-slate-700 text-lg group-hover:text-indigo-600 transition-colors">
                              Valuation
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{
                                  width: `${(data.valuation.score / 20) * 100}%`,
                                }}
                              ></div>
                            </div>
                            <span className="font-mono font-black text-indigo-600 text-xl w-16 text-right">
                              {data.valuation.score}{" "}
                              <span className="text-slate-400 text-sm">
                                / 20
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center group cursor-default">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                              4
                            </div>
                            <span className="font-bold text-slate-700 text-lg group-hover:text-indigo-600 transition-colors">
                              News / Sentiment
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{
                                  width: `${(data.news.score / 15) * 100}%`,
                                }}
                              ></div>
                            </div>
                            <span className="font-mono font-black text-indigo-600 text-xl w-16 text-right">
                              {data.news.score}{" "}
                              <span className="text-slate-400 text-sm">
                                / 15
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center group cursor-default">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                              5
                            </div>
                            <span className="font-bold text-slate-700 text-lg group-hover:text-indigo-600 transition-colors">
                              Risk Profile
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{
                                  width: `${(data.risk.score / 10) * 100}%`,
                                }}
                              ></div>
                            </div>
                            <span className="font-mono font-black text-indigo-600 text-xl w-16 text-right">
                              {data.risk.score}{" "}
                              <span className="text-slate-400 text-sm">
                                / 10
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-8 pt-8 border-t-2 border-slate-100">
                        <div className="flex justify-between items-end">
                          <div>
                            <span className="text-sm font-bold text-slate-500 uppercase tracking-widest text-indigo-600 mb-1 block">
                              Final Result
                            </span>
                            <span
                              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider ${getBgScoreColor(data.final.totalScore)} text-white shadow-sm`}
                            >
                              {data.final.bias}
                            </span>
                          </div>
                          <div className="text-right">
                            <span
                              className={`text-6xl font-black font-mono tracking-tighter leading-none ${getScoreColor(data.final.totalScore)}`}
                            >
                              {data.final.totalScore}
                            </span>
                            <span className="text-2xl font-bold text-slate-300">
                              /100
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI REPORT TAB */}
                {activeTab === "ai-report" && (
                  <div className="space-y-6">
                    {/* The page paints from the data request; the write-up
                        arrives in a second request a few seconds later. */}
                    {aiPending ? (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-14 text-center">
                        <Loader2 className="w-8 h-8 mx-auto text-indigo-600 animate-spin" />
                        <div className="text-[17px] font-black text-slate-800 mt-3">Writing the research report…</div>
                        <p className="text-[13.5px] text-slate-500 mt-1.5 max-w-md mx-auto">
                          Prices, charts and technicals are ready now — every other tab is already usable while this
                          finishes.
                        </p>
                      </div>
                    ) : aiError ? (
                      <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 shadow-sm">
                        <div className="font-black text-[16px] text-amber-900 mb-1">Report could not be generated</div>
                        <p className="text-[13.5px] text-amber-800">{aiError}</p>
                        <p className="text-[13px] text-amber-700 mt-2">
                          Every other tab is unaffected — search the symbol again to retry the report.
                        </p>
                      </div>
                    ) : data.final.aiReport?.error ? (
                      <div className="bg-rose-50 p-6 rounded-2xl border border-rose-200 text-rose-700 font-medium shadow-sm flex items-center gap-4">
                        <AlertTriangle className="w-8 h-8" />
                        <div>
                          <div className="font-bold text-lg mb-1">
                            AI Engine Error
                          </div>
                          {data.final.aiReport.error}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        {/* Primary Conclusion */}
                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.1 }}
                          className="bg-gradient-to-br from-indigo-900 to-slate-900 p-8 rounded-3xl border border-indigo-800 shadow-xl lg:col-span-2 text-white relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-8 opacity-10">
                            <Zap className="w-32 h-32" />
                          </div>
                          <h3 className="text-xs font-black text-indigo-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />{" "}
                            AI Final Conclusion
                          </h3>
                          <p className="text-indigo-50 font-medium leading-relaxed text-xl sm:text-2xl relative z-10 max-w-4xl tracking-tight">
                            {data.final.aiReport?.finalResearchView ||
                              data.final.aiReport?.finalConclusion}
                          </p>
                          {data.final.aiReport?.executiveSummary && (
                            <div className="mt-6 pt-6 border-t border-indigo-800/50">
                              <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-2">
                                Executive Summary
                              </h4>
                              <p className="text-sm font-medium text-indigo-100/80 leading-relaxed">
                                {data.final.aiReport.executiveSummary}
                              </p>
                            </div>
                          )}
                        </motion.div>

                        {/* Breakdown Views */}
                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.2 }}
                          className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-5">
                            <TrendingUp className="w-5 h-5" />
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 mb-3 tracking-tight">
                            Chart Intelligence
                          </h3>
                          <div className="space-y-4">
                            <div>
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                Multi-Timeframe Trend
                              </span>
                              <p className="text-slate-700 font-medium">
                                {data.final.aiReport?.multiTimeframeView}
                              </p>
                            </div>
                            <div className="pt-3 border-t border-slate-100">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                Chart Setup & Extension
                              </span>
                              <p className="text-slate-700 font-medium">
                                {data.final.aiReport?.chartSetup}
                              </p>
                              <p className="text-sm text-slate-500 mt-1">
                                {data.final.aiReport?.extensionRisk}
                              </p>
                            </div>
                            <div className="pt-3 border-t border-slate-100">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                Indicators & S/R
                              </span>
                              <p className="text-slate-700 font-medium">
                                {data.final.aiReport?.indicatorView}
                              </p>
                              <p className="text-sm text-slate-500 mt-1">
                                {data.final.aiReport?.supportResistanceView}
                              </p>
                            </div>
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-5">
                            <Target className="w-5 h-5" />
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 mb-3 tracking-tight">
                            Market Context
                          </h3>
                          <div className="space-y-4">
                            <div>
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                Top-Down View
                              </span>
                              <p className="text-slate-700 font-medium">
                                {data.final.aiReport?.topDownView}
                              </p>
                            </div>
                            <div className="pt-3 border-t border-slate-100">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                Sector Strength
                              </span>
                              <p className="text-slate-700 font-medium">
                                {data.final.aiReport?.sectorStrengthView}
                              </p>
                            </div>
                          </div>
                        </motion.div>

                        {/* MOMENTUM VIEW (Part 22) */}
                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.35 }}
                          className="bg-white p-6 sm:p-8 rounded-3xl border border-indigo-200 shadow-sm hover:shadow-md transition-shadow md:col-span-2"
                        >
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-5">
                            <Zap className="w-5 h-5" />
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 mb-3 tracking-tight">
                            Momentum View
                          </h3>
                          <div className="grid sm:grid-cols-2 gap-4">
                            {[
                              ["Momentum", data.final.aiReport?.momentumView],
                              ["Price Strength", data.final.aiReport?.priceStrengthView],
                              ["Buyer Demand", data.final.aiReport?.buyerDemandView],
                              ["Quarterly Growth", data.final.aiReport?.quarterlyGrowthView],
                              ["Ownership Trend", data.final.aiReport?.ownershipTrendView],
                              ["Short-Term Setup", data.final.aiReport?.shortTermSetupView],
                            ].map(([label, val]) => (
                              <div key={label as string}>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                  {label as string}
                                </span>
                                <p className="text-slate-700 font-medium text-sm">
                                  {(val as string) ||
                                    "See the Momentum tab for full detail."}
                                </p>
                              </div>
                            ))}
                          </div>
                          <p className="mt-4 text-xs text-slate-400 italic">
                            Open the Momentum tab for the full momentum
                            breakdown, score, and AI Momentum Deep Dive. Research
                            support only — not buy/sell advice.
                          </p>
                        </motion.div>

                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.4 }}
                          className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-5">
                            <FileText className="w-5 h-5" />
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 mb-3 tracking-tight">
                            Fundamental & Valuation
                          </h3>
                          <div className="space-y-4">
                            <div>
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                Fundamental View
                              </span>
                              <p className="text-slate-700 font-medium">
                                {data.final.aiReport?.fundamentalView}
                              </p>
                            </div>
                            <div className="pt-3 border-t border-slate-100">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                Valuation View
                              </span>
                              <p className="text-slate-700 font-medium">
                                {data.final.aiReport?.valuationView}
                              </p>
                            </div>
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.5 }}
                          className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-5">
                            <BarChart2 className="w-5 h-5" />
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 mb-3 tracking-tight">
                            Trader & Investor Perspectives
                          </h3>
                          <div className="space-y-4">
                            <div>
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                Short-term Trader
                              </span>
                              <p className="text-slate-700 font-medium">
                                {data.final.aiReport?.traderView}
                              </p>
                            </div>
                            <div className="pt-4 border-t border-slate-100">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                Long-term Investor
                              </span>
                              <p className="text-slate-700 font-medium">
                                {data.final.aiReport?.investorView}
                              </p>
                            </div>
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.6 }}
                          className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow lg:col-span-2"
                        >
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                              <Target className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                              What To Track Next
                            </h3>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {data.final.aiReport?.whatToTrackNext?.map(
                              (item: string, i: number) => (
                                <div
                                  key={i}
                                  className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl hover:border-indigo-100 transition-colors"
                                >
                                  <div className="w-6 h-6 rounded-full bg-white font-bold text-xs text-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
                                    {i + 1}
                                  </div>
                                  <p className="text-sm font-medium text-slate-700 leading-snug">
                                    {item}
                                  </p>
                                </div>
                              ),
                            ) || (
                              <div className="text-sm text-slate-500">
                                Data unavailable
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* 4. Clickable Cards + Right Side Detail Drawer */}
      <AnimatePresence>
        {drawerOpen && drawerData && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ x: "100%", boxShadow: "-20px 0 50px rgba(0,0,0,0)" }}
              animate={{ x: 0, boxShadow: "-20px 0 50px rgba(0,0,0,0.1)" }}
              exit={{ x: "100%", boxShadow: "-20px 0 50px rgba(0,0,0,0)" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white z-[110] flex flex-col border-l border-slate-200 shadow-2xl"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center flex-shrink-0 bg-white/80 backdrop-blur-md">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                    <Info className="w-4 h-4" />
                  </span>
                  {drawerData.title}
                </h2>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors group"
                >
                  <X className="w-5 h-5 text-slate-400 group-hover:text-slate-900" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 bg-slate-50/50">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm mb-6 text-center transform transition-transform hover:scale-[1.02] duration-300">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    Current Value
                  </div>
                  <div className="text-5xl font-black text-indigo-600 font-mono tracking-tighter">
                    {drawerData.value}
                  </div>
                  {drawerData.interpretation && (
                    <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-black uppercase tracking-wider rounded-full shadow-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      {drawerData.interpretation}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Info className="w-4 h-4 text-indigo-500" /> What this
                      metric means
                    </h3>
                    <p className="text-slate-700 leading-relaxed font-medium">
                      {drawerData.meaning ||
                        "Explanation not available for this metric. It represents a raw value from the financial data provider."}
                    </p>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-500" /> Why it
                      matters for ranking
                    </h3>
                    <p className="text-slate-700 leading-relaxed font-medium">
                      {drawerData.whyMatters ||
                        "Shows how this metric influences overall assessment and institutional scoring."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 bg-white text-xs text-slate-500 flex justify-between items-center font-medium">
                <span>Dynamically Synthesized</span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Updated just now
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-slate-500 font-medium flex flex-col items-center justify-center min-h-screen">
          <Activity className="w-10 h-10 text-indigo-500 mb-4 animate-bounce" />
          Loading Research Workspace...
        </div>
      }
    >
      <AnalyzeContent />
    </Suspense>
  );
}

/**
 * One column of support or resistance levels.
 *
 * Fixed-width right-aligned columns rather than justify-between, so values line
 * up between rows instead of drifting with each label's own width.
 */
function LevelColumn({
  title,
  tone,
  levels,
  empty,
}: {
  title: string;
  tone: "rose" | "emerald";
  levels: any[];
  empty: string;
}) {
  const head = tone === "rose" ? "text-rose-600" : "text-emerald-600";
  const value = tone === "rose" ? "text-rose-600" : "text-emerald-600";
  const sign = tone === "rose" ? "+" : "";
  return (
    <div className="px-5 py-4">
      <div className={`text-[11px] font-black uppercase tracking-wider ${head} mb-2`}>{title}</div>
      {!levels?.length ? (
        <p className="text-[12.5px] text-slate-500 leading-relaxed">{empty}</p>
      ) : (
        <div>
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 border-b border-slate-100">
            <span>Level</span>
            <span className="w-16 text-right">Away</span>
            <span className="w-12 text-right">Touches</span>
            <span className="w-20 text-right">Strength</span>
          </div>
          {levels.map((l: any, i: number) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 text-[12.5px] py-1.5 border-b border-slate-50 last:border-0"
            >
              <span className="font-black text-slate-800 tabular-nums">{l.price.toFixed(2)}</span>
              <span className={`font-bold tabular-nums w-16 text-right ${value}`}>
                {sign}
                {l.distancePct.toFixed(1)}%
              </span>
              <span className="text-slate-400 tabular-nums w-12 text-right">{l.touches}×</span>
              <span
                className={`font-bold w-20 text-right ${
                  l.strength === "Strong" ? "text-slate-700" : "text-slate-400"
                }`}
              >
                {l.strength}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
