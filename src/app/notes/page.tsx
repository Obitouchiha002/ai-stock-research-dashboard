"use client";

import React, { useState, useEffect } from "react";
import { StickyNote, Search, Mic, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { getNotesGrouped, deleteNote } from "@/lib/storage";
import StockNotes from "@/components/StockNotes";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function NotesPage() {
  const [grouped, setGrouped] = useState<any[]>([]);
  const [activeSymbol, setActiveSymbol] = useState("");
  const [symbolInput, setSymbolInput] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const reload = () => setGrouped(getNotesGrouped());
  useEffect(() => { reload(); }, [activeSymbol]);

  const filtered = grouped.filter(
    (g) => !search || g.symbol.toLowerCase().includes(search.toLowerCase()) || (g.stockName || "").toLowerCase().includes(search.toLowerCase()),
  );
  const totalNotes = grouped.reduce((s, g) => s + g.notes.length, 0);

  return (
    <div className="max-w-screen-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <StickyNote className="w-8 h-8 text-indigo-600" /> Master Notes
        </h1>
        <p className="text-slate-500 mt-1 font-medium">
          Your stock research notes — text &amp; voice — saved per stock with timestamps. {totalNotes} note{totalNotes !== 1 ? "s" : ""} across {grouped.length} stock{grouped.length !== 1 ? "s" : ""}.
        </p>
      </div>

      {/* Add note for any symbol */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-6">
        <div className="text-xs font-black text-indigo-700 mb-2">Add a note for any stock</div>
        <form onSubmit={(e) => { e.preventDefault(); setActiveSymbol(symbolInput.trim().toUpperCase()); }} className="flex gap-2 mb-3">
          <input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="Stock symbol e.g. AAPL, RELIANCE.NS"
            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"
          />
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700">Open</button>
        </form>
        {activeSymbol && <StockNotes symbol={activeSymbol} stockName={activeSymbol} compact />}
      </div>

      {/* Search */}
      {grouped.length > 0 && (
        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your notes by stock…"
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"
          />
        </div>
      )}

      {/* Master grouped list */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 font-medium shadow-sm">
          {grouped.length === 0 ? "No notes yet. Add a note above, or use the Notes tab on any stock's Analyze page." : "No matching notes."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((g) => {
            const isOpen = open[g.symbol] ?? true;
            return (
              <div key={g.symbol} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <button onClick={() => setOpen((o) => ({ ...o, [g.symbol]: !isOpen }))} className="w-full flex items-center justify-between p-4 hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span className="text-sm font-black text-slate-900">{g.symbol}</span>
                    <span className="text-xs text-slate-400">{g.stockName !== g.symbol ? g.stockName : ""}</span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-500">{g.notes.length} note{g.notes.length !== 1 ? "s" : ""} · {timeAgo(g.lastAt)}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-2">
                    {g.notes.map((n: any) => (
                      <div key={n.id} className="bg-slate-50 rounded-xl p-3 group border border-slate-100">
                        <div className="flex items-start justify-between mb-1.5 gap-2">
                          <div className="min-w-0">
                            {(n.topic || n.category) && (
                              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                {n.topic && <span className="text-[13px] font-black text-slate-900">{n.topic}</span>}
                                {n.category && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-700">{n.category}</span>
                                )}
                              </div>
                            )}
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                              {n.type === "voice" ? <Mic className="w-3 h-3 text-indigo-500" /> : <StickyNote className="w-3 h-3 text-amber-500" />}
                              {n.type} · {new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <button onClick={() => { if (!window.confirm("Delete this note? This cannot be undone.")) return; deleteNote(n.id); reload(); }} className="text-slate-300 hover:text-rose-600 transition md:opacity-0 md:group-hover:opacity-100 shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {n.type === "voice" ? <audio controls src={n.audio} className="w-full h-9" /> : <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.text}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
