import { NextRequest, NextResponse } from "next/server";
import { verifyAnalysis, type Claim } from "@/lib/researchService";
import { configuredProviders, currentUsage, runWithUsage, type NamedProvider } from "@/lib/aiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const docs = (Array.isArray(body.docs) ? body.docs : [])
      .map((d: any) => ({ name: String(d?.name || "document"), text: String(d?.text || "") }))
      .filter((d: any) => d.text.trim());
    const claims: Claim[] = (Array.isArray(body.claims) ? body.claims : [])
      .map((c: any, i: number) => ({
        id: String(c?.id || `c${i + 1}`),
        claim: String(c?.claim || ""),
        evidence: String(c?.evidence || ""),
        source: String(c?.source || ""),
        importance: c?.importance === "High" || c?.importance === "Low" ? c.importance : "Medium",
      }))
      .filter((c: Claim) => c.claim);

    if (!docs.length) return NextResponse.json({ error: "No document text supplied." }, { status: 400 });
    if (!claims.length) return NextResponse.json({ error: "No claims to verify — run the analysis first." }, { status: 400 });

    const available = configuredProviders();
    const requested = (Array.isArray(body.providers) ? body.providers : []) as NamedProvider[];
    const providers = (requested.length ? requested : available).filter((p) => available.includes(p));
    if (!providers.length) {
      return NextResponse.json(
        { error: "None of the selected verification providers are configured." },
        { status: 400 },
      );
    }

    const out = await runWithUsage(async () => {
      const verification = await verifyAnalysis(docs, claims, providers);
      const u = currentUsage();
      return { verification, aiTokens: u?.tokens || 0, usage: u };
    });

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
