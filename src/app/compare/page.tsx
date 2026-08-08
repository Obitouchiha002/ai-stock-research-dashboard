"use client";

import React, { useState, useEffect } from "react";
import { GitCompare, Search, Plus, X, BarChart2, Activity } from "lucide-react";
import { getReports, getWatchlist } from "@/lib/storage";
import { useGlobal } from "@/context/GlobalContext";

export default function ComparePage() {
  const { market } = useGlobal();
  const [query, setQuery] = useState("");
  const [symbolsToCompare, setSymbolsToCompare] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Quick-add chips: the user's own watchlist/reports first, else popular
  // names for their market — so a brand-new user has something to click.
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const wl = getWatchlist().map((i) => i.symbol);
    const rp = getReports().map((i) => i.symbol);
    const unique = Array.from(new Set([...wl, ...rp])).filter(Boolean);
    if (unique.length) {
      setSuggestions(unique.slice(0, 5));
      return;
    }
    const isIndia = market === "NSE" || market === "BSE";
    setSuggestions(
      isIndia
        ? ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS"]
        : ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"],
    );
  }, [market]);

  const addSymbol = async (sym: string) => {
    const s = sym.toUpperCase();
    if (symbolsToCompare.includes(s)) return;
    if (symbolsToCompare.length >= 5)
      return alert("Maximum 5 stocks to compare.");

    setSymbolsToCompare([...symbolsToCompare, s]);
    setQuery("");

    // Fetch data for the symbol
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: s, skipAi: true }),
      });
      const json = await res.json();
      if (res.ok && json.stock) {
        setCompareData((prev) => [...prev, json]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const removeSymbol = (sym: string) => {
    setSymbolsToCompare((prev) => prev.filter((s) => s !== sym));
    setCompareData((prev) => prev.filter((d) => d.stock.ticker !== sym));
  };

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <GitCompare className="w-8 h-8 text-indigo-600" /> Compare Stocks
        </h1>
        <p className="text-slate-500 mt-1 font-medium">
          Analyze up to 5 stocks side-by-side.
        </p>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-8 flex flex-col md:flex-row gap-4 items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addSymbol(query);
          }}
          className="relative w-full max-w-md"
        >
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Add symbol to compare (e.g. AAPL)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none w-full"
          />
        </form>
        {suggestions.length > 0 && (
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2">
              Quick Add:
            </span>
            {suggestions.map((sym) => (
              <button
                key={sym}
                onClick={() => addSymbol(sym)}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-md text-xs font-bold transition flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> {sym}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12 text-slate-500 font-bold animate-pulse">
          Fetching data...
        </div>
      )}

      {compareData.length === 0 && !loading ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-12 text-center">
          <GitCompare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-bold">Compare up to 5 stocks side-by-side</p>
          <p className="text-slate-400 text-sm mt-1 mb-5">
            Search a symbol above, or tap a suggestion to start.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {suggestions.map((sym) => (
              <button
                key={sym}
                onClick={() => addSymbol(sym)}
                className="px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-700 rounded-lg text-sm font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> {sym}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[520px] sm:min-w-[800px] text-sm sm:text-base">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-2.5 sm:p-4 text-xs font-bold text-slate-500 uppercase tracking-widest w-24 sm:w-48 sticky left-0 bg-slate-50 z-10">
                  Metric
                </th>
                {compareData.map((d, i) => (
                  <th key={i} className="p-2.5 sm:p-4 min-w-[130px] sm:min-w-[200px]">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-black text-lg text-slate-900">
                          {d.stock.ticker}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[150px]">
                          {d.stock.name}
                        </div>
                      </div>
                      <button
                        onClick={() => removeSymbol(d.stock.ticker)}
                        className="text-slate-300 hover:text-rose-500 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="border-b border-slate-100">
                <td className="p-4 font-bold text-slate-700 bg-slate-50/50 sticky left-0 z-10">
                  Price
                </td>
                {compareData.map((d, i) => (
                  <td
                    key={i}
                    className="p-4 font-mono font-bold text-slate-800"
                  >
                    {d.stock.currentPrice}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-4 font-bold text-slate-700 bg-slate-50/50 sticky left-0 z-10">
                  1D Change
                </td>
                {compareData.map((d, i) => (
                  <td
                    key={i}
                    className={`p-4 font-bold ${d.pricePerformance.oneDay?.startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {d.pricePerformance.oneDay}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-4 font-bold text-slate-700 bg-slate-50/50 sticky left-0 z-10">
                  Market Cap
                </td>
                {compareData.map((d, i) => (
                  <td key={i} className="p-4">
                    {d.stock.marketCap}
                  </td>
                ))}
              </tr>

              <tr className="bg-indigo-50/30">
                <td
                  colSpan={compareData.length + 1}
                  className="p-2 text-xs font-black text-indigo-800 uppercase tracking-widest"
                >
                  Scores
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-4 font-bold text-slate-700 bg-slate-50/50 sticky left-0 z-10">
                  Final Score
                </td>
                {compareData.map((d, i) => (
                  <td key={i} className="p-4 font-black text-lg">
                    {d.final.totalScore}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-4 font-bold text-slate-700 bg-slate-50/50 sticky left-0 z-10">
                  Final View
                </td>
                {compareData.map((d, i) => (
                  <td key={i} className="p-4 font-semibold">
                    {d.final.bias}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-4 font-bold text-slate-700 bg-slate-50/50 sticky left-0 z-10">
                  Risk Level
                </td>
                {compareData.map((d, i) => (
                  <td
                    key={i}
                    className={`p-4 font-bold ${d.risk.riskLevel === "High" ? "text-rose-600" : d.risk.riskLevel === "Low" ? "text-emerald-600" : ""}`}
                  >
                    {d.risk.riskLevel}
                  </td>
                ))}
              </tr>

              <tr className="bg-indigo-50/30">
                <td
                  colSpan={compareData.length + 1}
                  className="p-2 text-xs font-black text-indigo-800 uppercase tracking-widest"
                >
                  Fundamentals
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-4 font-bold text-slate-700 bg-slate-50/50 sticky left-0 z-10">
                  P/E Ratio
                </td>
                {compareData.map((d, i) => (
                  <td key={i} className="p-4">
                    {d.fundamental.pe}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-4 font-bold text-slate-700 bg-slate-50/50 sticky left-0 z-10">
                  Debt/Equity
                </td>
                {compareData.map((d, i) => (
                  <td key={i} className="p-4">
                    {d.fundamental.debtToEquity}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-4 font-bold text-slate-700 bg-slate-50/50 sticky left-0 z-10">
                  ROE
                </td>
                {compareData.map((d, i) => (
                  <td key={i} className="p-4">
                    {d.fundamental.roe}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
