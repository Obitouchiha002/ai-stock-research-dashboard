import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { subDays } from "date-fns";
import { generateJson, runWithUsage, currentUsage } from "@/lib/aiClient";

const yahooFinance = new YahooFinance();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Pos = { symbol: string; value: number; weight: number; plPct: number };
type Bucket = "large" | "mid" | "small";

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) { const c = idx++; out[c] = await fn(items[c], c); }
  }));
  return out;
}

function capBucket(marketCap: number | null, india: boolean): Bucket | "unknown" {
  if (!marketCap || marketCap <= 0) return "unknown";
  const L = india ? 200e9 : 10e9; // large
  const M = india ? 50e9 : 2e9;   // mid
  if (marketCap >= L) return "large";
  if (marketCap >= M) return "mid";
  return "small"; // small + micro folded together
}

const r2 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100) / 100);
const pctNorm = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1000) / 10); // fraction→%

// Pearson correlation of two equal-length arrays.
function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 20) return null;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const market: string = body.market || "";
    const cur: string = body.currency || "$";
    const withCorr: boolean = body.correlation !== false;
    const positions: Pos[] = Array.isArray(body.positions) ? body.positions.slice(0, 120) : [];
    if (positions.length === 0) return NextResponse.json({ error: "no positions" }, { status: 400 });
    const india = /Indian/i.test(market);
    const symbols = positions.map((p) => p.symbol);
    const totalW = positions.reduce((s, p) => s + p.value, 0) || 1;

    // For Indian holdings stored without a suffix, try the NSE (.NS) then BSE
    // (.BO) listing so bare tickers like RELIANCE / TCS resolve on Yahoo.
    const candOf = (s: string) => (s.includes(".") ? [s] : india ? [`${s}.NS`, `${s}.BO`] : [s]);
    const allCands = Array.from(new Set(positions.flatMap((p) => candOf(p.symbol))));

    // 1) Quote for marketCap / PE / EPS — CHUNKED (a single big call is
    //    unreliable / can be truncated by Yahoo), each chunk retried once.
    const q: Record<string, any> = {};
    const chunks: string[][] = [];
    for (let i = 0; i < allCands.length; i += 20) chunks.push(allCands.slice(i, i + 20));
    await Promise.all(chunks.map(async (ch) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const quotes = await yahooFinance.quote(ch);
          (Array.isArray(quotes) ? quotes : [quotes]).forEach((x: any) => { if (x?.symbol) q[x.symbol] = x; });
          if (ch.every((s) => q[s])) break;
        } catch { /* retry */ }
      }
    }));

    // Resolve each holding to the Yahoo symbol that actually returned data.
    const ySymOf: Record<string, string> = {};
    positions.forEach((p) => {
      const cands = candOf(p.symbol);
      ySymOf[p.symbol] = cands.find((c) => q[c] && (typeof q[c].regularMarketPrice === "number" || typeof q[c].marketCap === "number")) || cands[0];
    });

    // 2) quoteSummary per holding (on the resolved symbol) — retried once.
    const funda: Record<string, any> = {};
    await mapLimit(positions, 6, async (p) => {
      const y = ySymOf[p.symbol];
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const s: any = await yahooFinance.quoteSummary(y, {
            modules: ["assetProfile", "summaryDetail", "financialData", "defaultKeyStatistics", "earnings", "cashflowStatementHistory", "incomeStatementHistory", "price"],
          });
          funda[p.symbol] = s;
          return;
        } catch { /* retry */ }
      }
      funda[p.symbol] = null;
    });

    // 3) Build per-stock fundamentals.
    const stocks = positions.map((p) => {
      const qi = q[ySymOf[p.symbol]] || {};
      const f = funda[p.symbol] || {};
      const sd = f.summaryDetail || {};
      const fd = f.financialData || {};
      const ks = f.defaultKeyStatistics || {};
      const pr = f.price || {};
      const num = (...vals: any[]) => { for (const v of vals) if (typeof v === "number" && !Number.isNaN(v)) return v; return null; };
      const pos = (...vals: any[]) => { for (const v of vals) if (typeof v === "number" && v > 0) return v; return null; };
      const price = num(qi.regularMarketPrice, fd.currentPrice, pr.regularMarketPrice);
      const mc = num(qi.marketCap, sd.marketCap, pr.marketCap);
      const beta = num(sd.beta, ks.beta, qi.beta);
      const epsT = num(ks.trailingEps, qi.epsTrailingTwelveMonths);
      const epsF = num(ks.forwardEps, qi.epsForward);
      // PE: reported → else compute price / eps.
      let tpe = pos(qi.trailingPE, sd.trailingPE);
      if (tpe == null && price != null && epsT != null && epsT > 0) tpe = price / epsT;
      let fpe = pos(qi.forwardPE, ks.forwardPE, sd.forwardPE);
      if (fpe == null && price != null && epsF != null && epsF > 0) fpe = price / epsF;
      // Revenue growth YoY: financialData → else last two yearly revenues.
      let revGrowthYoY = pctNorm(fd.revenueGrowth);
      const yearly = f.earnings?.financialsChart?.yearly;
      if (revGrowthYoY == null && Array.isArray(yearly) && yearly.length >= 2) {
        const c = yearly[yearly.length - 1]?.revenue, pV = yearly[yearly.length - 2]?.revenue;
        if (typeof c === "number" && typeof pV === "number" && pV > 0) revGrowthYoY = Math.round(((c - pV) / pV) * 1000) / 10;
      }
      // Earnings growth YoY: financialData → quarterly growth → last two yearly earnings.
      let earnGrowthYoY = pctNorm(fd.earningsGrowth ?? ks.earningsQuarterlyGrowth);
      if (earnGrowthYoY == null && Array.isArray(yearly) && yearly.length >= 2) {
        const c = yearly[yearly.length - 1]?.earnings, pV = yearly[yearly.length - 2]?.earnings;
        if (typeof c === "number" && typeof pV === "number" && pV > 0) earnGrowthYoY = Math.round(((c - pV) / pV) * 1000) / 10;
      }
      // CFO/PAT: financialData opCF → cashflow statement; netIncome from keyStats → income statement.
      const cfList = f.cashflowStatementHistory?.cashflowStatements;
      const isList = f.incomeStatementHistory?.incomeStatementHistory;
      const opCF = num(fd.operatingCashflow, Array.isArray(cfList) ? cfList[0]?.totalCashFromOperatingActivities : null);
      const netInc = num(ks.netIncomeToCommon, Array.isArray(isList) ? isList[0]?.netIncome : null);
      const cfoToPat = opCF != null && netInc != null && netInc > 0 ? Math.round((opCF / netInc) * 100) / 100 : null;
      const profitMargin = pctNorm(fd.profitMargins);
      const roe = pctNorm(fd.returnOnEquity);
      const fwdEarnGrowth = epsT != null && epsF != null && epsT > 0 ? Math.round(((epsF - epsT) / Math.abs(epsT)) * 1000) / 10 : null;
      // QoQ revenue from quarterly earnings chart.
      let revQoQ: number | null = null;
      const quarters = f.earnings?.financialsChart?.quarterly;
      if (Array.isArray(quarters) && quarters.length >= 2) {
        const cur2 = quarters[quarters.length - 1]?.revenue, prev = quarters[quarters.length - 2]?.revenue;
        if (typeof cur2 === "number" && typeof prev === "number" && prev > 0) revQoQ = Math.round(((cur2 - prev) / prev) * 1000) / 10;
      }
      const bucket = capBucket(mc, india);
      const sector = f.assetProfile?.sector || "Unknown";
      const isFinancial = /financ|bank|insur/i.test(sector) || /bank|financ|insur/i.test(f.assetProfile?.industry || "");
      // A % growth off a near-zero base explodes into a meaningless figure
      // (e.g. +9000%); drop anything beyond ±900% rather than mislead.
      const sane = (v: number | null) => (v == null || Math.abs(v) > 900 ? null : v);
      return {
        symbol: p.symbol, weight: p.weight, plPct: p.plPct, value: p.value,
        marketCap: mc, bucket, sector, industry: f.assetProfile?.industry || null,
        beta: r2(beta), trailingPE: r2(tpe), forwardPE: r2(fpe),
        revGrowthYoY: sane(revGrowthYoY), revQoQ: sane(revQoQ), earnGrowthYoY: sane(earnGrowthYoY), fwdEarnGrowth: sane(fwdEarnGrowth),
        // Operating cash flow isn't a quality signal for banks/insurers.
        cfoToPat: isFinancial ? null : cfoToPat,
        profitMargin, roe,
        unprofitable: netInc != null ? netInc < 0 : (epsT != null ? epsT < 0 : null),
      };
    });

    // 4) Bucket + overall aggregates.
    const buckets: Record<string, any> = {};
    (["large", "mid", "small"] as Bucket[]).forEach((b) => {
      const list = stocks.filter((s) => s.bucket === b);
      const bVal = list.reduce((s, x) => s + x.value, 0);
      const wAvg = (key: "beta" | "trailingPE" | "forwardPE") => {
        let w = 0, sum = 0;
        list.forEach((x) => { const v = (x as any)[key]; if (typeof v === "number") { sum += x.value * v; w += x.value; } });
        return w ? Math.round((sum / w) * 100) / 100 : null;
      };
      const secVal: Record<string, number> = {};
      list.forEach((x) => { secVal[x.sector] = (secVal[x.sector] || 0) + x.value; });
      const sectorAlloc = Object.entries(secVal).map(([sector, v]) => ({ sector, pct: bVal ? Math.round((v / bVal) * 1000) / 10 : 0 })).sort((a, b2) => b2.pct - a.pct);
      buckets[b] = {
        pct: Math.round((bVal / totalW) * 1000) / 10,
        count: list.length,
        beta: wAvg("beta"), trailingPE: wAvg("trailingPE"), forwardPE: wAvg("forwardPE"),
        sectorAlloc,
        stocks: list.sort((a, b2) => b2.value - a.value).map((x) => ({ ...x, weightInBucketPct: bVal ? Math.round((x.value / bVal) * 1000) / 10 : 0 })),
      };
    });
    const wAvgAll = (key: "beta" | "trailingPE" | "forwardPE") => {
      let w = 0, sum = 0;
      stocks.forEach((x) => { const v = (x as any)[key]; if (typeof v === "number") { sum += x.value * v; w += x.value; } });
      return w ? Math.round((sum / w) * 100) / 100 : null;
    };
    const secAll: Record<string, number> = {};
    stocks.forEach((x) => { secAll[x.sector] = (secAll[x.sector] || 0) + x.value; });
    const unknownVal = stocks.filter((x) => x.bucket === "unknown").reduce((s, x) => s + x.value, 0);
    const unclassifiedPct = Math.round((unknownVal / totalW) * 1000) / 10;
    const unclassifiedCount = stocks.filter((x) => x.bucket === "unknown").length;
    const overall = {
      count: stocks.length,
      beta: wAvgAll("beta"), trailingPE: wAvgAll("trailingPE"), forwardPE: wAvgAll("forwardPE"),
      sectorAlloc: Object.entries(secAll).map(([sector, v]) => ({ sector, pct: Math.round((v / totalW) * 1000) / 10 })).sort((a, b) => b.pct - a.pct),
      capMix: { large: buckets.large.pct, mid: buckets.mid.pct, small: buckets.small.pct, unclassified: unclassifiedPct },
      unclassifiedCount,
    };

    // 5) Correlation — same-sector pairs that move together.
    let correlations: any[] = [];
    if (withCorr) {
      const bySector: Record<string, string[]> = {};
      stocks.forEach((x) => { if (x.sector && x.sector !== "Unknown") (bySector[x.sector] ||= []).push(x.symbol); });
      const corrSymbols = Array.from(new Set(Object.values(bySector).filter((a) => a.length >= 2).flat())).slice(0, 40);
      if (corrSymbols.length >= 2) {
        const period1 = subDays(new Date(), 400).toISOString().split("T")[0];
        const returns: Record<string, number[]> = {};
        await mapLimit(corrSymbols, 8, async (sym) => {
          try {
            const ch: any = await yahooFinance.chart(ySymOf[sym] || sym, { period1, interval: "1d" }).catch(() => null);
            const closes = (ch?.quotes || []).filter((r: any) => r?.close != null).map((r: any) => r.close);
            const ret: number[] = [];
            for (let i = 1; i < closes.length; i++) ret.push((closes[i] - closes[i - 1]) / closes[i - 1]);
            if (ret.length >= 20) returns[sym] = ret.slice(-180); // last ~180 sessions
          } catch { /* ignore */ }
        });
        Object.entries(bySector).forEach(([sector, syms]) => {
          const have = syms.filter((s) => returns[s]);
          for (let i = 0; i < have.length; i++) for (let j = i + 1; j < have.length; j++) {
            const a = returns[have[i]], b = returns[have[j]];
            const n = Math.min(a.length, b.length);
            const c = pearson(a.slice(-n), b.slice(-n));
            if (c != null && c >= 0.7) correlations.push({ a: have[i], b: have[j], sector, corr: Math.round(c * 100) / 100 });
          }
        });
        correlations.sort((x, y) => y.corr - x.corr);
        correlations = correlations.slice(0, 12);
      }
    }

    // 6) AI quality report + honest flags.
    const compact = stocks.map((s) => ({
      symbol: s.symbol, bucket: s.bucket, weight: Math.round(s.weight * 1000) / 10, sector: s.sector, plPct: s.plPct,
      beta: s.beta, tPE: s.trailingPE, fPE: s.forwardPE, revYoY: s.revGrowthYoY, revQoQ: s.revQoQ,
      earnYoY: s.earnGrowthYoY, fwdEarn: s.fwdEarnGrowth, cfoPat: s.cfoToPat, margin: s.profitMargin, roe: s.roe, unprofitable: s.unprofitable,
    }));
    const prompt = `You are an institutional-grade fundamental equity analyst reviewing a client's ${market} portfolio on FUNDAMENTAL QUALITY. Use ONLY the data below (real, live).
The data covers cap-bucket allocation, sector allocation, weighted beta & PE per bucket, and per-stock: revenue growth YoY/QoQ, earnings growth YoY, forward earnings growth, CFO/PAT ratio, profit margin, ROE, beta, trailing/forward PE.
STRICT RULES: Research and risk-education ONLY. NEVER give buy/sell/hold advice or price targets. For positioning, use research-framed language ("worth reviewing", "consider whether concentration fits your risk", "at index level this area looks extended — research profit-booking discipline"). Only name tickers present in the data. Currency "${cur}".
Also classify each notable holding's "story" from the numbers: High-growth (fast rev+earnings growth, high PE), Compounder (steady growth, strong CFO/PAT, healthy ROE), Turnaround (was/near unprofitable improving), Value/Cyclical, or Slowing — say which and why in one short phrase.

CAP MIX: large ${overall.capMix.large}%, mid ${overall.capMix.mid}%, small ${overall.capMix.small}%. Weighted portfolio beta ${overall.beta ?? "n/a"}, trailing PE ${overall.trailingPE ?? "n/a"}, forward PE ${overall.forwardPE ?? "n/a"}.
PER-STOCK FUNDAMENTALS: ${JSON.stringify(compact)}
HIGH SAME-SECTOR CORRELATIONS: ${JSON.stringify(correlations)}

Return STRICT JSON:
{
  "summary": "3-4 sentence fundamental-quality overview of the portfolio with real numbers",
  "qualityGrade": "A|B|C|D",
  "stories": [ { "symbol": "TICKER", "story": "High-growth|Compounder|Turnaround|Value/Cyclical|Slowing", "why": "one short phrase from the numbers" } ],
  "correlationNote": "one line on the same-sector correlation clusters and the concentration risk they add (or 'No notable clusters')",
  "dos": [ "research-framed portfolio dos (e.g. 'large-cap heavy — anchors stability')" ],
  "donts": [ "research-framed cautions (e.g. 'small-cap slice X% carries higher volatility — size with care')" ],
  "flaggedManual": [ "metrics we cannot compute reliably and you should feed manually" ]
}
IMPORTANT for flaggedManual: always include that normalized earnings (ex-exceptionals / ex-other-income), forward QoQ/YoY revenue estimates, and the working-capital cycle are NOT reliably available from this data and should be fed manually. Keep stories to the most notable 8-12 holdings.`;

    let ai: any = null;
    try {
      const { data, aiTokens } = await runWithUsage(async () => {
        const d = await generateJson<any>(prompt, { tier: "reasoning" });
        const u = currentUsage();
        return { data: d, aiTokens: u?.tokens ?? 0 };
      });
      const held = new Set(symbols.map((s) => s.toUpperCase()));
      if (data?.stories) data.stories = data.stories.filter((s: any) => s?.symbol && held.has(String(s.symbol).toUpperCase()));
      ai = { ...data, aiTokens };
    } catch {
      ai = { error: "AI is busy right now. Please try again in a few seconds." };
    }

    const stocksByValue = [...stocks].sort((a, b) => b.value - a.value);
    return NextResponse.json({ market, currency: cur, overall, buckets, correlations, stocks: stocksByValue, ai });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
