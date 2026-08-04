import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Streaming chat endpoint — tokens are sent to the browser as they are produced
// so the answer appears instantly instead of after a wait. Mirrors the "fast"
// tier order (Groq → OpenAI → Gemini); the first provider that yields text wins.
// If nothing streams, the client falls back to the non-streaming route.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const enc = new TextEncoder();

// Groq and OpenAI share the OpenAI chat-completions SSE shape.
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
      } catch {
        /* ignore keep-alive / partial lines */
      }
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = String(body.prompt || body.input || "");
  if (!prompt) return new Response(JSON.stringify({ error: "prompt required" }), { status: 400 });

  const attempts: Array<() => AsyncGenerator<string>> = [];
  if (process.env.GROQ_API_KEY)
    attempts.push(() => openaiCompatStream("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY!, process.env.GROQ_MODEL || "llama-3.3-70b-versatile", prompt));
  if (process.env.OPENAI_API_KEY)
    attempts.push(() => openaiCompatStream("https://api.openai.com/v1/chat/completions", process.env.OPENAI_API_KEY!, process.env.OPENAI_MODEL || "gpt-4o-mini", prompt));
  if (process.env.GEMINI_API_KEY) attempts.push(() => geminiStream(prompt));

  if (!attempts.length) return new Response(JSON.stringify({ error: "no AI provider configured" }), { status: 503 });

  const stream = new ReadableStream({
    async start(controller) {
      let sentAny = false;
      for (const attempt of attempts) {
        try {
          for await (const piece of attempt()) {
            sentAny = true;
            controller.enqueue(enc.encode(piece));
          }
          if (sentAny) break; // finished cleanly on a working provider
        } catch {
          if (sentAny) break; // already mid-stream — don't restart with another model
          // otherwise fall through to the next provider
        }
      }
      controller.close(); // empty stream → client falls back to the non-streaming route
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
