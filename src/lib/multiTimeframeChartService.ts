import {
  SMA,
  EMA,
  RSI,
  ADX,
  doji,
  bearishengulfingpattern,
  bullishengulfingpattern,
  hammerpattern,
  shootingstar,
} from "technicalindicators";

const DAY_MS = 24 * 3600 * 1000;

// Minimum coverage targets per Part 1 spec.
const TIMEFRAME_RULES: Record<
  string,
  { minCandles: number; minSpanDays: number; outCount: number; label: string }
> = {
  // Hourly: at least ~1 month of hourly data (~7 trading hrs * ~22 sessions).
  hourly: { minCandles: 120, minSpanDays: 25, outCount: 180, label: "1 month" },
  // Daily: at least 6 months / ~120-140 trading sessions.
  daily: { minCandles: 120, minSpanDays: 150, outCount: 180, label: "6 months" },
  // Weekly: at least 1 year (~52 weekly candles).
  weekly: { minCandles: 52, minSpanDays: 350, outCount: 120, label: "1 year" },
};

/**
 * Aggregate daily candles into weekly candles (used when the provider does not
 * return enough native weekly history). Groups by ISO week.
 */
function aggregateDailyToWeekly(dailyQuotes: any[]): any[] {
  if (!dailyQuotes || dailyQuotes.length === 0) return [];
  const weeks: Record<string, any[]> = {};
  for (const q of dailyQuotes) {
    const d = q.date instanceof Date ? q.date : new Date(q.date);
    if (isNaN(d.getTime())) continue;
    // Key by year + ISO week number (Thursday-anchored).
    const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (tmp.getUTCDay() + 6) % 7;
    tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
    const weekNo =
      1 +
      Math.round(
        ((tmp.getTime() - firstThursday.getTime()) / DAY_MS -
          3 +
          ((firstThursday.getUTCDay() + 6) % 7)) /
          7,
      );
    const key = `${tmp.getUTCFullYear()}-W${weekNo}`;
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(q);
  }
  return Object.values(weeks)
    .filter((group) => group.length > 0)
    .map((group) => {
      const opens = group.filter((g) => g.open != null);
      const valid = group.filter((g) => g.close != null);
      return {
        date: group[group.length - 1].date,
        open: opens.length > 0 ? opens[0].open : valid[0]?.close,
        high: Math.max(...group.map((g) => g.high ?? g.close ?? 0)),
        low: Math.min(...group.map((g) => g.low ?? g.close ?? Infinity)),
        close: valid.length > 0 ? valid[valid.length - 1].close : null,
        volume: group.reduce((a, g) => a + (g.volume || 0), 0),
      };
    });
}

