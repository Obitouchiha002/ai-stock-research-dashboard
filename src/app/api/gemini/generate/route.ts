import { NextRequest, NextResponse } from "next/server";
import { generateText, AiDisabledError, runWithUsage, currentUsage } from "@/lib/aiClient";

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
// force-dynamic prevents build-time prerendering of this handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body.prompt || body.input || "";
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    try {
      // Gemini primary, Groq fallback, with retries.
      const { text, aiTokens } = await runWithUsage(async () => {
        const t = await generateText(prompt);
        const u = currentUsage();
        return { text: t, aiTokens: u?.tokens ?? 0, usage: u };
      });
      return NextResponse.json({ text, aiTokens });
    } catch (e: any) {
      if (e instanceof AiDisabledError) {
        const fallback = `Fallback AI: I received your prompt. Here's a short note: ${prompt.substring(0, 400)}`;
        return NextResponse.json({ text: fallback });
      }
      return NextResponse.json(
        { error: "AI is busy (model overloaded). Please try again in a few seconds." },
        { status: 503 },
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
