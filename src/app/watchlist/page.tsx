"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Search,
  Trash2,
  Activity,
  ChevronRight,
  Plus,
  RefreshCw,
  Layers,
  X,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import {
  getWatchlist,
  removeFromWatchlist,
  saveToWatchlist,
  bulkAddToWatchlist,
  getWatchlistSubcats,
  addWatchlistSubcat,
  removeWatchlistSubcat,
  WATCHLIST_CATEGORIES,
  DEFAULT_SUBCATS,
  SUBCAT_TITLES,
  type WatchlistCategory,
  getPriceAlerts,
  savePriceAlert,
  deletePriceAlert,
  getCombinations,
  type Combination,
} from "@/lib/storage";
import {
  resolveHolding,
  fetchQuotes,
  resolveCommodity,
  resolveCrypto,
  parseWorkbook,
} from "@/lib/excelImport";

const CATEGORY_META: Record<
  string,
  { label: string; hint: string; color: string }
> = {
  "Indian Stocks": { label: "Indian Stocks", hint: "RELIANCE.NS, TCS.NS…", color: "bg-orange-500" },
  "US Stocks": { label: "US Stocks", hint: "AAPL, MSFT, NVDA…", color: "bg-blue-500" },
  Commodities: { label: "Commodities", hint: "GC=F (Gold), CL=F (Crude)…", color: "bg-amber-500" },
  Crypto: { label: "Crypto", hint: "BTC-USD, ETH-USD…", color: "bg-violet-500" },
  Custom: { label: "Custom", hint: "Anything you want to track", color: "bg-slate-500" },
  // legacy categories kept so older saved items still have a home
  MarketSmith: { label: "MarketSmith", hint: "Ideas from MarketSmith", color: "bg-pink-500" },
  "Market Mojo": { label: "Market Mojo", hint: "Ideas from Market Mojo", color: "bg-pink-400" },
  "MF Accumulation": { label: "MF Accumulation", hint: "Funds are accumulating", color: "bg-emerald-500" },
};

const isIndia = (cat: string) => cat === "Indian Stocks";

// Colour tags a user can put on a watchlist row (their own meaning — e.g.
// green = buy zone, red = avoid, yellow = watch). Clicking a colour highlights
// the whole row (left bar + a matching background tint) so it stands out.
// Three colour marks with a plain meaning each.
const MARK_COLORS: { key: string; dot: string; bar: string; row: string; label: string }[] = [
  { key: "green", dot: "bg-emerald-500", bar: "border-l-emerald-500", row: "bg-emerald-100/80", label: "Uptrend" },
  { key: "red", dot: "bg-rose-500", bar: "border-l-rose-500", row: "bg-rose-100/80", label: "Downtrend" },
  { key: "yellow", dot: "bg-amber-400", bar: "border-l-amber-400", row: "bg-amber-100/80", label: "Sideways" },
];
const barClass = (color?: string) => {
  const c = MARK_COLORS.find((x) => x.key === color);
  return c ? `border-l-4 ${c.bar} ${c.row}` : "border-l-4 border-l-transparent";
};

function ColorDots({ value, onPick }: { value?: string; onPick: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {MARK_COLORS.map((c) => (
        <button
          key={c.key}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick(value === c.key ? "" : c.key); }}
          title={value === c.key ? `${c.label} (click to clear)` : `Mark ${c.label}`}
          className={`w-3.5 h-3.5 rounded-full ${c.dot} transition ${value === c.key ? "ring-2 ring-offset-1 ring-slate-500 scale-110" : "opacity-70 hover:opacity-100"}`}
        />
      ))}
    </div>
  );
}

const curOf = (q: any, cat: string) =>
  q?.currency === "INR" || isIndia(cat) ? "₹" : q?.currency === "USD" ? "$" : "";

