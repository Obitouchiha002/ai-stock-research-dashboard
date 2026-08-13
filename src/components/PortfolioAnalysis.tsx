"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity, Sparkles, RefreshCw, AlertTriangle, Bell, ShieldAlert,
  TrendingUp, TrendingDown, ArrowRight, Eye, Loader2, SlidersHorizontal, RotateCcw,
} from "lucide-react";
import {
  getPortfolio, getPfTechSeen, setPfTechSeen, logAiUsageDetailed,
  getPfAnalysisSettings, setPfAnalysisSettings, DEFAULT_PF_ANALYSIS_SETTINGS,
  type PortfolioMarket, type PfAnalysisSettings,
} from "@/lib/storage";
import PortfolioFundamentals from "@/components/PortfolioFundamentals";

const STYLE_OPTS = ["Long-term investor", "Position trader", "Swing trader", "Day trader"];
const RISK_OPTS = ["Conservative", "Balanced", "Aggressive"];
const HORIZON_OPTS = ["Short (weeks)", "Medium (months)", "Long (years)"];

const TONE: Record<string, string> = {
  bull: "text-emerald-800 bg-emerald-100 border-emerald-300",
  bear: "text-rose-800 bg-rose-100 border-rose-300",
  warn: "text-amber-800 bg-amber-100 border-amber-300",
  info: "text-slate-700 bg-slate-100 border-slate-300",
};
const TREND_BADGE: Record<string, string> = {
  Uptrend: "text-white bg-emerald-600 border-emerald-600",
  Downtrend: "text-white bg-rose-600 border-rose-600",
  Sideways: "text-amber-900 bg-amber-200 border-amber-400",
  "—": "text-slate-500 bg-slate-100 border-slate-300",
};
const ACTION: Record<string, string> = {
  Buy: "text-white bg-emerald-600 border-emerald-600",
  Sell: "text-white bg-rose-600 border-rose-600",
  Hold: "text-amber-900 bg-amber-200 border-amber-400",
};
// The price-vs-MA combination the moving-average read is based on, e.g. CMP>10>20>50>200.
function maCombo(t: any): string | null {
  const seq: [string, number | null][] = [["CMP", t.price], ["10", t.sma10], ["20", t.sma20], ["50", t.sma50], ["200", t.sma200]];
  if (seq.some(([, v]) => v == null)) return null;
  let s = "";
  for (let i = 0; i < seq.length; i++) { s += seq[i][0]; if (i < seq.length - 1) s += (seq[i][1]! > seq[i + 1][1]! ? ">" : "<"); }
  return s;
}
const HEALTH: Record<string, string> = {
  Healthy: "text-white bg-emerald-600 border-emerald-600",
  Watch: "text-amber-900 bg-amber-200 border-amber-400",
  Weak: "text-white bg-rose-600 border-rose-600",
};
const RISK_LEVEL: Record<string, string> = {
  Low: "text-emerald-700 bg-emerald-50 border-emerald-300",
  Moderate: "text-sky-700 bg-sky-50 border-sky-300",
  Elevated: "text-amber-700 bg-amber-50 border-amber-300",
  High: "text-rose-700 bg-rose-50 border-rose-300",
};

