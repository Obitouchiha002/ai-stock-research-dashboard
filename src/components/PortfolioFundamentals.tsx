"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Landmark, RefreshCw, Loader2, Sparkles, AlertTriangle, Link2, Check, X } from "lucide-react";
import { getPortfolio, logAiUsageDetailed, type PortfolioMarket } from "@/lib/storage";

const GRADE: Record<string, string> = {
  A: "text-emerald-700 bg-emerald-50 border-emerald-400",
  B: "text-sky-700 bg-sky-50 border-sky-400",
  C: "text-amber-700 bg-amber-50 border-amber-400",
  D: "text-rose-700 bg-rose-50 border-rose-400",
};
const STORY_CLS: Record<string, string> = {
  "High-growth": "text-violet-800 bg-violet-100 border-violet-300",
  Compounder: "text-emerald-800 bg-emerald-100 border-emerald-300",
  Turnaround: "text-amber-800 bg-amber-100 border-amber-300",
  "Value/Cyclical": "text-sky-800 bg-sky-100 border-sky-300",
  Slowing: "text-rose-800 bg-rose-100 border-rose-300",
};
const CAP_COLOR: Record<string, string> = { large: "bg-emerald-500", mid: "bg-sky-500", small: "bg-amber-500" };

function fmtCap(v: number | null, cur: string) {
  if (v == null) return "—";
  const b = v / 1e9;
  if (b >= 1000) return `${cur}${(b / 1000).toFixed(2)}T`;
  if (b >= 1) return `${cur}${b.toFixed(1)}B`;
  return `${cur}${Math.round(v / 1e6)}M`;
}
const gcol = (v: number | null) => (v == null ? "text-slate-400" : v >= 0 ? "text-emerald-600" : "text-rose-600");
const gpct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`);

export default function PortfolioFundamentals({ market }: { market: PortfolioMarket }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"overall" | "large" | "mid" | "small">("overall");
  const cur = market === "Indian Stocks" ? "₹" : "$";

  const holdings = useMemo(() => getPortfolio().filter((h) => h.market === market), [market]);

  const run = async () => {
    if (holdings.length === 0) { setErr("No holdings in this market yet."); return; }
    setLoading(true); setErr("");
    try {
      const priced = holdings.map((h) => {
        const px = h.currentPrice || h.buyPrice;
        const value = h.shares * px;
        const cost = h.shares * h.buyPrice;
        return { symbol: h.symbol, value, plPct: cost > 0 ? Math.round(((value - cost) / cost) * 1000) / 10 : 0 };
      });
      const total = priced.reduce((s, r) => s + r.value, 0) || 1;
      const positions = priced.map((r) => ({ symbol: r.symbol, value: Math.round(r.value), weight: r.value / total, plPct: r.plPct }));
      const res = await fetch("/api/portfolio-fundamental", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market, currency: cur, positions, correlation: true }),
      });
      const j = await res.json();
      if (j.error && !j.overall) { setErr(j.error); return; }
      setData(j);
      if (j.ai && !j.ai.error) logAiUsageDetailed("Portfolio Fundamental", { tokens: j.ai.aiTokens });
    } catch {
      setErr("Could not load fundamentals. Please try again.");
    } finally { setLoading(false); }
  };

  useEffect(() => { setData(null); if (holdings.length) run(); /* eslint-disable-next-line */ }, [market]);

  const overall = data?.overall;
  const buckets = data?.buckets;
  const ai = data?.ai;
  const storyBySym: Record<string, any> = {};
  (ai?.stories || []).forEach((s: any) => { storyBySym[s.symbol] = s; });

  const view = tab === "overall"
    ? { count: overall?.count, beta: overall?.beta, trailingPE: overall?.trailingPE, forwardPE: overall?.forwardPE, sectorAlloc: overall?.sectorAlloc, stocks: data?.stocks, pct: 100 }
    : buckets?.[tab];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-br from-emerald-50 to-white rounded-2xl border border-emerald-100 p-5">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><Landmark className="w-5 h-5 text-emerald-600" /> Fundamental Quality</h2>
          <p className="text-[13px] text-slate-500 font-medium mt-0.5">Cap mix, sector, beta, valuation, growth &amp; cash-flow quality — {market}</p>
        </div>
        <button onClick={run} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {err && <div className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">{err}</div>}
      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-slate-500 px-1 py-8"><Loader2 className="w-4 h-4 animate-spin" /> Pulling live fundamentals for every holding (this takes ~20-40s)…</div>
      )}

      {overall && (
        <>
          {/* Overview: grade + summary + cap mix */}
          {ai && !ai.error && (
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5">
              <div className="flex items-start gap-3">
                {ai.qualityGrade && <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black border-2 ${GRADE[ai.qualityGrade] || GRADE.C}`}>{ai.qualityGrade}</div>}
                <div>
                  <div className="text-sm font-black text-slate-900">Fundamental quality</div>
                  {ai.summary && <p className="text-[14px] text-slate-700 font-medium leading-relaxed mt-1">{ai.summary}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Cap-mix + key metrics */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">Market-cap allocation</div>
              {(["large", "mid", "small"] as const).map((b) => (
                <Bar key={b} label={b === "large" ? "Large cap" : b === "mid" ? "Mid cap" : "Small cap"} pct={buckets?.[b]?.pct ?? 0} color={CAP_COLOR[b]} sub={`${buckets?.[b]?.count ?? 0} stocks`} />
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">Weighted portfolio metrics</div>
              <div className="grid grid-cols-3 gap-2">
                <Mini label="Beta" value={overall.beta ?? "—"} />
                <Mini label="Trailing PE" value={overall.trailingPE ?? "—"} />
                <Mini label="Forward PE" value={overall.forwardPE ?? "—"} />
              </div>
            </div>
          </div>

          {/* Cap tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 w-fit">
            {(["overall", "large", "mid", "small"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black capitalize transition ${tab === t ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {t}{t !== "overall" && buckets?.[t] ? ` · ${buckets[t].pct}%` : ""}
              </button>
            ))}
          </div>

          {view && (
            <>
              {/* Bucket metrics + sector alloc */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">{tab === "overall" ? "Overall" : `${tab} cap`} · sector allocation</div>
                  {(view.sectorAlloc || []).slice(0, 8).map((s: any) => <Bar key={s.sector} label={s.sector} pct={s.pct} color="bg-indigo-500" />)}
                  {(view.sectorAlloc || []).length === 0 && <div className="text-[12px] text-slate-400">No sector data.</div>}
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">{tab === "overall" ? "Overall" : `${tab} cap`} · quality</div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <Mini label="Beta" value={view.beta ?? "—"} />
                    <Mini label="Trailing PE" value={view.trailingPE ?? "—"} />
                    <Mini label="Forward PE" value={view.forwardPE ?? "—"} />
                  </div>
                  <div className="text-[12px] text-slate-500 font-medium">{view.count ?? 0} stocks{tab !== "overall" ? ` · ${view.pct}% of portfolio` : ""}</div>
                </div>
              </div>

              {/* Stock table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <span className="w-1.5 h-4 rounded-full bg-emerald-500" />
                  <h3 className="text-[12px] font-black uppercase tracking-wide text-slate-600">{tab === "overall" ? "All holdings" : `${tab} cap holdings`} · fundamentals</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] font-black text-slate-500 uppercase bg-slate-100 border-b border-slate-200 whitespace-nowrap">
                        <th className="text-left px-4 py-2.5">Stock</th>
                        <th className="text-right px-2 py-2.5">Wt%</th>
                        <th className="text-left px-2 py-2.5">Sector</th>
                        <th className="text-right px-2 py-2.5">Beta</th>
                        <th className="text-right px-2 py-2.5">tPE</th>
                        <th className="text-right px-2 py-2.5">fPE</th>
                        <th className="text-right px-2 py-2.5">Rev YoY</th>
                        <th className="text-right px-2 py-2.5">Earn YoY</th>
                        <th className="text-right px-2 py-2.5">CFO/PAT</th>
                        <th className="text-left px-3 py-2.5">Story</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(view.stocks || []).map((s: any) => {
                        const st = storyBySym[s.symbol];
                        return (
                          <tr key={s.symbol} className="border-b border-slate-100 last:border-0 even:bg-slate-50/50 hover:bg-emerald-50/40 whitespace-nowrap">
                            <td className="px-4 py-2.5">
                              <Link href={`/charts?symbol=${encodeURIComponent(s.symbol)}`} className="font-black text-slate-900 hover:text-emerald-600">{s.symbol}</Link>
                              <div className="text-[10.5px] text-slate-400 font-medium">{fmtCap(s.marketCap, cur)}</div>
                            </td>
                            <td className="px-2 py-2.5 text-right font-bold text-slate-700 tabular-nums">{tab === "overall" ? Math.round(s.weight * 1000) / 10 : s.weightInBucketPct}%</td>
                            <td className="px-2 py-2.5 text-[12px] text-slate-600 max-w-[130px] truncate">{s.sector}</td>
                            <td className="px-2 py-2.5 text-right font-bold text-slate-700 tabular-nums">{s.beta ?? "—"}</td>
                            <td className="px-2 py-2.5 text-right font-bold text-slate-700 tabular-nums">{s.trailingPE ?? "—"}</td>
                            <td className="px-2 py-2.5 text-right font-bold text-slate-700 tabular-nums">{s.forwardPE ?? "—"}</td>
                            <td className={`px-2 py-2.5 text-right font-bold tabular-nums ${gcol(s.revGrowthYoY)}`}>{gpct(s.revGrowthYoY)}</td>
                            <td className={`px-2 py-2.5 text-right font-bold tabular-nums ${gcol(s.earnGrowthYoY)}`}>{gpct(s.earnGrowthYoY)}</td>
                            <td className={`px-2 py-2.5 text-right font-bold tabular-nums ${s.cfoToPat == null ? "text-slate-400" : s.cfoToPat >= 0.8 ? "text-emerald-600" : "text-amber-600"}`}>{s.cfoToPat ?? "—"}</td>
                            <td className="px-3 py-2.5">
                              {st ? <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-black border ${STORY_CLS[st.story] || "text-slate-700 bg-slate-100 border-slate-300"}`} title={st.why}>{st.story}</span> : <span className="text-[11px] text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100 bg-slate-50/60">
                  tPE/fPE = trailing/forward PE · CFO/PAT = operating cash flow ÷ net profit (≥1 is healthy) · Rev/Earn YoY from latest reported. Research only, not buy/sell advice.
                </div>
              </div>
            </>
          )}

          {/* Correlation highlights */}
          {Array.isArray(data.correlations) && data.correlations.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
              <h3 className="text-sm font-black text-amber-700 flex items-center gap-2 mb-1"><Link2 className="w-4 h-4" /> Stocks that move together (same sector)</h3>
              <p className="text-[12.5px] text-slate-500 mb-3">High 1-year return correlation — these add hidden concentration (a sector move hits both).</p>
              <div className="flex flex-wrap gap-2">
                {data.correlations.map((c: any, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12.5px] font-bold border border-amber-300 bg-amber-50 text-amber-900">
                    {c.a} ↔ {c.b} <span className="text-amber-600">·{c.corr}</span> <span className="text-[11px] text-slate-500 font-medium">{c.sector}</span>
                  </span>
                ))}
              </div>
              {ai?.correlationNote && <p className="text-[13px] text-slate-600 mt-3">{ai.correlationNote}</p>}
            </div>
          )}

          {/* Dos & Don'ts */}
          {ai && !ai.error && (Array.isArray(ai.dos) || Array.isArray(ai.donts)) && (
            <div className="grid sm:grid-cols-2 gap-4">
              {Array.isArray(ai.dos) && ai.dos.length > 0 && (
                <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4">
                  <div className="text-[12px] font-black uppercase tracking-wide text-emerald-700 mb-2">Do's</div>
                  <ul className="space-y-1.5">{ai.dos.map((d: string, i: number) => <li key={i} className="flex items-start gap-2 text-[13.5px] text-slate-700"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> {d}</li>)}</ul>
                </div>
              )}
              {Array.isArray(ai.donts) && ai.donts.length > 0 && (
                <div className="bg-white rounded-2xl border border-rose-200 shadow-sm p-4">
                  <div className="text-[12px] font-black uppercase tracking-wide text-rose-700 mb-2">Don'ts / cautions</div>
                  <ul className="space-y-1.5">{ai.donts.map((d: string, i: number) => <li key={i} className="flex items-start gap-2 text-[13.5px] text-slate-700"><X className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" /> {d}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {/* Flagged for manual input */}
          {ai && !ai.error && Array.isArray(ai.flaggedManual) && ai.flaggedManual.length > 0 && (
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-black text-slate-700 flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Not reliably auto-computable — feed manually</h3>
              <p className="text-[12.5px] text-slate-500 mb-2">These need line-item financials we can't pull cleanly, so we don't guess (to avoid wrong numbers):</p>
              <ul className="space-y-1">{ai.flaggedManual.map((f: string, i: number) => <li key={i} className="text-[13px] text-slate-600 flex items-start gap-2"><span className="text-slate-400 mt-0.5">•</span> {f}</li>)}</ul>
            </div>
          )}
          {ai?.error && <div className="text-[13px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">{ai.error}</div>}
          <div className="text-center text-[11px] text-slate-400 italic pb-2">Live fundamentals via Yahoo Finance. Research support only — not buy/sell advice.</div>
        </>
      )}
    </div>
  );
}

function Bar({ label, pct, color, sub }: { label: string; pct: number; color: string; sub?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[13px] text-slate-700 font-semibold w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} /></div>
      <span className="text-[13px] font-black text-slate-800 tabular-nums w-11 text-right">{pct}%</span>
      {sub && <span className="text-[11px] text-slate-400 w-16 text-right shrink-0">{sub}</span>}
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2 text-center">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-black tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
