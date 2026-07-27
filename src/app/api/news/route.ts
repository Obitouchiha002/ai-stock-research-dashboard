import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

// Broad market-news queries so news loads WITHOUT any watchlist.
const MARKET_QUERIES: Record<string, string[]> = {
  US: ["stock market", "S&P 500", "Nasdaq", "Federal Reserve", "Wall Street"],
  IN: ["Nifty 50", "Sensex", "Indian stock market", "RBI", "BSE NSE"],
};

const POS = ["surge", "gain", "growth", "beat", "strong", "record", "upgrade", "outperform", "profit", "rise", "high", "wins", "rally", "jump", "soar", "boost"];
const NEG = ["drop", "fall", "decline", "miss", "weak", "loss", "downgrade", "cut", "lawsuit", "probe", "fraud", "slump", "warning", "halt", "plunge", "crash", "fear", "concern"];
const HIGH_IMPACT = ["earnings", "merger", "acquisition", "fed", "rbi", "inflation", "guidance", "lawsuit", "sec", "sebi", "rate", "results", "ceo"];

function classify(title: string) {
  const t = (title || "").toLowerCase();
  const p = POS.filter((w) => t.includes(w)).length;
  const ng = NEG.filter((w) => t.includes(w)).length;
  const sentiment = p > ng ? "Positive" : ng > p ? "Negative" : "Neutral";

  let category = "Other";
  if (/(earnings|profit|revenue|results|quarter|eps|guidance|q[1-4])/.test(t)) category = "Earnings";
  else if (/(merger|acquisition|acquire|takeover|deal|stake|buyout)/.test(t)) category = "M&A";
  else if (/(fed|rbi|inflation|interest rate|gdp|economy|tariff|crude|oil|rupee|dollar|bond|yield)/.test(t)) category = "Macro";
  else if (/(sebi|sec|regulator|lawsuit|probe|investigation|ban|fine|penalty|court)/.test(t)) category = "Regulation";
  else if (/(ceo|cfo|resign|appoint|board|director|management|chairman)/.test(t)) category = "Management";
  else if (/(launch|product|unveil|partnership|expansion|order|contract)/.test(t)) category = "Product";

  const impact = HIGH_IMPACT.some((w) => t.includes(w))
    ? "High"
    : p > 0 || ng > 0
      ? "Medium"
      : "Low";

  return { sentiment, category, impact };
}

function toMs(v: any): number | null {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v > 1e12 ? v : v * 1000; // sec vs ms
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function timeAgo(ms: number | null): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function normalize(a: any, symbol?: string) {
  const ms = toMs(a.providerPublishTime);
  const { sentiment, category, impact } = classify(a.title || "");
  return {
    title: a.title || "Untitled",
    url: a.link || "#",
    source: a.publisher || "Unknown",
    symbol: symbol || a.relatedTickers?.[0] || null,
    time: ms,
    timeAgo: timeAgo(ms),
    sentiment,
    category,
    impact,
  };
}

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
// force-dynamic prevents build-time prerendering of this handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    const market = (url.searchParams.get("market") || "US").toUpperCase();

    // ---- Per-stock news ----
    if (symbol) {
      const sr: any = await yahooFinance.search(symbol, { newsCount: 20 }).catch(() => null);
      const raw = sr?.news || [];
      const articles = raw.map((a: any) => normalize(a, symbol));
      return NextResponse.json({
        success: true,
        scope: "stock",
        symbol,
        articles,
        message: articles.length === 0 ? "Live news unavailable for this symbol from current provider." : "",
      });
    }

    // ---- Market news (no watchlist needed) ----
    const queries = MARKET_QUERIES[market] || MARKET_QUERIES.US;
    const results = await Promise.all(
      queries.map((q) =>
        yahooFinance
          .search(q, { newsCount: 10 })
          .then((r: any) => r?.news || [])
          .catch(() => []),
      ),
    );

    // Flatten + dedupe by title
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const arr of results) {
      for (const a of arr) {
        const key = (a.title || "").toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(normalize(a));
      }
    }
    merged.sort((a, b) => (b.time || 0) - (a.time || 0));

    return NextResponse.json({
      success: true,
      scope: "market",
      market,
      articles: merged.slice(0, 30),
      message: merged.length === 0 ? "Live market news temporarily unavailable from current provider." : "",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e), articles: [] }, { status: 500 });
  }
}
