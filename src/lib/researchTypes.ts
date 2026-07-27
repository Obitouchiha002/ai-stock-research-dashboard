/**
 * Shared shapes for the Research Dashboard.
 *
 * Deliberately free of any server-only import (no aiClient, no node:*) so the
 * client page can use these types and buildReport without pulling the AI SDKs
 * into the browser bundle.
 */

export type NamedProviderId = "openai" | "gemini" | "groq" | "claude" | "perplexity";

export type SourceDoc = { name: string; text: string };

export type Claim = {
  id: string;
  claim: string;
  evidence: string;
  source: string;
  importance: "High" | "Medium" | "Low";
};

export type Analysis = {
  title: string;
  summary: string;
  keyFindings: string[];
  claims: Claim[];
  figures: { label: string; value: string; source: string }[];
  gaps: string[];
  questions: string[];
};

export type Verdict = "Supported" | "Partly supported" | "Contradicted" | "Not found" | "Unclear";

export type ClaimVerdict = {
  id: string;
  verdict: Verdict;
  confidence: number; // 0-100
  note: string;
};

export type ProviderReview = {
  provider: NamedProviderId;
  ok: boolean;
  error?: string;
  verdicts: ClaimVerdict[];
};

export type ClaimConsensus = {
  id: string;
  claim: string;
  evidence: string;
  source: string;
  importance: Claim["importance"];
  byProvider: Record<string, ClaimVerdict>;
  agreement: number; // % of responding reviewers on the majority verdict
  majority: Verdict;
  avgConfidence: number;
  disputed: boolean;
};

export type Verification = {
  reviewers: ProviderReview[];
  consensus: ClaimConsensus[];
  score: number; // 0-100 overall corroboration
  summary: string;
};

export type FinalReport = {
  title: string;
  generatedAt: string;
  sources: { name: string; chars: number }[];
  analysedBy: NamedProviderId;
  verifiedBy: NamedProviderId[];
  analysis: Analysis;
  verification: Verification;
  disclaimer: string;
};

export const VERDICTS: Verdict[] = [
  "Supported",
  "Partly supported",
  "Contradicted",
  "Not found",
  "Unclear",
];

export const DISCLAIMER =
  "Research support only. Not buy/sell advice. No guaranteed prediction. Always verify data independently.";

export function buildReport(
  analysis: Analysis,
  verification: Verification,
  sources: { name: string; chars: number }[],
  analysedBy: NamedProviderId,
  generatedAt: string,
): FinalReport {
  return {
    title: analysis.title,
    generatedAt,
    sources,
    analysedBy,
    verifiedBy: verification.reviewers.filter((r) => r.ok).map((r) => r.provider),
    analysis,
    verification,
    disclaimer: DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// VERSIONS
// Every analysis run is kept as an immutable version — same documents can be
// re-analysed by a different model or with a different focus, and the runs are
// then compared against each other rather than overwriting one another.
// ---------------------------------------------------------------------------

export type AnalysisVersion = {
  id: string;
  /** 1-based, in creation order within its project. */
  version: number;
  label: string;
  docNames: string[];
  provider: NamedProviderId;
  focus: string;
  createdAt: number;
  analysis: Analysis;
  verification: Verification | null;
  aiTokens: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: NamedProviderId;
  createdAt: number;
  error?: boolean;
};

// ------------------------------------------------------------- comparison ---

/** One claim as seen across every compared version. */
export type ClaimRow = {
  key: string;
  /** Canonical wording — taken from the first version that raised it. */
  claim: string;
  /** version id -> what that version said about this claim. */
  byVersion: Record<
    string,
    { present: true; verdict: Verdict | null; agreement: number | null; evidence: string } | { present: false }
  >;
  presentIn: number;
  /** Raised by some versions but not others. */
  unique: boolean;
  /** Versions that did verify it disagree with each other on the verdict. */
  conflicting: boolean;
};

export type VersionStat = {
  id: string;
  version: number;
  label: string;
  provider: NamedProviderId;
  createdAt: number;
  claims: number;
  verified: boolean;
  score: number | null;
  supported: number;
  contradicted: number;
  disputed: number;
  reviewers: NamedProviderId[];
  docNames: string[];
};

export type VersionComparison = {
  versions: VersionStat[];
  rows: ClaimRow[];
  sharedClaims: number;
  uniqueClaims: number;
  conflictingClaims: number;
  /** % of claim rows every compared version raised. */
  overlapPct: number;
  summary: string;
};

const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "for", "on", "at", "by", "and", "or", "is",
  "was", "were", "are", "be", "been", "with", "that", "this", "it", "its", "as",
  "from", "has", "have", "had", "will", "would", "than", "then", "over", "per",
]);

function tokens(s: string): Set<string> {
  return new Set(
    String(s || "")
      .toLowerCase()
      // Keep thousands separators inside numbers so "4,820" stays one token.
      .replace(/(\d),(\d)/g, "$1$2")
      .replace(/[^a-z0-9%.\s-]/g, " ")
      .split(/\s+/)
      // Dots are kept above for decimals like "14.2%", which leaves sentence
      // punctuation attached — "crore." would otherwise never match "crore".
      .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ""))
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

