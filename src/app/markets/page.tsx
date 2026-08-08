"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Globe, RefreshCw, IndianRupee, Coins, Bitcoin, Plus, Trash2, Star, GripVertical, Search, Pencil } from "lucide-react";
import StockEditor, { parseTriggers, type EditorValue } from "@/components/StockEditor";
import RemarksEditor from "@/components/RemarksEditor";

type RemarksEdit = { title: string; subtitle?: string; value: string; onSave: (t: string) => void };
import {
  getCustomMarketSymbols,
  addCustomMarketSymbol,
  getCustomMarketByGroup,
  getCustomMarketForGroup,
  addCustomMarketToGroup,
  removeCustomMarketFromGroup,
  removeCustomMarketSymbol,
  getMarketMarks,
  setMarketMark,
  getMarketPlans,
  setMarketPlanField,
  getMarketOrder,
  setMarketOrderForTab,
  getMarketHidden,
  hideMarketSymbol,
  restoreMarketTab,
  syncStockTriggers,
  getPriceAlerts,
  savePriceAlert,
  deletePriceAlert,
  getCombinations,
  type Combination,
} from "@/lib/storage";
import { resolveHolding, resolveCommodity, resolveCrypto } from "@/lib/excelImport";

// Manual trend tag the user can set per row (their own read, not the AI trend).
const TREND_OPTS = [
  { v: "", label: "Mark…", cls: "text-slate-400 border-slate-200 bg-white" },
  { v: "up", label: "↑ Uptrend", cls: "text-emerald-700 border-emerald-300 bg-emerald-50" },
  { v: "down", label: "↓ Downtrend", cls: "text-rose-700 border-rose-300 bg-rose-50" },
  { v: "side", label: "→ Sideways", cls: "text-amber-700 border-amber-300 bg-amber-50" },
];
// Sharp row highlight when the user tags a trend (My Trend) — a touch stronger
// than the Watchlist tint so it stands out on the dense Markets table.
const TREND_ROW: Record<string, string> = {
  up: "bg-emerald-200",
  down: "bg-rose-200",
  side: "bg-amber-200",
};
function TrendSelect({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const cur = TREND_OPTS.find((o) => o.v === (value || "")) || TREND_OPTS[0];
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}
      className={`text-[11px] font-bold rounded-lg border px-2 py-1 outline-none cursor-pointer focus:ring-2 focus:ring-indigo-200 ${cur.cls}`}>
      {TREND_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

// Common index names -> Yahoo symbols, so a user can type "NIFTY" / "DOW"
// instead of remembering the caret ticker.
const INDEX_ALIAS: Record<string, string> = {
  NIFTY: "^NSEI", NIFTY50: "^NSEI", NSEI: "^NSEI",
  SENSEX: "^BSESN", BSESN: "^BSESN",
  BANKNIFTY: "^NSEBANK", NIFTYBANK: "^NSEBANK",
  INDIAVIX: "^INDIAVIX",
  DOW: "^DJI", DOWJONES: "^DJI", DJIA: "^DJI",
  SP500: "^GSPC", SANDP500: "^GSPC", SPX: "^GSPC",
  NASDAQ: "^IXIC", NASDAQ100: "^NDX",
  RUSSELL: "^RUT", RUSSELL2000: "^RUT",
  VIX: "^VIX", FTSE: "^FTSE", FTSE100: "^FTSE",
  NIKKEI: "^N225", NIKKEI225: "^N225",
  DAX: "^GDAXI", HANGSENG: "^HSI", HSI: "^HSI", CAC: "^FCHI", CAC40: "^FCHI",
};

// Resolve a typed symbol/name to a Yahoo symbol, using the open tab to pick the
// right resolver (commodities/crypto have their own name maps; index names map
// to caret tickers; equity tabs pass a market hint).
async function resolveForMarket(raw: string, tab: string): Promise<string> {
  const up = raw.trim().toUpperCase();
  if (!up) return "";
  if (up.includes("=") || up.startsWith("^") || up.endsWith("-USD")) return up;
  const alias = INDEX_ALIAS[up.replace(/[^A-Z0-9]/g, "")];
  if (alias) return alias;
  if (tab === "comm") return resolveCommodity(raw);
  if (tab === "crypto") return resolveCrypto(raw);
  const hint = tab === "in" ? "Indian Stocks" : tab === "us" ? "US Stocks" : undefined;
  const { symbol } = await resolveHolding({ symbol: raw, stockName: raw }, hint as any);
  return (symbol || raw).toUpperCase();
}

type Item = { symbol: string; label: string };

const GROUPS: { key: string; title: string; icon: any; items: Item[] }[] = [
  {
    key: "us",
    title: "US Indices",
    icon: Globe,
    items: [
      { symbol: "^GSPC", label: "S&P 500" },
      { symbol: "^DJI", label: "Dow Jones" },
      { symbol: "^IXIC", label: "Nasdaq Composite" },
      { symbol: "^NDX", label: "Nasdaq 100" },
      { symbol: "^RUT", label: "Russell 2000" },
      { symbol: "^NYA", label: "NYSE Composite" },
      { symbol: "^VIX", label: "VIX (Volatility)" },
    ],
  },
  {
    key: "in",
    title: "Indian Indices",
    icon: IndianRupee,
    items: [
      { symbol: "^NSEI", label: "Nifty 50" },
      { symbol: "^NSEBANK", label: "Nifty Bank" },
      { symbol: "^BSESN", label: "BSE Sensex" },
      { symbol: "^CNXIT", label: "Nifty IT" },
      { symbol: "^CNXAUTO", label: "Nifty Auto" },
      { symbol: "^CNXPHARMA", label: "Nifty Pharma" },
      { symbol: "^CNXFMCG", label: "Nifty FMCG" },
      { symbol: "^CNXMETAL", label: "Nifty Metal" },
      { symbol: "^CNXENERGY", label: "Nifty Energy" },
      { symbol: "^CNXREALTY", label: "Nifty Realty" },
      { symbol: "^NSMIDCP", label: "Nifty Midcap" },
      { symbol: "^INDIAVIX", label: "India VIX" },
    ],
  },
  {
    key: "global",
    title: "Global Indices",
    icon: Globe,
    items: [
      { symbol: "^FTSE", label: "FTSE 100 (UK)" },
      { symbol: "^GDAXI", label: "DAX (Germany)" },
      { symbol: "^FCHI", label: "CAC 40 (France)" },
      { symbol: "^STOXX50E", label: "Euro Stoxx 50" },
      { symbol: "^N225", label: "Nikkei 225 (Japan)" },
      { symbol: "^HSI", label: "Hang Seng (HK)" },
      { symbol: "^KS11", label: "KOSPI (Korea)" },
      { symbol: "^AXJO", label: "ASX 200 (Australia)" },
    ],
  },
  {
    key: "comm",
    title: "Commodities",
    icon: Coins,
    items: [
      { symbol: "GC=F", label: "Gold" },
      { symbol: "SI=F", label: "Silver" },
      { symbol: "PL=F", label: "Platinum" },
      { symbol: "HG=F", label: "Copper" },
      { symbol: "CL=F", label: "Crude Oil (WTI)" },
      { symbol: "BZ=F", label: "Brent Crude" },
      { symbol: "NG=F", label: "Natural Gas" },
      { symbol: "ZC=F", label: "Corn" },
      { symbol: "ZW=F", label: "Wheat" },
      { symbol: "KC=F", label: "Coffee" },
    ],
  },
  {
    key: "crypto",
    title: "Crypto",
    icon: Bitcoin,
    items: [
      { symbol: "BTC-USD", label: "Bitcoin" },
      { symbol: "ETH-USD", label: "Ethereum" },
      { symbol: "BNB-USD", label: "BNB" },
      { symbol: "SOL-USD", label: "Solana" },
      { symbol: "XRP-USD", label: "XRP" },
      { symbol: "ADA-USD", label: "Cardano" },
      { symbol: "DOGE-USD", label: "Dogecoin" },
      { symbol: "AVAX-USD", label: "Avalanche" },
      { symbol: "DOT-USD", label: "Polkadot" },
      { symbol: "LINK-USD", label: "Chainlink" },
    ],
  },
];

const ALL_SYMBOLS = GROUPS.flatMap((g) => g.items.map((i) => i.symbol));

const curSymbol = (c: string | null) =>
  ({ INR: "₹", USD: "$", GBP: "£", JPY: "¥", EUR: "€", HKD: "HK$" } as Record<string, string>)[c || ""] || "";

const fmt = (n: number | null | undefined, cur = "") =>
  n == null ? "—" : `${cur}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(n) < 10 ? 4 : 2 })}`;

const fmtTime = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

const BADGE = [
  "bg-orange-100 text-orange-600",
  "bg-blue-100 text-blue-600",
  "bg-violet-100 text-violet-600",
  "bg-emerald-100 text-emerald-600",
  "bg-rose-100 text-rose-600",
  "bg-amber-100 text-amber-600",
  "bg-cyan-100 text-cyan-600",
  "bg-pink-100 text-pink-600",
];
const badgeColor = (s: string) => BADGE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % BADGE.length];
const initials = (label: string) =>
  label.replace(/[()]/g, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function agoLabel(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// Module-level cache so navigating away and back doesn't re-fetch every time.
// Survives client-side navigation within the session; a fresh cache (< TTL)
// is shown instantly with no network call.
let mktCache: { quotes: Record<string, any>; at: number } = { quotes: {}, at: 0 };
const MKT_TTL = 60_000; // 60s

export default function MarketsPage() {
  const [quotes, setQuotes] = useState<Record<string, any>>(mktCache.quotes);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(mktCache.at || null);
  const [auto, setAuto] = useState(false);
  const [tab, setTab] = useState("us");
  // user's own symbols ("Custom" tab)
  const [custom, setCustom] = useState<{ symbol: string; label: string }[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<Record<string, Record<string, string>>>({});
  const [combos, setCombos] = useState<Combination[]>([]);
  const setPlan = (sym: string, field: string, value: string) => {
    setMarketPlanField(sym, field, value);
    setMarketPlanField(sym, "updatedAt", String(Date.now())); // stamp last-edited
    if (field === "condOp" || field === "condVal" || field === "special") {
      const key = sym.toUpperCase();
      const p = getMarketPlans()[key] || {};
      const id = `mk-${key}`;
      const v = Number(p.condVal);
      const op = p.condOp || ">";
      const existing = getPriceAlerts().find((a) => a.id === id);
      if (p.condVal != null && String(p.condVal) !== "" && Number.isFinite(v)) {
        savePriceAlert({
          id, symbol: key,
          name: p.special ? `CMP ${op} ${v} → ${p.special}` : `CMP ${op} ${v}`,
          status: "active", conditionTriggered: false,
          condition: { metric: "price", op: op as any, value: v },
        });
      } else if (existing) {
        deletePriceAlert(id);
      }
    }
    setPlans(getMarketPlans());
  };
  // Per-tab custom symbols the user added into any group.
  const [customByGroup, setCustomByGroup] = useState<Record<string, { symbol: string; label: string }[]>>({});
  const [addInput, setAddInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [order, setOrder] = useState<Record<string, string[]>>({});
  const [dragSym, setDragSym] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Record<string, string[]>>({});
  const [editSym, setEditSym] = useState<string | null>(null);
  const [remarksEdit, setRemarksEdit] = useState<RemarksEdit | null>(null);

  // Build the editor value for a symbol from its saved plan (migrating a legacy
  // single trigger into the new multi-trigger list).
  const buildEditorValue = (sym: string): EditorValue => {
    const p = getMarketPlans()[String(sym).toUpperCase()] || {};
    let triggers = parseTriggers(p.triggers);
    if (!triggers.length && p.condVal != null && String(p.condVal) !== "") {
      triggers = [{ id: "legacy", op: p.condOp || ">", val: String(p.condVal), action: p.special || "Buy" }];
    }
    return { sl: p.sl, r: p.r, t1: p.t1, t2: p.t2, remarks: p.remarks, triggers, updatedAt: p.updatedAt ? Number(p.updatedAt) : undefined };
  };
  const saveEditor = (sym: string, v: EditorValue) => {
    const key = String(sym).toUpperCase();
    (["sl", "r", "t1", "t2", "remarks"] as const).forEach((f) => setMarketPlanField(sym, f, (v as any)[f] || ""));
    setMarketPlanField(sym, "triggers", JSON.stringify(v.triggers || []));
    setMarketPlanField(sym, "updatedAt", String(v.updatedAt || Date.now()));
    // retire the legacy single-trigger fields + its alert
    setMarketPlanField(sym, "condVal", ""); setMarketPlanField(sym, "condOp", ""); setMarketPlanField(sym, "special", "");
    deletePriceAlert(`mk-${key}`);
    syncStockTriggers("mk", sym, v.triggers || []);
    setPlans(getMarketPlans());
  };
  const trigCount = (sym: string) => {
    const p = plans[sym] || {};
    const n = parseTriggers(p.triggers).filter((t) => t.val !== "" && t.val != null).length;
    return n || (p.condVal != null && String(p.condVal) !== "" ? 1 : 0);
  };

  const load = useCallback(async (extra: string[] = []) => {
    setLoading(true);
    try {
      const grouped = Object.values(getCustomMarketByGroup()).flat().map((c) => c.symbol);
      const all = Array.from(new Set([...ALL_SYMBOLS, ...extra, ...getCustomMarketSymbols().map((c) => c.symbol), ...grouped]));
      const chunks: string[][] = [];
      for (let i = 0; i < all.length; i += 40) chunks.push(all.slice(i, i + 40));
      const merged: Record<string, any> = {};
      for (const c of chunks) {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: c }),
        });
        const j = await res.json();
        Object.assign(merged, j.quotes || {});
      }
      mktCache = { quotes: { ...mktCache.quotes, ...merged }, at: Date.now() };
      setQuotes(mktCache.quotes);
      setUpdatedAt(mktCache.at);
      setLoadError("");
    } catch (e: any) {
      // Previously swallowed: a failed refresh left stale quotes on screen with
      // an unchanged timestamp, indistinguishable from a successful one.
      setLoadError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  const markTrend = (sym: string, val: string) => {
    setMarketMark(sym, val);
    setMarketPlanField(sym, "updatedAt", String(Date.now())); // trend change counts as an edit
    setMarks(getMarketMarks());
    setPlans(getMarketPlans());
  };

  useEffect(() => {
    setCustom(getCustomMarketSymbols());
    setCustomByGroup(getCustomMarketByGroup());
    setMarks(getMarketMarks());
    setPlans(getMarketPlans());
    setCombos(getCombinations());
    setOrder(getMarketOrder());
    setHidden(getMarketHidden());
    // Only fetch if the cache is missing or stale — otherwise show it instantly.
    const fresh = Object.keys(mktCache.quotes).length > 0 && Date.now() - mktCache.at < MKT_TTL;
    if (!fresh) load();
  }, [load]);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => load(), 30000);
    return () => clearInterval(id);
  }, [auto, load]);

  // Add an exact Yahoo symbol (from a picked suggestion) — no resolution needed.
  const addSymbolDirect = async (sym: string, label?: string) => {
    if (!sym) return;
    if (tab === "custom") {
      addCustomMarketSymbol(sym, label || sym);
      setCustom(getCustomMarketSymbols());
    } else {
      addCustomMarketToGroup(tab, sym, label || sym);
      setCustomByGroup(getCustomMarketByGroup());
    }
    setAddInput(""); setSuggestions([]); setShowSug(false);
    await load([sym]);
  };

  // Debounced typo-tolerant suggestions from Yahoo search as the user types.
  useEffect(() => {
    const q = addInput.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const j = await (await fetch(`/api/search-stock?query=${encodeURIComponent(q)}`)).json();
        setSuggestions((j.matches || []).slice(0, 8));
        setShowSug(true);
      } catch { /* keep old */ }
    }, 250);
    return () => clearTimeout(t);
  }, [addInput]);

  // Add a symbol to the Custom tab: resolve names ("apple" -> AAPL) first.
  const addCustom = async () => {
    const raw = addInput.trim();
    if (!raw) return;
    setAdding(true);
    try {
      const sym = (await resolveForMarket(raw, tab)) || raw.toUpperCase();
      const label = raw.toUpperCase() === sym ? sym : raw;
      if (tab === "custom") {
        addCustomMarketSymbol(sym, label);
        setCustom(getCustomMarketSymbols());
      } else {
        // Add into whichever group tab is open.
        addCustomMarketToGroup(tab, sym, label);
        setCustomByGroup(getCustomMarketByGroup());
      }
      setAddInput(""); setSuggestions([]); setShowSug(false);
      await load([sym]);
    } finally {
      setAdding(false);
    }
  };
  // Remove ANY row: a user-added symbol is deleted outright; a built-in index is
  // hidden for this tab (and can be restored). Either way it leaves the list.
  const removeCustom = (sym: string, isCustom: boolean) => {
    if (isCustom) {
      if (tab === "custom") {
        removeCustomMarketSymbol(sym);
        setCustom(getCustomMarketSymbols());
      } else {
        removeCustomMarketFromGroup(tab, sym);
        setCustomByGroup(getCustomMarketByGroup());
      }
    } else {
      hideMarketSymbol(tab, sym);
      setHidden(getMarketHidden());
    }
  };
  const restoreHidden = () => { restoreMarketTab(tab); setHidden(getMarketHidden()); };

  const isCustomTab = tab === "custom";
  const active = GROUPS.find((g) => g.key === tab);
  const baseRows = useMemo(() => {
    const hide = new Set(hidden[tab] || []);
    // Apply the user's saved drag-and-drop order for this tab; symbols not in the
    // saved order keep their natural position after the ordered ones.
    const ord = order[tab] || [];
    const applyOrder = (arr: any[]) => {
      if (!ord.length) return arr;
      const idx = (s: string) => { const i = ord.indexOf(s); return i === -1 ? 1e9 : i; };
      return arr.map((r, i) => ({ r, i })).sort((a, b) => (idx(a.r.symbol) - idx(b.r.symbol)) || (a.i - b.i)).map((x) => x.r);
    };
    // Custom rows are ALWAYS shown — even before/without a live price — so an add
    // is never invisible and always has a Remove button. Built-in rows still wait
    // for a price so a curated list never shows blanks.
    if (isCustomTab) {
      return applyOrder(custom.filter((c) => !hide.has(c.symbol)).map((c) => ({
        symbol: c.symbol,
        label: quotes[c.symbol]?.name || c.label,
        custom: true,
        q: quotes[c.symbol],
      })));
    }
    const base = (active?.items || [])
      .filter((it) => !hide.has(it.symbol))
      .map((it) => ({ ...it, custom: false, q: quotes[it.symbol] }))
      .filter((r) => r.q && r.q.price != null);
    const mine = (customByGroup[tab] || []).filter((c) => !hide.has(c.symbol)).map((c) => ({
      symbol: c.symbol,
      label: quotes[c.symbol]?.name || c.label,
      custom: true,
      q: quotes[c.symbol],
    }));
    return applyOrder([...base, ...mine]);
  }, [active, quotes, isCustomTab, custom, customByGroup, tab, order, hidden]);

  // Drag-and-drop: move `from` symbol to just before `to`, persist per tab.
  const reorder = (from: string, to: string) => {
    if (!from || from === to) return;
    const seq = baseRows.map((r) => r.symbol);
    const fi = seq.indexOf(from);
    if (fi === -1) return;
    seq.splice(fi, 1);
    const ti = seq.indexOf(to);
    seq.splice(ti === -1 ? seq.length : ti, 0, from);
    setMarketOrderForTab(tab, seq);
    setOrder(getMarketOrder());
  };

  // --- Trend filter (uptrend / downtrend / sideways / no-trend) ---
  const [trendFilter, setTrendFilter] = useState("all");
  const [comboFilter, setComboFilter] = useState("all"); // all | __attached | __none | <comboId>
  const [recentSort, setRecentSort] = useState(false); // when on, most-recently-edited on top
  const [trendMap, setTrendMap] = useState<Record<string, string>>({});
  const [trendLoading, setTrendLoading] = useState(false);

  // Fetch trend state only when a trend filter is active, for the symbols in
  // view that we don't already know. /api/trend is heavy, so this stays off the
  // fast quote poll and is capped.
  useEffect(() => {
    if (trendFilter === "all") return;
    const syms = baseRows.map((r) => r.symbol).filter((s) => trendMap[s] === undefined).slice(0, 60);
    if (!syms.length) return;
    let cancelled = false;
    setTrendLoading(true);
    fetch("/api/trend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stocks: syms.map((s) => ({ symbol: s, name: s })) }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const upd: Record<string, string> = {};
        (j.results || []).forEach((t: any) => { upd[String(t.symbol).toUpperCase()] = t.ok ? t.state : ""; });
        syms.forEach((s) => { if (upd[s] === undefined) upd[s] = ""; }); // no result → no-trend
        setTrendMap((prev) => ({ ...prev, ...upd }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTrendLoading(false); });
    return () => { cancelled = true; };
  }, [trendFilter, baseRows, trendMap]);

  const rows = useMemo(() => {
    const byCombo = (r: any) => {
      const cid = plans[r.symbol]?.comboId;
      if (comboFilter === "all") return true;
      if (comboFilter === "__attached") return !!cid;
      if (comboFilter === "__none") return !cid;
      return cid === comboFilter;
    };
    const recent = (arr: any[]) => recentSort
      ? [...arr].sort((a, b) => Number(plans[b.symbol]?.updatedAt || 0) - Number(plans[a.symbol]?.updatedAt || 0))
      : arr;
    if (trendFilter === "all") return recent(baseRows.filter(byCombo));
    const up = ["up", "strong_up"];
    const down = ["down", "strong_down"];
    const match = (st?: string) => {
      switch (trendFilter) {
        case "uptrend": return up.includes(st || "");
        case "downtrend": return down.includes(st || "");
        case "sideways": return st === "neutral";
        case "notrend": return !st;
        case "up_side": return [...up, "neutral"].includes(st || "");
        case "down_side": return [...down, "neutral"].includes(st || "");
        default: return true;
      }
    };
    return recent(baseRows.filter((r) => match(trendMap[r.symbol]) && byCombo(r)));
  }, [baseRows, trendFilter, trendMap, plans, comboFilter, recentSort]);

  const TREND_OPTIONS = [
    { key: "all", label: "All trends" },
    { key: "uptrend", label: "📈 Uptrend" },
    { key: "downtrend", label: "📉 Downtrend" },
    { key: "sideways", label: "➡️ Sideways" },
    { key: "notrend", label: "• No trend" },
    { key: "up_side", label: "Uptrend + Sideways" },
    { key: "down_side", label: "Downtrend + Sideways" },
  ];

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Globe className="w-8 h-8 text-indigo-600" /> Markets
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Live Indian &amp; global indices, commodities and crypto.</p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && !loadError && (
            <span className="text-xs text-slate-400 font-medium">Updated {agoLabel(updatedAt)}</span>
          )}
          {loadError && (
            <span className="text-xs font-bold text-amber-700">
              Refresh failed — showing prices from {updatedAt ? agoLabel(updatedAt) : "an earlier load"}. {loadError}
            </span>
          )}
          <button
            onClick={() => setAuto((v) => !v)}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition ${auto ? "bg-emerald-50 text-emerald-700" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"}`}
            title="Auto-refresh every 30s"
          >
            {auto ? "● Live" : "○ Live"}
          </button>
          <button
            onClick={() => load()}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              onClick={() => setTab(g.key)}
              className={`px-5 py-3.5 text-sm font-bold whitespace-nowrap border-b-2 transition ${
                tab === g.key
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {g.title}
            </button>
          ))}
          <button
            onClick={() => setTab("custom")}
            className={`px-5 py-3.5 text-sm font-bold whitespace-nowrap border-b-2 transition flex items-center gap-1.5 ${
              isCustomTab ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Star className="w-3.5 h-3.5" /> Custom
            {custom.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{custom.length}</span>
            )}
          </button>
        </div>

        {/* Add your own symbol into whichever tab is open */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">
              Add to {isCustomTab ? "Custom" : active?.title}
            </span>
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={addInput}
                onChange={(e) => setAddInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustom()}
                onFocus={() => addInput && setShowSug(true)}
                onBlur={() => setTimeout(() => setShowSug(false), 200)}
                placeholder="Type a name or symbol — e.g. apple, nifty, real estate, bitcoin…"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              {showSug && suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                  {suggestions.map((r) => (
                    <button key={r.symbol} onMouseDown={() => addSymbolDirect(r.symbol, r.name)}
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center justify-between gap-2 border-b border-slate-50 last:border-0">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-black text-slate-800 text-[13px] shrink-0">{r.symbol}</span>
                        <span className="text-[12px] text-slate-500 truncate">{r.name}</span>
                      </span>
                      {r.exchange && <span className="text-[10px] font-bold text-slate-400 shrink-0">{r.exchange}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={addCustom}
              disabled={!addInput.trim() || adding}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {adding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
        </div>

        {/* Trend filter */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">AI Trend</span>
          <select
            value={trendFilter}
            onChange={(e) => setTrendFilter(e.target.value)}
            className="text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-200 outline-none"
          >
            {TREND_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {trendLoading && <span className="text-[11px] text-slate-400 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> analysing trends…</span>}
          {trendFilter !== "all" && !trendLoading && (
            <span className="text-[11px] text-slate-400">{rows.length} match</span>
          )}
          <button onClick={() => setRecentSort((v) => !v)}
            className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 border transition ${recentSort ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            🕐 Recently changed
          </button>
          {(hidden[tab]?.length || 0) > 0 && (
            <button onClick={restoreHidden} className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-lg px-2.5 py-1.5 ml-1">
              ↩ Restore {hidden[tab].length} hidden
            </button>
          )}
          {combos.length > 0 && (
            <>
              <span className="text-[11px] font-bold text-violet-500 uppercase tracking-wide ml-2">Combo</span>
              <select
                value={comboFilter}
                onChange={(e) => setComboFilter(e.target.value)}
                className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border outline-none focus:ring-2 focus:ring-violet-200 cursor-pointer ${comboFilter !== "all" ? "bg-violet-50 border-violet-300 text-violet-700" : "bg-white border-slate-200 text-slate-700"}`}
              >
                <option value="all">All</option>
                <option value="__attached">🎯 Any attached ({Object.values(plans).filter((p) => p?.comboId).length})</option>
                <option value="__none">No combo</option>
                {combos.map((c) => {
                  const n = Object.values(plans).filter((p) => p?.comboId === c.id).length;
                  return <option key={c.id} value={c.id}>{c.label ? `${c.label} · ` : ""}{c.name} ({n})</option>;
                })}
              </select>
            </>
          )}
        </div>

        {/* Mobile: clean card list — no sideways scrolling, nothing cut off */}
        <div className="sm:hidden divide-y-2 divide-slate-500">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-slate-400 font-medium text-sm">
              {trendFilter !== "all" ? (trendLoading ? "Analysing trends…" : "No stocks match this trend.") : loading ? "Loading live prices…" : isCustomTab ? "No custom symbols yet — add one above." : "Live data unavailable right now."}
            </div>
          ) : (
            rows.map((r) => {
              const q = r.q || {};
              const noData = r.custom && q.price == null;
              const up = (q.changePct ?? 0) >= 0;
              const cur = curSymbol(q.currency);
              return (
                <div key={`m-${r.symbol}`} className={`flex items-center gap-3 px-4 py-3 ${TREND_ROW[marks[r.symbol] || ""] || ""}`}>
                  <Link href={`/charts?symbol=${encodeURIComponent(r.symbol)}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${badgeColor(r.symbol)}`}>
                      {initials(r.label)}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-black text-slate-900 text-[14px] truncate">{r.label}</span>
                      <span className="block text-[11px] text-slate-400">{noData ? "no data — check symbol" : fmtTime(q.time)}</span>
                    </span>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="font-black text-slate-900 text-[14px] tabular-nums">{fmt(q.price, cur)}</div>
                    {q.changePct != null && (
                      <div className={`text-[12px] font-black tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}>
                        {up ? "+" : ""}{q.changePct.toFixed(2)}%
                      </div>
                    )}
                  </div>
                  <div className="shrink-0"><TrendSelect value={marks[r.symbol]} onChange={(v) => markTrend(r.symbol, v)} /></div>
                  <button onClick={() => removeCustom(r.symbol, !!r.custom)} className="p-1.5 text-slate-300 hover:text-rose-600 shrink-0" title={r.custom ? "Remove" : "Hide"}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop / tablet: full table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm border-collapse [&_th]:px-3 [&_td]:px-3 sm:[&_th]:px-5 sm:[&_td]:px-5">
            <thead>
              <tr className="text-slate-400">
                <th className="text-left font-medium px-5 py-3">Index name</th>
                <th className="text-right font-medium px-5 py-3">Last traded</th>
                <th className="text-right font-medium px-5 py-3">Day change</th>
                <th className="text-center font-medium px-3 py-3">My Trend</th>
                <th className="text-center font-medium px-2 py-3 text-rose-500">SL</th>
                <th className="text-center font-medium px-2 py-3">R</th>
                <th className="text-center font-medium px-2 py-3 text-emerald-600">T1</th>
                <th className="text-center font-medium px-2 py-3 text-emerald-600">T2</th>
                <th className="text-left font-medium px-3 py-3">Remarks</th>
                <th className="text-left font-medium px-3 py-3 text-indigo-600">Alert Trigger</th>
                <th className="text-left font-medium px-3 py-3 text-violet-600">Combo</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-5 py-12 text-center text-slate-400 font-medium">
                    {trendFilter !== "all"
                      ? trendLoading
                        ? "Analysing trends…"
                        : "No stocks match this trend."
                      : loading
                        ? "Loading live prices…"
                        : isCustomTab
                          ? "No custom symbols yet — add any index, stock, commodity or crypto above."
                          : "Live data unavailable right now."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const q = r.q || {};
                  const noData = r.custom && q.price == null;
                  const up = (q.changePct ?? 0) >= 0;
                  const cur = curSymbol(q.currency);
                  return (
                    <tr key={r.symbol}
                      onDragOver={(e) => { if (dragSym) e.preventDefault(); }}
                      onDrop={() => { if (dragSym) reorder(dragSym, r.symbol); setDragSym(null); }}
                      className={`border-t-2 border-slate-500 transition group ${dragSym === r.symbol ? "opacity-40" : ""} ${dragSym && dragSym !== r.symbol ? "hover:bg-indigo-50" : (TREND_ROW[marks[r.symbol] || ""] || "hover:bg-slate-50")}`}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span draggable onDragStart={() => setDragSym(r.symbol)} onDragEnd={() => setDragSym(null)}
                            title="Drag to reorder" className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0 touch-none">
                            <GripVertical className="w-4 h-4" />
                          </span>
                          <Link href={`/charts?symbol=${encodeURIComponent(r.symbol)}`} className="flex items-center gap-3 min-w-0">
                            <span className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-[10px] sm:text-[11px] font-black shrink-0 ${badgeColor(r.symbol)}`}>
                              {initials(r.label)}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-bold text-slate-900 group-hover:text-indigo-600">{r.label}</span>
                              <span className={`block text-[11px] ${noData ? "text-amber-600" : "text-slate-400"}`}>{noData ? "no data — remove & re-add from search" : fmtTime(q.time)}</span>
                              {plans[r.symbol]?.updatedAt && (
                                <span className="block text-[12px] font-bold text-indigo-600 mt-0.5 whitespace-nowrap">✎ edited {fmtTime(Number(plans[r.symbol].updatedAt))}</span>
                              )}
                            </span>
                          </Link>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-bold text-slate-900">{fmt(q.price, cur)}</td>
                      <td className={`px-5 py-3.5 text-right tabular-nums font-bold ${up ? "text-emerald-600" : "text-rose-600"}`}>
                        {up ? "" : "-"}{fmt(q.change != null ? Math.abs(q.change) : null, cur)}
                        {q.changePct != null && <span className="ml-1">({up ? "" : "-"}{Math.abs(q.changePct).toFixed(2)}%)</span>}
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <TrendSelect value={marks[r.symbol]} onChange={(v) => markTrend(r.symbol, v)} />
                      </td>
                      {(["sl", "r", "t1", "t2"] as const).map((f) => (
                        <td key={f} className="px-2 py-3.5 text-center">
                          <button onClick={() => setEditSym(r.symbol)} title="Edit"
                            className="w-16 px-2 py-1 rounded text-[12px] tabular-nums text-slate-700 hover:bg-indigo-50">
                            {plans[r.symbol]?.[f] || "—"}
                          </button>
                        </td>
                      ))}
                      <td className="px-3 py-3.5">
                        <button onClick={() => setRemarksEdit({ title: r.label, subtitle: r.symbol, value: plans[r.symbol]?.remarks || "", onSave: (t) => setPlan(r.symbol, "remarks", t) })} title="Add / edit remark (voice)"
                          className="text-left w-full min-w-[7rem] px-2 py-1 rounded text-[12px] text-slate-600 hover:bg-indigo-50">
                          {plans[r.symbol]?.remarks || <span className="text-slate-300">📝 add note…</span>}
                        </button>
                      </td>
                      <td className="px-3 py-3.5">
                        <button onClick={() => setEditSym(r.symbol)} title="Edit triggers"
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-indigo-50 text-left">
                          <Pencil className="w-3.5 h-3.5 text-slate-400" />
                          {trigCount(r.symbol) > 0
                            ? <span className="text-[11px] font-bold text-emerald-600">🔔 {trigCount(r.symbol)} trigger{trigCount(r.symbol) === 1 ? "" : "s"}</span>
                            : <span className="text-[11px] font-bold text-slate-400">+ add trigger</span>}
                        </button>
                      </td>
                      <td className="px-3 py-3.5">
                        <select value={plans[r.symbol]?.comboId || ""} onChange={(e) => setPlan(r.symbol, "comboId", e.target.value)}
                          title="Notify me when this matches a saved combination"
                          className={`max-w-[150px] px-2 py-1 border rounded text-[12px] font-bold outline-none focus:ring-2 focus:ring-violet-200 ${plans[r.symbol]?.comboId ? "bg-violet-50 border-violet-300 text-violet-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                          <option value="">— attach —</option>
                          {combos.map((c) => <option key={c.id} value={c.id}>{c.label ? `${c.label} · ` : ""}{c.name}</option>)}
                        </select>
                        {plans[r.symbol]?.comboId && combos.some((c) => c.id === plans[r.symbol]?.comboId) && (
                          <div className="text-[10px] text-violet-600 font-bold mt-0.5">🎯 watching</div>
                        )}
                      </td>
                      <td className="pr-4">
                        <button
                          onClick={() => removeCustom(r.symbol, !!r.custom)}
                          title={r.custom ? "Remove" : "Hide from this tab"}
                          className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-slate-400 italic">
        Live prices via Yahoo Finance (may be delayed ~15 min). Click any row to open its chart. Research support only.
        Not buy/sell advice. Always verify data independently.
      </p>

      {editSym && (() => {
        const row = baseRows.find((r) => r.symbol === editSym);
        const q = quotes[editSym] || {};
        const isCustom = !!row?.custom;
        return (
          <StockEditor
            open
            symbol={editSym}
            name={q.name || row?.label}
            price={q.price}
            currency={q.currency}
            value={buildEditorValue(editSym)}
            onClose={() => setEditSym(null)}
            onSave={(v) => saveEditor(editSym, v)}
            onDelete={() => removeCustom(editSym, isCustom)}
          />
        );
      })()}

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
