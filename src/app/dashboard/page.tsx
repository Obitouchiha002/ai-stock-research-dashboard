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
  Bitcoin,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { motion } from "motion/react";
import { useGlobal } from "@/context/GlobalContext";
import dynamic from "next/dynamic";
const PortfolioAnalysis = dynamic(() => import("@/components/PortfolioAnalysis"), { ssr: false });

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
      { symbol: "^DJI", label: "Dow Jones" },
      { symbol: "^GSPC", label: "S&P 500" },
      { symbol: "^IXIC", label: "Nasdaq" },
      { symbol: "^SP400", label: "S&P 400 (Mid)" },
      { symbol: "^RUT", label: "Russell 2000" },
      { symbol: "DX-Y.NYB", label: "Dollar Index" },
      { symbol: "^VIX", label: "VIX" },
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

// Advance/decline breadth baskets — a broad large-cap sample per market,
// fetched separately so the header board stays fast. Live-verified symbols.
const BREADTH = {
  india: [
    "RELIANCE.NS","HDFCBANK.NS","ICICIBANK.NS","INFY.NS","TCS.NS","ITC.NS","LT.NS","BHARTIARTL.NS",
    "SBIN.NS","AXISBANK.NS","KOTAKBANK.NS","HINDUNILVR.NS","BAJFINANCE.NS","ASIANPAINT.NS","MARUTI.NS",
    "SUNPHARMA.NS","TITAN.NS","ULTRACEMCO.NS","WIPRO.NS","NESTLEIND.NS","ONGC.NS","NTPC.NS","POWERGRID.NS",
    "M&M.NS","TATAMOTORS.NS","TATASTEEL.NS","JSWSTEEL.NS","HCLTECH.NS","TECHM.NS","ADANIENT.NS",
    "ADANIPORTS.NS","COALINDIA.NS","GRASIM.NS","HDFCLIFE.NS","SBILIFE.NS","BAJAJFINSV.NS","BAJAJ-AUTO.NS",
    "EICHERMOT.NS","HEROMOTOCO.NS","DRREDDY.NS","CIPLA.NS","DIVISLAB.NS","BRITANNIA.NS","TATACONSUM.NS",
    "INDUSINDBK.NS","APOLLOHOSP.NS","BPCL.NS","HINDALCO.NS","UPL.NS","SHREECEM.NS",
    // broader Nifty 100 / 200 sample — bad symbols auto-filter out
    "DABUR.NS","GODREJCP.NS","PIDILITIND.NS","HAVELLS.NS","SIEMENS.NS","ABB.NS","DLF.NS","GAIL.NS","IOC.NS",
    "VEDL.NS","AMBUJACEM.NS","ACC.NS","BANKBARODA.NS","PNB.NS","CANBK.NS","ZOMATO.NS","DMART.NS","NAUKRI.NS",
    "PAGEIND.NS","BERGEPAINT.NS","MARICO.NS","COLPAL.NS","BIOCON.NS","LUPIN.NS","AUROPHARMA.NS","TORNTPHARM.NS",
    "ICICIPRULI.NS","ICICIGI.NS","MUTHOOTFIN.NS","CHOLAFIN.NS","TATAPOWER.NS","ADANIGREEN.NS","ADANIPOWER.NS",
    "JINDALSTEL.NS","SAIL.NS","NMDC.NS","HINDZINC.NS","NATIONALUM.NS","IDFCFIRSTB.NS","FEDERALBNK.NS",
    "BANDHANBNK.NS","AUBANK.NS","INDIGO.NS","TRENT.NS","BEL.NS","HAL.NS","BHEL.NS","IRCTC.NS","POLYCAB.NS",
    "LTIM.NS","PERSISTENT.NS","MPHASIS.NS","OFSS.NS","TVSMOTOR.NS","ASHOKLEY.NS","MRF.NS","SRF.NS","PEL.NS",
    "RECLTD.NS","PFC.NS","IRFC.NS","BOSCHLTD.NS","CUMMINSIND.NS","ALKEM.NS","MAXHEALTH.NS","FORTIS.NS",
    "UBL.NS","VBL.NS","TATACOMM.NS","PETRONET.NS","IGL.NS","TATACHEM.NS","ZYDUSLIFE.NS",
    // wider Nifty 200 sample — unresolved tickers auto-filter
    "GODREJPROP.NS","OBEROIRLTY.NS","PRESTIGE.NS","PHOENIXLTD.NS","LODHA.NS","MOTHERSON.NS","BHARATFORG.NS",
    "ESCORTS.NS","EXIDEIND.NS","TIINDIA.NS","JUBLFOOD.NS","DIXON.NS","VOLTAS.NS","CROMPTON.NS","PATANJALI.NS",
    "TATAELXSI.NS","COFORGE.NS","KPITTECH.NS","LTTS.NS","SUPREMEIND.NS","ASTRAL.NS","APLAPOLLO.NS","JSWENERGY.NS",
    "TORNTPOWER.NS","NHPC.NS","SJVN.NS","OIL.NS","MFSL.NS","LICI.NS","HDFCAMC.NS","SBICARD.NS","BAJAJHLDNG.NS",
    "INDHOTEL.NS","GMRAIRPORT.NS","CONCOR.NS","BDL.NS","MAZDOCK.NS","RVNL.NS","IREDA.NS","POWERINDIA.NS",
    "SOLARINDS.NS","CGPOWER.NS","KALYANKJIL.NS","IDBI.NS","YESBANK.NS","INDUSTOWER.NS","GAIL.NS","HINDPETRO.NS",
    "MANKIND.NS","GLAND.NS","LAURUSLABS.NS","NAM-INDIA.NS",
  ],
  us: [
    "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","BRK-B","JPM","LLY","V","XOM","UNH","MA",
    "JNJ","PG","HD","COST","MRK","ABBV","CVX","CRM","WMT","BAC","KO","PEP","ADBE","NFLX","AMD","TMO",
    "MCD","CSCO","ACN","ABT","LIN","DHR","INTC","WFC","DIS","QCOM","VZ","TXN","PM","INTU","AMGN","IBM",
    "CAT","GE","NOW",
    // broader S&P 500 sample — bad symbols auto-filter out
    "ORCL","DELL","MU","AMAT","LRCX","KLAC","ADI","PANW","SNPS","CDNS","FTNT","ANET","MRVL","NXPI","MCHP",
    "PYPL","SHOP","UBER","ABNB","BKNG","MAR","SBUX","NKE","LOW","TJX","TGT","DG","DLTR","CL","KMB","GIS",
    "KHC","MDLZ","MO","HSY","STZ","MNST","GM","F","BA","HON","RTX","LMT","GD","NOC","DE","MMM","EMR","ETN",
    "ITW","UNP","UPS","FDX","CSX","NSC","DAL","UAL","LUV","PFE","MRNA","BMY","GILD","VRTX","REGN","ZTS",
    "ISRG","SYK","BSX","MDT","CI","CVS","ELV","SPGI","MCO","ICE","CME","BLK","GS","MS","C","USB","PNC",
    "TFC","SCHW","AXP","COF","MET","PRU","AIG","TRV","PGR","ALL","CB","AON","MMC","DUK","SO","NEE","AEP",
    "T","TMUS","CMCSA","CHTR","WBD","EA","TTWO",
    // wider S&P 500 sample — unresolved tickers auto-filter
    "ORLY","AZO","ROST","ULTA","YUM","CMG","DPZ","APH","TEL","GLW","KEYS","ROP","FICO","IT","CTSH","WDAY",
    "SNOW","CRWD","ZS","DDOG","NET","MDB","HUBS","PLTR","COIN","HOOD","SOFI","RBLX","U","CHWY","ETSY","EBAY",
    "PCAR","FAST","GWW","URI","PWR","VMC","MLM","NUE","STLD","FCX","NEM","DOW","DD","LYB","PPG","SHW","ECL",
    "APD","IFF","ALB","CMI","APTV","GM","F","DAL","UAL","LUV","MAR","HLT","BKNG","EXPE","ADP","PAYX","FIS",
    "FISV","GPN","MSCI","NDAQ","CBOE","TROW","AMP","DFS","SYF","KEY","CFG","HBAN","FITB","RF","MTB",
  ],
};

