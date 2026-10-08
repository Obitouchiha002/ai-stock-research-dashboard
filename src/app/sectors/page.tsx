"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { RefreshCw, TrendingUp, TrendingDown, Zap } from "lucide-react";
import { addNotification } from "@/lib/storage";

// Notify once per sector+condition per day (so opening the page doesn't re-spam).
function notifyOnce(key: string) {
  try {
    const k = "sa_sector_alert_seen";
    const today = new Date().toISOString().slice(0, 10);
    const seen = JSON.parse(localStorage.getItem(k) || "{}");
    if (seen[key] === today) return false;
    seen[key] = today;
    localStorage.setItem(k, JSON.stringify(seen));
    return true;
  } catch { return false; }
}

// Sector Pulse — which sectors are hot / cold today, at a glance. Powered by the
// EODHD index history (sectoral indices have no free chart data anywhere else),
// so every tile carries a real RSI + trend read, not just the day move.
//
// Symbols are app-side tickers; the APIs map them to EODHD (.INDX) under the hood.
const IN_SECTORS = [
  { name: "Nifty Bank", sym: "^NSEBANK" },
  { name: "Nifty Pvt Bank", sym: "NIFTY_PVT_BANK.NS" },
  { name: "Nifty PSU Bank", sym: "^CNXPSUBANK" },
  { name: "Nifty Fin Services", sym: "NIFTY_FIN_SERVICE.NS" },
  { name: "Nifty IT", sym: "^CNXIT" },
  { name: "Nifty Auto", sym: "^CNXAUTO" },
  { name: "Nifty FMCG", sym: "^CNXFMCG" },
  { name: "Nifty Pharma", sym: "^CNXPHARMA" },
  { name: "Nifty Healthcare", sym: "NIFTY_HEALTHCARE.NS" },
  { name: "Nifty Metal", sym: "^CNXMETAL" },
  { name: "Nifty Energy", sym: "^CNXENERGY" },
  { name: "Nifty Infra", sym: "^CNXINFRA" },
  { name: "Nifty Realty", sym: "NIFTYREAL.NS" },
  { name: "Nifty Media", sym: "^CNXMEDIA" },
];
const US_SECTORS = [
  { name: "Info Tech", sym: "^SP500-45" },
  { name: "Financials", sym: "^SP500-40" },
  { name: "Health Care", sym: "^SP500-35" },
  { name: "Cons. Disc.", sym: "^SP500-2550" },
  { name: "Cons. Staples", sym: "^SP500-30" },
  { name: "Industrials", sym: "^SP500-20" },
  { name: "Materials", sym: "^SP500-15" },
  { name: "Comm. Svc.", sym: "^SP500-50" },
  { name: "Utilities", sym: "^SP500-55" },
  { name: "Real Estate", sym: "^SP500-6020" },
];
const SETTINGS = { rsiOverbought: 70, rsiOversold: 30, adxTrend: 25, diSpread: 5, volSurge: 50, style: "Long-term investor", risk: "Balanced", horizon: "Long (years)", focus: "" };

type Row = { name: string; symbol: string; price: number | null; changePct: number | null; rsi: number | null; action: string | null; trend: string | null };

async function loadSectors(list: { name: string; sym: string }[], market: "Indian" | "US"): Promise<Row[]> {
  const syms = list.map((s) => s.sym);
  const h = { "Content-Type": "application/json" };
  const [qr, tr] = await Promise.all([
    fetch("/api/quotes", { method: "POST", headers: h, body: JSON.stringify({ symbols: syms }) }).then((r) => r.json()).catch(() => ({})),
    fetch("/api/portfolio-analysis", { method: "POST", headers: h, body: JSON.stringify({ market, withAi: false, timeframe: "1d", settings: SETTINGS, holdings: list.map((s) => ({ symbol: s.sym, name: s.name, shares: 1, buyPrice: 1, currentPrice: 1, market })) }) }).then((r) => r.json()).catch(() => ({})),
  ]);
  const quotes: Record<string, any> = qr.quotes || {};
  const techBy: Record<string, any> = {};
  (tr.holdings || []).forEach((x: any) => { techBy[String(x.symbol).toUpperCase()] = x.tech; });
  return list
    .map((s) => {
      const q = quotes[s.sym.toUpperCase()] || {};
      const t = techBy[s.sym.toUpperCase()] || {};
      return { name: s.name, symbol: s.sym, price: q.price ?? null, changePct: q.changePct ?? null, rsi: t?.ok ? (t.rsi ?? null) : null, action: t?.ok ? (t.action ?? null) : null, trend: t?.ok ? (t.maStack?.label ?? null) : null };
    })
    .sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));
}

