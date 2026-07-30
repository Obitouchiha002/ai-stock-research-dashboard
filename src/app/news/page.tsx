"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Newspaper,
  ExternalLink,
  Search,
  RefreshCw,
  Sparkles,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

const sentimentMeta: Record<string, { color: string; Icon: any }> = {
  Positive: { color: "text-emerald-600 bg-emerald-50 border-emerald-200", Icon: TrendingUp },
  Negative: { color: "text-rose-600 bg-rose-50 border-rose-200", Icon: TrendingDown },
  Neutral: { color: "text-slate-500 bg-slate-50 border-slate-200", Icon: Minus },
};
const impactColor: Record<string, string> = {
  High: "bg-rose-100 text-rose-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-slate-100 text-slate-500",
};

export default function NewsPage() {
  const [mode, setMode] = useState<"market" | "stock">("market");
  const [market, setMarket] = useState("US");
  const [query, setQuery] = useState("");
  const [activeSymbol, setActiveSymbol] = useState("");
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setAiSummary("");
    try {
      const url =
        mode === "stock" && activeSymbol
          ? `/api/news?symbol=${encodeURIComponent(activeSymbol)}`
          : `/api/news?market=${market}`;
      const res = await fetch(url);
      const json = await res.json();
      setNews(json.articles || []);
      setMessage(json.message || "");
    } catch (e: any) {
      setNews([]);
      setMessage("Could not load news. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [mode, market, activeSymbol]);

  useEffect(() => {
    // Market news loads immediately — no watchlist needed.
    if (mode === "market" || (mode === "stock" && activeSymbol)) fetchNews();
  }, [mode, market, activeSymbol, fetchNews]);

  const searchStock = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const s = query.trim().toUpperCase();
    if (!s) return;
    setMode("stock");
    setActiveSymbol(s);
  };

  const runAiSummary = async () => {
    if (news.length === 0) return;
    setAiLoading(true);
    setAiSummary("");
    try {
      const headlines = news.slice(0, 15).map((n) => `- ${n.title} (${n.source}, ${n.sentiment})`).join("\n");
      const scope = mode === "stock" ? `${activeSymbol} stock` : `the ${market} market`;
      const prompt = `You are a financial news analyst. Summarize ONLY these fetched headlines about ${scope}. Do NOT invent news. No buy/sell advice, no price predictions. Use research language. In 4-6 sentences cover: overall tone, key positive developments, key risks/negatives, and what to track next. If headlines are thin, say so.\n\nHEADLINES:\n${headlines}`;
      const res = await fetch("/api/gemini/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      setAiSummary(json.text || json.error || "AI summary unavailable.");
    } catch {
      setAiSummary("AI summary unavailable right now.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Newspaper className="w-8 h-8 text-indigo-600" /> Live News
        </h1>
        <p className="text-slate-500 mt-1 font-medium">
          Current market news — no watchlist needed. Search any stock for its own news.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
        {/* Mode toggle */}
        <div className="inline-flex bg-slate-100 rounded-xl p-1 self-start">
          <button
            onClick={() => setMode("market")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === "market" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
          >
            Market News
          </button>
          <button
            onClick={() => setMode("stock")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === "stock" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
          >
            Stock News
          </button>
        </div>

        {mode === "market" ? (
          <div className="inline-flex bg-slate-100 rounded-xl p-1 self-start">
            {["US", "IN"].map((mk) => (
              <button
                key={mk}
                onClick={() => setMarket(mk)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${market === mk ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
              >
                {mk === "US" ? "🇺🇸 US" : "🇮🇳 India"}
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={searchStock} className="flex gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter symbol e.g. AAPL, RELIANCE.NS"
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700">
              Search
            </button>
          </form>
        )}

        <div className="flex gap-2 lg:ml-auto">
          <button
            onClick={fetchNews}
            disabled={loading || (mode === "stock" && !activeSymbol)}
            className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={runAiSummary}
            disabled={aiLoading || news.length === 0}
            className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50"
          >
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AI News Summary
          </button>
        </div>
      </div>

      {/* AI summary */}
      {aiSummary && (
        <div className="mb-6 bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-black text-indigo-700 flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" /> AI News Summary
            <span className="text-[10px] font-bold text-slate-400 normal-case">
              {mode === "stock" ? activeSymbol : `${market} market`}
            </span>
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
          <p className="mt-2 text-[10px] text-slate-400 italic">
            Research support only. Not buy/sell advice. Summarized from fetched headlines.
          </p>
        </div>
      )}

      {/* News grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-500 mb-3" />
          <p className="font-medium text-sm">Loading live news…</p>
        </div>
      ) : news.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-500 font-medium shadow-sm">
          {message || (mode === "stock" ? "Search a stock symbol to see its news." : "No news available right now.")}
        </div>
      ) : (
        <>
          {message && <div className="mb-3 text-xs text-amber-600 font-medium">{message}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {news.map((n, i) => {
              const sm = sentimentMeta[n.sentiment] || sentimentMeta.Neutral;
              // A single coloured left accent conveys sentiment at a glance —
              // clearer than a row of four competing badges.
              const accent =
                n.sentiment === "Positive" ? "border-l-emerald-500"
                : n.sentiment === "Negative" ? "border-l-rose-500"
                : "border-l-slate-300";
              return (
                <a
                  key={i}
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`bg-white border border-slate-200 border-l-4 ${accent} rounded-xl p-4 sm:p-5 hover:shadow-md hover:border-indigo-200 transition group flex flex-col`}
                >
                  {/* headline first — it's what the reader is here for */}
                  <h3 className="text-[15px] sm:text-[16px] font-black text-slate-900 leading-snug group-hover:text-indigo-600 transition line-clamp-3">
                    {n.title}
                  </h3>

                  {/* one meta row: sentiment + symbol/category, muted */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    <span className={`text-[11px] font-black inline-flex items-center gap-1 ${sm.color.split(" ").filter((c: string) => c.startsWith("text-")).join(" ") || "text-slate-500"}`}>
                      <sm.Icon className="w-3.5 h-3.5" /> {n.sentiment}
                    </span>
                    {n.symbol && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-[11px] font-black text-indigo-600 uppercase tracking-wide">{n.symbol}</span>
                      </>
                    )}
                    {n.category && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-[11px] font-bold text-slate-400">{n.category}</span>
                      </>
                    )}
                  </div>

                  <div className="mt-auto pt-3 flex items-center justify-between text-[12px]">
                    <span className="font-bold text-slate-500 truncate pr-2">
                      {n.source}{n.timeAgo ? ` · ${n.timeAgo}` : ""}
                    </span>
                    <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition shrink-0" />
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
