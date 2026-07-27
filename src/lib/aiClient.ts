import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request token accounting. A route wraps its handler in runWithUsage();
 * every provider call inside records its real token usage into that request's
 * store (isolated across concurrent requests via AsyncLocalStorage). The route
 * then reads currentUsage() and returns it so the client can log real numbers.
 */
type UsageStore = { tokens: number; calls: number; byProvider: Record<string, number> };
const usageALS = new AsyncLocalStorage<UsageStore>();
export function runWithUsage<T>(fn: () => Promise<T>): Promise<T> {
  return usageALS.run({ tokens: 0, calls: 0, byProvider: {} }, fn);
}
export function currentUsage(): UsageStore | null {
  return usageALS.getStore() || null;
}
function recordUsage(provider: string, tokens: number) {
  const s = usageALS.getStore();
  if (!s) return;
  s.calls += 1;
  s.tokens += tokens || 0;
  s.byProvider[provider] = (s.byProvider[provider] || 0) + (tokens || 0);
}

/**
 * Resilient multi-provider AI client with tiered routing.
 *
 * Providers: OpenAI, Gemini, Groq. Each is tried with retry + model fallback;
 * if one provider stays down, the next in the tier order is used.
 *
 * Tiers:
 *  - "reasoning" (logic/analysis-heavy: research notes, evaluation, cross-check,
 *    what-changed)  -> OpenAI first, then Gemini, then Groq.
 *  - "fast" (light: chat, news summaries) -> Groq first, then Gemini, then OpenAI.
 *
 * generateGrounded uses Gemini only (Google Search grounding is Gemini-specific).
 */

export class AiDisabledError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransient(err: unknown): boolean {
  const s = String((err as any)?.message || err || "");
  return (
    s.includes("503") ||
    s.includes("UNAVAILABLE") ||
    s.includes("overloaded") ||
    s.includes("high demand") ||
    s.includes("429") ||
    s.includes("RESOURCE_EXHAUSTED") ||
    s.includes("rate limit") ||
    s.includes("500") ||
    s.includes("INTERNAL") ||
    s.includes("502") ||
    s.includes("Connection error")
  );
}
function isInvalidKey(err: unknown): boolean {
  const s = String((err as any)?.message || err || "");
  return s.includes("API_KEY_INVALID") || s.includes("API key not valid") || s.includes("invalid_api_key") || s.includes("Incorrect API key");
}

function uniq(a: (string | undefined)[]): string[] {
  return a.filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i) as string[];
}

// ---------- Gemini ----------
let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}
function geminiModels(): string[] {
  return uniq([process.env.GEMINI_MODEL, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]);
}
async function geminiText(contents: string, json: boolean): Promise<string> {
  const ai = getGemini();
  if (!ai) throw new Error("GEMINI_DISABLED");
  let lastErr: unknown = new Error("GEMINI_DISABLED");
  for (const model of geminiModels()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents,
          config: json ? { responseMimeType: "application/json" } : undefined,
        });
        if (res.text) {
          recordUsage("gemini", (res as any)?.usageMetadata?.totalTokenCount || 0);
          return res.text;
        }
        lastErr = new Error("Empty Gemini response");
      } catch (e) {
        lastErr = e;
        if (isInvalidKey(e)) throw new AiDisabledError("GEMINI_KEY_INVALID");
        if (isTransient(e) && attempt < 2) { await sleep(400 * (attempt + 1)); continue; }
        break;
      }
    }
  }
  throw lastErr;
}

// ---------- Groq (OpenAI-compatible) ----------
function groqModels(): string[] {
  return uniq([process.env.GROQ_MODEL, "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]);
}
async function groqText(contents: string, json: boolean): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_DISABLED");
  return openAiCompatible("https://api.groq.com/openai/v1/chat/completions", key, groqModels(), contents, json, "groq");
}

// ---------- OpenAI ----------
function openaiModels(): string[] {
  return uniq([process.env.OPENAI_MODEL, "gpt-4o-mini", "gpt-4o"]);
}
async function openaiText(contents: string, json: boolean): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_DISABLED");
  return openAiCompatible("https://api.openai.com/v1/chat/completions", key, openaiModels(), contents, json, "openai");
}

