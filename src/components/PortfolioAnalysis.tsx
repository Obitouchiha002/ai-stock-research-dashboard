"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, Sparkles, RefreshCw, AlertTriangle, Bell, ShieldAlert,
  TrendingUp, TrendingDown, ArrowRight, Eye, Loader2,
} from "lucide-react";
import { getPortfolio, getPfTechSeen, setPfTechSeen, logAiUsageDetailed, type PortfolioMarket } from "@/lib/storage";

const TONE: Record<string, string> = {
  bull: "text-emerald-700 bg-emerald-50 border-emerald-200",
  bear: "text-rose-700 bg-rose-50 border-rose-200",
  warn: "text-amber-700 bg-amber-50 border-amber-200",
  info: "text-slate-600 bg-slate-50 border-slate-200",
};
const TREND_BADGE: Record<string, string> = {
  Uptrend: "text-emerald-700 bg-emerald-50 border-emerald-200",
  Downtrend: "text-rose-700 bg-rose-50 border-rose-200",
  Sideways: "text-amber-700 bg-amber-50 border-amber-200",
  "—": "text-slate-400 bg-slate-50 border-slate-200",
};
const HEALTH: Record<string, string> = {
  Healthy: "text-emerald-700 bg-emerald-50 border-emerald-200",
  Watch: "text-amber-700 bg-amber-50 border-amber-200",
  Weak: "text-rose-700 bg-rose-50 border-rose-200",
};
const RISK_LEVEL: Record<string, string> = {
  Low: "text-emerald-700 bg-emerald-50 border-emerald-300",
  Moderate: "text-sky-700 bg-sky-50 border-sky-300",
  Elevated: "text-amber-700 bg-amber-50 border-amber-300",
  High: "text-rose-700 bg-rose-50 border-rose-300",
};

function rsiColor(v: number | null) {
  if (v == null) return "text-slate-400";
  if (v >= 70) return "text-rose-600";
  if (v <= 30) return "text-amber-600";
  if (v >= 50) return "text-emerald-600";
  return "text-slate-600";
}

