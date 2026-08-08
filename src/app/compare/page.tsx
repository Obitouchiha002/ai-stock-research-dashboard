"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Scale, Search, Plus, X, Loader2, TrendingUp, TrendingDown, Check, Minus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { getWatchlist, getPortfolio, getCustomMarketSymbols, getCustomMarketByGroup } from "@/lib/storage";

// ---- config -------------------------------------------------------------
const PERIODS: { k: string; label: string }[] = [
  { k: "1mo", label: "1M" }, { k: "3mo", label: "3M" }, { k: "6mo", label: "6M" },
  { k: "1y", label: "1Y" }, { k: "2y", label: "2Y" }, { k: "5y", label: "5Y" },
];
// All the indices from the Markets page, so the user can pick any benchmark
// (or add one to the comparison) — same universe as Markets.
const MARKET_INDICES: { group: string; items: { v: string; label: string }[] }[] = [
  { group: "US Indices", items: [
    { v: "^GSPC", label: "S&P 500" }, { v: "^DJI", label: "Dow Jones" }, { v: "^IXIC", label: "Nasdaq Composite" },
    { v: "^NDX", label: "Nasdaq 100" }, { v: "^RUT", label: "Russell 2000" }, { v: "^SOX", label: "SOX (Semis)" }, { v: "^VIX", label: "VIX" } ] },
  { group: "Indian Indices", items: [
    { v: "^NSEI", label: "Nifty 50" }, { v: "^NSEBANK", label: "Nifty Bank" }, { v: "^BSESN", label: "BSE Sensex" },
    { v: "^CNXIT", label: "Nifty IT" }, { v: "^CNXAUTO", label: "Nifty Auto" }, { v: "^CNXPHARMA", label: "Nifty Pharma" },
    { v: "^CNXFMCG", label: "Nifty FMCG" }, { v: "^CNXMETAL", label: "Nifty Metal" }, { v: "^INDIAVIX", label: "India VIX" } ] },
  { group: "Global Indices", items: [
    { v: "^FTSE", label: "FTSE 100" }, { v: "^GDAXI", label: "DAX" }, { v: "^FCHI", label: "CAC 40" },
    { v: "^N225", label: "Nikkei 225" }, { v: "^HSI", label: "Hang Seng" }, { v: "^KS11", label: "KOSPI" } ] },
  { group: "Commodities", items: [
    { v: "GC=F", label: "Gold" }, { v: "SI=F", label: "Silver" }, { v: "HG=F", label: "Copper" },
    { v: "CL=F", label: "Crude Oil" }, { v: "BZ=F", label: "Brent" }, { v: "NG=F", label: "Natural Gas" } ] },
  { group: "Crypto", items: [
    { v: "BTC-USD", label: "Bitcoin" }, { v: "ETH-USD", label: "Ethereum" }, { v: "SOL-USD", label: "Solana" }, { v: "XRP-USD", label: "XRP" } ] },
];
// A calm, distinct colour per series (base first).
const SERIES_COLORS = ["#4f46e5", "#059669", "#e11d48", "#d97706", "#7c3aed", "#0891b2"];
const r0 = (n: number) => Math.round(n);
const pp = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);
const ppd = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}pp`;

// Heuristic Relative-Strength rating (1–99) from trailing returns, weighted to
// recent. NOT a true market percentile — a quick strength read (labelled below).
function rsRating(w: Record<string, number | null> | undefined, fallback: number): number {
  if (!w) return clamp(r0(50 + fallback * 1.3), 1, 99);
  const g = (k: string, def: number) => (w[k] == null ? def : (w[k] as number));
  const blend = 0.5 * g("6M", g("3M", fallback)) + 0.3 * g("3M", fallback) + 0.2 * g("1Y", g("6M", fallback));
  return clamp(ro(50 + blend * 1.3), 1, 99);
}
const ro = (n: number) => Math.round(n);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const rsColor = (r: number) => (r >= 70 ? "bg-emerald-500" : r >= 40 ? "bg-amber-500" : "bg-rose-500");
const rsText = (r: number) => (r >= 70 ? "text-emerald-600" : r >= 40 ? "text-amber-600" : "text-rose-600");

type Leg = { symbol: string; label: string; kind: string; changePct: number; windows: Record<string, number | null>; vsStockPct: number };

export default function ComparePage() {
  const [mode, setMode] = useState<"vs" | "index" | "leaderboard">("vs");
  const [base, setBase] = useState("");
  const [peers, setPeers] = useState<string[]>([]);
  const [bench, setBench] = useState("");
  const [period, setPeriod] = useState("6mo");

  const [query, setQuery] = useState("");
  const [sug, setSug] = useState<any[]>([]);
  const [showSug, setShowSug] = useState(false);

  const [customMkt, setCustomMkt] = useState<{ v: string; label: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<any | null>(null);
  const [baseChart, setBaseChart] = useState<any | null>(null);
  const [longWin, setLongWin] = useState<Record<string, Record<string, number | null>>>({}); // 1Y-based windows per symbol

  const periodLabel = PERIODS.find((p) => p.k === period)?.label || period;

  // Seed base + peers from the user's own lists (or a ?symbol= deep-link).
  useEffect(() => {
    const wl = getWatchlist().map((i: any) => i.symbol);
    const pf = getPortfolio().map((h: any) => h.symbol);
    const uniq = Array.from(new Set([...wl, ...pf])).filter(Boolean);
    const deep = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("symbol") : null;
    if (deep) { setBase(deep.toUpperCase()); setPeers(uniq.filter((s) => s !== deep.toUpperCase()).slice(0, 3)); }
    else if (uniq.length) { setBase((b) => b || uniq[0]); setPeers((p) => (p.length ? p : uniq.slice(1, 4))); }
    // The user's own Markets symbols become extra pickable indices.
    try {
      const cm = [...getCustomMarketSymbols(), ...Object.values(getCustomMarketByGroup()).flat()] as any[];
      const seen = new Set<string>();
      setCustomMkt(cm.filter((c) => c?.symbol && !seen.has(c.symbol) && seen.add(c.symbol)).map((c) => ({ v: c.symbol, label: c.label || c.symbol })));
    } catch {}
  }, []);

  // autocomplete
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setSug([]); return; }
    const t = setTimeout(async () => {
      try { const j = await (await fetch(`/api/search-stock?query=${encodeURIComponent(q)}`)).json(); setSug((j.matches || []).slice(0, 8)); setShowSug(true); } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const addPeer = (s: string) => {
    const sym = s.trim().toUpperCase();
    if (!sym || sym === base.toUpperCase() || peers.includes(sym) || peers.length >= 4) return;
    setPeers((p) => [...p, sym]);
    setQuery(""); setSug([]); setShowSug(false);
  };
  const removePeer = (s: string) => setPeers((p) => p.filter((x) => x !== s));

  const run = async () => {
    setErr("");
    if (mode === "leaderboard") return runLeaderboard();
    const sym = base.trim().toUpperCase();
    if (!sym) { setErr("Enter a base stock."); return; }
    const send = mode === "index" && bench ? Array.from(new Set([...peers, bench])) : peers;
    setRunning(true); setData(null); setBaseChart(null); setLongWin({});
    try {
      // Primary call over the selected period drives the chart + outperformance.
      // A second 1-year call gives full trailing windows (1M/3M/6M/1Y) + a stable
      // RS Rating even when the selected period is short (e.g. 1M).
      const longNeeded = !["1y", "2y", "5y"].includes(period);
      const [rsRes, chRes, longRes] = await Promise.all([
        fetch("/api/relative-strength", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, peers: send, range: period }) }).then((r) => r.json()),
        fetch("/api/chart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, range: "1y", interval: "1d" }) }).then((r) => r.json()).catch(() => null),
        longNeeded
          ? fetch("/api/relative-strength", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, peers: send, range: "1y" }) }).then((r) => r.json()).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (rsRes.error) throw new Error(rsRes.error);
      setData(rsRes);
      if (chRes && !chRes.error) setBaseChart(chRes);
      const winSrc = longNeeded && longRes && !longRes.error ? longRes : rsRes;
      const wmap: Record<string, Record<string, number | null>> = {};
      (winSrc.legs || []).forEach((l: any) => { wmap[l.symbol] = l.windows; });
      setLongWin(wmap);
    } catch (e: any) { setErr(e?.message || "Could not compare these symbols."); }
    finally { setRunning(false); }
  };

  const runLeaderboard = async () => {
    const wl = getWatchlist().map((i: any) => i.symbol);
    const pf = getPortfolio().map((h: any) => h.symbol);
    const uni = Array.from(new Set([...wl, ...pf])).filter(Boolean).slice(0, 15);
    if (uni.length < 2) { setErr("Add stocks to your Watchlist/Portfolio to build a leaderboard."); return; }
    setRunning(true); setData(null); setBaseChart(null);
    try {
      const j = await fetch("/api/relative-strength", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: uni[0], peers: uni.slice(1), range: period }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setData(j);
    } catch (e: any) { setErr(e?.message || "Could not build the leaderboard."); }
    finally { setRunning(false); }
  };

  // ---- derived ----------------------------------------------------------
  // Dedupe by symbol (the API's auto-benchmark can collide with a peer the user added).
  const legs: Leg[] = useMemo(() => {
    const seen = new Set<string>();
    return ((data?.legs || []) as Leg[]).filter((l) => (seen.has(l.symbol) ? false : (seen.add(l.symbol), true)));
  }, [data]);
  const baseLeg = legs.find((l) => l.kind === "stock");
  const baseReturn = baseLeg?.changePct ?? 0;
  const chartData = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((row: any) => {
      const o: any = { date: row.date };
      for (const l of legs) o[l.symbol] = row[l.symbol] != null ? row[l.symbol] - 100 : null; // rebased %
      return o;
    });
  }, [data, legs]);

  // Early Winner signals for the base (from its 1y chart + RS series).
  const signals = useMemo(() => {
    if (!baseChart?.candles?.length) return null;
    const c = baseChart.candles;
    const closes = c.map((x: any) => x.close).filter((n: any) => Number.isFinite(n));
    if (closes.length < 30) return null;
    const last = closes[closes.length - 1];
    const max52 = Math.max(...closes.slice(-252));
    const sma = (arr: number[], n: number) => (arr.length < n ? null : arr.slice(-n).reduce((a, b) => a + b, 0) / n);
    const dma50 = sma(closes, 50), dma200 = sma(closes, 200);
    const recent = c.slice(-63);
    let upVol = 0, downVol = 0;
    for (let i = 1; i < recent.length; i++) {
      const v = recent[i].volume || 0;
      if (recent[i].close >= recent[i - 1].close) upVol += v; else downVol += v;
    }
    // RS line new high: last rs value at/near the max over the window.
    let rsNewHigh = false;
    if (data?.series?.length) {
      const rs = data.series.map((r: any) => r.rs).filter((n: any) => Number.isFinite(n));
      if (rs.length) rsNewHigh = rs[rs.length - 1] >= Math.max(...rs) * 0.995;
    }
    return {
      newHigh: last >= max52 * 0.97,
      rsNewHigh,
      aboveDma: dma50 != null && dma200 != null && last > dma50 && last > dma200,
      volExpansion: upVol > downVol,
    };
  }, [baseChart, data]);

  const ranked = data?.ranked || [];

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      <div className="mb-5">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Scale className="w-8 h-8 text-indigo-600" /> Compare &amp; Relative Strength
        </h1>
        <p className="text-slate-500 mt-1 font-medium">Spot outperformers early — stock vs stock, and stock vs index/sector, on a normalized (rebased) basis.</p>
      </div>

      {/* Mode tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {([["vs", "Stock vs Stock"], ["index", "Stock vs Index / Sector"], ["leaderboard", "Sector / Universe Leaderboard"]] as const).map(([m, lbl]) => (
          <button key={m} onClick={() => { setMode(m); setData(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${mode === m ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>{lbl}</button>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          {mode !== "leaderboard" && (
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Base stock</label>
              <input value={base} onChange={(e) => setBase(e.target.value.toUpperCase())} placeholder="AAPL"
                className="w-40 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          )}
          {mode !== "leaderboard" && (
            <div className="flex-1 min-w-[240px]">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Compare against (up to 4)</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {peers.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 text-[12px] font-bold">
                    {p}<button onClick={() => removePeer(p)} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
                  </span>
                ))}
                <div className="relative">
                  <input value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => query && setShowSug(true)} onBlur={() => setTimeout(() => setShowSug(false), 200)}
                    onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) addPeer(query); }}
                    placeholder="+ add stock/index" className="w-40 px-2 py-1.5 bg-white border border-dashed border-slate-300 rounded-lg text-[12px] font-bold outline-none focus:ring-2 focus:ring-indigo-200" />
                  {showSug && sug.length > 0 && (
                    <div className="absolute z-50 mt-1 left-0 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                      {sug.map((r) => (
                        <button key={r.symbol} onMouseDown={() => addPeer(r.symbol)} className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 flex items-center justify-between gap-2">
                          <span className="font-black text-slate-800 text-[12px]">{r.symbol}</span>
                          <span className="text-[11px] text-slate-500 truncate">{r.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Pick any index straight from the Markets list */}
                <select value="" onChange={(e) => { if (e.target.value) addPeer(e.target.value); }}
                  className="px-2 py-1.5 bg-white border border-dashed border-slate-300 rounded-lg text-[12px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer">
                  <option value="">＋ index from Markets</option>
                  {MARKET_INDICES.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.items.map((it) => <option key={it.v} value={it.v}>{it.label}</option>)}
                    </optgroup>
                  ))}
                  {customMkt.length > 0 && (
                    <optgroup label="My Markets">
                      {customMkt.map((it) => <option key={it.v} value={it.v}>{it.label}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
          )}
          {mode === "index" && (
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Benchmark (from Markets)</label>
              <select value={bench} onChange={(e) => setBench(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200 max-w-[16rem]">
                <option value="">Auto (broad index)</option>
                {MARKET_INDICES.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map((it) => <option key={it.v} value={it.v}>{it.label}</option>)}
                  </optgroup>
                ))}
                {customMkt.length > 0 && (
                  <optgroup label="My Markets">
                    {customMkt.map((it) => <option key={it.v} value={it.v}>{it.label}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Period</label>
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {PERIODS.map((p) => (
                <button key={p.k} onClick={() => setPeriod(p.k)} className={`px-2.5 py-1.5 rounded-md text-xs font-black transition ${period === p.k ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>{p.label}</button>
              ))}
            </div>
          </div>
          <button onClick={run} disabled={running} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />} {running ? "Comparing…" : mode === "leaderboard" ? "Build leaderboard" : "Compare"}
          </button>
        </div>
        {mode === "leaderboard" && <p className="text-[12px] text-slate-400 mt-2">Ranks your Watchlist + Portfolio (up to 15) by relative strength over the period.</p>}
        {err && <p className="text-[13px] text-rose-600 font-medium mt-2">{err}</p>}
      </div>

      {!data ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-400 font-medium">
          Pick your stocks and hit {mode === "leaderboard" ? "Build leaderboard" : "Compare"} to see relative performance.
        </div>
      ) : mode === "leaderboard" ? (
        // ---- Leaderboard ----
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 max-w-3xl">
          <h3 className="font-black text-slate-800 mb-1">Leaderboard — by Relative Strength ({periodLabel})</h3>
          <p className="text-[11px] text-slate-400 mb-4">Leaders in a group statistically tend to keep leading (momentum persistence) — idea generation, not a buy signal.</p>
          <div className="space-y-2.5">
            {[...legs].sort((a, b) => b.changePct - a.changePct).map((l, i) => {
              const rating = rsRating(longWin[l.symbol] || l.windows, l.changePct);
              return (
                <div key={l.symbol} className="flex items-center gap-3">
                  <span className="w-5 text-right text-[13px] font-bold text-slate-400">{i + 1}</span>
                  <Link href={`/analyze?symbol=${l.symbol}`} className="w-24 font-black text-slate-800 hover:text-indigo-600 truncate">{l.symbol}</Link>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${rsColor(rating)}`} style={{ width: `${rating}%` }} /></div>
                  <span className={`w-10 text-right font-black ${rsText(rating)}`}>{rating}</span>
                  <span className={`w-16 text-right text-[13px] font-bold ${l.changePct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{pp(l.changePct)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Component 1 — Relative Performance chart */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-black text-slate-800">Relative Performance <span className="text-slate-400 font-bold text-sm">(rebased to 0%)</span></h3>
            <p className="text-[12px] text-slate-400 mb-3">Who&apos;s actually winning over {periodLabel} — normalized % return, not raw price.</p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`} width={44} />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  <Tooltip formatter={(v: any) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                  {legs.map((l, i) => (
                    <Line key={l.symbol} type="monotone" dataKey={l.symbol} stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                      strokeWidth={l.kind === "benchmark" ? 2 : 2.5} strokeDasharray={l.kind === "benchmark" ? "6 4" : undefined} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {legs.map((l, i) => (
                <span key={l.symbol} className="inline-flex items-center gap-1.5 text-[12px] font-bold">
                  <span className="w-3 h-3 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                  {l.label}{l.kind === "benchmark" ? " (benchmark)" : ""} <span className={l.changePct >= 0 ? "text-emerald-600" : "text-rose-600"}>{pp(l.changePct)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Component 2 — Outperformance strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {legs.filter((l) => l.kind !== "stock").map((l) => {
              const diff = baseReturn - l.changePct; // pp base is ahead
              const ahead = diff >= 0;
              return (
                <div key={l.symbol} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{baseLeg?.label} vs {l.label}</div>
                  <div className={`text-xl font-black flex items-center gap-1 mt-0.5 ${ahead ? "text-emerald-600" : "text-rose-600"}`}>
                    {ppd(diff)} {ahead ? "ahead" : "behind"} {ahead ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{ahead ? (diff > 10 ? "Clearly leading" : "Ahead") : (diff < -10 ? "Lagging badly" : "Behind")}{l.kind === "benchmark" ? " the index" : ""}</div>
                </div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Component 3 — Side-by-side returns */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-x-auto">
              <h3 className="font-black text-slate-800 mb-3">Side-by-side returns</h3>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-200">
                    <th className="text-left py-2 pr-2">Metric</th>
                    {legs.map((l) => <th key={l.symbol} className="text-right py-2 px-2">{l.symbol}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100 bg-indigo-50/40">
                    <td className="py-2 pr-2 font-bold text-indigo-700">{periodLabel} return</td>
                    {legs.map((l) => (
                      <td key={l.symbol} className={`py-2 px-2 text-right tabular-nums font-black ${l.changePct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{pp(l.changePct)}</td>
                    ))}
                  </tr>
                  {[["1M", "1M return"], ["3M", "3M return"], ["6M", "6M return"], ["1Y", "1Y return"]].map(([wk, lbl]) => (
                    <tr key={wk} className="border-b border-slate-100">
                      <td className="py-2 pr-2 font-medium text-slate-600">{lbl}</td>
                      {legs.map((l) => {
                        const v = (longWin[l.symbol] || l.windows)?.[wk];
                        return <td key={l.symbol} className={`py-2 px-2 text-right tabular-nums font-bold ${v == null ? "text-slate-300" : v >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{pp(v)}</td>;
                      })}
                    </tr>
                  ))}
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-medium text-slate-600">Rank ({periodLabel})</td>
                    {legs.map((l) => {
                      const r = ranked.find((x: any) => x.symbol === l.symbol)?.rank;
                      return <td key={l.symbol} className="py-2 px-2 text-right tabular-nums font-bold text-slate-700">{r ? `#${r}` : "—"}</td>;
                    })}
                  </tr>
                </tbody>
              </table>
              <p className="text-[11px] text-slate-400 mt-2">Fundamentals &amp; scores available on each stock&apos;s <Link href={`/analyze?symbol=${base}`} className="text-indigo-600 font-semibold hover:underline">Analyze</Link> page.</p>
            </div>

            {/* Component 4 — RS Rating */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-black text-slate-800 mb-1">Relative Strength Rating <span className="text-slate-400 font-bold text-sm">(1–99)</span></h3>
              <p className="text-[11px] text-slate-400 mb-4">Heuristic strength from trailing returns (weighted to recent). 80+ often precedes strong continued moves — a read, not a guarantee.</p>
              <div className="space-y-2.5">
                {[...legs].filter((l) => l.kind !== "benchmark").sort((a, b) => b.changePct - a.changePct).map((l) => {
                  const rating = rsRating(longWin[l.symbol] || l.windows, l.changePct);
                  return (
                    <div key={l.symbol} className="flex items-center gap-3">
                      <span className="w-16 font-black text-slate-800 truncate">{l.symbol}</span>
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${rsColor(rating)}`} style={{ width: `${rating}%` }} /></div>
                      <span className={`w-8 text-right font-black ${rsText(rating)}`}>{rating}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Component 5 — Early Winner signals for the base */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-black text-slate-800 mb-1">Early Winner Signals — {baseLeg?.label || base}</h3>
            <p className="text-[11px] text-slate-400 mb-3">Heuristic checks, not guarantees.</p>
            {!signals ? (
              <p className="text-[13px] text-slate-400">Not enough price history to compute signals.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  [signals.newHigh, "Near a 52-week high"],
                  [signals.rsNewHigh, "RS line vs benchmark at a new high (real strength, not just drift)"],
                  [signals.aboveDma, "Trading above 50-DMA and 200-DMA"],
                  [signals.volExpansion, "Volume expansion on up-days vs down-days"],
                ].map(([ok, label], i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-400"}`}>
                      {ok ? <Check className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                    </span>
                    <span className={`text-[13px] font-medium ${ok ? "text-slate-800" : "text-slate-400"}`}>{label as string}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <p className="mt-5 text-[11px] text-slate-400 italic">
        Research support only. Not buy/sell advice. RS Rating and Early Winner Signals are heuristic indicators, not guarantees. Rebased return = (price_t / price_0 − 1) × 100.
      </p>
    </div>
  );
}
