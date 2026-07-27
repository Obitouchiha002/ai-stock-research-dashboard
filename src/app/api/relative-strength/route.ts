import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { subDays } from "date-fns";

const yahooFinance = new YahooFinance();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * Relative Strength — the stock against its home benchmark, and optionally
 * against peer stocks the user wants to compare it with.
 *
 * Two readings come out of the same aligned data:
 *   1. Rebased price shape — every leg set to 100 on day one, so the CURVES are
 *      directly comparable no matter what each one actually costs.
 *   2. RS ratio — stock / other, rebased to 100. Rising = the stock is winning
 *      that pair; falling = it is losing. This holds even when both are falling.
 *
 * Research support only. Relative performance is a description of what already
 * happened — it is not advice and does not predict which will lead next.
 */
const BENCHMARKS: Record<string, { symbol: string; label: string }> = {
  IN: { symbol: "^CRSLDX", label: "Nifty 500" },
  US: { symbol: "^GSPC", label: "S&P 500" },
};

const RANGE_DAYS: Record<string, number> = {
  "1mo": 31, "3mo": 93, "6mo": 186, "1y": 372, "2y": 744, "5y": 1830,
};

/** Trailing windows reported per leg, in trading days (~21 per month). */
const WINDOWS: { key: string; bars: number }[] = [
  { key: "1M", bars: 21 },
  { key: "3M", bars: 63 },
  { key: "6M", bars: 126 },
  { key: "1Y", bars: 252 },
];

const MAX_PEERS = 4;

function toKey(d: any): string {
  const dt: Date = d instanceof Date ? d : new Date(d);
  return dt.toISOString().split("T")[0];
}

async function closesFor(symbol: string, period1: string): Promise<Map<string, number> | null> {
  const res: any = await yahooFinance.chart(symbol, { period1, interval: "1d" }).catch(() => null);
  const rows = (res?.quotes || []).filter((q: any) => q && q.close != null && Number(q.close) > 0);
  if (rows.length < 5) return null;
  const m = new Map<string, number>();
  for (const r of rows) m.set(toKey(r.date), Number(r.close));
  return m;
}

