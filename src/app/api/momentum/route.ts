import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();
import { subDays } from "date-fns";
import { normalizeSymbol } from "@/lib/symbolNormalizer";
import { generateMultiTimeframeAnalysis } from "@/lib/multiTimeframeChartService";
import { getMarketContext } from "@/lib/marketContextService";
import { computeMomentum, MOMENTUM_DISCLAIMER } from "@/lib/momentumService";
import { generateJson, AiDisabledError } from "@/lib/aiClient";

/**
 * Fetch quoteSummary modules in fault-tolerant groups. If a group call fails
 * (a module may be unavailable for a given symbol), retry module-by-module so a
 * single missing module never wipes out the rest of the data.
 */
async function fetchSummary(symbol: string) {
  const groups = [
    ["price", "summaryDetail", "summaryProfile", "defaultKeyStatistics", "financialData"],
    ["earnings", "earningsHistory", "earningsTrend", "incomeStatementHistoryQuarterly", "cashflowStatementHistory"],
    ["majorHoldersBreakdown", "fundOwnership", "institutionOwnership", "netSharePurchaseActivity"],
  ];
  const merged: Record<string, any> = {};
  for (const group of groups) {
    try {
      const res: any = await yahooFinance.quoteSummary(symbol, {
        modules: group as any,
      });
      Object.assign(merged, res);
    } catch {
      // Group failed — try each module individually.
      for (const mod of group) {
        try {
          const res: any = await yahooFinance.quoteSummary(symbol, {
            modules: [mod] as any,
          });
          Object.assign(merged, res);
        } catch {
          /* module unavailable for this symbol — skip silently */
        }
      }
    }
  }
  return merged;
}

// Light news sentiment from Yahoo search news — feeds the snapshot's News Impact
// and Data Coverage. Never invents news; returns count 0 cleanly when none.
async function fetchNewsSentiment(symbol: string) {
  try {
    const sr: any = await yahooFinance.search(symbol, { newsCount: 10 });
    const raw = sr?.news || [];
    const POS = ["surge", "gain", "growth", "beat", "strong", "record", "upgrade", "outperform", "profit", "rise", "high", "wins", "expansion", "raises"];
    const NEG = ["drop", "fall", "decline", "miss", "weak", "loss", "downgrade", "cut", "lawsuit", "probe", "fraud", "slump", "warning", "halt"];
    let pos = 0;
    let neg = 0;
    const articles = raw.slice(0, 6).map((a: any) => {
      const t = (a.title || "").toLowerCase();
      const p = POS.filter((w) => t.includes(w)).length;
      const n = NEG.filter((w) => t.includes(w)).length;
      if (p > n) pos++;
      else if (n > p) neg++;
      return {
        title: a.title,
        publisher: a.publisher,
        link: a.link,
        time: a.providerPublishTime || null,
        sentiment: p > n ? "Positive" : n > p ? "Negative" : "Neutral",
      };
    });
    const sentiment = pos > neg ? "Positive" : neg > pos ? "Negative" : "Neutral";
    return { count: raw.length, sentiment, score: pos - neg, articles };
  } catch {
    return { count: 0, sentiment: "Neutral", score: 0, articles: [] };
  }
}

function buildWhatChangedPrompt(baseline: any, current: any, news: any) {
  return `
You are a momentum research analyst. Compare the BASELINE snapshot (when the user started tracking) with the CURRENT momentum data and latest news. Describe ONLY what changed.

STRICT RULES:
- Research support only. NO buy/sell advice. NO prediction of price direction.
- Use only the provided data. Do NOT invent numbers or news.
- If the tracking period is incomplete, say so. Mention data limitations.
- Research language only ("momentum improving/weakening", "watch for confirmation", "trigger not confirmed", "pullback watch", "avoid chasing", "data insufficient").

BASELINE (start): ${JSON.stringify(baseline)}
CURRENT: ${JSON.stringify({ snapshot: current.snapshot, priceStrength: current.priceStrength?.rating, buyerDemand: current.buyerDemand?.rating, shortTermSetup: current.shortTermSetup?.label, scenarios: current.scenarios?.scenarios?.map((s: any) => ({ t: s.title, status: s.status })) })}
LATEST NEWS: ${JSON.stringify(news?.articles || [])}

Return STRICTLY valid JSON (no markdown) matching this schema exactly:
{
  "changeSummary": "",
  "priceChange": "",
  "momentumScoreChange": "",
  "rsiChange": "",
  "adxChange": "",
  "volumeChange": "",
  "supportResistanceChange": "",
  "newsImpact": "",
  "setupImproved": false,
  "setupWeakened": false,
  "keyChanges": [],
  "newRisks": [],
  "whatToMonitorNext": [],
  "finalWatchView": ""
}
`;
}