export async function generateMultiTimeframeAnalysis(
  yfClient: any,
  symbol: string,
) {
  const now = new Date();

  // Hourly: ~90 days is plenty for the 1-month target plus SMA200 on hourly,
  // and is far faster to fetch than a multi-year intraday window.
  const hPromise = yfClient
    .chart(symbol, {
      period1: new Date(now.getTime() - 90 * DAY_MS)
        .toISOString()
        .split("T")[0],
      interval: "1h",
    })
    .catch(() => null);

  // Daily: fetch 3 years so SMA200 + a clean 6-month window are available.
  const dPromise = yfClient
    .chart(symbol, {
      period1: new Date(now.getTime() - 365 * 3 * DAY_MS)
        .toISOString()
        .split("T")[0],
      interval: "1d",
    })
    .catch(() => null);

  // Weekly: 5 years is enough for the 1-year target and weekly SMA200.
  const wPromise = yfClient
    .chart(symbol, {
      period1: new Date(now.getTime() - 365 * 5 * DAY_MS)
        .toISOString()
        .split("T")[0],
      interval: "1wk",
    })
    .catch(() => null);

  const [hChart, dChart, wChart] = await Promise.all([
    hPromise,
    dPromise,
    wPromise,
  ]);

  const processTimeframe = (
    chartData: any,
    timeframeName: string,
    fallbackQuotes?: any[],
  ) => {
    const rule = TIMEFRAME_RULES[timeframeName] || TIMEFRAME_RULES.daily;
    let quotes: any[] =
      chartData && chartData.quotes ? [...chartData.quotes] : [];
    let aggregatedFromDaily = false;

    // Weekly fallback: aggregate daily candles when native weekly history is
    // missing or shorter than the 1-year target.
    if (
      timeframeName === "weekly" &&
      fallbackQuotes &&
      fallbackQuotes.length > 0 &&
      quotes.length < rule.minCandles
    ) {
      const agg = aggregateDailyToWeekly(fallbackQuotes);
      if (agg.length > quotes.length) {
        quotes = agg;
        aggregatedFromDaily = true;
      }
    }

    // Drop incomplete candles (null close).
    quotes = quotes.filter((q) => q && q.close != null);

    if (quotes.length === 0) {
      return {
        error: "Data unavailable for this timeframe.",
        timeframe: timeframeName,
        candles: [],
        dataRange: "",
        isComplete: false,
        missingReason: `No ${timeframeName} data available from current provider.`,
      };
    }
    const closes = quotes.map((q: any) => q.close);
    const highs = quotes.map((q: any) => q.high);
    const lows = quotes.map((q: any) => q.low);
    const opens = quotes.map((q: any) => q.open);
    const volumes = quotes.map((q: any) => q.volume);
    const currentPrice = closes[closes.length - 1];

    // MAs
    const sma10 = SMA.calculate({ period: 10, values: closes });
    const sma20 = SMA.calculate({ period: 20, values: closes });
    const sma50 = SMA.calculate({ period: 50, values: closes });
    const sma200 = SMA.calculate({ period: 200, values: closes });

    const ema10 = EMA.calculate({ period: 10, values: closes });
    const ema20 = EMA.calculate({ period: 20, values: closes });
    const ema50 = EMA.calculate({ period: 50, values: closes });
    const ema200 = EMA.calculate({ period: 200, values: closes });

    const currSma10 = sma10.length > 0 ? sma10[sma10.length - 1] : null;
    const currSma20 = sma20.length > 0 ? sma20[sma20.length - 1] : null;
    const currSma50 = sma50.length > 0 ? sma50[sma50.length - 1] : null;
    const currSma200 = sma200.length > 0 ? sma200[sma200.length - 1] : null;

    const currEma10 = ema10.length > 0 ? ema10[ema10.length - 1] : null;
    const currEma20 = ema20.length > 0 ? ema20[ema20.length - 1] : null;
    const currEma50 = ema50.length > 0 ? ema50[ema50.length - 1] : null;
    const currEma200 = ema200.length > 0 ? ema200[ema200.length - 1] : null;

    // RSI
    const rsiArray = RSI.calculate({ period: 14, values: closes });
    const currRsi = rsiArray.length > 0 ? rsiArray[rsiArray.length - 1] : null;
    let rsiLabel = "";
    if (currRsi !== null) {
      if (currRsi < 30) rsiLabel = "Oversold";
      else if (currRsi < 45) rsiLabel = "Weak";
      else if (currRsi <= 60) rsiLabel = "Neutral";
      else if (currRsi <= 70) rsiLabel = "Strong";
      else rsiLabel = "Overbought";
    }

    // ADX
    const adxArray = ADX.calculate({
      period: 14,
      high: highs,
      low: lows,
      close: closes,
    });
    const currAdx =
      adxArray.length > 0 ? adxArray[adxArray.length - 1].adx : null;
    let adxLabel = "";
    let trendDirection =
      currSma50 && currentPrice > currSma50 ? "Uptrend" : "Downtrend";

    if (currAdx !== null) {
      if (currAdx < 20) adxLabel = "Weak trend";
      else if (currAdx < 25) adxLabel = "Developing trend";
      else if (currAdx <= 40) adxLabel = "Strong trend";
      else adxLabel = "Very strong / stretched trend";
    }

    let trend =
      trendDirection === "Uptrend"
        ? currAdx !== null && currAdx > 25
          ? "Strong uptrend"
          : "Uptrend"
        : currAdx !== null && currAdx > 25
          ? "Strong downtrend"
          : "Downtrend";

    // Volume
    const currentVolume = volumes[volumes.length - 1];
    const volSma20 = SMA.calculate({ period: 20, values: volumes });
    const avgVol = volSma20.length > 0 ? volSma20[volSma20.length - 1] : 1;
    let volumeSignal = "";
    if (currentVolume > avgVol * 1.5)
      volumeSignal = "Strong volume confirmation";
    else if (currentVolume >= avgVol * 1.0) volumeSignal = "Normal volume";
    else volumeSignal = "Weak volume";

    // Support / Resistance (rough estimation using min/max of recent windows)
    const recentWindow =
      timeframeName === "hourly" ? 40 : timeframeName === "daily" ? 20 : 10;
    const recentPrices = closes.slice(-recentWindow);
    const groupSupport = Math.min(...recentPrices);
    const groupResistance = Math.max(...recentPrices);

    // Candlestick Patterns
    const patterns = [];
    const recentInput = {
      open: opens.slice(-5),
      high: highs.slice(-5),
      low: lows.slice(-5),
      close: closes.slice(-5),
    };

    const lastDate = quotes[quotes.length - 1].date;
    const formattedDate =
      lastDate instanceof Date
        ? lastDate.toISOString().split("T")[0]
        : lastDate;

    // Check using standard technical indicators pattern detectors
    if (doji(recentInput))
      patterns.push({
        name: "Doji",
        date: formattedDate,
        reliability: "Low",
        intent: "Neutral",
        conf: "Wait",
      });
    if (bearishengulfingpattern(recentInput))
      patterns.push({
        name: "Bearish Engulfing",
        date: formattedDate,
        reliability: "High",
        intent: "Bearish",
        conf: "Yes",
      });
    if (bullishengulfingpattern(recentInput))
      patterns.push({
        name: "Bullish Engulfing",
        date: formattedDate,
        reliability: "High",
        intent: "Bullish",
        conf: "Yes",
      });
    if (hammerpattern(recentInput))
      patterns.push({
        name: "Hammer",
        date: formattedDate,
        reliability: "Medium",
        intent: "Bullish",
        conf: "Yes",
      });
    if (shootingstar(recentInput))
      patterns.push({
        name: "Shooting Star",
        date: formattedDate,
        reliability: "Medium",
        intent: "Bearish",
        conf: "Yes",
      });

    if (closes.length >= 2) {
      let lastI = closes.length - 1;
      if (highs[lastI] < highs[lastI - 1] && lows[lastI] > lows[lastI - 1]) {
        patterns.push({
          name: "Inside Bar",
          date: formattedDate,
          reliability: "Medium",
          intent: "Neutral",
          conf: "Wait",
        });
      }
    }

    // align arrays by padding with nulls at the beginning
    const pad = (arr: any[], len: number) => {
      const missing = len - arr.length;
      return missing > 0 ? [...Array(missing).fill(null), ...arr] : arr;
    };

    const sma10Arr = pad(sma10, closes.length);
    const sma20Arr = pad(sma20, closes.length);
    const sma50Arr = pad(sma50, closes.length);
    const sma200Arr = pad(sma200, closes.length);

    const ema10Arr = pad(ema10, closes.length);
    const ema20Arr = pad(ema20, closes.length);
    const ema50Arr = pad(ema50, closes.length);
    const ema200Arr = pad(ema200, closes.length);

    const rsiArrAligned = pad(rsiArray, closes.length);
    const adxArrAligned = pad(
      adxArray.map((a: any) => a.adx),
      closes.length,
    );
    // The other two ADX lines: +DI (buying pressure) and -DI (selling pressure).
    const plusDIArr = pad(
      adxArray.map((a: any) => a.pdi),
      closes.length,
    );
    const minusDIArr = pad(
      adxArray.map((a: any) => a.mdi),
      closes.length,
    );
    // RSI signal line = 9-period SMA of RSI (crossovers read as momentum shifts).
    const rsiSignalArr = pad(
      SMA.calculate({ period: 9, values: rsiArray as number[] }),
      closes.length,
    );

    const priceVsSma10 = currSma10
      ? currentPrice > currSma10
        ? "Above"
        : "Below"
      : "N/A";
    const priceVsSma20 = currSma20
      ? currentPrice > currSma20
        ? "Above"
        : "Below"
      : "N/A";
    const priceVsSma50 = currSma50
      ? currentPrice > currSma50
        ? "Above"
        : "Below"
      : "N/A";
    const priceVsSma200 = currSma200
      ? currentPrice > currSma200
        ? "Above"
        : "Below"
      : "N/A";

    const priceVsEma10 = currEma10
      ? currentPrice > currEma10
        ? "Above"
        : "Below"
      : "N/A";
    const priceVsEma20 = currEma20
      ? currentPrice > currEma20
        ? "Above"
        : "Below"
      : "N/A";
    const priceVsEma50 = currEma50
      ? currentPrice > currEma50
        ? "Above"
        : "Below"
      : "N/A";
    const priceVsEma200 = currEma200
      ? currentPrice > currEma200
        ? "Above"
        : "Below"
      : "N/A";

    const distSma10 = currSma10
      ? ((currentPrice - currSma10) / currSma10) * 100
      : 0;
    const distSma20 = currSma20
      ? ((currentPrice - currSma20) / currSma20) * 100
      : 0;
    const distSma50 = currSma50
      ? ((currentPrice - currSma50) / currSma50) * 100
      : 0;

    const distEma10 = currEma10
      ? ((currentPrice - currEma10) / currEma10) * 100
      : 0;
    const distEma20 = currEma20
      ? ((currentPrice - currEma20) / currEma20) * 100
      : 0;
    const distEma50 = currEma50
      ? ((currentPrice - currEma50) / currEma50) * 100
      : 0;

    // Build data-range metadata (Part 1).
    const outCount = Math.min(rule.outCount, quotes.length);
    const firstDateObj =
      quotes[0].date instanceof Date ? quotes[0].date : new Date(quotes[0].date);
    const lastDateObj =
      quotes[quotes.length - 1].date instanceof Date
        ? quotes[quotes.length - 1].date
        : new Date(quotes[quotes.length - 1].date);
    const spanDays =
      (lastDateObj.getTime() - firstDateObj.getTime()) / DAY_MS;
    const fmt = (d: Date) =>
      isNaN(d.getTime()) ? "N/A" : d.toISOString().split("T")[0];
    const unitWord =
      timeframeName === "hourly"
        ? "hourly candles"
        : timeframeName === "weekly"
          ? "weeks"
          : "sessions";
    const dataRange = `${fmt(firstDateObj)} → ${fmt(lastDateObj)} (${quotes.length} ${unitWord})`;

    const meetsCandles = quotes.length >= rule.minCandles;
    const meetsSpan = spanDays >= rule.minSpanDays;
    const isComplete = meetsCandles && meetsSpan;
    let missingReason = "";
    if (!isComplete) {
      if (timeframeName === "hourly") {
        missingReason =
          "Hourly data is limited by provider. Showing maximum available data.";
      } else if (timeframeName === "weekly") {
        missingReason = aggregatedFromDaily
          ? "Native weekly history limited; aggregated from daily candles. Showing maximum available data."
          : "Weekly data is limited by provider. Showing maximum available data.";
      } else {
        missingReason =
          "Daily history is limited by provider. Showing maximum available data.";
      }
    } else if (aggregatedFromDaily) {
      missingReason = "Weekly candles aggregated from daily data.";
    }

    return {
      timeframe: timeframeName,
      dataRange,
      isComplete,
      missingReason,
      candleCount: quotes.length,
      aggregatedFromDaily,
      candles: quotes.slice(-outCount).map((q: any, idx: number) => {
        const i = closes.length - outCount + idx; // map back to original index
        return {
          date: q.date instanceof Date ? q.date.toISOString() : q.date,
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.close,
          candle: [q.low, q.high],
          volume: q.volume,
          sma10: i >= 0 ? sma10Arr[i] : null,
          sma20: i >= 0 ? sma20Arr[i] : null,
          sma50: i >= 0 ? sma50Arr[i] : null,
          sma200: i >= 0 ? sma200Arr[i] : null,
          ema10: i >= 0 ? ema10Arr[i] : null,
          ema20: i >= 0 ? ema20Arr[i] : null,
          ema50: i >= 0 ? ema50Arr[i] : null,
          ema200: i >= 0 ? ema200Arr[i] : null,
          rsi: i >= 0 ? rsiArrAligned[i] : null,
          rsiSignal: i >= 0 ? rsiSignalArr[i] : null,
          adx: i >= 0 ? adxArrAligned[i] : null,
          plusDI: i >= 0 ? plusDIArr[i] : null,
          minusDI: i >= 0 ? minusDIArr[i] : null,
        };
      }),
      trend,
      support: [groupSupport * 0.99, groupSupport * 1.01],
      resistance: [groupResistance * 0.99, groupResistance * 1.01],
      rsi: currRsi ? Math.round(currRsi) : null,
      rsiLabel,
      adx: currAdx ? Math.round(currAdx) : null,
      adxLabel,
      volumeSignal,
      patterns,
      sma: {
        10: currSma10,
        20: currSma20,
        50: currSma50,
        200: currSma200,
        priceVs10: priceVsSma10,
        priceVs20: priceVsSma20,
        priceVs50: priceVsSma50,
        priceVs200: priceVsSma200,
        dist10: distSma10,
        dist20: distSma20,
        dist50: distSma50,
      },
      ema: {
        10: currEma10,
        20: currEma20,
        50: currEma50,
        200: currEma200,
        priceVs10: priceVsEma10,
        priceVs20: priceVsEma20,
        priceVs50: priceVsEma50,
        priceVs200: priceVsEma200,
        dist10: distEma10,
        dist20: distEma20,
        dist50: distEma50,
      },
      currentPrice,
      view: trend,
    };
  };

  const hourly: any = processTimeframe(hChart, "hourly");
  const daily: any = processTimeframe(dChart, "daily");
  // Weekly: pass daily quotes so it can aggregate when native weekly is short.
  const weekly: any = processTimeframe(
    wChart,
    "weekly",
    dChart && dChart.quotes ? dChart.quotes : undefined,
  );

  // Multi-timeframe alignment score
  let alignmentScore = 0;
  if (!hourly.error && hourly.trend?.includes("Uptrend")) alignmentScore += 25;
  if (!daily.error && daily.trend?.includes("Uptrend")) alignmentScore += 35;
  if (!weekly.error && weekly.trend?.includes("Uptrend")) alignmentScore += 40;

  let alignmentLabel = "";
  if (alignmentScore >= 80) alignmentLabel = "Strong alignment";
  else if (alignmentScore >= 60)
    alignmentLabel = "Positive but needs confirmation";
  else if (alignmentScore >= 40) alignmentLabel = "Mixed / unclear";
  else if (alignmentScore >= 20) alignmentLabel = "Weak alignment";
  else alignmentLabel = "Bearish alignment";

  // Run-up / extension risk (using daily data)
  let extensionRisk = {
    runUpPercent: "",
    distanceFrom10MA: "",
    distanceFrom20MA: "",
    riskLevel: "Low",
    message: "",
  };
  let setupLabel = "Data Insufficient";

  if (!daily.error) {
    const closes = daily.candles.map((c: any) => c.close);
    const currentPrice = daily.currentPrice;

    // 10 session runup
    const price10DaysAgo = closes[Math.max(0, closes.length - 10)];
    const runUp = ((currentPrice - price10DaysAgo) / price10DaysAgo) * 100;

    const r10 = daily.ema.dist10 || 0;
    const r20 = daily.ema.dist20 || 0;

    extensionRisk = {
      runUpPercent: runUp.toFixed(2),
      distanceFrom10MA: r10.toFixed(2),
      distanceFrom20MA: r20.toFixed(2),
      riskLevel: "Low",
      message: "",
    };

    if (runUp > 20 || r20 > 12) {
      extensionRisk.riskLevel = "High";
      extensionRisk.message = "Already run up. High extension risk.";
    } else if (runUp > 15 || r10 > 8) {
      extensionRisk.riskLevel = "Medium";
      extensionRisk.message = "Stretched. Caution advised.";
    } else if (daily.rsi > 70 && r10 > 5) {
      extensionRisk.riskLevel = "Medium";
      extensionRisk.message =
        "Overbought and extended. Fresh entry may be risky.";
    } else if (daily.rsi > 70) {
      extensionRisk.riskLevel = "Medium";
      extensionRisk.message =
        "Avoid chasing. Wait for pullback or consolidation.";
    }

    // Setup Label logic
    if (daily.trend === "Strong uptrend" && extensionRisk.riskLevel === "Low")
      setupLabel = "Clean Bullish Setup";
    else if (
      daily.trend?.includes("Uptrend") &&
      extensionRisk.riskLevel === "High"
    )
      setupLabel = "Bullish but Extended";
    else if (daily.rsi < 40 && daily.trend?.includes("Uptrend"))
      setupLabel = "Pullback Watch";
    else if (
      daily.volumeSignal?.includes("Strong") &&
      currentPrice > daily.resistance[0]
    )
      setupLabel = "Breakout Watch";
    else if (daily.trend === "Strong downtrend")
      setupLabel = "Strong Downtrend";
    else if (daily.trend === "Downtrend") setupLabel = "Weak Setup";
    else setupLabel = "Mixed Setup";
  }

  return {
    hourly,
    daily,
    weekly,
    alignmentScore,
    alignmentLabel,
    extensionRisk,
    setupLabel,
  };
}
