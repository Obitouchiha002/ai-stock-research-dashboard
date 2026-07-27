import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();
import { subDays } from "date-fns";
import { normalizeSymbol } from "@/lib/symbolNormalizer";
import { generateMultiTimeframeAnalysis } from "@/lib/multiTimeframeChartService";
import { getMarketContext } from "@/lib/marketContextService";
import { computeMomentum } from "@/lib/momentumService";
import { computeEvaluation, EVALUATION_DISCLAIMER } from "@/lib/evaluationService";
import { generateJson, AiDisabledError } from "@/lib/aiClient";

const US_INDEX = { symbol: "^GSPC", name: "S&P 500" };
const IN_INDEX = { symbol: "^NSEI", name: "Nifty 50" };

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
          const res: any = await yahooFinance.quoteSummary(symbol, { modules: [mod] as any });
          Object.assign(merged, res);
        } catch {
          /* skip unavailable module */
        }
      }
    }
  }
  return merged;
}

async function fetchNewsSentiment(symbol: string) {
  try {
    const sr: any = await yahooFinance.search(symbol, { newsCount: 10 });
    const raw = sr?.news || [];
    const POS = ["surge", "gain", "growth", "beat", "strong", "record", "upgrade", "outperform", "profit", "rise", "high", "wins"];
    const NEG = ["drop", "fall", "decline", "miss", "weak", "loss", "downgrade", "cut", "lawsuit", "probe", "slump", "warning"];
    let pos = 0;
    let neg = 0;
    raw.slice(0, 8).forEach((a: any) => {
      const t = (a.title || "").toLowerCase();
      const p = POS.filter((w) => t.includes(w)).length;
      const ng = NEG.filter((w) => t.includes(w)).length;
      if (p > ng) pos++;
      else if (ng > p) neg++;
    });
    return { count: raw.length, sentiment: pos > neg ? "Positive" : neg > pos ? "Negative" : "Neutral", score: pos - neg, articles: [] };
  } catch {
    return { count: 0, sentiment: "Neutral", score: 0, articles: [] };
  }
}

function buildAiEvalPrompt(ev: any) {
  return `
You are a professional equity research analyst. Using ONLY the structured evaluation data below, write a clean, professional stock evaluation briefing in the style of an unbiased instant assessment.

STRICT RULES:
- Research support only. NO buy/sell recommendation. NO price prediction or target.
- Use ONLY the provided data. Do NOT invent any number or fact.
- Where a field says "Data insufficient" / "Data Unavailable", acknowledge it honestly.
- Use research language ("momentum improving", "watch for confirmation", "trigger not confirmed", "leadership", "avoid chasing", "risk elevated").
- Reference the actual CAN SLIM Pass/Fail mix and composite rating.

EVALUATION DATA (JSON):
${JSON.stringify(ev)}

Return STRICTLY valid JSON (no markdown) with this exact schema:
{
  "evaluationSummary": "",
  "canSlimView": "",
  "earningsView": "",
  "priceStrengthView": "",
  "demandView": "",
  "groupMarketView": "",
  "qualityView": "",
  "keyStrengths": [],
  "keyWeaknesses": [],
  "dataLimitations": [],
  "whatToTrackNext": [],
  "finalEvaluationView": ""
}
`;
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

    // ---- AI evaluation mode ----
    if (body.aiEval && body.evaluation) {
      try {
        const parsed = await generateJson(buildAiEvalPrompt(body.evaluation), { tier: "reasoning" });
        return NextResponse.json({
          aiEval: parsed || { error: "AI returned no content." },
          disclaimer: EVALUATION_DISCLAIMER,
        });
      } catch (e: any) {
        const msg =
          e instanceof AiDisabledError
            ? "AI insights are disabled: configure a valid GEMINI_API_KEY."
            : "AI evaluation is busy (model overloaded). Please try again in a few seconds.";
        return NextResponse.json({
          aiEval: { error: msg },
          disclaimer: EVALUATION_DISCLAIMER,
        });
      }
    }

    // ---- compute evaluation ----
    let query = body.symbol || body.query;
    query = query && typeof query === "string" ? query.trim() : null;
    if (!query) return NextResponse.json({ error: "symbol is required" }, { status: 400 });

    const norm = normalizeSymbol(query, market);
    const trySymbols = norm ? norm.possibleSymbols : [query];
    let symbol = query;
    let quote: any = null;
    for (const sym of trySymbols) {
      try {
        const q: any = await yahooFinance.quote(sym);
        if (q && q.regularMarketPrice) {
          quote = q;
          symbol = q.symbol;
          break;
        }
      } catch {
        /* next */
      }
    }
    if (!quote) {
      try {
        const sr: any = await yahooFinance.search(query);
        const best = sr.quotes?.find((q: any) => q.quoteType === "EQUITY") || sr.quotes?.[0];
        if (best) {
          symbol = best.symbol;
          quote = await yahooFinance.quote(symbol);
        }
      } catch {
        /* fall through */
      }
    }
    if (!quote) {
      return NextResponse.json(
        { error: `Evaluation unavailable: symbol '${query}' not found from current provider.` },
        { status: 404 },
      );
    }

    const name = quote.shortName || quote.longName || symbol;
    const index =
      market === "IN" || market === "NSE" || market === "BSE" ? IN_INDEX : US_INDEX;
    const startDate = subDays(new Date(), 450);

    const [summary, chartRes, mtf, news, indexChart] = await Promise.all([
      fetchSummary(symbol),
      yahooFinance.chart(symbol, { period1: startDate.toISOString().split("T")[0], interval: "1d" }).catch(() => null),
      generateMultiTimeframeAnalysis(yahooFinance, symbol).catch(() => null),
      fetchNewsSentiment(symbol),
      yahooFinance.chart(index.symbol, { period1: startDate.toISOString().split("T")[0], interval: "1d" }).catch(() => null),
    ]);

    const dailyCandles = (chartRes as any)?.quotes?.filter((q: any) => q && q.close != null) || [];
    const indexCandles = (indexChart as any)?.quotes?.filter((q: any) => q && q.close != null) || [];

    const sector = (summary as any)?.summaryProfile?.sector || "Unknown";
    const industry = (summary as any)?.summaryProfile?.industry || "Unknown";

    let marketContext: any = null;
    try {
      const stockTrend = (mtf as any)?.daily?.trend || "Neutral";
      const ret1M =
        dailyCandles.length > 21
          ? ((dailyCandles[dailyCandles.length - 1].close - dailyCandles[dailyCandles.length - 22].close) /
              dailyCandles[dailyCandles.length - 22].close) *
            100
          : 0;
      marketContext = await getMarketContext(market, sector, stockTrend, ret1M);
    } catch (e) {
      console.warn("Evaluation: market context failed", e);
    }

    const momentum = computeMomentum({
      symbol,
      name,
      quote,
      summary,
      mtf,
      marketContext,
      dailyCandles,
      sector,
      industry,
      news,
    });

    const evaluation = computeEvaluation({
      momentum,
      summary,
      marketContext,
      stockCandles: dailyCandles,
      indexCandles,
      indexName: index.name,
    });

    return NextResponse.json({ evaluation });
  } catch (error: any) {
    console.error("Evaluation API error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error in evaluation module." },
      { status: 500 },
    );
  }
}
