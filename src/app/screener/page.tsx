"use client";

import React, { useState, useEffect } from "react";
import { Filter, Search, ChevronRight, BarChart2 } from "lucide-react";
import Link from "next/link";
import { getWatchlist, getReports, getRecentSearches } from "@/lib/storage";

export default function ScreenerPage() {
  const [universe, setUniverse] = useState<any[]>([]);
  const [minScore, setMinScore] = useState<number>(0);
  const [riskLevel, setRiskLevel] = useState<string>("All");

  useEffect(() => {
    // Combine local storage data to create a "universe"
    const wl = getWatchlist();
    const rep = getReports();
    // Use a Map to deduplicate by symbol
    const map = new Map();
    wl.forEach((item) => {
      if (item.symbol) map.set(item.symbol, { ...item, source: "Watchlist" });
    });
    rep.forEach((item) => {
      if (item.symbol && !map.has(item.symbol))
        map.set(item.symbol, { ...item, source: "Report" });
    });
    setUniverse(Array.from(map.values()));
  }, []);

  const results = universe.filter((item) => {
    if (minScore > 0 && (item.score || 0) < minScore) return false;
    if (riskLevel !== "All" && item.risk !== riskLevel) return false;
    return true;
  });

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Filter className="w-8 h-8 text-indigo-600" /> Screener
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Filter through your locally analyzed, saved, and watched stocks.
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Filters Sidebar */}
        <div className="w-full lg:w-64 shrink-0 space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm self-start">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              Min Final Score
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full mb-2"
            />
            <div className="text-sm font-bold text-indigo-600">{minScore}+</div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              Risk Level
            </label>
            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option>All</option>
              <option>Low</option>
              <option>Moderate</option>
              <option>High</option>
            </select>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <span className="text-sm font-bold text-slate-700">
              {results.length} Stocks Found
            </span>
          </div>

          {results.length === 0 ? (
            <div className="p-16 text-center text-slate-500 font-medium">
              No stocks match your given criteria in your local database. <br />
              Analyze more stocks to expand your screener universe.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse [&_th]:!p-2.5 [&_td]:!p-2.5 sm:[&_th]:!p-4 sm:[&_td]:!p-4">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                      Asset
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                      Price
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                      Score
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap hidden md:table-cell">
                      Risk
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 hover:bg-slate-50 transition"
                    >
                      <td className="p-4">
                        <div className="font-bold text-slate-900">
                          {item.symbol}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.name}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-mono font-bold text-slate-800">
                          {item.currentPrice || "N/A"}
                        </div>
                      </td>
                      <td className="p-4">
                        <div
                          className={`inline-flex items-center justify-center px-2 py-1 rounded text-xs font-bold ${item.score >= 80 ? "bg-emerald-100 text-emerald-700" : item.score >= 50 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}
                        >
                          {item.score || "-"}
                        </div>
                      </td>
                      <td className="p-4 text-sm font-semibold text-slate-700 hidden md:table-cell">
                        {item.risk || "N/A"}
                      </td>
                      <td className="p-4 text-right">
                        <Link
                          href={`/stock/${item.symbol}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition"
                        >
                          View <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