// Shared OpenAI-compatible chat-completions caller (used by Groq + OpenAI).
async function openAiCompatible(url: string, key: string, models: string[], contents: string, json: boolean, provider = "openai"): Promise<string> {
  let lastErr: unknown = new Error("provider failed");
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: contents }],
            temperature: 0.4,
            ...(json ? { response_format: { type: "json_object" } } : {}),
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`${res.status}: ${t.slice(0, 200)}`);
        }
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) {
          recordUsage(provider, data?.usage?.total_tokens || 0);
          return text;
        }
        lastErr = new Error("Empty response");
      } catch (e) {
        lastErr = e;
        if (isInvalidKey(e)) throw new AiDisabledError("PROVIDER_KEY_INVALID");
        if (isTransient(e) && attempt < 2) { await sleep(400 * (attempt + 1)); continue; }
        break; // next model
      }
    }
  }
  throw lastErr;
}

// ---------- Anthropic Claude ----------
let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}
function claudeModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
}
async function claudeText(contents: string, json: boolean): Promise<string> {
  const client = getAnthropic();
  if (!client) throw new Error("CLAUDE_DISABLED");
  // Opus 4.8 rejects temperature/top_p/top_k and budget_tokens; adaptive
  // thinking must be requested explicitly (omitting it runs without thinking).
  const body = json
    ? `${contents}\n\nRespond with a single valid JSON object and nothing else — no prose, no markdown fences.`
    : contents;
  let lastErr: unknown = new Error("CLAUDE_DISABLED");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.messages.create({
        model: claudeModel(),
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        messages: [{ role: "user", content: body }],
      });
      if (res.stop_reason === "refusal") throw new Error("CLAUDE_REFUSAL");
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) {
        recordUsage("claude", (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0));
        return text;
      }
      lastErr = new Error("Empty Claude response");
    } catch (e) {
      lastErr = e;
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new AiDisabledError("CLAUDE_KEY_INVALID");
      }
      if (
        (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || isTransient(e)) &&
        attempt < 2
      ) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

type Provider = "openai" | "gemini" | "groq" | "claude";
const PROVIDER_FN: Record<Provider, (c: string, j: boolean) => Promise<string>> = {
  openai: openaiText,
  gemini: geminiText,
  groq: groqText,
  claude: claudeText,
};
function providerConfigured(p: Provider): boolean {
  if (p === "openai") return !!process.env.OPENAI_API_KEY;
  if (p === "gemini") return !!process.env.GEMINI_API_KEY;
  if (p === "claude") return !!process.env.ANTHROPIC_API_KEY;
  return !!process.env.GROQ_API_KEY;
}

export type Tier = "reasoning" | "fast";
function tierOrder(tier: Tier): Provider[] {
  // Logic-heavy -> Claude/OpenAI first; light -> Groq first. Gemini in the middle.
  return tier === "reasoning"
    ? ["claude", "openai", "gemini", "groq"]
    : ["groq", "gemini", "openai", "claude"];
}

// ---- Named single-provider access (used by the multi-AI research verifier) ----
export type NamedProvider = Provider | "perplexity";

export const ALL_PROVIDERS: NamedProvider[] = ["claude", "openai", "gemini", "groq", "perplexity"];

export const PROVIDER_LABEL: Record<NamedProvider, string> = {
  claude: "Claude (Anthropic)",
  openai: "OpenAI",
  gemini: "Gemini (Google)",
  groq: "Groq (Llama)",
  perplexity: "Perplexity",
};

export function isProviderConfigured(p: NamedProvider): boolean {
  if (p === "perplexity") return perplexityConfigured();
  return providerConfigured(p);
}

