"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen, StickyNote, FileText, Plus, Search, Trash2, Pencil, X, Save,
  Mic, MicOff, ExternalLink, Tag,
} from "lucide-react";
import {
  getJournal, saveJournalEntry, deleteJournalEntry, JOURNAL_TAGS, JOURNAL_MARKETS, type JournalEntry,
  getNotes, deleteNote,
  getReports, deleteReport,
} from "@/lib/storage";
import { useSpeech } from "@/lib/useSpeech";

const genId = () => Date.now().toString() + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

const TAG_STYLE: Record<string, string> = {
  Trade: "bg-indigo-50 text-indigo-700", Idea: "bg-emerald-50 text-emerald-700",
  Lesson: "bg-amber-50 text-amber-700", Review: "bg-sky-50 text-sky-700", Mistake: "bg-rose-50 text-rose-700",
};
const dt = (d: string) => { try { return new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }); } catch { return d; } };
const dtms = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });

const TH = "p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide text-left whitespace-nowrap";
const TD = "p-3 align-top";

export default function NotebookPage() {
  const [tab, setTab] = useState<"journal" | "notes" | "reports">("journal");
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const reload = () => {
    setJournal(getJournal());
    setNotes(getNotes().sort((a: any, b: any) => b.createdAt - a.createdAt));
    setReports(getReports().sort((a: any, b: any) => b.savedAt - a.savedAt));
  };
  useEffect(() => { reload(); }, []);

  // ---- journal add/edit form ----
  const emptyForm = (): Partial<JournalEntry> => ({ date: today(), tag: "Trade", market: "General", symbol: "", title: "", text: "", outcome: "" });
  const [form, setForm] = useState<Partial<JournalEntry>>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const set = (k: keyof JournalEntry, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const speech = useSpeech((chunk) => setForm((f) => ({ ...f, text: `${f.text || ""}${f.text && !f.text.endsWith(" ") ? " " : ""}${chunk}` })));

  const saveEntry = () => {
    if (speech.listening) speech.stop();
    if (!form.title?.trim() && !form.text?.trim()) return;
    saveJournalEntry({ ...form, symbol: (form.symbol || "").toUpperCase().trim() });
    setForm(emptyForm()); setShowForm(false); reload();
  };
  const editEntry = (e: JournalEntry) => { setForm({ ...e }); setShowForm(true); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };

  const s = search.trim().toLowerCase();
  const jFiltered = useMemo(() => journal
    .filter((e) => !s || (e.title || "").toLowerCase().includes(s) || (e.text || "").toLowerCase().includes(s) || (e.symbol || "").toLowerCase().includes(s) || (e.market || "").toLowerCase().includes(s))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt), [journal, s]);
  const nFiltered = useMemo(() => notes.filter((n) => !s || (n.symbol || "").toLowerCase().includes(s) || (n.topic || "").toLowerCase().includes(s) || (n.text || "").toLowerCase().includes(s) || (n.category || "").toLowerCase().includes(s)), [notes, s]);
  const rFiltered = useMemo(() => reports.filter((r) => !s || (r.symbol || "").toLowerCase().includes(s) || (r.name || "").toLowerCase().includes(s)), [reports, s]);

  const TABS = [
    { k: "journal", label: "Journal", icon: BookOpen, n: journal.length },
    { k: "notes", label: "Notes", icon: StickyNote, n: notes.length },
    { k: "reports", label: "Reports", icon: FileText, n: reports.length },
  ] as const;

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-indigo-600" /> Notebook
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Your trading journal, notes and saved reports — all in one place.</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-9 pr-3 py-2 w-52 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none" />
          </div>
          {tab === "journal" && (
            <button onClick={() => { setForm(emptyForm()); setShowForm((v) => !v); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 whitespace-nowrap">
              <Plus className="w-4 h-4" /> New Entry
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm font-bold flex items-center gap-2 border-b-2 -mb-px transition ${tab === t.k ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
            <span className={`text-[11px] px-1.5 py-0.5 rounded-md ${tab === t.k ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>{t.n}</span>
          </button>
        ))}
      </div>

      {/* JOURNAL */}
      {tab === "journal" && (
        <>
          {showForm && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                <input type="date" value={form.date || today()} onChange={(e) => set("date", e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-200" />
                <select value={form.tag || "Trade"} onChange={(e) => set("tag", e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200">
                  {JOURNAL_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={form.market || "General"} onChange={(e) => set("market", e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200">
                  {JOURNAL_MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <input value={form.symbol || ""} onChange={(e) => set("symbol", e.target.value.toUpperCase())} placeholder="Symbol (optional)" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
              <input value={form.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="Title (e.g. Bought AAPL on breakout)" className="w-full px-3 py-2 mb-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" />
              <div className="relative mb-2">
                <textarea value={form.text || ""} onChange={(e) => set("text", e.target.value)} rows={3} placeholder="What happened, why, what you learned…" className="w-full px-3 py-2 pr-11 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
                {speech.supported && (
                  <button type="button" onClick={() => (speech.listening ? speech.stop() : speech.start())} className={`absolute bottom-2 right-2 p-1.5 rounded-lg ${speech.listening ? "bg-rose-100 text-rose-600 animate-pulse" : "text-slate-400 hover:text-indigo-600 hover:bg-slate-100"}`} title="Voice note">
                    {speech.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input value={form.outcome || ""} onChange={(e) => set("outcome", e.target.value)} placeholder="Outcome (e.g. +2,400 · SL hit)" className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-200" />
                <button onClick={saveEntry} disabled={!form.title?.trim() && !form.text?.trim()} className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"><Save className="w-4 h-4" /> {form.id ? "Update" : "Save"}</button>
              </div>
            </div>
          )}
          {jFiltered.length === 0 ? (
            <Empty icon={BookOpen} msg="No journal entries yet." />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200">
                    <th className={TH}>Date</th><th className={TH}>Type</th><th className={TH}>Market</th><th className={TH}>Symbol</th><th className={TH}>Title</th><th className={TH}>Details</th><th className={TH}>Outcome</th><th className={`${TH} text-right`}></th>
                  </tr></thead>
                  <tbody>
                    {jFiltered.map((e) => (
                      <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                        <td className={`${TD} text-slate-500 whitespace-nowrap text-[13px]`}>{dt(e.date)}</td>
                        <td className={TD}>{e.tag && <span className={`text-[10px] font-black px-2 py-0.5 rounded ${TAG_STYLE[e.tag] || "bg-slate-100 text-slate-600"}`}>{e.tag}</span>}</td>
                        <td className={`${TD} text-[12px] text-slate-500 whitespace-nowrap`}>{e.market || "—"}</td>
                        <td className={TD}>{e.symbol ? <Link href={`/analyze?symbol=${e.symbol}`} className="text-[12px] font-black text-indigo-700 hover:underline">{e.symbol}</Link> : <span className="text-slate-300">—</span>}</td>
                        <td className={`${TD} font-bold text-slate-900 max-w-[220px]`}>{e.title || "—"}</td>
                        <td className={`${TD} text-slate-600 text-[13px] max-w-[320px]`}><div className="line-clamp-3 whitespace-pre-wrap">{e.text}</div></td>
                        <td className={`${TD} text-slate-600 text-[12px] whitespace-nowrap`}>{e.outcome || "—"}</td>
                        <td className={`${TD} text-right`}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => editEntry(e)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => { deleteJournalEntry(e.id); reload(); }} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* NOTES */}
      {tab === "notes" && (
        nFiltered.length === 0 ? <Empty icon={StickyNote} msg="No notes yet — jot notes anywhere with Cmd/Ctrl+J." /> : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  <th className={TH}>Date</th><th className={TH}>Stock</th><th className={TH}>Topic</th><th className={TH}>Category</th><th className={TH}>Note</th><th className={TH}>From</th><th className={`${TH} text-right`}></th>
                </tr></thead>
                <tbody>
                  {nFiltered.map((n) => (
                    <tr key={n.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className={`${TD} text-slate-500 whitespace-nowrap text-[13px]`}>{dtms(n.createdAt)}</td>
                      <td className={TD}>{n.symbol && n.symbol !== "GENERAL" ? <Link href={`/analyze?symbol=${n.symbol}`} className="text-[12px] font-black text-indigo-700 hover:underline">{n.symbol}</Link> : <span className="text-[11px] text-slate-400">General</span>}</td>
                      <td className={`${TD} font-bold text-slate-800 max-w-[180px] truncate`}>{n.topic || "—"}</td>
                      <td className={TD}>{n.category && <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">{n.category}</span>}</td>
                      <td className={`${TD} text-slate-600 text-[13px] max-w-[360px]`}>
                        {n.type === "voice" ? <audio controls src={n.audio} className="h-8 max-w-[220px]" /> : <div className="line-clamp-3 whitespace-pre-wrap">{n.text}</div>}
                      </td>
                      <td className={`${TD} text-[11px] text-slate-400 whitespace-nowrap`}>{n.page ? `${n.page}${n.section ? " · " + n.section : ""}` : "—"}</td>
                      <td className={`${TD} text-right`}><button onClick={() => { deleteNote(n.id); reload(); }} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* REPORTS */}
      {tab === "reports" && (
        rFiltered.length === 0 ? <Empty icon={FileText} msg="No saved reports yet — save an analysis from the Analyze page." /> : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  <th className={TH}>Date</th><th className={TH}>Symbol</th><th className={TH}>Company</th><th className={`${TH} text-right`}>Score</th><th className={TH}>View</th><th className={`${TH} text-right`}></th>
                </tr></thead>
                <tbody>
                  {rFiltered.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className={`${TD} text-slate-500 whitespace-nowrap text-[13px]`}>{dtms(r.savedAt)}</td>
                      <td className={`${TD} font-black text-slate-900`}>{r.symbol}</td>
                      <td className={`${TD} text-slate-600 text-[13px] max-w-[200px] truncate`}>{r.name || "—"}</td>
                      <td className={`${TD} text-right`}>{r.score != null && <span className={`text-[12px] font-black px-2 py-0.5 rounded ${r.score >= 80 ? "bg-emerald-50 text-emerald-700" : r.score >= 50 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-600"}`}>{r.score}</span>}</td>
                      <td className={`${TD} text-slate-600 text-[13px] max-w-[200px] truncate`}>{r.view || "—"}</td>
                      <td className={`${TD} text-right`}>
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/stock/${r.symbol}?reportId=${r.id}`} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Open"><ExternalLink className="w-4 h-4" /></Link>
                          <button onClick={() => { deleteReport(r.id); reload(); }} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function Empty({ icon: Icon, msg }: { icon: any; msg: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
      <Icon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
      <p className="text-slate-500 font-medium">{msg}</p>
    </div>
  );
}
