import { NextRequest, NextResponse } from "next/server";
import { analyseDocuments } from "@/lib/researchService";
import { configuredProviders, currentUsage, runWithUsage, type NamedProvider } from "@/lib/aiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ providers: configuredProviders() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const docs = (Array.isArray(body.docs) ? body.docs : [])
      .map((d: any) => ({ name: String(d?.name || "document"), text: String(d?.text || "") }))
      .filter((d: any) => d.text.trim());
    if (!docs.length) return NextResponse.json({ error: "No document text supplied." }, { status: 400 });

    const available = configuredProviders();
    if (!available.length) {
      return NextResponse.json({ error: "No AI provider is configured. Add an API key in .env.local." }, { status: 400 });
    }
    const requested = String(body.provider || "") as NamedProvider;
    const provider: NamedProvider = available.includes(requested) ? requested : available[0];
    const focus = String(body.focus || "").slice(0, 500);

    const out = await runWithUsage(async () => {
      const analysis = await analyseDocuments(docs, provider, focus);
      const u = currentUsage();
      return { analysis, aiTokens: u?.tokens || 0, usage: u };
    });

    return NextResponse.json({ provider, ...out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