type Holdingish = { symbol: string; name?: string; shares?: number; buyPrice?: number; currentPrice?: number; market?: string };
export default function PortfolioAnalysis({ market, holdingsOverride, hideFundamental, label }: { market: string; holdingsOverride?: Holdingish[]; hideFundamental?: boolean; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState("");
  // symbol -> list of signal keys that are NEW since the last time analysis ran.
  const [newBySymbol, setNewBySymbol] = useState<Record<string, string[]>>({});
  const [settings, setSettings] = useState<PfAnalysisSettings>(DEFAULT_PF_ANALYSIS_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [timeframe, setTimeframe] = useState<"1d" | "1h">("1d");
  const [mode, setMode] = useState<"technical" | "fundamental">("technical");
  const [ready, setReady] = useState(false);
  // Cache results per {timeframe|symbol-set} so toggling Daily↔Hourly or
  // switching markets/tabs and back is instant (5-minute freshness).
  const cacheRef = useRef<Record<string, { j: any; at: number }>>({});
  const CACHE_TTL = 5 * 60 * 1000;
  useEffect(() => { setSettings(getPfAnalysisSettings()); setReady(true); }, []);

  const holdings = useMemo<Holdingish[]>(() => holdingsOverride ?? getPortfolio().filter((h) => h.market === market), [holdingsOverride, market]);
  const sig = useMemo(() => holdings.map((h) => h.symbol).join(","), [holdings]);

  const run = async (withAi: boolean, over?: PfAnalysisSettings, tfOver?: "1d" | "1h", force = false) => {
    if (holdings.length === 0) { setErr(hideFundamental ? "No symbols to analyze." : "No holdings in this market yet."); return; }
    const cfg = over || settings;
    const tf = tfOver || timeframe;
    const key = `${market}|${tf}|${sig}`;
    // Serve a fresh cached result instantly (unless forcing or asking for AI).
    if (!withAi && !force) {
      const c = cacheRef.current[key];
      if (c && Date.now() - c.at < CACHE_TTL) { setData(c.j); setNewBySymbol({}); setErr(""); return; }
    }
    withAi ? setAiLoading(true) : setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/portfolio-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market,
          withAi,
          settings: cfg,
          timeframe: tf,
          holdings: holdings.map((h) => ({
            symbol: h.symbol, name: h.name, shares: h.shares,
            buyPrice: h.buyPrice, currentPrice: h.currentPrice, market: h.market,
          })),
        }),
      });
      const j = await res.json();
      if (j.error && !j.holdings) { setErr(j.error); return; }
      setData(j);
      cacheRef.current[key] = { j, at: Date.now() };
      if (j.ai && !j.ai.error) logAiUsageDetailed("Portfolio AI Analysis", { tokens: j.ai.aiTokens });

      // Diff signals vs last-seen to surface what changed, then update the baseline.
      const seen = getPfTechSeen();
      const nextSeen: Record<string, { signals: string[]; ts: number }> = {};
      const fresh: Record<string, string[]> = {};
      const now = Date.now();
      (j.holdings || []).forEach((r: any) => {
        const sk = `${tf}:${r.symbol}`; // namespace by timeframe
        const keys: string[] = (r.tech?.signals || []).map((s: any) => s.key);
        const prev = seen[sk]?.signals || [];
        const added = keys.filter((k) => !prev.includes(k));
        if (added.length && seen[sk]) fresh[r.symbol] = added; // only if we had a prior baseline
        nextSeen[sk] = { signals: keys, ts: now };
      });
      setNewBySymbol(fresh);
      setPfTechSeen({ ...seen, ...nextSeen }); // keep the other timeframe's baseline
    } catch {
      setErr("Could not load analysis. Please try again.");
    } finally {
      withAi ? setAiLoading(false) : setLoading(false);
    }
  };

  // Auto-load the fast technical watch on open / when the symbol set changes —
  // but only after saved settings have loaded, so the first run uses the user's
  // own thresholds (not the defaults).
  useEffect(() => { if (!ready) return; setData(null); setNewBySymbol({}); if (holdings.length) run(false); /* eslint-disable-next-line */ }, [sig, market, ready]);

  const switchTf = (tf: "1d" | "1h") => { if (tf === timeframe) return; setTimeframe(tf); setNewBySymbol({}); run(false, undefined, tf); };
  const setF = (k: keyof PfAnalysisSettings, v: any) => setSettings((s) => ({ ...s, [k]: v }));
  // Thresholds change server-side output, so bypass the cache when applying them.
  const applySettings = () => { setPfAnalysisSettings(settings); setShowSettings(false); cacheRef.current = {}; run(false, settings, undefined, true); };
  const resetSettings = () => { setSettings(DEFAULT_PF_ANALYSIS_SETTINGS); setPfAnalysisSettings(DEFAULT_PF_ANALYSIS_SETTINGS); cacheRef.current = {}; run(false, DEFAULT_PF_ANALYSIS_SETTINGS, undefined, true); };

  const totals = data?.totals;
  const rows = (data?.holdings || []) as any[];
  const ai = data?.ai;
  const changedSymbols = Object.keys(newBySymbol);

  return (
    <div className="space-y-5">
      {/* Technical / Fundamental sub-toggle */}
      {!hideFundamental && (
        <div className="flex rounded-xl bg-slate-100 p-1 w-fit border border-slate-200">
          {(["technical", "fundamental"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-5 py-2 rounded-lg text-[13px] font-black transition ${mode === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
              {m === "technical" ? "📈 Technical" : "🏛 Fundamental"}
            </button>
          ))}
        </div>
      )}

      {mode === "fundamental" && !hideFundamental ? (
        <PortfolioFundamentals market={market as PortfolioMarket} />
      ) : (
      <>
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Title + timeframe */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 bg-gradient-to-r from-indigo-50 via-white to-white border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 grid place-items-center shadow-md shadow-indigo-600/30 shrink-0">
              <Activity className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-tight truncate">{label || "Advanced Portfolio Analysis"}</h2>
              <p className="text-[13px] text-slate-500 font-semibold">Technical health + a professional AI read · {market}</p>
            </div>
          </div>
          {/* Daily / Hourly — bigger segmented */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 shrink-0">
            {(["1d", "1h"] as const).map((tf) => (
              <button key={tf} onClick={() => switchTf(tf)} disabled={loading}
                className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-black transition disabled:opacity-50 ${timeframe === tf ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                {tf === "1d" ? "Daily" : "Hourly"}
              </button>
            ))}
          </div>
        </div>
        {/* Profile chips + actions */}
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3">
          <span className="px-2.5 py-1 rounded-lg text-[11.5px] font-black border border-indigo-200 bg-indigo-50 text-indigo-700">{settings.style}</span>
          <span className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold border border-slate-200 bg-slate-50 text-slate-600">{settings.risk} · {settings.horizon}</span>
          <span className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold border border-slate-200 bg-slate-50 text-slate-600 tabular-nums">RSI {settings.rsiOverbought}/{settings.rsiOversold} · ADX {settings.adxTrend}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button onClick={() => setShowSettings((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-black border-2 transition ${showSettings ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}>
              <SlidersHorizontal className="w-4 h-4" /> Customize
            </button>
            <button onClick={() => run(false, undefined, undefined, true)} disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-black border-2 border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => run(true)} disabled={aiLoading || !rows.length}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-black bg-indigo-600 text-white shadow-md shadow-indigo-600/25 hover:bg-indigo-700 disabled:opacity-50">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {ai ? "Refresh AI report" : "Generate AI report"}
            </button>
          </div>
        </div>
      </div>

      {/* Customize panel — your thresholds & profile drive the signals + AI report */}
      {showSettings && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-black text-slate-800">Customize the analysis</h3>
            <span className="text-[11px] text-slate-400 font-medium">Signals &amp; the AI report follow these — not generic defaults.</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <NumField label="RSI overbought ≥" value={settings.rsiOverbought} min={50} max={95} onChange={(v) => setF("rsiOverbought", v)} />
            <NumField label="RSI oversold ≤" value={settings.rsiOversold} min={5} max={50} onChange={(v) => setF("rsiOversold", v)} />
            <NumField label="Trend when ADX ≥" value={settings.adxTrend} min={10} max={50} onChange={(v) => setF("adxTrend", v)} />
            <NumField label="+DI/−DI gap to confirm ≥" value={settings.diSpread} min={0} max={40} onChange={(v) => setF("diSpread", v)} />
            <NumField label="Volume surge ≥ %" value={settings.volSurge} min={10} max={300} onChange={(v) => setF("volSurge", v)} />
            <div />
            <SelField label="Investing style" value={settings.style} opts={STYLE_OPTS} onChange={(v) => setF("style", v)} />
            <SelField label="Risk tolerance" value={settings.risk} opts={RISK_OPTS} onChange={(v) => setF("risk", v)} />
            <SelField label="Time horizon" value={settings.horizon} opts={HORIZON_OPTS} onChange={(v) => setF("horizon", v)} />
          </div>
          <div className="mb-4">
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-400 mb-1">Focus (optional) — what should the analyst pay attention to?</label>
            <input value={settings.focus} onChange={(e) => setF("focus", e.target.value)}
              placeholder="e.g. flag anything losing momentum, watch my tech concentration, dividend safety…"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={applySettings} disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Apply &amp; refresh
            </button>
            <button onClick={resetSettings}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
            </button>
            <span className="text-[11px] text-slate-400 ml-1">Regenerate the AI report after applying to see it re-tailored.</span>
          </div>
        </div>
      )}

      {err && <div className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{err}</div>}

      {loading && !rows.length && (
        <div className="flex items-center gap-2 text-sm text-slate-500 px-1 py-6"><Loader2 className="w-4 h-4 animate-spin" /> Reading technical conditions for your holdings…</div>
      )}

      {/* "What changed" alert banner */}
      {changedSymbols.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-amber-800 font-black text-sm mb-2">
            <Bell className="w-4 h-4" /> New technical changes since your last check
          </div>
          <div className="space-y-1.5">
            {changedSymbols.map((sym) => (
              <div key={sym} className="text-[13px] text-amber-900">
                <span className="font-black">{sym}</span>{" "}
                <span className="text-amber-700">{newBySymbol[sym].map((k) => labelFor(rows, sym, k)).join(" · ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeframe overview banner — compact single line */}
      {totals && (
        <div className={`rounded-xl border px-3.5 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 ${timeframe === "1h" ? "border-violet-200 bg-violet-50/60" : "border-sky-200 bg-sky-50/60"}`}>
          <span className={`px-2 py-0.5 rounded-md text-[11px] font-black shrink-0 ${timeframe === "1h" ? "bg-violet-600 text-white" : "bg-sky-600 text-white"}`}>{timeframe === "1h" ? "⏱ HOURLY" : "📊 DAILY"}</span>
          <span className="text-[12px] font-bold text-slate-700">{timeframe === "1h" ? "Short-term / intraday" : "The primary trend"}</span>
          <span className="text-[12px] text-slate-500 font-medium">
            · <b className="text-emerald-700">{totals.trendCounts.Uptrend} up</b> · <b className="text-rose-700">{totals.trendCounts.Downtrend} down</b> · {totals.trendCounts.Sideways} sideways · {totals.perfectUp}↑{totals.perfectDown}↓ perfect stack · {totals.overbought}/{totals.oversold} OB/OS
          </span>
        </div>
      )}

      {/* Summary strip — compact stat cards */}
      {totals && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          <Stat label="Holdings" value={String(totals.holdingsCount)} sub={totals.topPosition ? `Top ${totals.topPosition.symbol.replace(".NS", "")}` : ""} />
          <Stat label="Trend mix" value={`${totals.trendCounts.Uptrend}↑ ${totals.trendCounts.Downtrend}↓`} sub={`${totals.trendCounts.Sideways} side`} tone={totals.trendCounts.Downtrend > totals.trendCounts.Uptrend ? "bear" : "bull"} />
          <Stat label="MA align" value={`${totals.perfectUp}↑ ${totals.perfectDown}↓`} sub="perfect" tone={totals.perfectDown > totals.perfectUp ? "bear" : "bull"} />
          <Stat label="OB / OS" value={`${totals.overbought} / ${totals.oversold}`} sub={`≥${settings.rsiOverbought}/≤${settings.rsiOversold}`} tone={totals.overbought > 0 ? "warn" : "info"} />
          <Stat label="Below 200" value={String(totals.belowSma200)} sub={`${totals.weakTrend} weak`} tone={totals.belowSma200 > 0 ? "bear" : "bull"} />
        </div>
      )}

      {/* Technical Watch table */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-indigo-500" />
            <h3 className="text-[12px] font-black uppercase tracking-wide text-slate-600">Technical Watch · {timeframe === "1h" ? "Hourly" : "Daily"}</h3>
            <span className="text-[11px] text-slate-400 font-semibold ml-auto hidden sm:block">RSI · ADX · volume · MA · S/R · pattern · candle · action</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-black text-slate-500 uppercase bg-slate-100 border-b border-slate-200">
                  <th className="text-left px-4 py-3">Stock</th>
                  <th className="text-right px-3 py-3">RSI</th>
                  <th className="text-center px-3 py-3">ADX (±DI)</th>
                  <th className="text-right px-3 py-3">Volume</th>
                  <th className="text-left px-3 py-3">Moving average</th>
                  <th className="text-right px-3 py-3">Support / Resist.</th>
                  <th className="text-left px-3 py-3">Pattern</th>
                  <th className="text-left px-3 py-3">Candle</th>
                  <th className="text-center px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const t = r.tech;
                  const fresh = newBySymbol[r.symbol] || [];
                  const ob = settings.rsiOverbought, os = settings.rsiOversold;
                  const rsiBadge = t?.rsi == null ? "text-slate-400"
                    : t.rsi >= ob ? "bg-rose-100 text-rose-800"
                    : t.rsi <= os ? "bg-amber-100 text-amber-800"
                    : t.rsi >= 50 ? "text-emerald-700" : "text-slate-600";
                  const rsiHasBg = t?.rsi != null && (t.rsi >= ob || t.rsi <= os);
                  const rsiArrow = t?.rsiTrend === "rising" ? "↑" : t?.rsiTrend === "falling" ? "↓" : t?.rsiTrend === "stagnant" ? "→" : "";
                  const combo = t?.ok ? maCombo(t) : null;
                  return (
                    <tr key={r.symbol} className="border-b border-slate-100 even:bg-slate-50/40 hover:bg-indigo-50/40 align-middle">
                      <td className="px-4 py-3 align-middle">
                        <Link href={`/charts?symbol=${encodeURIComponent(r.symbol)}`} className="font-black text-slate-900 hover:text-indigo-600">{r.symbol}</Link>
                        <div className="text-[11px] text-slate-500 font-medium truncate max-w-[150px]">{r.name}</div>
                      </td>
                      {!t?.ok ? (
                        <td colSpan={8} className="px-3 py-3"><span className="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-0.5">Technical data unavailable</span></td>
                      ) : (
                        <>
                          <td className="px-3 py-3 text-right whitespace-nowrap align-middle">
                            <span className={`inline-block text-[15px] font-black tabular-nums ${rsiHasBg ? "px-1.5 py-0.5 rounded-md" : ""} ${rsiBadge}`}>{t.rsi ?? "—"}</span>
                            {rsiArrow && <span className={`ml-1 text-[12px] font-black ${t.rsiTrend === "rising" ? "text-emerald-600" : t.rsiTrend === "falling" ? "text-rose-600" : "text-slate-400"}`}>{rsiArrow}</span>}
                          </td>
                          <td className="px-3 py-3 text-center whitespace-nowrap align-middle">
                            <div className={`font-black tabular-nums text-[15px] leading-tight ${t.diUp == null ? "text-slate-800" : t.diUp ? "text-emerald-600" : "text-rose-600"}`}>
                              {t.diUp != null && <span className="text-[10px] mr-0.5">{t.diUp ? "▲" : "▼"}</span>}{t.adx ?? "—"}
                            </div>
                            {(t.plusDI != null || t.minusDI != null) && (
                              <div className="text-[10px] font-bold tabular-nums leading-tight mt-0.5">
                                <span className="text-emerald-600">+DI {t.plusDI != null ? Math.round(t.plusDI) : "—"}</span>
                                <span className="text-slate-300"> · </span>
                                <span className="text-rose-600">−DI {t.minusDI != null ? Math.round(t.minusDI) : "—"}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right whitespace-nowrap align-middle">
                            {t.volVs5Pct != null ? (
                              <>
                                <div className={`font-black tabular-nums text-[13px] ${t.volRising ? "text-emerald-600" : "text-slate-500"}`}>{t.volRising ? "▲" : "▼"} {t.volVs5Pct > 0 ? "+" : ""}{Math.round(t.volVs5Pct)}%</div>
                                <div className="text-[10px] text-slate-400">vs 5-day avg</div>
                              </>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-3 align-middle min-w-[152px]">
                            {t.maStack ? (
                              <>
                                <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11.5px] font-bold border ${TONE[t.maStack.tone] || TONE.info}`}>{t.maStack.label}</span>
                                {combo && <div className="text-[10px] text-slate-400 font-bold tabular-nums mt-1 tracking-tight">{combo}</div>}
                              </>
                            ) : <span className="text-[12px] text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right whitespace-nowrap align-middle leading-tight">
                            {t.resistance != null ? (
                              <>
                                <div className="text-[12px] font-black text-rose-600 tabular-nums">R {t.resistance}</div>
                                <div className="text-[12px] font-black text-emerald-600 tabular-nums">S {t.support}</div>
                                {t.pivot != null && <div className="text-[10px] text-slate-400 tabular-nums">pivot {t.pivot}</div>}
                              </>
                            ) : <span className="text-[12px] text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 align-middle min-w-[132px]">
                            {t.chartPattern ? (
                              <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11.5px] font-bold border ${TONE[t.chartPattern.tone] || TONE.info}`}>{t.chartPattern.label}</span>
                            ) : <span className="text-[12px] text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 align-middle min-w-[150px] max-w-[190px]">
                            {(t.patterns || []).length > 0 ? (
                              <>
                                <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11.5px] font-black border ${TONE[t.patterns[0].tone] || TONE.info}`}>
                                  {t.patterns[0].tone === "bull" ? "▲" : t.patterns[0].tone === "bear" ? "▼" : "◆"} {t.patterns[0].name}
                                </span>
                                <div className={`text-[10px] font-bold mt-1 ${t.patterns[0].tone === "bull" ? "text-emerald-600" : t.patterns[0].tone === "bear" ? "text-rose-600" : "text-slate-500"}`}>
                                  {t.patterns[0].tone === "bull" ? "Bullish read" : t.patterns[0].tone === "bear" ? "Bearish read" : "Indecision"}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight line-clamp-1">{t.patterns[0].meaning}</div>
                              </>
                            ) : <span className="text-[12px] text-slate-300">no pattern</span>}
                          </td>
                          <td className="px-3 py-3 text-center align-middle">
                            <span className={`inline-block whitespace-nowrap px-3 py-1 rounded-full text-[12.5px] font-black border ${ACTION[t.action] || ACTION.Hold}`}>{t.action}</span>
                            {t.overall && <div className="text-[10px] text-slate-400 font-semibold mt-1 max-w-[120px] mx-auto leading-tight line-clamp-1">{t.overall.label}</div>}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100 bg-slate-50/60">
            Action is a candlestick + trend technical signal on the {timeframe === "1h" ? "hourly" : "daily"} timeframe — a chart read, not personalised buy/sell advice. Always confirm before acting.
          </div>
        </div>
      )}

      {/* Candlestick patterns — instant, from the chart (no AI needed) */}
      {rows.some((r) => (r.tech?.patterns || []).length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-indigo-500" />
            <h3 className="text-[12px] font-black uppercase tracking-wide text-slate-600">Candlestick patterns</h3>
            <span className="text-[11px] text-slate-400 font-semibold ml-auto hidden sm:block">what the recent candles show &amp; what to watch</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-black text-slate-500 uppercase bg-slate-100 border-b border-slate-200">
                  <th className="text-left px-4 py-2.5">Stock</th>
                  <th className="text-left px-3 py-2.5">Pattern</th>
                  <th className="text-left px-3 py-2.5">What it means</th>
                  <th className="text-left px-4 py-2.5">What to watch</th>
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((r) => (r.tech?.patterns || []).map((p: any) => ({ sym: r.symbol, p }))).map(({ sym, p }, i) => (
                  <tr key={sym + p.key + i} className="border-b border-slate-100 last:border-0 even:bg-slate-50/50 align-top">
                    <td className="px-4 py-3">
                      <Link href={`/charts?symbol=${encodeURIComponent(sym)}`} className="font-black text-slate-900 hover:text-indigo-600">{sym}</Link>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-black border ${TONE[p.tone] || TONE.info}`}>
                        {p.tone === "bull" ? "▲" : p.tone === "bear" ? "▼" : "◆"} {p.name}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-slate-700 min-w-[220px]">{p.meaning}</td>
                    <td className="px-4 py-3 text-[13px] text-indigo-800 font-medium min-w-[240px]">{p.watch}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100 bg-slate-50/60">
            Patterns are hints, not signals to act on — always wait for confirmation. Research only, not buy/sell advice.
          </div>
        </div>
      )}

      {/* AI Analyst Report */}
      {aiLoading && (
        <div className="flex items-center gap-2 text-sm text-indigo-600 px-1 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Your AI analyst is reviewing the portfolio…</div>
      )}
      {ai && !ai.error && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5">
            <h3 className="text-sm font-black text-indigo-700 flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4" /> AI Analyst Report</h3>
            {ai.overview && <p className="text-sm text-slate-700 font-medium leading-relaxed mb-3">{ai.overview}</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              {ai.portfolioRisk && (
                <div className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldAlert className="w-4 h-4 text-slate-500" />
                    <span className="text-[12px] font-black uppercase tracking-wide text-slate-500">Portfolio risk</span>
                    {ai.portfolioRisk.level && <span className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-black border ${RISK_LEVEL[ai.portfolioRisk.level] || RISK_LEVEL.Moderate}`}>{ai.portfolioRisk.level}</span>}
                  </div>
                  {ai.portfolioRisk.summary && <p className="text-[13px] text-slate-700 font-medium">{ai.portfolioRisk.summary}</p>}
                  {ai.portfolioRisk.concentration && <p className="text-[12px] text-slate-500 mt-1">{ai.portfolioRisk.concentration}</p>}
                </div>
              )}
              {ai.marketContext && (
                <div className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Eye className="w-4 h-4 text-slate-500" />
                    <span className="text-[12px] font-black uppercase tracking-wide text-slate-500">Market context</span>
                  </div>
                  <p className="text-[13px] text-slate-700 font-medium">{ai.marketContext}</p>
                </div>
              )}
            </div>
          </div>

          {/* Alerts */}
          {Array.isArray(ai.alerts) && ai.alerts.length > 0 && (
            <div className="bg-white rounded-2xl border border-rose-200 shadow-sm p-5">
              <h3 className="text-sm font-black text-rose-700 flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4" /> Needs attention</h3>
              <div className="space-y-2">
                {ai.alerts.map((a: any, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
                    <span className={`mt-0.5 px-2 py-0.5 rounded-full text-[10.5px] font-black border ${a.urgency === "High" ? "text-rose-700 bg-rose-50 border-rose-300" : "text-amber-700 bg-amber-50 border-amber-300"}`}>{a.urgency || "Medium"}</span>
                    <div>
                      <span className="font-black text-slate-800 text-[13px]">{a.symbol}</span>
                      <span className="text-[13px] text-slate-600"> — {a.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-holding cards */}
          {Array.isArray(ai.holdings) && ai.holdings.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3">
              {ai.holdings.map((h: any, i: number) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-black text-slate-800">{h.symbol}</span>
                    {h.health && <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${HEALTH[h.health] || HEALTH.Watch}`}>{h.health}</span>}
                  </div>
                  {h.note && <p className="text-[13px] text-slate-700 font-medium mb-1.5">{h.note}</p>}
                  {h.risk && <p className="text-[12px] text-slate-500"><span className="font-bold text-slate-600">Risk:</span> {h.risk}</p>}
                  {h.action && <p className="text-[12px] text-indigo-700 mt-1"><span className="font-bold">Watch:</span> {h.action}</p>}
                </div>
              ))}
            </div>
          )}

          {/* What to monitor */}
          {Array.isArray(ai.whatToMonitor) && ai.whatToMonitor.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-black text-slate-700 flex items-center gap-2 mb-2.5"><Eye className="w-4 h-4 text-indigo-500" /> What to monitor next</h3>
              <ul className="space-y-1.5">
                {ai.whatToMonitor.map((w: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700"><ArrowRight className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" /> {w}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-center text-[11px] text-slate-400 italic pb-2">Research support only. No buy/sell advice or predictions.</div>
        </div>
      )}
      {ai?.error && <div className="text-[13px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">{ai.error}</div>}
      </>
      )}
    </div>
  );
}

function NumField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-black uppercase tracking-wide text-slate-400 mb-1">{label}</label>
      <input type="number" min={min} max={max} value={value}
        onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n))); }}
        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold tabular-nums focus:ring-2 focus:ring-indigo-200 outline-none" />
    </div>
  );
}

function SelField({ label, value, opts, onChange }: { label: string; value: string; opts: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-black uppercase tracking-wide text-slate-400 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-200 outline-none">
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  const vc = tone === "bull" ? "text-emerald-600" : tone === "bear" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "text-slate-800";
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2">
      <div className="text-[9.5px] font-black uppercase tracking-wide text-slate-400 truncate">{label}</div>
      <div className={`text-[16px] font-black tabular-nums leading-tight mt-0.5 ${vc}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 font-medium truncate">{sub}</div>}
    </div>
  );
}

function labelFor(rows: any[], sym: string, key: string) {
  const r = rows.find((x) => x.symbol === sym);
  const s = (r?.tech?.signals || []).find((x: any) => x.key === key);
  return s?.label || key;
}