export default function PortfolioAnalysis({ market }: { market: PortfolioMarket }) {
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState("");
  // symbol -> list of signal keys that are NEW since the last time analysis ran.
  const [newBySymbol, setNewBySymbol] = useState<Record<string, string[]>>({});

  const holdings = useMemo(() => getPortfolio().filter((h) => h.market === market), [market]);

  const run = async (withAi: boolean) => {
    if (holdings.length === 0) { setErr("No holdings in this market yet."); return; }
    withAi ? setAiLoading(true) : setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/portfolio-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market,
          withAi,
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
        const keys: string[] = (r.tech?.signals || []).map((s: any) => s.key);
        const prev = seen[r.symbol]?.signals || [];
        const added = keys.filter((k) => !prev.includes(k));
        if (added.length && seen[r.symbol]) fresh[r.symbol] = added; // only if we had a prior baseline
        nextSeen[r.symbol] = { signals: keys, ts: now };
      });
      setNewBySymbol(fresh);
      setPfTechSeen(nextSeen);
    } catch {
      setErr("Could not load analysis. Please try again.");
    } finally {
      withAi ? setAiLoading(false) : setLoading(false);
    }
  };

  // Auto-load the fast technical watch on open (no AI call).
  useEffect(() => { setData(null); setNewBySymbol({}); if (holdings.length) run(false); /* eslint-disable-next-line */ }, [market]);

  const totals = data?.totals;
  const rows = (data?.holdings || []) as any[];
  const ai = data?.ai;
  const changedSymbols = Object.keys(newBySymbol);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 p-5">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" /> Advanced Portfolio Analysis
          </h2>
          <p className="text-[13px] text-slate-500 font-medium mt-0.5">
            Technical health of every holding + a professional AI analyst read — {market}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Summary strip */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Holdings" value={String(totals.holdingsCount)} sub={totals.topPosition ? `Top ${totals.topPosition.symbol} · ${totals.topPosition.pct}%` : ""} />
          <Stat label="Trend mix" value={`${totals.trendCounts.Uptrend}↑ ${totals.trendCounts.Downtrend}↓`} sub={`${totals.trendCounts.Sideways} sideways`} tone={totals.trendCounts.Downtrend > totals.trendCounts.Uptrend ? "bear" : "bull"} />
          <Stat label="Overbought / Oversold" value={`${totals.overbought} / ${totals.oversold}`} sub="RSI ≥70 / ≤30" tone={totals.overbought > 0 ? "warn" : "info"} />
          <Stat label="Below 200-DMA" value={String(totals.belowSma200)} sub={`${totals.weakTrend} weak trend`} tone={totals.belowSma200 > 0 ? "bear" : "bull"} />
        </div>
      )}

      {/* Technical Watch table */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-200 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-indigo-500" />
            <h3 className="text-[12px] font-black uppercase tracking-wide text-slate-600">Technical Watch</h3>
            <span className="text-[11px] text-slate-400 font-semibold ml-auto">RSI · ADX · trend · vs moving averages</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-bold text-slate-400 uppercase bg-slate-50/60 border-b border-slate-100">
                  <th className="text-left px-4 py-2">Stock</th>
                  <th className="text-right px-2 py-2">RSI</th>
                  <th className="text-right px-2 py-2">ADX</th>
                  <th className="text-center px-2 py-2">Trend</th>
                  <th className="text-right px-2 py-2">vs 50-DMA</th>
                  <th className="text-right px-2 py-2">vs 200-DMA</th>
                  <th className="text-left px-3 py-2">Signals</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const t = r.tech;
                  const fresh = newBySymbol[r.symbol] || [];
                  return (
                    <tr key={r.symbol} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 align-top">
                      <td className="px-4 py-2.5">
                        <Link href={`/charts?symbol=${encodeURIComponent(r.symbol)}`} className="font-black text-slate-800 hover:text-indigo-600">{r.symbol}</Link>
                        <div className="text-[11px] text-slate-400 font-medium truncate max-w-[160px]">{r.name}</div>
                      </td>
                      {!t?.ok ? (
                        <td colSpan={6} className="px-3 py-2.5 text-[12px] text-slate-400 italic">Technical data unavailable</td>
                      ) : (
                        <>
                          <td className={`px-2 py-2.5 text-right font-black tabular-nums ${rsiColor(t.rsi)}`}>{t.rsi ?? "—"}</td>
                          <td className="px-2 py-2.5 text-right font-bold text-slate-700 tabular-nums">{t.adx ?? "—"}</td>
                          <td className="px-2 py-2.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-black border ${TREND_BADGE[t.trend] || TREND_BADGE["—"]}`}>{t.trend}</span>
                          </td>
                          <td className={`px-2 py-2.5 text-right font-bold tabular-nums ${pctColor(t.vsSma50Pct)}`}>{fmtPct(t.vsSma50Pct)}</td>
                          <td className={`px-2 py-2.5 text-right font-bold tabular-nums ${pctColor(t.vsSma200Pct)}`}>{fmtPct(t.vsSma200Pct)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {(t.signals || []).length === 0 && <span className="text-[11px] text-slate-400">—</span>}
                              {(t.signals || []).map((s: any) => (
                                <span key={s.key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${TONE[s.tone] || TONE.info} ${fresh.includes(s.key) ? "ring-2 ring-amber-400" : ""}`}>
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
          <div className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
            Research support only — not buy/sell advice. Signals describe the current chart condition.
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

function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function pctColor(v: number | null) {
  if (v == null) return "text-slate-400";
  return v >= 0 ? "text-emerald-600" : "text-rose-600";
}
function labelFor(rows: any[], sym: string, key: string) {
  const r = rows.find((x) => x.symbol === sym);
  const s = (r?.tech?.signals || []).find((x: any) => x.key === key);
  return s?.label || key;
}