const pct = (p: number | null) => (p == null ? "—" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`);
const actionTone = (a: string | null) =>
  a === "Buy" ? "bg-emerald-100 text-emerald-800" : a === "Sell" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600";

function SectorList({ title, flag, rows }: { title: string; flag: string; rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-200 flex items-center gap-2">
        <span className="text-base">{flag}</span>
        <h3 className="text-[12px] font-black uppercase tracking-wide text-slate-600">{title}</h3>
        <span className="text-[11px] text-slate-400 font-semibold ml-auto">sorted by today</span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((r) => {
          const up = (r.changePct ?? 0) >= 0;
          return (
            <Link key={r.symbol} href={`/charts?symbol=${encodeURIComponent(r.symbol)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/40">
              <div className="w-1.5 h-9 rounded-full" style={{ background: up ? "#10b981" : "#f43f5e", opacity: Math.min(1, 0.3 + Math.abs(r.changePct ?? 0) / 3) }} />
              <div className="flex-1 min-w-0">
                <div className="font-black text-slate-900 text-[14px] truncate">{r.name}</div>
                <div className="text-[11px] text-slate-400">{r.price != null ? r.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</div>
              </div>
              <div className={`text-right font-black tabular-nums text-[15px] ${up ? "text-emerald-600" : "text-rose-600"}`}>
                <div className="flex items-center gap-1 justify-end">{up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}{pct(r.changePct)}</div>
              </div>
              <div className="w-14 text-center">
                <div className={`text-[13px] font-black tabular-nums ${r.rsi == null ? "text-slate-300" : r.rsi >= 70 ? "text-rose-600" : r.rsi <= 30 ? "text-amber-600" : "text-slate-600"}`}>{r.rsi ?? "—"}</div>
                <div className="text-[9px] text-slate-400 font-bold">RSI</div>
              </div>
              <span className={`hidden sm:inline-block text-[11px] font-black px-2.5 py-1 rounded-full ${actionTone(r.action)}`}>{r.action ?? "—"}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function SectorsPage() {
  const [ind, setInd] = useState<Row[]>([]);
  const [us, setUs] = useState<Row[]>([]);
  const [watch, setWatch] = useState<{ row: Row; why: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, b] = await Promise.all([loadSectors(IN_SECTORS, "Indian"), loadSectors(US_SECTORS, "US")]);
    setInd(a); setUs(b); setAt(Date.now()); setLoading(false);

    // Sectors at an actionable extreme — the "to watch" signal. Notify once/day.
    const flagged: { row: Row; why: string }[] = [];
    for (const r of [...a, ...b]) {
      if (r.rsi == null) continue;
      const why = r.rsi >= 70 ? "RSI overbought" : r.rsi <= 30 ? "RSI oversold" : "";
      if (!why) continue;
      flagged.push({ row: r, why });
      if (notifyOnce(`${r.symbol}:${why}`)) {
        addNotification({ type: "info", message: `${r.name}: ${why} (RSI ${r.rsi}) — ${r.action || ""}`.trim() });
      }
    }
    setWatch(flagged);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-black text-slate-900">🌡️ Sector Pulse</h1>
        <span className="text-[12px] text-slate-400 font-medium hidden sm:block">which sectors are hot / cold today — with a real RSI &amp; trend read</span>
        <button onClick={load} disabled={loading} className="ml-auto flex items-center gap-1.5 text-[12px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      {watch.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
          <Zap className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-[12.5px] text-amber-900 leading-relaxed">
            <span className="font-black">⚡ Sectors to watch:</span>{" "}
            {watch.map((w, i) => (
              <span key={w.row.symbol}>
                {i > 0 && " · "}
                <Link href={`/charts?symbol=${encodeURIComponent(w.row.symbol)}`} className="font-bold underline decoration-amber-400 hover:text-amber-700">{w.row.name}</Link>
                <span className="text-amber-700"> ({w.why.replace("RSI ", "")}, RSI {w.row.rsi})</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {loading && !ind.length ? (
        <div className="text-sm text-slate-500 px-1 py-10 text-center">Reading sector trends…</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <SectorList title="India sectors" flag="🇮🇳" rows={ind} />
          <SectorList title="US sectors" flag="🇺🇸" rows={us} />
        </div>
      )}
      {at && <div className="text-[11px] text-slate-400 text-center">Updated {new Date(at).toLocaleTimeString()} · research support only, not advice</div>}
    </div>
  );
}
