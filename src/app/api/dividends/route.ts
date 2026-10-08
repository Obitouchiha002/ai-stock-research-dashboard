import { NextRequest, NextResponse } from "next/server";
import { appToEodhd, eodhdConfigured, eodhdDividends, eodhdSplits, eodhdRealTime } from "@/lib/eodhd";

// Dividend + split history for a US stock, via EODHD (works on Active Trader;
// full fundamentals/yield are a higher tier, so we compute the yield ourselves
// from the trailing-12-month payout and the live price). NSE/BSE stocks aren't
// in the plan → { supported: false }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const n = (v: any) => (typeof v === "number" ? v : Number(v));

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol || "").trim().toUpperCase();
    if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
    if (!eodhdConfigured()) return NextResponse.json({ supported: false, reason: "no-eodhd" });

    const e = appToEodhd(symbol);
    if (!e || e.kind !== "us") return NextResponse.json({ supported: false, reason: "not-us" });

    const fromDiv = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const fromSplit = new Date(Date.now() - 8 * 365 * 864e5).toISOString().slice(0, 10);
    const [divsRaw, splitsRaw, rt] = await Promise.all([
      eodhdDividends(e.sym, fromDiv).catch(() => []),
      eodhdSplits(e.sym, fromSplit).catch(() => []),
      eodhdRealTime(e.sym).catch(() => null),
    ]);

    const divs = (Array.isArray(divsRaw) ? divsRaw : [])
      .map((d: any) => ({ date: d.date, value: n(d.value), period: d.period || "" }))
      .filter((d: any) => d.date && Number.isFinite(d.value) && d.value > 0)
      .sort((a: any, b: any) => (a.date < b.date ? 1 : -1)); // newest first

    const cutoff = Date.now() - 365 * 864e5;
    const annual = divs.filter((d: any) => new Date(d.date).getTime() > cutoff).reduce((s: number, d: any) => s + d.value, 0);
    const price = rt && rt.close != null && rt.close !== "NA" ? n(rt.close) : null;
    const dividendYield = annual > 0 && price && price > 0 ? Math.round((annual / price) * 10000) / 100 : null;

    const splits = (Array.isArray(splitsRaw) ? splitsRaw : [])
      .map((s: any) => ({ date: s.date, split: s.split }))
      .filter((s: any) => s.date && s.split)
      .sort((a: any, b: any) => (a.date < b.date ? 1 : -1));

    return NextResponse.json({
      supported: true,
      symbol,
      paysDividend: divs.length > 0,
      annual: Math.round(annual * 100) / 100,
      dividendYield, // percent
      price,
      history: divs.slice(0, 8),
      splits: splits.slice(0, 5),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
