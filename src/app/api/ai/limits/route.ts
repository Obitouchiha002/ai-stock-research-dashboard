import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Live API limits. Providers don't expose account $ balance over the API, but
// every response carries REAL rate-limit headers — remaining requests/tokens in
// the current window and when they reset. This makes one tiny probe call per
// configured provider (max_tokens: 1) and reads those headers back.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

const num = (s: string | null) => {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

type Limit = {
  provider: string;
  ok: boolean;
  reqLimit: number | null;
  reqRemaining: number | null;
  reqReset: string | null;
  tokLimit: number | null;
  tokRemaining: number | null;
  tokReset: string | null;
  note?: string;
};

async function openaiLike(provider: string, url: string, key: string, model: string): Promise<Limit> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
    });
    const h = res.headers;
    const reqRemaining = num(h.get("x-ratelimit-remaining-requests"));
    const tokRemaining = num(h.get("x-ratelimit-remaining-tokens"));
    const hasHeaders = reqRemaining != null || tokRemaining != null;
    return {
      provider, ok: hasHeaders,
      reqLimit: num(h.get("x-ratelimit-limit-requests")),
      reqRemaining,
      reqReset: h.get("x-ratelimit-reset-requests"),
      tokLimit: num(h.get("x-ratelimit-limit-tokens")),
      tokRemaining,
      tokReset: h.get("x-ratelimit-reset-tokens"),
      note: hasHeaders ? undefined : (res.ok ? "No rate-limit headers returned." : `Provider responded ${res.status}.`),
    };
  } catch (e: any) {
    return { provider, ok: false, reqLimit: null, reqRemaining: null, reqReset: null, tokLimit: null, tokRemaining: null, tokReset: null, note: e?.message || "unreachable" };
  }
}

async function anthropic(key: string, model: string): Promise<Limit> {
  try {
    // Use the SDK (same path as chat) so model aliases resolve; withResponse()
    // exposes the raw rate-limit headers.
    const client = new Anthropic({ apiKey: key });
    const { response } = await client.messages.create({ model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }).withResponse();
    const h = response.headers;
    const reqRemaining = num(h.get("anthropic-ratelimit-requests-remaining"));
    const tokRemaining = num(h.get("anthropic-ratelimit-tokens-remaining"));
    const hasHeaders = reqRemaining != null || tokRemaining != null;
    return {
      provider: "claude", ok: hasHeaders,
      reqLimit: num(h.get("anthropic-ratelimit-requests-limit")),
      reqRemaining,
      reqReset: h.get("anthropic-ratelimit-requests-reset"),
      tokLimit: num(h.get("anthropic-ratelimit-tokens-limit")),
      tokRemaining,
      tokReset: h.get("anthropic-ratelimit-tokens-reset"),
      note: hasHeaders ? undefined : "No rate-limit headers returned.",
    };
  } catch (e: any) {
    return { provider: "claude", ok: false, reqLimit: null, reqRemaining: null, reqReset: null, tokLimit: null, tokRemaining: null, tokReset: null, note: e?.message || "unreachable" };
  }
}

export async function GET() {
  const jobs: Promise<Limit>[] = [];
  if (process.env.OPENAI_API_KEY)
    jobs.push(openaiLike("openai", "https://api.openai.com/v1/chat/completions", process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || "gpt-4o-mini"));
  if (process.env.GROQ_API_KEY)
    jobs.push(openaiLike("groq", "https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, process.env.GROQ_MODEL || "llama-3.1-8b-instant"));
  if (process.env.ANTHROPIC_API_KEY)
    jobs.push(anthropic(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || "claude-opus-4-8"));
  // Gemini's Generative Language API doesn't return standard rate-limit headers.
  if (process.env.GEMINI_API_KEY)
    jobs.push(Promise.resolve({ provider: "gemini", ok: false, reqLimit: null, reqRemaining: null, reqReset: null, tokLimit: null, tokRemaining: null, tokReset: null, note: "Google doesn't expose live rate limits via API." }));

  const limits = await Promise.all(jobs);
  return NextResponse.json({ limits, checkedAt: new Date().toISOString() });
}
