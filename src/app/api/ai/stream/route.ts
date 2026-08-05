import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { generateWithProvider, configuredProviders, type NamedProvider } from "@/lib/aiClient";

// Streaming chat endpoint with model choice. `provider` picks which AI answers:
// "auto" (fast order) or a specific one — openai (ChatGPT), claude, gemini, groq.
// Tokens stream as they're produced; if streaming for the chosen model fails,
// it falls back to a single non-streamed call to that same model.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const enc = new TextEncoder();

// List configured providers for the model picker.
export async function GET() {
  return new Response(JSON.stringify({ providers: configuredProviders() }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function* openaiCompatStream(url: string, key: string, model: string, prompt: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch { /* keep-alive / partial */ }
    }
  }
}

async function* geminiStream(prompt: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const stream = await ai.models.generateContentStream({ model, contents: prompt });
  for await (const chunk of stream as any) {
    const t = chunk?.text;
    if (t) yield t as string;
  }
}

async function* claudeStream(prompt: string) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const stream = await client.messages.stream({ model, max_tokens: 2048, messages: [{ role: "user", content: prompt }] });
  for await (const ev of stream as any) {
    if (ev?.type === "content_block_delta" && ev?.delta?.type === "text_delta") yield ev.delta.text as string;
  }
}

function streamerFor(p: NamedProvider, prompt: string): (() => AsyncGenerator<string>) | null {
  switch (p) {
    case "groq": return process.env.GROQ_API_KEY ? () => openaiCompatStream("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY!, process.env.GROQ_MODEL || "llama-3.3-70b-versatile", prompt) : null;
    case "openai": return process.env.OPENAI_API_KEY ? () => openaiCompatStream("https://api.openai.com/v1/chat/completions", process.env.OPENAI_API_KEY!, process.env.OPENAI_MODEL || "gpt-4o-mini", prompt) : null;
    case "gemini": return process.env.GEMINI_API_KEY ? () => geminiStream(prompt) : null;
    case "claude": return process.env.ANTHROPIC_API_KEY ? () => claudeStream(prompt) : null;
    default: return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = String(body.prompt || body.input || "");
  const provider = String(body.provider || "auto") as NamedProvider | "auto";
  if (!prompt) return new Response(JSON.stringify({ error: "prompt required" }), { status: 400 });

  // Which streamers to try, in order. A specific provider = just that one; auto
  // = the fast order.
  const order: NamedProvider[] = provider === "auto" ? ["groq", "openai", "gemini", "claude"] : [provider];
  const attempts = order.map((p) => streamerFor(p, prompt)).filter(Boolean) as Array<() => AsyncGenerator<string>>;

  const stream = new ReadableStream({
    async start(controller) {
      let sentAny = false;
      for (const attempt of attempts) {
        try {
          for await (const piece of attempt()) { sentAny = true; controller.enqueue(enc.encode(piece)); }
          if (sentAny) break;
        } catch {
          if (sentAny) break;
        }
      }
      // Chosen model couldn't stream — one non-streamed call to that same model.
      if (!sentAny && provider !== "auto") {
        try {
          const text = await generateWithProvider(provider as NamedProvider, prompt);
          if (text) { controller.enqueue(enc.encode(text)); sentAny = true; }
        } catch { /* client falls back */ }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
