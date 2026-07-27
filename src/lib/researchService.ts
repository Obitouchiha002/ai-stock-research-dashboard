/**
 * Research Dashboard engine.
 *
 * Two stages, deliberately separate:
 *   1. analyseDocuments() — one provider reads the source and produces a
 *      structured analysis whose every claim is tied to a quoted excerpt.
 *   2. verifyAnalysis()   — several OTHER providers independently re-read the
 *      source and rule on each claim. No provider ever sees another's verdict,
 *      so agreement means genuine independent agreement.
 *
 * Research support only. Not buy/sell advice. No guaranteed prediction.
 * Verdicts describe what the supplied document says — never outside truth.
 */

import {
  generateWithProvider,
  isProviderConfigured,
  type NamedProvider,
} from "./aiClient";
import {
  DISCLAIMER,
  VERDICTS,
  buildReport,
  type Analysis,
  type Claim,
  type ClaimConsensus,
  type ClaimVerdict,
  type FinalReport,
  type ProviderReview,
  type SourceDoc,
  type Verdict,
  type Verification,
} from "./researchTypes";

export type {
  Analysis, Claim, ClaimConsensus, ClaimVerdict, FinalReport,
  ProviderReview, SourceDoc, Verdict, Verification,
};
export { DISCLAIMER, buildReport };

/** Keeps every provider well inside its context window. */
const PER_DOC_BUDGET = 60_000;

function packSources(docs: SourceDoc[]): string {
  const budget = Math.max(12_000, Math.floor(PER_DOC_BUDGET / Math.max(1, docs.length)));
  return docs
    .map((d) => {
      const body = d.text.length > budget ? `${d.text.slice(0, budget)}\n…[truncated]` : d.text;
      return `<document name="${d.name}">\n${body}\n</document>`;
    })
    .join("\n\n");
}

