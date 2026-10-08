"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { RefreshCw, TrendingUp, TrendingDown, Flame, LineChart } from "lucide-react";

// Full-market screener — scans the whole US exchange (~tens of thousands of
// symbols) via one EODHD bulk call, then surfaces the classic screens. Only
// possible with EODHD (Yahoo can't scan a universe this size).
type Stock = { symbol: string; name: string; close: number; fromHigh: number; fromLow: number; volRatio: number | null; mcapB: number };
type Data = { asOf: string; universe: number; near52High: Stock[]; near52Low: Stock[]; volSurge: Stock[]; uptrend: Stock[] };

const TABS = [
  { key: "near52High", label: "52-Week Highs", icon: TrendingUp, tint: "text-emerald-600", metric: (s: Stock) => `${s.fromHigh >= 0 ? "+" : ""}${s.fromHigh}% vs high`, hint: "At or near the 1-year high — breakout candidates, volume-confirmed." },
  { key: "uptrend", label: "Strong Uptrend", icon: LineChart, tint: "text-indigo-600", metric: (s: Stock) => `${s.volRatio ?? "—"}× vol`, hint: "Price > 50-day EMA > 200-day EMA — a clean uptrend stack." },
  { key: "volSurge", label: "Volume Surge", icon: Flame, tint: "text-amber-600", metric: (s: Stock) => `${s.volRatio ?? "—"}× avg vol`, hint: "Today's volume well above its 14-day average — unusual activity." },
  { key: "near52Low", label: "52-Week Lows", icon: TrendingDown, tint: "text-rose-600", metric: (s: Stock) => `${s.fromLow >= 0 ? "+" : ""}${s.fromLow}% vs low`, hint: "At or near the 1-year low." },
] as const;

export default function ScreenerPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("near52High");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/screener", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (j.error) setErr(j.error); else setData(j);
    } catch { setErr("Could not load the screener. Try again."); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = TABS.find((t) => t.key === tab)!;
  const rows = (data?.[tab] as Stock[]) || [];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-black text-slate-900">🔍 Market Screener</h1>
        {data && <span className="text-[12px] text-slate-400 font-medium">scanned {data.universe.toLocaleString()} US stocks · {data.asOf}</span>}
        <button onClick={load} disabled={loading} className="ml-auto flex items-center gap-1.5 text-[12px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 text-[12.5px] font-bold px-3 py-2 rounded-xl border ${tab === t.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
              {data && <span className={`text-[10px] ${tab === t.key ? "text-slate-300" : "text-slate-400"}`}>{(data[t.key] as Stock[]).length}</span>}
            </button>
          );
        })}
      </div>

      {err && <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-[13px] text-rose-700">{err}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-200">
          <div className={`text-[12px] font-black uppercase tracking-wide flex items-center gap-1.5 ${active.tint}`}><active.icon className="w-4 h-4" /> {active.label}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{active.hint}</div>
        </div>
        {loading && !data ? (
          <div className="text-sm text-slate-500 px-4 py-12 text-center flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Scanning the whole US market…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-500 px-4 py-10 text-center">Nothing matched this screen today.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((s, i) => (
              <Link key={s.symbol} href={`/charts?symbol=${encodeURIComponent(s.symbol)}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50/40">
                <span className="text-[11px] font-black text-slate-300 w-5 text-right tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-slate-900 text-[13.5px]">{s.symbol}</div>
                  <div className="text-[11px] text-slate-400 truncate">{s.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-black text-slate-800 text-[13px] tabular-nums">${s.close.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400">${s.mcapB}B</div>
                </div>
                <span className={`text-[11.5px] font-black tabular-nums w-24 text-right ${active.tint}`}>{active.metric(s)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="text-[11px] text-slate-400 text-center">US common stocks &gt; $300M mcap &amp; liquid · EOD data · research support only, not advice</div>
    </div>
  );
}
