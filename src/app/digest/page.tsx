"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Newspaper,
  RefreshCw,
  Sparkles,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  Clock,
  AlertTriangle,
  Activity,
  Star,
  Briefcase,
} from "lucide-react";
import {
  getWatchlist,
  getPortfolio,
  getDigestResult,
  saveDigestResult,
  getDigestSelection,
  saveDigestSelection,
  logAiUsageDetailed,
} from "@/lib/storage";

type Candidate = { symbol: string; name: string; sources: string[] };

function agoLabel(iso: string) {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DigestPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    // Candidate stocks = unique symbols across BOTH watchlists and portfolio,
    // each tagged with where it came from.
    const map = new Map<string, Candidate>();
    const add = (symbol: string, name: string, src: string) => {
      if (!symbol) return;
      const key = symbol.toUpperCase();
      const existing = map.get(key);
      if (existing) {
        if (!existing.sources.includes(src)) existing.sources.push(src);
        if (existing.name === existing.symbol && name) existing.name = name;
      } else {
        map.set(key, { symbol: key, name: name || key, sources: [src] });
      }
    };
    getWatchlist().forEach((w: any) => add(w.symbol, w.name || w.symbol, "Watchlist"));
    getPortfolio().forEach((h: any) => add(h.symbol, h.name || h.symbol, "Portfolio"));
    const cands = Array.from(map.values());
    setCandidates(cands);

    const savedSel = getDigestSelection();
    setSelected(savedSel.length ? savedSel : cands.slice(0, 8).map((c) => c.symbol));
    setResult(getDigestResult());
  }, []);

  const toggle = (symbol: string) => {
    setSelected((cur) =>
      cur.includes(symbol) ? cur.filter((s) => s !== symbol) : [...cur, symbol],
    );
  };

  const addManual = () => {
    const sym = manual.trim().toUpperCase();
    if (!sym) return;
    if (!candidates.some((c) => c.symbol === sym)) {
      setCandidates((c) => [...c, { symbol: sym, name: sym, sources: ["Manual"] }]);
    }
    setSelected((cur) => (cur.includes(sym) ? cur : [...cur, sym]));
    setManual("");
  };

  // Quick-select helpers
  const selectFrom = (src: string) =>
    setSelected(candidates.filter((c) => c.sources.includes(src)).map((c) => c.symbol));
  const selectAll = () => setSelected(candidates.map((c) => c.symbol));
  const clearSel = () => setSelected([]);
  const hasWatchlist = candidates.some((c) => c.sources.includes("Watchlist"));
  const hasPortfolio = candidates.some((c) => c.sources.includes("Portfolio"));

  const runDigest = async () => {
    if (selected.length === 0) return;
    setLoading(true);
    saveDigestSelection(selected);
    try {
      const stocks = selected.map((symbol) => ({
        symbol,
        name: candidates.find((c) => c.symbol === symbol)?.name || symbol,
      }));
      const res = await fetch("/api/daily-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stocks }),
      });
      const j = await res.json();
      if (j.digests) {
        saveDigestResult(j);
        setResult(j);
        logAiUsageDetailed("Daily Digest", j.usage ?? { tokens: j.aiTokens }, j.usedPerplexity ? "Perplexity" : undefined);
      }
    } catch {
      /* keep previous result */
    } finally {
      setLoading(false);
    }
  };

  const digests = result?.digests || [];
  const hasKey = result?.usedPerplexity;

  const movers = useMemo(() => {
    return [...digests].sort(
      (a: any, b: any) => Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0),
    );
  }, [digests]);

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Newspaper className="w-8 h-8 text-indigo-600" /> Daily Digest
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            What changed in the last 24 hours for the stocks you track.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {result?.generatedAt && (
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Updated {agoLabel(result.generatedAt)}
            </span>
          )}
          <button
            onClick={runDigest}
            disabled={loading || selected.length === 0}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Run Digest
            <span className="text-[9px] font-black text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded">PAID</span>
          </button>
        </div>
      </div>

      {/* Source banner */}
      {result && !hasKey && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Using Yahoo news + AI summary. Add a <b className="mx-1">PERPLEXITY_API_KEY</b> for sharper live web
          research with citations.
        </div>
      )}

      {/* Stock selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h3 className="text-sm font-black text-slate-700">Tracked stocks ({selected.length} selected)</h3>
          <div className="flex items-center gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addManual()}
              placeholder="Add symbol e.g. AAPL"
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-44"
            />
            <button
              onClick={addManual}
              className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-700"
              title="Add"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick-select from Watchlist / Portfolio */}
        {candidates.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="text-xs font-bold text-slate-400 self-center">Quick select:</span>
            <button onClick={selectAll} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
              All ({candidates.length})
            </button>
            {hasWatchlist && (
              <button onClick={() => selectFrom("Watchlist")} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center gap-1">
                <Star className="w-3 h-3" /> Watchlist
              </button>
            )}
            {hasPortfolio && (
              <button onClick={() => selectFrom("Portfolio")} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-1">
                <Briefcase className="w-3 h-3" /> Portfolio
              </button>
            )}
            <button onClick={clearSel} className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-700">
              Clear
            </button>
          </div>
        )}

        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">
            No stocks yet. Add symbols above, or build a{" "}
            <Link href="/watchlist" className="text-indigo-600 font-bold underline">
              watchlist
            </Link>{" "}
            or{" "}
            <Link href="/portfolio" className="text-indigo-600 font-bold underline">
              portfolio
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => {
              const on = selected.includes(c.symbol);
              const inPortfolio = c.sources.includes("Portfolio");
              const inWatchlist = c.sources.includes("Watchlist");
              return (
                <button
                  key={c.symbol}
                  onClick={() => toggle(c.symbol)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    on
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-500 border border-slate-200 hover:border-indigo-300"
                  }`}
                  title={`${c.name} · ${c.sources.join(", ")}`}
                >
                  {/* source dots */}
                  {inWatchlist && <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-amber-300" : "bg-amber-400"}`} />}
                  {inPortfolio && <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-blue-300" : "bg-blue-500"}`} />}
                  {c.symbol}
                  {on && <X className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Empty state */}
      {digests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <Newspaper className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No digest yet</h3>
          <p className="text-slate-500 mb-6 font-medium">
            Pick your stocks above and hit <b>Run Digest</b> to see what changed in the last 24 hours.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {movers.map((d: any) => {
            const up = (d.changePct || 0) >= 0;
            return (
              <div key={d.symbol} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                {/* card header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className="text-lg font-black text-slate-900 leading-tight">
                      {d.name}
                      <span className="ml-2 text-sm text-slate-400 font-bold">{d.symbol}</span>
                    </div>
                    {d.price != null && (
                      <div className="text-lg font-bold tabular-nums text-slate-700 mt-0.5">
                        {d.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                  {d.changePct != null && (
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-base font-black ${
                        up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {up ? "+" : ""}
                      {d.changePct.toFixed(2)}%
                    </span>
                  )}
                </div>

                {/* what changed — the important points, up top */}
                {d.bullets && d.bullets.length > 0 ? (
                  <div className="mb-4">
                    <div className="text-[11px] font-black uppercase tracking-wide text-indigo-500 mb-2.5">
                      What changed · last 24h
                    </div>
                    {/* main point — highlighted */}
                    <div className="flex items-start gap-2.5 mb-2.5 bg-indigo-50/70 border border-indigo-100 rounded-xl px-3.5 py-3">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 mt-2 shrink-0" />
                      <p className="text-[15px] font-bold text-slate-900 leading-relaxed">{d.bullets[0]}</p>
                    </div>
                    {/* supporting points */}
                    {d.bullets.length > 1 && (
                      <ul className="space-y-2.5 pl-1">
                        {d.bullets.slice(1, 5).map((b: string, i: number) => (
                          <li key={i} className="flex items-start gap-2.5 text-[15px] text-slate-700 leading-relaxed">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2.5 shrink-0" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="text-[15px] text-slate-500 mb-4 leading-relaxed">{d.summary}</p>
                )}

                {/* source badge + citations + analyze */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${
                      d.source === "perplexity"
                        ? "bg-violet-50 text-violet-700"
                        : d.source === "ai-news"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {d.source === "perplexity"
                      ? "Perplexity live web"
                      : d.source === "ai-news"
                        ? "AI + Yahoo news"
                        : d.source === "news-only"
                          ? "Yahoo news"
                          : "No material news"}
                  </span>
                  {d.citations && d.citations.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {d.citations.slice(0, 5).map((c: string, i: number) => (
                        <a
                          key={i}
                          href={c}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded hover:bg-violet-100"
                        >
                          [{i + 1}]
                        </a>
                      ))}
                    </div>
                  )}
                  <Link
                    href={`/analyze?symbol=${d.symbol}`}
                    className="ml-auto text-xs font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1"
                  >
                    <Activity className="w-3.5 h-3.5" /> Analyze
                  </Link>
                </div>

                {/* news links */}
                {d.news && d.news.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">Latest headlines</div>
                    {d.news.slice(0, 4).map((n: any, i: number) => (
                      <a
                        key={i}
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 text-sm text-slate-600 hover:text-indigo-600 group leading-snug"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-300 group-hover:text-indigo-500" />
                        <span className="flex-1">
                          {n.title}
                          <span className="text-slate-400 ml-1">
                            · {n.source} {n.timeAgo && `· ${n.timeAgo}`}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {result?.disclaimer && (
        <p className="mt-6 text-[11px] text-slate-400 italic">{result.disclaimer}</p>
      )}
    </div>
  );
}
