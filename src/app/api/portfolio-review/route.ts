import { NextRequest, NextResponse } from "next/server";
import { generateJson, runWithUsage, currentUsage } from "@/lib/aiClient";

// Vercel: AI SDKs need the Node runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Candid portfolio HEALTH CHECK — turns pre-computed diagnostic stats into a
// clear read of the mistakes/weaknesses + constructive, research-framed actions.
// Research/education only: never buy/sell/hold advice.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const market: string = body.market || "";
    const cur: string = body.currency || "$";
    const stats = body.stats;
    if (!stats) return NextResponse.json({ error: "no stats" }, { status: 400 });

    const prompt = `You are a seasoned portfolio analyst doing a candid HEALTH CHECK on a client's ${market} portfolio. Use ONLY the data below.
GOAL: Clearly point out the concrete MISTAKES and weaknesses in how this portfolio is built and managed, and give constructive, research-framed things the client can DO about them.
STYLE: Be direct and specific — cite real numbers and tickers in every point. No vague generalities. Do NOT mention sectors (not provided). Currency symbol is "${cur}".
STRICT RULES: Research and risk-education ONLY. NEVER say buy / sell / hold, never give price targets or predictions. Frame every action as review / monitor / research / "consider whether this matches your risk tolerance" — e.g. "review whether your original thesis still holds for XYZ", "your top 5 are ${stats.concentrationTop5}% of value — consider if that concentration fits your risk tolerance". Never tell them to exit or add a position.

Return STRICT JSON with this exact shape:
{
  "grade": "A|B|C|D",
  "gradeLabel": "3-5 word verdict on overall portfolio health",
  "summary": "2-3 sentence candid overview citing the real ${cur} P/L, % return and profit/loss split",
  "issues": [ { "title": "short issue name", "detail": "specific problem with numbers/tickers", "severity": "high|medium|low" } ],
  "strengths": [ "1-3 short genuine positives, if any" ],
  "actions": [ { "title": "short action", "detail": "a concrete research-framed next step — NEVER buy/sell" } ]
}
Rules for content: 2-5 issues (the real problems, most serious first), 3-5 actions. If concentration, a long tail of losers, deep drawdowns in large positions, or over-fragmentation exist in the data, call them out explicitly.
DATA: ${JSON.stringify(stats)}`;

    try {
      const { data, aiTokens } = await runWithUsage(async () => {
        const d = await generateJson<any>(prompt, { tier: "reasoning" });
        const u = currentUsage();
        return { data: d, aiTokens: u?.tokens ?? 0 };
      });
      return NextResponse.json({ ...data, aiTokens });
    } catch {
      return NextResponse.json({ error: "AI is busy right now. Please try again in a few seconds." }, { status: 503 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
