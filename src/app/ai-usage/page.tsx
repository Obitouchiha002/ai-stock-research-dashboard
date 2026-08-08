"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Gauge,
  Cpu,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trash2,
  Sparkles,
  DollarSign,
  RefreshCw,
  Activity,
} from "lucide-react";
import { getAiUsage, getAiBalances, saveAiBalances } from "@/lib/storage";

const PROVIDERS: Record<string, { label: string; role: string; dash: string; color: string }> = {
  claude: { label: "Claude", role: "Reasoning — document analysis & verification", dash: "https://console.anthropic.com/settings/usage", color: "bg-orange-500" },
  openai: { label: "OpenAI", role: "Reasoning — analysis, research notes, import", dash: "https://platform.openai.com/usage", color: "bg-emerald-500" },
  gemini: { label: "Gemini", role: "Middle tier + web grounding", dash: "https://aistudio.google.com/app/apikey", color: "bg-blue-500" },
  groq: { label: "Groq", role: "Fast — chat, digests, portfolio review", dash: "https://console.groq.com/settings/usage", color: "bg-fuchsia-500" },
  perplexity: { label: "Perplexity", role: "Daily Digest — live web + citations", dash: "https://www.perplexity.ai/settings/api", color: "bg-violet-500" },
};

const PROVIDER_BY_NAME: Record<string, string> = { Claude: "claude", OpenAI: "openai", Gemini: "gemini", Groq: "groq", Perplexity: "perplexity" };

// Blended price per 1,000,000 tokens (USD). Free-tier providers cost $0 for you.
// These are estimates for the default models — check each dashboard for exact billing.
const PRICING: Record<string, { perM: number; free: boolean; note: string }> = {
  claude: { perM: 9.0, free: false, note: "claude-opus-4-8 · $5 in / $25 out per 1M (blended at ~80% input)" },
  openai: { perM: 0.3, free: false, note: "gpt-4o-mini · ~$0.15 in / $0.60 out per 1M (blended)" },
  gemini: { perM: 0, free: true, note: "Free tier (paid ≈ $0.10/1M)" },
  groq: { perM: 0, free: true, note: "Free tier" },
  perplexity: { perM: 1.0, free: false, note: "sonar ≈ $1/1M tokens (+ small search fees)" },
};

const FREE_LIMITS: Record<string, string> = {
  gemini: "~1,500 requests/day",
  groq: "~1,000 req & ~100k tokens/day",
};
// Free-tier daily REQUEST caps (for "requests left today").
const FREE_REQ_PER_DAY: Record<string, number> = { gemini: 1500, groq: 1000 };

// Which app features run on a PAID API (so the user knows before using).
const FEATURE_BILLING: { feature: string; provider: string; paid: boolean }[] = [
  { feature: "Stock Analysis (AI report)", provider: "OpenAI", paid: true },
  { feature: "Research Note", provider: "OpenAI", paid: true },
  { feature: "Momentum Deep Dive", provider: "OpenAI", paid: true },
  { feature: "AI Evaluation", provider: "OpenAI", paid: true },
  { feature: "Import Report", provider: "OpenAI", paid: true },
  { feature: "Daily Digest", provider: "Perplexity", paid: true },
  { feature: "AI Research Chat", provider: "Groq", paid: false },
  { feature: "Portfolio Review", provider: "Groq", paid: false },
  { feature: "Document Analysis", provider: "Your chosen analyst model", paid: true },
  { feature: "Document Verification", provider: "Every model you tick — one call each", paid: true },
  { feature: "Document Chat", provider: "Your chosen analyst model", paid: true },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).getTime();