/** % change over the last `bars` sessions, or null when history is too short. */
function windowReturn(vals: number[], bars: number): number | null {
  if (vals.length <= bars) return null;
  const a = vals[vals.length - 1 - bars];
  const b = vals[vals.length - 1];
  if (!(a > 0)) return null;
  return ((b - a) / a) * 100;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol || "").trim().toUpperCase();
    const range = String(body.range || "1y");
    if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

    const rawPeers: string[] = (Array.isArray(body.peers) ? body.peers : [])
      .map((p: any) => String(p || "").trim().toUpperCase())
      .filter((p: string) => !!p && p !== symbol);
    const peers: string[] = Array.from(new Set<string>(rawPeers)).slice(0, MAX_PEERS);

    const isIndia = /\.(NS|BO)$/i.test(symbol);
    const bench = isIndia ? BENCHMARKS.IN : BENCHMARKS.US;
    const days = RANGE_DAYS[range] || 372;
    const period1 = subDays(new Date(), days).toISOString().split("T")[0];

    const wanted = [symbol, bench.symbol, ...peers];
    const maps = await Promise.all(wanted.map((s) => closesFor(s, period1)));

    const stockMap = maps[0];
    const benchMap = maps[1];
    if (!stockMap) return NextResponse.json({ error: `No price history for ${symbol}.` }, { status: 404 });
    if (!benchMap) return NextResponse.json({ error: `No price history for the benchmark ${bench.symbol}.` }, { status: 404 });

    // Peers that failed to load are reported rather than silently dropped.
    const okPeers: string[] = [];
    const failedPeers: string[] = [];
    peers.forEach((p, i) => (maps[i + 2] ? okPeers.push(p) : failedPeers.push(p)));

    // Align on sessions every leg actually traded — different exchanges keep
    // different holidays, and an unaligned ratio is a fake ratio.
    const legMaps: Record<string, Map<string, number>> = { [symbol]: stockMap, [bench.symbol]: benchMap };
    okPeers.forEach((p) => (legMaps[p] = maps[wanted.indexOf(p)]!));

    const dates = [...stockMap.keys()]
      .filter((d) => Object.values(legMaps).every((m) => (m.get(d) ?? 0) > 0))
      .sort();
    if (dates.length < 5) {
      return NextResponse.json(
        { error: "The selected symbols share too few trading days to compare." },
        { status: 404 },
      );
    }

    const legSymbols = [symbol, bench.symbol, ...okPeers];
    const raw: Record<string, number[]> = {};
    for (const s of legSymbols) raw[s] = dates.map((d) => legMaps[s].get(d)!);

    // Rebase every leg to 100 on the first shared session.
    const series = dates.map((date, i) => {
      const row: any = { date };
      for (const s of legSymbols) row[s] = (raw[s][i] / raw[s][0]) * 100;
      // RS vs the benchmark (kept as `rs` for the existing chart panel).
      row.rs = (raw[symbol][i] / raw[bench.symbol][i]) / (raw[symbol][0] / raw[bench.symbol][0]) * 100;
      row.stockIdx = row[symbol];
      row.benchIdx = row[bench.symbol];
      // RS vs each peer — above 100 means the stock has beaten that peer so far.
      for (const p of okPeers) {
        row[`rs_${p}`] = (raw[symbol][i] / raw[p][i]) / (raw[symbol][0] / raw[p][0]) * 100;
      }
      return row;
    });

    // Daily ratios are noisy; a short moving average makes the direction of the
    // line readable without changing where it starts or ends.
    const SMOOTH = Math.max(3, Math.min(11, Math.round(dates.length / 40) * 2 + 1));
    const smoothKey = (k: string) => {
      const vals = series.map((r: any) => r[k] as number);
      const half = Math.floor(SMOOTH / 2);
      return vals.map((_, i) => {
        const from = Math.max(0, i - half);
        const to = Math.min(vals.length - 1, i + half);
        let sum = 0;
        for (let j = from; j <= to; j++) sum += vals[j];
        return sum / (to - from + 1);
      });
    };
    const rsSmooth = smoothKey("rs");
    const peerSmooth: Record<string, number[]> = {};
    for (const p of okPeers) peerSmooth[p] = smoothKey(`rs_${p}`);
    series.forEach((row: any, i: number) => {
      row.rsSmooth = rsSmooth[i];
      for (const p of okPeers) row[`rsSmooth_${p}`] = peerSmooth[p][i];
    });

    const last = series[series.length - 1];

    const legs = legSymbols.map((s) => {
      const w: Record<string, number | null> = {};
      for (const { key, bars } of WINDOWS) w[key] = windowReturn(raw[s], bars);
      return {
        symbol: s,
        label: s === bench.symbol ? bench.label : s,
        kind: s === symbol ? "stock" : s === bench.symbol ? "benchmark" : "peer",
        changePct: last[s] - 100,
        windows: w,
        // Beat/lost vs the main stock over the window (0 for the stock itself).
        vsStockPct: last[s] - last[symbol],
      };
    });

    // Ranking over the full window — a description of what happened, not a pick.
    const ranked = [...legs]
      .sort((a, b) => b.changePct - a.changePct)
      .map((l, i) => ({ symbol: l.symbol, label: l.label, kind: l.kind, changePct: l.changePct, rank: i + 1 }));

    const rsChg = last.rs - 100;
    const stockRank = ranked.find((r) => r.symbol === symbol)?.rank ?? 1;

    const pairwise = okPeers.map((p) => {
      const v = last[`rs_${p}`] - 100;
      return {
        peer: p,
        rsNow: last[`rs_${p}`],
        leadPct: v,
        leader: v > 1 ? symbol : v < -1 ? p : "Level",
      };
    });

    return NextResponse.json({
      symbol,
      benchmark: bench.symbol,
      benchmarkLabel: bench.label,
      range,
      peers: okPeers,
      failedPeers,
      legs,
      ranked,
      pairwise,
      series,
      sessions: dates.length,
      smoothWindow: SMOOTH,
      summary: {
        stockChangePct: last.stockIdx - 100,
        benchChangePct: last.benchIdx - 100,
        outperformancePct: rsChg,
        verdict: rsChg > 1 ? "Outperforming" : rsChg < -1 ? "Underperforming" : "In line with",
        rankOfStock: stockRank,
        totalLegs: ranked.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
