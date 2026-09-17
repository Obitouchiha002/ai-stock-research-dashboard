"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

// Performance over time — the payoff of the new database. Current P&L (India ₹ and
// US $ separately) is read from the holdings you already have; a value trend is
// drawn from the daily snapshots the server saves, filling in day by day.
// Research support only — not advice.

type Snap = { snap_date: string; in_value: number; in_invested: number; us_value: number; us_invested: number };
type Live = { inV: number; inI: number; usV: number; usI: number; holdings: number };

const fmt = (n: number, d = 0) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });
const N = (v: any) => { const x = Number(v); return isFinite(x) ? x : NaN; };

function readHoldings(): any[] {
  try {
    const raw = window.localStorage.getItem("sa_portfolio");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Current value per market — mirrors the portfolio page exactly: holdings carry
// `shares`, `buyPrice` and (after a price read) `currentPrice`; anything missing a
// current price is filled from a live quote. India vs US by the holding's market.
function computeLive(holdings: any[], quotes: Record<string, any>): Live {
  const l: Live = { inV: 0, inI: 0, usV: 0, usI: 0, holdings: holdings.length };
  for (const h of holdings) {
    const sym = String(h.symbol || h.stockName || "").toUpperCase();
    const shares = N(h.shares), buy = N(h.buyPrice);
    const cp = isFinite(N(h.currentPrice)) ? N(h.currentPrice) : N(quotes[sym]?.price);
    const price = isFinite(cp) ? cp : buy; // fall back to cost if no live price yet
    const value = isFinite(shares) && isFinite(price) ? shares * price : NaN;
    const invested = isFinite(shares) && isFinite(buy) ? shares * buy : NaN;
    if (!isFinite(value) && !isFinite(invested)) continue;
    const india = h.market === "Indian Stocks" || sym.endsWith(".NS") || sym.endsWith(".BO");
    if (india) { if (isFinite(value)) l.inV += value; if (isFinite(invested)) l.inI += invested; }
    else { if (isFinite(value)) l.usV += value; if (isFinite(invested)) l.usI += invested; }
  }
  return l;
}

function Spark({ pts, up }: { pts: number[]; up: boolean }) {
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const w = 150, h = 44;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / span) * h}`).join(" ");
  const area = `0,${h} ${d} ${w},${h}`;
  const color = up ? "#059669" : "#e11d48";
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polygon points={area} fill={color} opacity="0.08" />
      <polyline points={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Card({ flag, label, cur, value, invested, hist }: { flag: string; label: string; cur: string; value: number; invested: number; hist: number[] }) {
  if (value <= 0 && invested <= 0) return null;
  const pl = value - invested;
  const plPct = invested > 0 ? (pl / invested) * 100 : 0;
  const up = pl >= 0;
  const grad = up ? "from-emerald-50 via-white to-white" : "from-rose-50 via-white to-white";
  const ring = up ? "border-emerald-200 hover:border-emerald-400" : "border-rose-200 hover:border-rose-400";
  const accent = up ? "bg-emerald-500" : "bg-rose-500";
  return (
    <div className={`group relative overflow-hidden rounded-3xl border-2 ${ring} bg-gradient-to-br ${grad} p-6 shadow-sm transition-all duration-300 hover:shadow-2xl hover:-translate-y-1`}>
      <span className={`absolute left-0 top-0 h-full w-1.5 ${accent}`} />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div>
          <div className="text-sm font-extrabold uppercase tracking-widest text-slate-500">{flag} {label}</div>
          <div className="mt-2 text-4xl font-black text-slate-900 tabular-nums transition-transform duration-300 group-hover:scale-[1.03] origin-left">
            {cur}{fmt(value)}
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-black text-white shadow-sm"
            style={{ background: up ? "linear-gradient(90deg,#10b981,#059669)" : "linear-gradient(90deg,#f43f5e,#e11d48)" }}>
            {up ? "▲" : "▼"} {cur}{fmt(Math.abs(pl))} · {up ? "+" : "−"}{fmt(Math.abs(plPct), 2)}%
          </div>
          <div className="mt-2 text-xs font-semibold text-slate-400">Invested {cur}{fmt(invested)}</div>
        </div>
        <div className="shrink-0 pt-1">
          {hist.length >= 2 ? <Spark pts={hist} up={up} />
            : <span className="text-[10px] font-semibold text-slate-300">trend builds<br />daily 📈</span>}
        </div>
      </div>
    </div>
  );
}

export default function PortfolioPerformance() {
  const [live, setLive] = useState<Live | null>(null);
  const [snaps, setSnaps] = useState<Snap[]>([]);

  useEffect(() => {
    let cancelled = false;
    let quotes: Record<string, any> = {};
    const compute = () => { if (!cancelled) setLive(computeLive(readHoldings(), quotes)); };
    compute(); // instant from stored values
    window.addEventListener("sa-synced", compute);
    const iv = setInterval(compute, 8000);

    // Fill any missing current prices from a live quote fetch, then recompute.
    (async () => {
      try {
        const holdings = readHoldings();
        const syms = Array.from(new Set(holdings.map((h) => String(h.symbol || "").toUpperCase()).filter(Boolean)));
        if (!syms.length) return;
        const r = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms.slice(0, 200) }) });
        const j = await r.json();
        quotes = j.quotes || {};
        compute();
      } catch { /* stored values remain */ }
    })();

    (async () => {
      const sb = getSupabase();
      if (!sb) return;
      try {
        const { data: auth } = await sb.auth.getUser();
        if (!auth?.user) return;
        const { data } = await sb.from("portfolio_snapshots")
          .select("snap_date,in_value,in_invested,us_value,us_invested")
          .eq("user_id", auth.user.id).order("snap_date", { ascending: true }).limit(400);
        if (!cancelled) setSnaps((data as Snap[]) || []);
      } catch { /* none yet */ }
    })();

    return () => { cancelled = true; clearInterval(iv); window.removeEventListener("sa-synced", compute); };
  }, []);

  if (!live || (live.holdings === 0)) return null;
  const hasValue = live.inV > 0 || live.usV > 0 || live.inI > 0 || live.usI > 0;
  if (!hasValue) return null;

  const inHist = snaps.map((s) => Number(s.in_value)).filter((v) => v > 0);
  const usHist = snaps.map((s) => Number(s.us_value)).filter((v) => v > 0);

  return (
    <div className="mb-8 rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-indigo-600 text-white text-lg shadow-md">📈</span>
          Performance over time
        </h2>
        <span className="text-xs font-bold uppercase tracking-widest text-indigo-500 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1">
          {snaps.length >= 2 ? `${snaps.length} days tracked` : "tracking started · trend builds daily"}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <Card flag="🇮🇳" label="India" cur="₹" value={live.inV} invested={live.inI} hist={inHist} />
        <Card flag="🇺🇸" label="US" cur="$" value={live.usV} invested={live.usI} hist={usHist} />
      </div>
    </div>
  );
}
