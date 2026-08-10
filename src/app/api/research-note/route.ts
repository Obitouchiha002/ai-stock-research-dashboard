import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();
import { subDays } from "date-fns";
import { normalizeSymbol } from "@/lib/symbolNormalizer";
import { generateMultiTimeframeAnalysis } from "@/lib/multiTimeframeChartService";
import { getMarketContext } from "@/lib/marketContextService";
import { computeMomentum } from "@/lib/momentumService";
import { computeEvaluation } from "@/lib/evaluationService";
import { computeAnalytics } from "@/lib/analyticsService";
import { generateJson, generateGrounded, AiDisabledError } from "@/lib/aiClient";

const DISCLAIMER =
  "Research / tracking input only. Not buy/sell advice. No guaranteed prediction. Some ratings are StockAnalytix's own computed equivalents (not a third-party proprietary score). Always verify against latest disclosures.";

const US_INDEX = { symbol: "^GSPC", name: "S&P 500" };
const IN_INDEX = { symbol: "^NSEI", name: "Nifty 50" };
const isIndia = (m: string) => m === "IN" || m === "NSE" || m === "BSE";

async function fetchSummary(symbol: string) {
  const groups = [
    ["price", "summaryDetail", "summaryProfile", "defaultKeyStatistics", "financialData"],
    ["earnings", "earningsHistory", "earningsTrend", "incomeStatementHistory", "incomeStatementHistoryQuarterly", "cashflowStatementHistory"],
    ["majorHoldersBreakdown", "fundOwnership", "institutionOwnership", "netSharePurchaseActivity"],
  ];
  const merged: Record<string, any> = {};
  for (const group of groups) {
    try {
      const res: any = await yahooFinance.quoteSummary(symbol, { modules: group as any });
      Object.assign(merged, res);
    } catch {
      for (const mod of group) {
        try {
          const r: any = await yahooFinance.quoteSummary(symbol, { modules: [mod] as any });
          Object.assign(merged, r);
        } catch {}
      }
    }
  }
  return merged;
}

async function fetchNews(symbol: string) {
  try {
    const sr: any = await yahooFinance.search(symbol, { newsCount: 8 });
    const raw = sr?.news || [];
    const POS = ["surge", "gain", "beat", "strong", "record", "upgrade", "rise", "profit", "growth"];
    const NEG = ["drop", "fall", "miss", "weak", "loss", "downgrade", "cut", "lawsuit", "probe"];
    let p = 0, n = 0;
    const articles = raw.slice(0, 8).map((a: any) => {
      const t = (a.title || "").toLowerCase();
      const x = POS.filter((w) => t.includes(w)).length;
      const y = NEG.filter((w) => t.includes(w)).length;
      if (x > y) p++; else if (y > x) n++;
      return { title: a.title, publisher: a.publisher };
    });
    return { count: raw.length, sentiment: p > n ? "Positive" : n > p ? "Negative" : "Neutral", score: p - n, articles };
  } catch {
    return { count: 0, sentiment: "Neutral", score: 0, articles: [] };
  }
}

// derive a simple traffic-light status from a label/value
function statusFor(label: string): "g" | "a" | "r" | "n" {
  const l = (label || "").toLowerCase();
  if (/(strong|accelerat|outperform|positive|leader|great|good|debt-free|uptrend|healthy|reasonable|improving|a\+|a-|^a$)/.test(l)) return "g";
  if (/(mixed|neutral|watch|average|fair|stable|moderate|pullback|partial|^b)/.test(l)) return "a";
  if (/(weak|negative|distribution|downtrend|expensive|poor|avoid|elevated|critical|fail|^d|^e)/.test(l)) return "r";
  return "n";
}

