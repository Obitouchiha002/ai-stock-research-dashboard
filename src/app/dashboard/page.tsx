"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Star,
  Activity,
  Bell,
  FileText,
  Plus,
  GitCompare,
  Compass,
  ChevronRight,
  BarChart3,
  AlertTriangle,
  Play,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { useGlobal } from "@/context/GlobalContext";

// Market overview — live indices, split by market.
// One live market board with an India / US tab switch, plus a crypto strip.
// Every symbol here was verified to return live data from the quotes API.
const MARKETS = {
  india: {
    key: "india" as const,
    title: "India",
    flag: "🇮🇳",
    accent: "text-orange-600",
    tab: "bg-orange-600",
    indices: [
      { symbol: "^NSEI", label: "Nifty 50" },
      { symbol: "^BSESN", label: "Sensex" },
      { symbol: "^NSEBANK", label: "Bank Nifty" },
      { symbol: "^CNX100", label: "Nifty 100" },
      { symbol: "NIFTY_MIDCAP_100.NS", label: "Nifty Midcap 100" },
      { symbol: "^CNXSC", label: "Nifty Smallcap 100" },
      { symbol: "^INDIAVIX", label: "India VIX" },
    ],
    // Top Nifty constituents by weight — also the basis of the advance/decline read.
    stocks: [
      { symbol: "RELIANCE.NS", label: "Reliance" },
      { symbol: "HDFCBANK.NS", label: "HDFC Bank" },
      { symbol: "ICICIBANK.NS", label: "ICICI Bank" },
      { symbol: "INFY.NS", label: "Infosys" },
      { symbol: "TCS.NS", label: "TCS" },
      { symbol: "ITC.NS", label: "ITC" },
      { symbol: "LT.NS", label: "Larsen & Toubro" },
      { symbol: "BHARTIARTL.NS", label: "Bharti Airtel" },
      { symbol: "SBIN.NS", label: "State Bank" },
      { symbol: "AXISBANK.NS", label: "Axis Bank" },
    ],
  },
  us: {
    key: "us" as const,
    title: "US",
    flag: "🇺🇸",
    accent: "text-blue-600",
    tab: "bg-blue-600",
    indices: [
      { symbol: "^GSPC", label: "S&P 500" },
      { symbol: "^SP400", label: "S&P 400 (Mid)" },
      { symbol: "^IXIC", label: "Nasdaq" },
      { symbol: "^DJI", label: "Dow Jones" },
      { symbol: "^RUT", label: "Russell 2000" },
      { symbol: "^VIX", label: "VIX" },
      { symbol: "DX-Y.NYB", label: "Dollar Index" },
    ],
    stocks: [
      { symbol: "AAPL", label: "Apple" },
      { symbol: "MSFT", label: "Microsoft" },
      { symbol: "NVDA", label: "Nvidia" },
      { symbol: "GOOGL", label: "Alphabet" },
      { symbol: "AMZN", label: "Amazon" },
      { symbol: "META", label: "Meta" },
      { symbol: "TSLA", label: "Tesla" },
      { symbol: "AVGO", label: "Broadcom" },
      { symbol: "BRK-B", label: "Berkshire" },
      { symbol: "JPM", label: "JPMorgan" },
    ],
  },
};

const CRYPTO = [
  { symbol: "BTC-USD", label: "Bitcoin" },
  { symbol: "ETH-USD", label: "Ethereum" },
  { symbol: "SOL-USD", label: "Solana" },
  { symbol: "BNB-USD", label: "BNB" },
  { symbol: "XRP-USD", label: "XRP" },
  { symbol: "DOGE-USD", label: "Dogecoin" },
];

// Everything the board needs, fetched in one batch.
const MARKET_SYMBOLS = Array.from(
  new Set([
    ...MARKETS.india.indices.map((i) => i.symbol),
    ...MARKETS.india.stocks.map((i) => i.symbol),
    ...MARKETS.us.indices.map((i) => i.symbol),
    ...MARKETS.us.stocks.map((i) => i.symbol),
    ...CRYPTO.map((i) => i.symbol),
  ]),
);

