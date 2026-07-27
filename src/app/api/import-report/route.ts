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
import { generateJson, AiDisabledError, runWithUsage, currentUsage } from "@/lib/aiClient";

const DISCLAIMER =
  "Imported third-party report processed for research only. Not buy/sell advice. Figures are extracted as-shown from your uploaded report and cross-checked against live market data; verify against original filings.";

// strip HTML to plain text (reports are often pasted as HTML)
function htmlToText(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(tr|p|h[1-6]|li|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#8377;/g, "₹")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractPrompt(text: string) {
  return `
You are a data-extraction engine. The user pasted a third-party stock research report (e.g. MarketSmith / Market Mojo). Extract its data into structured JSON. Extract ONLY what is present in the report — do NOT invent. Preserve native ratings/numbers exactly as shown.

REPORT TEXT:
"""${text.slice(0, 14000)}"""

Return STRICTLY valid JSON (no markdown):
{
  "company": "",
  "symbolGuess": "",
  "exchange": "",
  "source": "",
  "asOf": "",
  "price": "",
  "ratings": [{"name":"","value":"","read":""}],
  "keyFacts": [],
  "quarterly": [{"quarter":"","eps":"","epsChg":"","sales":"","salesChg":""}],
  "ownership": [{"holder":"","value":""}],
  "financials": [{"fy":"","sales":"","roe":"","roce":"","margin":"","debtEq":""}],
  "valuation": "",
  "positives": [],
  "redFlags": [],
  "verdict": "",
  "trackNext": []
}
`;
}

function comparePrompt(imported: any, ours: any, freshness: any) {
  return `
You are a research analyst. A user imported a DATED third-party research report. Your job is to make it ACTIONABLE: judge whether its thesis still holds given LIVE data and the price move since the report, validate its claims, and flag what changed.

RULES: Research/tracking language only. NO buy/sell advice. NO prediction.

IMPORTED REPORT (third-party, dated ${freshness.asOf || "unknown"}): ${JSON.stringify(imported)}
OUR LIVE COMPUTED DATA (now): ${JSON.stringify(ours)}
PRICE MOVE SINCE REPORT: report price ${freshness.reportPrice ?? "?"} -> live price ${freshness.livePrice ?? "?"} = ${freshness.priceChangePct != null ? freshness.priceChangePct.toFixed(1) + "%" : "unknown"}.

Decide "stillValid": "Yes" (thesis and key data still hold), "Partially" (some parts stale/changed), "No" (materially outdated/invalidated), or "Cannot assess" (insufficient overlap).

Return STRICTLY valid JSON:
{
  "stillValid": "",
  "validityReason": "1-2 sentences on whether the report's view still holds and why",
  "whatChangedSinceReport": ["concrete changes since the report date — price, momentum, RSI, trend, what to re-check"],
  "combinedSummary": "",
  "agreements": ["report claims our live data confirms"],
  "discrepancies": ["report claims that differ from our live data — investigate"],
  "dataValidation": [{"metric":"","imported":"","ours":"","verdict":""}],
  "finalView": ""
}
`;
}

function parseNum(s: any): number | null {
  const m = String(s ?? "").replace(/[, ₹$]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
// force-dynamic prevents build-time prerendering of this handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return runWithUsage(async () => {
  try {
    const body = await req.json();
    const raw = body.reportText || body.text || "";
    if (!raw || typeof raw !== "string" || raw.trim().length < 80) {
      return NextResponse.json({ error: "Paste a report (at least a few lines)." }, { status: 400 });
    }
    const market = body.market || "IN";
    const text = htmlToText(raw);

    // 1) Extract structured data from the report
    let imported: any;
    try {
      imported = await generateJson(extractPrompt(text), { tier: "reasoning" });
    } catch (e) {
      return NextResponse.json({
        error: e instanceof AiDisabledError
          ? "AI is disabled — configure GEMINI_API_KEY/GROQ_API_KEY to parse reports."
          : "Could not parse the report right now. Try again in a few seconds.",
      }, { status: 503 });
    }

    // 2) Resolve symbol and compute OUR data (best-effort)
    let ourData: any = null;
    let resolvedSymbol = "";
    const guess = (body.symbol || imported?.symbolGuess || "").toString().trim();
    if (guess) {
      const mkt = (imported?.exchange || "").toUpperCase().includes("NSE") ? "NSE"
        : (imported?.exchange || "").toUpperCase().includes("BSE") ? "BSE" : market;
      const norm = normalizeSymbol(guess, mkt);
      const trySymbols = norm ? norm.possibleSymbols : [guess];
      let quote: any = null;
      for (const sym of trySymbols) {
        try { const q: any = await yahooFinance.quote(sym); if (q?.regularMarketPrice) { quote = q; resolvedSymbol = q.symbol; break; } } catch {}
      }
      if (quote) {
        try {
          const summary: any = await yahooFinance.quoteSummary(resolvedSymbol, {
            modules: ["price", "summaryDetail", "summaryProfile", "defaultKeyStatistics", "financialData", "earnings", "earningsHistory", "earningsTrend", "incomeStatementHistory", "incomeStatementHistoryQuarterly", "cashflowStatementHistory", "majorHoldersBreakdown"] as any,
          }).catch(() => ({}));
          const chartRes: any = await yahooFinance.chart(resolvedSymbol, { period1: subDays(new Date(), 450).toISOString().split("T")[0], interval: "1d" }).catch(() => null);
          const idxName = mkt === "NSE" || mkt === "BSE" || mkt === "IN" ? "^NSEI" : "^GSPC";
          const indexChart: any = await yahooFinance.chart(idxName, { period1: subDays(new Date(), 450).toISOString().split("T")[0], interval: "1d" }).catch(() => null);
          const mtf = await generateMultiTimeframeAnalysis(yahooFinance, resolvedSymbol).catch(() => null);
          const dailyCandles = (chartRes?.quotes || []).filter((q: any) => q && q.close != null);
          const indexCandles = (indexChart?.quotes || []).filter((q: any) => q && q.close != null);
          const sector = summary?.summaryProfile?.sector || "Unknown";
          let marketContext: any = null;
          try { marketContext = await getMarketContext(mkt, sector, (mtf as any)?.daily?.trend || "Neutral", 0); } catch {}
          const momentum = computeMomentum({ symbol: resolvedSymbol, name: quote.shortName || quote.longName || resolvedSymbol, quote, summary, mtf, marketContext, dailyCandles, sector, industry: summary?.summaryProfile?.industry || "Unknown", news: { count: 0, sentiment: "Neutral", articles: [] } });
          const evaluation = computeEvaluation({ momentum, summary, marketContext, stockCandles: dailyCandles, indexCandles, indexName: idxName === "^NSEI" ? "Nifty 50" : "S&P 500" });
          ourData = {
            symbol: resolvedSymbol,
            price: quote.regularMarketPrice,
            compositeRating: evaluation.composite?.rating,
            canSlim: `${evaluation.canSlim?.passes}/7 (${evaluation.canSlim?.summaryLabel})`,
            priceStrength: momentum.priceStrength?.rating,
            buyerDemand: momentum.buyerDemand?.rating,
            accDis: evaluation.accDis?.grade,
            smr: evaluation.smr?.grade,
            beta: evaluation.alphaBeta?.beta,
            alpha: evaluation.alphaBeta?.alpha,
            roe: momentum.qualityRatios?.metrics?.roe,
            debtEquity: momentum.qualityRatios?.metrics?.debtEquity,
            quarterlyEps: momentum.quarterlyEps?.trendLabel,
            momentumView: momentum.snapshot?.finalMomentumView,
            multiYear: evaluation.multiYear?.years,
          };

          // Our UNIQUE insights — things the third-party report does NOT have.
          try {
            const an = computeAnalytics(dailyCandles);
            const topSignal = (an.backtest?.signals || [])
              .filter((s: any) => s.occurrences >= 3)
              .map((s: any) => ({ ...s, h20: s.horizons?.find((h: any) => h.horizon === 20) }))
              .sort((a: any, b: any) => (b.h20?.avg ?? -99) - (a.h20?.avg ?? -99))[0];
            ourData.uniqueInsights = {
              backtest: topSignal ? {
                signal: topSignal.name,
                occurrences: topSignal.occurrences,
                avg20: topSignal.h20?.avg,
                win20: topSignal.h20?.win,
                edge: topSignal.edge,
              } : null,
              seasonalityBest: an.seasonality?.available ? an.seasonality.best : null,
              seasonalityWorst: an.seasonality?.available ? an.seasonality.worst : null,
              alpha: evaluation.alphaBeta?.alpha,
              beta: evaluation.alphaBeta?.beta,
              backtestNote: an.backtest?.available ? `${an.backtest.signals.length} signals over ${an.backtest.historyDays} sessions` : an.backtest?.note,
            };
          } catch {}
        } catch (e) {
          console.warn("import: our-data compute failed", e);
        }
      }
    }

    // 3) Freshness — how stale is the report + price move since
    const reportPrice = parseNum(imported?.price);
    const livePrice = ourData?.price ?? null;
    const priceChangePct = reportPrice && livePrice ? ((livePrice - reportPrice) / reportPrice) * 100 : null;
    let daysOld: number | null = null;
    const asOfDate = imported?.asOf ? new Date(imported.asOf) : null;
    if (asOfDate && !isNaN(asOfDate.getTime())) {
      daysOld = Math.round((Date.now() - asOfDate.getTime()) / 86400000);
      if (daysOld < 0) daysOld = null;
    }
    const freshness = { asOf: imported?.asOf, daysOld, reportPrice, livePrice, priceChangePct };

    // 4) Cross-check + validity (only if we have our data)
    let comparison: any = null;
    if (ourData) {
      try {
        comparison = await generateJson(comparePrompt(imported, ourData, freshness), { tier: "reasoning" });
      } catch {
        comparison = { error: "Cross-check AI busy; imported + our data shown separately below." };
      }
    }

    return NextResponse.json({
      result: {
        disclaimer: DISCLAIMER,
        generatedAt: new Date().toISOString(),
        imported,
        ourData,
        resolvedSymbol,
        freshness,
        comparison,
      },
      aiTokens: currentUsage()?.tokens ?? 0,
      usage: currentUsage(),
    });
  } catch (error: any) {
    console.error("Import report error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error importing report." }, { status: 500 });
  }
  });
}