/**
 * Figures carry far more identifying signal than prose. "EBITDA margin fell to
 * 11.6% from 12.9%" and "EBITDA margin declined to 11.6% versus 12.9%" are the
 * same finding; plain Jaccard scores that at exactly 0.5 and misses it, while
 * weighting the shared numbers lifts it clear of the threshold.
 */
const NUMERIC = /\d/;
const weight = (t: string) => (NUMERIC.test(t) ? 2.5 : 1);

function weightOf(set: Set<string>): number {
  let w = 0;
  for (const t of set) w += weight(t);
  return w;
}

/**
 * Containment, not Jaccard.
 *
 * Models restate the same finding at very different lengths — one writes
 * "Revenue for the quarter was Rs 4,820 crore, up 14.2% year on year", another
 * "Nimbus Retail Ltd's revenue for Q3 FY26 was Rs 4,820 crore". Jaccard
 * punishes both for the words the other did not use and scores that pair at
 * 0.29; containment asks the question that actually matters — is the shorter
 * claim's substance inside the longer one — and scores it 0.50.
 *
 * Returns 0 unless the overlap is substantive: at least two shared tokens, and
 * either a shared figure or three shared tokens. Without that guard, short
 * claims match anything that happens to reuse a couple of common words.
 */
function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  let shared = 0;
  let sharedNumeric = false;
  for (const t of a) {
    if (!b.has(t)) continue;
    inter += weight(t);
    shared++;
    if (NUMERIC.test(t)) sharedNumeric = true;
  }
  if (shared < 2 || (!sharedNumeric && shared < 3)) return 0;
  const smaller = Math.min(weightOf(a), weightOf(b));
  return smaller > 0 ? inter / smaller : 0;
}

/** Two models rarely word the same finding identically, so match on overlap. */
const MATCH_THRESHOLD = 0.5;

export function compareVersions(versions: AnalysisVersion[]): VersionComparison {
  const stats: VersionStat[] = versions.map((v) => {
    const c = v.verification?.consensus || [];
    return {
      id: v.id,
      version: v.version,
      label: v.label,
      provider: v.provider,
      createdAt: v.createdAt,
      claims: v.analysis?.claims?.length || 0,
      verified: !!v.verification?.reviewers?.some((r) => r.ok),
      score: v.verification ? v.verification.score : null,
      supported: c.filter((x) => x.majority === "Supported").length,
      contradicted: c.filter((x) => x.majority === "Contradicted").length,
      disputed: c.filter((x) => x.disputed).length,
      reviewers: (v.verification?.reviewers || []).filter((r) => r.ok).map((r) => r.provider),
      docNames: v.docNames,
    };
  });

  // Cluster claims across versions by wording similarity.
  type Cluster = { claim: string; toks: Set<string>; hits: Map<string, any> };
  const clusters: Cluster[] = [];

  for (const v of versions) {
    for (const c of v.analysis?.claims || []) {
      const t = tokens(c.claim);
      const con = v.verification?.consensus?.find((x) => x.id === c.id);
      const hit = {
        present: true as const,
        verdict: (con?.majority ?? null) as Verdict | null,
        agreement: con ? con.agreement : null,
        evidence: c.evidence,
      };

      let best: Cluster | null = null;
      let bestScore = MATCH_THRESHOLD;
      for (const cl of clusters) {
        // A version can't match its own earlier claim into the same cluster.
        if (cl.hits.has(v.id)) continue;
        const s = similarity(t, cl.toks);
        if (s >= bestScore) { bestScore = s; best = cl; }
      }

      if (best) best.hits.set(v.id, hit);
      else clusters.push({ claim: c.claim, toks: t, hits: new Map([[v.id, hit]]) });
    }
  }

  const rows: ClaimRow[] = clusters.map((cl, i) => {
    const byVersion: ClaimRow["byVersion"] = {};
    for (const v of versions) byVersion[v.id] = cl.hits.get(v.id) || { present: false };
    const verdicts = [...cl.hits.values()].map((h: any) => h.verdict).filter(Boolean) as Verdict[];
    return {
      key: `row_${i}`,
      claim: cl.claim,
      byVersion,
      presentIn: cl.hits.size,
      unique: cl.hits.size < versions.length,
      conflicting: new Set(verdicts).size > 1,
    };
  });

  // Most-shared first, then conflicts, so the important rows sit at the top.
  rows.sort(
    (a, b) => b.presentIn - a.presentIn || Number(b.conflicting) - Number(a.conflicting),
  );

  const shared = rows.filter((r) => r.presentIn === versions.length).length;
  const unique = rows.filter((r) => r.unique).length;
  const conflicting = rows.filter((r) => r.conflicting).length;
  const overlapPct = rows.length ? (shared / rows.length) * 100 : 0;

  const summary = versions.length < 2
    ? "Select at least two versions to compare them."
    : `${versions.length} versions raise ${rows.length} distinct claims between them. ` +
      `${shared} were raised by every version, ${unique} by only some, and ${conflicting} got conflicting verdicts.`;

  return { versions: stats, rows, sharedClaims: shared, uniqueClaims: unique, conflictingClaims: conflicting, overlapPct, summary };
}