export default function Dashboard() {
  const { profileName } = useGlobal();
  const firstName = (profileName || "there").trim().split(" ")[0];
  const [recentSearches, setRecentSearches] = useState<any[]>([]);
  const [watchlistCount, setWatchlistCount] = useState<number>(0);
  const [reportsCount, setReportsCount] = useState<number>(0);
  // live index quotes for the Indian + US market sections
  const [mktQuotes, setMktQuotes] = useState<Record<string, any>>({});
  const [mktLoading, setMktLoading] = useState(true);
  const [mktUpdated, setMktUpdated] = useState<number | null>(null);
  // Live quotes for whatever the user actually tracks — replaces the hardcoded
  // "Top Bullish / Top Risky" lists that were neither AI-sorted nor real.
  const [myMovers, setMyMovers] = useState<any[]>([]);
  const [moversLoading, setMoversLoading] = useState(true);
  const [mktTab, setMktTab] = useState<"india" | "us">("india");

  useEffect(() => {
    try {
      const rs = localStorage.getItem("sa_recent_searches");
      if (rs) setRecentSearches(JSON.parse(rs));
      const wl = localStorage.getItem("sa_watchlist");
      if (wl) setWatchlistCount(JSON.parse(wl).length);
      const rp = localStorage.getItem("sa_reports");
      if (rp) setReportsCount(JSON.parse(rp).length);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Fetch both markets in one batch call.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: MARKET_SYMBOLS }),
        });
        const j = await res.json();
        if (cancelled) return;
        setMktQuotes(j.quotes || {});
        setMktUpdated(Date.now());
      } catch {
        /* leave as — */
      } finally {
        if (!cancelled) setMktLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Biggest movers among the user's own watchlist + holdings, today.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let symbols: string[] = [];
      try {
        const wl = JSON.parse(localStorage.getItem("sa_watchlist") || "[]");
        const pf = JSON.parse(localStorage.getItem("sa_holdings") || "[]");
        symbols = Array.from(
          new Set([
            ...wl.map((w: any) => w?.symbol),
            ...pf.map((h: any) => h?.symbol),
          ].filter(Boolean)),
        ).slice(0, 30) as string[];
      } catch {
        symbols = [];
      }
      if (!symbols.length) {
        if (!cancelled) setMoversLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols }),
        });
        const j = await res.json();
        if (cancelled) return;
        const rows = Object.entries(j.quotes || {})
          .filter(([, q]: any) => q?.ok && Number.isFinite(q.changePct))
          .map(([symbol, q]: any) => ({ symbol, ...q }))
          .sort((a: any, b: any) => b.changePct - a.changePct);
        setMyMovers(rows);
      } catch {
        /* the empty state below explains it */
      } finally {
        if (!cancelled) setMoversLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full pb-10 mt-6 lg:mt-0">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-slate-500 text-sm">
            Here is what is happening in the markets today.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/analyze"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-xl text-sm transition-colors shadow-sm shadow-indigo-200"
          >
            <Plus className="w-4 h-4" /> Analyze Stock
          </Link>
          <Link
            href="/compare"
            className="flex items-center gap-2 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-700 font-medium py-2 px-4 rounded-xl text-sm transition-all shadow-sm"
          >
            <GitCompare className="w-4 h-4" /> Compare
          </Link>
        </div>
      </div>

      {/* Market board — India / US tabs, then crypto */}
      <div className="space-y-5">
        {/* market switch */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {(["india", "us"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setMktTab(k)}
                className={`px-4 py-2 rounded-lg text-[13px] font-black transition flex items-center gap-1.5 ${
                  mktTab === k ? `${MARKETS[k].tab} text-white shadow-sm` : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span>{MARKETS[k].flag}</span> {MARKETS[k].title}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">
            {mktLoading
              ? "loading…"
              : mktUpdated
                ? `updated ${new Date(mktUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
          </span>
        </div>

        {(() => {
          const m = MARKETS[mktTab];

          // Advance / decline read, computed from THIS market's top constituents.
          const rows = m.stocks.map((s) => mktQuotes[s.symbol]).filter((q) => q?.ok && Number.isFinite(q.changePct));
          const adv = rows.filter((q) => q.changePct > 0).length;
          const dec = rows.filter((q) => q.changePct < 0).length;
          const unch = rows.length - adv - dec;
          const total = Math.max(1, rows.length);

          return (
            <div className="space-y-5">
              {/* indices */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {m.indices.map((it) => (
                  <IndexCard key={it.symbol} it={it} q={mktQuotes[it.symbol]} loading={mktLoading} />
                ))}
              </div>

              {/* advance / decline of the top constituents */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <h3 className="text-[12px] font-black uppercase tracking-wider text-slate-500">
                    Advance / Decline · top {m.stocks.length} {m.title} stocks
                  </h3>
                  <div className="flex items-center gap-3 text-[12px] font-black tabular-nums">
                    <span className="text-emerald-600">{adv} up</span>
                    <span className="text-slate-400">{unch} flat</span>
                    <span className="text-rose-600">{dec} down</span>
                  </div>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                  <div className="bg-emerald-500" style={{ width: `${(adv / total) * 100}%` }} title={`${adv} advancing`} />
                  <div className="bg-slate-300" style={{ width: `${(unch / total) * 100}%` }} title={`${unch} unchanged`} />
                  <div className="bg-rose-500" style={{ width: `${(dec / total) * 100}%` }} title={`${dec} declining`} />
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Breadth of the market&apos;s biggest names right now — {adv} of {rows.length} are up on the day.
                </p>
              </div>

              {/* top constituents table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-[13px] font-black text-slate-800">
                    Top 10 {m.title} companies
                  </h3>
                  <span className="text-[11px] text-slate-400 font-bold">tap to analyse</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {m.stocks.map((s, i) => {
                    const q = mktQuotes[s.symbol];
                    const up = (q?.changePct ?? 0) >= 0;
                    const cur = q?.currency === "INR" ? "₹" : "$";
                    return (
                      <Link
                        key={s.symbol}
                        href={`/analyze?symbol=${encodeURIComponent(s.symbol)}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70 transition group"
                      >
                        <span className="w-5 text-[12px] font-black text-slate-300 tabular-nums">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-black text-slate-900 truncate group-hover:text-indigo-600">
                            {s.label}
                          </div>
                          <div className="text-[11px] text-slate-400 font-bold">{s.symbol.replace(".NS", "")}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[13.5px] font-black text-slate-900 tabular-nums">
                            {q?.price != null ? `${cur}${Number(q.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : mktLoading ? "…" : "—"}
                          </div>
                          {q?.changePct != null && (
                            <div className={`text-[11.5px] font-black tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}>
                              {up ? "+" : ""}{q.changePct.toFixed(2)}%
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* crypto — always visible, both markets share it */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 text-amber-600">
              <span className="text-sm leading-none">🪙</span> Crypto
            </h2>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
            {CRYPTO.map((it) => (
              <IndexCard key={it.symbol} it={it} q={mktQuotes[it.symbol]} loading={mktLoading} money />
            ))}
          </div>
        </div>
      </div>

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-500" /> Actions
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link
                href="/analyze"
                className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all group text-slate-600 text-sm font-medium gap-2"
              >
                <div className="bg-white p-2 rounded-lg shadow-sm group-hover:shadow-indigo-100">
                  <Activity className="w-5 h-5 text-indigo-500" />
                </div>
                New Analysis
              </Link>
              <Link
                href="/watchlist"
                className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-100 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 rounded-xl transition-all group text-slate-600 text-sm font-medium gap-2"
              >
                <div className="bg-white p-2 rounded-lg shadow-sm group-hover:shadow-amber-100">
                  <Star className="w-5 h-5 text-amber-500" />
                </div>
                Watchlist
              </Link>
              <Link
                href="/alerts"
                className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-100 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 rounded-xl transition-all group text-slate-600 text-sm font-medium gap-2"
              >
                <div className="bg-white p-2 rounded-lg shadow-sm group-hover:shadow-rose-100">
                  <Bell className="w-5 h-5 text-rose-500" />
                </div>
                Create Alert
              </Link>
              <Link
                href="/compare"
                className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-100 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 rounded-xl transition-all group text-slate-600 text-sm font-medium gap-2"
              >
                <div className="bg-white p-2 rounded-lg shadow-sm group-hover:shadow-sky-100">
                  <GitCompare className="w-5 h-5 text-sky-500" />
                </div>
                Compare
              </Link>
            </div>
          </div>

          {/* Today's movers in the user's own lists.
              This replaced two hardcoded lists (NVDA/MSFT/CRWD tagged "Strong
              Buy", MACY/GME/AAL tagged "High Risk") badged "AI Sorted". No AI
              ran, the symbols never changed, and "Strong Buy" is buy advice —
              which this app does not give. These are live quotes for symbols
              the user chose, sorted by today's move, with no verdict attached. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { up: true, title: "Up most today", icon: TrendingUp, ring: "border-emerald-100", head: "text-emerald-800", dot: "text-emerald-500" },
              { up: false, title: "Down most today", icon: AlertTriangle, ring: "border-rose-100", head: "text-rose-800", dot: "text-rose-500" },
            ].map((cfg) => {
              const rows = cfg.up
                ? myMovers.filter((m) => m.changePct > 0).slice(0, 4)
                : myMovers.filter((m) => m.changePct < 0).slice(-4).reverse();
              return (
                <div key={cfg.title} className={`bg-white rounded-2xl border ${cfg.ring} p-5 shadow-sm`}>
                  <h2 className={`text-sm font-bold ${cfg.head} uppercase tracking-widest mb-4 flex items-center justify-between`}>
                    <span className="flex items-center gap-2">
                      <cfg.icon className={`w-4 h-4 ${cfg.dot}`} /> {cfg.title}
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full normal-case tracking-normal">
                      your watchlist &amp; holdings
                    </span>
                  </h2>
                  {moversLoading ? (
                    <p className="text-xs text-slate-400 font-medium">Loading live prices…</p>
                  ) : !myMovers.length ? (
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Nothing to show yet — add symbols to your{" "}
                      <Link href="/watchlist" className="font-bold text-indigo-600 hover:underline">watchlist</Link> or{" "}
                      <Link href="/portfolio" className="font-bold text-indigo-600 hover:underline">portfolio</Link> and
                      today&apos;s moves appear here.
                    </p>
                  ) : !rows.length ? (
                    <p className="text-xs text-slate-500">
                      None of your symbols are {cfg.up ? "up" : "down"} today.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {rows.map((m) => (
                        <Link
                          href={`/analyze?symbol=${encodeURIComponent(m.symbol)}`}
                          key={m.symbol}
                          className="flex justify-between items-center group"
                        >
                          <span className="font-bold text-slate-700 group-hover:text-indigo-600 transition-colors truncate">
                            {m.symbol}
                          </span>
                          <div className="flex items-center gap-2 text-xs font-semibold">
                            {Number.isFinite(m.price) && (
                              <span className="text-slate-400 tabular-nums">{Number(m.price).toFixed(2)}</span>
                            )}
                            <span
                              className={`px-2 py-1 rounded-md border tabular-nums ${
                                m.changePct >= 0
                                  ? "text-emerald-600 bg-emerald-50 border-emerald-100"
                                  : "text-rose-600 bg-rose-50 border-rose-100"
                              }`}
                            >
                              {m.changePct >= 0 ? "+" : ""}
                              {Number(m.changePct).toFixed(2)}%
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Play className="w-4 h-4 text-indigo-500" /> Recent Analyses
              </h2>
              <Link
                href="/analyze"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                View All
              </Link>
            </div>

            {recentSearches.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500">
                      <th className="pb-3 font-medium">Symbol</th>
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">AI Score</th>
                      <th className="pb-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    {recentSearches.slice(0, 4).map((s, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-50 hover:bg-slate-50 last:border-0 group"
                      >
                        <td className="py-3 font-bold">{s.symbol}</td>
                        <td className="py-3 text-slate-500">
                          {new Date(s.searchedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md ${s.change?.startsWith("-") ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"} border`}
                          >
                            {s.change || "N/A"}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/stock/${s.symbol}`}
                            className="text-xs font-bold text-slate-400 group-hover:text-indigo-600 px-3 py-1.5 rounded-lg border border-transparent group-hover:border-indigo-200 bg-transparent group-hover:bg-white transition-all"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-slate-400 italic py-4 text-center bg-slate-50 rounded-xl border border-slate-100">
                No recent searches found.{" "}
                <Link
                  href="/analyze"
                  className="text-indigo-500 font-semibold hover:underline"
                >
                  Start analyzing
                </Link>
                .
              </div>
            )}
          </div>
        </div>

        {/* Right Col */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" /> Watchlist
              </h2>
              <Link
                href="/watchlist"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                Manage
              </Link>
            </div>

            {watchlistCount > 0 ? (
              <div className="space-y-2">
                <div className="text-3xl font-black text-slate-800">
                  {watchlistCount}
                </div>
                <div className="text-sm text-slate-500">
                  Stocks in your watchlist.
                </div>
                <Link
                  href="/watchlist"
                  className="block text-center mt-2 w-full px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-lg transition"
                >
                  View Watchlist
                </Link>
              </div>
            ) : (
              <div className="text-sm text-slate-400 italic p-4 text-center bg-amber-50/50 rounded-xl border border-amber-100/50">
                Watchlist is empty.
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-500" /> Saved Reports
              </h2>
              <Link
                href="/reports"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                View All
              </Link>
            </div>
            {reportsCount > 0 ? (
              <div className="space-y-2">
                <div className="text-3xl font-black text-slate-800">
                  {reportsCount}
                </div>
                <div className="text-sm text-slate-500">
                  Total deep AI reports saved.
                </div>
                <Link
                  href="/reports"
                  className="block text-center mt-2 w-full px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-lg transition"
                >
                  View Library
                </Link>
              </div>
            ) : (
              <div className="text-sm text-slate-400 italic p-4 text-center bg-sky-50/50 rounded-xl border border-sky-100/50">
                No reports saved yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One market card — an index level or a crypto price.
 * `money` prefixes a currency symbol (crypto has a real price, an index is a level).
 */
function IndexCard({
  it,
  q,
  loading,
  money = false,
}: {
  it: { symbol: string; label: string };
  q: any;
  loading: boolean;
  money?: boolean;
}) {
  const up = (q?.changePct ?? 0) >= 0;
  const cur = q?.currency === "INR" ? "₹" : "$";
  const lvl = (n: any, d = 2) =>
    n == null ? "—" : Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  const lo = q?.dayLow, hi = q?.dayHigh, px = q?.price;
  const pos =
    lo != null && hi != null && px != null && hi > lo
      ? Math.min(96, Math.max(4, ((px - lo) / (hi - lo)) * 100))
      : null;
  return (
    <Link
      href={`/charts?symbol=${encodeURIComponent(it.symbol)}`}
      className="group bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm hover:shadow-md hover:border-indigo-200 hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase truncate">{it.label}</span>
        {q?.changePct != null && (
          <span
            className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded ${
              up ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"
            }`}
          >
            {up ? "+" : ""}
            {q.changePct.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[21px] leading-none font-black text-slate-900 tabular-nums">
          {q?.price != null ? `${money ? cur : ""}${lvl(q.price, money && q.price < 10 ? 4 : 2)}` : loading ? "…" : "—"}
        </span>
        {q?.change != null && (
          <span className={`text-[11px] font-bold tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}>
            {up ? "+" : ""}
            {lvl(q.change, money && Math.abs(q.change) < 10 ? 4 : 2)}
          </span>
        )}
      </div>
      {pos != null && (
        <div className="mt-3">
          <div className="relative h-1 rounded-full bg-slate-100">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${up ? "bg-emerald-400" : "bg-rose-400"}`}
              style={{ width: `${pos}%` }}
            />
            <span
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-sm ${
                up ? "bg-emerald-600" : "bg-rose-600"
              }`}
              style={{ left: `${pos}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] font-bold text-slate-300 mt-1.5 tabular-nums">
            <span>{lvl(lo, 0)}</span>
            <span>{lvl(hi, 0)}</span>
          </div>
        </div>
      )}
    </Link>
  );
}