const money = (n: number, cur: "$" | "₹") => `${cur}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;

export default function AiUsagePage() {
  const [events, setEvents] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [scope, setScope] = useState<"today" | "month" | "all">("month");
  // 88 is a fallback, not a live rate — the label below must say which one is
  // in use, otherwise ₹ figures computed from a stale constant read as live.
  const [usdInr, setUsdInr] = useState(88);
  const [rateLive, setRateLive] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});
  // Live rate-limit data pulled straight from each provider's response headers.
  const [limits, setLimits] = useState<any[]>([]);
  const [limitsLoading, setLimitsLoading] = useState(false);
  const [limitsAt, setLimitsAt] = useState<string>("");

  const fetchLimits = () => {
    setLimitsLoading(true);
    fetch("/api/ai/limits")
      .then((r) => r.json())
      .then((j) => { setLimits(j.limits || []); setLimitsAt(j.checkedAt || ""); })
      .catch(() => {})
      .finally(() => setLimitsLoading(false));
  };

  const reload = () => { setEvents(getAiUsage()); setBalances(getAiBalances()); };
  useEffect(() => {
    reload();
    fetchLimits();
    fetch("/api/gemini/file-status")
      .then((r) => r.json())
      .then(setStatus)
      // Leaves `status` null; the provider cards below already render an
      // "unknown" state rather than claiming a provider is configured.
      .catch(() => setStatus(null));
    // live USD/INR
    fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: ["INR=X"] }) })
      .then((r) => r.json()).then((j) => { const p = j.quotes?.["INR=X"]?.price; if (p) { setUsdInr(p); setRateLive(true); } }).catch(() => {});
  }, []);

  const now = new Date();
  const scopeStart = scope === "today" ? startOfDay(now) : scope === "month" ? startOfMonth(now) : 0;
  const scoped = useMemo(() => events.filter((e) => e.at >= scopeStart), [events, scopeStart]);

  const costUsd = (providerKey: string, tokens: number) => (tokens / 1e6) * (PRICING[providerKey]?.perM ?? 0);

  // per-provider aggregation for the active scope
  const byProvider = useMemo(() => {
    const m: Record<string, { calls: number; tokens: number }> = {};
    scoped.forEach((e) => {
      const k = PROVIDER_BY_NAME[e.provider] || e.provider.toLowerCase();
      if (!m[k]) m[k] = { calls: 0, tokens: 0 };
      m[k].calls += 1;
      m[k].tokens += e.tokens || 0;
    });
    return m;
  }, [scoped]);

  const byFeature = useMemo(() => {
    const m: Record<string, { calls: number; tokens: number; usd: number }> = {};
    scoped.forEach((e) => {
      const k = PROVIDER_BY_NAME[e.provider] || e.provider.toLowerCase();
      if (!m[e.feature]) m[e.feature] = { calls: 0, tokens: 0, usd: 0 };
      m[e.feature].calls += 1;
      m[e.feature].tokens += e.tokens || 0;
      m[e.feature].usd += costUsd(k, e.tokens || 0);
    });
    return Object.entries(m).sort((a, b) => b[1].usd - a[1].usd || b[1].calls - a[1].calls);
  }, [scoped]);

  const totalUsd = useMemo(() => Object.entries(byProvider).reduce((s, [k, v]) => s + costUsd(k, v.tokens), 0), [byProvider]);
  const totalTokens = useMemo(() => scoped.reduce((s, e) => s + (e.tokens || 0), 0), [scoped]);

  // All-time tokens per provider (for "used by app" against the entered balance).
  const allTimeTokens = useMemo(() => {
    const m: Record<string, number> = {};
    events.forEach((e) => {
      const k = PROVIDER_BY_NAME[e.provider] || e.provider.toLowerCase();
      m[k] = (m[k] || 0) + (e.tokens || 0);
    });
    return m;
  }, [events]);

  // Today's requests per provider (for free-tier "requests left today").
  const todayReq = useMemo(() => {
    const m: Record<string, number> = {};
    events.filter((e) => e.at >= startOfDay(now)).forEach((e) => {
      const k = PROVIDER_BY_NAME[e.provider] || e.provider.toLowerCase();
      m[k] = (m[k] || 0) + 1;
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const setBalance = (key: string, val: number) => {
    const next = { ...balances, [key]: val };
    setBalances(next);
    saveAiBalances(next);
  };

  const clearLog = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem("sa_ai_usage");
    reload();
  };

  const scopeLabel = scope === "today" ? "today" : scope === "month" ? "this month" : "all time";

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Gauge className="w-8 h-8 text-indigo-600" /> AI Usage &amp; Cost
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Real tokens used through this app, converted to $ and ₹{" "}
            ({rateLive ? "live rate" : "fallback rate — live FX unavailable"} ₹{usdInr.toFixed(2)}/$).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {(["today", "month", "all"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${scope === s ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}>
                {s === "today" ? "Today" : s === "month" ? "This month" : "All time"}
              </button>
            ))}
          </div>
          <button onClick={clearLog} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-rose-600 flex items-center gap-1">
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      </div>

      {/* Live API limits (real data from provider headers) */}
      <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" /> Live API limits
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">REAL</span>
          </h3>
          <button onClick={fetchLimits} disabled={limitsLoading} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${limitsLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          Actual requests &amp; tokens left in each provider&apos;s current rate-limit window, read live from the API response headers.
          {" "}Providers don&apos;t expose account $ balance over the API — for that, use the manual balance below.
        </p>
        {limits.length === 0 ? (
          <p className="text-[12px] text-slate-400 py-2">{limitsLoading ? "Checking providers…" : "No configured providers to check."}</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {limits.map((l: any) => {
              const meta = PROVIDERS[l.provider] || { label: l.provider, color: "bg-slate-400" };
              const bar = (rem: number | null, lim: number | null) => {
                if (rem == null || !lim) return null;
                const pct = Math.max(2, Math.min(100, (rem / lim) * 100));
                const low = pct < 20;
                return (
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${low ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                );
              };
              return (
                <div key={l.provider} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${meta.color}`} />
                    <span className="text-[13px] font-black text-slate-800">{meta.label}</span>
                  </div>
                  {l.ok ? (
                    <div className="space-y-2">
                      {l.reqRemaining != null && (
                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-0.5"><span>Requests left</span><span className="tabular-nums text-slate-700">{l.reqRemaining.toLocaleString()}{l.reqLimit ? ` / ${l.reqLimit.toLocaleString()}` : ""}</span></div>
                          {bar(l.reqRemaining, l.reqLimit)}
                        </div>
                      )}
                      {l.tokRemaining != null && (
                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-0.5"><span>Tokens left</span><span className="tabular-nums text-slate-700">{l.tokRemaining.toLocaleString()}{l.tokLimit ? ` / ${l.tokLimit.toLocaleString()}` : ""}</span></div>
                          {bar(l.tokRemaining, l.tokLimit)}
                        </div>
                      )}
                      {l.reqReset && <div className="text-[10px] text-slate-400">resets in {l.reqReset}</div>}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">{l.note || "Live limits not available."}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {limitsAt && <p className="text-[10px] text-slate-300 mt-3">Checked {new Date(limitsAt).toLocaleTimeString()}</p>}
      </div>

      {/* Cost tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Cost ({scopeLabel})</div>
          <div className="text-3xl font-black text-emerald-600">{money(totalUsd, "$")}</div>
          <div className="text-sm font-bold text-slate-500">≈ {money(totalUsd * usdInr, "₹")}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Tokens ({scopeLabel})</div>
          <div className="text-3xl font-black text-slate-900">{totalTokens.toLocaleString()}</div>
          <div className="text-xs text-slate-400">real tokens consumed</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">AI actions ({scopeLabel})</div>
          <div className="text-3xl font-black text-slate-900">{scoped.length}</div>
          <div className="text-xs text-slate-400">requests made</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Providers</div>
          <div className="text-3xl font-black text-slate-900">
            {status ? status.configuredCount ?? Object.values(status.providers || {}).filter((p: any) => p.configured).length : "—"}
          </div>
          <div className="text-xs text-slate-400">configured</div>
        </div>
      </div>

      {/* Cost by provider */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-6">
        <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-600" /> Cost by provider ({scopeLabel})
        </h3>
        <div className="overflow-x-auto">
          <table className="sa-table">
            <thead>
              <tr className="text-slate-400 text-xs">
                <th className="text-left font-bold py-2">Provider</th>
                <th className="text-right font-bold py-2">Tokens</th>
                <th className="text-right font-bold py-2">Rate /1M</th>
                <th className="text-right font-bold py-2">Cost ($)</th>
                <th className="text-right font-bold py-2">Cost (₹)</th>
                <th className="text-right font-bold py-2"></th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(PROVIDERS).map((key) => {
                const meta = PROVIDERS[key];
                const v = byProvider[key] || { calls: 0, tokens: 0 };
                const usd = costUsd(key, v.tokens);
                const p = PRICING[key];
                return (
                  <tr key={key} className="border-t border-slate-100">
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-2 font-bold text-slate-800">
                        <span className={`w-2.5 h-2.5 rounded-full ${meta.color}`} /> {meta.label}
                      </span>
                      <span className="block text-[10px] text-slate-400">{v.calls} actions</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-700">{v.tokens.toLocaleString()}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-500">{p.free ? "Free" : `$${p.perM.toFixed(2)}`}</td>
                    <td className="py-2.5 text-right tabular-nums font-bold text-slate-900">{p.free ? "$0.00" : money(usd, "$")}</td>
                    <td className="py-2.5 text-right tabular-nums font-bold text-slate-600">{p.free ? "₹0.00" : money(usd * usdInr, "₹")}</td>
                    <td className="py-2.5 text-right">
                      <a href={meta.dash} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-xs font-bold inline-flex items-center gap-0.5">
                        Usage <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-slate-200 font-black">
                <td className="py-2.5 text-slate-800">Total</td>
                <td className="py-2.5 text-right tabular-nums">{totalTokens.toLocaleString()}</td>
                <td></td>
                <td className="py-2.5 text-right tabular-nums text-emerald-600">{money(totalUsd, "$")}</td>
                <td className="py-2.5 text-right tabular-nums text-emerald-600">{money(totalUsd * usdInr, "₹")}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-slate-400 italic">
          Cost = tokens × provider rate (estimated for default models). Gemini &amp; Groq are on your free tier, so $0.
          Exact billing is on each provider&apos;s dashboard.
        </p>
      </div>

      {/* Balance & remaining */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-6">
        <h3 className="text-sm font-black text-slate-800 mb-1">Balance &amp; remaining limit</h3>
        <p className="text-xs text-slate-400 mb-4">
          Providers don&apos;t share remaining balance over the API — enter the balance you loaded and this app subtracts
          what it spent. Free providers show requests left today.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* paid providers: balance - used = remaining */}
          {["claude", "openai", "perplexity"].map((key) => {
            const meta = PROVIDERS[key];
            const used = costUsd(key, allTimeTokens[key] || 0);
            const bal = balances[key] || 0;
            const remaining = Math.max(0, bal - used);
            const pct = bal > 0 ? Math.min(100, (used / bal) * 100) : 0;
            return (
              <div key={key} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${meta.color}`} /> {meta.label}
                    <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">PAID</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    Balance $
                    <input type="number" min={0} value={bal || ""} placeholder="0"
                      onChange={(e) => setBalance(key, Number(e.target.value) || 0)}
                      className="w-16 px-2 py-0.5 border border-slate-200 rounded text-xs text-right outline-none focus:ring-2 focus:ring-indigo-500" />
                  </span>
                </div>
                <div className="flex items-end justify-between mb-1.5">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Remaining</div>
                    <div className="text-xl font-black text-emerald-600">{bal > 0 ? money(remaining, "$") : "—"}</div>
                    {bal > 0 && <div className="text-xs font-bold text-slate-500">≈ {money(remaining * usdInr, "₹")}</div>}
                  </div>
                  <div className="text-right text-[11px] text-slate-400">used by app<br /><b className="text-slate-600">{money(used, "$")}</b></div>
                </div>
                {bal > 0 && (
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct > 80 ? "bg-rose-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          {/* free providers: requests left today */}
          {["gemini", "groq"].map((key) => {
            const meta = PROVIDERS[key];
            const cap = FREE_REQ_PER_DAY[key];
            const used = todayReq[key] || 0;
            const left = Math.max(0, cap - used);
            const pct = Math.min(100, (used / cap) * 100);
            return (
              <div key={key} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${meta.color}`} /> {meta.label}
                    <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">FREE</span>
                  </span>
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Requests left today</div>
                <div className="text-xl font-black text-slate-900">{left.toLocaleString()} <span className="text-sm text-slate-400 font-bold">/ {cap.toLocaleString()}</span></div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                  <div className={`h-full rounded-full ${pct > 80 ? "bg-rose-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Which tools cost money */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-black text-slate-800 mb-1">Which tools cost money?</h3>
          <p className="text-xs text-slate-400 mb-3">Think before running the paid ones.</p>
          <div className="space-y-1.5">
            {FEATURE_BILLING.map((f) => (
              <div key={f.feature} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                <span className="font-bold text-slate-700">{f.feature}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">{f.provider}</span>
                  {f.paid ? (
                    <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">PAID</span>
                  ) : (
                    <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">FREE</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Cost by feature */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" /> Cost by feature ({scopeLabel})
          </h3>
          {byFeature.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No AI usage yet {scopeLabel === "today" ? "today" : ""}. Use Analyze / Daily Digest / AI Chat and it&apos;ll show here.</p>
          ) : (
            <div className="space-y-2.5">
              {byFeature.map(([feat, v]) => (
                <div key={feat} className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-700">{feat}</span>
                  <span className="text-slate-500 tabular-nums text-xs">
                    {v.calls}× · {v.tokens.toLocaleString()} tok · <b className="text-slate-800">{money(v.usd, "$")}</b> / {money(v.usd * usdInr, "₹")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Provider status + free limits */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <h3 className="text-sm font-black text-slate-800 mb-1 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-indigo-600" /> Providers &amp; limits
        </h3>
        <p className="text-xs text-slate-500 mb-4">Exact remaining balance/quota lives on each provider&apos;s dashboard.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(PROVIDERS).map(([key, meta]) => {
            const configured = status?.providers?.[key]?.configured;
            return (
              <div key={key} className="flex items-start justify-between gap-3 p-3 border border-slate-100 rounded-xl">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${meta.color}`} />
                    <span className="font-black text-slate-800">{meta.label}</span>
                    {status && (configured ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600"><CheckCircle2 className="w-3 h-3" /> set</span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-400"><XCircle className="w-3 h-3" /> not set</span>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{meta.role}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {PRICING[key].free ? `Free tier · ${FREE_LIMITS[key] || "no daily cap set"}` : PRICING[key].note}
                  </div>
                </div>
                <a href={meta.dash} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                  Dashboard <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-[11px] text-slate-400 italic">
        Tokens are tracked per AI action in this app (this device). $/₹ costs are estimates from provider token pricing —
        check each provider&apos;s dashboard for exact billing. Token tracking started when this feature was added, so
        older actions may show no tokens.
      </p>
    </div>
  );
}
