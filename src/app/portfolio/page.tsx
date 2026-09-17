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
  Activity,
  Bell,
  Search,
  Save,
  Check,
  Pencil,
} from "lucide-react";
import {
  getPortfolio,
  savePortfolioHolding,
  deletePortfolioHolding,
  bulkAddHoldings,
  replaceHoldingsForMarkets,
  inferPortfolioMarket,
  logAiUsageDetailed,
  getPriceAlerts,
  savePriceAlert,
  deletePriceAlert,
  syncStockTriggers,
  getPortfolioOrder,
  setPortfolioOrder,
  getEarnSectors,
  addEarnSector,
  PORTFOLIO_MARKETS,
  type PortfolioMarket,
} from "@/lib/storage";
import StockEditor, { parseTriggers, type EditorValue } from "@/components/StockEditor";
import RemarksEditor from "@/components/RemarksEditor";
import dynamic from "next/dynamic";
const PortfolioAnalysis = dynamic(() => import("@/components/PortfolioAnalysis"), { ssr: false });
const PortfolioPerformance = dynamic(() => import("@/components/PortfolioPerformance"), { ssr: false });
import { GripVertical } from "lucide-react";

type RemarksEdit = { title: string; subtitle?: string; value: string; onSave: (t: string) => void };
import { parseWorkbook, resolveHolding } from "@/lib/excelImport";

const CUR: Record<PortfolioMarket, string> = {
  "US Stocks": "$",
  "Indian Stocks": "₹",
};

// Manual trend tag per holding in the Trade Plan.
const PF_TREND = [
  { v: "", label: "— trend", cls: "text-slate-400 border-slate-200 bg-white" },
  { v: "up", label: "↑ Uptrend", cls: "text-emerald-700 border-emerald-300 bg-emerald-50" },
  { v: "down", label: "↓ Downtrend", cls: "text-rose-700 border-rose-300 bg-rose-50" },
  { v: "side", label: "→ Sideways", cls: "text-amber-700 border-amber-300 bg-amber-50" },
];
// Sharp row highlight by the user's Trend tag (like Markets).
const PF_TREND_ROW: Record<string, string> = {
  up: "bg-emerald-200",
  down: "bg-rose-200",
  side: "bg-amber-200",
};
// Portfolio health-check letter grade → badge colour.
const GRADE_CLS: Record<string, string> = {
  A: "text-emerald-700 bg-emerald-50 border-emerald-400",
  B: "text-sky-700 bg-sky-50 border-sky-400",
  C: "text-amber-700 bg-amber-50 border-amber-400",
  D: "text-rose-700 bg-rose-50 border-rose-400",
};
// What the user plans to do with the position.
const PF_STANCE = [
  { v: "", label: "— action", cls: "text-slate-400 border-slate-200 bg-white" },
  { v: "add", label: "➕ Add", cls: "text-emerald-700 border-emerald-300 bg-emerald-50" },
  { v: "reduce", label: "➖ Reduce", cls: "text-rose-700 border-rose-300 bg-rose-50" },
  { v: "none", label: "No action", cls: "text-slate-600 border-slate-200 bg-slate-50" },
];

