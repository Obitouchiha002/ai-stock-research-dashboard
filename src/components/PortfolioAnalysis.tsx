"use client";

import React, { useEffect, useMemo, useState } from "react";
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

export default function PortfolioAnalysis({ market }: { market: PortfolioMarket }) {
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
  useEffect(() => { setSettings(getPfAnalysisSettings()); }, []);

  const holdings = useMemo(() => getPortfolio().filter((h) => h.market === market), [market]);

  const run = async (withAi: boolean, over?: PfAnalysisSettings, tfOver?: "1d" | "1h") => {
    if (holdings.length === 0) { setErr("No holdings in this market yet."); return; }
    const cfg = over || settings;
    const tf = tfOver || timeframe;
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

  // Auto-load the fast technical watch on open (no AI call).
  useEffect(() => { setData(null); setNewBySymbol({}); if (holdings.length) run(false); /* eslint-disable-next-line */ }, [market]);

  const switchTf = (tf: "1d" | "1h") => { if (tf === timeframe) return; setTimeframe(tf); setNewBySymbol({}); run(false, undefined, tf); };
  const setF = (k: keyof PfAnalysisSettings, v: any) => setSettings((s) => ({ ...s, [k]: v }));
  const applySettings = () => { setPfAnalysisSettings(settings); setShowSettings(false); run(false, settings); };
  const resetSettings = () => { setSettings(DEFAULT_PF_ANALYSIS_SETTINGS); setPfAnalysisSettings(DEFAULT_PF_ANALYSIS_SETTINGS); run(false, DEFAULT_PF_ANALYSIS_SETTINGS); };

  const totals = data?.totals;
  const rows = (data?.holdings || []) as any[];
  const ai = data?.ai;
  const changedSymbols = Object.keys(newBySymbol);

  return (
    <div className="space-y-5">
      {/* Technical / Fundamental sub-toggle */}
      <div className="flex rounded-xl bg-slate-100 p-1 w-fit">
        {(["technical", "fundamental"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-lg text-xs font-black transition ${mode === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {m === "technical" ? "📈 Technical" : "🏛 Fundamental"}
          </button>
        ))}
      </div>

      {mode === "fundamental" ? (
        <PortfolioFundamentals market={market} />
      ) : (
      <>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 p-5">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" /> Advanced Portfolio Analysis
          </h2>
          <p className="text-[13px] text-slate-500 font-medium mt-0.5">
            Technical health of every holding + a professional AI analyst read — {market}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold border border-indigo-200 bg-indigo-50 text-indigo-700">{settings.style}</span>
            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold border border-slate-200 bg-slate-50 text-slate-600">{settings.risk} · {settings.horizon}</span>
            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold border border-slate-200 bg-slate-50 text-slate-600 tabular-nums">RSI {settings.rsiOverbought}/{settings.rsiOversold} · ADX {settings.adxTrend}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Timeframe toggle — Daily vs Hourly */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
            {(["1d", "1h"] as const).map((tf) => (
              <button key={tf} onClick={() => switchTf(tf)} disabled={loading}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition disabled:opacity-50 ${timeframe === tf ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {tf === "1d" ? "Daily" : "Hourly"}
              </button>
            ))}
          </div>
          <button onClick={() => setShowSettings((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border transition ${showSettings ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> Customize
          </button>
          <button onClick={() => run(false)} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={() => run(true)} disabled={aiLoading || !rows.length}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {ai ? "Refresh AI report" : "Generate AI report"}
          </button>
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

      {/* Timeframe overview banner */}
      {totals && (
        <div className={`rounded-2xl border p-4 ${timeframe === "1h" ? "border-violet-200 bg-violet-50/50" : "border-sky-200 bg-sky-50/50"}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2.5 py-0.5 rounded-full text-[12px] font-black ${timeframe === "1h" ? "bg-violet-600 text-white" : "bg-sky-600 text-white"}`}>{timeframe === "1h" ? "⏱ HOURLY" : "📊 DAILY"}</span>
            <span className="text-[13px] font-bold text-slate-700">{timeframe === "1h" ? "Short-term / intraday swings" : "The primary trend"}</span>
          </div>
          <p className="text-[13px] text-slate-600 font-medium">
            Across {totals.holdingsCount} holdings: <b className="text-emerald-700">{totals.trendCounts.Uptrend} uptrend</b> · <b className="text-rose-700">{totals.trendCounts.Downtrend} downtrend</b> · {totals.trendCounts.Sideways} sideways. <b className="text-emerald-700">{totals.perfectUp}</b> in a perfect up-stack, <b className="text-rose-700">{totals.perfectDown}</b> in a perfect down-stack. {totals.overbought} overbought, {totals.oversold} oversold. Toggle Daily/Hourly above to compare.
          </p>
        </div>
      )}

      {/* Summary strip */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Holdings" value={String(totals.holdingsCount)} sub={totals.topPosition ? `Top ${totals.topPosition.symbol} · ${totals.topPosition.pct}%` : ""} />
          <Stat label="Trend mix" value={`${totals.trendCounts.Uptrend}↑ ${totals.trendCounts.Downtrend}↓`} sub={`${totals.trendCounts.Sideways} sideways`} tone={totals.trendCounts.Downtrend > totals.trendCounts.Uptrend ? "bear" : "bull"} />
          <Stat label="MA alignment" value={`${totals.perfectUp}↑ ${totals.perfectDown}↓`} sub="perfect stack" tone={totals.perfectDown > totals.perfectUp ? "bear" : "bull"} />
          <Stat label="Overbought / Oversold" value={`${totals.overbought} / ${totals.oversold}`} sub={`RSI ≥${settings.rsiOverbought} / ≤${settings.rsiOversold}`} tone={totals.overbought > 0 ? "warn" : "info"} />
          <Stat label="Below 200-DMA" value={String(totals.belowSma200)} sub={`${totals.weakTrend} weak trend`} tone={totals.belowSma200 > 0 ? "bear" : "bull"} />
        </div>
      )}

      {/* Technical Watch table */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-indigo-500" />
            <h3 className="text-[12px] font-black uppercase tracking-wide text-slate-600">Technical Watch · {timeframe === "1h" ? "Hourly" : "Daily"}</h3>
            <span className="text-[11px] text-slate-400 font-semibold ml-auto hidden sm:block">RSI · ADX(±DI) · trend · moving-average stack</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-black text-slate-500 uppercase bg-slate-100 border-b border-slate-200">
                  <th className="text-left px-4 py-2.5">Stock</th>
                  <th className="text-right px-2 py-2.5">RSI</th>
                  <th className="text-center px-2 py-2.5">ADX (±DI)</th>
                  <th className="text-center px-2 py-2.5">Trend</th>
                  <th className="text-left px-3 py-2.5">Moving average</th>
                  <th className="text-left px-3 py-2.5">Signals</th>
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
                  return (
                    <tr key={r.symbol} className="border-b border-slate-100 last:border-0 even:bg-slate-50/50 hover:bg-indigo-50/40 align-top">
                      <td className="px-4 py-2.5">
                        <Link href={`/charts?symbol=${encodeURIComponent(r.symbol)}`} className="font-black text-slate-900 hover:text-indigo-600">{r.symbol}</Link>
                        <div className="text-[11px] text-slate-500 font-medium truncate max-w-[160px]">{r.name}</div>
                      </td>
                      {!t?.ok ? (
                        <td colSpan={5} className="px-3 py-2.5"><span className="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-0.5">Technical data unavailable</span></td>
                      ) : (
                        <>
                          <td className="px-2 py-2.5 text-right">
                            <span className={`inline-block text-[15px] font-black tabular-nums ${rsiHasBg ? "px-1.5 py-0.5 rounded-md" : ""} ${rsiBadge}`}>{t.rsi ?? "—"}</span>
                          </td>
                          <td className="px-2 py-2.5 text-center whitespace-nowrap">
                            <div className={`font-black tabular-nums text-[15px] leading-tight ${t.diUp == null ? "text-slate-800" : t.diUp ? "text-emerald-600" : "text-rose-600"}`}>
                              {t.diUp != null && <span className="text-[10px] mr-0.5">{t.diUp ? "▲" : "▼"}</span>}{t.adx ?? "—"}
                            </div>
                            {(t.plusDI != null || t.minusDI != null) && (
                              <div className="text-[10.5px] font-bold tabular-nums leading-tight mt-0.5">
                                <span className="text-emerald-600">+DI {t.plusDI != null ? Math.round(t.plusDI) : "—"}</span>
                                <span className="text-slate-300"> · </span>
                                <span className="text-rose-600">−DI {t.minusDI != null ? Math.round(t.minusDI) : "—"}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[12px] font-black border ${TREND_BADGE[t.trend] || TREND_BADGE["—"]}`}>{t.trend}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            {t.maStack ? (
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[12px] font-bold border ${TONE[t.maStack.tone] || TONE.info}`}>{t.maStack.label}</span>
                            ) : <span className="text-[12px] text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {(t.signals || []).length === 0 && <span className="text-[12px] text-slate-400">—</span>}
                              {(t.signals || []).map((s: any) => (
                                <span key={s.key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px] font-bold border ${TONE[s.tone] || TONE.info} ${fresh.includes(s.key) ? "ring-2 ring-amber-400" : ""}`}>
                                  {fresh.includes(s.key) && <span className="text-[8px] font-black text-amber-600">NEW</span>}
                                  {s.label}
                                </span>
                              ))}
                            </div>
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
            Research support only — not buy/sell advice. Signals describe the current chart condition.
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5">
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-lg font-black tabular-nums mt-0.5 ${vc}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 font-medium">{sub}</div>}
    </div>
  );
}

function labelFor(rows: any[], sym: string, key: string) {
  const r = rows.find((x) => x.symbol === sym);
  const s = (r?.tech?.signals || []).find((x: any) => x.key === key);
  return s?.label || key;
}
