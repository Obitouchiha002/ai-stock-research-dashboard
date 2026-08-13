"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sunrise, RefreshCw, Loader2, TrendingUp, TrendingDown, Activity, ArrowUpNarrowWide, ArrowDownNarrowWide, Trophy } from "lucide-react";

type Row = { symbol: string; name: string; price: number | null; changePct: number | null; volume: number | null; high52: number | null; low52: number | null; currency: string; ath?: number | null; vwap?: number | null; nearAthPct?: number | null };

const fmtNum = (v: number | null, cur = "") => (v == null ? "—" : `${cur}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
const fmtVol = (v: number | null) => { if (v == null) return "—"; if (v >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`; if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`; if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`; return String(v); };

const TABS = [
  { key: "newHighs", label: "52-wk Highs", icon: TrendingUp, accent: "emerald" },
  { key: "newLows", label: "52-wk Lows", icon: TrendingDown, accent: "rose" },
  { key: "mostActive", label: "Most Active", icon: Activity, accent: "indigo" },
  { key: "gainers", label: "Top Gainers", icon: ArrowUpNarrowWide, accent: "emerald" },
  { key: "losers", label: "Top Losers", icon: ArrowDownNarrowWide, accent: "rose" },
  { key: "nearAth", label: "Near All-time High", icon: Trophy, accent: "amber" },
] as const;

export default function MarketOverviewPage() {
  const [market, setMarket] = useState<"us" | "in">("in");
  const [tab, setTab] = useState<string>("mostActive");
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = async (force = false) => {
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/market-overview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ market, force }) });
      const j = await res.json();
      if (j.error) { setErr(j.error); return; }
      setData(j);
    } catch { setErr("Could not load the market overview. Please try again."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [market]);

  const cur = data?.currency || (market === "in" ? "₹" : "$");
  const rows: Row[] = (data?.buckets?.[tab] || []) as Row[];
  const activeTab = useMemo(() => TABS.find((t) => t.key === tab) || TABS[0], [tab]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2"><Sunrise className="w-8 h-8 text-amber-500" /> Daily Market Overview</h1>
          <p className="text-slate-500 mt-1 font-medium">What moved today. {data?.scanned ? `Scanned ${data.scanned} large/mid caps.` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            {(["in", "us"] as const).map((m) => (
              <button key={m} onClick={() => setMarket(m)} className={`px-4 py-2 rounded-lg text-[13px] font-black transition ${market === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                {m === "in" ? "🇮🇳 India" : "🇺🇸 US"}
              </button>
            ))}
          </div>
          <button onClick={() => load(true)} disabled={loading} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {err && <div className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 mb-4">{err}</div>}

      {/* One window: tabs on top, table below */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50/60">
          {TABS.map((t) => {
            const on = tab === t.key;
            const n = data?.buckets?.[t.key]?.length || 0;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-[13px] font-black whitespace-nowrap border-b-2 transition ${on ? "border-indigo-600 text-indigo-700 bg-white" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
                {data && <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${on ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500"}`}>{n}</span>}
              </button>
            );
          })}
        </div>

        {/* Table */}
        {loading && !data ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 px-5 py-12"><Loader2 className="w-4 h-4 animate-spin" /> Scanning the market…</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-12 text-[14px] text-slate-400">Nothing in “{activeTab.label}” today.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-black text-slate-500 uppercase bg-slate-100 border-b border-slate-200">
                  <th className="text-left px-5 py-2.5">#</th>
                  <th className="text-left px-3 py-2.5">Stock</th>
                  <th className="text-right px-3 py-2.5">Price</th>
                  <th className="text-right px-3 py-2.5">Change</th>
                  <th className="text-right px-3 py-2.5">Volume</th>
                  <th className="text-right px-5 py-2.5">{tab === "newHighs" ? "52-wk High" : tab === "newLows" ? "52-wk Low" : tab === "nearAth" ? "vs ATH · VWAP" : "52-wk Range"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const up = (r.changePct ?? 0) >= 0;
                  return (
                    <tr key={r.symbol} className="border-b border-slate-100 last:border-0 even:bg-slate-50/40 hover:bg-indigo-50/40 align-middle">
                      <td className="px-5 py-2.5 text-[12px] font-black text-slate-300 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <Link href={`/analyze?symbol=${encodeURIComponent(r.symbol)}`} className="font-black text-slate-900 hover:text-indigo-600">{r.symbol.replace(".NS", "")}</Link>
                        <div className="text-[11px] text-slate-400 font-medium truncate max-w-[220px]">{r.name}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800 tabular-nums whitespace-nowrap">{fmtNum(r.price, cur)}</td>
                      <td className={`px-3 py-2.5 text-right font-black tabular-nums whitespace-nowrap ${up ? "text-emerald-600" : "text-rose-600"}`}>{r.changePct == null ? "—" : `${up ? "+" : ""}${r.changePct}%`}</td>
                      <td className="px-3 py-2.5 text-right text-[12.5px] font-bold text-slate-500 tabular-nums whitespace-nowrap">{fmtVol(r.volume)}</td>
                      <td className="px-5 py-2.5 text-right text-[12.5px] font-bold text-slate-600 tabular-nums whitespace-nowrap">
                        {tab === "newHighs" && fmtNum(r.high52, cur)}
                        {tab === "newLows" && fmtNum(r.low52, cur)}
                        {tab === "nearAth" && <span>{r.nearAthPct == null ? "—" : <span className={r.nearAthPct >= 0 ? "text-emerald-600" : "text-slate-600"}>{r.nearAthPct >= 0 ? "+" : ""}{r.nearAthPct}%</span>}{r.vwap != null ? ` · ${r.vwap}` : ""}</span>}
                        {(tab === "mostActive" || tab === "gainers" || tab === "losers") && <span className="text-slate-400">{fmtNum(r.low52)}–{fmtNum(r.high52)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-2.5 text-[11px] text-slate-400 border-t border-slate-100 bg-slate-50/60">
          Post-close via Yahoo Finance (~15 min lag). VWAP & all-time-high shown for the most active / top movers. Research only — not buy/sell advice.
        </div>
      </div>
    </div>
  );
}
