"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Target,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  FileSpreadsheet,
} from "lucide-react";
import {
  getPortfolio,
  savePortfolioHolding,
  deletePortfolioHolding,
  bulkAddHoldings,
  replaceHoldingsForMarkets,
  inferPortfolioMarket,
  logAiUsageDetailed,
  PORTFOLIO_MARKETS,
  type PortfolioMarket,
} from "@/lib/storage";
import { parseWorkbook, resolveHolding } from "@/lib/excelImport";

const CUR: Record<PortfolioMarket, string> = {
  "US Stocks": "$",
  "Indian Stocks": "₹",
};

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [market, setMarket] = useState<PortfolioMarket>("US Stocks");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ symbol: "", shares: "", price: "" });
  const [refreshing, setRefreshing] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [review, setReview] = useState<any | null>(null);

  // Excel import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importPending, setImportPending] = useState<
    { holdings: any[]; fileName: string; skipped: number; indianCount: number; usCount: number } | null
  >(null);

  useEffect(() => {
    setHoldings(getPortfolio());
  }, []);

  // Parse an Excel/CSV workbook -> resolve symbols for the active market ->
  // hand off to the overwrite/append prompt. Rows without qty AND price can't
  // become holdings, so they're skipped (and counted).
  const handleImportFile = async (file: File) => {
    setImportError("");
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const sheets = parseWorkbook(buf);
      const rows = sheets.flatMap((s) => s.rows);
      const usable = rows.filter((r) => r.qty != null && r.price != null);
      const skipped = rows.length - usable.length;
      if (usable.length === 0) {
        setImportError(
          "No usable rows found. Each holding needs a Stock Name, Qty and Price column.",
        );
        setImporting(false);
        return;
      }
      // Auto-detect each row's market from its symbol, so Indian (.NS/.BO) and
      // US stocks sort into their own tabs and never mix — regardless of which
      // tab is active.
      const holdings = await Promise.all(
        usable.map(async (r) => {
          const { symbol, market: detected } = await resolveHolding(r);
          return {
            symbol: (symbol || r.symbol || r.stockName).toUpperCase(),
            name: r.stockName,
            market: detected,
            shares: r.qty as number,
            buyPrice: r.price as number,
            currentPrice: r.price as number,
          };
        }),
      );
      const indianCount = holdings.filter((h) => h.market === "Indian Stocks").length;
      const usCount = holdings.length - indianCount;
      setImportPending({ holdings, fileName: file.name, skipped, indianCount, usCount });
    } catch {
      setImportError("Could not read that file. Supported: .xlsx, .xls, .csv");
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = (mode: "overwrite" | "append") => {
    if (!importPending) return;
    // Each holding already carries its own auto-detected market.
    if (mode === "overwrite") replaceHoldingsForMarkets(importPending.holdings);
    else bulkAddHoldings(importPending.holdings);
    setImportPending(null);
    setHoldings(getPortfolio());
    refreshPrices();
  };

  const cur = CUR[market];
  const marketHoldings = holdings.filter((h) => h.market === market);

  const [adding, setAdding] = useState(false);
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.symbol || !form.shares || !form.price) return;
    setAdding(true);
    try {
      // Resolve a name or loose ticker to a real symbol, and let the resolver
      // decide the market (a ".NS" or an Indian name lands in Indian Stocks).
      // Falls back to the raw upper-cased text if resolution fails.
      let symbol = form.symbol.trim().toUpperCase();
      let detected: "US Stocks" | "Indian Stocks" = market;
      try {
        const r = await resolveHolding({ symbol: form.symbol.trim(), stockName: form.symbol.trim() }, market);
        if (r?.symbol) symbol = r.symbol.toUpperCase();
        if (r?.market) detected = r.market;
      } catch {
        detected = inferPortfolioMarket(symbol) === "Indian Stocks" ? "Indian Stocks" : market;
      }
      savePortfolioHolding({
        symbol,
        market: detected,
        shares: Number(form.shares),
        buyPrice: Number(form.price),
        currentPrice: Number(form.price),
      });
      setHoldings(getPortfolio());
      setShowAdd(false);
      setForm({ symbol: "", shares: "", price: "" });
      refreshPrices();
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = (id: string) => {
    deletePortfolioHolding(id);
    setHoldings(getPortfolio());
  };

  // Batch-refresh live prices for all holdings in one call.
  const refreshPrices = async () => {
    setRefreshing(true);
    const current = getPortfolio();
    const symbols = Array.from(new Set(current.map((h) => h.symbol)));
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });
      const j = await res.json();
      const quotes = j.quotes || {};
      current.forEach((h) => {
        const q = quotes[h.symbol];
        if (q && q.price != null) {
          savePortfolioHolding({ ...h, currentPrice: q.price });
        }
      });
    } catch {
      /* keep last known prices */
    }
    setHoldings(getPortfolio());
    setRefreshing(false);
  };

  // AI Portfolio Review — momentum per holding (current market only).
  const runReview = async () => {
    const current = getPortfolio().filter((h) => h.market === market);
    if (current.length === 0) return;
    setReviewLoading(true);
    setReview(null);
    try {
      const subset = current.slice(0, 12);
      const results = await Promise.all(
        subset.map(async (h) => {
          try {
            const res = await fetch("/api/momentum", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                symbol: h.symbol,
                market: market === "Indian Stocks" ? "IN" : "US",
              }),
            });
            const j = await res.json();
            const m = j.momentum;
            const value = h.shares * (h.currentPrice || h.buyPrice);
            return m
              ? {
                  symbol: h.symbol,
                  value,
                  pl: h.shares * ((h.currentPrice || h.buyPrice) - h.buyPrice),
                  momentumScore: m.snapshot?.momentumScore,
                  momentumView: m.snapshot?.finalMomentumView,
                  sector: m.sectorRank?.sector,
                }
              : { symbol: h.symbol, value, pl: 0, momentumView: "Data unavailable" };
          } catch {
            return { symbol: h.symbol, value: 0, pl: 0, momentumView: "Data unavailable" };
          }
        }),
      );

      const totalVal = results.reduce((s, r) => s + (r.value || 0), 0) || 1;
      const sectorExposure: Record<string, number> = {};
      const momentumBuckets: Record<string, number> = {};
      results.forEach((r) => {
        const sec = r.sector || "Unknown";
        sectorExposure[sec] = (sectorExposure[sec] || 0) + (r.value || 0);
        const v = r.momentumView || "Unknown";
        momentumBuckets[v] = (momentumBuckets[v] || 0) + 1;
      });
      const sectorPct = Object.entries(sectorExposure)
        .map(([k, v]) => ({ sector: k, pct: Math.round((v / totalVal) * 100) }))
        .sort((a, b) => b.pct - a.pct);
      const sorted = [...results].sort((a, b) => (b.pl || 0) - (a.pl || 0));
      const stats = {
        market,
        holdings: results,
        sectorPct,
        momentumBuckets,
        topGainer: sorted[0],
        topLoser: sorted[sorted.length - 1],
      };

      const prompt = `You are a portfolio research analyst. Review this ${market} portfolio using ONLY the data below.
RULES: Research support only. NO buy/sell advice. NO predictions. Research language only. Be concise (5-7 sentences). Cover: overall momentum health, concentration/diversification risk, strongest vs weakest holdings by momentum, and what to monitor next.
PORTFOLIO DATA: ${JSON.stringify(stats)}`;
      let aiText = "";
      try {
        const res = await fetch("/api/gemini/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const j = await res.json();
        aiText = j.text || j.error || "";
        logAiUsageDetailed("Portfolio Review", j.usage ?? { tokens: j.aiTokens });
      } catch {
        aiText = "";
      }
      setReview({ ...stats, aiText });
    } finally {
      setReviewLoading(false);
    }
  };

  const totals = useMemo(() => {
    const invested = marketHoldings.reduce((s, h) => s + h.shares * h.buyPrice, 0);
    const currentVal = marketHoldings.reduce(
      (s, h) => s + h.shares * (h.currentPrice || h.buyPrice),
      0,
    );
    const pl = currentVal - invested;
    const pct = invested > 0 ? (pl / invested) * 100 : 0;
    return { invested, currentVal, pl, pct };
  }, [marketHoldings]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    holdings.forEach((h) => {
      c[h.market] = (c[h.market] || 0) + 1;
    });
    return c;
  }, [holdings]);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Target className="w-8 h-8 text-indigo-600" /> Portfolio
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Track US and Indian holdings separately, each in its own currency.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runReview}
            disabled={reviewLoading || marketHoldings.length === 0}
            className="px-3.5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition disabled:opacity-50 whitespace-nowrap"
          >
            {reviewLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI Review
          </button>
          <button
            onClick={refreshPrices}
            disabled={refreshing || holdings.length === 0}
            className="px-3.5 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-2 transition disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="px-3.5 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-2 transition disabled:opacity-50 whitespace-nowrap"
          >
            {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Import Excel
          </button>
          <Link
            href="/trend-alerts"
            className="px-3.5 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-2 transition whitespace-nowrap"
          >
            <TrendingUp className="w-4 h-4" /> Trend Alerts
          </Link>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" /> Add Holding
          </button>
        </div>
      </div>

      {importError && (
        <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-6">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {importError}
        </div>
      )}

      {/* Import: overwrite vs add-new prompt */}
      {importPending && (
        <div
          className="fixed inset-0 z-[120] bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => setImportPending(null)}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900 mb-1">Import “{importPending.fileName}”</h3>
            <p className="text-sm text-slate-500 mb-3">
              Found <b>{importPending.holdings.length}</b> holding
              {importPending.holdings.length > 1 ? "s" : ""}
              {importPending.skipped > 0 && <> ({importPending.skipped} row(s) skipped — missing Qty/Price)</>}. How
              should I add them?
            </p>
            {/* Auto-split preview */}
            <div className="flex gap-2 mb-4 text-xs font-bold">
              {importPending.usCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700">$ {importPending.usCount} US</span>
              )}
              {importPending.indianCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-orange-50 text-orange-700">₹ {importPending.indianCount} Indian</span>
              )}
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500">auto-sorted by symbol</span>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => confirmImport("append")}
                className="w-full text-left px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition"
              >
                <div className="font-bold text-indigo-900">Add to their tabs</div>
                <div className="text-xs text-indigo-700">
                  Append — US stocks go to the US tab, Indian to the Indian tab. Never mixed.
                </div>
              </button>
              <button
                onClick={() => confirmImport("overwrite")}
                className="w-full text-left px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 transition"
              >
                <div className="font-bold text-rose-900">
                  Overwrite {[importPending.usCount > 0 && "US", importPending.indianCount > 0 && "Indian"].filter(Boolean).join(" + ")}
                </div>
                <div className="text-xs text-rose-700">
                  Replace existing holdings in {importPending.indianCount > 0 && importPending.usCount > 0 ? "both those markets" : "that market"} with this file. The other market is left untouched.
                </div>
              </button>
              <button
                onClick={() => setImportPending(null)}
                className="w-full px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Market tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {PORTFOLIO_MARKETS.map((m) => (
          <button
            key={m}
            onClick={() => {
              setMarket(m);
              setReview(null);
            }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
              market === m
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span className="text-base">{CUR[m]}</span>
            {m}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-md ${
                market === m ? "bg-white/20" : "bg-slate-100 text-slate-500"
              }`}
            >
              {counts[m] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-0">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Total Invested</div>
          <div className="text-2xl lg:text-3xl font-black text-slate-900 tabular-nums truncate">
            {cur}
            {totals.invested.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-0">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Current Value</div>
          <div className="text-2xl lg:text-3xl font-black text-slate-900 tabular-nums truncate">
            {cur}
            {totals.currentVal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm min-w-0">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Total P/L</div>
          <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums ${totals.pl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
            <span className="text-2xl lg:text-3xl font-black truncate">
              {totals.pl >= 0 ? "+" : "-"}
              {cur}
              {Math.abs(totals.pl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span className="text-sm font-bold px-2 py-0.5 bg-slate-50 rounded-lg whitespace-nowrap">
              {totals.pl >= 0 ? "+" : ""}
              {totals.pct.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* AI review */}
      {review && (
        <div className="bg-white border border-indigo-200 rounded-2xl shadow-sm p-6 mb-8">
          <h3 className="text-sm font-black text-indigo-700 flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4" /> AI Review — {review.market}
          </h3>
          {review.aiText ? (
            <p className="text-sm text-slate-700 leading-relaxed mb-5 whitespace-pre-wrap">{review.aiText}</p>
          ) : (
            <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100 mb-5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              AI summary is busy right now — the computed stats below are still accurate.
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-2">Momentum Mix</div>
              {Object.entries(review.momentumBuckets).map(([k, v]: any) => (
                <div key={k} className="flex justify-between text-xs py-0.5">
                  <span className="text-slate-600">{k}</span>
                  <span className="font-bold text-slate-800">{v}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-2">Sector Exposure</div>
              {review.sectorPct.slice(0, 5).map((s: any) => (
                <div key={s.sector} className="flex justify-between text-xs py-0.5">
                  <span className="text-slate-600 truncate pr-2">{s.sector}</span>
                  <span className="font-bold text-slate-800">{s.pct}%</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-2">Strongest / Weakest (P/L)</div>
              {review.topGainer && (
                <div className="flex items-center gap-1.5 text-xs py-0.5 text-emerald-600 font-bold">
                  <TrendingUp className="w-3.5 h-3.5" /> {review.topGainer.symbol}
                  <span className="text-slate-400 font-medium">{review.topGainer.momentumView}</span>
                </div>
              )}
              {review.topLoser && (
                <div className="flex items-center gap-1.5 text-xs py-0.5 text-rose-600 font-bold">
                  <TrendingDown className="w-3.5 h-3.5" /> {review.topLoser.symbol}
                  <span className="text-slate-400 font-medium">{review.topLoser.momentumView}</span>
                </div>
              )}
            </div>
          </div>
          <p className="mt-4 text-[10px] text-slate-400 italic">Research support only. Not buy/sell advice. Momentum computed live per holding.</p>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-indigo-50 border border-indigo-100 p-6 rounded-2xl mb-8 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">Symbol</label>
            <input
              required
              type="text"
              placeholder={market === "Indian Stocks" ? "RELIANCE.NS or 'reliance'" : "AAPL or 'apple'"}
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              className="px-4 py-2 border-none rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">Shares</label>
            <input
              required
              type="number"
              step="any"
              placeholder="10"
              value={form.shares}
              onChange={(e) => setForm({ ...form, shares: e.target.value })}
              className="px-4 py-2 border-none rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold w-32"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">Buy Price ({cur})</label>
            <input
              required
              type="number"
              step="any"
              placeholder={market === "Indian Stocks" ? "2500" : "150"}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="px-4 py-2 border-none rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold w-32"
            />
          </div>
          <button type="submit" disabled={adding} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 h-[40px] disabled:opacity-50">
            {adding ? "Adding…" : `Add to ${market}`}
          </button>
          <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 bg-white text-slate-600 rounded-lg font-bold hover:bg-slate-100 h-[40px]">
            Cancel
          </button>
        </form>
      )}

      {/* Holdings table */}
      {marketHoldings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-500 font-medium">
          No {market} holdings yet. Click &quot;Add Holding&quot; to start tracking.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden sm:table-cell">S.No</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Stock Name (Code)</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Qty</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right hidden md:table-cell">Purchase Price</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Market Value</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right hidden md:table-cell">Cost Value</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Unrealised Gain</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {marketHoldings.map((h, idx) => {
                const ltp = h.currentPrice || h.buyPrice;
                const marketValue = ltp * h.shares; // Qty × current price
                const costValue = h.buyPrice * h.shares; // Qty × purchase price
                const gain = marketValue - costValue; // unrealised gain
                const gainPct = costValue > 0 ? (gain / costValue) * 100 : 0;
                const up = gain >= 0;
                const money = (n: number) => `${cur}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
                return (
                  <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="p-3 text-slate-400 tabular-nums hidden sm:table-cell">{idx + 1}</td>
                    <td className="p-3">
                      <span className="font-black text-slate-900">{h.name || h.symbol}</span>
                      {h.name && h.name !== h.symbol && (
                        <span className="ml-1.5 text-xs text-slate-400 font-bold">({h.symbol})</span>
                      )}
                    </td>
                    <td className="p-3 tabular-nums font-bold text-slate-700 text-right">{h.shares}</td>
                    <td className="p-3 tabular-nums font-bold text-slate-700 text-right hidden md:table-cell">{money(h.buyPrice)}</td>
                    <td className="p-3 tabular-nums font-bold text-slate-900 text-right">{money(marketValue)}</td>
                    <td className="p-3 tabular-nums font-bold text-slate-700 text-right hidden md:table-cell">{money(costValue)}</td>
                    <td className={`p-3 tabular-nums font-bold text-right ${up ? "text-emerald-600" : "text-rose-600"}`}>
                      {up ? "+" : "-"}
                      {money(Math.abs(gain))}
                      <span className="block text-[10px] font-medium">({up ? "+" : ""}{gainPct.toFixed(2)}%)</span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleRemove(h.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-black">
                <td colSpan={8} className="p-3">
                  <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-sm">
                    <span className="mr-auto text-xs uppercase tracking-wide text-slate-500">Total ({market})</span>
                    <span className="text-slate-500">
                      Value <span className="text-slate-900 tabular-nums">{cur}{totals.currentVal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </span>
                    <span className="text-slate-500 hidden sm:inline">
                      Invested <span className="text-slate-700 tabular-nums">{cur}{totals.invested.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </span>
                    <span className={totals.pl >= 0 ? "text-emerald-600" : "text-rose-600"}>
                      {totals.pl >= 0 ? "+" : "-"}{cur}{Math.abs(totals.pl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      <span className="ml-1 text-xs">({totals.pl >= 0 ? "+" : ""}{totals.pct.toFixed(2)}%)</span>
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-400 italic">
        Market Value = Qty × current price · Cost Value = Qty × purchase price · Unrealised Gain = Market Value − Cost
        Value. Live prices via Yahoo Finance. Research support only. Not buy/sell advice.
      </p>
    </div>
  );
}
