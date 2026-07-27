"use client";

import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Sparkles, Search, X, Loader2, BarChart3 } from "lucide-react";
import { getReports, getRecentSearches, logAiUsageDetailed } from "@/lib/storage";

export default function AiChatPage() {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; content: string }[]>([
    {
      role: "ai",
      content:
        "Hi! I'm StockAnalytix AI. Set a stock above and I'll answer questions using its live computed momentum, fundamentals, and technicals — in research language (no buy/sell advice).",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Stock context (RAG over our own computed data)
  const [symbolInput, setSymbolInput] = useState("");
  const [ctxSymbol, setCtxSymbol] = useState("");
  const [ctx, setCtx] = useState<any | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [ctxError, setCtxError] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const suggestions = [...new Set([
    ...getRecentSearches().map((r: any) => r.symbol),
    ...getReports().map((r: any) => r.symbol),
  ])].slice(0, 6);

  const setStockContext = async (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setCtxLoading(true);
    setCtxError("");
    setCtx(null);
    try {
      const res = await fetch("/api/momentum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: s, market: s.endsWith(".NS") || s.endsWith(".BO") ? "IN" : "US" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load stock");
      setCtx(json.momentum);
      setCtxSymbol(json.momentum?.symbol || s);
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: `Loaded ${json.momentum?.name || s} (${json.momentum?.symbol || s}). Momentum view: ${json.momentum?.snapshot?.finalMomentumView}. Ask me anything about it.` },
      ]);
    } catch (e: any) {
      setCtxError(e.message || "Could not load stock context.");
    } finally {
      setCtxLoading(false);
    }
  };

  const buildContext = () => {
    if (!ctx) return "No specific stock is loaded. Answer generally and suggest the user load a stock for data-grounded answers.";
    const m = ctx;
    return JSON.stringify({
      name: m.name,
      symbol: m.symbol,
      snapshot: m.snapshot,
      priceStrength: m.priceStrength?.rating,
      returns: m.priceStrength?.returnsDisplay,
      buyerDemand: m.buyerDemand?.rating,
      sector: m.sectorRank,
      quarterlyEps: m.quarterlyEps?.trendLabel,
      quarterlySales: m.quarterlySales?.trendLabel,
      forwardPe: m.forwardValuation,
      quality: m.qualityRatios,
      cashFlow: m.cashFlow,
      shortTermSetup: m.shortTermSetup,
      scenarios: m.scenarios?.scenarios?.map((s: any) => ({ t: s.title, status: s.status })),
      company: m.company,
      news: m.news,
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const reports = getReports().slice(0, 3).map((r: any) => ({ symbol: r.symbol }));
      const prompt = `You are StockAnalytix's research assistant. Answer the user's question using ONLY the data provided.

RULES:
- Research support only. NO buy/sell advice. NO price predictions or guaranteed targets.
- Use ONLY the provided data; if something isn't in the data, say it's not available.
- Use research language ("momentum improving", "watch for confirmation", "risk elevated", etc.). Be concise and specific.
${ctx ? `- The user is asking about ${ctx.name} (${ctx.symbol}). Ground every answer in this data.` : ""}

LOADED STOCK DATA: ${buildContext()}
RECENTLY ANALYZED: ${JSON.stringify(reports)}

User question: ${userMessage}`;

      const res = await fetch("/api/gemini/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (res.ok && data.text) {
        setMessages((prev) => [...prev, { role: "ai", content: data.text }]);
        logAiUsageDetailed("AI Chat", data.usage ?? { tokens: data.aiTokens });
      } else throw new Error(data.error || "Failed");
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Sorry, I couldn't process that right now. Please try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-screen-md mx-auto px-4 py-8 h-[calc(100vh-80px)] flex flex-col">
      <div className="mb-4 shrink-0">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <MessageSquare className="w-8 h-8 text-indigo-600" /> AI Research Chat
        </h1>
        <p className="text-slate-500 mt-1 font-medium">
          Stock-aware Q&A grounded in live computed data.
        </p>
      </div>

      {/* Stock context bar */}
      <div className="shrink-0 mb-3 bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
        <form
          onSubmit={(e) => { e.preventDefault(); setStockContext(symbolInput); }}
          className="flex gap-2 items-center"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              placeholder="Load a stock for data-grounded answers, e.g. AAPL, RELIANCE.NS"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"
            />
          </div>
          <button type="submit" disabled={ctxLoading} className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
            {ctxLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
            Set
          </button>
        </form>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {ctxSymbol && ctx ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
              Context: {ctxSymbol} · {ctx.snapshot?.finalMomentumView}
              <button onClick={() => { setCtx(null); setCtxSymbol(""); }} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">No stock loaded — answers will be general.</span>
          )}
          {suggestions.map((s) => (
            <button key={s} onClick={() => { setSymbolInput(s); setStockContext(s); }} className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded hover:bg-indigo-50 hover:text-indigo-600">
              {s}
            </button>
          ))}
        </div>
        {ctxError && <div className="mt-1 text-[11px] text-rose-600">{ctxError}</div>}
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-5 py-3 ${msg.role === "user" ? "bg-indigo-600 text-white rounded-br-none" : "bg-slate-100 text-slate-800 rounded-bl-none"}`}>
                {msg.role === "ai" && <Sparkles className="w-4 h-4 text-indigo-600 mb-2" />}
                <div className="text-sm font-medium whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-5 py-4 bg-slate-100 rounded-bl-none flex gap-1 items-center">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-slate-100">
          {ctx && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {["Why this momentum view?", "What are the key risks?", "Is it extended?", "What should I track next?"].map((q) => (
                <button key={q} onClick={() => setInput(q)} className="text-[10px] font-semibold px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-indigo-50">
                  {q}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={handleSend} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ctx ? `Ask about ${ctxSymbol}…` : "Ask a question…"}
              className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button type="submit" disabled={!input.trim() || loading} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="mt-2 text-center text-[10px] text-slate-400 font-medium">
            Research support only. Not buy/sell advice. AI can make mistakes — verify data independently.
          </div>
        </div>
      </div>
    </div>
  );
}
