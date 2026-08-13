"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Sunrise, RefreshCw, Loader2, TrendingUp, TrendingDown, Activity, ArrowUpNarrowWide, Trophy, Gauge } from "lucide-react";

type Row = { symbol: string; name: string; price: number | null; changePct: number | null; volume: number | null; high52: number | null; low52: number | null; currency: string; ath?: number | null; vwap?: number | null; nearAthPct?: number | null };

const fmtNum = (v: number | null, cur = "") => (v == null ? "—" : `${cur}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
const fmtVol = (v: number | null) => { if (v == null) return "—"; if (v >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`; if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`; if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`; return String(v); };

export default function MarketOverviewPage() {
  const [market, setMarket] = useState<"us" | "in">("in");
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
  const b = data?.buckets;

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2"><Sunrise className="w-8 h-8 text-amber-500" /> Daily Market Overview</h1>
          <p className="text-slate-500 mt-1 font-medium">What moved today — 52-week highs & lows, most active, top movers, near all-time highs. {data?.scanned ? `Scanned ${data.scanned} large/mid caps.` : ""}</p>
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
      {loading && !data && <div className="flex items-center gap-2 text-sm text-slate-500 px-1 py-10"><Loader2 className="w-4 h-4 animate-spin" /> Scanning the market…</div>}

      {b && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Bucket title="New 52-week highs" icon={TrendingUp} accent="emerald" rows={b.newHighs} cur={cur} extra="52wH" />
          <Bucket title="New 52-week lows" icon={TrendingDown} accent="rose" rows={b.newLows} cur={cur} extra="52wL" />
          <Bucket title="Most active (by turnover)" icon={Activity} accent="indigo" rows={b.mostActive} cur={cur} extra="vol" />
          <Bucket title="Near all-time high" icon={Trophy} accent="amber" rows={b.nearAth} cur={cur} extra="ath" />
          <Bucket title="Top gainers" icon={ArrowUpNarrowWide} accent="emerald" rows={b.gainers} cur={cur} extra="chg" />
          <Bucket title="Top losers" icon={TrendingDown} accent="rose" rows={b.losers} cur={cur} extra="chg" />
        </div>
      )}
      <p className="mt-5 text-[11px] text-slate-400 italic">Post-close snapshot via Yahoo Finance (may lag ~15 min). VWAP & all-time-high computed for the most active / top movers. Research support only — not buy/sell advice.</p>
    </div>
  );
}

const ACCENT: Record<string, string> = { emerald: "from-emerald-50", rose: "from-rose-50", indigo: "from-indigo-50", amber: "from-amber-50" };
const DOT: Record<string, string> = { emerald: "bg-emerald-500", rose: "bg-rose-500", indigo: "bg-indigo-500", amber: "bg-amber-500" };

function Bucket({ title, icon: Icon, accent, rows, cur, extra }: { title: string; icon: any; accent: string; rows: Row[]; cur: string; extra: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`px-4 py-2.5 bg-gradient-to-r ${ACCENT[accent]} to-white border-b border-slate-200 flex items-center gap-2`}>
        <span className={`w-1.5 h-4 rounded-full ${DOT[accent]}`} />
        <Icon className="w-4 h-4 text-slate-600" />
        <h3 className="text-[12.5px] font-black uppercase tracking-wide text-slate-700">{title}</h3>
        <span className="ml-auto text-[11px] text-slate-400 font-bold">{rows?.length || 0}</span>
      </div>
      {(!rows || rows.length === 0) ? (
        <div className="px-4 py-6 text-[13px] text-slate-400">Nothing here today.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => {
                const up = (r.changePct ?? 0) >= 0;
                return (
                  <tr key={r.symbol} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-2">
                      <Link href={`/analyze?symbol=${encodeURIComponent(r.symbol)}`} className="font-black text-slate-800 hover:text-indigo-600">{r.symbol.replace(".NS", "")}</Link>
                      <div className="text-[11px] text-slate-400 font-medium truncate max-w-[150px]">{r.name}</div>
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-slate-800 tabular-nums whitespace-nowrap">{fmtNum(r.price, cur)}</td>
                    <td className={`px-2 py-2 text-right font-black tabular-nums whitespace-nowrap ${up ? "text-emerald-600" : "text-rose-600"}`}>{r.changePct == null ? "—" : `${up ? "+" : ""}${r.changePct}%`}</td>
                    <td className="px-4 py-2 text-right text-[12px] font-bold text-slate-500 tabular-nums whitespace-nowrap">
                      {extra === "vol" && fmtVol(r.volume)}
                      {extra === "52wH" && `H ${fmtNum(r.high52)}`}
                      {extra === "52wL" && `L ${fmtNum(r.low52)}`}
                      {extra === "ath" && <span title="vs all-time high">{r.nearAthPct == null ? "—" : `${r.nearAthPct >= 0 ? "+" : ""}${r.nearAthPct}% ATH`}{r.vwap != null ? ` · VWAP ${r.vwap}` : ""}</span>}
                      {extra === "chg" && (r.vwap != null ? `VWAP ${r.vwap}` : fmtVol(r.volume))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
