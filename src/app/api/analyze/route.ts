import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();
import { subDays, format } from "date-fns";
import { SMA, RSI, MACD } from "technicalindicators";
import { normalizeSymbol } from "@/lib/symbolNormalizer";
import { generateMultiTimeframeAnalysis } from "@/lib/multiTimeframeChartService";
import { getMarketContext } from "@/lib/marketContextService";
import { generateJson, runWithUsage, currentUsage } from "@/lib/aiClient";

const finnhubKey = process.env.FINNHUB_API_KEY;

// Delay function if we need to ease rate limits
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function getFinnhubData(endpoint: string, symbol: string) {
  if (!finnhubKey) throw new Error("FINNHUB_API_KEY_MISSING");
  const url = `https://finnhub.io/api/v1${endpoint}${symbol}&token=${finnhubKey}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (res.status === 429) throw new Error("FINNHUB_RATE_LIMIT");
  if (!res.ok) throw new Error("FINNHUB_NETWORK_ERROR");
  return res.json();
}

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
// force-dynamic prevents build-time prerendering of this handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // declared early so the AI block below can read it
  let queryStr = null;
  try {
    const body = await req.json();
    queryStr = body.query || body.q || body.symbol;
    const market = body.market || "US";
    // Data-only mode: return everything except the AI write-up, so the page can
    // paint immediately and fetch the report in a second request.
    const skipAi = body.skipAi === true;
    // Toolbar preferences (now actually used: AI tailoring + chart range).
    const depth = body.depth || "Standard";
    const investorProfile = body.profile || "Short-term Investor";
    const riskTolerance = body.riskTolerance || "Moderate";
    const reqTimeframe = body.timeframe || "1Y";
    queryStr =
      queryStr && typeof queryStr === "string" ? queryStr.trim() : null;

    if (!queryStr) {
      console.log(
        `[Analyze] query=${queryStr || "null"} endpoint=/api/analyze status=400 error=Query is required`,
      );
      return NextResponse.json(
        {
          success: false,
          error: "Query is required",
          hint: "Pass query, q, or symbol parameter.",
        },
        { status: 400 },
      );
    }

    console.log(
      `[Analyze] query=${queryStr} market=${market} endpoint=/api/analyze start`,
    );

    // 1. Search for ticker / Direct match
    let symbol = queryStr;
    let name = queryStr;
    let exchange = "N/A";

    // Try normalize symbol
    const norm = normalizeSymbol(queryStr, market); // using the market from body
    const trySymbols = norm ? norm.possibleSymbols : [queryStr];

    let quote: any = null;
    let exactMatch = false;

    // Try direct quote first
    for (const sym of trySymbols) {
      try {
        quote = await yahooFinance.quote(sym);
        if (quote && quote.regularMarketPrice) {
          symbol = quote.symbol;
          name = quote.shortname || quote.longname || symbol;
          exchange = quote.exchange || "N/A";
          exactMatch = true;
          break;
        }
      } catch (e) {
        // Not found directly
      }
    }

    if (!exactMatch) {
      // Fallback to search
      const searchResult: any = await yahooFinance.search(queryStr);
      let errorMsg = `Symbol '${queryStr}' may not be supported by current data provider or is invalid.`;
      if (norm?.baseSymbol === "TATAMOTORS") {
        errorMsg = `${queryStr} may be a legacy Tata Motors symbol. Tata Motors now has separate listed entities. Try TMCV or TMPV, or choose from suggested Tata Motors results.`;
      }
      if (!searchResult.quotes || searchResult.quotes.length === 0) {
        return NextResponse.json(
          {
            error: errorMsg,
            isUnsupported: true,
            suggestions: norm?.suggestions || [],
          },
          { status: 404 },
        );
      }

      let bestMatch =
        searchResult.quotes.find(
          (q: any) => q.quoteType === "EQUITY" && q.symbol.endsWith(".NS"),
        ) ||
        searchResult.quotes.find((q: any) => q.quoteType === "EQUITY") ||
        searchResult.quotes[0];

      symbol = bestMatch.symbol;
      name = bestMatch.shortname || bestMatch.longname || queryStr;
      exchange = bestMatch.exchange || "N/A";

      try {
        quote = await yahooFinance.quote(symbol);
      } catch (e) {
        let errorMsg = `Symbol '${symbol}' may not be supported by current data provider.`;
        if (norm?.baseSymbol === "TATAMOTORS") {
          errorMsg = `${symbol} may be a legacy Tata Motors symbol. Tata Motors now has separate listed entities. Try TMCV or TMPV, or choose from suggested Tata Motors results.`;
        }
        return NextResponse.json(
          {
            error: errorMsg,
            isUnsupported: true,
            suggestions: norm?.suggestions || [],
          },
          { status: 404 },
        );
      }
    }

    console.log(
      `[Analyze] symbol=${symbol} directQuote=${exactMatch} status=success`,
    );

    // 2. Fetch Yahoo Finance Data
    //
    // These four calls do not depend on each other, so they are started
    // together and awaited where each result is first needed. Run one after
    // another they added up to most of the request; in parallel the route
    // waits only for the slowest.
    const twoYearsAgo = subDays(new Date(), 730);

    const chartPromise = yahooFinance.chart(symbol, {
      period1: twoYearsAgo.toISOString().split("T")[0],
      interval: "1d",
    });
    const summaryPromise = yahooFinance
      .quoteSummary(symbol, {
        modules: ["financialData", "defaultKeyStatistics", "summaryDetail", "summaryProfile"],
      })
      .catch(() => null);
    const newsPromise = yahooFinance.search(symbol, { newsCount: 8 }).catch(() => null);
    const chartIntelPromise = generateMultiTimeframeAnalysis(yahooFinance, symbol).catch((e) => {
      console.error("Multi-timeframe chart generation failed", e);
      return null;
    });

    const chartResult: any = await chartPromise;
    const historyResult: any[] = chartResult.quotes || [];

    if (!historyResult || historyResult.length === 0) {
      return NextResponse.json(
        { error: "No data returned for this symbol from Finnhub." },
        { status: 500 },
      );
    }

    const currentPrice =
      quote?.regularMarketPrice ||
      historyResult[historyResult.length - 1].close;

    // Calculate Price Performance
    const closes = historyResult.map((c: any) => c.close);
    const oneDay = getReturn(closes, 1);
    const oneMonth = getReturn(closes, 21); // approx 21 trading days
    const sixMonth = getReturn(closes, 126); // approx 126 trading days
    const oneYear = getReturn(closes, 252);
    const fiftyTwoWeekHigh = Math.max(...closes);
    const fiftyTwoWeekLow = Math.min(...closes);

    // 3. Technical Indicators
    const ma50 = SMA.calculate({ period: 50, values: closes });
    const ma200 = SMA.calculate({ period: 200, values: closes });
    const rsi = RSI.calculate({ period: 14, values: closes });
    const macd = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    const currentRsi = rsi.length > 0 ? rsi[rsi.length - 1] : null;
    const currentMacd =
      macd.length > 0 ? macd[macd.length - 1] : { MACD: null, signal: null };
    const current50dma = ma50.length > 0 ? ma50[ma50.length - 1] : null;
    const current200dma = ma200.length > 0 ? ma200[ma200.length - 1] : null;

    // Simple support & resistance (1 month high/low)
    const recentMonthCloses = closes.slice(-21);
    const support = Math.min(...recentMonthCloses);
    const resistance = Math.max(...recentMonthCloses);

    // Provide trend string
    let dma50Str = current50dma ? current50dma.toFixed(2) : "N/A";
    let dma200Str = current200dma ? current200dma.toFixed(2) : "N/A";
    let trend = "Neutral";
    if (current50dma && currentPrice) {
      if (current200dma) {
        if (currentPrice > current50dma && current50dma > current200dma)
          trend = "Strong Uptrend";
        else if (currentPrice < current50dma && current50dma < current200dma)
          trend = "Strong Downtrend";
        else if (currentPrice > current50dma) trend = "Uptrend";
        else if (currentPrice < current50dma) trend = "Downtrend";
      } else {
        if (currentPrice > current50dma) trend = "Uptrend";
        else if (currentPrice < current50dma) trend = "Downtrend";
      }
    }

    let volumeBase = quote?.regularMarketVolume || 0;
    let volumeAvg = quote?.averageDailyVolume3Month || 1;
    let volumeView =
      volumeBase > volumeAvg * 1.2
        ? "High Volume"
        : volumeBase < volumeAvg * 0.8
          ? "Low Volume"
          : "Average Volume";

    // 4. Finnhub Data
    let profile: any = null;
    let metricsResult: any = null;
    let newsData: any = null;

    try {
      if (finnhubKey) {
        profile = await getFinnhubData(`/stock/profile2?symbol=`, symbol);
      }
    } catch (e: any) {
      console.warn("Finnhub profile error:", e.message);
    }

    try {
      metricsResult = await getFinnhubData(
        `/stock/metric?metric=all&symbol=`,
        symbol,
      );
    } catch (e) {}

    try {
      const today = new Date();
      const lastWeek = subDays(today, 7);
      newsData = await getFinnhubData(
        `/company-news?symbol=${symbol}&from=${format(lastWeek, "yyyy-MM-dd")}&to=${format(today, "yyyy-MM-dd")}`,
        "",
      );
    } catch (e) {}

    // Yahoo quoteSummary = the real fundamentals source (Finnhub is optional /
    // often keyless). This is what fills ROE/margins/debt/sector so the
    // Fundamentals / Valuation / Risk tabs stop showing "Data unavailable".
    let ySummary: any = (await summaryPromise) || {};
    if (!ySummary.financialData && !ySummary.summaryDetail) {
      // The combined call failed — retry module-by-module in parallel so one
      // bad module doesn't wipe the rest.
      const mods = ["financialData", "defaultKeyStatistics", "summaryDetail", "summaryProfile"];
      const parts = await Promise.all(
        mods.map((mod) =>
          yahooFinance.quoteSummary(symbol, { modules: [mod] as any }).catch(() => null),
        ),
      );
      for (const part of parts) if (part) Object.assign(ySummary, part);
    }
    const yFin = ySummary.financialData || {};
    const yStats = ySummary.defaultKeyStatistics || {};
    const yDetail = ySummary.summaryDetail || {};
    const yProfile = ySummary.summaryProfile || {};

    // Fallbacks to Yahoo quote if Finnhub missing
    const cap =
      quote?.marketCap ||
      (profile?.marketCapitalization
        ? profile.marketCapitalization * 1000000
        : 0);
    const pe =
      quote?.trailingPE ||
      yDetail.trailingPE ||
      quote?.forwardPE ||
      yDetail.forwardPE ||
      metricsResult?.metric?.peExclExtraTTM ||
      null;
    const eps =
      quote?.epsTrailingTwelveMonths ||
      yStats.trailingEps ||
      quote?.epsForward ||
      yStats.forwardEps ||
      metricsResult?.metric?.epsExclExtraItemsTTM ||
      null;
    const pb =
      quote?.priceToBook ||
      yStats.priceToBook ||
      metricsResult?.metric?.pbAnnual ||
      null;

    // Prefer Yahoo financialData (decimals -> percent to match existing scoring),
    // fall back to Finnhub metrics when a Finnhub key is present.
    const pctOf = (v: any) =>
      typeof v === "number" && isFinite(v) ? v * 100 : null;
    const roe = pctOf(yFin.returnOnEquity) ?? metricsResult?.metric?.roeTTM ?? null;
    const roa = pctOf(yFin.returnOnAssets) ?? metricsResult?.metric?.roaTTM ?? null;
    const debtToEquity =
      (typeof yFin.debtToEquity === "number" ? yFin.debtToEquity : null) ??
      metricsResult?.metric?.totalDebtToEquityQuarter ??
      null;
    const profitMargin =
      pctOf(yFin.profitMargins) ?? metricsResult?.metric?.netProfitMarginTTM ?? null;
    const revenueGrowth =
      pctOf(yFin.revenueGrowth) ?? metricsResult?.metric?.revenueGrowthTTMYoy ?? null;
    const operatingMargin = pctOf(yFin.operatingMargins);
    const freeCashflow =
      typeof yFin.freeCashflow === "number" ? yFin.freeCashflow : null;

    // Calculate Data Quality Score
    let dataQuality = 0;
    const dataPoints = [
      currentPrice !== null,
      historyResult.length > 50,
      oneMonth !== null,
      oneYear !== null,
      cap > 0,
      pe !== null,
      pb !== null,
      roe !== null,
      debtToEquity !== null,
      profitMargin !== null,
      revenueGrowth !== null,
      newsData && newsData.length > 0,
    ];
    let availableCount = dataPoints.filter(Boolean).length;
    dataQuality = Math.round((availableCount / dataPoints.length) * 100);

    let confidence = "High Confidence";
    if (dataQuality < 25) confidence = "Very Low Confidence";
    else if (dataQuality < 50) confidence = "Low Confidence";
    else if (dataQuality < 75) confidence = "Medium Confidence";

    // Technical Score (out of 25)
    let techScore = 12.5;
    if (trend.includes("Up")) techScore += 5;
    if (trend.includes("Down")) techScore -= 5;
    if (currentRsi !== null) {
      if (currentRsi >= 30 && currentRsi <= 70) techScore += 3;
      if (currentRsi < 30) techScore += 5;
      if (currentRsi > 70) techScore -= 3;
    }
    if (
      currentMacd.MACD !== null &&
      currentMacd.signal !== null &&
      currentMacd.MACD > currentMacd.signal
    )
      techScore += 4.5;
    techScore = Math.max(0, Math.min(25, techScore));

    // Fundamental Score (out of 30)
    let fundScore = 0;
    let fundMax = 0;
    let fundReason = "";
    if (roe !== null) {
      fundMax += 10;
      if (roe > 15) fundScore += 10;
      else if (roe > 5) fundScore += 5;
    }
    if (profitMargin !== null) {
      fundMax += 10;
      if (profitMargin > 10) fundScore += 10;
      else if (profitMargin > 0) fundScore += 5;
    }
    if (revenueGrowth !== null) {
      fundMax += 10;
      if (revenueGrowth > 10) fundScore += 10;
      else if (revenueGrowth > 0) fundScore += 5;
    }
    if (fundMax === 0) {
      fundReason =
        "Fundamental data unavailable. Missing metrics excluded from scoring.";
      fundScore = 0;
    } else {
      fundScore = Math.round((fundScore / fundMax) * 30);
    }
    fundScore = Math.max(0, Math.min(30, fundScore));

    // Valuation Score (out of 20)
    let valScore = 10;
    let valReason = "";
    if (pe !== null) {
      if (pe > 0 && pe < 15) valScore += 5;
      else if (pe > 30) valScore -= 5;
    }
    if (pb !== null) {
      if (pb > 0 && pb < 2) valScore += 5;
      else if (pb > 5) valScore -= 5;
    }
    if (pe === null && pb === null) {
      valReason =
        "Insufficient data. This section was partially excluded from scoring.";
    }
    valScore = Math.max(0, Math.min(20, valScore));

    let valLabel = "Fairly Valued";
    if (valScore >= 16) valLabel = "Undervalued";
    else if (valScore > 12) valLabel = "Fairly Valued";
    else if (valScore >= 8) valLabel = "Slightly Expensive";
    else if (valScore >= 4) valLabel = "Overvalued";
    else valLabel = "Extremely Expensive";

    // News/Sentiment Score (out of 15)
    let senScore = 7.5;
    let recentNews: any[] = [];
    if (newsData && Array.isArray(newsData) && newsData.length > 0) {
      recentNews = newsData.slice(0, 6).map((n: any) => ({
        headline: n.headline,
        source: n.source,
        summary: n.summary,
        url: n.url,
      }));
    }
    // Yahoo news fallback (Finnhub is keyless here) — real, current headlines.
    if (recentNews.length === 0) {
      try {
        const yNews: any = await newsPromise;
        const POS = ["surge", "gain", "beat", "strong", "record", "upgrade", "rise", "high", "profit", "growth", "rally"];
        const NEG = ["drop", "fall", "miss", "weak", "loss", "downgrade", "cut", "lawsuit", "slump", "plunge", "warning"];
        let p = 0;
        let ng = 0;
        recentNews = (yNews?.news || []).slice(0, 6).map((n: any) => {
          const t = (n.title || "").toLowerCase();
          const a = POS.filter((w) => t.includes(w)).length;
          const b = NEG.filter((w) => t.includes(w)).length;
          if (a > b) p++;
          else if (b > a) ng++;
          return {
            headline: n.title,
            source: n.publisher || "Yahoo Finance",
            summary: n.title,
            url: n.link,
          };
        });
        // sentiment from headlines
        if (recentNews.length > 0) senScore = p > ng ? 12 : ng > p ? 5 : 8;
      } catch {
        /* leave empty */
      }
    }
    if (recentNews.length > 0 && newsData && newsData.length > 0) senScore = 12;
    else if (recentNews.length === 0) senScore = 5;
    senScore = Math.max(0, Math.min(15, senScore));

    // Risk Score (out of 10) - Higher score means BETTER (Lower Risk)
    let riskScore = 5;
    let riskLevel = "Medium";
    let keyRisks = [];
    if (debtToEquity !== null && debtToEquity > 150) {
      riskScore -= 3;
      keyRisks.push("High Debt relative to Equity");
    }
    if (valScore < 8) {
      riskScore -= 2;
      keyRisks.push("Stretched Valuation");
    }
    if (techScore < 10) {
      riskScore -= 2;
      keyRisks.push("Weak Technical Momentum");
    }
    if (fundScore < 12) {
      riskScore -= 2;
      keyRisks.push("Poor Fundamental Growth");
    }

    if (riskScore >= 8) riskLevel = "Low";
    else if (riskScore >= 6) riskLevel = "Low-Medium";
    else if (riskScore >= 4) riskLevel = "Medium";
    else if (riskScore >= 2) riskLevel = "Medium-High";
    else riskLevel = "High";
    riskScore = Math.max(0, Math.min(10, riskScore));

    const totalScore = Math.round(
      techScore + fundScore + valScore + senScore + riskScore,
    );
    let bias = "Neutral / Watchlist";
    if (totalScore >= 80) bias = "Strong Bullish";
    else if (totalScore >= 65) bias = "Bullish";
    else if (totalScore >= 50) bias = "Neutral / Watchlist";
    else if (totalScore >= 35) bias = "Weak / Cautious";
    else bias = "High Risk";

    // Risk Override Rules & Confidence adjustments
    if (dataQuality < 50 && totalScore >= 65) {
      bias = "Bullish with Data Limitation";
    } else if (bias.includes("Bullish")) {
      if (
        valScore < 8 ||
        techScore < 8 ||
        (debtToEquity !== null && debtToEquity > 150)
      ) {
        bias = "Cautious Bull";
      }
    }
    if (dataQuality < 30) {
      bias = "Insufficient Data / High Risk";
    }

    let missingDataExclusionStr =
      dataQuality < 100
        ? "Some data is unavailable from Finnhub. Missing metrics were excluded from scoring."
        : "";

    const chartIntelligence: any = await chartIntelPromise;

    let topDownData: any = null;
    try {
      const sector = yProfile.sector || profile?.finnhubIndustry || "Unknown";
      topDownData = await getMarketContext(
        market,
        sector,
        trend,
        oneMonth ? oneMonth * 100 : 0,
      );
    } catch (e) {
      console.error("Top-down context failed", e);
    }

    // Format final structure before AI
    const dataForAI = {
      stock: {
        name,
        ticker: symbol,
        exchange,
        sector: yProfile.sector || profile?.finnhubIndustry || "Data unavailable",
        industry:
          yProfile.industry || profile?.finnhubIndustry || "Data unavailable",
        marketCap: cap ? formatBigNum(cap) : "Data unavailable",
        currentPrice: currentPrice?.toFixed(2) || "Data unavailable",
        currency: quote?.currency || "USD",
      },
      pricePerformance: {
        oneDay:
          oneDay !== null
            ? (oneDay * 100).toFixed(2) + "%"
            : "Data unavailable",
        oneMonth:
          oneMonth !== null
            ? (oneMonth * 100).toFixed(2) + "%"
            : "Data unavailable",
        sixMonth:
          sixMonth !== null
            ? (sixMonth * 100).toFixed(2) + "%"
            : "Data unavailable",
        oneYear:
          oneYear !== null
            ? (oneYear * 100).toFixed(2) + "%"
            : "Data unavailable",
        fiftyTwoWeekHigh:
          fiftyTwoWeekHigh !== null && isFinite(fiftyTwoWeekHigh)
            ? fiftyTwoWeekHigh.toFixed(2)
            : "Data unavailable",
        fiftyTwoWeekLow:
          fiftyTwoWeekLow !== null && isFinite(fiftyTwoWeekLow)
            ? fiftyTwoWeekLow.toFixed(2)
            : "Data unavailable",
      },
      technical: {
        trend,
        dma50: dma50Str,
        dma200: dma200Str,
        rsi: currentRsi !== null ? currentRsi.toFixed(2) : "Data unavailable",
        macd:
          currentMacd && currentMacd.MACD !== null
            ? currentMacd.MACD.toFixed(2)
            : "Data unavailable",
        support:
          support !== null && isFinite(support)
            ? support.toFixed(2)
            : "Data unavailable",
        resistance:
          resistance !== null && isFinite(resistance)
            ? resistance.toFixed(2)
            : "Data unavailable",
        volumeView,
        score: techScore,
        summary: `Currently ${trend} with an RSI of ${currentRsi !== null ? currentRsi.toFixed(2) : "Data unavailable"}`,
      },
      fundamental: {
        pe: pe !== null ? pe.toFixed(2) : "Data unavailable",
        pb: pb !== null ? pb.toFixed(2) : "Data unavailable",
        eps: eps !== null ? eps.toFixed(2) : "Data unavailable",
        roe: roe !== null ? roe.toFixed(2) + "%" : "Data unavailable",
        roa: roa !== null ? roa.toFixed(2) + "%" : "Data unavailable",
        debtToEquity:
          debtToEquity !== null ? debtToEquity.toFixed(2) : "Data unavailable",
        profitMargin:
          profitMargin !== null
            ? profitMargin.toFixed(2) + "%"
            : "Data unavailable",
        revenueGrowth:
          revenueGrowth !== null
            ? revenueGrowth.toFixed(2) + "%"
            : "Data unavailable",
        operatingMargin:
          operatingMargin !== null
            ? operatingMargin.toFixed(2) + "%"
            : "Data unavailable",
        freeCashFlow:
          freeCashflow !== null ? formatBigNum(freeCashflow) : "Data unavailable",
        score: fundScore,
        reason: fundReason,
        summary:
          fundReason ||
          "Fundamental analysis computation based on recent filings.",
      },
      valuation: {
        label:
          valScore > 0 || pe !== null || pb !== null
            ? valLabel
            : "Data unavailable",
        // Page renders `valuation.view` as the headline label.
        view:
          valScore > 0 || pe !== null || pb !== null
            ? valLabel
            : "Data Unavailable",
        score: valScore,
        reason: valReason,
        summary:
          pe !== null
            ? `P/E stands at ${pe.toFixed(2)}, presenting a ${valScore > 12 ? "value opportunity" : "premium"}.`
            : "Valuation data is unavailable from the current provider. This section was excluded from scoring.",
      },
      news: {
        sentiment:
          senScore >= 10 ? "Positive" : senScore <= 5 ? "Negative" : "Neutral",
        score: senScore,
        reason: "",
        latestNews: recentNews,
        summary: "Based on recent news headlines.",
      },
      risk: {
        riskLevel: riskLevel,
        score: riskScore,
        reason: "",
        keyRisks:
          keyRisks.length > 0 ? keyRisks : ["General market volatility"],
      },
      final: {
        totalScore: totalScore,
        bias: bias,
        confidence: confidence,
        reason: missingDataExclusionStr,
      },
      scorecard: {
        total: totalScore,
        label: bias,
        dataQualityScore: dataQuality,
        confidence,
        missingDataMessage: missingDataExclusionStr,
      },
      chartIntelligence,
      topDownData,
    };

    // Prompt AI (Gemini primary, Groq fallback)
    let parsedAiReport: any = null;
    let aiTokens = 0;
    // Real per-provider split, so AI Usage records whichever model actually
    // answered rather than one hardcoded at the call site.
    let aiUsage: any = null;
    if (process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY) {
      // chartIntelligence carries three timeframes of raw OHLC candles — about
      // 250 KB, which was 98% of this prompt and roughly 64,000 input tokens
      // per analysis. The model only ever uses the derived read, never the
      // individual bars, so send the summary and drop the arrays.
      const { chartIntelligence: _ci, ...restForAI } = dataForAI as any;
      const chartSummary = _ci
        ? {
            hourlyTrend: _ci.hourly?.trend,
            dailyTrend: _ci.daily?.trend,
            weeklyTrend: _ci.weekly?.trend,
            alignmentScore: _ci.alignmentScore,
            alignmentLabel: _ci.alignmentLabel,
            setupLabel: _ci.setupLabel,
            extensionRisk: _ci.extensionRisk,
            dailySupport: _ci.daily?.support,
            dailyResistance: _ci.daily?.resistance,
            recentPatterns: (_ci.daily?.patterns || []).slice(0, 5),
          }
        : null;
      const promptData = { ...restForAI, chartSummary };

      const aiPrompt = `
You are an expert financial analyst. Write a professional stock report for ${name} (${symbol}) using ONLY the provided data.
Data: ${JSON.stringify(promptData)}

READER CONTEXT (tailor the report to this reader — adjust tone, horizon and emphasis accordingly):
- Investor profile: ${investorProfile}
- Risk tolerance: ${riskTolerance}
- Research depth requested: ${depth} (if "Deep", be more thorough in technicalView/fundamentalView and whatToTrackNext; if "Quick", keep it concise)
Make "investorView" and "traderView" specifically reflect this reader's profile and risk tolerance.

Do not create fake numbers. If data says "N/A", mention it's not available instead of hallucinating.
Write in simple, professional, investor-friendly language. 
Do not mention prompt strings like "Date: [Current Date]" or "I will omit", "As per instruction", "Placeholder", "Guaranteed", "Buy now", "Sell now", "Sure-shot", "100% prediction".
Do not give buy/sell recommendations. Use research-support language only.
Mention data limitations if Data Quality Score is below 75 or key fundamentals are missing.

Return a pure JSON object strictly following this schema:
{
"executiveSummary": "High-level summary",
"technicalView": "Short explanation of technical indicators",
"fundamentalView": "Short explanation of financial health",
"valuationView": "Assessment of current valuation",
"topDownView": "Analysis of market and sector context",
"multiTimeframeView": "Summary of hourly, daily, weekly trends",
"momentumView": "Is momentum improving or weakening? Is the stock extended? Is volume confirming? Use research language only.",
"priceStrengthView": "Relative price strength vs key MAs / sector / index",
"buyerDemandView": "Volume-based demand read (accumulation vs distribution)",
"quarterlyGrowthView": "Are EPS and sales trends improving or decelerating?",
"ownershipTrendView": "Institutional/ownership trend note (state if unavailable)",
"shortTermSetupView": "Short-term setup over next few days/weeks; watch/confirm language, no targets",
"chartSetup": "Detailed setup view",
"supportResistanceView": "Note on nearby levels",
"indicatorView": "RSI, MACD, ADX insights",
"candlestickView": "Any detected patterns",
"extensionRisk": "Runup or extension risk flag",
"sectorStrengthView": "Sector performance note",
"riskAnalysis": "Overall risk breakdown",
"dataQualityNote": "Note on data limitations if any",
"keyPositives": ["point 1"],
"keyRisks": ["risk 1"],
"investorView": "Perspective for long-term investors",
"traderView": "Perspective for short-term traders",
"whatToTrackNext": ["metric or event to track"],
"finalResearchView": "A conclusive wrap-up"
}
`;
      // The AI write-up is by far the slowest part of this route. When the
      // client asks for data only, skip it and return everything else
      // immediately; the client then requests the report separately.
      if (skipAi) {
        console.log(`[Analyze] symbol=${symbol} skipAi=true — returning data only`);
      } else
      try {
        const r = await runWithUsage(async () => {
          const parsed = await generateJson(aiPrompt, { tier: "reasoning" });
          const u = currentUsage();
          return { parsed, tokens: u?.tokens ?? 0, usage: u };
        });
        parsedAiReport = r.parsed;
        aiTokens = r.tokens;
        aiUsage = r.usage;
      } catch (e) {
        console.error("AI report generation failed (Gemini+Groq):", e);
      }
    } else {
      console.log(`[Analyze] Gemini API key not configured.`);
    }

    // Fallback AI Report if parsing fails or key missing
    if (
      !parsedAiReport ||
      (!parsedAiReport.executiveSummary && !parsedAiReport.quickSummary)
    ) {
      const pos = [];
      const risks = [];
      if (current50dma && currentPrice && currentPrice > current50dma) pos.push("Above 50-day moving average");
      if (current200dma && currentPrice && currentPrice > current200dma) pos.push("Above 200-day moving average");
      if ((oneMonth || 0) > 0.05) pos.push("Strong 1M performance");
      if ((oneYear || 0) > 0.2) pos.push("Strong 1Y performance");
      if (currentRsi && currentRsi > 70) risks.push("Overbought RSI");
      if (current50dma && current200dma && current50dma < current200dma) risks.push("50DMA below 200DMA");
      if (riskLevel && riskLevel.includes("High")) risks.push("Elevated risk profile");

      const quickSummary = `Automated summary: ${name} (${symbol}) is currently in a ${trend} with price ${currentPrice}. ${pos.length > 0 ? "Positives: " + pos.join(", ") + "." : "No clear technical positives."} ${risks.length > 0 ? "Risks: " + risks.join(", ") + "." : "No immediate technical risks detected."}`;

      parsedAiReport = {
        executiveSummary: `Automated assessment for ${name}. Model generated summary unavailable.`,
        quickSummary,
        technicalView: `Trend is ${trend}.`,
        fundamentalView: `Fundamental tracking based on available public metrics.`,
        valuationView: `Valuation currently estimated as ${valLabel}.`,
        topDownView: topDownData?.conclusion || "N/A",
        multiTimeframeView: `Hourly: ${chartIntelligence?.hourly?.trend}, Daily: ${chartIntelligence?.daily?.trend}`,
        momentumView: `Multi-timeframe alignment is ${chartIntelligence?.alignmentLabel || "unclear"} with ${chartIntelligence?.extensionRisk?.riskLevel || "unknown"} extension risk. ${chartIntelligence?.extensionRisk?.message || "Watch for confirmation."}`,
        priceStrengthView: `Trend is ${trend}. Price ${currentPrice > (current50dma || 0) ? "above" : "below"} the 50 DMA.`,
        buyerDemandView: `Volume read: ${volumeView}. Confirm demand with above-average volume on up moves.`,
        quarterlyGrowthView:
          revenueGrowth !== null || roe !== null
            ? `Revenue growth ${revenueGrowth !== null ? revenueGrowth.toFixed(1) + "%" : "unavailable"}. Review full quarterly EPS/sales trend in the Momentum tab.`
            : "Quarterly growth data limited from current provider. See Momentum tab.",
        ownershipTrendView:
          "Ownership trend detail is available in the Momentum tab; FII/DII/promoter data may be unavailable from the current provider.",
        shortTermSetupView: `${chartIntelligence?.setupLabel || "Mixed Setup"}. ${chartIntelligence?.extensionRisk?.riskLevel === "High" ? "Avoid chasing; stock is extended." : "Watch for confirmation before fresh participation."}`,
        chartSetup: chartIntelligence?.setupLabel || "N/A",
        supportResistanceView: `Support: ${support} / Resistance: ${resistance}`,
        indicatorView: `RSI: ${currentRsi}`,
        candlestickView: "N/A",
        extensionRisk: chartIntelligence?.extensionRisk?.riskLevel || "N/A",
        sectorStrengthView: topDownData?.sectorStrengthLabel || "N/A",
        riskAnalysis: riskLevel,
        dataQualityNote: missingDataExclusionStr,
        keyPositives: pos.length > 0 ? pos : ["No strong technical positives detected."],
        keyRisks: risks.length > 0 ? risks : ["No immediate technical risks detected."],
        investorView: "Hold evaluation pending subjective research.",
        traderView: "Follow technical indicators closely.",
        whatToTrackNext: ["Upcoming earnings reports"],
        finalResearchView: bias,
      };
    }

    // Guarantee a quickSummary so consumers (page, QA, PDF) always have a
    // headline summary regardless of which AI schema field was filled.
    if (parsedAiReport && !parsedAiReport.quickSummary) {
      parsedAiReport.quickSummary =
        parsedAiReport.executiveSummary ||
        parsedAiReport.finalResearchView ||
        parsedAiReport.finalConclusion ||
        `${name} (${symbol}) is currently assessed as ${bias}.`;
    }

    // Overview chart range driven by the timeframe dropdown (trading sessions).
    const TF_SESSIONS: Record<string, number> = {
      "1D": 5,
      "1W": 10,
      "1M": 22,
      "3M": 64,
      "6M": 128,
      "1Y": 252,
      "3Y": 756,
      "5Y": 1260,
    };
    const tfCount = Math.min(
      historyResult.length,
      TF_SESSIONS[reqTimeframe] || 100,
    );

    const finalPayload = {
      ...dataForAI,
      final: {
        ...dataForAI.final,
        aiReport: parsedAiReport,
      },
      topDownData: topDownData,
      chartIntelligence: chartIntelligence,
      chartData: historyResult.slice(-tfCount).map((item: any, idx: number) => {
        const i = historyResult.length - Math.min(tfCount, historyResult.length) + idx;
        const sma50 = i >= 49 ? ma50[i - 49] : null;
        const sma200 = i >= 199 ? ma200[i - 199] : null;
        return {
          date: item.date instanceof Date ? item.date.toISOString().split("T")[0] : item.date,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          price: item.close,
          volume: item.volume,
          sma50,
          sma200,
        };
      }),
      aiTokens,
      usage: aiUsage,
    };

    return NextResponse.json(finalPayload);
  } catch (error: any) {
    console.error("Analysis Error:", error);
    let errorMsg = error.message || "Internal server error";
    if (errorMsg.includes("high demand") || errorMsg.includes("503")) {
      errorMsg =
        "AI Model is currently experiencing high demand. Please try again in a few seconds.";
    }
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

function getReturn(closes: number[], lookback: number) {
  if (closes.length <= lookback) return null;
  const current = closes[closes.length - 1];
  const old = closes[closes.length - 1 - lookback];
  return (current - old) / old;
}

function formatBigNum(num: number) {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + "T";
  if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
  return num.toString();
}
