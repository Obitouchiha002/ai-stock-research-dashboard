import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();
import { SMA, EMA, RSI, ADX } from "technicalindicators";

const US_MARKET_INDEX = "^GSPC"; // S&P 500
const IN_MARKET_INDEX = "^NSEI"; // Nifty 50

const US_SECTORS: Record<string, string> = {
  Technology: "XLK",
  Financials: "XLF",
  Healthcare: "XLV",
  "Consumer Discretionary": "XLY",
  Industrials: "XLI",
  Energy: "XLE",
  "Basic Materials": "XLB",
  "Real Estate": "XLRE",
  Utilities: "XLU",
  "Communication Services": "XLC",
  "Consumer Staples": "XLP",
};

const IN_SECTORS: Record<string, string> = {
  Bank: "^NSEBANK",
  Financials: "^CNXFIN",
  Technology: "^CNXIT",
  Auto: "^CNXAUTO",
  Pharma: "^CNXPHARMA",
  FMCG: "^CNXFMCG",
  Metal: "^CNXMETAL",
  Realty: "^CNXREALTY",
  Energy: "^CNXENERGY",
  Oil: "^CNXENERGY",
};

function getSectorSymbol(sector: string, market: string) {
  if (!sector) return null;
  if (market === "IN" || market === "NSE" || market === "BSE") {
    for (const key of Object.keys(IN_SECTORS)) {
      if (sector.toLowerCase().includes(key.toLowerCase()))
        return IN_SECTORS[key];
    }
    // fallback index
    return "^CNX500";
  } else {
    for (const key of Object.keys(US_SECTORS)) {
      if (sector.toLowerCase().includes(key.toLowerCase()))
        return US_SECTORS[key];
    }
    return "^RUT"; // fallback
  }
}

async function analyzeSymbol(symbol: string): Promise<any> {
  try {
    const chartResult: any = await yahooFinance.chart(symbol, {
      period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      interval: "1d",
    });

    if (
      !chartResult ||
      !chartResult.quotes ||
      chartResult.quotes.length === 0
    ) {
      throw new Error("Data unavailable");
    }

    const quotes = chartResult.quotes;
    const currentPrice = quotes[quotes.length - 1].close;

    // Calculate 1M return (approx 21 trading days)
    let return1M = 0;
    if (quotes.length > 21) {
      const price1M = quotes[quotes.length - 21].close;
      return1M = ((currentPrice - price1M) / price1M) * 100;
    }

    // Calculate 3M return (approx 63 trading days)
    let return3M = 0;
    if (quotes.length > 63) {
      const price3M = quotes[quotes.length - 63].close;
      return3M = ((currentPrice - price3M) / price3M) * 100;
    }

    // Compute trend/RSI/ADX directly from the daily chart we already fetched
    // (avoids a second, expensive multi-timeframe fetch per index/sector).
    const closes = quotes.map((q: any) => q.close).filter((c: any) => c != null);
    const highs = quotes.map((q: any) => q.high ?? q.close);
    const lows = quotes.map((q: any) => q.low ?? q.close);

    const sma50Arr = SMA.calculate({ period: 50, values: closes });
    const ema20Arr = EMA.calculate({ period: 20, values: closes });
    const ema50Arr = EMA.calculate({ period: 50, values: closes });
    const rsiArr = RSI.calculate({ period: 14, values: closes });
    const adxArr = ADX.calculate({
      period: 14,
      high: highs,
      low: lows,
      close: closes,
    });

    const last = (a: any[]) => (a.length > 0 ? a[a.length - 1] : null);
    const sma50 = last(sma50Arr);
    const ema20 = last(ema20Arr);
    const ema50 = last(ema50Arr);
    const rsi = last(rsiArr);
    const adxObj = last(adxArr);
    const adx = adxObj ? adxObj.adx : null;

    const direction =
      sma50 && currentPrice > sma50 ? "Uptrend" : "Downtrend";
    const strong = adx !== null && adx > 25;
    const trend =
      direction === "Uptrend"
        ? strong
          ? "Strong uptrend"
          : "Uptrend"
        : strong
          ? "Strong downtrend"
          : "Downtrend";

    return {
      available: true,
      symbol,
      trend,
      currentPrice,
      priceVs20: ema20 ? (currentPrice > ema20 ? "Above" : "Below") : "N/A",
      priceVs50: ema50 ? (currentPrice > ema50 ? "Above" : "Below") : "N/A",
      rsi: rsi !== null ? Math.round(rsi) : null,
      adx: adx !== null ? Math.round(adx) : null,
      return1M,
      return3M,
    };
  } catch (err) {
    return {
      available: false,
      error: "Index data unavailable from current provider.",
    };
  }
}