/** Models occasionally wrap JSON in prose or fences despite instructions. */
function parseJson<T>(raw: string): T {
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(s) as T;
  } catch {
    const first = s.search(/[{[]/);
    const last = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    if (first >= 0 && last > first) return JSON.parse(s.slice(first, last + 1)) as T;
    throw new Error("Model did not return valid JSON.");
  }
}

// ---------------------------------------------------------------- stage 1 ----

function analysisPrompt(docs: SourceDoc[], focus: string): string {
  return `You are a research analyst. Read the supplied document(s) and produce a structured research analysis.

STRICT RULES
- Use ONLY what is in the documents. Do not add outside knowledge, estimates, or assumptions.
- Every claim MUST carry a short VERBATIM quote from the document as its evidence.
- If something is not stated, put it under "gaps" — never invent it.
- Research language only. No buy/sell advice, no predictions, no guarantees.
${focus ? `- The reader's focus for this review: ${focus}\n` : ""}
Return ONE JSON object, no prose, exactly this shape:
{
  "title": "short descriptive title of the material",
  "summary": "6-10 sentence neutral summary of what the document actually says",
  "keyFindings": ["concrete finding stated in the document", "..."],
  "claims": [
    {
      "id": "c1",
      "claim": "one specific, checkable statement made by the document",
      "evidence": "verbatim quote from the document supporting it",
      "source": "document file name the quote came from",
      "importance": "High" | "Medium" | "Low"
    }
  ],
  "figures": [{ "label": "what the number is", "value": "the number with units as written", "source": "document file name" }],
  "gaps": ["information a reader would want that the document does not provide"],
  "questions": ["open question the document raises but does not answer"]
}

Produce between 6 and 14 claims — the ones that actually matter, each independently checkable.

SOURCE DOCUMENTS
${packSources(docs)}`;
}

export async function analyseDocuments(
  docs: SourceDoc[],
  provider: NamedProvider,
  focus = "",
): Promise<Analysis> {
  const raw = await generateWithProvider(provider, analysisPrompt(docs, focus), { json: true });
  const a = parseJson<any>(raw);

  const claims: Claim[] = (Array.isArray(a?.claims) ? a.claims : [])
    .map((c: any, i: number) => ({
      id: String(c?.id || `c${i + 1}`),
      claim: String(c?.claim || "").trim(),
      evidence: String(c?.evidence || "").trim(),
      source: String(c?.source || docs[0]?.name || "").trim(),
      importance: (["High", "Medium", "Low"].includes(c?.importance) ? c.importance : "Medium") as Claim["importance"],
    }))
    .filter((c: Claim) => c.claim);

  return {
    title: String(a?.title || docs[0]?.name || "Untitled research").trim(),
    summary: String(a?.summary || "").trim(),
    keyFindings: (Array.isArray(a?.keyFindings) ? a.keyFindings : []).map(String).filter(Boolean),
    claims,
    figures: (Array.isArray(a?.figures) ? a.figures : [])
      .map((f: any) => ({
        label: String(f?.label || "").trim(),
        value: String(f?.value || "").trim(),
        source: String(f?.source || "").trim(),
      }))
      .filter((f: any) => f.label && f.value),
    gaps: (Array.isArray(a?.gaps) ? a.gaps : []).map(String).filter(Boolean),
    questions: (Array.isArray(a?.questions) ? a.questions : []).map(String).filter(Boolean),
  };
}

// ---------------------------------------------------------------- stage 2 ----

function verifyPrompt(docs: SourceDoc[], claims: Claim[]): string {
  return `You are an independent fact-checker. Another analyst produced the claims below from the source document(s). Check each one AGAINST THE DOCUMENTS ONLY.

STRICT RULES
- Judge only whether the DOCUMENT supports the claim. Do not use outside knowledge.
- "Supported"        = the document clearly states this.
- "Partly supported" = the document states part of it, or states it with caveats the claim drops.
- "Contradicted"     = the document says something incompatible with it.
- "Not found"        = the document does not address it at all.
- "Unclear"          = the document is ambiguous on it.
- Be sceptical. Do not rubber-stamp a claim because it sounds reasonable.
- confidence is 0-100: how sure you are of YOUR OWN verdict.
- note: one sentence, citing the document wording you relied on.

Return ONE JSON object, no prose:
{ "verdicts": [ { "id": "c1", "verdict": "Supported", "confidence": 85, "note": "..." } ] }

Return exactly one entry for every id listed below.

CLAIMS TO CHECK
${claims.map((c) => `- id ${c.id}: ${c.claim}`).join("\n")}

SOURCE DOCUMENTS
${packSources(docs)}`;
}

async function reviewOne(
  provider: NamedProvider,
  docs: SourceDoc[],
  claims: Claim[],
): Promise<ProviderReview> {
  try {
    const raw = await generateWithProvider(provider, verifyPrompt(docs, claims), { json: true });
    const parsed = parseJson<any>(raw);
    const list = Array.isArray(parsed?.verdicts) ? parsed.verdicts : Array.isArray(parsed) ? parsed : [];
    const byId = new Map<string, ClaimVerdict>();
    for (const v of list) {
      const id = String(v?.id || "").trim();
      if (!id) continue;
      const verdict = (VERDICTS.includes(v?.verdict) ? v.verdict : "Unclear") as Verdict;
      const confRaw = Number(v?.confidence);
      byId.set(id, {
        id,
        verdict,
        confidence: Number.isFinite(confRaw) ? Math.max(0, Math.min(100, Math.round(confRaw))) : 50,
        note: String(v?.note || "").trim(),
      });
    }
    // A claim the reviewer skipped is "Unclear", not silently missing.
    const verdicts = claims.map(
      (c) => byId.get(c.id) || { id: c.id, verdict: "Unclear" as Verdict, confidence: 0, note: "This reviewer did not return a verdict for this claim." },
    );
    return { provider, ok: true, verdicts };
  } catch (e: any) {
    return { provider, ok: false, error: e?.message || String(e), verdicts: [] };
  }
}

export async function verifyAnalysis(
  docs: SourceDoc[],
  claims: Claim[],
  providers: NamedProvider[],
): Promise<Verification> {
  const usable = providers.filter(isProviderConfigured);
  if (!usable.length) {
    return {
      reviewers: [],
      consensus: [],
      score: 0,
      summary: "No verification providers are configured. Add at least one API key to run cross-checks.",
    };
  }

  // Reviewers run concurrently and never see each other's output.
  const reviewers = await Promise.all(usable.map((p) => reviewOne(p, docs, claims)));
  const good = reviewers.filter((r) => r.ok && r.verdicts.length);

  const consensus: ClaimConsensus[] = claims.map((c) => {
    const byProvider: Record<string, ClaimVerdict> = {};
    for (const r of good) {
      const v = r.verdicts.find((x) => x.id === c.id);
      if (v) byProvider[r.provider] = v;
    }
    const votes = Object.values(byProvider);
    const tally = new Map<Verdict, number>();
    for (const v of votes) tally.set(v.verdict, (tally.get(v.verdict) || 0) + 1);
    let majority: Verdict = "Unclear";
    let top = 0;
    for (const [verdict, n] of tally) if (n > top) { top = n; majority = verdict; }
    const agreement = votes.length ? (top / votes.length) * 100 : 0;
    const avgConfidence = votes.length
      ? votes.reduce((a, v) => a + v.confidence, 0) / votes.length
      : 0;
    return {
      id: c.id,
      claim: c.claim,
      evidence: c.evidence,
      source: c.source,
      importance: c.importance,
      byProvider,
      agreement,
      majority,
      avgConfidence,
      // Any disagreement, or any reviewer calling it contradicted, is worth a flag.
      disputed: votes.length > 1 && (agreement < 100 || votes.some((v) => v.verdict === "Contradicted")),
    };
  });

  // Corroboration score: what share of claims the reviewers actually stand behind.
  const weight: Record<Verdict, number> = {
    Supported: 1,
    "Partly supported": 0.6,
    Unclear: 0.25,
    "Not found": 0,
    Contradicted: 0,
  };
  const scored = consensus.filter((c) => Object.keys(c.byProvider).length);
  const score = scored.length
    ? Math.round(
        (scored.reduce((a, c) => a + weight[c.majority] * (c.agreement / 100), 0) / scored.length) * 100,
      )
    : 0;

  const supported = consensus.filter((c) => c.majority === "Supported").length;
  const contradicted = consensus.filter((c) => c.majority === "Contradicted").length;
  const disputed = consensus.filter((c) => c.disputed).length;
  const failed = reviewers.filter((r) => !r.ok);

  const summary =
    `${good.length} model${good.length === 1 ? "" : "s"} independently re-read the source and ruled on ${claims.length} claims. ` +
    `${supported} were backed by the majority, ${contradicted} were contradicted, and ${disputed} split the reviewers.` +
    (failed.length ? ` ${failed.length} reviewer(s) failed to respond and were excluded.` : "");

  return { reviewers, consensus, score, summary };
}
