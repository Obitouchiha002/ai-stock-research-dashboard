import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reports which AI provider keys are configured.
 *
 * Reads process.env only. On hosted platforms there is no .env.local on disk —
 * keys arrive as environment variables — so inspecting the filesystem would
 * always report "not found".
 */
function describe(name: string) {
  const raw = process.env[name];
  const value = (raw ?? "").trim();
  return {
    configured: value.length > 0,
    keyLength: value.length,
    // A leading space after "=" in .env.local is the most common misconfiguration.
    hasWhitespaceIssue: !!raw && raw !== raw.trim(),
  };
}

export async function GET() {
  try {
    const providers = {
      gemini: describe("GEMINI_API_KEY"),
      groq: describe("GROQ_API_KEY"),
      openai: describe("OPENAI_API_KEY"),
      perplexity: describe("PERPLEXITY_API_KEY"),
    };
    const configuredCount = Object.values(providers).filter((p) => p.configured).length;

    return NextResponse.json({
      source: "environment",
      providers,
      configuredCount,
      aiEnabled: configuredCount > 0,
      // Back-compat with the previous response shape.
      found: configuredCount > 0,
      hasKeyLine: providers.gemini.configured,
      hasValue: providers.gemini.configured,
      valueLength: providers.gemini.keyLength,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