function fmtPrice(q: any, cat: string) {
  if (!q || q.price == null) return "—";
  return `${curOf(q, cat)}${Number(q.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// A plain price-like value (open / high / low / prev close).
function fmtVal(v: any, q: any, cat: string) {
  if (v == null) return "—";
  return `${curOf(q, cat)}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// Market cap — Cr for Indian, T/B/M for the rest.
function fmtCap(v: any, q: any, cat: string) {
  if (!v) return "—";
  const cur = curOf(q, cat);
  if (cur === "₹") {
    const cr = v / 1e7;
    if (cr >= 1e5) return `${cur}${(cr / 1e5).toFixed(2)}L Cr`;
    return `${cur}${cr.toLocaleString(undefined, { maximumFractionDigits: 0 })} Cr`;
  }
  if (v >= 1e12) return `${cur}${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${cur}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${cur}${(v / 1e6).toFixed(1)}M`;
  return `${cur}${v}`;
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [active, setActive] = useState<string>("All");
  const [activeSub, setActiveSub] = useState<string>("All"); // sub-list within a category
  const [search, setSearch] = useState("");
  const [markFilter, setMarkFilter] = useState("all"); // all | green | red | yellow | unmarked
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [subcats, setSubcats] = useState<Record<string, string[]>>({});
  const [newSub, setNewSub] = useState("");
  const [combos, setCombos] = useState<Combination[]>([]);

  // Quick Add
  const [showAdd, setShowAdd] = useState(false);
  const [addCat, setAddCat] = useState<WatchlistCategory>("US Stocks");
  const [addSub, setAddSub] = useState<string>(""); // chosen sub-list for Quick Add
  const [addNewSub, setAddNewSub] = useState(""); // create-new sub-list inline
  const [addText, setAddText] = useState("");
  const [adding, setAdding] = useState(false);

  // Excel/CSV import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const reload = () => {
    setWatchlist(getWatchlist());
    setSubcats(getWatchlistSubcats());
    setCombos(getCombinations());
  };

  // One-time heal: fix commodity/crypto rows saved with a non-Yahoo symbol
  // (e.g. "XAGUSD" -> "SI=F", "BITCOIN" -> "BTC-USD") so their live price loads.
  const healSymbols = () => {
    let changed = false;
    getWatchlist().forEach((item: any) => {
      const sym = String(item.symbol || "");
      let fixed = sym;
      if (item.category === "Commodities") fixed = resolveCommodity(sym);
      else if (item.category === "Crypto") fixed = resolveCrypto(sym);
      if (fixed && fixed !== sym) {
        removeFromWatchlist(sym, item.category);
        saveToWatchlist({ ...item, symbol: fixed });
        changed = true;
      }
    });
    return changed;
  };

  useEffect(() => {
    healSymbols();
    reload();
  }, []);

  // Fetch live quotes for everything currently saved, in one batch call.
  const refreshQuotes = async (list = watchlist) => {
    const symbols = Array.from(new Set(list.map((i) => i.symbol)));
    if (symbols.length === 0) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });
      const j = await res.json();
      if (j.quotes) setQuotes(j.quotes);
    } catch {
      /* leave prices as — */
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (watchlist.length) refreshQuotes(watchlist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.length]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    watchlist.forEach((i) => {
      c[i.category] = (c[i.category] || 0) + 1;
    });
    return c;
  }, [watchlist]);

  const filtered = watchlist.filter((item) => {
    if (active !== "All" && item.category !== active) return false;
    // sub-list filter (only when a category is active)
    if (active !== "All" && activeSub !== "All") {
      if (activeSub === "__none") { if (item.subcategory) return false; }
      else if (item.subcategory !== activeSub) return false;
    }
    // trend-mark filter
    if (markFilter === "unmarked") { if (item.color) return false; }
    else if (markFilter !== "all" && item.color !== markFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      item.symbol.toLowerCase().includes(s) ||
      (item.name || "").toLowerCase().includes(s)
    );
  });

  // sub-list chips: ST/MT always available, plus saved + in-use custom ones
  const activeSubcats = useMemo(() => {
    if (active === "All") return [];
    const fromStore = subcats[active] || [];
    const inUse = Array.from(new Set(watchlist.filter((i) => i.category === active && i.subcategory).map((i) => i.subcategory)));
    return Array.from(new Set([...DEFAULT_SUBCATS, ...fromStore, ...inUse]));
  }, [active, subcats, watchlist]);

  const subCount = (sub: string) =>
    watchlist.filter((i) => i.category === active && (sub === "__none" ? !i.subcategory : i.subcategory === sub)).length;

  const handleRemove = (symbol: string, category: string) => {
    removeFromWatchlist(symbol, category);
    reload();
  };

  // Set (or clear) the personal colour mark on a row.
  // Edit a plan field (SL/R/T1/T2/remarks) or the alert trigger on a watchlist row.
  const updateWL = (item: any, field: string, value: string) => {
    const merged = { ...item, [field]: value };
    saveToWatchlist(merged);
    if (field === "condOp" || field === "condVal" || field === "special") {
      const id = `wl-${item.symbol}-${item.category}`;
      const v = Number(merged.condVal);
      const op = merged.condOp || ">";
      const existing = getPriceAlerts().find((a) => a.id === id);
      if (merged.condVal != null && String(merged.condVal) !== "" && Number.isFinite(v)) {
        savePriceAlert({
          id, symbol: String(item.symbol).toUpperCase(),
          name: merged.special ? `CMP ${op} ${v} → ${merged.special}` : `CMP ${op} ${v}`,
          status: "active", conditionTriggered: false,
          condition: { metric: "price", op: op as any, value: v },
        });
      } else if (existing) {
        deletePriceAlert(id);
      }
    }
    reload();
  };

  const setColor = (item: any, color: string) => {
    saveToWatchlist({ ...item, color });
    reload();
  };

  const handleBulkAdd = async () => {
    const inputs = addText
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (inputs.length === 0) return;
    setAdding(true);
    try {
      // Resolve each input to a real ticker + its true market (APPLE -> AAPL,
      // RELIANCE -> RELIANCE.NS). This makes live data load, and lets US/Indian
      // auto-sort so they never mix.
      // For the two market lists, route by detected market. Idea lists
      // (MarketSmith / Market Mojo / MF Accumulation) keep the chosen category.
      const isMarketList = addCat === "US Stocks" || addCat === "Indian Stocks";
      // Use the chosen tab as a tiebreaker for ambiguous names (Infosys ADR vs .NS).
      const hint = isMarketList ? (addCat as "US Stocks" | "Indian Stocks") : undefined;

      const resolved = await Promise.all(
        inputs.map(async (input) => {
          // Commodities/Crypto have their own name->symbol maps (Silver -> SI=F,
          // Bitcoin -> BTC-USD); only true equity lists need the search lookup.
          if (addCat === "Commodities") return { symbol: resolveCommodity(input), market: addCat };
          if (addCat === "Crypto") return { symbol: resolveCrypto(input), market: addCat };
          if (!isMarketList) return { symbol: input.toUpperCase(), market: addCat };
          const { symbol, market } = await resolveHolding({ symbol: input, stockName: input }, hint);
          return { symbol: (symbol || input).toUpperCase(), market };
        }),
      );

      // Fetch live quotes once (also gives us the company name).
      const q = await fetchQuotes(resolved.map((r) => r.symbol));

      // Sub-list: a newly typed one wins, else the chosen chip.
      const sub = (addNewSub.trim() || addSub || "").trim();

      resolved.forEach((r) => {
        const category = (isMarketList ? r.market : addCat) as WatchlistCategory;
        saveToWatchlist({ symbol: r.symbol, name: q[r.symbol]?.name || r.symbol, category, subcategory: sub });
        if (sub) addWatchlistSubcat(category, sub);
      });

      setQuotes((prev) => ({ ...prev, ...q })); // show prices immediately
      setAddText("");
      setAddNewSub("");
      setShowAdd(false);
      reload();
    } finally {
      setAdding(false);
    }
  };

  // Import an Excel/CSV of tickers/names into a watchlist. Any layout works —
  // the parser finds the name/symbol column. Rows import into the currently
  // selected category; on the "All" tab, Indian/US auto-sort by detected market.
  const handleImportFile = async (file: File) => {
    setImportMsg(null);
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const sheets = parseWorkbook(buf);
      const rows = sheets.flatMap((s) => s.rows).filter((r) => r.stockName || r.symbol);
      if (rows.length === 0) {
        setImportMsg({ kind: "err", text: "No stocks found. File needs a Name or Symbol column." });
        return;
      }

      // Where do imported rows land? The active category (if one is selected),
      // else auto-detect per row.
      const target: string | null =
        active !== "All" && (WATCHLIST_CATEGORIES as readonly string[]).includes(active) ? active : null;

      const resolved = await Promise.all(
        rows.map(async (r) => {
          const input = (r.symbol || r.stockName || "").trim();
          if (target === "Commodities")
            return { symbol: resolveCommodity(input), name: r.stockName || input, category: "Commodities" };
          if (target === "Crypto")
            return { symbol: resolveCrypto(input), name: r.stockName || input, category: "Crypto" };
          if (target === "Custom")
            return { symbol: input.toUpperCase(), name: r.stockName || input, category: "Custom" };
          // Indian/US target, or All -> auto-detect the market from the symbol.
          const hint =
            target === "Indian Stocks" || target === "US Stocks"
              ? (target as "Indian Stocks" | "US Stocks")
              : undefined;
          const { symbol, market } = await resolveHolding({ symbol: r.symbol, stockName: r.stockName }, hint);
          return { symbol: (symbol || input).toUpperCase(), name: r.stockName || input, category: market as string };
        }),
      );

      const clean = resolved.filter((r) => r.symbol);
      const q = await fetchQuotes(clean.map((r) => r.symbol));
      clean.forEach((r) => {
        saveToWatchlist({
          symbol: r.symbol,
          name: q[r.symbol]?.name || r.name || r.symbol,
          category: r.category as WatchlistCategory,
        });
      });
      setQuotes((prev) => ({ ...prev, ...q }));
      reload();
      setImportMsg({ kind: "ok", text: `Imported ${clean.length} stock${clean.length === 1 ? "" : "s"} from ${file.name}.` });
    } catch {
      setImportMsg({ kind: "err", text: "Could not read that file. Supported: .xlsx, .xls, .csv" });
    } finally {
      setImporting(false);
    }
  };

  const createSubList = () => {
    const n = newSub.trim();
    if (!n || active === "All") return;
    addWatchlistSubcat(active, n);
    setNewSub("");
    setSubcats(getWatchlistSubcats());
    setActiveSub(n);
  };
  const deleteSubList = (name: string) => {
    removeWatchlistSubcat(active, name);
    if (activeSub === name) setActiveSub("All");
    reload();
  };

  // Tabs: the current set, plus any legacy category that still holds items so
  // nothing saved earlier ever disappears.
  const tabs = useMemo(() => {
    const legacy = Array.from(
      new Set(
        watchlist
          .map((i) => i.category)
          .filter((c) => c && !(WATCHLIST_CATEGORIES as readonly string[]).includes(c)),
      ),
    );
    return ["All", ...WATCHLIST_CATEGORIES, ...legacy];
  }, [watchlist]);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Bookmark className="w-8 h-8 text-indigo-600" /> Watchlists
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Organise the stocks you track into lists — Indian, US, commodities, crypto or your own.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => refreshQuotes()}
            disabled={refreshing || watchlist.length === 0}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-2 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
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
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-2 transition disabled:opacity-50"
            title="Import an Excel/CSV of tickers or names"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Import Excel
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" /> Quick Add
          </button>
        </div>
      </div>

      {/* Import feedback */}
      {importMsg && (
        <div
          className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-3 ${
            importMsg.kind === "ok"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-rose-50 text-rose-700 border border-rose-200"
          }`}
        >
          <span>{importMsg.text}</span>
          <button onClick={() => setImportMsg(null)} className="opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {active !== "All" && (
        <p className="-mt-2 mb-4 text-[11px] text-slate-400 font-medium">
          Import Excel → stocks currently selected <b>{active}</b> list mein jaayenge. Sabhi markets
          auto-sort karne ke liye pehle <b>All</b> tab chuno.
        </p>
      )}

      {/* Quick Add — bulk paste many symbols into one list */}
      {showAdd && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-indigo-900 flex items-center gap-2">
              <Layers className="w-5 h-5" /> Add stocks to a list
            </h3>
            <button onClick={() => setShowAdd(false)} className="text-indigo-400 hover:text-indigo-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {WATCHLIST_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => { setAddCat(c); setAddSub(""); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  addCat === c
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Sub-list selector for Quick Add */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-bold text-indigo-800">Sub-list:</span>
            <button
              onClick={() => { setAddSub(""); setAddNewSub(""); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${!addSub && !addNewSub ? "bg-slate-900 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              None
            </button>
            {Array.from(new Set([...DEFAULT_SUBCATS, ...(subcats[addCat] || [])])).map((sc) => (
              <button
                key={sc}
                onClick={() => { setAddSub(sc); setAddNewSub(""); }}
                title={SUBCAT_TITLES[sc] || undefined}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${addSub === sc ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"}`}
              >
                {sc}
                {SUBCAT_TITLES[sc] && (
                  <span className={`ml-1 text-[9px] font-medium ${addSub === sc ? "text-white/70" : "text-slate-400"}`}>
                    {SUBCAT_TITLES[sc]}
                  </span>
                )}
              </button>
            ))}
            <input
              value={addNewSub}
              onChange={(e) => { setAddNewSub(e.target.value); setAddSub(""); }}
              placeholder="+ new sub-list"
              className="px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 w-36"
            />
          </div>

          <textarea
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            rows={3}
            placeholder={`Paste symbols separated by comma, space or new line.\ne.g. ${isIndia(addCat) ? "RELIANCE.NS, TCS.NS, INFY.NS" : "AAPL, MSFT, NVDA"}`}
            className="w-full px-4 py-3 rounded-xl border border-indigo-200 bg-white text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-indigo-700 font-medium">
              {addCat === "US Stocks" || addCat === "Indian Stocks"
                ? "Names or tickers both work (Apple, AAPL, Reliance) — live prices load & US/Indian auto-sort."
                : "Names or tickers both work — live prices load automatically."}
            </p>
            <button
              onClick={handleBulkAdd}
              disabled={!addText.trim() || adding}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {adding && <RefreshCw className="w-4 h-4 animate-spin" />}
              {adding ? "Adding…" : `Add to ${addCat}`}
            </button>
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {tabs.map((t) => {
          const n = t === "All" ? watchlist.length : counts[t] || 0;
          return (
            <button
              key={t}
              onClick={() => { setActive(t); setActiveSub("All"); }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
                active === t
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {t !== "All" && (
                <span className={`w-2 h-2 rounded-full ${CATEGORY_META[t]?.color || "bg-slate-400"}`} />
              )}
              {t}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-md ${
                  active === t ? "bg-white/20" : "bg-slate-100 text-slate-500"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sub-list tabs (within the active category) */}
      {active !== "All" && (
        <div className="flex flex-wrap items-center gap-2 mb-5 pl-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide mr-1">Sub-lists:</span>
          {["All", ...activeSubcats, "__none"].map((sub) => {
            const label = sub === "All" ? "All" : sub === "__none" ? "No sub-list" : sub;
            const cnt = sub === "All" ? (counts[active] || 0) : subCount(sub);
            if (sub === "__none" && cnt === 0) return null;
            return (
              <span key={sub} className="inline-flex items-center">
                <button
                  onClick={() => setActiveSub(sub)}
                  title={SUBCAT_TITLES[sub] || undefined}
                  className={`pl-2.5 pr-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    activeSub === sub ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"
                  }`}
                >
                  {label}
                  {SUBCAT_TITLES[sub] && (
                    <span className={`text-[9px] font-medium ${activeSub === sub ? "text-white/70" : "text-slate-400"}`}>
                      {SUBCAT_TITLES[sub]}
                    </span>
                  )}
                  <span className={`text-[10px] px-1 rounded ${activeSub === sub ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{cnt}</span>
                  {/* ST / MT are built-in; only custom sub-lists can be deleted */}
                  {sub !== "All" && sub !== "__none" && !(DEFAULT_SUBCATS as readonly string[]).includes(sub) && (
                    <span onClick={(e) => { e.stopPropagation(); deleteSubList(sub); }} className="ml-0.5 opacity-60 hover:opacity-100" title="Delete sub-list">
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>
              </span>
            );
          })}
          {/* create new sub-list */}
          <span className="inline-flex items-center gap-1">
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createSubList()}
              placeholder="+ new sub-list"
              className="px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 w-32"
            />
            <button onClick={createSubList} disabled={!newSub.trim()} className="p-1 bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Filter by symbol or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-full"
        />
      </div>

      {/* Trend-mark filter (click a dot on a row to tag; filter here) */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Trend mark:</span>
        <button onClick={() => setMarkFilter("all")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${markFilter === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>All</button>
        {MARK_COLORS.map((c) => (
          <button key={c.key} onClick={() => setMarkFilter(markFilter === c.key ? "all" : c.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition inline-flex items-center gap-1.5 ${markFilter === c.key ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} /> {c.label}
          </button>
        ))}
        <button onClick={() => setMarkFilter(markFilter === "unmarked" ? "all" : "unmarked")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${markFilter === "unmarked" ? "bg-slate-900 text-white" : "bg-white text-slate-400 border border-slate-200 hover:bg-slate-50"}`}>Unmarked</button>
      </div>

      {/* Empty state */}
      {watchlist.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <Bookmark className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">Your watchlists are empty</h3>
          <p className="text-slate-500 mb-6 font-medium">
            Use Quick Add to paste a batch of symbols into any list, or add stocks from the analyze page.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"
          >
            <Plus className="w-4 h-4" /> Quick Add stocks
          </button>
        </div>
      ) : (
        <>
        {/* Mobile: clean card list (no sideways scrolling) */}
        <div className="sm:hidden space-y-2">
          {filtered.map((item, idx) => {
            const q = quotes[item.symbol];
            const chg = q?.changePct;
            const up = typeof chg === "number" && chg >= 0;
            return (
              <div key={`m-${item.symbol}-${item.category}-${idx}`} className={`bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex items-center gap-2.5 ${barClass(item.color)}`}>
                <div className="shrink-0"><ColorDots value={item.color} onPick={(c) => setColor(item, c)} /></div>
                <Link href={`/analyze?symbol=${item.symbol}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-[12px] shrink-0">
                    {item.symbol.substring(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 text-[14px] truncate">{item.symbol}</div>
                    <div className="text-[11px] text-slate-400 truncate">{q?.name || item.name || item.category}</div>
                  </div>
                </Link>
                <div className="text-right shrink-0">
                  <div className="font-black text-slate-800 text-[14px] tabular-nums">{fmtPrice(q, item.category)}</div>
                  {typeof chg === "number" && (
                    <div className={`text-[12px] font-black tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}>
                      {up ? "+" : ""}{chg.toFixed(2)}%
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(item.symbol, item.category)}
                  className="p-1.5 text-slate-300 hover:text-rose-600 shrink-0"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Desktop / tablet: full table */}
        <div className="hidden sm:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse [&_th]:!p-2.5 [&_td]:!p-2.5 sm:[&_th]:!p-4 sm:[&_td]:!p-4">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Asset</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap hidden sm:table-cell">List</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-right">Price</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-right">Change</th>
                  <th className="p-3 text-xs font-bold text-rose-500 uppercase tracking-widest whitespace-nowrap text-center">SL</th>
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-center">R</th>
                  <th className="p-3 text-xs font-bold text-emerald-600 uppercase tracking-widest whitespace-nowrap text-center">T1</th>
                  <th className="p-3 text-xs font-bold text-emerald-600 uppercase tracking-widest whitespace-nowrap text-center">T2</th>
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Remarks</th>
                  <th className="p-3 text-xs font-bold text-indigo-600 uppercase tracking-widest whitespace-nowrap">Alert Trigger</th>
                  <th className="p-3 text-xs font-bold text-violet-600 uppercase tracking-widest whitespace-nowrap">Combo</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const q = quotes[item.symbol];
                  const chg = q?.changePct;
                  const up = typeof chg === "number" && chg >= 0;
                  return (
                    <tr key={`${item.symbol}-${item.category}-${idx}`} className={`border-b border-slate-100 transition ${item.color ? "" : "hover:bg-slate-50"} ${barClass(item.color)}`}>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <ColorDots value={item.color} onPick={(c) => setColor(item, c)} />
                          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-700">
                            {item.symbol.substring(0, 2)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{item.symbol}</div>
                            <div className="text-xs text-slate-500 max-w-[180px] truncate">
                              {q?.name || item.name || ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
                          <span className={`w-2 h-2 rounded-full ${CATEGORY_META[item.category]?.color || "bg-slate-400"}`} />
                          {item.category}
                        </span>
                        {item.subcategory && (
                          <span className="ml-1.5 inline-block text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                            {item.subcategory}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right tabular-nums font-bold text-slate-800">
                        {fmtPrice(q, item.category)}
                      </td>
                      <td className="p-4 text-right">
                        {typeof chg === "number" ? (
                          <span className={`font-bold text-sm ${up ? "text-emerald-600" : "text-rose-600"}`}>
                            {up ? "+" : ""}
                            {chg.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </td>
                      {(["sl", "r", "t1", "t2"] as const).map((f) => (
                        <td key={f} className="p-3 text-center">
                          <input value={item[f] || ""} onChange={(e) => updateWL(item, f, e.target.value)} placeholder="—"
                            className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-right text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-indigo-200" />
                        </td>
                      ))}
                      <td className="p-3">
                        <input value={item.remarks || ""} onChange={(e) => updateWL(item, "remarks", e.target.value)} placeholder="notes…"
                          className="w-full min-w-[8rem] px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[12px] outline-none focus:ring-2 focus:ring-indigo-200" />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-black text-slate-400">CMP</span>
                          <select value={item.condOp || ">"} onChange={(e) => updateWL(item, "condOp", e.target.value)}
                            className="px-1.5 py-1 bg-white border border-slate-200 rounded text-[13px] font-black outline-none focus:ring-2 focus:ring-indigo-200">
                            <option value=">">{">"}</option><option value=">=">{"≥"}</option><option value="<">{"<"}</option><option value="<=">{"≤"}</option><option value="=">{"="}</option>
                          </select>
                          <input type="number" value={item.condVal ?? ""} onChange={(e) => updateWL(item, "condVal", e.target.value)} placeholder="value"
                            className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-right text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-indigo-200" />
                          <select value={item.special || ""} onChange={(e) => updateWL(item, "special", e.target.value)}
                            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[12px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200">
                            <option value="">→ action</option>
                            <option value="Buy">Buy</option>
                            <option value="Sell">Sell</option>
                            <option value="Book profit">Book profit</option>
                            <option value="Add more">Add more</option>
                            <option value="Watch">Watch</option>
                          </select>
                        </div>
                        {item.condVal != null && String(item.condVal) !== "" && (
                          <div className="text-[10px] text-emerald-600 font-bold mt-0.5">🔔 alert on</div>
                        )}
                      </td>
                      <td className="p-3">
                        <select value={item.comboId || ""} onChange={(e) => updateWL(item, "comboId", e.target.value)}
                          title="Notify me when this stock matches a saved combination"
                          className={`max-w-[150px] px-2 py-1 border rounded text-[12px] font-bold outline-none focus:ring-2 focus:ring-violet-200 ${item.comboId ? "bg-violet-50 border-violet-300 text-violet-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                          <option value="">— attach —</option>
                          {combos.map((c) => <option key={c.id} value={c.id}>{c.label ? `${c.label} · ` : ""}{c.name}</option>)}
                        </select>
                        {item.comboId && !combos.some((c) => c.id === item.comboId) && (
                          <div className="text-[10px] text-rose-500 mt-0.5">combo deleted</div>
                        )}
                        {item.comboId && combos.some((c) => c.id === item.comboId) && (
                          <div className="text-[10px] text-violet-600 font-bold mt-0.5">🎯 watching</div>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/analyze?symbol=${item.symbol}`}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="Analyze"
                          >
                            <Activity className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleRemove(item.symbol, item.category)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Remove from this list"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <Link
                            href={`/stock/${item.symbol}`}
                            className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                            title="Full Detail"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="p-8 text-center text-slate-500 font-medium">
                {search
                  ? "No stocks match your filter."
                  : `No stocks in ${active} yet — use Quick Add to fill this list.`}
              </div>
            )}
          </div>
        </div>
        </>
      )}

      <p className="mt-4 text-[11px] text-slate-400 italic">
        Live prices via Yahoo Finance. Research support only. Not buy/sell advice. Always verify data independently.
      </p>
    </div>
  );
}
