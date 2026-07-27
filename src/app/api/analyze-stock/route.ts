import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();
import { GoogleGenAI } from "@google/genai";
import { subDays } from "date-fns";
import { RSI, MACD, SMA, EMA } from "technicalindicators";

let aiClient: GoogleGenAI | null = null;
function getAiClient() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
// force-dynamic prevents build-time prerendering of this handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, timeframe = "1Y" } = body;

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 },
      );
    }

    // Identify timespan
    let daysToFetch = 365;
    if (timeframe === "1M") daysToFetch = 30;
    else if (timeframe === "3M") daysToFetch = 90;
    else if (timeframe === "6M") daysToFetch = 180;
    else if (timeframe === "3Y") daysToFetch = 365 * 3;
    else if (timeframe === "5Y") daysToFetch = 365 * 5;

    const startDate = subDays(new Date(), Math.max(daysToFetch, 365)); // At least 1yr for SMA200

    // 1. Fetch Quote
    let quote: Record<string, unknown>;
    try {
      quote = await yahooFinance.quote(symbol);
    } catch (e: unknown) {
      const errMessage = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          error: `Ticker symbol '${symbol}' not found or quote data unavailable: ${errMessage}`,
        },
        { status: 404 },
      );
    }

    // 2. Fetch Chart Data
    let chartDataResult: Record<string, unknown>;
    try {
      chartDataResult = await yahooFinance.chart(symbol, {
        period1: startDate.toISOString().split("T")[0],
        interval: "1d",
      });
    } catch (e: unknown) {
      const errMessage = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `Chart data unavailable for this symbol: ${errMessage}` },
        { status: 404 },
      );
    }

    let newsArticles: Record<string, unknown>[] = [];
    let positiveCount = 0;
    let negativeCount = 0;
    try {
      const searchRes = await yahooFinance.search(symbol, { newsCount: 5 });
      const rawNews = searchRes.news || [];
      newsArticles = rawNews.slice(0, 5).map((article) => {
        const titleL = (article.title || "").toLowerCase();

        let sentiment = "Neutral";
        let impact = "Low";

        const posWords = [
          "surge",
          "gain",
          "high",
          "growth",
          "buy",
          "up",
          "beat",
          "strong",
          "positive",
          "raise",
          "upgrade",
          "outperform",
          "dividend",
        ];
        const negWords = [
          "drop",
          "fall",
          "low",
          "decline",
          "sell",
          "down",
          "miss",
          "weak",
          "negative",
          "loss",
          "downgrade",
          "underperform",
          "lawsuit",
          "scandal",
          "cut",
        ];
        const highImpactWords = [
          "earnings",
          "merger",
          "acquisition",
          "lawsuit",
          "scandal",
          "dividend",
          "sec",
          "ceo",
          "guidance",
        ];

        const posScore = posWords.filter((w) => titleL.includes(w)).length;
        const negScore = negWords.filter((w) => titleL.includes(w)).length;

        if (posScore > negScore) {
          sentiment = "Positive";
          positiveCount++;
        } else if (negScore > posScore) {
          sentiment = "Negative";
          negativeCount++;
        }

        const highIn = highImpactWords.some((w) => titleL.includes(w));
        if (highIn) {
          impact = "High";
        } else if (posScore > 0 || negScore > 0) {
          impact = "Medium";
        }

        return {
          title: article.title,
          publisher: article.publisher,
          link: article.link,
          providerPublishTime: article.providerPublishTime,
          sentiment,
          impact,
        };
      });
    } catch (e) {
      console.warn("News fetch failed:", e);
    }

    let newsScore = 8;
    if (positiveCount > negativeCount) {
      newsScore = 12 + Math.min(3, positiveCount - negativeCount);
    } else if (negativeCount > positiveCount) {
      newsScore = Math.max(0, 5 - (negativeCount - positiveCount));
    }
    const maxNewsScore = 15;
    let newsReason = "Mixed or neutral news.";
    if (newsScore > 10) newsReason = "Mostly positive news sentiment.";
    else if (newsScore < 6) newsReason = "Mostly negative news sentiment.";

    const quotes = chartDataResult.quotes || [];
    if (!quotes || quotes.length === 0) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }

    // Fetch Fundamentals (optional fallback)
    let moduleData: Record<string, unknown> = {};
    try {
      moduleData = await yahooFinance.quoteSummary(symbol, {
        modules: [
          "defaultKeyStatistics",
          "financialData",
          "price",
          "summaryDetail",
        ],
      });
    } catch (e) {
      console.warn("Could not fetch quoteSummary", e);
    }

    const currentPrice = quote.regularMarketPrice;

    // Technical Indicators
    const closes = quotes.map(
      (c: Record<string, unknown>) => (c.close as number) || 0,
    );
    const volumes = quotes.map(
      (c: Record<string, unknown>) => (c.volume as number) || 0,
    );
    const highs = quotes.map(
      (c: Record<string, unknown>) =>
        (c.high as number) || (c.close as number) || 0,
    );
    const lows = quotes.map(
      (c: Record<string, unknown>) =>
        (c.low as number) || (c.close as number) || 0,
    );

    const rsiInput = { values: closes, period: 14 };
    const rsiValues = RSI.calculate(rsiInput);
    const currentRsi =
      rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

    const macdInput = {
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    };
    const macdValues = MACD.calculate(macdInput);
    const currentMacdData =
      macdValues.length > 0
        ? macdValues[macdValues.length - 1]
        : { MACD: null, signal: null };

    const sma20Values = SMA.calculate({ values: closes, period: 20 });
    const currentSma20 =
      sma20Values.length > 0 ? sma20Values[sma20Values.length - 1] : null;

    const ema20Values = EMA.calculate({ values: closes, period: 20 });
    const currentEma20 =
      ema20Values.length > 0 ? ema20Values[ema20Values.length - 1] : null;

    const sma50Values = SMA.calculate({ values: closes, period: 50 });
    const currentSma50 =
      sma50Values.length > 0 ? sma50Values[sma50Values.length - 1] : null;

    const sma200Values = SMA.calculate({ values: closes, period: 200 });
    const currentSma200 =
      sma200Values.length > 0 ? sma200Values[sma200Values.length - 1] : null;

    // Volume calculation (20 day average)
    const recentVolumes = volumes.slice(-20);
    const avgVolume20 =
      recentVolumes.length > 0
        ? recentVolumes.reduce((a: number, b: number) => a + b, 0) /
          recentVolumes.length
        : 0;
    const currentVolume = volumes[volumes.length - 1] || 0;
    const volumeSignal =
      currentVolume > avgVolume20 ? "Strong volume" : "Low volume";

    // Support and Resistance (last 20 days)
    const recentLows = lows.slice(-20);
    const recentHighs = highs.slice(-20);
    const supportLevel = recentLows.length > 0 ? Math.min(...recentLows) : null;
    const resistanceLevel =
      recentHighs.length > 0 ? Math.max(...recentHighs) : null;
    const breakoutLevel =
      resistanceLevel !== null ? resistanceLevel * 1.01 : null;
    const failureLevel = supportLevel !== null ? supportLevel * 0.99 : null;

    // Build Chart Data
    const formattedChartData = quotes
      .slice(-Math.min(daysToFetch, quotes.length))
      .map((q: Record<string, unknown>, i: number, arr: unknown[]) => {
        const idx = quotes.length - arr.length + i;
        return {
          date: q.date ? q.date.toISOString().split("T")[0] : "",
          close: q.close,
          open: q.open,
          high: q.high,
          low: q.low,
          volume: q.volume,
          sma50: sma50Values[idx - 50] || null,
          sma200: sma200Values[idx - 200] || null,
        };
      });

    // Extract Fundamentals
    const financialData = moduleData.financialData || {};
    const defaultStats = moduleData.defaultKeyStatistics || {};
    const summaryDetail = moduleData.summaryDetail || {};

    const trailingPE = summaryDetail.trailingPE ?? null;
    const priceToBook = defaultStats.priceToBook ?? null;
    const roe = financialData.returnOnEquity ?? null;
    const profitMargin = financialData.profitMargin ?? null;
    const operatingMargin = financialData.operatingMargin ?? null;
    const revenueGrowth = financialData.revenueGrowth ?? null;
    const earningsGrowth = financialData.earningsGrowth ?? null;
    const debtToEquity = financialData.debtToEquity ?? null;
    const freeCashflow = financialData.freeCashflow ?? null;
    const pegRatio = defaultStats.pegRatio ?? null;
    const evToEbitda = defaultStats.enterpriseToEbitda ?? null;
    const priceToSales = summaryDetail.priceToSalesTrailing12Months ?? null;

    // Technical Score Gen
    let techScore = 0;
    let maxTechScore = 25;
    let techNote = "Calculated based on trend, MA, RSI, MACD, and Volume.";
    let trend = "Neutral";

    // Trend rules
    if (currentSma50 && currentSma200) {
      if (currentPrice > currentSma50 && currentPrice > currentSma200) {
        techScore += 8;
        trend = "Uptrend";
      } else if (currentPrice < currentSma50 && currentPrice < currentSma200) {
        techScore += 0;
        trend = "Downtrend";
      } else {
        techScore += 4;
        trend = "Mixed / Sideways";
      }
    } else {
      maxTechScore -= 8;
      techNote = "Moving averages data unavailable for trend derivation.";
    }

    // Moving average rules (5 points: 2.5 for SMA 20, 2.5 for EMA 20)
    let hasMaScore = false;
    if (currentSma20) {
      techScore += currentPrice > currentSma20 ? 2.5 : 0;
      hasMaScore = true;
    }
    if (currentEma20) {
      techScore += currentPrice > currentEma20 ? 2.5 : 0;
      hasMaScore = true;
    }
    if (!hasMaScore) {
      maxTechScore -= 5;
    }

    // RSI rules
    let rsiSignal = "N/A";
    if (currentRsi) {
      if (currentRsi < 30) {
        techScore += 4;
        rsiSignal = "Oversold";
      } else if (currentRsi >= 30 && currentRsi <= 45) {
        techScore += 1;
        rsiSignal = "Weak";
      } else if (currentRsi > 45 && currentRsi < 60) {
        techScore += 2;
        rsiSignal = "Neutral";
      } else if (currentRsi >= 60 && currentRsi <= 70) {
        techScore += 3;
        rsiSignal = "Strong";
      } else if (currentRsi > 70) {
        techScore += 0;
        rsiSignal = "Overbought";
      }
    } else {
      maxTechScore -= 4;
    }

    // MACD rules
    let macdSignalStr = "N/A";
    if (
      currentMacdData &&
      currentMacdData.MACD !== null &&
      currentMacdData.signal !== null
    ) {
      if (currentMacdData.MACD > currentMacdData.signal) {
        techScore += 4;
        macdSignalStr = "Bullish momentum";
      } else {
        techScore += 0;
        macdSignalStr = "Bearish momentum";
      }
    } else {
      maxTechScore -= 4;
    }

    // Volume rules
    if (currentVolume > 0 && avgVolume20 > 0) {
      if (currentVolume > avgVolume20) {
        techScore += 4;
      } else {
        techScore += 0;
      }
    } else {
      maxTechScore -= 4;
    }

    // Fundamental Score Gen
    let fundScore = 0;
    let maxFundScore = 30;
    const fundNoteParts: string[] = [];

    // Revenue Growth (5)
    if (revenueGrowth !== null) {
      if (revenueGrowth > 0.2) {
        fundScore += 5;
        fundNoteParts.push("Strong revenue growth.");
      } else if (revenueGrowth > 0.1) {
        fundScore += 4;
      } else if (revenueGrowth > 0.05) {
        fundScore += 3;
      } else if (revenueGrowth > 0) {
        fundScore += 2;
      } else {
        fundScore += 0;
        fundNoteParts.push("Negative or zero revenue growth.");
      }
    } else {
      maxFundScore -= 5;
      fundNoteParts.push("Revenue growth data unavailable.");
    }

    // Profit Growth (5)
    if (earningsGrowth !== null) {
      if (earningsGrowth > 0.2) {
        fundScore += 5;
        fundNoteParts.push("Strong earnings growth.");
      } else if (earningsGrowth > 0.1) {
        fundScore += 4;
      } else if (earningsGrowth > 0.05) {
        fundScore += 3;
      } else if (earningsGrowth > 0) {
        fundScore += 2;
      } else {
        fundScore += 0;
        fundNoteParts.push("Negative earnings growth.");
      }
    } else {
      maxFundScore -= 5;
      fundNoteParts.push("Earnings growth data unavailable.");
    }

    // Margins (5)
    if (operatingMargin !== null || profitMargin !== null) {
      const bestMargin = Math.max(operatingMargin || 0, profitMargin || 0);
      if (bestMargin > 0.2) {
        fundScore += 5;
        fundNoteParts.push("Excellent margins.");
      } else if (bestMargin > 0.1) {
        fundScore += 3;
      } else if (bestMargin > 0.05) {
        fundScore += 2;
      } else {
        fundScore += 0;
      }
    } else {
      maxFundScore -= 5;
      fundNoteParts.push("Margin data unavailable.");
    }

    // ROE/ROCE (6)
    if (roe !== null) {
      if (roe > 0.2) {
        fundScore += 6;
        fundNoteParts.push("Exceptional ROE.");
      } else if (roe > 0.15) {
        fundScore += 5;
      } else if (roe > 0.1) {
        fundScore += 4;
      } else if (roe > 0.05) {
        fundScore += 2;
      } else {
        fundScore += 0;
      }
    } else {
      maxFundScore -= 6;
      fundNoteParts.push("ROE data unavailable.");
    }

    // Debt/Equity (4)
    if (debtToEquity !== null) {
      if (debtToEquity < 50) {
        fundScore += 4;
        fundNoteParts.push("Healthy debt levels (-).");
      } else if (debtToEquity < 100) {
        fundScore += 3;
      } else if (debtToEquity < 200) {
        fundScore += 2;
      } else {
        fundScore += 0;
        fundNoteParts.push("High debt burden.");
      }
    } else {
      maxFundScore -= 4;
      fundNoteParts.push("Debt data unavailable.");
    }

    // Cash Flow (5)
    if (freeCashflow !== null) {
      if (freeCashflow > 0) {
        fundScore += 5;
        fundNoteParts.push("Positive free cash flow.");
      } else if (freeCashflow === 0) {
        fundScore += 3;
      } else {
        fundScore += 0;
        fundNoteParts.push("Negative free cash flow.");
      }
    } else {
      maxFundScore -= 5;
      fundNoteParts.push("Cash flow unavailable.");
    }

    const fundNote =
      fundNoteParts.length > 0
        ? fundNoteParts.join(" ")
        : "Fundamental data analyzed.";

    // Valuation Score Gen
    let valScore = 0;
    let maxValScore = 20;
    const valNoteParts: string[] = [];

    // P/E Ratio (5)
    if (trailingPE !== null) {
      if (trailingPE > 0 && trailingPE < 15) {
        valScore += 5;
        valNoteParts.push("Attractive P/E.");
      } else if (trailingPE < 20) {
        valScore += 4;
      } else if (trailingPE < 25) {
        valScore += 3;
      } else if (trailingPE < 35) {
        valScore += 2;
      } else {
        valScore += 0;
        valNoteParts.push("High P/E multiple.");
      }
    } else {
      maxValScore -= 5;
      valNoteParts.push("P/E unavailable.");
    }

    // P/B Ratio (4)
    if (priceToBook !== null) {
      if (priceToBook > 0 && priceToBook < 3) {
        valScore += 4;
        valNoteParts.push("Low P/B ratio.");
      } else if (priceToBook < 5) {
        valScore += 3;
      } else if (priceToBook < 10) {
        valScore += 2;
      } else {
        valScore += 0;
      }
    } else {
      maxValScore -= 4;
      valNoteParts.push("P/B unavailable.");
    }

    // EV/EBITDA (4)
    if (evToEbitda !== null) {
      if (evToEbitda > 0 && evToEbitda < 10) {
        valScore += 4;
        valNoteParts.push("Good EV/EBITDA.");
      } else if (evToEbitda < 15) {
        valScore += 3;
      } else if (evToEbitda < 20) {
        valScore += 2;
      } else {
        valScore += 0;
      }
    } else {
      maxValScore -= 4;
      valNoteParts.push("EV/EBITDA unavailable.");
    }

    // Price/Sales (3)
    if (priceToSales !== null) {
      if (priceToSales > 0 && priceToSales < 2) {
        valScore += 3;
        valNoteParts.push("Low P/S.");
      } else if (priceToSales < 5) {
        valScore += 2;
      } else if (priceToSales < 10) {
        valScore += 1;
      } else {
        valScore += 0;
      }
    } else {
      maxValScore -= 3;
      valNoteParts.push("P/S unavailable.");
    }

    // PEG Ratio (4)
    if (pegRatio !== null) {
      if (pegRatio > 0 && pegRatio < 1) {
        valScore += 4;
        valNoteParts.push("Favorable PEG ratio.");
      } else if (pegRatio < 1.5) {
        valScore += 3;
      } else if (pegRatio < 2) {
        valScore += 2;
      } else {
        valScore += 0;
      }
    } else {
      maxValScore -= 4;
      valNoteParts.push("PEG unavailable.");
    }

    const valNote =
      valNoteParts.length > 0
        ? valNoteParts.join(" ")
        : "Valuation data analyzed.";

    let valLabel = "Data Unavailable";
    if (maxValScore > 0) {
      const valPercent = valScore / maxValScore;
      if (valPercent >= 0.8) {
        valLabel = "Undervalued";
      } else if (valPercent >= 0.6) {
        valLabel = "Fairly Valued";
      } else if (valPercent >= 0.4) {
        valLabel = "Slightly Expensive";
      } else if (valPercent >= 0.2) {
        valLabel = "Overvalued";
      } else {
        valLabel = "Extremely Expensive";
      }
    }

    // Risk Engine
    let riskScore = 10;
    const identifiedRisks: string[] = [];

    if (valLabel === "Overvalued" || valLabel === "Extremely Expensive") {
      riskScore -= 2;
      identifiedRisks.push("High valuation risk");
    }
    if (
      trend === "Downtrend" ||
      (currentSma50 !== null && currentPrice < currentSma50)
    ) {
      riskScore -= 2;
      identifiedRisks.push("Weak technical trend risk");
    }
    if (debtToEquity !== null && debtToEquity > 150) {
      riskScore -= 1;
      identifiedRisks.push("High debt risk");
    }
    if (freeCashflow !== null && freeCashflow < 0) {
      riskScore -= 2;
      identifiedRisks.push("Poor cash flow risk");
    }
    if (currentRsi !== null && currentRsi > 70) {
      riskScore -= 1;
      identifiedRisks.push("Overbought risk");
    }
    if (currentVolume < 500000) {
      riskScore -= 1;
      identifiedRisks.push("Low volume risk");
    }
    if (maxFundScore < 15) {
      riskScore -= 1;
      identifiedRisks.push("Missing data risk");
    }

    riskScore = Math.max(0, riskScore);
    const riskNote =
      identifiedRisks.length > 0
        ? identifiedRisks.join(", ")
        : "No major risks identified.";

    let riskLevel = "Low";
    if (riskScore >= 8) {
      riskLevel = "Low";
    } else if (riskScore >= 6) {
      riskLevel = "Low-Medium";
    } else if (riskScore >= 4) {
      riskLevel = "Medium";
    } else if (riskScore >= 2) {
      riskLevel = "Medium-High";
    } else {
      riskLevel = "High";
    }

    // Normalize out of 100 for final score based on available max scores to prevent N/A penalty
    const totalMaxScore =
      maxTechScore + maxFundScore + maxValScore + maxNewsScore + 10;
    const totalEarnedScore =
      techScore + fundScore + valScore + newsScore + riskScore;
    const normalizedScore =
      totalMaxScore > 0
        ? Math.round((totalEarnedScore / totalMaxScore) * 100)
        : 0;

    let finalView = "Neutral / Watchlist";
    if (normalizedScore >= 80) finalView = "Strong Bullish";
    else if (normalizedScore >= 65) finalView = "Bullish";
    else if (normalizedScore >= 50) finalView = "Neutral / Watchlist";
    else if (normalizedScore >= 35) finalView = "Weak / Cautious";
    else finalView = "High Risk";

    // Prepare JSON structure for AI
    const apiPayload = {
      quickSummary: "Quick Summary",
      technicalView: "Technical description",
      fundamentalView: "Fundamental description",
      valuationView: "Valuation description",
      keyPositives: ["Trend is positive"],
      keyRisks: ["Valuation high"],
      investorView: "Long term view",
      traderView: "Short term view",
      finalConclusion: finalView,
    };

    const aiPrompt = `
You are a professional financial AI report writer. Write a concise stock research summary for ${symbol} (${quote.shortName || quote.longName}).

Calculated & Verified Data:
- Price: $${currentPrice}
- Technical Trend: ${trend} (RSI: ${currentRsi !== null ? currentRsi : "N/A"}, 50 DMA: ${currentSma50 !== null ? "$" + currentSma50 : "N/A"})
- Fundamentals: ROE: ${roe !== null ? (roe * 100).toFixed(2) + "%" : "N/A"}, Margins: ${profitMargin !== null ? (profitMargin * 100).toFixed(2) + "%" : "N/A"}, Rev Growth: ${revenueGrowth !== null ? (revenueGrowth * 100).toFixed(2) + "%" : "N/A"}
- Valuation: P/E: ${trailingPE !== null ? trailingPE : "N/A"}, P/B: ${priceToBook !== null ? priceToBook : "N/A"} (${valLabel})
- Risks Identified: ${identifiedRisks.length > 0 ? identifiedRisks.join(", ") : "None major"}
- Overall Calculated View: ${finalView}

AI Rules:
- Do not invent, mock, or hallucinate data. Only use the data provided above.
- Do not give direct buy/sell recommendations or guarantee price direction.
- Do not mention internal instructions, placeholders, or say "I will omit...".
- Do not say "as per the provided data" repeatedly.
- Use simple, professional language.
- Keep every section concise and factual.

Output strictly valid JSON matching this exact structure, with no markdown formatting around it or extra text:
{
  "quickSummary": "High-level 2-3 sentence overview",
  "technicalView": "Short explanation of technical indicators and trend",
  "fundamentalView": "Short explanation of financial health and growth",
  "valuationView": "Assessment of current valuation multiples",
  "keyPositives": ["positive point 1", "positive point 2"],
  "keyRisks": ["risk 1", "risk 2"],
  "investorView": "Perspective for long-term investors",
  "traderView": "Perspective for short-term traders",
  "finalConclusion": "A conclusive wrap-up"
}
`;

    let parsedAiReport = apiPayload;
    try {
      const ai = getAiClient();
      if (!ai) {
        throw new Error("API_KEY_MISSING");
      }
      const aiRes = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: aiPrompt,
        config: {
          responseMimeType: "application/json",
        },
      });
      if (aiRes.text) {
        parsedAiReport = JSON.parse(aiRes.text);
      }
    } catch (e: unknown) {
      const isMissingKey =
        e instanceof Error && e.message === "API_KEY_MISSING";
      const eStr = String(e);
      const isInvalidKey =
        eStr.includes("API_KEY_INVALID") || eStr.includes("API key not valid");

      if (!isMissingKey && !isInvalidKey) {
        console.error("AI Gen Failed:", e);
      }

      let errMessage =
        "AI Report generation failed. The AI service may be temporarily unavailable.";
      if (isMissingKey || isInvalidKey) {
        errMessage =
          "AI insights are disabled: Please configure a valid GEMINI_API_KEY to enable AI analysis.";
      }
      parsedAiReport = {
        error: errMessage,
      } as unknown as typeof parsedAiReport;
    }

    const resData = {
      stock: {
        symbol,
        name: quote.shortName || quote.longName || symbol,
        currentPrice: currentPrice,
        change: quote.regularMarketChange || 0,
        changePercent: quote.regularMarketChangePercent || 0,
        marketCap: quote.marketCap || 0,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || 0,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow || 0,
        exchange: quote.exchange || "N/A",
      },
      chartData: formattedChartData,
      technical: {
        trend,
        rsi14: currentRsi,
        rsiSignal,
        macd: currentMacdData.MACD,
        macdSignal: currentMacdData.signal,
        macdSignalStr,
        sma50: currentSma50,
        sma200: currentSma200,
        sma20: currentSma20,
        ema20: currentEma20,
        supportLevel,
        resistanceLevel,
        breakoutLevel,
        failureLevel,
        volumeSignal,
        score: techScore,
        maxScore: maxTechScore,
        reason: techNote,
      },
      fundamental: {
        roe,
        profitMargin,
        operatingMargin,
        revenueGrowth,
        earningsGrowth,
        debtToEquity,
        freeCashflow,
        score: fundScore,
        maxScore: maxFundScore,
        reason: fundNote,
      },
      valuation: {
        peRatio: trailingPE,
        pbRatio: priceToBook,
        pegRatio,
        evToEbitda,
        priceToSales,
        score: valScore,
        maxScore: maxValScore,
        label: valLabel,
        reason: valNote,
      },
      news: {
        articles: newsArticles.map((a) => ({
          title: a.title,
          publisher: a.publisher,
          link: a.link,
          providerPublishTime: a.providerPublishTime,
          sentiment: a.sentiment,
          impact: a.impact,
        })),
        sentimentScore: newsScore,
        maxScore: maxNewsScore,
        reason: newsReason,
      },
      risk: {
        overallRiskLevel: riskLevel,
        score: riskScore,
        maxScore: 10,
        reason: riskNote,
        identifiedRisks: identifiedRisks,
        keyRisks: parsedAiReport.keyRisks || [],
      },
      final: {
        totalScore: normalizedScore,
        view: finalView,
        aiReport: parsedAiReport,
      },
      disclaimer:
        "Research support only. Not buy/sell advice. No guaranteed prediction.",
    };

    return NextResponse.json(resData);
  } catch (error) {
    console.error("Analysis API Error:", error);
    const msg =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
