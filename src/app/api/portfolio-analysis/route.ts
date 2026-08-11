import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { subDays } from "date-fns";
import { buildSnapshot, type TechSnapshot } from "@/lib/technicalSnapshot";
import { generateJson, runWithUsage, currentUsage } from "@/lib/aiClient";

const yahooFinance = new YahooFinance();

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type InHolding = { symbol: string; name?: string; shares?: number; buyPrice?: number; currentPrice?: number; market?: string };

async function techFor(symbol: string): Promise<TechSnapshot | null> {
  try {
    const period1 = subDays(new Date(), 400).toISOString().split("T")[0];
    const chartRes = await yahooFinance.chart(symbol, { period1, interval: "1d" }).catch(() => null);
    const quotes = (chartRes as any)?.quotes || [];
    const rows = quotes.filter((q: any) => q && q.close != null && q.high != null && q.low != null);
    if (rows.length < 30) return null;
    return buildSnapshot(rows.map((r: any) => ({ high: r.high, low: r.low, close: r.close })));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const holdings: InHolding[] = Array.isArray(body.holdings) ? body.holdings.slice(0, 20) : [];
    const market: string = body.market || "";
    const withAi: boolean = !!body.withAi;
    if (holdings.length === 0) return NextResponse.json({ error: "no holdings" }, { status: 400 });

    // 1) Technical snapshot per holding (parallel).
    const enriched = await Promise.all(
      holdings.map(async (h) => {
        const tech = await techFor(h.symbol);
        const price = h.currentPrice || tech?.price || h.buyPrice || 0;
        const shares = h.shares || 0;
        const value = shares * price;
        const cost = shares * (h.buyPrice || price);
        const pl = value - cost;
        const plPct = cost > 0 ? (pl / cost) * 100 : 0;
        return {
          symbol: h.symbol,
          name: h.name || h.symbol,
          shares,
          value: Math.round(value * 100) / 100,
          plPct: Math.round(plPct * 10) / 10,
          tech: tech || null,
        };
      }),
    );

    // 2) Portfolio-level roll-up.
    const totalVal = enriched.reduce((s, r) => s + (r.value || 0), 0) || 1;
    const withTech = enriched.filter((r) => r.tech?.ok);
    const trendCounts = { Uptrend: 0, Downtrend: 0, Sideways: 0 } as Record<string, number>;
    let overbought = 0, oversold = 0, belowSma200 = 0, weakTrend = 0;
    withTech.forEach((r) => {
      const t = r.tech!;
      if (t.trend in trendCounts) trendCounts[t.trend]++;
      if (t.rsi != null && t.rsi >= 70) overbought++;
      if (t.rsi != null && t.rsi <= 30) oversold++;
      if (t.vsSma200Pct != null && t.vsSma200Pct < 0) belowSma200++;
      if (t.adx != null && t.adx < 20) weakTrend++;
    });
    const topConc = [...enriched].sort((a, b) => b.value - a.value)[0];
    const concentrationPct = topConc ? Math.round((topConc.value / totalVal) * 100) : 0;

    const totals = {
      totalValue: Math.round(totalVal),
      holdingsCount: enriched.length,
      trendCounts,
      overbought,
      oversold,
      belowSma200,
      weakTrend,
      topPosition: topConc ? { symbol: topConc.symbol, pct: concentrationPct } : null,
    };

    let ai: any = null;
    if (withAi) {
      const compact = enriched.map((r) => ({
        symbol: r.symbol,
        weightPct: Math.round((r.value / totalVal) * 100),
        plPct: r.plPct,
        rsi: r.tech?.rsi ?? null,
        adx: r.tech?.adx ?? null,
        trend: r.tech?.trend ?? "—",
        vsSma50Pct: r.tech?.vsSma50Pct ?? null,
        vsSma200Pct: r.tech?.vsSma200Pct ?? null,
        signals: (r.tech?.signals || []).map((s) => s.label),
      }));
      const prompt = `You are a highly experienced, professional equity research analyst reviewing a client's ${market || ""} stock portfolio. You have deep experience reading technical conditions and market context.

STRICT RULES:
- Research and risk-education support ONLY. NEVER give buy/sell/hold recommendations, price targets, or predictions.
- Use measured research language ("appears extended", "trend has weakened", "worth monitoring") — never directive language ("you should sell/buy").
- Base every statement ONLY on the technical data provided plus general, well-known market context. Do not invent numbers.
- Be specific and useful, like a seasoned analyst briefing a client.

PORTFOLIO SUMMARY: total holdings ${totals.holdingsCount}, largest position ${totals.topPosition?.symbol || "-"} at ${concentrationPct}% weight, uptrend ${trendCounts.Uptrend} / downtrend ${trendCounts.Downtrend} / sideways ${trendCounts.Sideways}, ${overbought} overbought, ${oversold} oversold, ${belowSma200} below 200-DMA.
HOLDINGS (technical): ${JSON.stringify(compact)}

Return STRICT JSON with this shape:
{
  "overview": "2-3 sentence professional read of the whole portfolio's technical health",
  "marketContext": "2-3 sentences on the current broad market backdrop relevant to these holdings (rates, sentiment, sector rotation) at a general level",
  "portfolioRisk": { "level": "Low|Moderate|Elevated|High", "concentration": "one line on concentration/diversification risk", "summary": "one line overall risk read" },
  "holdings": [ { "symbol": "TICKER", "health": "Healthy|Watch|Weak", "note": "one specific sentence on this stock's technical condition", "risk": "the main risk to monitor for this stock" } ],
  "alerts": [ { "symbol": "TICKER", "urgency": "High|Medium", "message": "what changed / needs attention now, in research language" } ],
  "whatToMonitor": ["3-5 concrete things to watch next"]
}
Only include holdings that have data. Keep it concise and expert.`;

      try {
        const { data, aiTokens } = await runWithUsage(async () => {
          const d = await generateJson<any>(prompt, { tier: "reasoning" });
          const u = currentUsage();
          return { data: d, aiTokens: u?.tokens ?? 0 };
        });
        ai = { ...data, aiTokens };
      } catch (e: any) {
        ai = { error: "AI is busy right now. Please try again in a few seconds." };
      }
    }

    return NextResponse.json({ market, totals, holdings: enriched, ai });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