function buildPrompt(data: any, webResearch: string, businessSummary: string, newsList: any[]) {
  return `
You are a senior CANSLIM equity research analyst (William O'Neil style). Produce a DEEP, MarketSmith-grade research note.

STRICT RULES:
- Research / tracking input only. ABSOLUTELY NO buy/sell/hold recommendation as YOUR advice. NEVER output "Buy" or "Sell" as an action. The "bottomLine.action" field MUST be one of: "Add to Watchlist", "Study Further", "Monitor", "Wait for Confirmation", "Avoid for Now". You MAY cite third-party analyst consensus if it appears in the research text (clearly attributed).
- NO price target as a recommendation. NO guaranteed prediction.
- Prefer specifics: name actual contracts, JVs, partners, patents, segments, revenue-mix %, guidance, and named risks when present in the WEB RESEARCH or NEWS. Use concrete numbers and proper nouns.
- Be thorough: aim for 4-6 rows per table and 4-6 items per list WHERE the data/summary supports it. Do NOT invent facts — if web research is empty, write what the business summary + computed data support and keep claims general (fewer, honest rows).
- Use research language ("momentum improving", "watch for confirmation", "extended", "richly valued").

COMPUTED DATA (accurate, from market data): ${JSON.stringify(data)}
COMPANY BUSINESS SUMMARY: ${businessSummary || "(not provided)"}
WEB RESEARCH BRIEF (may be empty if unavailable): ${webResearch || "(web research unavailable — rely on summary + data)"}
RECENT NEWS HEADLINES: ${JSON.stringify((newsList || []).slice(0, 8).map((a: any) => a.title || a.headline).filter(Boolean))}

Return STRICTLY valid JSON (no markdown) with this exact schema:
{
  "businessProfile": "3-5 sentence detailed profile",
  "businessDetails": [{"area":"","insight":"","read":""}],
  "competitiveAdvantages": [],
  "moatFactors": [{"factor":"","evidence":"","strength":""}],
  "growthDrivers": [{"driver":"","timeframe":"","impact":"","evidence":""}],
  "industryFactors": [{"factor":"","tailwind":"","read":""}],
  "sectorTailwinds": [],
  "riskFactors": [{"risk":"","severity":"","why":"","track":""}],
  "keyRisks": [],
  "scorecardRead": "",
  "technicalRead": "",
  "quarterlyRead": "",
  "ownershipRead": "",
  "financialRead": "",
  "masterScoreRead": "",
  "topPositives": [],
  "topRedFlags": [],
  "finalView": "",
  "trackNext": [],
  "threeLine": {"working":"","notConfirmed":"","trackBefore":""},
  "selfAnalysis": [{"area":"","review":""}],
  "confidenceLevel": "",
  "verificationQuestions": [{"question":"","source":"","why":""}],
  "bottomLine": {"decision":"","action":"","confidence":"","mainReason":"","mainRisk":"","confirmationNeeded":"","investabilityView":""}
}
`;
}

