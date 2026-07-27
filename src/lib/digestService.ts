import YahooFinance from "yahoo-finance2";
import { generatePerplexity, perplexityConfigured, generateText, AiDisabledError } from "@/lib/aiClient";

const yahooFinance = new YahooFinance();

export const DIGEST_DISCLAIMER =
  "Daily digest of the last 24 hours. Research support only. Not buy/sell advice. No guaranteed prediction. Always verify data independently.";

const DAY_MS = 24 * 60 * 60 * 1000;

export type StockInput = { symbol: string; name?: string };

function toMs(v: any): number | null {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function timeAgo(ms: number | null): string {
  if (!ms) return "";
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Split a model reply into clean bullets, dropping preamble + model
// meta-commentary about the search/data (not about the stock).
function toBullets(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").replace(/\*+/g, "").trim())
    .filter(
      (l) =>
        l.length > 3 &&
        !/:$/.test(l) &&
        !/^(here('?s| is| are)|the following|summary|below|in the last 24|the provided|note:)/i.test(l) &&
        !/^no material developments/i.test(l) &&
        !/search results|date inconsisten|provided results|within the (requested|specific)|were (found|reported)|appear to be ai-generated|timeframe|no verified/i.test(l) &&
        !/no direct news|not mention|absence of|do not mention|unrelated to|no headlines|no company-specific|no significant news|quiet period|provided headlines|no specific news/i.test(l),
    );
}

export type StockDigest = {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
  summary: string;
  bullets: string[];
  citations: string[];
  news: any[];
  source: "perplexity" | "ai-news" | "news-only" | "none";
};

async function digestOne(stock: StockInput): Promise<StockDigest> {
  const symbol = stock.symbol;
  const name = stock.name || symbol;

  let price: number | null = null;
  let changePct: number | null = null;
  try {
    const q: any = await yahooFinance.quote(symbol);
    price = q?.regularMarketPrice ?? null;
    changePct = typeof q?.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null;
  } catch {
    /* ignore */
  }

  let news: any[] = [];
  try {
    const sr: any = await yahooFinance.search(symbol, { newsCount: 20 }).catch(() => null);
    const raw = sr?.news || [];
    news = raw
      .map((a: any) => {
        const ms = toMs(a.providerPublishTime);
        return { title: a.title || "Untitled", url: a.link || "#", source: a.publisher || "", time: ms, timeAgo: timeAgo(ms) };
      })
      .filter((a: any) => a.time && Date.now() - a.time <= DAY_MS)
      .sort((a: any, b: any) => (b.time || 0) - (a.time || 0))
      .slice(0, 6);
  } catch {
    /* ignore */
  }

  let summary = "";
  let bullets: string[] = [];
  let citations: string[] = [];
  let source: StockDigest["source"] = "none";

  const today = new Date().toDateString();
  const pplxPrompt = `Today is ${today}. For the stock ${name} (${symbol}), list the most recent material developments (news, analyst rating/target changes, earnings/guidance, filings, management or product news, sector/macro events that hit it).
Return 2-5 short factual bullet points of what happened. Each bullet must be a plain statement of an event.
Do NOT comment on data quality, dates, timestamps, sources, or the search process. Do NOT say the results are inconsistent or outdated. If there is genuinely nothing, reply exactly: "No material developments in the last 24 hours."
Rules: research language only, NO buy/sell advice, NO price predictions. Be concise.`;

  // Perplexity (live web) is primary. If it answers at all, trust it.
  if (perplexityConfigured()) {
    const r = await generatePerplexity(pplxPrompt);
    if (r && r.text) {
      source = "perplexity";
      citations = r.citations || [];
      bullets = toBullets(r.text);
      summary = bullets.length ? r.text.trim() : "No material developments in the last 24 hours.";
    }
  }

  // Fallback only when Perplexity gave nothing at all.
  if (source === "none" && news.length > 0) {
    try {
      const headlines = news.map((n, i) => `${i + 1}. ${n.title} (${n.source}, ${n.timeAgo})`).join("\n");
      const aiPrompt = `These are recent market headlines. Extract ONLY items specifically about ${name} (${symbol}):
${headlines}
List 2-4 short factual bullets about ${symbol}. If NONE of the headlines are specifically about it, reply exactly: "No material developments in the last 24 hours." Do NOT describe unrelated headlines. Research language only, NO buy/sell advice.`;
      const text = await generateText(aiPrompt, { tier: "fast" });
      bullets = toBullets(text);
      summary = bullets.length ? text.trim() : "No material developments in the last 24 hours.";
      source = bullets.length ? "ai-news" : "none";
    } catch (e) {
      if (!(e instanceof AiDisabledError)) console.warn("digest ai fallback failed", symbol);
    }
  }

  if (source === "none" && news.length > 0) source = "news-only";
  if (!summary) summary = "No material developments found in the last 24 hours.";

  return { symbol, name, price, changePct, summary, bullets, citations, news, source };
}

// Run the digest for up to 10 stocks in parallel.
export async function runDigest(stocks: StockInput[]) {
  const clean = stocks
    .map((s) => ({ symbol: String(s.symbol || "").trim().toUpperCase(), name: s.name }))
    .filter((s) => s.symbol)
    .slice(0, 10);
  const digests = (await Promise.all(clean.map((s) => digestOne(s).catch(() => null)))).filter(
    Boolean,
  ) as StockDigest[];
  return {
    disclaimer: DIGEST_DISCLAIMER,
    generatedAt: new Date().toISOString(),
    usedPerplexity: perplexityConfigured(),
    digests,
  };
}