// ---- Earnings Tracker option sets ----
const EARN_FY = ["FY 2027-28", "FY 2026-27", "FY 2025-26", "FY 2024-25", "FY 2023-24", "FY 2022-23"];
const EARN_Q = ["Q1", "Q2", "Q3", "Q4"];
const EARN_QUALITY = [
  { v: "", label: "—", cls: "text-slate-400 bg-white border-slate-200" },
  { v: "Strong", label: "Strong", cls: "text-emerald-700 bg-emerald-50 border-emerald-300" },
  { v: "Good", label: "Good", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { v: "Neutral", label: "Neutral", cls: "text-amber-700 bg-amber-50 border-amber-300" },
  { v: "Weak", label: "Weak", cls: "text-orange-700 bg-orange-50 border-orange-300" },
  { v: "Poor", label: "Poor", cls: "text-rose-700 bg-rose-100 border-rose-300" },
];
const EARN_CONVICTION = [
  { v: "", label: "—", cls: "text-slate-400 bg-white border-slate-200" },
  { v: "High", label: "High", cls: "text-emerald-700 bg-emerald-50 border-emerald-300" },
  { v: "Medium", label: "Medium", cls: "text-amber-700 bg-amber-50 border-amber-300" },
  { v: "Low", label: "Low", cls: "text-rose-700 bg-rose-50 border-rose-300" },
];
const EARN_OUTLOOK = [
  { v: "", label: "—", dot: "bg-slate-300", text: "text-slate-400" },
  { v: "Positive", label: "Positive", dot: "bg-emerald-500", text: "text-emerald-600" },
  { v: "Neutral", label: "Neutral", dot: "bg-amber-500", text: "text-amber-600" },
  { v: "Negative", label: "Negative", dot: "bg-rose-500", text: "text-rose-600" },
];
const GOOD_Q = ["Strong", "Good"];
const BAD_Q = ["Weak", "Poor"];
const EARN_SECTORS = ["IT/Internet", "Financials", "Consumer", "Manufacturing", "Pharma/Healthcare", "Auto", "Energy", "FMCG", "Metals", "Realty", "Infra", "Telecom", "Chemicals", "Others"];

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [market, setMarket] = useState<PortfolioMarket>("US Stocks");
  // Holdings vs the user's own trade plan (SL / R / targets / notes).
  const [view, setView] = useState<"holdings" | "plan" | "earnings" | "analysis">("holdings");
  // Earnings Tracker state
  const [earnFY, setEarnFY] = useState("FY 2025-26");
  const [earnQ, setEarnQ] = useState("Q1");
  const [earnSector, setEarnSector] = useState("All");
  const [earnStatus, setEarnStatus] = useState("all"); // all | analyzed | pending | redflag
  const [customSectors, setCustomSectors] = useState<string[]>([]);
  const [customSectorFor, setCustomSectorFor] = useState<string | null>(null); // holding id typing a new sector
  useEffect(() => { setCustomSectors(getEarnSectors()); }, []);
  const allSectors = useMemo(() => Array.from(new Set([...EARN_SECTORS, ...customSectors])), [customSectors]);
  const addCustomSector = (h: any, val: string) => {
    const v = val.trim();
    if (v) { addEarnSector(v); setCustomSectors(getEarnSectors()); setEarn(h, { sector: v }); }
    setCustomSectorFor(null);
  };
  const qKey = `${earnFY}|${earnQ}`;
  const getEarn = (h: any) => (h.earnings && h.earnings[qKey]) || {};
  const setEarn = (h: any, patch: any) => {
    const cur = getEarn(h);
    savePortfolioHolding({ ...h, earnings: { ...(h.earnings || {}), [qKey]: { ...cur, ...patch } }, updatedAt: Date.now() });
    setHoldings(getPortfolio());
  };
  const [search, setSearch] = useState("");
  const [trendFilter, setTrendFilter] = useState("all"); // all | up | down | side
  const [recentSort, setRecentSort] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => {
    setOrder(getPortfolioOrder());
    // Deep-link: /portfolio?view=earnings opens the Earnings Tracker directly.
    if (typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("view");
      if (v === "earnings" || v === "plan" || v === "analysis") setView(v);
    }
  }, []);
  const reorderHolding = (from: string, to: string) => {
    if (!from || from === to) return;
    const seq = visibleHoldings.map((h) => h.id);
    const fi = seq.indexOf(from); if (fi === -1) return;
    seq.splice(fi, 1);
    const ti = seq.indexOf(to);
    seq.splice(ti === -1 ? seq.length : ti, 0, from);
    // Merge this market's new sequence into the global id order.
    const others = order.filter((id) => !seq.includes(id));
    const next = [...seq, ...others];
    setPortfolioOrder(next); setOrder(next);
  };
  const [savedMsg, setSavedMsg] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ symbol: "", shares: "", price: "" });
  const [refreshing, setRefreshing] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [review, setReview] = useState<any | null>(null);
  // Per-holding factual chart read (trend / RSI / DMA position). NOT advice.
  const [reads, setReads] = useState<Record<string, any>>({});
  const [readsLoading, setReadsLoading] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState<any[]>([]);

  // Excel import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importPending, setImportPending] = useState<
    { holdings: any[]; fileName: string; skipped: number; indianCount: number; usCount: number } | null
  >(null);

  useEffect(() => {
    setHoldings(getPortfolio());
    setPriceAlerts(getPriceAlerts());
  }, []);

  // Read the chart for each holding — a factual technical snapshot (trend,
  // RSI value + zone, price vs 50/200-DMA) so YOU can judge. Not buy/sell advice.
  const runReads = async () => {
    const current = getPortfolio().filter((h) => h.market === market);
    if (!current.length) return;
    setReadsLoading(true);
    try {
      const subset = current.slice(0, 15);
      await Promise.all(
        subset.map(async (h) => {
          try {
            const res = await fetch("/api/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: h.symbol,
                market: market === "Indian Stocks" ? "IN" : "US",
                skipAi: true,
              }),
            });
            const j = await res.json();
            const t = j?.technical;
            const price = j?.stock?.currentPrice;
            if (t) {
              setReads((prev) => ({
                ...prev,
                [h.symbol]: {
                  trend: t.trend,
                  rsi: Number(t.rsi),
                  dma50: Number(t.dma50),
                  dma200: Number(t.dma200),
                  score: t.score,
                  summary: t.summary,
                  price,
                  changePct: j?.pricePerformance?.oneDay,
                },
              }));
            }
            // Refresh the live price into the holding so values stay current too.
            if (price != null) savePortfolioHolding({ ...h, currentPrice: price });
          } catch {
            /* skip this symbol */
          }
        }),
      );
      setHoldings(getPortfolio());
    } finally {
      setReadsLoading(false);
    }
  };

  // Factual, neutral zone label from RSI — describes the reading, never advises.
  const rsiZone = (rsi: number) =>
    !Number.isFinite(rsi) ? { label: "—", tone: "text-slate-400" }
    : rsi >= 70 ? { label: "Overbought", tone: "text-rose-600" }
    : rsi <= 30 ? { label: "Oversold", tone: "text-emerald-600" }
    : { label: "Neutral", tone: "text-slate-500" };

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
      // A holding needs a quantity plus SOMETHING to price it — an explicit
      // buy/avg price, or a total value we can divide by qty. This recovers
      // broker exports (ICICI, etc.) whose price column is named unusually but
      // that still carry a value/amount column.
      const usable = rows.filter(
        (r) => r.qty != null && r.qty !== 0 && (r.price != null || r.marketValue != null),
      );
      const skipped = rows.length - usable.length;
      if (usable.length === 0) {
        setImportError(
          "No usable rows found. Each holding needs a Stock/Symbol column, a Qty column, and a Price or Value column.",
        );
        setImporting(false);
        return;
      }
      // Auto-detect each row's market from its symbol, so Indian (.NS/.BO) and
      // US stocks sort into their own tabs and never mix — regardless of which
      // tab is active.
      const holdings = await Promise.all(
        usable.map(async (r) => {
          // Pass the active tab as a hint: explicit .NS/US symbols still
          // auto-sort, but ambiguous names or transient search failures stay in
          // the tab the user is importing into instead of defaulting to US.
          const { symbol, market: detected } = await resolveHolding(r, market);
          // Derive a per-share price from total value when the sheet had no
          // explicit price column.
          const price =
            r.price != null
              ? r.price
              : r.marketValue != null && r.qty
                ? r.marketValue / r.qty
                : 0;
          return {
            symbol: (symbol || r.symbol || r.stockName).toUpperCase(),
            name: r.stockName,
            market: detected,
            shares: r.qty as number,
            buyPrice: price,
            currentPrice: price,
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
  const visibleHoldings = marketHoldings.filter((h) => {
    if (trendFilter !== "all" && (h.trend || "") !== trendFilter) return false;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      if (!(String(h.symbol || "").toLowerCase().includes(s) || String(h.name || "").toLowerCase().includes(s))) return false;
    }
    return true;
  }).sort((a, b) => {
    if (recentSort) return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
  });

  // Save one trade-plan field (SL / R / T1 / T2 / remarks / special) on a holding.
  // These are the user's own manual entries; only the live price is auto-fetched.
  const setPlanField = (h: any, field: string, value: string) => {
    const updated = { ...h, [field]: value };
    savePortfolioHolding(updated);
    // The structured trigger (CMP [op] [value]) becomes a REAL monitored alert
    // so the app knows exactly when to fire a notification + email.
    if (field === "condOp" || field === "condVal" || field === "special") {
      const id = `pf-${updated.id}`;
      const v = Number(updated.condVal);
      const op = updated.condOp || ">";
      const existing = getPriceAlerts().find((a) => a.id === id);
      if (updated.condVal != null && String(updated.condVal) !== "" && Number.isFinite(v)) {
        const note = String(updated.special || "").trim();
        savePriceAlert({
          id, symbol: String(updated.symbol).toUpperCase(),
          name: note ? `CMP ${op} ${v} → ${note}` : `CMP ${op} ${v}`,
          fromPortfolio: true, status: "active", conditionTriggered: false,
          condition: { metric: "price", op: op as any, value: v },
        });
      } else if (existing) {
        deletePriceAlert(id);
      }
    }
    setHoldings(getPortfolio());
  };

  // Editor (popup) plumbing for a holding: levels + multiple triggers + save.
  const [editHolding, setEditHolding] = useState<any | null>(null);
  const [remarksEdit, setRemarksEdit] = useState<RemarksEdit | null>(null);
  const pfBuildValue = (h: any): EditorValue => {
    let triggers = parseTriggers(h.triggers);
    if (!triggers.length && h.condVal != null && String(h.condVal) !== "") {
      triggers = [{ id: "legacy", op: h.condOp || ">", val: String(h.condVal), action: h.special || "Buy" }];
    }
    return { sl: h.sl, r: h.r, t1: h.t1, t2: h.t2, remarks: h.remarks, triggers, updatedAt: h.updatedAt ? Number(h.updatedAt) : undefined };
  };
  const pfSave = (h: any, v: EditorValue) => {
    savePortfolioHolding({ ...h, sl: v.sl || "", r: v.r || "", t1: v.t1 || "", t2: v.t2 || "", remarks: v.remarks || "", triggers: v.triggers || [], updatedAt: v.updatedAt || Date.now(), condVal: "", condOp: "", special: "" });
    deletePriceAlert(`pf-${h.id}`);
    syncStockTriggers(`pf-${h.id}`, h.symbol, v.triggers || []);
    setHoldings(getPortfolio());
  };
  const pfTrigCount = (h: any) => {
    const n = parseTriggers(h.triggers).filter((t) => t.val !== "" && t.val != null).length;
    return n || (h.condVal != null && String(h.condVal) !== "" ? 1 : 0);
  };

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

  // AI Portfolio Review — a candid HEALTH CHECK across EVERY holding (all local,
  // no per-stock API, so it's instant and covers the whole portfolio). Surfaces
  // concrete mistakes/weaknesses + research-framed actions (no buy/sell advice).
  const runReview = async () => {
    const current = getPortfolio().filter((h) => h.market === market);
    if (current.length === 0) return;
    setReviewLoading(true);
    setReview(null);
    try {
      const cur = CUR[market];
      const priced = current.map((h) => {
        const px = h.currentPrice || h.buyPrice;
        const value = h.shares * px;
        const cost = h.shares * h.buyPrice;
        const pl = value - cost;
        const plPct = cost > 0 ? (pl / cost) * 100 : 0;
        return { symbol: h.symbol, value, cost, pl, plPct };
      });
      const totalVal = priced.reduce((s, r) => s + r.value, 0) || 1;
      const totalCost = priced.reduce((s, r) => s + r.cost, 0) || 1;
      const totalPl = totalVal - totalCost;
      const winners = priced.filter((r) => r.pl > 0);
      const losers = priced.filter((r) => r.pl < 0);
      const byWeight = [...priced].sort((a, b) => b.value - a.value);
      const topPositions = byWeight.slice(0, 6).map((r) => ({ symbol: r.symbol, pct: Math.round((r.value / totalVal) * 100), plPct: Math.round(r.plPct * 10) / 10 }));
      const top1 = byWeight[0] ? { symbol: byWeight[0].symbol, pct: Math.round((byWeight[0].value / totalVal) * 100) } : null;
      const concentrationTop5 = Math.round((byWeight.slice(0, 5).reduce((s, r) => s + r.value, 0) / totalVal) * 100);
      const byDollar = [...priced].sort((a, b) => b.pl - a.pl);
      const topWinners = byDollar.slice(0, 3).map((r) => ({ symbol: r.symbol, pl: Math.round(r.pl), plPct: Math.round(r.plPct * 10) / 10 }));
      const topLosers = byDollar.slice(-3).reverse().map((r) => ({ symbol: r.symbol, pl: Math.round(r.pl), plPct: Math.round(r.plPct * 10) / 10 }));
      // Mistake-detection metrics.
      const avgWinPct = winners.length ? Math.round((winners.reduce((s, r) => s + r.plPct, 0) / winners.length) * 10) / 10 : 0;
      const avgLossPct = losers.length ? Math.round((losers.reduce((s, r) => s + r.plPct, 0) / losers.length) * 10) / 10 : 0;
      // Large positions (≥5% weight) sitting on a deep loss (≤ -15%).
      const bigLosers = byWeight.filter((r) => r.value / totalVal >= 0.05 && r.plPct <= -15)
        .map((r) => ({ symbol: r.symbol, pct: Math.round((r.value / totalVal) * 100), plPct: Math.round(r.plPct * 10) / 10 }));
      const deepDrawdowns = [...priced].sort((a, b) => a.plPct - b.plPct).slice(0, 3).map((r) => ({ symbol: r.symbol, plPct: Math.round(r.plPct * 10) / 10 }));
      const dustCount = priced.filter((r) => r.value / totalVal < 0.005).length; // <0.5% weight = fragments
      const lossDrag = Math.round((Math.abs(losers.reduce((s, r) => s + r.pl, 0)) / totalVal) * 1000) / 10;

      const stats = {
        market,
        currency: cur,
        totalHoldings: current.length,
        value: Math.round(totalVal),
        invested: Math.round(totalCost),
        pl: Math.round(totalPl),
        plPct: Math.round((totalPl / totalCost) * 1000) / 10,
        inProfit: winners.length,
        inLoss: losers.length,
        top1,
        concentrationTop5,
        topPositions,
        topWinners,
        topLosers,
        avgWinPct,
        avgLossPct,
        bigLosersLargeAndDown: bigLosers,
        deepDrawdowns,
        dustPositions: dustCount,
        lossDragPctOfValue: lossDrag,
      };

      const positions = priced.map((r) => ({ symbol: r.symbol, value: Math.round(r.value), weight: r.value / totalVal, plPct: Math.round(r.plPct * 10) / 10 }));

      let ai: any = null;
      let computed: any = null;
      try {
        const res = await fetch("/api/portfolio-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ market, currency: cur, stats, positions }),
        });
        const j = await res.json();
        if (j.error && !j.computed) { ai = { error: j.error }; }
        else { ai = j.ai; computed = j.computed; if (j.ai && !j.ai.error) logAiUsageDetailed("Portfolio Review", { tokens: j.ai.aiTokens }); }
      } catch {
        ai = { error: "AI is busy right now. Please try again in a few seconds." };
      }
      setReview({ ...stats, ai, computed });
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
    <div className="max-w-full mx-auto px-4 py-8">
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
            onClick={runReads}
            disabled={readsLoading || marketHoldings.length === 0}
            className="px-3.5 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 flex items-center gap-2 transition disabled:opacity-50 whitespace-nowrap"
            title="Factual technical read per holding — trend, RSI, moving averages. Not buy/sell advice."
          >
            {readsLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            Chart Read
          </button>
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

      {/* Performance — live P&L (India/US) + trend from daily snapshots */}
      <PortfolioPerformance />

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
          {/* P/L snapshot strip — across ALL holdings */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${review.pl >= 0 ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-700 bg-rose-50 border-rose-200"}`}>
              {review.plPct >= 0 ? "+" : ""}{review.plPct}% · {review.currency}{Math.abs(review.pl).toLocaleString()}
            </span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold border text-emerald-700 bg-emerald-50 border-emerald-200">{review.inProfit} in profit</span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold border text-rose-700 bg-rose-50 border-rose-200">{review.inLoss} in loss</span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold border text-slate-600 bg-slate-50 border-slate-200">Top 5 = {review.concentrationTop5}% of value</span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold border text-slate-500 bg-white border-slate-200">{review.totalHoldings} holdings</span>
          </div>
          {review.ai && !review.ai.error ? (
            <div className="mb-5">
              {/* Grade + verdict + summary */}
              <div className="flex items-start gap-3 mb-4">
                {review.ai.grade && (
                  <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black border-2 ${GRADE_CLS[review.ai.grade] || GRADE_CLS.C}`}>{review.ai.grade}</div>
                )}
                <div>
                  {review.ai.gradeLabel && <div className="text-base font-black text-slate-900">{review.ai.gradeLabel}</div>}
                  {review.ai.summary && <p className="text-[14px] text-slate-700 font-medium leading-relaxed mt-1">{review.ai.summary}</p>}
                </div>
              </div>

              {/* Key portfolio metrics — live fundamentals */}
              {review.computed && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-4">
                  <Metric label="Portfolio Beta" value={review.computed.beta ?? "—"} sub={review.ai.reads?.beta} />
                  <Metric label="Trailing PE" value={review.computed.trailingPE ?? "—"} sub={review.ai.reads?.valuation} />
                  <Metric label="Forward PE" value={review.computed.forwardPE ?? "—"} />
                  <Metric label="Rel. Strength 1Y" value={review.computed.relStrength == null ? "—" : `${review.computed.relStrength > 0 ? "+" : ""}${review.computed.relStrength}%`} sub={review.computed.benchRelStrength == null ? "" : `Benchmark ${review.computed.benchRelStrength > 0 ? "+" : ""}${review.computed.benchRelStrength}%`} tone={review.computed.relStrength != null && review.computed.benchRelStrength != null ? (review.computed.relStrength >= review.computed.benchRelStrength ? "bull" : "bear") : ""} />
                  <Metric label="Holdings" value={String(review.computed.numHoldings)} sub={`${review.computed.unprofitable} unprofitable`} tone={review.computed.unprofitable > review.computed.profitable ? "bear" : ""} />
                </div>
              )}

              {/* Sector & market-cap allocation */}
              {review.computed && (
                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div className="rounded-xl border border-slate-200 p-3.5">
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">Sector allocation</div>
                    {(review.computed.sectorAlloc || []).slice(0, 6).map((s: any) => (
                      <AllocBar key={s.sector} label={s.sector} pct={s.pct} color="bg-indigo-500" />
                    ))}
                    {(review.computed.sectorAlloc || []).length === 0 && <div className="text-[12px] text-slate-400">Sector data unavailable</div>}
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3.5">
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2">Market-cap allocation</div>
                    <AllocBar label="Large cap" pct={review.computed.capAlloc.large} color="bg-emerald-500" />
                    <AllocBar label="Mid cap" pct={review.computed.capAlloc.mid} color="bg-sky-500" />
                    <AllocBar label="Small cap" pct={review.computed.capAlloc.small} color="bg-amber-500" />
                    <AllocBar label="Micro cap" pct={review.computed.capAlloc.micro} color="bg-rose-500" />
                    {review.computed.capAlloc.unknown > 0 && <AllocBar label="Unknown" pct={review.computed.capAlloc.unknown} color="bg-slate-300" />}
                  </div>
                </div>
              )}

              {/* Remaining metric reads */}
              {review.ai.reads && (
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 mb-4 text-[13px] text-slate-600">
                  {review.ai.reads.capMix && <div><span className="font-bold text-slate-700">Cap mix:</span> {review.ai.reads.capMix}</div>}
                  {review.ai.reads.relStrength && <div><span className="font-bold text-slate-700">Rel. strength:</span> {review.ai.reads.relStrength}</div>}
                  {review.ai.reads.holdingsCount && <div><span className="font-bold text-slate-700">Holdings:</span> {review.ai.reads.holdingsCount}</div>}
                  {review.ai.reads.earnings && <div><span className="font-bold text-slate-700">Earnings:</span> {review.ai.reads.earnings}</div>}
                </div>
              )}

              {/* Issues spotted */}
              {Array.isArray(review.ai.issues) && review.ai.issues.length > 0 && (
                <div className="mb-4">
                  <div className="text-[11px] font-black uppercase tracking-wide text-rose-600 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5" /> Issues spotted</div>
                  <div className="space-y-2">
                    {review.ai.issues.map((it: any, i: number) => {
                      const sev = it.severity === "high" ? "border-rose-300 bg-rose-50" : it.severity === "medium" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50";
                      const dot = it.severity === "high" ? "bg-rose-500" : it.severity === "medium" ? "bg-amber-500" : "bg-slate-400";
                      return (
                        <div key={i} className={`rounded-xl border px-3.5 py-2.5 ${sev}`}>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                            <span className="font-black text-slate-800 text-[14px]">{it.title}</span>
                          </div>
                          {it.detail && <p className="text-[13.5px] text-slate-600 mt-1 pl-4 leading-relaxed">{it.detail}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Leading vs lagging areas */}
              {(Array.isArray(review.ai.leadingSectors) && review.ai.leadingSectors.length > 0) || (Array.isArray(review.ai.laggingSectors) && review.ai.laggingSectors.length > 0) ? (
                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                  {Array.isArray(review.ai.leadingSectors) && review.ai.leadingSectors.length > 0 && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                      <div className="text-[11px] font-black uppercase tracking-wide text-emerald-700 mb-1.5">Leading / doing well</div>
                      <div className="flex flex-wrap gap-1.5">{review.ai.leadingSectors.map((s: string, i: number) => <span key={i} className="px-2.5 py-1 rounded-full text-[12.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">{s}</span>)}</div>
                    </div>
                  )}
                  {Array.isArray(review.ai.laggingSectors) && review.ai.laggingSectors.length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
                      <div className="text-[11px] font-black uppercase tracking-wide text-rose-700 mb-1.5">Lagging / dragging</div>
                      <div className="flex flex-wrap gap-1.5">{review.ai.laggingSectors.map((s: string, i: number) => <span key={i} className="px-2.5 py-1 rounded-full text-[12.5px] font-bold bg-rose-100 text-rose-800 border border-rose-300">{s}</span>)}</div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Research candidates — add / trim (research-framed, not advice) */}
              {(Array.isArray(review.ai.researchToAdd) && review.ai.researchToAdd.length > 0) || (Array.isArray(review.ai.researchToTrim) && review.ai.researchToTrim.length > 0) ? (
                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                  {Array.isArray(review.ai.researchToAdd) && review.ai.researchToAdd.length > 0 && (
                    <div className="rounded-xl border border-slate-200 p-3.5">
                      <div className="text-[11px] font-black uppercase tracking-wide text-emerald-700 flex items-center gap-1.5 mb-2"><TrendingUp className="w-3.5 h-3.5" /> Worth researching to add</div>
                      <div className="space-y-1.5">
                        {review.ai.researchToAdd.map((r: any, i: number) => (
                          <div key={i} className="text-[13.5px] leading-relaxed"><span className="font-black text-slate-800">{r.symbol}</span> <span className="text-slate-600">— {r.why}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(review.ai.researchToTrim) && review.ai.researchToTrim.length > 0 && (
                    <div className="rounded-xl border border-slate-200 p-3.5">
                      <div className="text-[11px] font-black uppercase tracking-wide text-amber-700 flex items-center gap-1.5 mb-2"><TrendingDown className="w-3.5 h-3.5" /> Worth reviewing to trim / book</div>
                      <div className="space-y-1.5">
                        {review.ai.researchToTrim.map((r: any, i: number) => (
                          <div key={i} className="text-[13.5px] leading-relaxed"><span className="font-black text-slate-800">{r.symbol}</span> <span className="text-slate-600">— {r.why}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Macro headwinds */}
              {Array.isArray(review.ai.macroHeadwinds) && review.ai.macroHeadwinds.length > 0 && (
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 flex items-center gap-1.5 mb-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Macro headwinds to keep in mind</div>
                  <ul className="space-y-1">
                    {review.ai.macroHeadwinds.map((m: string, i: number) => (
                      <li key={i} className="text-[13.5px] text-slate-600 flex items-start gap-2 leading-relaxed"><span className="text-slate-400 mt-0.5">•</span> {m}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* What you can do */}
              {Array.isArray(review.ai.actions) && review.ai.actions.length > 0 && (
                <div className="mb-1">
                  <div className="text-[11px] font-black uppercase tracking-wide text-indigo-600 flex items-center gap-1.5 mb-2"><Sparkles className="w-3.5 h-3.5" /> What you can do</div>
                  <div className="space-y-1.5">
                    {review.ai.actions.map((a: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[13.5px] leading-relaxed">
                        <Check className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                        <span><span className="font-bold text-slate-800">{a.title}:</span> <span className="text-slate-600">{a.detail}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Strengths */}
              {Array.isArray(review.ai.strengths) && review.ai.strengths.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {review.ai.strengths.map((s: string, i: number) => (
                    <span key={i} className="px-3 py-1 rounded-full text-[12.5px] font-bold border border-emerald-300 bg-emerald-50 text-emerald-800">✓ {s}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100 mb-5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              {review.ai?.error || "AI summary is busy right now"} — the computed stats below are still accurate.
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-2">Top Positions by Weight</div>
              {review.topPositions.map((p: any) => (
                <div key={p.symbol} className="flex justify-between items-center text-xs py-0.5">
                  <span className="text-slate-700 font-bold truncate pr-2">{p.symbol}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 tabular-nums">{p.pct}%</span>
                    <span className={`tabular-nums font-semibold ${p.plPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{p.plPct >= 0 ? "+" : ""}{p.plPct}%</span>
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-2">Winners / Laggards</div>
              {review.topWinners.map((w: any) => (
                <div key={w.symbol} className="flex items-center justify-between gap-1.5 text-xs py-0.5">
                  <span className="flex items-center gap-1 text-emerald-600 font-bold"><TrendingUp className="w-3.5 h-3.5" />{w.symbol}</span>
                  <span className="tabular-nums text-emerald-600 font-semibold">+{w.plPct}% · {review.currency}{Math.abs(w.pl).toLocaleString()}</span>
                </div>
              ))}
              {review.topLosers.map((l: any) => (
                <div key={l.symbol} className="flex items-center justify-between gap-1.5 text-xs py-0.5">
                  <span className="flex items-center gap-1 text-rose-600 font-bold"><TrendingDown className="w-3.5 h-3.5" />{l.symbol}</span>
                  <span className="tabular-nums text-rose-600 font-semibold">{l.plPct}% · -{review.currency}{Math.abs(l.pl).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 text-[10px] text-slate-400 italic">Research &amp; risk-education only. Not buy/sell advice. Computed across all {review.totalHoldings} holdings.</p>
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

      {/* View toggle: Holdings ↔ Trade Plan */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex rounded-lg bg-slate-100 p-1">
          {(["holdings", "plan", "earnings", "analysis"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-black transition ${view === v ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {v === "holdings" ? "Holdings" : v === "plan" ? "Trade Plan" : v === "earnings" ? "📊 Earnings Tracker" : "🤖 AI Analysis"}
            </button>
          ))}
        </div>
        {view !== "analysis" && <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search holdings…"
            className="pl-9 pr-3 py-2 w-48 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none" />
        </div>}
        {view !== "analysis" && <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Trend</span>
          <button onClick={() => setTrendFilter("all")} className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${trendFilter === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>All</button>
          {PF_TREND.filter((t) => t.v).map((t) => (
            <button key={t.v} onClick={() => setTrendFilter(trendFilter === t.v ? "all" : t.v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${trendFilter === t.v ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
              {t.label}
            </button>
          ))}
          <button onClick={() => setRecentSort((v) => !v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border ml-1 ${recentSort ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>🕐 Recently changed</button>
        </div>}
        {view === "plan" && (
          <>
            <button
              onClick={() => { setHoldings(getPortfolio()); setSavedMsg(true); setTimeout(() => setSavedMsg(false), 1800); }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2">
              {savedMsg ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save plan</>}
            </button>
            <span className="text-[11px] text-slate-400 font-medium">SL / R / T1 / T2, trend &amp; notes auto-save as you type — only the live price auto-fetches.</span>
          </>
        )}
      </div>

      {/* Holdings / Trade-plan table */}
      {view === "analysis" ? (
        <PortfolioAnalysis market={market} />
      ) : marketHoldings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-500 font-medium">
          No {market} holdings yet. Click &quot;Add Holding&quot; to start tracking.
        </div>
      ) : view === "earnings" ? (
        (() => {
          const sectors = Array.from(new Set(marketHoldings.map((h) => getEarn(h).sector).filter(Boolean)));
          const rows = marketHoldings.filter((h) => {
            const e = getEarn(h);
            if (earnSector !== "All" && (e.sector || "") !== earnSector) return false;
            if (earnStatus === "analyzed" && e.analyzed !== "yes") return false;
            if (earnStatus === "pending" && e.analyzed === "yes") return false;
            if (earnStatus === "redflag" && !e.redFlag) return false;
            if (search.trim()) {
              const s = search.trim().toLowerCase();
              if (!(String(h.symbol || "").toLowerCase().includes(s) || String(h.name || "").toLowerCase().includes(s))) return false;
            }
            return true;
          });
          const all = marketHoldings.map(getEarn);
          const analyzed = all.filter((e) => e.analyzed === "yes").length;
          const strong = all.filter((e) => GOOD_Q.includes(e.quality)).length;
          const neutral = all.filter((e) => e.quality === "Neutral").length;
          const weak = all.filter((e) => BAD_Q.includes(e.quality)).length;
          const reds = all.filter((e) => e.redFlag).length;
          const pending = marketHoldings.length - analyzed;
          const TILES = [
            { big: `${analyzed} / ${marketHoldings.length}`, lbl: "ANALYZED THIS QUARTER", tone: "text-slate-900", bar: true },
            { big: strong, lbl: "STRONG / GOOD", tone: "text-emerald-600" },
            { big: neutral, lbl: "NEUTRAL", tone: "text-amber-600" },
            { big: weak, lbl: "WEAK / POOR", tone: "text-rose-600" },
            { big: reds, lbl: "RED FLAGS", tone: "text-orange-600" },
            { big: pending, lbl: "NOT YET ANALYZED", tone: "text-slate-500" },
          ];
          return (
            <div className="max-w-[1500px] mx-auto">
              {/* Filters */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
                <select value={earnFY} onChange={(e) => setEarnFY(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200">
                  {EARN_FY.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={earnQ} onChange={(e) => setEarnQ(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200">
                  {EARN_Q.map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
                <select value={earnSector} onChange={(e) => setEarnSector(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200">
                  <option value="All">All Sectors</option>
                  {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="ml-auto flex items-center gap-1.5">
                  {[["all", `All (${marketHoldings.length})`], ["analyzed", `Analyzed (${analyzed})`], ["pending", `Pending (${pending})`], ["redflag", `🚩 Red flags (${reds})`]].map(([v, lbl]) => (
                    <button key={v} onClick={() => setEarnStatus(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${earnStatus === v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{lbl}</button>
                  ))}
                </div>
              </div>

              {/* Stat tiles */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                {TILES.map((t) => (
                  <div key={t.lbl} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    <div className={`text-2xl font-black ${t.tone}`}>{t.big}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{t.lbl}</div>
                    {t.bar && <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${marketHoldings.length ? (analyzed / marketHoldings.length) * 100 : 0}%` }} /></div>}
                  </div>
                ))}
              </div>

              {/* Earnings table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 [&_th]:p-3 [&_th]:text-xs [&_th]:font-bold [&_th]:text-slate-500 [&_th]:uppercase [&_th]:tracking-wide">
                      <th>Stock</th><th>Sector</th><th>Result Date</th><th className="text-center">Analyzed?</th>
                      <th>Quality</th><th className="text-right">Valuation (P/E vs sector)</th>
                      <th>Conviction</th><th>Outlook</th><th>Remarks</th><th className="text-center">🚩</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((h) => {
                      const e = getEarn(h);
                      const qcls = EARN_QUALITY.find((x) => x.v === (e.quality || "")) || EARN_QUALITY[0];
                      const ccls = EARN_CONVICTION.find((x) => x.v === (e.conviction || "")) || EARN_CONVICTION[0];
                      const ocls = EARN_OUTLOOK.find((x) => x.v === (e.outlook || "")) || EARN_OUTLOOK[0];
                      return (
                        <tr key={h.id} className={`border-b-2 border-slate-300 align-top ${e.redFlag ? "bg-rose-50/60" : "hover:bg-slate-50"}`}>
                          <td className="p-3">
                            <div className="font-black text-slate-900 whitespace-nowrap">{h.name || h.symbol}</div>
                            <div className="text-[11px] text-slate-400">{h.symbol}</div>
                          </td>
                          <td className="p-3">
                            {customSectorFor === h.id ? (
                              <input autoFocus placeholder="new sector…"
                                onKeyDown={(ev) => { if (ev.key === "Enter") addCustomSector(h, (ev.target as HTMLInputElement).value); if (ev.key === "Escape") setCustomSectorFor(null); }}
                                onBlur={(ev) => addCustomSector(h, ev.target.value)}
                                className="w-28 px-2 py-1 bg-white border border-indigo-300 rounded text-[12px] outline-none focus:ring-2 focus:ring-indigo-200" />
                            ) : (
                              <select value={allSectors.includes(e.sector) ? e.sector : (e.sector ? "__has__" : "")}
                                onChange={(ev) => { if (ev.target.value === "__custom__") setCustomSectorFor(h.id); else setEarn(h, { sector: ev.target.value }); }}
                                className="w-32 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[12px] font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer">
                                <option value="">— sector</option>
                                {e.sector && !allSectors.includes(e.sector) && <option value="__has__">{e.sector}</option>}
                                {allSectors.map((s) => <option key={s} value={s}>{s}</option>)}
                                <option value="__custom__">➕ Add custom…</option>
                              </select>
                            )}
                          </td>
                          <td className="p-3">
                            <input type="date" value={e.resultDate || ""} onChange={(ev) => setEarn(h, { resultDate: ev.target.value })}
                              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[12px] outline-none focus:ring-2 focus:ring-indigo-200" />
                          </td>
                          <td className="p-3 text-center">
                            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                              {[["yes", "Yes"], ["no", "No"], ["pend", "Pend"]].map(([v, lbl]) => (
                                <button key={v} onClick={() => setEarn(h, { analyzed: v })}
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${(e.analyzed || "pend") === v ? (v === "yes" ? "bg-emerald-600 text-white" : v === "no" ? "bg-rose-500 text-white" : "bg-white text-slate-600 shadow-sm") : "text-slate-400"}`}>{lbl}</button>
                              ))}
                            </div>
                          </td>
                          <td className="p-3">
                            <select value={e.quality || ""} onChange={(ev) => setEarn(h, { quality: ev.target.value })}
                              className={`text-[11px] font-bold rounded-lg border px-2 py-1 outline-none cursor-pointer ${qcls.cls}`}>
                              {EARN_QUALITY.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                            </select>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <input value={e.pe || ""} onChange={(ev) => setEarn(h, { pe: ev.target.value })} placeholder="P/E"
                              className="w-14 px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-right text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-indigo-200" />
                            <span className="text-[11px] text-slate-400"> vs </span>
                            <input value={e.sectorPe || ""} onChange={(ev) => setEarn(h, { sectorPe: ev.target.value })} placeholder="sec"
                              className="w-14 px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-right text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-indigo-200" />
                          </td>
                          <td className="p-3">
                            <select value={e.conviction || ""} onChange={(ev) => setEarn(h, { conviction: ev.target.value })}
                              className={`text-[11px] font-bold rounded-lg border px-2 py-1 outline-none cursor-pointer ${ccls.cls}`}>
                              {EARN_CONVICTION.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                            </select>
                          </td>
                          <td className="p-3">
                            <select value={e.outlook || ""} onChange={(ev) => setEarn(h, { outlook: ev.target.value })}
                              className={`text-[11px] font-bold bg-white rounded-lg border border-slate-200 px-2 py-1 outline-none cursor-pointer ${ocls.text}`}>
                              {EARN_OUTLOOK.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                            </select>
                          </td>
                          <td className="p-3">
                            <button onClick={() => setRemarksEdit({ title: h.symbol, subtitle: `${earnFY} · ${earnQ}`, value: e.remarks || "", onSave: (t) => setEarn(h, { remarks: t }) })} title="Add / edit note (voice)"
                              className="text-left w-full min-w-[12rem] px-2 py-1.5 rounded-lg text-[12px] text-slate-600 bg-slate-50 border border-slate-200 hover:bg-indigo-50 line-clamp-2">
                              {e.remarks || <span className="text-slate-400">📝 add note…</span>}
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            <button onClick={() => setEarn(h, { redFlag: !e.redFlag })} title="Toggle red flag" className="text-lg">
                              {e.redFlag ? "🚩" : <span className="opacity-25">🏳️</span>}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] text-slate-400 italic">Earnings notes save per stock, per quarter (FY + Q). Research support only — not buy/sell advice.</p>
            </div>
          );
        })()
      ) : view === "plan" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Stock</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">CMP</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Market Value</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-center">Trend</th>
                <th className="p-3 text-xs font-bold text-rose-500 uppercase tracking-wide text-right">SL</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">R</th>
                <th className="p-3 text-xs font-bold text-emerald-600 uppercase tracking-wide text-right">T1</th>
                <th className="p-3 text-xs font-bold text-indigo-600 uppercase tracking-wide text-center">Action</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Remarks</th>
                <th className="p-3 text-xs font-bold text-indigo-600 uppercase tracking-wide">Alert Trigger</th>
              </tr>
            </thead>
            <tbody>
              {visibleHoldings.map((h) => {
                const ltp = h.currentPrice || h.buyPrice;
                const money = (n: number) => `${cur}${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
                const numCls = "w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-right text-[13px] tabular-nums focus:ring-2 focus:ring-indigo-200 outline-none";
                const txtCls = "w-full min-w-[9rem] px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[13px] focus:ring-2 focus:ring-indigo-200 outline-none";
                return (
                  <tr key={h.id}
                    onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                    onDrop={() => { if (dragId) reorderHolding(dragId, h.id); setDragId(null); }}
                    className={`border-b-2 border-slate-500 transition align-top group ${dragId === h.id ? "opacity-40" : ""} ${dragId && dragId !== h.id ? "hover:bg-indigo-50" : (PF_TREND_ROW[h.trend || ""] || "hover:bg-slate-50")}`}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span draggable onDragStart={() => setDragId(h.id)} onDragEnd={() => setDragId(null)}
                          title="Drag to reorder" className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0">
                          <GripVertical className="w-4 h-4" />
                        </span>
                        <div>
                          <div className="font-black text-slate-900 whitespace-nowrap">{h.name || h.symbol}</div>
                          <div className="text-[11px] text-slate-400">{h.symbol} · {h.shares} qty</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums font-bold text-slate-800 whitespace-nowrap">{money(ltp)}</td>
                    <td className="p-3 text-right tabular-nums font-bold text-slate-800 whitespace-nowrap">{money(ltp * h.shares)}</td>
                    <td className="p-3 text-center">
                      {(() => {
                        const t = PF_TREND.find((x) => x.v === (h.trend || "")) || PF_TREND[0];
                        return (
                          <select value={h.trend || ""} onChange={(e) => setPlanField(h, "trend", e.target.value)}
                            className={`text-[11px] font-bold rounded-lg border px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer ${t.cls}`}>
                            {PF_TREND.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                          </select>
                        );
                      })()}
                    </td>
                    {(["sl", "r", "t1"] as const).map((f) => (
                      <td key={f} className="p-3 text-right">
                        <button onClick={() => setEditHolding(h)} title="Edit" className="w-16 px-2 py-1 rounded text-[12px] tabular-nums text-slate-700 hover:bg-indigo-50">
                          {h[f] || "—"}
                        </button>
                      </td>
                    ))}
                    <td className="p-3 text-center">
                      {(() => {
                        const st = PF_STANCE.find((x) => x.v === (h.stance || "")) || PF_STANCE[0];
                        return (
                          <select value={h.stance || ""} onChange={(e) => setPlanField(h, "stance", e.target.value)}
                            className={`text-[11px] font-bold rounded-lg border px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer ${st.cls}`}>
                            {PF_STANCE.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                          </select>
                        );
                      })()}
                    </td>
                    <td className="p-3">
                      <button onClick={() => setRemarksEdit({ title: h.symbol, subtitle: h.name, value: h.remarks || "", onSave: (t) => setPlanField(h, "remarks", t) })} title="Add / edit remark (voice)" className="text-left w-full min-w-[7rem] px-2 py-1 rounded text-[12px] text-slate-600 hover:bg-indigo-50">
                        {h.remarks || <span className="text-slate-300">📝 add note…</span>}
                      </button>
                      {h.updatedAt && (
                        <div className="text-[12px] font-bold text-slate-600 mt-1 whitespace-nowrap">✎ {new Date(Number(h.updatedAt)).toLocaleDateString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <button onClick={() => setEditHolding(h)} title="Edit triggers"
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-indigo-50 text-left">
                        <Pencil className="w-3.5 h-3.5 text-slate-400" />
                        {pfTrigCount(h) > 0
                          ? <span className="text-[11px] font-bold text-emerald-600">🔔 {pfTrigCount(h)} trigger{pfTrigCount(h) === 1 ? "" : "s"}</span>
                          : <span className="text-[11px] font-bold text-slate-400">+ add trigger</span>}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Chart Read</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleHoldings.map((h, idx) => {
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
                      <div className="text-[11px] font-bold text-slate-400 tabular-nums mt-0.5">
                        LTP {money(ltp)}
                      </div>
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
                    <td className="p-3">
                      {(() => {
                        const r = reads[h.symbol];
                        if (!r) {
                          return <span className="text-[11px] text-slate-300 font-bold">Tap “Chart Read”</span>;
                        }
                        const isUp = r.trend?.includes("Up");
                        const isDown = r.trend?.includes("Down");
                        const zone = rsiZone(r.rsi);
                        const aboveBoth = r.price != null && r.dma50 != null && r.dma200 != null && r.price > r.dma50 && r.price > r.dma200;
                        const belowBoth = r.price != null && r.dma50 != null && r.dma200 != null && r.price < r.dma50 && r.price < r.dma200;
                        const alert = priceAlerts.find((a: any) => a.symbol === h.symbol);
                        // nearest set level the price is beyond, purely factual
                        let levelNote = "";
                        if (alert && r.price != null) {
                          const L = alert.levels || {};
                          if (L.target != null && r.price >= L.target) levelNote = "At/above Target";
                          else if (L.r2 != null && r.price >= L.r2) levelNote = "Above R2";
                          else if (L.r1 != null && r.price >= L.r1) levelNote = "Above R1";
                          else if (L.sl != null && r.price <= L.sl) levelNote = "At/below Stop-Loss";
                          else if (L.s1 != null && r.price <= L.s1) levelNote = "At/below Support";
                        }
                        return (
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-md ${
                              isUp ? "bg-emerald-50 text-emerald-700" : isDown ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"
                            }`}>
                              {isUp ? <TrendingUp className="w-3 h-3" /> : isDown ? <TrendingDown className="w-3 h-3" /> : null}
                              {r.trend || "—"}
                            </span>
                            <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                              RSI {Number.isFinite(r.rsi) ? r.rsi.toFixed(0) : "—"} · <span className={zone.tone}>{zone.label}</span>
                            </span>
                            <span className="text-[10.5px] font-bold text-slate-400">
                              {aboveBoth ? "Above 50 & 200 DMA" : belowBoth ? "Below 50 & 200 DMA" : "Mixed vs DMAs"}
                            </span>
                            {levelNote && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                <Bell className="w-2.5 h-2.5" /> {levelNote}
                              </span>
                            )}
                          </div>
                        );
                      })()}
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
                <td colSpan={9} className="p-3">
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

      {editHolding && (
        <StockEditor
          open
          symbol={editHolding.symbol}
          name={editHolding.name}
          price={editHolding.currentPrice}
          currency={editHolding.market === "Indian Stocks" ? "INR" : "USD"}
          value={pfBuildValue(editHolding)}
          hideT2
          onClose={() => setEditHolding(null)}
          onSave={(v) => pfSave(editHolding, v)}
          onDelete={() => { deletePortfolioHolding(editHolding.id); setHoldings(getPortfolio()); }}
        />
      )}

      <RemarksEditor
        open={!!remarksEdit}
        title={remarksEdit?.title || ""}
        subtitle={remarksEdit?.subtitle}
        value={remarksEdit?.value || ""}
        onSave={(t) => remarksEdit?.onSave(t)}
        onClose={() => setRemarksEdit(null)}
      />
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  const vc = tone === "bull" ? "text-emerald-600" : tone === "bear" ? "text-rose-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-xl font-black tabular-nums leading-tight mt-0.5 ${vc}`}>{value}</div>
      {sub && <div className="text-[12px] text-slate-500 font-medium leading-snug mt-1 line-clamp-2">{sub}</div>}
    </div>
  );
}

function AllocBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[13px] text-slate-700 font-semibold w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-[13px] font-black text-slate-800 tabular-nums w-11 text-right">{pct}%</span>
    </div>
  );
}
