import { NextRequest, NextResponse } from "next/server";
import {
  configuredProviders,
  currentUsage,
  generateWithProvider,
  runWithUsage,
  type NamedProvider,
} from "@/lib/aiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Keeps the packed documents well inside every provider's context window. */
const DOC_BUDGET = 60_000;
/** Only the recent turns are replayed — older ones rarely change the answer. */
const HISTORY_TURNS = 12;

function packDocs(docs: { name: string; text: string }[]): string {
  const per = Math.max(12_000, Math.floor(DOC_BUDGET / Math.max(1, docs.length)));
  return docs
    .map((d) => {
      const body = d.text.length > per ? `${d.text.slice(0, per)}\n…[truncated]` : d.text;
      return `<document name="${d.name}">\n${body}\n</document>`;
    })
    .join("\n\n");
}

/**
 * Grounded Q&A over the user's uploaded documents.
 *
 * The model answers from the supplied text only — anything the documents do not
 * cover comes back as "not in the document" rather than a guess from general
 * knowledge, which is the whole point of asking a research tool.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const docs = (Array.isArray(body.docs) ? body.docs : [])
      .map((d: any) => ({ name: String(d?.name || "document"), text: String(d?.text || "") }))
      .filter((d: any) => d.text.trim());

    const history = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && String(m.content || "").trim())
      .slice(-HISTORY_TURNS)
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content) }));

    const question = history.length ? history[history.length - 1] : null;
    if (!question || question.role !== "user") {
      return NextResponse.json({ error: "No question was supplied." }, { status: 400 });
    }

    const available = configuredProviders();
    if (!available.length) {
      return NextResponse.json(
        { error: "No AI provider is configured. Add an API key in .env.local." },
        { status: 400 },
      );
    }
    const requested = String(body.provider || "") as NamedProvider;
    const provider: NamedProvider = available.includes(requested) ? requested : available[0];

    const prior = history
      .slice(0, -1)
      .map((m: { role: string; content: string }) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
      .join("\n\n");

    const prompt = `You are a research assistant answering questions about the documents below.

RULES
- Answer ONLY from the documents. Do not use outside knowledge or fill gaps with assumptions.
- Quote the document when you make a factual statement, and name the file it came from.
- If the documents do not cover the question, say so plainly and state what IS covered nearby. Never guess.
- If the documents contradict each other, say that and show both sides.
- Be direct and concise. Plain prose — no preamble, no restating the question.
- Research language only. No buy/sell advice, no predictions, no guarantees.
${docs.length ? "" : "- NOTE: no documents are attached. Say that you need a document before you can answer, and do not answer from general knowledge.\n"}
${prior ? `EARLIER IN THIS CONVERSATION\n${prior}\n\n` : ""}QUESTION
${question.content}

${docs.length ? `SOURCE DOCUMENTS\n${packDocs(docs)}` : ""}`;

    const out = await runWithUsage(async () => {
      const reply = await generateWithProvider(provider, prompt);
      const u = currentUsage();
      return { reply: String(reply || "").trim(), aiTokens: u?.tokens || 0, usage: u };
    });

    if (!out.reply) {
      return NextResponse.json({ error: `${provider} returned an empty answer.` }, { status: 502 });
    }
    return NextResponse.json({ provider, ...out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
