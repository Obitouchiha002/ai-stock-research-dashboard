import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { generateJson, runWithUsage, currentUsage } from "@/lib/aiClient";

const yahooFinance = new YahooFinance();

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Pos = { symbol: string; value: number; weight: number; plPct: number };

// Run an async mapper with limited concurrency (keeps Yahoo happy on big lists).
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const cur = idx++;
        out[cur] = await fn(items[cur], cur);
      }
    }),
  );
  return out;
}

// Market-cap buckets (in the holding's own currency).
function capBucket(marketCap: number | null, market: string): "large" | "mid" | "small" | "micro" | "unknown" {
  if (!marketCap || marketCap <= 0) return "unknown";
  const india = /Indian/i.test(market);
  // INR thresholds (₹cr): large ≥20k cr, mid ≥5k cr, small ≥500 cr, else micro.
  const L = india ? 200e9 : 10e9;
  const M = india ? 50e9 : 2e9;
  const S = india ? 5e9 : 300e6;
  if (marketCap >= L) return "large";
  if (marketCap >= M) return "mid";
  if (marketCap >= S) return "small";
  return "micro";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const market: string = body.market || "";
    const cur: string = body.currency || "$";
    const stats = body.stats || {};
    const positions: Pos[] = Array.isArray(body.positions) ? body.positions : [];
    if (positions.length === 0) return NextResponse.json({ error: "no positions" }, { status: 400 });

    const symbols = positions.map((p) => p.symbol);
    const posBySym: Record<string, Pos> = {};
    positions.forEach((p) => { posBySym[p.symbol] = p; });

    // 1) Batch quote for marketCap / PE / EPS / 52w change (cheap, all holdings).
    const fund: Record<string, any> = {};
    try {
      const quotes = await yahooFinance.quote(symbols).catch(() => []);
      (Array.isArray(quotes) ? quotes : [quotes]).forEach((q: any) => {
        if (q?.symbol) fund[q.symbol] = q;
      });
    } catch { /* ignore */ }

    // 2) quoteSummary for beta + sector on the largest positions (concurrency-limited).
    const ranked = [...positions].sort((a, b) => b.weight - a.weight);
    const detailTargets = ranked.slice(0, 45);
    const detail: Record<string, { beta: number | null; sector: string | null }> = {};
    await mapLimit(detailTargets, 8, async (p) => {
      try {
        const qs: any = await yahooFinance.quoteSummary(p.symbol, { modules: ["summaryDetail", "assetProfile", "defaultKeyStatistics"] });
        detail[p.symbol] = {
          beta: qs?.summaryDetail?.beta ?? qs?.defaultKeyStatistics?.beta ?? null,
          sector: qs?.assetProfile?.sector ?? null,
        };
      } catch {
        detail[p.symbol] = { beta: null, sector: null };
      }
    });

    // 3) Weighted aggregates.
    let betaW = 0, betaWsum = 0;
    let peW = 0, peWsum = 0, fpeW = 0, fpeWsum = 0;
    let rsW = 0, rsWsum = 0;
    const sectorVal: Record<string, number> = {};
    const capVal: Record<string, number> = { large: 0, mid: 0, small: 0, micro: 0, unknown: 0 };
    let unprofitable = 0, profitable = 0;
    const perPos: any[] = [];

    positions.forEach((p) => {
      const q = fund[p.symbol] || {};
      const d = detail[p.symbol] || { beta: null, sector: null };
      const w = p.value;
      const beta = typeof d.beta === "number" ? d.beta : null;
      const tpe = typeof q.trailingPE === "number" && q.trailingPE > 0 ? q.trailingPE : null;
      const fpe = typeof q.forwardPE === "number" && q.forwardPE > 0 ? q.forwardPE : null;
      const rsRaw = typeof q.fiftyTwoWeekChangePercent === "number" ? q.fiftyTwoWeekChangePercent : null;
      // Yahoo returns this as a percent for some symbols and a fraction for
      // others — normalize to a percent so portfolio vs benchmark are comparable.
      const rs = rsRaw == null ? null : Math.abs(rsRaw) < 2 ? rsRaw * 100 : rsRaw;
      const eps = typeof q.epsTrailingTwelveMonths === "number" ? q.epsTrailingTwelveMonths : null;
      const mc = typeof q.marketCap === "number" ? q.marketCap : null;
      if (beta != null) { betaW += w * beta; betaWsum += w; }
      if (tpe != null) { peW += w * tpe; peWsum += w; }
      if (fpe != null) { fpeW += w * fpe; fpeWsum += w; }
      if (rs != null) { rsW += w * rs; rsWsum += w; }
      if (eps != null) { if (eps < 0) unprofitable++; else profitable++; }
      const sec = d.sector || "Unknown";
      sectorVal[sec] = (sectorVal[sec] || 0) + w;
      capVal[capBucket(mc, market)] += w;
      perPos.push({ symbol: p.symbol, weight: p.weight, plPct: p.plPct, beta, trailingPE: tpe, forwardPE: fpe, rs52w: rs == null ? null : Math.round(rs * 10) / 10, eps, sector: sec });
    });

    const totalW = positions.reduce((s, p) => s + p.value, 0) || 1;
    const pct = (v: number) => Math.round((v / totalW) * 1000) / 10;
    const sectorAlloc = Object.entries(sectorVal).map(([sector, v]) => ({ sector, pct: pct(v) })).sort((a, b) => b.pct - a.pct);
    const capAlloc = { large: pct(capVal.large), mid: pct(capVal.mid), small: pct(capVal.small), micro: pct(capVal.micro), unknown: pct(capVal.unknown) };

    // Benchmark relative strength.
    let benchRs: number | null = null;
    const benchSym = /Indian/i.test(market) ? "^NSEI" : "^GSPC";
    try {
      const bq: any = await yahooFinance.quote(benchSym);
      if (typeof bq?.fiftyTwoWeekChangePercent === "number") {
        const v = bq.fiftyTwoWeekChangePercent;
        benchRs = Math.round((Math.abs(v) < 2 ? v * 100 : v) * 10) / 10;
      }
    } catch { /* ignore */ }

    const computed = {
      beta: betaWsum ? Math.round((betaW / betaWsum) * 100) / 100 : null,
      betaCoverage: Math.round((betaWsum / totalW) * 100),
      trailingPE: peWsum ? Math.round((peW / peWsum) * 10) / 10 : null,
      forwardPE: fpeWsum ? Math.round((fpeW / fpeWsum) * 10) / 10 : null,
      relStrength: rsWsum ? Math.round((rsW / rsWsum) * 10) / 10 : null,
      benchRelStrength: benchRs,
      benchName: benchSym,
      sectorAlloc,
      topSector: sectorAlloc[0] || null,
      capAlloc,
      profitable,
      unprofitable,
      numHoldings: positions.length,
    };

    // Fundamentals for the largest positions, so the LLM can name components.
    const topFund = ranked.slice(0, 15).map((p) => perPos.find((x) => x.symbol === p.symbol)).filter(Boolean);

    const prompt = `You are a seasoned, institutional-grade portfolio analyst doing a broad, detailed review of a client's ${market} portfolio. Use ONLY the data below (it is real, computed live).
Cover the major portfolio-analysis dimensions like a professional: overall beta (risk vs market), valuation (weighted trailing & forward PE), sector concentration, market-cap allocation (large/mid/small/micro), number of holdings (too many / too few / right), relative strength vs the benchmark, earnings health (how many holdings are unprofitable), which components are dragging vs leading, concentration & P/L health, and any relevant macro headwinds.

STRICT RULES: Research and risk-education ONLY. NEVER give buy/sell/hold advice, price targets, or predictions. For positioning, frame everything as RESEARCH candidates and reviews — e.g. "worth researching for a potential add given strong relative strength and reasonable valuation", "consider reviewing whether to trim, as it is X% weight and down Y%", "you could research profit-booking discipline on winners up Z%". Never say "buy"/"sell"/"exit". Be specific: cite the real numbers and tickers. Currency is "${cur}".

COMPUTED PORTFOLIO METRICS: ${JSON.stringify(computed)}
P/L & CONCENTRATION DIAGNOSTICS: ${JSON.stringify(stats)}
LARGEST POSITIONS (fundamentals): ${JSON.stringify(topFund)}

Return STRICT JSON with this exact shape:
{
  "grade": "A|B|C|D",
  "gradeLabel": "3-6 word verdict on overall portfolio health",
  "summary": "3-4 sentence broad overview citing beta, valuation, allocation and P/L with real numbers",
  "reads": {
    "beta": "one line interpreting the ${computed.beta ?? "n/a"} portfolio beta (aggressive/defensive vs market)",
    "valuation": "one line on the weighted trailing PE ${computed.trailingPE ?? "n/a"} vs forward PE ${computed.forwardPE ?? "n/a"}",
    "capMix": "one line on the large/mid/small/micro split and what risk it implies",
    "relStrength": "one line comparing portfolio ${computed.relStrength ?? "n/a"}% vs benchmark ${computed.benchRelStrength ?? "n/a"}% 52-week",
    "holdingsCount": "one line on whether ${computed.numHoldings} holdings is too many/few and why",
    "earnings": "one line on earnings health given ${computed.unprofitable} unprofitable of ${computed.numHoldings}"
  },
  "issues": [ { "title": "short", "detail": "specific with numbers/tickers", "severity": "high|medium|low" } ],
  "leadingSectors": ["sectors/areas doing well"],
  "laggingSectors": ["sectors/areas dragging"],
  "researchToAdd": [ { "symbol": "TICKER", "why": "research-framed rationale for a potential add" } ],
  "researchToTrim": [ { "symbol": "TICKER", "why": "research-framed rationale to review trimming/profit-booking" } ],
  "macroHeadwinds": ["2-4 relevant macro/market headwinds to keep in mind"],
  "actions": [ { "title": "short", "detail": "research-framed next step, never buy/sell" } ],
  "strengths": ["1-3 genuine positives"]
}
2-5 issues (most serious first), 3-6 actions. Only include researchToAdd / researchToTrim entries that the data genuinely supports; empty arrays are fine.`;

    try {
      const { data, aiTokens } = await runWithUsage(async () => {
        const d = await generateJson<any>(prompt, { tier: "reasoning" });
        const u = currentUsage();
        return { data: d, aiTokens: u?.tokens ?? 0 };
      });
      return NextResponse.json({ computed, ai: { ...data, aiTokens } });
    } catch {
      return NextResponse.json({ computed, ai: { error: "AI is busy right now. Please try again in a few seconds." } });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