function buildResearchQuery(name: string, symbol: string, sector: string) {
  return `Research the listed company "${name}" (ticker ${symbol}, sector ${sector}) using current web sources. Provide a detailed factual brief covering:
- Business segments and revenue mix (%)
- Key long-term contracts, JVs, partnerships (names, terms, durations)
- Patents / IP / technology edge
- Major growth drivers with specifics (new plants, capacity, new products/verticals)
- Customer concentration and major customers
- Latest management guidance and targets
- Segment-wise or recent margins
- Sector/industry size, growth rate and tailwinds
- Specific named risks (tariffs, regulatory actions, dumping, concentration)
- Recent material developments (last 12 months)
Give concrete numbers and proper nouns. This is for an equity research note — be factual and cite specifics.`;
}

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
// force-dynamic prevents build-time prerendering of this handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const market = body.market || "US";
    let query = body.symbol || body.query;
    query = query && typeof query === "string" ? query.trim() : null;
    if (!query) return NextResponse.json({ error: "symbol is required" }, { status: 400 });

    // resolve
    const norm = normalizeSymbol(query, market);
    const trySymbols = norm ? norm.possibleSymbols : [query];
    let symbol = query;
    let quote: any = null;
    for (const sym of trySymbols) {
      try {
        const q: any = await yahooFinance.quote(sym);
        if (q && q.regularMarketPrice) { quote = q; symbol = q.symbol; break; }
      } catch {}
    }
    if (!quote) {
      try {
        const sr: any = await yahooFinance.search(query);
        const best = sr.quotes?.find((q: any) => q.quoteType === "EQUITY") || sr.quotes?.[0];
        if (best) { symbol = best.symbol; quote = await yahooFinance.quote(symbol); }
      } catch {}
    }
    if (!quote) return NextResponse.json({ error: `Research note unavailable: '${query}' not found.` }, { status: 404 });

    const name = quote.shortName || quote.longName || symbol;
    const index = isIndia(market) ? IN_INDEX : US_INDEX;
    const start = subDays(new Date(), 365 * 4 + 30);

    const [summary, chartRes, mtf, news, indexChart] = await Promise.all([
      fetchSummary(symbol),
      yahooFinance.chart(symbol, { period1: subDays(new Date(), 450).toISOString().split("T")[0], interval: "1d" }).catch(() => null),
      generateMultiTimeframeAnalysis(yahooFinance, symbol).catch(() => null),
      fetchNews(symbol),
      yahooFinance.chart(index.symbol, { period1: subDays(new Date(), 450).toISOString().split("T")[0], interval: "1d" }).catch(() => null),
    ]);
    // longer chart for analytics (backtest/seasonality)
    const longChart: any = await yahooFinance.chart(symbol, { period1: start.toISOString().split("T")[0], interval: "1d" }).catch(() => null);

    const dailyCandles = (chartRes as any)?.quotes?.filter((q: any) => q && q.close != null) || [];
    const indexCandles = (indexChart as any)?.quotes?.filter((q: any) => q && q.close != null) || [];
    const longCandles = (longChart?.quotes || []).filter((q: any) => q && q.close != null);

    const sector = (summary as any)?.summaryProfile?.sector || "Unknown";
    const industry = (summary as any)?.summaryProfile?.industry || "Unknown";

    let marketContext: any = null;
    try {
      const ret1M = dailyCandles.length > 21
        ? ((dailyCandles[dailyCandles.length - 1].close - dailyCandles[dailyCandles.length - 22].close) / dailyCandles[dailyCandles.length - 22].close) * 100
        : 0;
      marketContext = await getMarketContext(market, sector, (mtf as any)?.daily?.trend || "Neutral", ret1M);
    } catch {}

    const momentum = computeMomentum({ symbol, name, quote, summary, mtf, marketContext, dailyCandles, sector, industry, news });
    const evaluation = computeEvaluation({ momentum, summary, marketContext, stockCandles: dailyCandles, indexCandles, indexName: index.name });
    const analytics = computeAnalytics(longCandles.length > dailyCandles.length ? longCandles : dailyCandles);

    // ---- assemble the structured report ----
    const daily = (mtf as any)?.daily || {};
    const price = momentum.snapshot ? (quote.regularMarketPrice ?? null) : null;

    const snapshot = [
      ["Company", name, "n"],
      ["Sector / Industry", `${sector} — ${industry}`, "n"],
      ["Market Cap", momentum.company?.marketCap, "n"],
      ["Composite Rating", `${evaluation.composite?.rating ?? "—"} / 100 (${evaluation.composite?.label})`, statusFor(evaluation.composite?.label)],
      ["CAN SLIM Score", `${evaluation.canSlim?.scorePct ?? "—"} (${evaluation.canSlim?.passes}/7 pass)`, statusFor(evaluation.canSlim?.summaryLabel)],
      ["EPS Strength (trend)", momentum.quarterlyEps?.trendLabel, statusFor(momentum.quarterlyEps?.trendLabel)],
      ["Price Strength", momentum.priceStrength?.rating, statusFor(momentum.priceStrength?.rating)],
      ["Buyer Demand (Acc/Dis)", `${momentum.buyerDemand?.rating} (Grade ${evaluation.accDis?.grade})`, statusFor(momentum.buyerDemand?.rating)],
      ["SMR Quality Grade", evaluation.smr?.grade, statusFor("Grade " + evaluation.smr?.grade)],
      ["Beta / Alpha", `${evaluation.alphaBeta?.beta} / ${evaluation.alphaBeta?.alpha}`, "n"],
      ["Debt/Equity", momentum.qualityRatios?.metrics?.debtEquity, "n"],
      ["Trend / Setup", `${daily.trend || "—"} · ${momentum.shortTermSetup?.label}`, statusFor(daily.trend)],
      ["Extension Risk", momentum.snapshot?.extensionRisk, statusFor(momentum.snapshot?.extensionRisk === "Low" ? "good" : momentum.snapshot?.extensionRisk)],
      ["Final Momentum View", momentum.snapshot?.finalMomentumView, statusFor(momentum.snapshot?.finalMomentumView)],
    ];

    const reportData = {
      symbol, name, price, market,
      company: momentum.company,
      composite: evaluation.composite,
      canSlim: evaluation.canSlim,
      priceStrength: momentum.priceStrength,
      buyerDemand: momentum.buyerDemand,
      accDis: evaluation.accDis,
      smr: evaluation.smr,
      alphaBeta: evaluation.alphaBeta,
      sectorRank: momentum.sectorRank,
      quarterlyEps: momentum.quarterlyEps,
      quarterlySales: momentum.quarterlySales,
      forwardValuation: momentum.forwardValuation,
      qualityRatios: momentum.qualityRatios,
      cashFlow: momentum.cashFlow,
      dilution: momentum.dilution,
      ownership: momentum.ownership,
      fundHolders: momentum.fundHolders,
      multiYear: evaluation.multiYear,
      shortTermSetup: momentum.shortTermSetup,
      technical: {
        trend: daily.trend, rsi: daily.rsi, rsiLabel: daily.rsiLabel, adx: daily.adx, adxLabel: daily.adxLabel,
        support: daily.support, resistance: daily.resistance, volumeSignal: daily.volumeSignal,
        sma: daily.sma, ema: daily.ema, extensionRisk: (mtf as any)?.extensionRisk, setupLabel: (mtf as any)?.setupLabel,
        alignmentLabel: (mtf as any)?.alignmentLabel,
      },
      backtest: analytics.backtest,
      seasonality: analytics.seasonality,
      news,
    };

    // The web-grounded research + the reasoning AI narrative are the SLOW part
    // (two chained LLM calls). Only run them when the client asks (skipAi=false),
    // so the tab loads the computed sections instantly and the narrative is
    // generated on demand via a button.
    const businessSummary = (summary as any)?.summaryProfile?.longBusinessSummary || "";
    let webResearch = "";
    let ai: any = null;
    if (!body.skipAi) {
      try {
        webResearch = await generateGrounded(buildResearchQuery(name, symbol, sector));
      } catch {
        webResearch = "";
      }
      try {
        ai = await generateJson(buildPrompt(reportData, webResearch, businessSummary, (news as any).articles || []), { tier: "reasoning" });
      } catch (e) {
        ai = { error: e instanceof AiDisabledError ? "AI disabled (configure GEMINI_API_KEY/GROQ_API_KEY)." : "AI narrative busy; computed sections below are still accurate." };
      }
      if (ai && typeof ai === "object") {
        ai.webResearchUsed = !!webResearch;
        // Hard guardrail: never let a raw Buy/Sell recommendation slip through.
        if (ai.bottomLine?.action && /\b(buy|sell)\b/i.test(ai.bottomLine.action)) {
          ai.bottomLine.action = "Add to Watchlist / Study Further (research only)";
        }
        const scrub = (v: any) =>
          typeof v === "string"
            ? v.replace(/\b(buy now|sell now|strong buy|strong sell|must buy|should buy)\b/gi, "watch closely")
            : v;
        if (ai.bottomLine) {
          ai.bottomLine.investabilityView = scrub(ai.bottomLine.investabilityView);
          ai.bottomLine.mainReason = scrub(ai.bottomLine.mainReason);
        }
        ai.finalView = scrub(ai.finalView);
      }
    }

    return NextResponse.json({
      note: {
        symbol, name, price, market, sector, industry,
        generatedAt: new Date().toISOString(),
        disclaimer: DISCLAIMER,
        snapshot,
        sections: reportData,
        ai,
      },
    });
  } catch (error: any) {
    console.error("Research note error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error in research note." }, { status: 500 });
  }
}