const CRYPTO = [
  { symbol: "BTC-USD", label: "Bitcoin", ticker: "BTC", glyph: "₿", grad: "from-orange-400 to-amber-500" },
  { symbol: "ETH-USD", label: "Ethereum", ticker: "ETH", glyph: "Ξ", grad: "from-indigo-400 to-violet-500" },
  { symbol: "SOL-USD", label: "Solana", ticker: "SOL", glyph: "◎", grad: "from-purple-400 to-fuchsia-500" },
  { symbol: "BNB-USD", label: "BNB", ticker: "BNB", glyph: "⬡", grad: "from-yellow-400 to-amber-500" },
  { symbol: "XRP-USD", label: "XRP", ticker: "XRP", glyph: "✕", grad: "from-sky-400 to-blue-500" },
  { symbol: "DOGE-USD", label: "Dogecoin", ticker: "DOGE", glyph: "Ð", grad: "from-amber-400 to-yellow-500" },
];

// Top ticker strip — the market's headline instruments, live with sparklines.
const TICKER = [
  { symbol: "^NSEI", label: "NIFTY 50" },
  { symbol: "^BSESN", label: "SENSEX" },
  { symbol: "^NSEBANK", label: "BANK NIFTY" },
  { symbol: "INR=X", label: "USD/INR" },
  { symbol: "^DJI", label: "DOW" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "BTC-USD", label: "BITCOIN" },
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
  const { profileName, setMarket } = useGlobal();
  const rawName = (profileName || "").trim();
  // "John Doe" was the old placeholder default — treat it (and empty) as "no name set".
  const firstName = rawName && rawName.toLowerCase() !== "john doe" ? rawName.split(" ")[0] : "";
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
  const [dashTech, setDashTech] = useState(false);
  // Breadth quotes per market — fetched lazily when a tab is first opened.
  const [breadth, setBreadth] = useState<Record<string, Record<string, any>>>({ india: {}, us: {} });

  // Active market's breadth basket — loaded on tab view and then kept live in
  // the background so the advance/decline read never goes stale.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: BREADTH[mktTab] }),
        });
        const j = await res.json();
        // Only overwrite on a real payload, so a hiccup never blanks the read.
        if (!cancelled && j.quotes && Object.keys(j.quotes).length) {
          setBreadth((b) => ({ ...b, [mktTab]: j.quotes }));
        }
      } catch {
        /* the header still shows top-name breadth as a fallback */
      }
    };
    load();
    const id = setInterval(load, 45000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mktTab]);

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

  // Fetch both markets in one batch call, then keep them live in the background
  // (silent — no spinner) so prices stay fresh without a manual refresh.
  useEffect(() => {
    let cancelled = false;
    const load = async (silent: boolean) => {
      try {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: MARKET_SYMBOLS }),
        });
        const j = await res.json();
        if (cancelled) return;
        // Only replace on a real payload so a transient failure never blanks
        // the board — the last good prices simply stay on screen.
        if (j.quotes && Object.keys(j.quotes).length) {
          setMktQuotes(j.quotes);
          setMktUpdated(Date.now());
        }
      } catch {
        /* keep the last good values */
      } finally {
        if (!cancelled && !silent) setMktLoading(false);
      }
    };
    load(false);
    const id = setInterval(() => load(true), 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Keep the global market (which drives the topbar ticker) in sync with the
  // dashboard's India / US tab, starting from whatever tab is shown.
  useEffect(() => {
    setMarket(mktTab === "us" ? "US" : "NSE");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Crypto 24h sparkline series for the compact crypto list.
  const [cryptoSpark, setCryptoSpark] = useState<Record<string, any>>({});
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/spark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: CRYPTO.map((c) => c.symbol) }),
        });
        const j = await res.json();
        if (!cancelled && j.data && Object.keys(j.data).length) setCryptoSpark(j.data);
      } catch {
        /* list still shows price/change from the batch quote fetch */
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Biggest movers among the user's own watchlist + holdings, today.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let symbols: string[] = [];
      try {
        const wl = JSON.parse(localStorage.getItem("sa_watchlist") || "[]");
        const pf = JSON.parse(localStorage.getItem("sa_portfolio") || "[]");
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
    <div className="space-y-4 max-w-[1500px] mx-auto w-full pb-8 mt-3 lg:mt-0 overflow-x-hidden">
      {/* Header Area — compact */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">
            {firstName ? `Welcome back, ${firstName}` : "Welcome to StockAnalytix"}
          </h1>
          <p className="text-slate-500 text-[13px] mt-0.5">Here is what is happening in the markets today.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/analyze" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-[13px] transition-colors shadow-sm shadow-indigo-200">
            <Plus className="w-4 h-4" /> Analyze Stock
          </Link>
          <Link href="/compare" className="flex items-center gap-2 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-700 font-bold py-2 px-4 rounded-xl text-[13px] transition-all shadow-sm">
            <GitCompare className="w-4 h-4" /> Compare
          </Link>
        </div>
      </div>

      {/* Market board — India / US tabs, then crypto */}
      <div className="space-y-4">
        {/* market switch */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {(["india", "us"] as const).map((k) => (
              <button
                key={k}
                onClick={() => { setMktTab(k); setMarket(k === "us" ? "US" : "NSE"); }}
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

          // Advance / decline read, computed from a broad large-cap basket for
          // this market (falls back to the top names until breadth loads).
          const bq = breadth[mktTab] || {};
          const breadthRows = Object.values(bq).filter((q: any) => q?.ok && Number.isFinite(q.changePct));
          const rows: any[] = breadthRows.length
            ? breadthRows
            : m.stocks.map((s) => mktQuotes[s.symbol]).filter((q) => q?.ok && Number.isFinite(q.changePct));
          const universeLabel = mktTab === "india" ? "Nifty stocks" : "S&P 500 stocks";
          const adv = rows.filter((q) => q.changePct > 0).length;
          const dec = rows.filter((q) => q.changePct < 0).length;
          const unch = rows.length - adv - dec;
          const total = Math.max(1, rows.length);
          const breadthPct = (adv / total) * 100;

          // KPI inputs — headline index, volatility, and the day's extremes.
          const headIt = m.indices[0];
          const headQ = mktQuotes[headIt.symbol];
          const vixIt = m.indices.find((i) => /VIX/i.test(i.label));
          const vixQ = vixIt ? mktQuotes[vixIt.symbol] : null;
          const ranked = [...rows].sort((a, b) => b.changePct - a.changePct);
          const topG = ranked[0];
          const topL = ranked[ranked.length - 1];
          const top5G = ranked.slice(0, 5);
          const top5L = ranked.slice(-5).reverse();
          const cur = headQ?.currency === "INR" ? "₹" : "$";
          const lvl = (n: any, d = 2) =>
            n == null ? "—" : Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

          return (
            <div key={mktTab} className="space-y-4">
              {/* Section heading above the snapshot */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 grid place-items-center shadow-sm">
                    <BarChart3 className="w-5 h-5" strokeWidth={2.5} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">Market Overview</h2>
                    <p className="text-[12px] font-semibold text-slate-400 mt-0.5">{m.title} · breadth, movers &amp; volatility</p>
                  </div>
                </div>
                <div className="flex-1 h-px bg-slate-200 ml-2" />
              </div>

              {/* Headline index boxes — the market's key indices, live */}
              <motion.div
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                {m.indices.map((it) => {
                  const q = mktQuotes[it.symbol];
                  const up = (q?.changePct ?? 0) >= 0;
                  return (
                    <Link
                      key={it.symbol}
                      href={`/charts?symbol=${encodeURIComponent(it.symbol)}`}
                      className={`relative overflow-hidden rounded-xl border shadow-sm pl-4 pr-3 py-2.5 hover:shadow-md transition-all ${q?.changePct == null ? "bg-white border-slate-200" : up ? "bg-emerald-50/60 border-emerald-200 hover:border-emerald-300" : "bg-rose-50/60 border-rose-200 hover:border-rose-300"}`}
                    >
                      <span className={`absolute left-0 top-0 bottom-0 w-1 ${q?.changePct == null ? "bg-slate-200" : up ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 truncate">{it.label}</div>
                      <div className="flex items-baseline justify-between gap-1.5 mt-1">
                        <span className="text-[15px] font-black text-slate-900 tabular-nums">
                          {q?.price != null ? Number(q.price).toLocaleString(undefined, { maximumFractionDigits: 2 }) : mktLoading ? "…" : "—"}
                        </span>
                        {q?.changePct != null && (
                          <span className={`text-[11px] font-black tabular-nums px-1.5 py-0.5 rounded-md ${up ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                            {up ? "+" : ""}{q.changePct.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </motion.div>

              {/* KPI row — breadth + the day's extremes + volatility */}
              <motion.div
                className="grid grid-cols-2 xl:grid-cols-4 gap-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <StatCard
                  title="Market Breadth"
                  tone="indigo"
                  value={
                    <span className="flex items-center gap-1">
                      <span className="text-emerald-600">{adv}</span>
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-slate-300 mx-0.5">·</span>
                      <span className="text-rose-600">{dec}</span>
                      <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                    </span>
                  }
                  sub={`of ${total} stocks${breadthRows.length ? "" : " · loading…"}`}
                  right={<DonutRing pct={breadthPct} label={`${Math.round(breadthPct)}%`} />}
                />
                <StatCard
                  title="Top Gainer"
                  value={topG ? cleanSym(topG.symbol) : "—"}
                  tone="emerald"
                  sub={topG ? `${topG.changePct >= 0 ? "+" : ""}${topG.changePct.toFixed(2)}% · ${cur}${lvl(topG.price)}` : "—"}
                />
                <StatCard
                  title="Top Loser"
                  value={topL ? cleanSym(topL.symbol) : "—"}
                  tone="rose"
                  sub={topL ? `${topL.changePct.toFixed(2)}% · ${cur}${lvl(topL.price)}` : "—"}
                />
                <StatCard
                  title={vixIt?.label || "Volatility"}
                  tone={vixQ?.changePct != null ? (vixQ.changePct >= 0 ? "rose" : "emerald") : "slate"}
                  value={vixQ?.price != null ? lvl(vixQ.price) : "—"}
                  sub={
                    vixQ?.changePct != null ? (
                      <span className={vixQ.changePct >= 0 ? "text-rose-600" : "text-emerald-600"}>
                        {vixQ.changePct >= 0 ? "+" : ""}{vixQ.changePct.toFixed(2)}% · fear gauge
                      </span>
                    ) : "fear gauge"
                  }
                />
              </motion.div>

              {/* Top Movers — the day's biggest gainers & losers. Actionable and
                  unique to the dashboard (the ticker can't show this). */}
              <motion.div
                className="grid grid-cols-1 lg:grid-cols-2 gap-3"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
              >
                {([
                  { title: "Top Gainers", list: top5G, up: true },
                  { title: "Top Losers", list: top5L, up: false },
                ] as const).map((col) => (
                  <div key={col.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
                      {col.up ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-rose-600" />}
                      <h3 className="text-[13.5px] font-black tracking-tight text-slate-800">{col.title}</h3>
                      <span className="ml-auto text-[10.5px] font-bold text-slate-400">{universeLabel}</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {col.list.length ? (
                        col.list.map((r: any, i: number) => {
                          const rup = (r.changePct ?? 0) >= 0;
                          return (
                            <Link
                              key={r.symbol || i}
                              href={`/analyze?symbol=${encodeURIComponent(r.symbol)}`}
                              className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50/70 transition group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-[11px] font-black text-slate-300 tabular-nums w-4 shrink-0">{i + 1}</span>
                                <div className="min-w-0">
                                  <div className="text-[13px] font-black text-slate-900 truncate group-hover:text-indigo-600">{cleanSym(r.symbol)}</div>
                                  {r.name && <div className="text-[11px] text-slate-400 font-bold truncate">{r.name}</div>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-[13px] font-black text-slate-900 tabular-nums">{cur}{lvl(r.price)}</div>
                                <div className={`text-[11px] font-bold tabular-nums ${rup ? "text-emerald-600" : "text-rose-600"}`}>
                                  {rup ? "+" : ""}{r.changePct.toFixed(2)}%
                                </div>
                              </div>
                            </Link>
                          );
                        })
                      ) : (
                        <div className="px-4 py-8 text-center text-[12px] text-slate-400 font-medium">Loading movers…</div>
                      )}
                    </div>
                  </div>
                ))}
              </motion.div>

              {/* top constituents — proper columns so the row's width is used:
                  Rank · Company · CMP · Market Cap · Change% */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.32, ease: "easeOut" }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
                  <h3 className="text-[16px] font-black text-slate-900 tracking-tight">
                    Top 10 {m.title} companies{dashTech ? " · AI analysis" : " · by market cap"}
                  </h3>
                  <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 shrink-0">
                    {([["quotes", "📋 Manual"], ["tech", "🤖 AI Analysis"]] as const).map(([k, lbl]) => (
                      <button key={k} onClick={() => setDashTech(k === "tech")}
                        className={`px-3 py-1.5 rounded-lg text-[12px] font-black transition ${(dashTech ? "tech" : "quotes") === k ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                {dashTech ? (
                  <div className="p-4">
                    <PortfolioAnalysis
                      market={mktTab === "us" ? "US Stocks" : "Indian Stocks"}
                      holdingsOverride={m.stocks.map((s) => ({ symbol: s.symbol, name: s.label }))}
                      hideFundamental
                      label={`Top 10 ${m.title} · AI Analysis`}
                    />
                  </div>
                ) : (
                <>

                {/* column header (hidden on phones — the card layout stacks) */}
                <div className="hidden sm:grid grid-cols-[2.5rem_1.8fr_1.2fr_1.2fr_1fr_1.25rem] items-center gap-4 px-4 py-2.5 border-b-2 border-slate-100 bg-slate-50 text-[12px] font-black uppercase tracking-wide text-slate-600">
                  <span>#</span>
                  <span>Company</span>
                  <span className="text-right">CMP</span>
                  <span className="text-right">Market Cap</span>
                  <span className="text-right">Change</span>
                  <span />
                </div>
                <div className="divide-y divide-slate-50">
                  {m.stocks.map((s, i) => {
                    const q = mktQuotes[s.symbol];
                    const up = (q?.changePct ?? 0) >= 0;
                    const cur = q?.currency === "INR" ? "₹" : "$";
                    const cmp = q?.price != null ? `${cur}${Number(q.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : mktLoading ? "…" : "—";
                    return (
                      <Link
                        key={s.symbol}
                        href={`/analyze?symbol=${encodeURIComponent(s.symbol)}`}
                        className="grid grid-cols-[2rem_1fr_auto_1rem] sm:grid-cols-[2.5rem_1.8fr_1.2fr_1.2fr_1fr_1.25rem] items-center gap-4 px-4 py-2.5 even:bg-slate-50/40 hover:bg-indigo-50/40 transition group"
                      >
                        <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[12px] font-black tabular-nums flex items-center justify-center shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-black text-slate-900 truncate group-hover:text-indigo-600">
                            {s.label}
                          </div>
                          <div className="text-[11px] text-slate-400 font-bold">{s.symbol.replace(".NS", "")}</div>
                        </div>

                        {/* CMP — its own column on sm+, stacked into the price cell on mobile */}
                        <div className="text-right sm:hidden">
                          <div className="text-[13.5px] font-black text-slate-900 tabular-nums">{cmp}</div>
                          {q?.changePct != null && (
                            <div className={`text-[11.5px] font-black tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}>
                              {up ? "+" : ""}{q.changePct.toFixed(2)}%
                            </div>
                          )}
                          {q?.marketCap ? <div className="text-[10.5px] text-slate-400 font-bold">{fmtCap(q.marketCap, cur)}</div> : null}
                        </div>

                        <div className="hidden sm:block text-right text-[13.5px] font-black text-slate-900 tabular-nums">{cmp}</div>
                        <div className="hidden sm:block text-right text-[12.5px] font-bold text-slate-500 tabular-nums">
                          {q?.marketCap ? fmtCap(q.marketCap, cur) : "—"}
                        </div>
                        <div className="hidden sm:flex justify-end">
                          {q?.changePct != null ? (
                            <span className={`text-[12px] font-black tabular-nums px-2 py-0.5 rounded-md ${up ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{up ? "+" : ""}{q.changePct.toFixed(2)}%</span>
                          ) : <span className="text-slate-300 text-[13px]">—</span>}
                        </div>

                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0" />
                      </Link>
                    );
                  })}
                </div>
                </>
                )}
              </motion.div>
            </div>
          );
        })()}

        {/* crypto — always visible, both markets share it */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white grid place-items-center shadow-sm">
              <Bitcoin className="w-5 h-5" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">Crypto</h2>
              <p className="text-[12px] font-semibold text-slate-400 mt-0.5">Live prices · 24h trend</p>
            </div>
            <div className="flex-1 h-px bg-slate-200 ml-2" />
          </div>

          {/* Compact list — one row per coin, with a 24h sparkline */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 border-b-2 border-slate-100 bg-slate-50 text-[12px] font-black uppercase tracking-wide text-slate-600">
              <span className="w-8" />
              <span className="flex-1">Coin</span>
              <span className="w-28 text-right">Price</span>
              <span className="w-20 text-right">24h</span>
              <span className="w-20 text-right hidden md:block">Trend</span>
            </div>
            <div className="divide-y divide-slate-50">
              {CRYPTO.map((c) => {
                const s = cryptoSpark[c.symbol];
                const q = mktQuotes[c.symbol];
                const price = s?.price ?? q?.price ?? null;
                const pct = s?.changePct ?? q?.changePct ?? null;
                const up = (pct ?? 0) >= 0;
                const dp = price != null && price < 10 ? 4 : 2;
                return (
                  <Link
                    key={c.symbol}
                    href={`/charts?symbol=${encodeURIComponent(c.symbol)}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70 transition group"
                  >
                    <span className={`shrink-0 w-8 h-8 rounded-full bg-gradient-to-br ${c.grad} text-white grid place-items-center text-[14px] font-black shadow-sm`}>
                      {c.glyph}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-black text-slate-900 leading-tight group-hover:text-indigo-600">{c.ticker}</div>
                      <div className="text-[11px] font-bold text-slate-400 truncate">{c.label}</div>
                    </div>
                    <div className="w-24 sm:w-28 text-right text-[14px] font-black text-slate-900 tabular-nums">
                      {price != null ? `$${price.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}` : mktLoading ? "…" : "—"}
                    </div>
                    <div className={`w-16 sm:w-20 text-right text-[12.5px] font-black tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}>
                      {pct != null ? `${up ? "+" : ""}${pct.toFixed(2)}%` : "—"}
                    </div>
                    <div className="w-20 justify-end hidden md:flex">
                      <Sparkline data={s?.series || []} up={up} />
                    </div>
                  </Link>
                );
              })}
            </div>
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
                            className={`text-xs font-bold px-2 py-0.5 rounded-md ${String(s.change ?? "").startsWith("-") ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"} border`}
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

// Compact market-cap: ₹ in Lakh Cr / Cr, $ in T / B.
function fmtCap(n: number, cur: string): string {
  if (!n || n <= 0) return '';
  if (cur === '₹') {
    const cr = n / 1e7; // 1 crore = 10^7
    if (cr >= 1e5) return `₹${(cr / 1e5).toFixed(2)}L Cr`;
    return `₹${Math.round(cr).toLocaleString('en-IN')} Cr`;
  }
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

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
      className="group relative bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all overflow-hidden"
    >
      {/* direction accent along the top edge */}
      <div className={`absolute inset-x-0 top-0 h-[2px] ${up ? "bg-emerald-400/80" : "bg-rose-400/80"}`} />

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`shrink-0 w-6 h-6 rounded-md grid place-items-center ${
              up ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
            }`}
          >
            {up ? <TrendingUp className="w-3.5 h-3.5" strokeWidth={2.5} /> : <TrendingDown className="w-3.5 h-3.5" strokeWidth={2.5} />}
          </span>
          <span className="text-[10px] font-black text-slate-500 tracking-wide uppercase truncate">{it.label}</span>
        </div>
        {q?.changePct != null && (
          <span
            className={`shrink-0 text-[10.5px] font-black px-1.5 py-0.5 rounded-full ${
              up ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"
            }`}
          >
            {up ? "+" : ""}
            {q.changePct.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[18px] leading-none font-black text-slate-900 tabular-nums">
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
        <div className="mt-2.5">
          <div className="relative h-1 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${
                up ? "bg-gradient-to-r from-emerald-300 to-emerald-500" : "bg-gradient-to-r from-rose-300 to-rose-500"
              }`}
              style={{ width: `${pos}%` }}
            />
          </div>
          <div
            className={`relative -mt-[7px] w-2.5 h-2.5 rounded-full bg-white shadow-sm ${up ? "ring-2 ring-emerald-500" : "ring-2 ring-rose-500"}`}
            style={{ marginLeft: `calc(${pos}% - 5px)` }}
          />
          <div className="flex justify-between text-[9.5px] font-bold text-slate-400 mt-0.5 tabular-nums">
            <span>L {lvl(lo, 0)}</span>
            <span>H {lvl(hi, 0)}</span>
          </div>
        </div>
      )}
    </Link>
  );
}

// Tiny inline SVG sparkline — normalised polyline, no axes, coloured by trend.
function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const w = 64, h = 22;
  if (!data || data.length < 2) return <div style={{ width: w, height: h }} />;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 3) - 1.5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = up ? "#34d399" : "#f87171";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Circular progress ring (breadth %) — the reference's donut, done in SVG.
function DonutRing({ pct, label }: { pct: number; label: string }) {
  const size = 44, r = 17, c = 2 * Math.PI * r, mid = size / 2;
  const p = Math.max(0, Math.min(100, pct));
  const tone = p >= 55 ? "#10b981" : p >= 45 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="#eef1f6" strokeWidth={5} />
        <circle
          cx={mid} cy={mid} r={r} fill="none" stroke={tone} strokeWidth={5} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (p / 100) * c}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-[10.5px] font-black text-slate-900 tabular-nums">{label}</span>
      </div>
    </div>
  );
}

// One KPI summary tile for the top stat row.
function StatCard({
  title, value, sub, tone = "slate", right,
}: { title: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "slate" | "emerald" | "rose" | "indigo"; right?: React.ReactNode }) {
  const card = tone === "emerald" ? "bg-emerald-50 border-emerald-200" : tone === "rose" ? "bg-rose-50 border-rose-200" : tone === "indigo" ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200";
  const labelTone = tone === "emerald" ? "text-emerald-600" : tone === "rose" ? "text-rose-600" : tone === "indigo" ? "text-indigo-600" : "text-slate-400";
  const valTone = tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : tone === "indigo" ? "text-indigo-700" : "text-slate-900";
  return (
    <div className={`rounded-xl border shadow-sm px-3.5 py-3 flex items-center justify-between gap-2 ${card}`}>
      <div className="min-w-0">
        <div className={`text-[10px] font-black uppercase tracking-wider truncate ${labelTone}`}>{title}</div>
        <div className={`text-[17px] font-black tabular-nums mt-0.5 truncate ${valTone}`}>{value}</div>
        {sub && <div className="text-[11px] font-bold text-slate-500 mt-0.5 truncate">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

const cleanSym = (s: string) => String(s || "").replace(/^\^/, "").replace(/\.(NS|BO)$/i, "");

/**
 * Professional dark ticker strip — headline instruments with live price,
 * day change and a mini sparkline. Sits at the very top of the dashboard.
 */
function TickerStrip({ spark }: { spark: Record<string, any> }) {
  const fmtPx = (n: number, cur: string) => {
    const d = n < 10 ? 4 : n < 1000 ? 2 : 2;
    return `${cur === "INR" ? "₹" : cur === "USD" ? "$" : ""}${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  };
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
      <div className="flex gap-0 overflow-x-auto no-scrollbar divide-x divide-white/10">
        {TICKER.map((t) => {
          const s = spark[t.symbol];
          const price = s?.price;
          const pct = s?.changePct;
          const up = (pct ?? 0) >= 0;
          return (
            <div key={t.symbol} className="flex items-center gap-3 px-4 py-2.5 shrink-0 min-w-[190px]">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">{t.label}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[15px] font-black text-white tabular-nums">
                    {price != null ? fmtPx(price, s?.currency || "") : "—"}
                  </span>
                  {pct != null && (
                    <span className={`text-[11px] font-black tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`}>
                      {up ? "+" : ""}{pct.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
              <Sparkline data={s?.series || []} up={up} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Crypto price card — its own identity vs. the plain index cards:
 * a coloured coin badge, the coin name + ticker, live price and 24h range.
 */
function CryptoCard({
  it,
  q,
  loading,
}: {
  it: { symbol: string; label: string; ticker: string; glyph: string; grad: string };
  q: any;
  loading: boolean;
}) {
  const up = (q?.changePct ?? 0) >= 0;
  const lvl = (n: any, d = 2) =>
    n == null ? "—" : Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  const lo = q?.dayLow, hi = q?.dayHigh, px = q?.price;
  const pos =
    lo != null && hi != null && px != null && hi > lo
      ? Math.min(96, Math.max(4, ((px - lo) / (hi - lo)) * 100))
      : null;
  const dp = q?.price != null && q.price < 10 ? 4 : 2;
  return (
    <Link
      href={`/charts?symbol=${encodeURIComponent(it.symbol)}`}
      className="group bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`shrink-0 w-7 h-7 rounded-full bg-gradient-to-br ${it.grad} text-white grid place-items-center text-[14px] font-black shadow-sm`}
          >
            {it.glyph}
          </span>
          <span className="text-[13px] font-black text-slate-900 tracking-wide truncate" title={it.label}>{it.ticker}</span>
        </div>
        {q?.changePct != null && (
          <span
            className={`shrink-0 text-[10.5px] font-black px-1.5 py-0.5 rounded ${
              up ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"
            }`}
          >
            {up ? "+" : ""}
            {q.changePct.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[18px] leading-none font-black text-slate-900 tabular-nums">
          {q?.price != null ? `$${lvl(q.price, dp)}` : loading ? "…" : "—"}
        </span>
        {q?.change != null && (
          <span className={`text-[11px] font-bold tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}>
            {up ? "+" : ""}
            {lvl(q.change, Math.abs(q.change) < 10 ? 4 : 2)}
          </span>
        )}
      </div>
      {pos != null && (
        <div className="mt-2.5">
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
          <div className="flex justify-between text-[9.5px] font-bold text-slate-300 mt-1 tabular-nums">
            <span>{lvl(lo, dp === 4 ? 4 : 0)}</span>
            <span>{lvl(hi, dp === 4 ? 4 : 0)}</span>
          </div>
        </div>
      )}
    </Link>
  );
}
