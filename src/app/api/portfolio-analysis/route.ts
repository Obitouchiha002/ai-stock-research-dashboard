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

type Settings = { rsiOverbought: number; rsiOversold: number; adxTrend: number; style: string; risk: string; horizon: string; focus: string };
const DEFAULTS: Settings = { rsiOverbought: 70, rsiOversold: 30, adxTrend: 25, style: "Long-term investor", risk: "Balanced", horizon: "Long (years)", focus: "" };

// Run an async mapper with limited concurrency (keeps Yahoo happy on ~74 symbols).
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

async function techFor(symbol: string, s: Settings, timeframe: "1d" | "1h"): Promise<TechSnapshot | null> {
  // Hourly needs a wider window so SMA200 (200 hourly bars) can warm up.
  const days = timeframe === "1h" ? 180 : 400;
  const interval = timeframe === "1h" ? "1h" : "1d";
  const period1 = subDays(new Date(), days).toISOString().split("T")[0];
  // Retry once — most "data unavailable" cases are transient Yahoo hiccups.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const chartRes = await yahooFinance.chart(symbol, { period1, interval: interval as any }).catch(() => null);
      const quotes = (chartRes as any)?.quotes || [];
      const rows = quotes.filter((q: any) => q && q.close != null && q.high != null && q.low != null);
      if (rows.length >= 30) {
        return buildSnapshot(
          rows.map((r: any) => ({ open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume })),
          { rsiOverbought: s.rsiOverbought, rsiOversold: s.rsiOversold, adxTrend: s.adxTrend },
        );
      }
    } catch { /* retry */ }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const holdings: InHolding[] = Array.isArray(body.holdings) ? body.holdings.slice(0, 120) : [];
    const market: string = body.market || "";
    const withAi: boolean = !!body.withAi;
    const timeframe: "1d" | "1h" = body.timeframe === "1h" ? "1h" : "1d";
    const settings: Settings = { ...DEFAULTS, ...(body.settings || {}) };
    if (holdings.length === 0) return NextResponse.json({ error: "no holdings" }, { status: 400 });

    // 1) Technical snapshot per holding (concurrency-limited), user's thresholds + timeframe.
    const enriched = await mapLimit(holdings, 10, async (h) => {
        const tech = await techFor(h.symbol, settings, timeframe);
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
      });

    // 2) Portfolio-level roll-up.
    const totalVal = enriched.reduce((s, r) => s + (r.value || 0), 0) || 1;
    const withTech = enriched.filter((r) => r.tech?.ok);
    const trendCounts = { Uptrend: 0, Downtrend: 0, Sideways: 0 } as Record<string, number>;
    let overbought = 0, oversold = 0, belowSma200 = 0, weakTrend = 0, perfectUp = 0, perfectDown = 0;
    withTech.forEach((r) => {
      const t = r.tech!;
      if (t.trend in trendCounts) trendCounts[t.trend]++;
      if (t.rsi != null && t.rsi >= settings.rsiOverbought) overbought++;
      if (t.rsi != null && t.rsi <= settings.rsiOversold) oversold++;
      if (t.vsSma200Pct != null && t.vsSma200Pct < 0) belowSma200++;
      if (t.adx != null && t.adx < 20) weakTrend++;
      if (t.maStack?.label === "Perfect uptrend") perfectUp++;
      if (t.maStack?.label === "Perfect downtrend") perfectDown++;
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
      perfectUp,
      perfectDown,
      timeframe,
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
        maStack: r.tech?.maStack?.label ?? null,
        diUp: r.tech?.diUp ?? null,
        rsiTrend: r.tech?.rsiTrend ?? null,
        divergence: r.tech?.divergence ?? null,
        volVs5Pct: r.tech?.volVs5Pct ?? null,
        volRising: r.tech?.volRising ?? null,
        near52w: r.tech?.near52w ?? null,
        overall: r.tech?.overall?.label ?? null,
        signals: (r.tech?.signals || []).map((s) => s.label),
        candlePatterns: (r.tech?.patterns || []).map((p) => p.name),
      }));
      const tfLabel = timeframe === "1h" ? "HOURLY (intraday)" : "DAILY";
      const prompt = `You are a highly experienced, professional equity research analyst reviewing a client's ${market || ""} stock portfolio on the ${tfLabel} timeframe. You have deep experience reading technical conditions and market context. All the technical readings below are computed on the ${tfLabel} timeframe — frame your read accordingly (hourly = short-term/intraday swings; daily = the primary trend). Each holding carries: "rsiTrend" (rising/falling/stagnant) and "divergence"; "diUp" (+DI>-DI); "maStack" (moving-average alignment: Perfect uptrend / Below 50-DMA / Perfect downtrend / etc.); "volVs5Pct" + "volRising" (volume vs 5-day average); "near52w" (near 52-week high/low); and "overall" (a weighted verdict). Weave RSI direction, volume momentum, MA alignment, candlesticks and the overall read into your per-holding notes. When a holding is near its 52-week high/low or shows divergence, call it out as an important note (e.g. daily strength but an overhead higher-timeframe resistance).

THIS CLIENT'S PROFILE — tailor EVERY point to it, do not give generic advice:
- Investing style: ${settings.style}
- Risk tolerance: ${settings.risk}
- Time horizon: ${settings.horizon}
- Their custom RSI thresholds: overbought ≥ ${settings.rsiOverbought}, oversold ≤ ${settings.rsiOversold}; trend confirmed when ADX ≥ ${settings.adxTrend}. Interpret every RSI/ADX value against THESE thresholds, not the textbook 70/30/25.
${settings.focus ? `- What they specifically want you to focus on: "${settings.focus}" — address this directly.` : ""}
Frame health, risk and what-to-monitor through the lens of a ${settings.risk.toLowerCase()} ${settings.style.toLowerCase()} with a ${settings.horizon.toLowerCase()} horizon. For example, a long-term investor cares less about a single overbought reading than a swing trader would.

STRICT RULES:
- Research and risk-education support ONLY. NEVER give buy/sell/hold recommendations, price targets, or predictions.
- Use measured research language ("appears extended", "trend has weakened", "worth monitoring") — never directive language ("you should sell/buy").
- Base every statement ONLY on the technical data provided plus general, well-known market context. Do not invent numbers.
- Be specific and useful, like a seasoned analyst briefing THIS client.

PORTFOLIO SUMMARY: total holdings ${totals.holdingsCount}, largest position ${totals.topPosition?.symbol || "-"} at ${concentrationPct}% weight, uptrend ${trendCounts.Uptrend} / downtrend ${trendCounts.Downtrend} / sideways ${trendCounts.Sideways}, ${overbought} overbought (≥${settings.rsiOverbought}), ${oversold} oversold (≤${settings.rsiOversold}), ${belowSma200} below 200-DMA.
HOLDINGS (technical): ${JSON.stringify(compact)}

Some holdings include "candlePatterns" (recent candlestick formations like Bullish Engulfing, Shooting Star, Hammer, Doji, Morning/Evening Star). When present, factor them in: say what the pattern typically indicates and, in the "action" field, give a research-framed next step to consider (e.g. "watch for a confirming higher close before reading a reversal", "monitor whether follow-through appears"). NEVER phrase the action as buy/sell/hold — always as what to watch or research.

Return STRICT JSON with this shape:
{
  "overview": "2-3 sentence professional read of the whole portfolio's technical health",
  "marketContext": "2-3 sentences on the current broad market backdrop relevant to these holdings (rates, sentiment, sector rotation) at a general level",
  "portfolioRisk": { "level": "Low|Moderate|Elevated|High", "concentration": "one line on concentration/diversification risk", "summary": "one line overall risk read" },
  "holdings": [ { "symbol": "TICKER", "health": "Healthy|Watch|Weak", "note": "one specific sentence on this stock's technical condition, mentioning any candlestick pattern present", "risk": "the main risk to monitor for this stock", "action": "a research-framed next step to consider (what to watch/confirm) — NEVER buy/sell/hold" } ],
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
