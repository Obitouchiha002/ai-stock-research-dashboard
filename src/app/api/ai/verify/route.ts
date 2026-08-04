import { NextRequest, NextResponse } from "next/server";
import { configuredProviders, generateWithProvider, PROVIDER_LABEL, type NamedProvider } from "@/lib/aiClient";

// Cross-verify: run an AI answer past OTHER independent models and report whether
// each agrees. Providers are queried in parallel so it stays fast.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

function parseVerdict(txt: string): { verdict: string; notes: string } {
  const m = String(txt || "").match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]);
      return { verdict: String(o.verdict || "").trim() || "Unclear", notes: String(o.notes || "").trim() };
    } catch {
      /* fall through */
    }
  }
  const low = String(txt || "").toLowerCase();
  const verdict = low.includes("disput") ? "Disputed" : low.includes("partly") ? "Partly correct" : low.includes("confirm") ? "Confirmed" : "Unclear";
  return { verdict, notes: String(txt || "").slice(0, 160) };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = String(body.question || "").slice(0, 4000);
    const answer = String(body.answer || "").slice(0, 8000);
    const context = String(body.context || "").slice(0, 12000);
    if (!answer) return NextResponse.json({ error: "Nothing to verify." }, { status: 400 });

    // Independent checkers — skip Perplexity (search, not a judge). Up to 3.
    const providers = configuredProviders().filter((p) => p !== "perplexity").slice(0, 3);
    if (!providers.length) return NextResponse.json({ error: "No AI provider is configured." }, { status: 400 });

    const prompt = `You are an INDEPENDENT fact-checker. A user asked a question and an AI gave an answer. Judge whether the answer is accurate, supported, and free of made-up facts. ${context ? "Use the CONTEXT as the source of truth." : "Use widely-accepted knowledge."} Do NOT give investment advice.
Reply ONLY with compact JSON: {"verdict":"Confirmed" | "Partly correct" | "Disputed","notes":"one short sentence naming any error, unsupported claim, or caveat (empty if none)"}

QUESTION: ${question}

ANSWER TO CHECK: ${answer}

CONTEXT: ${context || "(none provided)"}`;

    const checks = (
      await Promise.all(
        providers.map(async (p: NamedProvider) => {
          try {
            const t = await generateWithProvider(p, prompt, { json: true });
            const v = parseVerdict(t);
            return { provider: PROVIDER_LABEL[p] || p, ...v };
          } catch {
            return null;
          }
        }),
      )
    ).filter(Boolean);

    if (!checks.length) return NextResponse.json({ error: "Verification models were unavailable. Try again." }, { status: 502 });

    // Overall = worst verdict wins (disputed > partly > confirmed).
    const order = ["Disputed", "Partly correct", "Unclear", "Confirmed"];
    const overall = checks
      .map((c: any) => c.verdict)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] || "Unclear";

    return NextResponse.json({ overall, checks, providersUsed: checks.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
