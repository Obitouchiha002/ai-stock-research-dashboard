"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Loader2, AlertTriangle, FileText, Download, Sparkles, CheckCircle2, XCircle, Upload } from "lucide-react";
import { downloadExcel } from "@/lib/exportUtils";
import { getImportedReport } from "@/lib/storage";

const chip: Record<string, string> = {
  g: "text-emerald-700 bg-emerald-50 border-emerald-200",
  a: "text-amber-700 bg-amber-50 border-amber-200",
  r: "text-rose-700 bg-rose-50 border-rose-200",
  n: "text-slate-500 bg-slate-50 border-slate-200",
};
function st(label: string): "g" | "a" | "r" | "n" {
  const l = (label || "").toLowerCase();
  if (/(strong|accelerat|outperform|positive|leader|great|good|debt-free|uptrend|healthy|reasonable|improving|a\+|a-|^a$|pass)/.test(l)) return "g";
  if (/(mixed|neutral|watch|average|fair|stable|moderate|pullback|partial|^b|reasonable)/.test(l)) return "a";
  if (/(weak|negative|distribution|downtrend|expensive|poor|avoid|elevated|critical|fail|insufficient|^d|^e)/.test(l)) return "r";
  return "n";
}
function Chip({ label }: { label: any }) {
  const s = st(String(label));
  return <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${chip[s]}`}>{String(label ?? "—")}</span>;
}
function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-indigo-600 text-white text-xs flex items-center justify-center">{n}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}
function List({ items, tone = "slate" }: { items?: string[]; tone?: string }) {
  if (!items || items.length === 0) return <span className="text-xs text-slate-400 italic">—</span>;
  const dot = tone === "g" ? "bg-emerald-500" : tone === "r" ? "bg-rose-500" : tone === "a" ? "bg-amber-500" : "bg-indigo-400";
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${dot} mt-1.5 shrink-0`} />
          {it}
        </li>
      ))}
    </ul>
  );
}

