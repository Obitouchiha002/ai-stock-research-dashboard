export interface StockMatch {
  name: string;
  symbol: string;
  exchange: string;
  country?: string;
  type?: string;
}

export interface StockData {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  marketCap: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  exchange: string;
  sector?: string;
  industry?: string;

  returns: {
    "1D": number;
    "1W"?: number;
    "1M"?: number;
    "3M"?: number;
    "6M"?: number;
    "1Y"?: number;
  };

  chartData: Array<{
    date: string;
    close: number;
    high: number;
    low: number;
    open: number;
    volume: number;
    sma50?: number;
    sma200?: number;
  }>;

  technical: {
    trend: string;
    rsi14: number | null;
    rsiSignal: string;
    macd: number | null;
    macdSignalValue: number | null;
    macdSignal: string;
    sma50: number | null;
    sma200: number | null;
    priceVsSma50: string;
    priceVsSma200: string;
    volumeSignal: string;
    support: number | null;
    resistance: number | null;
    breakoutLevel: number | null;
    failureLevel: number | null;
    score: number;
    maxScore: number;
    reason: string;
  };

  fundamental: {
    revenueGrowth: number | null;
    profitGrowth: number | null;
    epsGrowth: number | null;
    operatingMargin: number | null;
    netProfitMargin: number | null;
    roe: number | null;
    roce: number | null;
    debtEquity: number | null;
    freeCashFlow: number | null;
    score: number;
    maxScore: number;
    reason: string;
  };

  valuation: {
    peRatio: number | null;
    pbRatio: number | null;
    evEbitda: number | null;
    priceSales: number | null;
    pegRatio: number | null;
    score: number;
    maxScore: number;
    label: string;
    reason: string;
  };

  news: {
    articles: Array<{
      title: string;
      source: string;
      date: string;
      url: string;
    }>;
    sentimentScore: number;
    maxScore: number;
    reason: string;
  };

  risk: {
    overallRiskLevel: string;
    score: number;
    maxScore: number;
    reason: string;
    keyRisks: string[];
  };

  final: {
    totalScore: number;
    view: string;
    aiReport: {
      quickSummary: string;
      technicalView: string;
      fundamentalView: string;
      valuationView: string;
      keyPositives: string[];
      keyRisks: string[];
      investorView: string;
      traderView: string;
      finalConclusion: string;
    };
  };
}