export async function getMarketContext(
  market: string,
  sector: string,
  stockTrend: string,
  stockReturn1M: number,
) {
  const marketSymbol =
    market === "IN" || market === "NSE" || market === "BSE" ? IN_MARKET_INDEX : US_MARKET_INDEX;
  const sectorSymbol = getSectorSymbol(sector, market);

  const [marketData, sectorData] = await Promise.all([
    analyzeSymbol(marketSymbol),
    sectorSymbol
      ? analyzeSymbol(sectorSymbol)
      : Promise.resolve({ available: false, error: "No sector mapping found" }),
  ]);

  // Calculate Alignment Score
  let alignmentScore = 0;
  let marketTrendVal = 0;
  let sectorTrendVal = 0;
  let stockTrendVal = 0;
  let rsVal = 0;

  if (marketData.available) {
    if (marketData.trend?.includes("Uptrend")) marketTrendVal = 25;
    else if (marketData.trend?.includes("Neutral")) marketTrendVal = 10;
  }

  if (sectorData.available) {
    if (sectorData.trend?.includes("Uptrend")) sectorTrendVal = 35;
    else if (sectorData.trend?.includes("Neutral")) sectorTrendVal = 15;
  }

  if (stockTrend?.includes("Uptrend")) stockTrendVal = 25;
  else if (stockTrend?.includes("Neutral")) stockTrendVal = 10;

  const sectorOutperformingMarket =
    sectorData.available &&
    marketData.available &&
    (sectorData.return1M || 0) > (marketData.return1M || 0);
  const stockOutperformingSector =
    sectorData.available && stockReturn1M > (sectorData.return1M || 0);

  if (stockOutperformingSector) rsVal += 10;
  if (sectorOutperformingMarket) rsVal += 5;

  alignmentScore = marketTrendVal + sectorTrendVal + stockTrendVal + rsVal;

  let alignmentLabel = "";
  if (alignmentScore >= 80) alignmentLabel = "Strong cluster strength";
  else if (alignmentScore >= 60) alignmentLabel = "Positive sector support";
  else if (alignmentScore >= 40) alignmentLabel = "Mixed top-down setup";
  else if (alignmentScore >= 20) alignmentLabel = "Weak sector support";
  else alignmentLabel = "No sector support";

  let conclusion = "";
  if (alignmentScore >= 60) {
    conclusion =
      "Cluster strength visible. Stock trend is aligned with sector strength.";
  } else if (alignmentScore < 40) {
    conclusion =
      "Stock does not currently have strong index or sector support.";
  } else {
    conclusion =
      "Mixed top-down alignment. Wait for stronger sector participation.";
  }

  let sectorStrengthLabel = "Neutral sector";
  if (sectorData.available && marketData.available) {
    if (sectorData.trend?.includes("Uptrend") && sectorOutperformingMarket)
      sectorStrengthLabel = "Strong sector support";
    else if (sectorData.trend?.includes("Uptrend"))
      sectorStrengthLabel = "Sector improving";
    else if (sectorData.trend?.includes("Downtrend"))
      sectorStrengthLabel = "Weak sector";
  } else if (!sectorData.available) {
    sectorStrengthLabel = "Sector data unavailable";
  }

  return {
    marketContext: marketData,
    sectorContext: sectorData,
    alignmentScore,
    alignmentLabel,
    conclusion,
    sectorStrengthLabel,
    sectorSymbol,
  };
}