export function configuredProviders(): NamedProvider[] {
  return ALL_PROVIDERS.filter(isProviderConfigured);
}

/**
 * Call one specific provider — no fallback. The research verifier needs each
 * model's own independent opinion, so silently substituting another provider
 * would corrupt the result.
 */
export async function generateWithProvider(
  provider: NamedProvider,
  contents: string,
  opts: { json?: boolean } = {},
): Promise<string> {
  if (!isProviderConfigured(provider)) throw new AiDisabledError(`${provider.toUpperCase()}_NOT_CONFIGURED`);
  if (provider === "perplexity") {
    const r = await generatePerplexity(contents);
    if (!r?.text) throw new Error("Perplexity returned no answer.");
    return r.text;
  }
  return PROVIDER_FN[provider](contents, !!opts.json);
}

export async function generateText(
  contents: string,
  opts: { json?: boolean; tier?: Tier } = {},
): Promise<string> {
  const tier = opts.tier ?? "fast";
  const order = tierOrder(tier).filter(providerConfigured);
  if (order.length === 0) throw new AiDisabledError("NO_AI_PROVIDER");
  let lastErr: unknown = null;
  for (const p of order) {
    try {
      return await PROVIDER_FN[p](contents, !!opts.json);
    } catch (e) {
      lastErr = e;
      if (e instanceof AiDisabledError) continue; // bad key for this provider -> next
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Parsed JSON with tiered routing + retries + provider fallback. */
export async function generateJson<T = any>(
  contents: string,
  opts: { tier?: Tier } = {},
): Promise<T> {
  const text = await generateText(contents, { json: true, tier: opts.tier });
  // tolerate occasional markdown fences from some models
  const clean = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  return JSON.parse(clean) as T;
}

/**
 * Live web answer via Perplexity Sonar API (OpenAI-compatible, real-time web
 * search with citations). Best for "what changed in the last 24h" questions.
 *
 * Returns null when PERPLEXITY_API_KEY is absent or the call fails, so callers
 * can fall back to Yahoo news + the tiered AI summariser.
 */
export type PerplexityResult = { text: string; citations: string[] };
function perplexityModels(): string[] {
  return uniq([process.env.PERPLEXITY_MODEL, "sonar", "sonar-pro"]);
}
export async function generatePerplexity(contents: string): Promise<PerplexityResult | null> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  let lastErr: unknown = null;
  for (const model of perplexityModels()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: contents }],
            temperature: 0.2,
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`${res.status}: ${t.slice(0, 200)}`);
        }
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || "";
        // Perplexity returns sources in `citations` (array of URLs) or, on newer
        // responses, `search_results` (objects with url).
        const citations: string[] = Array.isArray(data?.citations)
          ? data.citations
          : Array.isArray(data?.search_results)
            ? data.search_results.map((s: any) => s?.url).filter(Boolean)
            : [];
        if (text) {
          recordUsage("perplexity", data?.usage?.total_tokens || 0);
          return { text, citations };
        }
        lastErr = new Error("Empty Perplexity response");
      } catch (e) {
        lastErr = e;
        if (isInvalidKey(e)) return null;
        if (isTransient(e) && attempt < 1) { await sleep(500); continue; }
        break; // next model
      }
    }
  }
  console.warn("Perplexity failed:", String((lastErr as any)?.message || lastErr));
  return null;
}

export function perplexityConfigured(): boolean {
  return !!process.env.PERPLEXITY_API_KEY;
}

/**
 * Web-grounded research via Gemini + Google Search tool (Gemini-only).
 * Returns "" if grounding is unavailable so callers can fall back.
 */
export async function generateGrounded(contents: string): Promise<string> {
  const ai = getGemini();
  if (!ai) return "";
  for (const model of geminiModels()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents,
          config: { tools: [{ googleSearch: {} }] as any },
        });
        if (res.text) return res.text;
      } catch (e) {
        if (isTransient(e) && attempt < 1) { await sleep(500); continue; }
        break;
      }
    }
  }
  return "";
}