function buildDeepDivePrompt(momentum: any) {
  return `
You are a professional equity momentum research analyst. Using ONLY the structured momentum data below, produce a clean, professional momentum research briefing.

STRICT RULES:
- This is research support only. Do NOT give buy/sell recommendations.
- Do NOT guarantee any price direction or prediction.
- Do NOT invent data that is not present. Where a section says "Data Unavailable" or "unavailable", say so honestly in dataLimitations.
- Prefer the latest available data. Ignore anything that looks outdated.
- Use research language only (e.g. "momentum improving", "watch for confirmation", "pullback needed", "avoid chasing", "risk elevated").
- Be concise and factual.

MOMENTUM DATA (JSON):
${JSON.stringify(momentum)}

Return STRICTLY valid JSON (no markdown, no extra text) matching this exact schema:
{
  "momentumSummary": "",
  "businessProfile": "",
  "priceStrengthView": "",
  "buyerDemandView": "",
  "quarterlyGrowthView": "",
  "ownershipView": "",
  "qualityView": "",
  "sectorSupportView": "",
  "shortTermSetup": "",
  "keyPositives": [],
  "keyRisks": [],
  "dataLimitations": [],
  "whatToTrackNext": [],
  "finalMomentumView": ""
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

    // ---- Mode B: AI Deep Dive on an already-computed momentum payload ----
    if (body.deepDive && body.momentum) {
      try {
        const parsed = await generateJson(buildDeepDivePrompt(body.momentum), { tier: "reasoning" });
        return NextResponse.json({
          aiDeepDive: parsed || { error: "AI returned no content." },
          disclaimer: MOMENTUM_DISCLAIMER,
        });
      } catch (e: any) {
        const msg =
          e instanceof AiDisabledError
            ? "AI insights are disabled: configure GEMINI_API_KEY or GROQ_API_KEY to enable the AI Momentum Deep Dive."
            : "AI Momentum Deep Dive is busy (model overloaded). Please try again in a few seconds.";
        return NextResponse.json({
          aiDeepDive: { error: msg },
          disclaimer: MOMENTUM_DISCLAIMER,
        });
      }
    }

    // ---- Mode C: AI "What Changed" (baseline vs current) ----
    if (body.whatChanged && body.baseline && body.current) {
      try {
        const parsed = await generateJson(
          buildWhatChangedPrompt(body.baseline, body.current, body.current?.news),
          { tier: "reasoning" },
        );
        return NextResponse.json({
          whatChanged: parsed || { error: "AI returned no content." },
          disclaimer: MOMENTUM_DISCLAIMER,
        });
      } catch (e: any) {
        const msg =
          e instanceof AiDisabledError
            ? "AI insights are disabled: configure GEMINI_API_KEY or GROQ_API_KEY to enable What-Changed analysis."
            : "What-Changed analysis is busy (model overloaded). Please try again in a few seconds.";
        return NextResponse.json({
          whatChanged: { error: msg },
          disclaimer: MOMENTUM_DISCLAIMER,
        });
      }
    }

    // ---- Mode A: compute the momentum payload ----
    let query = body.symbol || body.query || body.q;
    query = query && typeof query === "string" ? query.trim() : null;
    if (!query) {
      return NextResponse.json(
        { error: "symbol is required" },
        { status: 400 },
      );
    }

    // Resolve symbol (page usually passes an already-resolved ticker)
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
        /* try next */
      }
    }
    if (!quote) {
      try {
        const sr: any = await yahooFinance.search(query);
        const best =
          sr.quotes?.find((q: any) => q.quoteType === "EQUITY") || sr.quotes?.[0];
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
        {
          error: `Momentum data unavailable: symbol '${query}' not found from current provider.`,
        },
        { status: 404 },
      );
    }

    const name = quote.shortName || quote.longName || symbol;

    // Parallel data fetch (450d gives a clean 1Y return window + buffer)
    const startDate = subDays(new Date(), 450);
    const [summary, chartRes, mtf, news] = await Promise.all([
      fetchSummary(symbol),
      yahooFinance
        .chart(symbol, {
          period1: startDate.toISOString().split("T")[0],
          interval: "1d",
        })
        .catch(() => null),
      generateMultiTimeframeAnalysis(yahooFinance, symbol).catch(() => null),
      fetchNewsSentiment(symbol),
    ]);

    const dailyCandles =
      (chartRes as any)?.quotes?.filter((q: any) => q && q.close != null) || [];

    const sector =
      (summary as any)?.summaryProfile?.sector ||
      (summary as any)?.assetProfile?.sector ||
      "Unknown";
    const industry =
      (summary as any)?.summaryProfile?.industry ||
      (summary as any)?.assetProfile?.industry ||
      "Unknown";

    let marketContext: any = null;
    try {
      const stockTrend = (mtf as any)?.daily?.trend || "Neutral";
      const stockReturn1M =
        dailyCandles.length > 21
          ? ((dailyCandles[dailyCandles.length - 1].close -
              dailyCandles[dailyCandles.length - 22].close) /
              dailyCandles[dailyCandles.length - 22].close) *
            100
          : 0;
      marketContext = await getMarketContext(
        market,
        sector,
        stockTrend,
        stockReturn1M,
      );
    } catch (e) {
      console.warn("Momentum: market context failed", e);
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

    return NextResponse.json({ momentum });
  } catch (error: any) {
    console.error("Momentum API error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error in momentum module." },
      { status: 500 },
    );
  }
}
