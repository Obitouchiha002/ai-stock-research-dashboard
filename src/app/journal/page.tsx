"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus, Search, Trash2, Pencil, X, Save, Tag, Mic, MicOff } from "lucide-react";
import {
  getJournal,
  saveJournalEntry,
  deleteJournalEntry,
  JOURNAL_TAGS,
  type JournalEntry,
} from "@/lib/storage";
import { useSpeech } from "@/lib/useSpeech";

const TAG_STYLE: Record<string, string> = {
  Trade: "bg-indigo-50 text-indigo-700",
  Idea: "bg-emerald-50 text-emerald-700",
  Lesson: "bg-amber-50 text-amber-700",
  Review: "bg-sky-50 text-sky-700",
  Mistake: "bg-rose-50 text-rose-700",
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): Partial<JournalEntry> => ({
  date: today(),
  symbol: "",
  title: "",
  text: "",
  tag: "Trade",
  outcome: "",
});

function prettyDate(d: string) {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [form, setForm] = useState<Partial<JournalEntry>>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("All");

  const reload = () => setEntries(getJournal());
  useEffect(() => { reload(); }, []);

  // Voice note → dictate into the entry text.
  const speech = useSpeech((chunk: string) =>
    setForm((f) => ({ ...f, text: `${f.text || ""}${f.text && !f.text.endsWith(" ") ? " " : ""}${chunk}` })),
  );

  const save = () => {
    if (speech.listening) speech.stop();
    if (!form.title?.trim() && !form.text?.trim()) return;
    saveJournalEntry({ ...form, symbol: (form.symbol || "").toUpperCase().trim() });
    setForm(emptyForm());
    setShowForm(false);
    reload();
  };

  const edit = (e: JournalEntry) => {
    setForm({ ...e });
    setShowForm(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = (id: string) => {
    deleteJournalEntry(id);
    reload();
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return [...entries]
      .filter((e) => (tagFilter === "All" ? true : e.tag === tagFilter))
      .filter((e) =>
        !s
          ? true
          : (e.title || "").toLowerCase().includes(s) ||
            (e.text || "").toLowerCase().includes(s) ||
            (e.symbol || "").toLowerCase().includes(s),
      )
      // newest first — by the entry date, then when it was written
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt);
  }, [entries, search, tagFilter]);

  const set = (k: keyof JournalEntry, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="max-w-screen-lg mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-indigo-600" /> Trading Journal
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Log your trades, ideas, lessons and reviews — your own record to learn from.
          </p>
        </div>
        <button
          onClick={() => { setForm(emptyForm()); setShowForm((v) => !v); }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition self-start"
        >
          <Plus className="w-4 h-4" /> New Entry
        </button>
      </div>

      {/* Composer */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-slate-800">{form.id ? "Edit entry" : "New journal entry"}</h3>
            <button onClick={() => { setShowForm(false); setForm(emptyForm()); }} className="text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Date</label>
              <input type="date" value={form.date || today()} onChange={(e) => set("date", e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-200 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Symbol (optional)</label>
              <input value={form.symbol || ""} onChange={(e) => set("symbol", e.target.value.toUpperCase())} placeholder="e.g. AAPL, TCS.NS"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-200 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Type</label>
              <select value={form.tag || "Trade"} onChange={(e) => set("tag", e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-200 outline-none">
                {JOURNAL_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <input value={form.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="Title (e.g. Bought AAPL on breakout)"
            className="w-full px-3 py-2 mb-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-200 outline-none" />
          <div className="relative mb-1">
            <textarea value={form.text || ""} onChange={(e) => set("text", e.target.value)} rows={4} placeholder="What happened, why you did it, how you felt, what you learned…"
              className="w-full px-3 py-2 pr-12 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 outline-none resize-none" />
            {speech.supported && (
              <button type="button" onClick={() => (speech.listening ? speech.stop() : speech.start())}
                title={speech.listening ? "Stop dictation" : "Voice note (dictate)"}
                className={`absolute bottom-2.5 right-2.5 p-1.5 rounded-lg transition ${speech.listening ? "bg-rose-100 text-rose-600 animate-pulse" : "text-slate-400 hover:text-indigo-600 hover:bg-slate-100"}`}>
                {speech.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
          </div>
          {speech.listening && (
            <div className="mb-3 text-[11px] font-semibold text-rose-500 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" /> Listening…
              {speech.interim && <span className="text-slate-400 italic font-normal truncate">{speech.interim}</span>}
            </div>
          )}
          {!speech.listening && <div className="mb-3" />}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Outcome / result (optional)</label>
              <input value={form.outcome || ""} onChange={(e) => set("outcome", e.target.value)} placeholder="e.g. +2,400 · SL hit · booked at target"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-200 outline-none" />
            </div>
            <button onClick={save} disabled={!form.title?.trim() && !form.text?.trim()}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition">
              <Save className="w-4 h-4" /> {form.id ? "Update" : "Save entry"}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="relative flex-1 min-w-[12rem] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entries…"
              className="pl-9 pr-3 py-2 w-full bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["All", ...JOURNAL_TAGS].map((t) => (
              <button key={t} onClick={() => setTagFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${tagFilter === t ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">Your journal is empty</h3>
          <p className="text-slate-500 mb-6 font-medium">Start logging your trades and ideas — it&apos;s the fastest way to improve.</p>
          <button onClick={() => { setForm(emptyForm()); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition">
            <Plus className="w-4 h-4" /> Write your first entry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-500 font-medium py-12">No entries match your filter.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <div key={e.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 group">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {e.tag && <span className={`px-2 py-0.5 rounded text-[10px] font-black ${TAG_STYLE[e.tag] || "bg-slate-100 text-slate-600"}`}>{e.tag}</span>}
                    {e.symbol && (
                      <Link href={`/analyze?symbol=${e.symbol}`} className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
                        {e.symbol}
                      </Link>
                    )}
                    <span className="text-[11px] font-bold text-slate-400">{prettyDate(e.date)}</span>
                  </div>
                  {e.title && <h3 className="font-black text-slate-900 text-[15px]">{e.title}</h3>}
                </div>
                <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition">
                  <button onClick={() => edit(e)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(e.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {e.text && <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed mt-1.5">{e.text}</p>}
              {e.outcome && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                  <Tag className="w-3.5 h-3.5 text-slate-400" /> {e.outcome}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-[11px] text-slate-400 italic">
        Your private record, saved on this device and synced with your other devices. Research support only. Not buy/sell advice.
      </p>
    </div>
  );
}
