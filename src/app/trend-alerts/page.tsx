"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  X,
  Star,
  Briefcase,
  Activity,
  Info,
  CheckCircle2,
} from "lucide-react";
import {
  getPortfolio,
  getWatchlist,
  getTrendConfig,
  saveTrendConfig,
  getTrendStates,
  saveTrendStates,
  getTrendHistory,
  logTrendAlert,
  clearTrendHistory,
  addNotification,
} from "@/lib/storage";

const STATE_META: Record<string, { label: string; color: string; bg: string; rank: number; icon: any }> = {
  strong_up: { label: "Strong Uptrend", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", rank: 4, icon: TrendingUp },
  up: { label: "Uptrend", color: "text-lime-700", bg: "bg-lime-50 border-lime-200", rank: 3, icon: TrendingUp },
  neutral: { label: "Neutral", color: "text-slate-600", bg: "bg-slate-50 border-slate-200", rank: 2, icon: Minus },
  down: { label: "Downtrend", color: "text-orange-700", bg: "bg-orange-50 border-orange-200", rank: 1, icon: TrendingDown },
  strong_down: { label: "Strong Downtrend", color: "text-rose-700", bg: "bg-rose-50 border-rose-200", rank: 0, icon: TrendingDown },
};

const ALERT_DEFS: { key: string; label: string; desc: string }[] = [
  { key: "perfectUp", label: "Perfect Uptrend formed", desc: "Price climbs above all MAs in order: Price > 10 > 20 > 50 > 200 DMA" },
  { key: "perfectDown", label: "Perfect Downtrend formed", desc: "Price falls below all MAs in order: Price < 10 < 20 < 50 < 200 DMA" },
  { key: "trendUp", label: "Trend turning up", desc: "Any improvement in trend state (e.g. Neutral → Uptrend)" },
  { key: "trendDown", label: "Trend weakening", desc: "Any deterioration in trend state (e.g. Uptrend → Neutral)" },
  { key: "goldenCross", label: "Golden Cross", desc: "50-DMA crosses above 200-DMA — a classic long-term bullish signal" },
  { key: "deathCross", label: "Death Cross", desc: "50-DMA crosses below 200-DMA — a classic long-term bearish signal" },
  { key: "reclaim200", label: "Reclaimed 200-DMA", desc: "Price rises back above its 200-day moving average" },
  { key: "lost200", label: "Lost 200-DMA", desc: "Price falls below its 200-day moving average — major trend warning" },
];

const fmt = (n: number | null | undefined, cur = "") =>
  n == null ? "—" : `${cur}${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function TrendAlertsPage() {
  const [candidates, setCandidates] = useState<{ symbol: string; name: string; src: string[] }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState("");
  const [lastFired, setLastFired] = useState<{ count: number; msgs: string[] } | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  // Load candidates (portfolio + watchlist) and saved config.
  useEffect(() => {
    const map = new Map<string, { symbol: string; name: string; src: string[] }>();
    const add = (symbol: string, name: string, src: string) => {
      const k = symbol.toUpperCase();
      if (!k) return;
      const e = map.get(k);
      if (e) { if (!e.src.includes(src)) e.src.push(src); }
      else map.set(k, { symbol: k, name: name || k, src: [src] });
    };
    getPortfolio().forEach((h: any) => add(h.symbol, h.name || h.symbol, "Portfolio"));
    getWatchlist().forEach((w: any) => add(w.symbol, w.name || w.symbol, "Watchlist"));
    const cands = Array.from(map.values());
    setCandidates(cands);

    const cfg = getTrendConfig();
    setAlerts(cfg.alerts || {});
    setSelected(cfg.symbols?.length ? cfg.symbols : cands.map((c) => c.symbol));
    setHistory(getTrendHistory());
  }, []);

  const persist = useCallback((sel: string[], al: Record<string, boolean>) => {
    saveTrendConfig({ symbols: sel, alerts: al });
  }, []);

  const toggleSel = (sym: string) =>
    setSelected((cur) => {
      const next = cur.includes(sym) ? cur.filter((s) => s !== sym) : [...cur, sym];
      persist(next, alerts);
      return next;
    });
  const toggleAlert = (key: string) =>
    setAlerts((cur) => {
      const next = { ...cur, [key]: !cur[key] };
      persist(selected, next);
      return next;
    });
  const addManual = () => {
    const sym = manual.trim().toUpperCase();
    if (!sym) return;
    if (!candidates.some((c) => c.symbol === sym)) setCandidates((c) => [...c, { symbol: sym, name: sym, src: ["Manual"] }]);
    setSelected((cur) => (cur.includes(sym) ? cur : [...cur, sym]));
    setManual("");
  };

  const scan = useCallback(async (sel: string[], al: Record<string, boolean>) => {
    if (sel.length === 0) return;
    setLoading(true);
    setLastFired(null);
    try {
      const stocks = sel.map((symbol) => ({
        symbol,
        name: candidates.find((c) => c.symbol === symbol)?.name || symbol,
      }));
      const res = await fetch("/api/trend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stocks }),
      });
      const j = await res.json();
      const list = (j.results || []).filter((r: any) => r.ok);
      setResults(j.results || []);

      // The engine reports the exact trend events that happened on the latest
      // DAILY BAR (bar-over-bar, on closes). We fire the enabled ones, and use
      // the bar date as a dedup key so the same bar never alerts twice — no
      // matter how often you re-scan.
      const states = getTrendStates();
      const fired: string[] = [];

      for (const r of list) {
        const alreadyBar = states[r.symbol]?.lastBarDate;
        if (r.barDate && r.barDate !== alreadyBar && Array.isArray(r.events)) {
          for (const ev of r.events) {
            if (!al[ev.type]) continue; // this alert type is off
            const emoji = ev.kind === "bull" ? "📈" : "📉";
            addNotification({ message: `${emoji} ${ev.message}`, type: ev.kind === "bull" ? "success" : "error" });
            logTrendAlert({ symbol: r.symbol, message: ev.message, kind: ev.kind });
            fired.push(ev.message);
          }
        }
        states[r.symbol] = { lastBarDate: r.barDate, state: r.state };
      }

      saveTrendStates(states);
      setHistory(getTrendHistory());
      setLastFired({ count: fired.length, msgs: fired.slice(0, 6) });
    } catch {
      /* keep old */
    } finally {
      setLoading(false);
    }
  }, [candidates]);

  // auto-scan once candidates + selection are ready
  useEffect(() => {
    if (candidates.length && selected.length && results.length === 0) {
      scan(selected, alerts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  const sortedResults = useMemo(
    () => [...results].filter((r) => r.ok).sort((a, b) => (STATE_META[b.state]?.rank ?? 2) - (STATE_META[a.state]?.rank ?? 2)),
    [results],
  );

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Bell className="w-8 h-8 text-indigo-600" /> Trend Alerts
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Get notified when a stock&apos;s moving-average trend changes — perfect stacks, crosses &amp; 200-DMA breaks.
          </p>
        </div>
        <button
          onClick={() => scan(selected, alerts)}
          disabled={loading || selected.length === 0}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          Scan Now
        </button>
      </div>

      {/* How it works */}
      <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 mb-5 flex items-start gap-3">
        <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div className="text-sm text-slate-600">
          <b className="text-slate-800">How it works:</b> A stock is in a <b>Strong Uptrend</b> when Price &gt; 10 &gt; 20 &gt; 50 &gt; 200 DMA
          (all lined up). This tool checks your stocks, and when a trend <b>changes</b> — a perfect stack forms, a Golden/Death Cross
          happens, or price breaks the 200-DMA — it drops a 🔔 notification (bell, top-right). Run <b>Scan Now</b> anytime, or it scans when you open this page.
        </div>
      </div>

      {/* fired summary */}
      {lastFired && (
        <div className={`rounded-2xl p-4 mb-5 border ${lastFired.count > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
          {lastFired.count === 0 ? (
            <div className="text-sm text-slate-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> No new trend changes on the latest daily bar. All quiet.
            </div>
          ) : (
            <div>
              <div className="text-sm font-bold text-amber-900 mb-1">🔔 {lastFired.count} alert{lastFired.count > 1 ? "s" : ""} fired (also in the bell)</div>
              <ul className="text-sm text-slate-700 space-y-0.5">
                {lastFired.msgs.map((m, i) => <li key={i}>• {m}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        {/* Results table */}
        <div className="min-w-0">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="sa-table [&_th]:!px-2.5 [&_td]:!px-2.5 sm:[&_th]:!px-4 sm:[&_td]:!px-4">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="text-left font-bold px-4 py-3 text-xs uppercase tracking-wide">Stock</th>
                    <th className="text-left font-bold px-4 py-3 text-xs uppercase tracking-wide">Trend</th>
                    <th className="text-left font-bold px-4 py-3 text-xs uppercase tracking-wide hidden md:table-cell">MA Stack</th>
                    <th className="text-right font-bold px-4 py-3 text-xs uppercase tracking-wide">Price</th>
                    <th className="text-right font-bold px-4 py-3 text-xs uppercase tracking-wide hidden lg:table-cell">50 / 200 DMA</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400 font-medium">
                      {loading ? "Scanning trends…" : "Select stocks and Scan Now."}
                    </td></tr>
                  ) : (
                    sortedResults.map((r) => {
                      const meta = STATE_META[r.state] || STATE_META.neutral;
                      const cur = r.currency === "INR" ? "₹" : r.currency === "USD" ? "$" : "";
                      const stack = [r.stack?.pOver10, r.stack?.m10Over20, r.stack?.m20Over50, r.stack?.m50Over200];
                      return (
                        <tr key={r.symbol} className="border-b border-slate-100 hover:bg-slate-50 transition">
                          <td className="px-4 py-3">
                            <Link href={`/charts?symbol=${encodeURIComponent(r.symbol)}`} className="group">
                              <span className="block font-bold text-slate-900 group-hover:text-indigo-600">{r.name}</span>
                              <span className="block text-[11px] text-slate-400">{r.symbol}</span>
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black border ${meta.bg} ${meta.color}`}>
                              <meta.icon className="w-3.5 h-3.5" /> {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {/* 4 alignment segments: green=aligned bullish */}
                            <div className="flex items-center gap-1" title="Price>10  10>20  20>50  50>200">
                              {stack.map((ok, i) => (
                                <span key={i} className={`h-2 w-6 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-400"}`} />
                              ))}
                              <span className="ml-1 text-[10px] font-bold text-slate-400">{r.score}/4</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">
                            {fmt(r.price, cur)}
                            {r.changePct != null && (
                              <span className={`block text-[11px] ${r.changePct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {r.changePct >= 0 ? "+" : ""}{r.changePct.toFixed(2)}%
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-500 text-xs hidden lg:table-cell">
                            <div>{fmt(r.ma?.m50, cur)}</div>
                            <div>{fmt(r.ma?.m200, cur)}</div>
                            <div className={`text-[10px] font-bold ${r.golden ? "text-emerald-600" : "text-rose-600"}`}>
                              {r.has200 ? (r.golden ? "50 > 200 ✓" : "50 < 200") : "no 200-DMA"}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-400 italic">
            Daily moving averages via Yahoo Finance. Research support only. Not buy/sell advice. Always verify data independently.
          </p>
        </div>

        {/* Sidebar: stocks + alert settings */}
        <div className="space-y-5">
          {/* Stocks */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <h3 className="text-sm font-black text-slate-800 mb-3">Monitored stocks ({selected.length})</h3>
            <div className="flex gap-2 mb-3">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addManual()}
                placeholder="Add symbol e.g. AAPL"
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button onClick={addManual} className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-700"><Plus className="w-4 h-4" /></button>
            </div>
            {candidates.length === 0 ? (
              <p className="text-xs text-slate-400">
                Add symbols above, or build a{" "}
                <Link href="/portfolio" className="text-indigo-600 font-bold underline">portfolio</Link>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((c) => {
                  const on = selected.includes(c.symbol);
                  return (
                    <button key={c.symbol} onClick={() => toggleSel(c.symbol)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${on ? "bg-indigo-600 text-white" : "bg-white text-slate-500 border border-slate-200 hover:border-indigo-300"}`}
                      title={c.src.join(", ")}>
                      {c.src.includes("Portfolio") && <Briefcase className="w-3 h-3" />}
                      {!c.src.includes("Portfolio") && c.src.includes("Watchlist") && <Star className="w-3 h-3" />}
                      {c.symbol}
                      {on && <X className="w-3 h-3" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Alert settings */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <h3 className="text-sm font-black text-slate-800 mb-1">Which alerts?</h3>
            <p className="text-xs text-slate-400 mb-3">Toggle what you want to be notified about.</p>
            <div className="space-y-2">
              {ALERT_DEFS.map((a) => (
                <label key={a.key} className="flex items-start gap-2.5 cursor-pointer group">
                  <input type="checkbox" checked={!!alerts[a.key]} onChange={() => toggleAlert(a.key)}
                    className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0" />
                  <span>
                    <span className="block text-sm font-bold text-slate-700 group-hover:text-slate-900">{a.label}</span>
                    <span className="block text-[11px] text-slate-400 leading-snug">{a.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Alert history */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-slate-800">Alert history</h3>
              {history.length > 0 && (
                <button onClick={() => { clearTrendHistory(); setHistory([]); }} className="text-xs font-bold text-slate-400 hover:text-rose-600">
                  Clear
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No alerts fired yet. Ones that fire will be logged here.</p>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                {history.slice(0, 40).map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${h.kind === "bull" ? "bg-emerald-500" : "bg-rose-500"}`} />
                    <span>
                      <span className="text-slate-700">{h.message}</span>
                      <span className="block text-[10px] text-slate-400">{new Date(h.at).toLocaleString()}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
