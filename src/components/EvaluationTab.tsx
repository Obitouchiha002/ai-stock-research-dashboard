"use client";

import React, { useState } from "react";
import {
  Award,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  Gauge,
  TrendingUp,
  ShieldCheck,
  Activity,
  Sparkles,
  Download,
  Loader2,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  Tooltip as RechartsTooltip,
} from "recharts";
import { downloadExcel } from "@/lib/exportUtils";

const INSUFFICIENT = "Data insufficient";

const statusMeta: Record<string, { color: string; Icon: any }> = {
  Pass: { color: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  Watch: { color: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertTriangle },
  Fail: { color: "bg-rose-50 text-rose-700 border-rose-200", Icon: XCircle },
  "Data insufficient": { color: "bg-slate-50 text-slate-400 border-slate-200", Icon: MinusCircle },
};

function gradeColor(g: string): string {
  if (g === "A" || g === "A+") return "text-emerald-600";
  if (g === "B") return "text-sky-600";
  if (g === "C") return "text-amber-600";
  if (g === "D" || g === "E") return "text-rose-600";
  return "text-slate-400";
}

function Card({ title, icon, children, badge }: { title: string; icon: React.ReactNode; children: React.ReactNode; badge?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">{icon}</span>
          {title}
        </h3>
        {badge && <span className="text-xs font-bold text-slate-500">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  const v = value === undefined || value === null || value === "" ? INSUFFICIENT : String(value);
  const muted = v === INSUFFICIENT || v === "Data Unavailable";
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className={`text-xs font-bold ${muted ? "text-slate-400 italic" : "text-slate-800"}`}>{v}</span>
    </div>
  );
}

export default function EvaluationTab({ symbol, market }: { symbol: string; market: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ev, setEv] = useState<any | null>(null);
  const [ai, setAi] = useState<any | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    setAi(null);
    try {
      const res = await fetch("/api/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, market }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Evaluation failed");
      setEv(json.evaluation);
    } catch (e: any) {
      setError(e.message || "Evaluation failed.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (symbol) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const runAi = async () => {
    if (!ev) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiEval: true, evaluation: ev }),
      });
      const json = await res.json();
      setAi(json.aiEval);
    } catch (e: any) {
      setAi({ error: e.message || "AI evaluation failed." });
    } finally {
      setAiLoading(false);
    }
  };

  const exportData = () => {
    if (!ev) return;
    const blob = new Blob([JSON.stringify({ ...ev, aiEvaluation: ai || "Not generated" }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Evaluation_${(symbol || "stock").replace(/\W/g, "_")}_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    if (!ev) return;
    const h = ev.headline || {};
    const sections = [
      {
        title: "Evaluation Summary",
        rows: [
          ["Metric", "Value"],
          ["Composite Rating", `${h.compositeRating ?? "—"} / 100 (${h.compositeLabel})`],
          ["CAN SLIM Score", `${h.canSlimScore ?? "—"} (${h.canSlimPasses} pass)`],
          ["Acc/Dis Grade", h.accDisGrade],
          ["SMR Grade", h.smrGrade],
          ["Beta", h.beta],
          ["Alpha", h.alpha],
        ],
      },
      {
        title: "CAN SLIM Checklist",
        rows: [["Code", "Criterion", "Status", "Value"], ...(ev.canSlim?.criteria || []).map((c: any) => [c.code, c.name, c.status, c.value])],
      },
      {
        title: "Composite Breakdown",
        rows: [["Component", "Weight", "Points", "Note"], ...(ev.composite?.breakdown || []).map((b: any) => [b.component, b.weight, b.points, b.note])],
      },
      {
        title: "Quality (SMR)",
        rows: [["Metric", "Value"], ...Object.entries(ev.smr?.metrics || {}).map(([k, v]) => [k, v as string])],
      },
      {
        title: "Multi-Year Fundamentals",
        rows: [["Year", "Revenue", "Earnings"], ...(ev.multiYear?.years || []).map((y: any) => [y.year, y.revenueDisplay, y.earningsDisplay])],
      },
    ];
    downloadExcel(
      `Evaluation_${(symbol || "stock").replace(/\W/g, "_")}_${new Date().toISOString().split("T")[0]}`,
      `${ev.name || symbol} — Stock Evaluation`,
      sections,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="font-medium text-sm">Building stock evaluation…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          {error}
        </div>
        <button onClick={load} className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold">Retry</button>
      </div>
    );
  }
  if (!ev) return null;

  const h = ev.headline;
  const yearData = (ev.multiYear?.years || []).map((y: any) => ({
    name: String(y.year).slice(-4),
    revenue: y.revenue,
    earnings: y.earnings,
  }));

  return (
    <div className="space-y-5">
      {/* Disclaimer */}
      <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        {ev.disclaimer}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button onClick={runAi} disabled={aiLoading} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50">
          {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          AI Stock Evaluation
          <span className="text-[9px] font-black text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded">PAID</span>
        </button>
        <button onClick={exportData} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
          <Download className="w-3.5 h-3.5" /> Export Evaluation
        </button>
        <button onClick={exportExcel} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
          <Download className="w-3.5 h-3.5" /> Excel
        </button>
      </div>

      {/* Headline ratings */}
      <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 shadow-sm p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
          <div className="sm:border-r border-indigo-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Composite</div>
            <div className="text-3xl font-black text-indigo-700">{h.compositeRating ?? "—"}</div>
            <div className="text-[10px] font-bold text-slate-500">{h.compositeLabel}</div>
          </div>
          <div className="sm:border-r border-indigo-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase">CAN SLIM</div>
            <div className="text-3xl font-black text-slate-800">{h.canSlimScore ?? "—"}</div>
            <div className="text-[10px] font-bold text-slate-500">{h.canSlimPasses} pass</div>
          </div>
          <div className="sm:border-r border-indigo-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Acc/Dis</div>
            <div className={`text-3xl font-black ${gradeColor(h.accDisGrade)}`}>{h.accDisGrade}</div>
            <div className="text-[10px] font-bold text-slate-500">demand grade</div>
          </div>
          <div className="sm:border-r border-indigo-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase">SMR</div>
            <div className={`text-3xl font-black ${gradeColor(h.smrGrade)}`}>{h.smrGrade}</div>
            <div className="text-[10px] font-bold text-slate-500">quality grade</div>
          </div>
          <div className="sm:border-r border-indigo-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Beta</div>
            <div className="text-3xl font-black text-slate-800">{h.beta}</div>
            <div className="text-[10px] font-bold text-slate-500">vs index</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase">Alpha</div>
            <div className="text-2xl font-black text-slate-800">{h.alpha}</div>
            <div className="text-[10px] font-bold text-slate-500">annualized</div>
          </div>
        </div>
      </div>

      {/* AI evaluation result */}
      {ai && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5">
          <h3 className="text-sm font-black text-indigo-700 flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" /> AI Stock Evaluation
          </h3>
          {ai.error ? (
            <div className="text-xs text-slate-500">{ai.error}</div>
          ) : (
            <div className="space-y-3 text-sm text-slate-700">
              {ai.evaluationSummary && <p className="font-medium">{ai.evaluationSummary}</p>}
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ["CAN SLIM", ai.canSlimView],
                  ["Earnings", ai.earningsView],
                  ["Price Strength", ai.priceStrengthView],
                  ["Demand", ai.demandView],
                  ["Group & Market", ai.groupMarketView],
                  ["Quality", ai.qualityView],
                ].filter(([, v]) => v).map(([t, v]) => (
                  <div key={t as string} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1">{t}</div>
                    <div className="text-xs leading-relaxed">{v as string}</div>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <ListBlock title="Key Strengths" items={ai.keyStrengths} tone="emerald" />
                <ListBlock title="Key Weaknesses" items={ai.keyWeaknesses} tone="rose" />
                <ListBlock title="Data Limitations" items={ai.dataLimitations} tone="amber" />
                <ListBlock title="What To Track Next" items={ai.whatToTrackNext} tone="sky" />
              </div>
              {ai.finalEvaluationView && (
                <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 text-xs font-semibold text-indigo-800">{ai.finalEvaluationView}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CAN SLIM Checklist */}
      <Card title="CAN SLIM Checklist" icon={<Award className="w-4 h-4" />} badge={`${ev.canSlim.summaryLabel}`}>
        <div className="grid md:grid-cols-2 gap-3">
          {ev.canSlim.criteria.map((c: any) => {
            const meta = statusMeta[c.status] || statusMeta["Data insufficient"];
            return (
              <div key={c.code} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-black flex items-center justify-center shrink-0">{c.code}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">{c.name}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${meta.color}`}>
                      <meta.Icon className="w-3 h-3" /> {c.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{c.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-[11px] text-slate-400">
          {ev.canSlim.passes} Pass · {ev.canSlim.watches} Watch · {ev.canSlim.fails} Fail · {ev.canSlim.insufficient} insufficient. CAN SLIM® is William O'Neil's growth-stock framework; each line shows the actual computed value.
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Composite breakdown */}
        <Card title="Composite Evaluation Rating" icon={<Gauge className="w-4 h-4" />} badge={`${ev.composite.rating ?? "—"} / 100`}>
          <div className="space-y-2">
            {ev.composite.breakdown.map((b: any) => (
              <div key={b.component} className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">{b.component} <span className="text-slate-400">({b.note})</span></span>
                <span className={`font-bold ${b.available ? "text-slate-800" : "text-slate-400 italic"}`}>{b.points}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Data coverage</span>
            <span className="font-bold text-indigo-600">{ev.composite.coverage}%</span>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 italic">{ev.composite.note}</p>
        </Card>

        {/* SMR + Acc/Dis */}
        <Card title="Quality (SMR) & Demand (Acc/Dis)" icon={<ShieldCheck className="w-4 h-4" />}>
          <div className="flex gap-4 mb-3">
            <div className="text-center flex-1 bg-slate-50 rounded-xl py-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase">SMR Grade</div>
              <div className={`text-2xl font-black ${gradeColor(ev.smr.grade)}`}>{ev.smr.grade}</div>
            </div>
            <div className="text-center flex-1 bg-slate-50 rounded-xl py-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Acc/Dis Grade</div>
              <div className={`text-2xl font-black ${gradeColor(ev.accDis.grade)}`}>{ev.accDis.grade}</div>
            </div>
          </div>
          <Stat label="Sales Growth" value={ev.smr.metrics.salesGrowth} />
          <Stat label="Operating Margin" value={ev.smr.metrics.operatingMargin} />
          <Stat label="Net Margin" value={ev.smr.metrics.netMargin} />
          <Stat label="ROE" value={ev.smr.metrics.roe} />
          <Stat label="Demand Rating" value={ev.accDis.rating} />
          <p className="mt-2 text-[10px] text-slate-400 italic">{ev.smr.detail}</p>
        </Card>

        {/* Alpha / Beta */}
        <Card title="Alpha / Beta" icon={<Activity className="w-4 h-4" />} badge={ev.alphaBeta.indexName}>
          <Stat label="Beta (sensitivity)" value={ev.alphaBeta.beta} />
          <Stat label="Alpha (annualized excess)" value={ev.alphaBeta.alpha} />
          <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">{ev.alphaBeta.detail}</p>
        </Card>

        {/* Multi-year fundamentals */}
        <Card title="Multi-Year Fundamentals" icon={<BarChart3 className="w-4 h-4" />} badge={ev.multiYear.available ? `Rev CAGR ${ev.multiYear.revCagr3y != null ? ev.multiYear.revCagr3y.toFixed(1) + "%" : "n/a"}` : undefined}>
          {ev.multiYear.available && yearData.length > 0 ? (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={yearData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <RechartsTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: any) => Number(v).toLocaleString()} />
                    <Bar dataKey="revenue" name="Revenue" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
                    <Line dataKey="earnings" name="Earnings" stroke="#6366f1" strokeWidth={2} dot />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="text-slate-400 text-left"><th className="py-1 font-bold">Year</th><th className="py-1 font-bold text-right">Revenue</th><th className="py-1 font-bold text-right">Earnings</th></tr></thead>
                  <tbody>
                    {ev.multiYear.years.map((y: any, i: number) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="py-1 font-medium text-slate-600">{y.year}</td>
                        <td className="py-1 text-right font-bold text-slate-800">{y.revenueDisplay}</td>
                        <td className="py-1 text-right font-bold text-slate-800">{y.earningsDisplay}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ev.multiYear.note && <div className="mt-2 text-[10px] text-slate-400 italic">{ev.multiYear.note}</div>}
            </>
          ) : (
            <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              {ev.multiYear.note}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ListBlock({ title, items, tone }: { title: string; items?: string[]; tone: string }) {
  if (!items || items.length === 0) return null;
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
  };
  return (
    <div className={`rounded-xl p-3 border ${tones[tone]}`}>
      <div className="text-[10px] font-black uppercase tracking-wide mb-1">{title}</div>
      <ul className="space-y-1">
        {items.map((it, i) => <li key={i} className="text-xs leading-snug">• {it}</li>)}
      </ul>
    </div>
  );
}
