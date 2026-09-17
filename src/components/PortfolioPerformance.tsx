"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

// Portfolio performance — the payoff of the new database. Shows live P&L (India ₹
// and US $ separately, to avoid mixing currencies) computed from qty x price, plus
// a value trend from the daily snapshots the server saves over time. History fills
// in day by day. Research support only — not advice.

type Snap = { snap_date: string; in_value: number; in_invested: number; us_value: number; us_invested: number };
type Live = { inV: number; inI: number; usV: number; usI: number; holdings: number };

const fmt = (n: number, d = 0) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });

function readHoldings(): any[] {
  try {
    const raw = window.localStorage.getItem("sa_portfolio");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function Spark({ pts, up }: { pts: number[]; up: boolean }) {
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const w = 120, h = 34;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / span) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={d} fill="none" stroke={up ? "#059669" : "#e11d48"} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function Card({ flag, label, cur, value, invested, hist }: { flag: string; label: string; cur: string; value: number; invested: number; hist: number[] }) {
  if (value <= 0 && invested <= 0) return null;
  const pl = value - invested;
  const plPct = invested > 0 ? (pl / invested) * 100 : 0;
  const up = pl >= 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-slate-500">{flag} {label}</div>
        <Spark pts={hist} up={up} />
      </div>
      <div className="mt-2 text-2xl font-black text-slate-900">{cur}{fmt(value)}</div>
      <div className={`mt-1 text-sm font-bold ${up ? "text-emerald-600" : "text-rose-600"}`}>
        {up ? "▲" : "▼"} {cur}{fmt(Math.abs(pl))} ({up ? "+" : "−"}{fmt(Math.abs(plPct), 2)}%)
      </div>
      <div className="mt-1 text-xs text-slate-400">Invested {cur}{fmt(invested)}</div>
    </div>
  );
}

export default function PortfolioPerformance() {
  const [live, setLive] = useState<Live | null>(null);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const holdings = readHoldings();
      // Live totals from qty x current price.
      let l: Live = { inV: 0, inI: 0, usV: 0, usI: 0, holdings: holdings.length };
      const syms = Array.from(new Set(holdings.map((h) => String(h.symbol || "").toUpperCase()).filter(Boolean)));
      if (syms.length) {
        try {
          const r = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms }) });
          const j = await r.json();
          const q = j.quotes || {};
          for (const h of holdings) {
            const sym = String(h.symbol || "").toUpperCase();
            const qty = Number(h.qty), buy = Number(h.price), ltp = q[sym]?.price;
            if (!isFinite(qty) || typeof ltp !== "number") continue;
            const cur = q[sym]?.currency || (sym.endsWith(".NS") || sym.endsWith(".BO") ? "INR" : "USD");
            const val = qty * ltp, inv = isFinite(buy) ? qty * buy : 0;
            if (cur === "INR") { l.inV += val; l.inI += inv; } else { l.usV += val; l.usI += inv; }
          }
        } catch { /* leave zeros */ }
      }
      // History from snapshots (logged-in users).
      let history: Snap[] = [];
      const sb = getSupabase();
      if (sb) {
        try {
          const { data: auth } = await sb.auth.getUser();
          if (auth?.user) {
            const { data } = await sb.from("portfolio_snapshots").select("snap_date,in_value,in_invested,us_value,us_invested").eq("user_id", auth.user.id).order("snap_date", { ascending: true }).limit(400);
            history = (data as Snap[]) || [];
          }
        } catch { /* none */ }
      }
      if (!cancelled) { setLive(l); setSnaps(history); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-400">Loading performance…</div>;
  if (!live || (live.inV <= 0 && live.usV <= 0)) return null;

  const inHist = snaps.map((s) => Number(s.in_value)).filter((v) => v > 0);
  const usHist = snaps.map((s) => Number(s.us_value)).filter((v) => v > 0);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-black text-slate-900">📈 Portfolio Performance</h2>
        <span className="text-xs text-slate-400">
          {snaps.length >= 2 ? `${snaps.length} days tracked` : "history builds daily"}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card flag="🇮🇳" label="India" cur="₹" value={live.inV} invested={live.inI} hist={inHist} />
        <Card flag="🇺🇸" label="US" cur="$" value={live.usV} invested={live.usI} hist={usHist} />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Live P&amp;L from your holdings (qty × price). The trend line grows as daily snapshots are saved.
        Research support only — not advice.
      </p>
    </div>
  );
}