export default function ResearchNoteTab({ symbol, market }: { symbol: string; market: string }) {
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState<any | null>(null);
  const [imported, setImported] = useState<any | null>(null);
  React.useEffect(() => { setImported(getImportedReport(symbol)); }, [symbol]);

  // withAi=false → fast computed note (no slow LLM calls); true → add the AI narrative.
  const load = async (withAi = false) => {
    if (withAi) setAiLoading(true); else setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/research-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, market, skipAi: !withAi }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Research note failed");
      setNote(json.note);
    } catch (e: any) {
      setError(e.message || "Research note failed.");
    } finally {
      setLoading(false);
      setAiLoading(false);
    }
  };
  React.useEffect(() => {
    if (symbol) load(false); // instant computed load; AI is on-demand
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const exportExcel = () => {
    if (!note) return;
    const s = note.sections;
    downloadExcel(
      `ResearchNote_${(symbol || "stock").replace(/\W/g, "_")}_${new Date().toISOString().split("T")[0]}`,
      `${note.name} — CANSLIM Research Note`,
      [
        { title: "Snapshot", rows: [["Parameter", "Value"], ...note.snapshot.map((r: any) => [r[0], r[1]])] },
        { title: "CAN SLIM", rows: [["Code", "Criterion", "Status", "Value"], ...(s.canSlim?.criteria || []).map((c: any) => [c.code, c.name, c.status, c.value])] },
        { title: "Quarterly EPS", rows: [["Quarter", "EPS", "QoQ", "YoY"], ...(s.quarterlyEps?.quarters || []).map((q: any) => [q.quarter, q.epsDisplay, q.qoq, q.yoy])] },
        { title: "Multi-Year Financials", rows: [["Year", "Revenue", "Earnings"], ...(s.multiYear?.years || []).map((y: any) => [y.year, y.revenueDisplay, y.earningsDisplay])] },
      ],
    );
  };

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="font-medium text-sm">Loading research…</p>
        <p className="text-xs text-slate-400 mt-1">momentum · evaluation · analytics</p>
      </div>
    );
  if (error)
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> {error}
        </div>
        <button onClick={() => load(false)} className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold">Retry</button>
      </div>
    );
  if (!note) return null;

  const s = note.sections;
  const ai = note.ai || {};

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 p-5">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" /> {note.name}
            <span className="text-sm font-medium text-slate-400">({note.symbol})</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            CANSLIM Research Note · {note.sector} · {new Date(note.generatedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true)} disabled={aiLoading} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50">
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            {note.ai ? "Refresh AI note" : "Generate AI note"}
            <span className="text-[9px] font-black text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded">PAID</span>
          </button>
          <button onClick={exportExcel} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {note.disclaimer}
      </div>

      {/* Enriched: imported third-party report exists for this stock */}
      {imported && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-black text-violet-700 flex items-center gap-1.5">
              <Upload className="w-4 h-4" /> Imported report linked to this stock
            </div>
            <Link href="/import" className="text-[11px] font-bold text-violet-600 hover:underline">Re-import / update</Link>
          </div>
          <div className="text-[11px] text-slate-500 mb-2">
            {imported.source}{imported.asOf ? ` · ${imported.asOf}` : ""} · imported {new Date(imported.savedAt).toLocaleDateString()}
          </div>
          <div className="flex flex-wrap gap-2">
            {(imported.imported?.ratings || []).slice(0, 6).map((r: any, i: number) => (
              <span key={i} className="text-[11px] bg-white border border-violet-200 rounded-lg px-2 py-1">
                <span className="text-slate-400">{typeof r.name === "string" ? r.name : ""}: </span>
                <b className="text-slate-700">{typeof r.value === "string" || typeof r.value === "number" ? r.value : ""}</b>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-400 italic">Third-party data shown alongside our computed analysis. Verify against original report.</p>
        </div>
      )}

      {/* 1. Snapshot */}
      <Section n={1} title="One-Page Snapshot">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {note.snapshot.map((r: any, i: number) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5 font-medium text-slate-500 w-1/3">{r[0]}</td>
                  <td className="py-1.5 font-bold text-slate-800">{r[1]}</td>
                  <td className="py-1.5 text-right"><Chip label={r[2] === "g" ? "Strong" : r[2] === "a" ? "Watch" : r[2] === "r" ? "Weak" : "—"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 2. Business */}
      <Section n={2} title="Business Summary">
        <p className="text-xs text-slate-600 leading-relaxed">{ai.businessProfile || s.company?.description}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[11px]">
          <div><span className="text-slate-400">Sector:</span> <b>{note.sector}</b></div>
          <div><span className="text-slate-400">Industry:</span> <b>{note.industry}</b></div>
          <div><span className="text-slate-400">Mkt Cap:</span> <b>{s.company?.marketCap}</b></div>
          <div><span className="text-slate-400">Beta:</span> <b>{s.company?.beta}</b></div>
        </div>
      </Section>

      {/* 3. Scorecard */}
      <Section n={3} title="Scorecard (StockAnalytix computed)">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {[
            ["Composite Rating", `${s.composite?.rating ?? "—"}/100`, s.composite?.label],
            ["CAN SLIM Score", `${s.canSlim?.scorePct ?? "—"}`, s.canSlim?.summaryLabel],
            ["Price Strength", s.priceStrength?.ratingCode, s.priceStrength?.rating],
            ["Acc/Dis Grade", s.accDis?.grade, s.buyerDemand?.rating],
            ["SMR Grade", s.smr?.grade, "Quality"],
            ["Sector Rank", s.sectorRank?.label, s.sectorRank?.sectorTrend],
          ].map(([k, v, lab]) => (
            <div key={k as string} className="flex items-center justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">{k as string}</span>
              <span className="flex items-center gap-2"><b className="text-slate-800">{v as string}</b><Chip label={lab} /></span>
            </div>
          ))}
        </div>
        {ai.scorecardRead && <p className="mt-3 text-[11px] text-slate-500">{ai.scorecardRead}</p>}
      </Section>

      {/* 4. CANSLIM */}
      <Section n={4} title="CAN SLIM Checklist">
        <div className="space-y-2">
          {(s.canSlim?.criteria || []).map((c: any) => {
            const ico = c.status === "Pass" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : c.status === "Fail" ? <XCircle className="w-3.5 h-3.5 text-rose-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
            return (
              <div key={c.code} className="flex items-start gap-2 text-xs border-b border-slate-50 pb-2">
                <span className="w-6 h-6 rounded bg-slate-100 font-black text-slate-700 flex items-center justify-center shrink-0">{c.code}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between"><b className="text-slate-800">{c.name}</b><span className="flex items-center gap-1 font-bold">{ico}{c.status}</span></div>
                  <div className="text-[11px] text-slate-500">{c.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] text-slate-400">{s.canSlim?.passes}/7 pass · {s.canSlim?.summaryLabel}</div>
      </Section>

      {/* 5. Technical */}
      <Section n={5} title="Technical Chart Analysis">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {[
            ["Trend", s.technical?.trend],
            ["RSI (14)", `${s.technical?.rsi ?? "—"} (${s.technical?.rsiLabel || "—"})`],
            ["ADX (14)", `${s.technical?.adx ?? "—"} (${s.technical?.adxLabel || "—"})`],
            ["Volume", s.technical?.volumeSignal],
            ["Support", s.technical?.support ? s.technical.support[0]?.toFixed?.(2) : "—"],
            ["Resistance", s.technical?.resistance ? s.technical.resistance[1]?.toFixed?.(2) : "—"],
            ["Extension Risk", s.technical?.extensionRisk?.riskLevel],
            ["MTF Alignment", s.technical?.alignmentLabel],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">{k as string}</span><b className="text-slate-800">{String(v ?? "—")}</b>
            </div>
          ))}
        </div>
        {ai.technicalRead && <p className="mt-3 text-[11px] text-slate-500">{ai.technicalRead}</p>}
      </Section>

      {/* 6. Quarterly */}
      <Section n={6} title="Quarterly Growth Trend">
        <div className="grid lg:grid-cols-2 gap-4">
          <QTable title="EPS" section={s.quarterlyEps} vkey="epsDisplay" />
          <QTable title="Sales" section={s.quarterlySales} vkey="revenueDisplay" />
        </div>
        {ai.quarterlyRead && <p className="mt-3 text-[11px] text-slate-500">{ai.quarterlyRead}</p>}
      </Section>

      {/* 7. Ownership */}
      <Section n={7} title="Ownership & Institutional Holding">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div className="flex justify-between py-1 border-b border-slate-50"><span className="text-slate-500">Institutions %</span><b>{s.ownership?.institutionsPercent}</b></div>
          <div className="flex justify-between py-1 border-b border-slate-50"><span className="text-slate-500">Insiders %</span><b>{s.ownership?.insidersPercent}</b></div>
          <div className="flex justify-between py-1 border-b border-slate-50"><span className="text-slate-500">Institutions Count</span><b>{s.ownership?.institutionsCount}</b></div>
          <div className="flex justify-between py-1 border-b border-slate-50"><span className="text-slate-500">Trend</span><b>{s.ownership?.label}</b></div>
        </div>
        {s.fundHolders?.available && (
          <div className="mt-2">
            <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Top Holders</div>
            {s.fundHolders.holders.slice(0, 5).map((h: any, i: number) => (
              <div key={i} className="flex justify-between text-[11px] py-0.5"><span className="text-slate-600 truncate pr-2">{h.name}</span><b>{h.pctHeld}</b></div>
            ))}
          </div>
        )}
        <div className="mt-2 text-[10px] text-amber-600 italic">{s.ownership?.note}</div>
        {ai.ownershipRead && <p className="mt-2 text-[11px] text-slate-500">{ai.ownershipRead}</p>}
      </Section>

      {/* 8. Financials */}
      <Section n={8} title="Financial Quality — Multi-Year">
        {s.multiYear?.available ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-slate-400 text-left"><th className="py-1">Year</th><th className="py-1 text-right">Revenue</th><th className="py-1 text-right">Earnings</th></tr></thead>
              <tbody>
                {s.multiYear.years.map((y: any, i: number) => (
                  <tr key={i} className="border-t border-slate-50"><td className="py-1 font-medium text-slate-600">{y.year}</td><td className="py-1 text-right font-bold">{y.revenueDisplay}</td><td className="py-1 text-right font-bold">{y.earningsDisplay}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <span className="text-xs text-slate-400 italic">{s.multiYear?.note}</span>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[11px]">
          <div><span className="text-slate-400">ROE:</span> <b>{s.qualityRatios?.metrics?.roe}</b></div>
          <div><span className="text-slate-400">ROCE:</span> <b>{s.qualityRatios?.metrics?.roce}</b></div>
          <div><span className="text-slate-400">D/E:</span> <b>{s.qualityRatios?.metrics?.debtEquity}</b></div>
          <div><span className="text-slate-400">FCF:</span> <b>{s.qualityRatios?.metrics?.freeCashFlow}</b></div>
        </div>
        {ai.financialRead && <p className="mt-3 text-[11px] text-slate-500">{ai.financialRead}</p>}
      </Section>

      {/* 9. Peers (honest gap) */}
      <Section n={9} title="Peer Comparison">
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          Full peer ranking requires the universe-ranking engine (planned). Current group context: <b className="mx-1">{s.sectorRank?.label}</b> · sector trend {s.sectorRank?.sectorTrend}.
        </div>
      </Section>

      {/* 10. AI Deep Dive — Expanded */}
      <Section n={10} title="AI Deep Dive — Expanded">
        {ai.error ? (
          <span className="text-xs text-slate-400 italic">{ai.error}</span>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ai.webResearchUsed ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                {ai.webResearchUsed ? "Web-researched" : "From summary + data (web research unavailable)"}
              </span>
            </div>
            <h4 className="text-xs font-black text-indigo-600">10.1 Business Profile</h4>
            <ObjTable rows={ai.businessDetails} cols={[["area", "Area"], ["insight", "Insight"], ["read", "Read"]]} />
            <h4 className="text-xs font-black text-indigo-600">10.2 Competitive Advantages / Moat</h4>
            <ObjTable rows={ai.moatFactors} cols={[["factor", "Moat Factor"], ["evidence", "Evidence"], ["strength", "Strength"]]} />
            {ai.competitiveAdvantages?.length > 0 && <List items={ai.competitiveAdvantages} tone="g" />}
            <h4 className="text-xs font-black text-indigo-600">10.3 Growth Drivers</h4>
            <ObjTable rows={ai.growthDrivers} cols={[["driver", "Driver"], ["timeframe", "Timeframe"], ["impact", "Impact"], ["evidence", "Evidence"]]} />
            <h4 className="text-xs font-black text-indigo-600">10.4 Industry / Sector Analysis</h4>
            <ObjTable rows={ai.industryFactors} cols={[["factor", "Factor"], ["tailwind", "Tailwind / Headwind"], ["read", "Read"]]} />
            {ai.sectorTailwinds?.length > 0 && <List items={ai.sectorTailwinds} />}
            <h4 className="text-xs font-black text-rose-600">10.5 Risk Factors</h4>
            <ObjTable rows={ai.riskFactors} cols={[["risk", "Risk"], ["severity", "Severity"], ["why", "Why It Matters"], ["track", "Track"]]} />
            {ai.masterScoreRead && (
              <div className="bg-slate-50 rounded-xl p-3 text-[11px] text-slate-600"><b className="text-indigo-600">10.6 Scorecard Interpretation: </b>{ai.masterScoreRead}</div>
            )}
          </div>
        )}
      </Section>

      {/* 11. Positives vs Red Flags */}
      <Section n={11} title="Positives vs Red Flags">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
            <div className="text-[10px] font-black uppercase text-emerald-700 mb-1.5">Top Positives</div>
            <List items={ai.topPositives} tone="g" />
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
            <div className="text-[10px] font-black uppercase text-rose-700 mb-1.5">Top Red Flags</div>
            <List items={ai.topRedFlags} tone="r" />
          </div>
        </div>
      </Section>

      {/* 12. Verdict */}
      <Section n={12} title="Final Research Verdict">
        {ai.finalView && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm font-semibold text-indigo-800 mb-3">{ai.finalView}</div>
        )}
        <div className="grid sm:grid-cols-2 gap-3 mb-3 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">CAN SLIM</span><Chip label={s.canSlim?.summaryLabel} /></div>
          <div className="flex justify-between"><span className="text-slate-500">Momentum</span><Chip label={s.shortTermSetup?.label} /></div>
        </div>
        {ai.threeLine && (
          <div className="space-y-1.5 text-xs">
            <div><b className="text-emerald-600">Working:</b> <span className="text-slate-600">{ai.threeLine.working}</span></div>
            <div><b className="text-amber-600">Not confirmed:</b> <span className="text-slate-600">{ai.threeLine.notConfirmed}</span></div>
            <div><b className="text-slate-600">Track before a view:</b> <span className="text-slate-600">{ai.threeLine.trackBefore}</span></div>
          </div>
        )}
        {ai.trackNext?.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Track Next</div>
            <List items={ai.trackNext} />
          </div>
        )}
      </Section>

      {/* 13. Self-Analysis */}
      {ai.selfAnalysis?.length > 0 && (
        <Section n={13} title="Self-Analysis of the Report">
          <ObjTable rows={ai.selfAnalysis} cols={[["area", "Self-Check Area"], ["review", "Analyst Review"]]} />
          {ai.confidenceLevel && (
            <div className="mt-2 text-xs"><b>Confidence Level:</b> <Chip label={ai.confidenceLevel} /></div>
          )}
        </Section>
      )}

      {/* 14. Verification Questions */}
      {ai.verificationQuestions?.length > 0 && (
        <Section n={14} title="External Verification Questions">
          <p className="text-[11px] text-slate-400 mb-2">Check these independently before acting — this is research input, not advice.</p>
          <ObjTable rows={ai.verificationQuestions} cols={[["question", "Question to Verify"], ["source", "Best Source"], ["why", "Why It Matters"]]} />
        </Section>
      )}

      {/* 15. Bottom-Line */}
      {ai.bottomLine && (
        <Section n={15} title="Bottom-Line Conclusion">
          {ai.bottomLine.investabilityView && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm font-bold text-indigo-800 mb-3">{ai.bottomLine.investabilityView}</div>
          )}
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            {[
              ["Best Action", ai.bottomLine.action],
              ["Confidence", ai.bottomLine.confidence],
              ["Main Reason", ai.bottomLine.mainReason],
              ["Main Risk", ai.bottomLine.mainRisk],
              ["Confirmation Needed", ai.bottomLine.confirmationNeeded],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k as string} className="py-1 border-b border-slate-50">
                <span className="text-slate-400 font-bold">{k as string}: </span>
                <span className="text-slate-700">{v as string}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="text-center text-[10px] text-slate-400 italic pb-4">{note.disclaimer}</div>
    </div>
  );
}

function ObjTable({ rows, cols }: { rows?: any[]; cols: [string, string][] }) {
  if (!rows || rows.length === 0) return <span className="text-xs text-slate-400 italic">Data not available.</span>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-slate-400 text-left">
            {cols.map(([, label]) => <th key={label} className="py-1 font-bold">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-50 align-top">
              {cols.map(([key], ci) => (
                <td key={key} className={`py-1.5 pr-3 ${ci === 0 ? "font-bold text-slate-700" : "text-slate-600"}`}>{String(r?.[key] ?? "—")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QTable({ title, section, vkey }: { title: string; section: any; vkey: string }) {
  if (!section?.available) return <div><div className="text-[10px] font-black uppercase text-slate-400 mb-1">{title}</div><span className="text-xs text-slate-400 italic">{section?.note || "Unavailable"}</span></div>;
  return (
    <div>
      <div className="text-[10px] font-black uppercase text-slate-400 mb-1">{title}</div>
      <table className="w-full text-[11px]">
        <thead><tr className="text-slate-400 text-left"><th className="py-1">Qtr</th><th className="py-1 text-right">{title}</th><th className="py-1 text-right">QoQ</th><th className="py-1 text-right">YoY</th></tr></thead>
        <tbody>
          {section.quarters.map((q: any, i: number) => (
            <tr key={i} className="border-t border-slate-50">
              <td className="py-1 text-slate-600">{q.quarter}</td>
              <td className="py-1 text-right font-bold">{q[vkey]}</td>
              <td className={`py-1 text-right font-bold ${String(q.qoq).startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>{q.qoq}</td>
              <td className={`py-1 text-right font-bold ${q.yoy === "Data Unavailable" ? "text-slate-400" : String(q.yoy).startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>{q.yoy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
