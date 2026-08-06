// src/lib/storage.ts

// Helper for safely accessing localStorage
const isBrowser = typeof window !== "undefined";

const getParsedContext = <T>(key: string, defaultValue: T): T => {
  if (!isBrowser) return defaultValue;
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`Error reading ${key} from localStorage`, error);
    return defaultValue;
  }
};

/**
 * Returns false when the write did not land — almost always because
 * localStorage is full. Callers that store large payloads MUST check this;
 * swallowing the failure leaves the UI showing data that no longer exists on
 * disk, which reappears as "my document vanished" after a reload.
 */
const setContext = <T>(key: string, value: T): boolean => {
  if (!isBrowser) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Error writing ${key} to localStorage`, error);
    return false;
  }
};

export const isQuotaError = (e: unknown): boolean => {
  const name = (e as any)?.name || "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
};

// WATCHLIST
// Categories let one watchlist hold several distinct lists (Indian, US,
// MarketSmith, Market Mojo, MF Accumulation). A stock may appear in more than
// one category, so items are de-duplicated by symbol + category.
export const WATCHLIST_CATEGORIES = [
  "Indian Stocks",
  "US Stocks",
  "Commodities",
  "Crypto",
  "Custom",
] as const;
export type WatchlistCategory = (typeof WATCHLIST_CATEGORIES)[number];

// Every category starts with these two horizon sub-lists; users can add more.
export const DEFAULT_SUBCATS = ["ST", "MT"] as const;
export const SUBCAT_TITLES: Record<string, string> = {
  ST: "Short term",
  MT: "Medium term",
};

// Guess the natural category from the symbol (used when none is supplied, e.g.
// the "Add to Watchlist" button on the analyze page).
export const inferCategory = (symbol: string): WatchlistCategory => {
  const s = String(symbol || "").toUpperCase();
  if (s.endsWith(".NS") || s.endsWith(".BO")) return "Indian Stocks";
  if (s.endsWith("-USD")) return "Crypto";
  if (s.endsWith("=F")) return "Commodities";
  return "US Stocks";
};

export const getWatchlist = () => {
  // Backfill a category for any legacy item saved before categories existed.
  const list = getParsedContext<any[]>("sa_watchlist", []);
  return list.map((s: any) =>
    s.category ? s : { ...s, category: inferCategory(s.symbol) },
  );
};

export const saveToWatchlist = (stock: any) => {
  const current = getWatchlist();
  const category: WatchlistCategory = stock.category || inferCategory(stock.symbol);
  const existingIndex = current.findIndex(
    (s: any) => s.symbol === stock.symbol && s.category === category,
  );
  if (existingIndex >= 0) {
    current[existingIndex] = {
      ...current[existingIndex],
      ...stock,
      category,
      updatedAt: Date.now(),
    };
  } else {
    current.push({ ...stock, category, addedAt: Date.now(), updatedAt: Date.now() });
  }
  setContext("sa_watchlist", current);
};

// Remove one specific card. When category is omitted, remove every copy of the
// symbol (preserves the old single-argument behaviour).
export const removeFromWatchlist = (symbol: string, category?: string) => {
  setContext(
    "sa_watchlist",
    getWatchlist().filter((s: any) =>
      category ? !(s.symbol === symbol && s.category === category) : s.symbol !== symbol,
    ),
  );
};

export const isInWatchlist = (symbol: string) => {
  return getWatchlist().some((s: any) => s.symbol === symbol);
};

// Add several symbols to one category (+ optional sub-list) in one pass.
export const bulkAddToWatchlist = (
  symbols: string[],
  category: WatchlistCategory,
  subcategory = "",
) => {
  symbols
    .map((s) => String(s || "").trim().toUpperCase())
    .filter(Boolean)
    .forEach((symbol) => saveToWatchlist({ symbol, category, subcategory }));
  if (subcategory) addWatchlistSubcat(category, subcategory);
};

// CUSTOM MARKET SYMBOLS — the user's own indices/stocks for the Markets page.
// The old flat list is still read (as the "custom" group) so nothing is lost.
export const getCustomMarketSymbols = () =>
  getParsedContext<{ symbol: string; label: string }[]>("sa_custom_markets", []);
export const addCustomMarketSymbol = (symbol: string, label?: string) => {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) return;
  const list = getCustomMarketSymbols();
  if (list.some((x) => x.symbol === sym)) return;
  setContext("sa_custom_markets", [...list, { symbol: sym, label: label || sym }]);
};
export const removeCustomMarketSymbol = (symbol: string) =>
  setContext(
    "sa_custom_markets",
    getCustomMarketSymbols().filter((x) => x.symbol !== symbol),
  );

// Per-tab custom symbols — the user can add their own into ANY market group
// (Indian, US, Global, …), kept separate per group.
export const getCustomMarketByGroup = () =>
  getParsedContext<Record<string, { symbol: string; label: string }[]>>("sa_custom_markets_by_group", {});
export const getCustomMarketForGroup = (group: string) => getCustomMarketByGroup()[group] || [];
export const addCustomMarketToGroup = (group: string, symbol: string, label?: string) => {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym || !group) return;
  const all = getCustomMarketByGroup();
  const list = all[group] || [];
  if (list.some((x) => x.symbol === sym)) return;
  all[group] = [...list, { symbol: sym, label: label || sym }];
  setContext("sa_custom_markets_by_group", all);
};
export const removeCustomMarketFromGroup = (group: string, symbol: string) => {
  const all = getCustomMarketByGroup();
  all[group] = (all[group] || []).filter((x) => x.symbol !== symbol);
  setContext("sa_custom_markets_by_group", all);
};

// SUB-LISTS — user-defined folders inside each category (e.g. under "US Stocks":
// Tech, Growth, Dividend). Stored per category so empty sub-lists still show.
export const getWatchlistSubcats = () =>
  getParsedContext<Record<string, string[]>>("sa_watchlist_subcats", {});
export const addWatchlistSubcat = (category: string, name: string) => {
  const n = name.trim();
  if (!n) return;
  const all = getWatchlistSubcats();
  const list = all[category] || [];
  if (!list.some((x) => x.toLowerCase() === n.toLowerCase())) {
    all[category] = [...list, n];
    setContext("sa_watchlist_subcats", all);
  }
};
export const removeWatchlistSubcat = (category: string, name: string) => {
  const all = getWatchlistSubcats();
  all[category] = (all[category] || []).filter((x) => x !== name);
  setContext("sa_watchlist_subcats", all);
  // untag any stocks that were in this sub-list (they stay in the category)
  const wl = getWatchlist().map((s: any) =>
    s.category === category && s.subcategory === name ? { ...s, subcategory: "" } : s,
  );
  setContext("sa_watchlist", wl);
};

// REPORTS
export const getReports = () => getParsedContext<any[]>("sa_reports", []);
export const saveReport = (report: any) => {
  const current = getReports();
  const existingIndex = current.findIndex(
    (r: any) => r.symbol === report.symbol && r.id === report.id,
  );
  if (existingIndex >= 0) {
    current[existingIndex] = { ...report, savedAt: Date.now() };
  } else {
    current.push({ ...report, id: Date.now().toString(), savedAt: Date.now() });
  }
  setContext("sa_reports", current);
};
export const deleteReport = (id: string) => {
  setContext(
    "sa_reports",
    getReports().filter((r: any) => r.id !== id),
  );
};

// ALERTS
export const getAlerts = () => getParsedContext<any[]>("sa_alerts", []);
export const saveAlert = (alert: any) => {
  const current = getAlerts();
  if (alert.id) {
    const existingIndex = current.findIndex((a: any) => a.id === alert.id);
    if (existingIndex >= 0) {
      current[existingIndex] = { ...alert, updatedAt: Date.now() };
    } else {
      current.push(alert);
    }
  } else {
    current.push({
      ...alert,
      id: Date.now().toString(),
      createdAt: Date.now(),
      status: "active",
    });
  }
  setContext("sa_alerts", current);
};
export const deleteAlert = (id: string) => {
  setContext(
    "sa_alerts",
    getAlerts().filter((a: any) => a.id !== id),
  );
};

// PRICE-LEVEL ALERTS
// A watch on one stock with the user's own levels (stop-loss, supports,
// resistances, target). A background monitor notifies when the live price
// reaches any level. These reflect the user's OWN plan — never buy/sell advice.
export type AlertLevelKey = "sl" | "s1" | "r1" | "r2" | "target";
export interface PriceAlert {
  id: string;
  symbol: string;
  name?: string;
  refPrice?: number | null; // CMP when the alert was created
  levels: Partial<Record<AlertLevelKey, number | null>>;
  triggered: Partial<Record<AlertLevelKey, boolean>>;
  fromPortfolio?: boolean;
  // Custom condition alert, e.g. price > 160. Fires once when the condition
  // first becomes true (re-armable).
  condition?: { metric: "price" | "changePct"; op: ">" | "<" | ">=" | "<="; value: number };
  conditionTriggered?: boolean;
  createdAt: number;
  updatedAt?: number;
  status: "active" | "paused";
}
export const getPriceAlerts = (): PriceAlert[] =>
  getParsedContext<PriceAlert[]>("sa_price_alerts", []);
export const savePriceAlert = (alert: Partial<PriceAlert>) => {
  const current = getPriceAlerts();
  if (alert.id) {
    const i = current.findIndex((a) => a.id === alert.id);
    // Stamp updatedAt so cross-device sync keeps the newer edit (createdAt alone
    // never changes, which would let a stale copy win on merge).
    if (i >= 0) current[i] = { ...current[i], ...alert, updatedAt: Date.now() } as PriceAlert;
    else current.push({ ...alert, updatedAt: Date.now() } as PriceAlert);
  } else {
    current.push({
      symbol: "",
      levels: {},
      triggered: {},
      status: "active",
      ...alert,
      id: Date.now().toString(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as PriceAlert);
  }
  setContext("sa_price_alerts", current);
};
export const deletePriceAlert = (id: string) => {
  setContext(
    "sa_price_alerts",
    getPriceAlerts().filter((a) => a.id !== id),
  );
};
export const updatePriceAlert = (id: string, patch: Partial<PriceAlert>) => {
  const current = getPriceAlerts();
  const i = current.findIndex((a) => a.id === id);
  if (i >= 0) {
    current[i] = { ...current[i], ...patch, updatedAt: Date.now() };
    setContext("sa_price_alerts", current);
  }
};

// PORTFOLIO
// Holdings are grouped by market so US ($) and Indian (₹) positions total up
// separately with the right currency.
export const PORTFOLIO_MARKETS = ["US Stocks", "Indian Stocks"] as const;
export type PortfolioMarket = (typeof PORTFOLIO_MARKETS)[number];

export const inferPortfolioMarket = (symbol: string): PortfolioMarket => {
  const s = String(symbol || "").toUpperCase();
  return s.endsWith(".NS") || s.endsWith(".BO") ? "Indian Stocks" : "US Stocks";
};

export const getPortfolio = () => {
  const list = getParsedContext<any[]>("sa_portfolio", []);
  // Backfill market for legacy holdings saved before markets existed.
  return list.map((h: any) =>
    h.market ? h : { ...h, market: inferPortfolioMarket(h.symbol) },
  );
};
export const savePortfolioHolding = (holding: any) => {
  const current = getPortfolio();
  if (holding.id) {
    const existingIndex = current.findIndex((h: any) => h.id === holding.id);
    if (existingIndex >= 0) {
      current[existingIndex] = { ...holding, updatedAt: Date.now() };
    } else {
      current.push(holding);
    }
  } else {
    current.push({
      ...holding,
      id: Date.now().toString(),
      addedAt: Date.now(),
    });
  }
  setContext("sa_portfolio", current);
};
export const deletePortfolioHolding = (id: string) => {
  setContext(
    "sa_portfolio",
    getPortfolio().filter((h: any) => h.id !== id),
  );
};

// Bulk import (from an Excel/CSV sheet). Each holding needs a unique id, so we
// stamp them with an index to avoid same-millisecond collisions.
export const bulkAddHoldings = (holdings: any[]) => {
  const current = getPortfolio();
  const base = Date.now();
  holdings.forEach((h, i) => {
    current.push({ ...h, id: `${base}-${i}`, addedAt: base });
  });
  setContext("sa_portfolio", current);
};

// Replace all holdings of one market with the imported set (keeps the other
// market untouched).
export const replaceMarketHoldings = (
  market: PortfolioMarket,
  holdings: any[],
) => {
  const others = getPortfolio().filter((h: any) => h.market !== market);
  const base = Date.now();
  const fresh = holdings.map((h, i) => ({
    ...h,
    market,
    id: `${base}-${i}`,
    addedAt: base,
  }));
  setContext("sa_portfolio", [...others, ...fresh]);
};

// Overwrite ONLY the markets present in the imported set (each holding keeps
// its own market). Markets not in the import are left untouched — so importing
// a mixed US+Indian file replaces both, but an all-US file leaves Indian alone.
export const replaceHoldingsForMarkets = (holdings: any[]) => {
  const markets = new Set(holdings.map((h: any) => h.market));
  const others = getPortfolio().filter((h: any) => !markets.has(h.market));
  const base = Date.now();
  const fresh = holdings.map((h, i) => ({ ...h, id: `${base}-${i}`, addedAt: base }));
  setContext("sa_portfolio", [...others, ...fresh]);
};

// EXCEL SHEETS
// An imported workbook. Each imported Excel/CSV sheet is stored as one "sheet"
// (like a tab). A workbook file can contain several sheets at once.
export type SheetRow = {
  sNo: number;
  stockName: string;
  symbol: string; // best-effort ticker for live lookups ("" if unknown)
  qty: number | null;
  price: number | null;
  marketValue: number | null;
  ltp?: number | null; // live price, filled on demand
  plValue?: number | null; // (ltp - price) * qty
  plPct?: number | null; // (ltp - price) / price * 100
  customName?: string; // user's own edited name (overrides stockName in the UI)
  details?: string; // free notes the user adds per row
  tags?: string[]; // user labels
  raw?: Record<string, any>; // original row, nothing is lost
};
export type ExcelSheet = {
  id: string;
  name: string;
  sourceFile?: string;
  rows: SheetRow[];
  importedAt: number;
};

export const getSheets = () => getParsedContext<ExcelSheet[]>("sa_excel_sheets", []);

const persistSheets = (sheets: ExcelSheet[]) => setContext("sa_excel_sheets", sheets);

// Replace ALL stored sheets with the imported ones.
export const overwriteSheets = (sheets: ExcelSheet[]) => persistSheets(sheets);

// Append imported sheets alongside the existing ones (names de-duplicated).
export const appendSheets = (sheets: ExcelSheet[]) => {
  const current = getSheets();
  const names = new Set(current.map((s) => s.name.toLowerCase()));
  const added = sheets.map((s) => {
    let name = s.name;
    let n = 2;
    while (names.has(name.toLowerCase())) name = `${s.name} (${n++})`;
    names.add(name.toLowerCase());
    return { ...s, name };
  });
  persistSheets([...current, ...added]);
};

export const updateSheet = (id: string, patch: Partial<ExcelSheet>) => {
  persistSheets(getSheets().map((s) => (s.id === id ? { ...s, ...patch } : s)));
};

export const deleteSheet = (id: string) => {
  persistSheets(getSheets().filter((s) => s.id !== id));
};

// DAILY DIGEST
// Last-run digest results + which symbols the user tracks. Persisted so
// re-opening shows the previous digest with its timestamp.
export const getDigestResult = () =>
  getParsedContext<any | null>("sa_daily_digest", null);
export const saveDigestResult = (result: any) => setContext("sa_daily_digest", result);

export const getDigestSelection = () =>
  getParsedContext<string[]>("sa_digest_selection", []);
export const saveDigestSelection = (symbols: string[]) =>
  setContext("sa_digest_selection", symbols);

// AI USAGE — log every AI-powered action (feature + provider + time) so the
// AI Usage page can show daily consumption and where it was spent. Capped so
// localStorage never bloats.
export const getAiUsage = () => getParsedContext<any[]>("sa_ai_usage", []);
// Optional per-provider monthly budget (USD) the user sets, for a used-vs-budget bar.
export const getAiBudgets = () => getParsedContext<Record<string, number>>("sa_ai_budgets", {});
export const saveAiBudgets = (b: Record<string, number>) => setContext("sa_ai_budgets", b);
// Balance the user loaded on each paid provider (USD). Providers don't expose
// remaining balance via API, so we let the user enter it once and subtract the
// app's tracked spend to estimate what's left.
export const getAiBalances = () => getParsedContext<Record<string, number>>("sa_ai_balances", {});
export const saveAiBalances = (b: Record<string, number>) => setContext("sa_ai_balances", b);
export const logAiUsage = (feature: string, provider: string, tokens = 0) => {
  if (!isBrowser) return;
  const list = getAiUsage();
  list.push({ feature, provider, tokens: Number(tokens) || 0, at: Date.now() });
  // keep the most recent 2000 events
  setContext("sa_ai_usage", list.slice(-2000));
};

/**
 * Log usage from a route's real per-provider breakdown.
 *
 * Prefer this over logAiUsage(). The AI client falls back across providers when
 * one is rate-limited or down, so naming the provider at the call site records
 * whichever one the caller *expected* — not the one that actually answered and
 * actually billed. `byProvider` comes from the server's own token accounting,
 * so a request Groq refused and Gemini served is recorded against Gemini.
 */
export const logAiUsageDetailed = (
  feature: string,
  usage?: { tokens?: number; byProvider?: Record<string, number> } | null,
  fallbackProvider?: string,
) => {
  if (!isBrowser || !usage) return;
  const entries = Object.entries(usage.byProvider || {}).filter(([, t]) => Number(t) > 0);
  if (entries.length) {
    const list = getAiUsage();
    const at = Date.now();
    for (const [provider, tokens] of entries) {
      list.push({ feature, provider, tokens: Number(tokens) || 0, at });
    }
    setContext("sa_ai_usage", list.slice(-2000));
    return;
  }
  // No breakdown (older route, or a provider that reports no token counts) —
  // record the total rather than dropping the event entirely.
  if (usage.tokens) logAiUsage(feature, fallbackProvider || "Unknown", usage.tokens);
};

// TREND ALERTS — moving-average-stack trend monitoring.
// Config: which symbols to watch + which alert types are on.
// States: the last-seen trend snapshot per symbol, so a re-scan can detect
// changes and fire notifications only when something actually changed.
export const DEFAULT_TREND_ALERTS = {
  perfectUp: true,
  perfectDown: true,
  trendUp: false,
  trendDown: true,
  goldenCross: true,
  deathCross: true,
  reclaim200: true,
  lost200: true,
};
export const getTrendConfig = () =>
  getParsedContext<any>("sa_trend_config", { symbols: [] as string[], alerts: DEFAULT_TREND_ALERTS });
export const saveTrendConfig = (cfg: any) => setContext("sa_trend_config", cfg);

// Per-symbol: the last daily bar we already alerted on (dedup key) so the same
// bar's events never fire twice, no matter how often you re-scan.
export const getTrendStates = () => getParsedContext<Record<string, any>>("sa_trend_states", {});
export const saveTrendStates = (states: Record<string, any>) => setContext("sa_trend_states", states);

// A rolling log of trend alerts that actually fired (newest first).
export const getTrendHistory = () => getParsedContext<any[]>("sa_trend_history", []);
export const logTrendAlert = (entry: { symbol: string; message: string; kind: string }) => {
  const list = getTrendHistory();
  list.unshift({ ...entry, at: Date.now() });
  setContext("sa_trend_history", list.slice(0, 200));
};
export const clearTrendHistory = () => setContext("sa_trend_history", []);

// LAST ANALYSIS — cache the most recent Analyze Stock result so navigating away
// and back restores it instantly instead of forcing a full re-analysis.
export const getLastAnalysis = () =>
  getParsedContext<any | null>("sa_last_analysis", null);
export const saveLastAnalysis = (payload: any) =>
  setContext("sa_last_analysis", payload);
export const getLastAnalysisTab = () =>
  getParsedContext<string>("sa_last_analysis_tab", "overview");
export const saveLastAnalysisTab = (tab: string) =>
  setContext("sa_last_analysis_tab", tab);

// SETTINGS
export const getSettings = () =>
  getParsedContext<any>("sa_settings", {
    market: "US",
    timeframe: "1Y",
    depth: "Standard",
    profile: "Short-term Investor",
    riskTolerance: "Moderate",
    theme: "light",
    profileName: "",
    profilePhoto: "",
    notifications: true,
    autoSave: false,
    alertEmail: "",
  });
export const saveSettings = (settings: any) => {
  setContext("sa_settings", { ...getSettings(), ...settings });
};

// RECENT SEARCHES
export const getRecentSearches = () =>
  getParsedContext<any[]>("sa_recent_searches", []);
export const saveRecentSearch = (stock: any) => {
  let current = getRecentSearches();
  current = current.filter((s: any) => s.symbol !== stock.symbol);
  current.unshift({ ...stock, searchedAt: Date.now() });
  if (current.length > 10) current = current.slice(0, 10);
  setContext("sa_recent_searches", current);
};

// 15-DAY MOMENTUM WATCH
// One baseline snapshot per symbol; used to compare current vs start.
export const getAllMomentumWatches = () =>
  getParsedContext<any[]>("sa_momentum_watches", []);
export const getMomentumWatch = (symbol: string) =>
  getAllMomentumWatches().find((w: any) => w.symbol === symbol) || null;
export const saveMomentumWatch = (watch: any) => {
  const current = getAllMomentumWatches();
  const idx = current.findIndex((w: any) => w.symbol === watch.symbol);
  if (idx >= 0) {
    current[idx] = { ...watch, updatedAt: Date.now() };
  } else {
    current.push({ ...watch, createdAt: Date.now(), updatedAt: Date.now() });
  }
  setContext("sa_momentum_watches", current);
};
export const removeMomentumWatch = (symbol: string) => {
  setContext(
    "sa_momentum_watches",
    getAllMomentumWatches().filter((w: any) => w.symbol !== symbol),
  );
};

// IMPORTED REPORTS — permanently enrich a stock with third-party data
// One latest report per symbol: { symbol, company, source, asOf, imported, ourData, freshness, comparison, savedAt }
export const getAllImportedReports = () => getParsedContext<any[]>("sa_imported_reports", []);
export const getImportedReport = (symbol: string) =>
  getAllImportedReports().find((r: any) => r.symbol === symbol) || null;
export const saveImportedReport = (report: any) => {
  if (!report?.symbol) return;
  const current = getAllImportedReports();
  const idx = current.findIndex((r: any) => r.symbol === report.symbol);
  const entry = { ...report, savedAt: Date.now() };
  if (idx >= 0) current[idx] = entry;
  else current.push(entry);
  setContext("sa_imported_reports", current);
};
export const deleteImportedReport = (symbol: string) => {
  setContext(
    "sa_imported_reports",
    getAllImportedReports().filter((r: any) => r.symbol !== symbol),
  );
};

// STOCK NOTES (text + voice) — master notes store
// Each note: { id, symbol, stockName, type:'text'|'voice', text?, audio?(dataURL), durationSec?, createdAt }
export const getNotes = () => getParsedContext<any[]>("sa_notes", []);
export const getNotesForSymbol = (symbol: string) =>
  getNotes()
    .filter((n: any) => n.symbol === symbol)
    .sort((a: any, b: any) => b.createdAt - a.createdAt);
export const saveNote = (note: any) => {
  const current = getNotes();
  current.push({
    ...note,
    id: note.id || Date.now().toString() + Math.random().toString(36).slice(2, 6),
    createdAt: note.createdAt || Date.now(),
  });
  setContext("sa_notes", current);
};
export const deleteNote = (id: string) => {
  setContext(
    "sa_notes",
    getNotes().filter((n: any) => n.id !== id),
  );
};
// Master view: grouped by symbol, newest note first within each group.
export const getNotesGrouped = () => {
  const all = getNotes();
  const map: Record<string, any> = {};
  for (const n of all) {
    if (!map[n.symbol]) map[n.symbol] = { symbol: n.symbol, stockName: n.stockName || n.symbol, notes: [], lastAt: 0 };
    map[n.symbol].notes.push(n);
    if (n.createdAt > map[n.symbol].lastAt) map[n.symbol].lastAt = n.createdAt;
  }
  return Object.values(map)
    .map((g: any) => ({ ...g, notes: g.notes.sort((a: any, b: any) => b.createdAt - a.createdAt) }))
    .sort((a: any, b: any) => b.lastAt - a.lastAt);
};

// TRADING JOURNAL
// A dated diary of trades, ideas, lessons and reviews. Kept locally (and synced
// like every other sa_* store). Not advice — the user's own record.
export type JournalEntry = {
  id: string;
  date: string; // YYYY-MM-DD the entry is about
  symbol?: string;
  title: string;
  text: string;
  tag?: string; // Trade | Idea | Lesson | Review | Mistake
  market?: string; // General | Indian Market | US Market | Global
  outcome?: string; // free text e.g. "+2,400" or "SL hit"
  createdAt: number;
  updatedAt?: number;
};
export const JOURNAL_TAGS = ["Trade", "Idea", "Lesson", "Review", "Mistake"] as const;
export const JOURNAL_MARKETS = ["General", "Indian Market", "US Market", "Global"] as const;

export const getJournal = (): JournalEntry[] =>
  getParsedContext<JournalEntry[]>("sa_journal", []);

export const saveJournalEntry = (entry: Partial<JournalEntry>) => {
  const current = getJournal();
  if (entry.id) {
    const i = current.findIndex((e) => e.id === entry.id);
    if (i >= 0) current[i] = { ...current[i], ...entry, updatedAt: Date.now() } as JournalEntry;
    else current.push({ ...entry, updatedAt: Date.now() } as JournalEntry);
  } else {
    current.push({
      title: "",
      text: "",
      date: new Date().toISOString().slice(0, 10),
      ...entry,
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as JournalEntry);
  }
  setContext("sa_journal", current);
};

export const deleteJournalEntry = (id: string) =>
  setContext("sa_journal", getJournal().filter((e) => e.id !== id));

// AI ASSISTANT — unified research chat (general + stock-grounded + document Q&A).
// ChatGPT-style multi-conversation store. Each thread can carry attached
// documents and/or a stock context so follow-ups stay grounded.
export type AssistantMsg = { role: "user" | "ai"; content: string; at: number };
export type AssistantDoc = { name: string; text: string; chars: number };
export type AssistantChat = {
  id: string;
  title: string;
  messages: AssistantMsg[];
  docs?: AssistantDoc[];
  stockSymbol?: string;
  instructions?: string; // per-chat custom prompt / persona
  projectId?: string; // grouping
  provider?: string; // chosen AI model: auto | openai | claude | gemini | groq
  createdAt: number;
  updatedAt: number;
};
export const getAssistantChats = (): AssistantChat[] =>
  getParsedContext<AssistantChat[]>("sa_assistant_chats", []);
export const saveAssistantChat = (chat: AssistantChat) => {
  const all = getAssistantChats();
  const i = all.findIndex((c) => c.id === chat.id);
  const next = { ...chat, updatedAt: Date.now() };
  if (i >= 0) all[i] = next;
  else all.unshift(next);
  setContext("sa_assistant_chats", all.slice(0, 100));
};
export const deleteAssistantChat = (id: string) =>
  setContext("sa_assistant_chats", getAssistantChats().filter((c) => c.id !== id));

// A Project groups conversations and shares documents + custom instructions
// across them (like ChatGPT/Claude projects).
export type AssistantProject = {
  id: string;
  name: string;
  instructions?: string;
  docs?: AssistantDoc[];
  createdAt: number;
  updatedAt: number;
};
export const getAssistantProjects = (): AssistantProject[] =>
  getParsedContext<AssistantProject[]>("sa_assistant_projects", []);
export const saveAssistantProject = (p: AssistantProject) => {
  const all = getAssistantProjects();
  const i = all.findIndex((x) => x.id === p.id);
  const next = { ...p, updatedAt: Date.now() };
  if (i >= 0) all[i] = next;
  else all.unshift(next);
  setContext("sa_assistant_projects", all.slice(0, 50));
};
export const deleteAssistantProject = (id: string) => {
  setContext("sa_assistant_projects", getAssistantProjects().filter((p) => p.id !== id));
  // Detach chats from the deleted project (keep the chats).
  const chats = getAssistantChats().map((c) => (c.projectId === id ? { ...c, projectId: undefined } : c));
  setContext("sa_assistant_chats", chats);
};

// "Train the AI" — persistent memory applied to EVERY conversation:
// a global persona/instructions the user sets, plus taught facts/corrections.
export type AssistantLesson = { id: string; text: string; createdAt: number };
export type AssistantTraining = { globalInstructions: string; lessons: AssistantLesson[] };
export const getAssistantTraining = (): AssistantTraining =>
  getParsedContext<AssistantTraining>("sa_assistant_training", { globalInstructions: "", lessons: [] });
export const saveAssistantTraining = (t: AssistantTraining) => setContext("sa_assistant_training", t);
export const addAssistantLesson = (text: string) => {
  const t = getAssistantTraining();
  t.lessons = [{ id: Date.now().toString() + Math.random().toString(36).slice(2, 6), text: text.trim(), createdAt: Date.now() }, ...(t.lessons || [])].slice(0, 200);
  saveAssistantTraining(t);
  return t;
};
export const removeAssistantLesson = (id: string) => {
  const t = getAssistantTraining();
  t.lessons = (t.lessons || []).filter((l) => l.id !== id);
  saveAssistantTraining(t);
  return t;
};

// MARKET MANUAL TREND MARKS — the user's own uptrend/downtrend/sideways tag per
// symbol on the Markets page (separate from the auto "AI Trend").
export const getMarketMarks = (): Record<string, string> =>
  getParsedContext<Record<string, string>>("sa_market_marks", {});
export const setMarketMark = (symbol: string, mark: string) => {
  const all = getMarketMarks();
  const key = String(symbol || "").toUpperCase();
  if (mark) all[key] = mark;
  else delete all[key];
  setContext("sa_market_marks", all);
};

// Per-symbol trade-plan levels (SL / R / T1 / T2) on the Markets page.
export const getMarketPlans = (): Record<string, Record<string, string>> =>
  getParsedContext<Record<string, Record<string, string>>>("sa_market_plans", {});
export const setMarketPlanField = (symbol: string, field: string, value: string) => {
  const all = getMarketPlans();
  const key = String(symbol || "").toUpperCase();
  all[key] = { ...(all[key] || {}), [field]: value };
  setContext("sa_market_plans", all);
};

// COMBINATION SCREENER — user-built sets of technical conditions.
export type ScreenConditions = {
  maStack?: boolean;
  stackLevels?: string[]; // which levels form the stack, e.g. ["price","10","20","50"]
  above200?: boolean;
  golden?: boolean;
  adx?: boolean;
  adxMin?: number;
  rsiStrong?: boolean;
  rsiMin?: number;
  nearHigh?: boolean;
  nearPct?: number;
  near52wLow?: boolean;
  nearLowPct?: number;
  atAth?: boolean;
  atAtl?: boolean;
  nearSupport?: boolean;
  supportPct?: number;
  nearResistance?: boolean;
  resistancePct?: number;
  earningsUp?: boolean;
  priceRule?: boolean;
  priceOp?: ">" | "<";
  priceVal?: number;
  // "Design your own" custom rules: each compares a metric to a value or another
  // metric, combined with AND/OR.
  rules?: {
    id: string;
    left: string;
    op: ">" | ">=" | "<" | "<=" | "=";
    rightType: "value" | "metric";
    rightVal?: number;
    rightMetric?: string;
    join?: "and" | "or";
  }[];
};
export type Combination = {
  id: string;
  name: string;
  label?: string;
  conditions: ScreenConditions;
  createdAt: number;
  updatedAt: number;
};
export const getCombinations = (): Combination[] =>
  getParsedContext<Combination[]>("sa_combinations", []);
export const saveCombination = (c: Combination) => {
  const all = getCombinations();
  const i = all.findIndex((x) => x.id === c.id);
  const next = { ...c, updatedAt: Date.now() };
  if (i >= 0) all[i] = next;
  else all.unshift(next);
  setContext("sa_combinations", all.slice(0, 50));
};
export const deleteCombination = (id: string) =>
  setContext("sa_combinations", getCombinations().filter((c) => c.id !== id));

// NOTIFICATIONS
export const getNotifications = () =>
  getParsedContext<any[]>("sa_notifications", []);
export const addNotification = (notification: any) => {
  let current = getNotifications();
  current.unshift({
    ...notification,
    // Random suffix so several notifications fired in the same millisecond
    // (e.g. two levels crossing at once) never collide on id.
    id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
    createdAt: Date.now(),
    read: false,
  });
  if (current.length > 50) current = current.slice(0, 50);
  setContext("sa_notifications", current);
};
export const markNotificationRead = (id: string) => {
  const current = getNotifications();
  const index = current.findIndex((n: any) => n.id === id);
  if (index >= 0) {
    current[index].read = true;
    setContext("sa_notifications", current);
  }
};
export const clearAllNotifications = () => {
  setContext("sa_notifications", []);
};

// ---------------------------------------------------------------------------
// RESEARCH DASHBOARD
// A project = uploaded document text + its analysis + the multi-AI verification.
// Kept locally so source documents never leave the machine except for the
// analysis calls the user explicitly triggers.
// ---------------------------------------------------------------------------
export type ResearchProject = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  focus: string;
  docs: { name: string; kind: string; chars: number; words: number; pages: number | null; text: string }[];
  /** Every analysis run, newest last. Runs are never overwritten. */
  versions: any[];
  /** Grounded Q&A threads over the same documents, oldest first. */
  chats: any[];
  activeChatId?: string;
  aiTokens: number;
  /** Version ids currently ticked for comparison. */
  compareIds?: string[];

  // --- legacy single-run fields, kept so older saved projects still open ---
  analysis?: any | null;
  analysedBy?: string | null;
  verification?: any | null;
  verifiedAt?: number | null;
};

/**
 * Projects saved before versioning held one analysis directly on the project.
 * Lift that into version 1 so nothing a user already ran disappears.
 */
export const migrateResearchProject = (p: any): ResearchProject => {
  const versions = Array.isArray(p?.versions) ? p.versions : [];
  if (!versions.length && p?.analysis) {
    versions.push({
      id: `v_${p.createdAt || Date.now()}`,
      version: 1,
      label: "Version 1",
      docNames: (p.docs || []).map((d: any) => d.name),
      provider: p.analysedBy || "openai",
      focus: p.focus || "",
      createdAt: p.verifiedAt || p.updatedAt || p.createdAt || Date.now(),
      analysis: p.analysis,
      verification: p.verification || null,
      aiTokens: p.aiTokens || 0,
    });
  }
  // Projects saved before threads held one flat message array — lift it into
  // the first thread so no conversation is lost.
  let chats = Array.isArray(p?.chats) ? p.chats : [];
  if (!chats.length && Array.isArray(p?.chat) && p.chat.length) {
    chats = [{
      id: `c_${p.createdAt || Date.now()}`,
      title: String(p.chat[0]?.content || "Chat").slice(0, 60),
      messages: p.chat,
      createdAt: p.createdAt || Date.now(),
      updatedAt: p.updatedAt || Date.now(),
    }];
  }

  return {
    ...p,
    versions,
    chats,
    activeChatId: p?.activeChatId || chats[chats.length - 1]?.id || "",
    compareIds: Array.isArray(p?.compareIds) ? p.compareIds : [],
    aiTokens: p?.aiTokens || 0,
  };
};

export const getResearchProjects = (): ResearchProject[] =>
  getParsedContext<any[]>("sa_research_projects", []).map(migrateResearchProject);

export type SaveResult = { ok: boolean; pruned: string[] };

/**
 * Research projects carry full document text, so a couple of large PDFs can
 * exceed the localStorage quota on their own. Rather than failing silently,
 * shed the least valuable data — oldest projects, then their chat, then their
 * document text — and report exactly what was dropped.
 *
 * The project being saved is never pruned; it is what the user is looking at.
 */
export const saveResearchProject = (project: ResearchProject): SaveResult => {
  const all = getResearchProjects();
  const i = all.findIndex((p) => p.id === project.id);
  const next = { ...project, updatedAt: Date.now() };
  if (i >= 0) all[i] = next;
  else all.unshift(next);

  let list = all.slice(0, 20);
  const pruned: string[] = [];

  if (setContext("sa_research_projects", list)) return { ok: true, pruned };

  // 1. Drop chat history from other projects.
  list = list.map((p) => (p.id === next.id ? p : { ...p, chats: [], chat: [] }));
  if (setContext("sa_research_projects", list)) {
    pruned.push("chat history in older projects");
    return { ok: true, pruned };
  }

  // 2. Drop document text from other projects (metadata stays, so the user can
  //    see what was there and re-upload).
  list = list.map((p) =>
    p.id === next.id ? p : { ...p, docs: (p.docs || []).map((d: any) => ({ ...d, text: "" })) },
  );
  if (setContext("sa_research_projects", list)) {
    pruned.push("document text in older projects");
    return { ok: true, pruned };
  }

  // 3. Drop older projects entirely, newest-first, until it fits.
  const others = list.filter((p) => p.id !== next.id);
  for (let keep = others.length - 1; keep >= 0; keep--) {
    const trimmed = [next, ...others.slice(0, keep)];
    if (setContext("sa_research_projects", trimmed)) {
      pruned.push(`${others.length - keep} older project${others.length - keep === 1 ? "" : "s"}`);
      return { ok: true, pruned };
    }
  }

  // Nothing left to shed — this single project is too big for the browser.
  return { ok: false, pruned };
};

export const deleteResearchProject = (id: string) => {
  setContext("sa_research_projects", getResearchProjects().filter((p) => p.id !== id));
};

export const getActiveResearchId = () => getParsedContext<string>("sa_research_active", "");
export const setActiveResearchId = (id: string) => setContext("sa_research_active", id);

// ---------------------------------------------------------------------------
// PROMPT LIBRARY
// Reusable prompts organised by category -> sub-category, written by hand or
// imported in bulk. Stored locally; nothing is uploaded.
// ---------------------------------------------------------------------------
export type SavedPrompt = {
  id: string;
  title: string;
  body: string;
  category: string;
  subcategory: string;
  tags: string[];
  favorite: boolean;
  useCount: number;
  createdAt: number;
  updatedAt: number;
};

/** Seed structure — users can add their own categories on top of these. */
export const PROMPT_CATEGORIES: Record<string, string[]> = {
  "Stock Analysis": ["Fundamental", "Technical", "Valuation", "Risk"],
  "Market Research": ["Sector", "Macro", "News & Events", "Competitors"],
  Portfolio: ["Review", "Allocation", "Rebalancing"],
  "Document Research": ["Summarise", "Extract Data", "Verify Claims"],
  General: ["Custom", "Templates"],
};

export const getPrompts = () => getParsedContext<SavedPrompt[]>("sa_prompts", []);

export const savePrompts = (list: SavedPrompt[]) => setContext("sa_prompts", list);

export const upsertPrompt = (p: SavedPrompt) => {
  const all = getPrompts();
  const i = all.findIndex((x) => x.id === p.id);
  const next = { ...p, updatedAt: Date.now() };
  if (i >= 0) all[i] = next;
  else all.unshift(next);
  savePrompts(all);
  return next;
};

export const deletePrompt = (id: string) => savePrompts(getPrompts().filter((p) => p.id !== id));

export const bumpPromptUse = (id: string) => {
  const all = getPrompts();
  const i = all.findIndex((p) => p.id === id);
  if (i >= 0) {
    all[i].useCount = (all[i].useCount || 0) + 1;
    savePrompts(all);
  }
};

/** Bulk add. Returns how many were stored vs skipped as duplicates. */
export const addPromptsBulk = (items: Partial<SavedPrompt>[]) => {
  const all = getPrompts();
  const seen = new Set(all.map((p) => `${p.title.toLowerCase()}||${p.body.trim().toLowerCase()}`));
  let added = 0;
  let skipped = 0;
  const now = Date.now();
  items.forEach((it, i) => {
    const title = String(it.title || "").trim();
    const body = String(it.body || "").trim();
    if (!body) { skipped++; return; }
    const key = `${title.toLowerCase()}||${body.toLowerCase()}`;
    if (seen.has(key)) { skipped++; return; }
    seen.add(key);
    all.unshift({
      id: `p_${now}_${i}`,
      title: title || body.slice(0, 60),
      body,
      category: String(it.category || "General").trim() || "General",
      subcategory: String(it.subcategory || "Custom").trim() || "Custom",
      tags: Array.isArray(it.tags) ? it.tags.map(String).filter(Boolean) : [],
      favorite: false,
      useCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    added++;
  });
  savePrompts(all);
  return { added, skipped };
};

/** User-defined categories layered on top of PROMPT_CATEGORIES. */
export const getCustomPromptCats = () =>
  getParsedContext<Record<string, string[]>>("sa_prompt_cats", {});
export const saveCustomPromptCats = (m: Record<string, string[]>) =>
  setContext("sa_prompt_cats", m);
