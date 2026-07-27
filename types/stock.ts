export type StockData = {
  stock: {
    name: string
    ticker: string
    exchange: string
    sector: string
    industry: string
    marketCap: string
    currentPrice: string
    currency: string
  }
  pricePerformance: {
    oneDay: string
    oneMonth: string
    sixMonth: string
    oneYear: string
    fiftyTwoWeekHigh: string
    fiftyTwoWeekLow: string
  }
  technical: {
    trend: string
    dma50: string
    dma200: string
    rsi: string
    macd: string
    support: string
    resistance: string
    volumeView: string
    score: number
    summary: string
  }
  fundamental: {
    pe: string
    pb: string
    eps: string
    roe: string
    roa: string
    debtToEquity: string
    profitMargin: string
    revenueGrowth: string
    score: number
    summary: string
  }
  valuation: {
    view: string
    score: number
    summary: string
  }
  news: {
    sentiment: string
    score: number
    latestNews: Array<{ headline: string, source: string, summary: string }>
    summary: string
  }
  risk: {
    riskLevel: string
    score: number
    keyRisks: string[]
  }
  final: {
    totalScore: number
    bias: string
    confidence: string
    aiReport: {
      quickSummary: string
      technicalView: string
      fundamentalView: string
      valuationView: string
      keyPositives: string[]
      keyRisks: string[]
      investorView: string
      traderView: string
      finalConclusion: string
    }
  }
  chartData: Array<{
    date: string
    price: number
    volume: number
  }>
}
