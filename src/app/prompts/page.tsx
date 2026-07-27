"use client";

/**
 * Prompt Library — reusable prompts organised by category and sub-category,
 * written by hand or imported in bulk from JSON / CSV / Markdown / text.
 *
 * Everything lives in localStorage; nothing is uploaded anywhere.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BookMarked, Check, Copy, Download, FileUp, FolderPlus,
  Loader2, Mic, Pencil, Plus, Search, Star, Trash2, X,
} from "lucide-react";
import {
  PROMPT_CATEGORIES, addPromptsBulk, deletePrompt, getCustomPromptCats,
  getPrompts, saveCustomPromptCats, savePrompts, upsertPrompt,
  type SavedPrompt,
} from "@/lib/storage";
import { insertIntoElement, useSpeech } from "@/lib/useSpeech";
import { parseImport } from "@/lib/promptImport";

const blank = (): SavedPrompt => ({
  id: "",
  title: "",
  body: "",
  category: "Stock Analysis",
  subcategory: "Fundamental",
  tags: [],
  favorite: false,
  useCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [customCats, setCustomCats] = useState<Record<string, string[]>>({});
  const [cat, setCat] = useState<string>("All");
  const [sub, setSub] = useState<string>("All");
  const [q, setQ] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [editing, setEditing] = useState<SavedPrompt | null>(null);
  const [copied, setCopied] = useState("");
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  // Shown inside the editor modal, which covers the page-level notice.
  const [editorError, setEditorError] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newSub, setNewSub] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Dictation straight into the prompt body while the editor is open.
  const speech = useSpeech((chunk) => insertIntoElement(bodyRef.current, chunk.trim()));

  useEffect(() => {
    setPrompts(getPrompts());
    setCustomCats(getCustomPromptCats());
  }, []);

  const allCats = useMemo(() => {
    const merged: Record<string, string[]> = { ...PROMPT_CATEGORIES };
    for (const [c, subs] of Object.entries(customCats)) {
      merged[c] = Array.from(new Set([...(merged[c] || []), ...subs]));
    }
    // Categories that only exist on stored prompts still need to be selectable.
    for (const p of prompts) {
      if (!merged[p.category]) merged[p.category] = [];
      if (p.subcategory && !merged[p.category].includes(p.subcategory)) {
        merged[p.category].push(p.subcategory);
      }
    }
    return merged;
  }, [customCats, prompts]);

  const subsFor = (c: string) => allCats[c] || [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return prompts
      .filter((p) => (cat === "All" ? true : p.category === cat))
      .filter((p) => (sub === "All" || cat === "All" ? true : p.subcategory === sub))
      .filter((p) => (onlyFav ? p.favorite : true))
      .filter((p) =>
        !needle ||
        p.title.toLowerCase().includes(needle) ||
        p.body.toLowerCase().includes(needle) ||
        p.tags.some((t) => t.toLowerCase().includes(needle)),
      )
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt);
  }, [prompts, cat, sub, q, onlyFav]);

  const countIn = (c: string) => prompts.filter((p) => p.category === c).length;

  const persist = (list: SavedPrompt[]) => {
    savePrompts(list);
    setPrompts(getPrompts());
  };

  const save = () => {
    if (!editing) return;
    if (!editing.body.trim()) return setEditorError("A prompt needs some text before it can be saved.");
    setEditorError("");
    upsertPrompt({
      ...editing,
      id: editing.id || `p_${Date.now()}`,
      title: editing.title.trim() || editing.body.trim().slice(0, 60),
    });
    setPrompts(getPrompts());
    setEditing(null);
    speech.stop();
  };

  const copy = async (p: SavedPrompt) => {
    try {
      await navigator.clipboard.writeText(p.body);
      setCopied(p.id);
      setTimeout(() => setCopied(""), 1600);
      const all = getPrompts();
      const i = all.findIndex((x) => x.id === p.id);
      if (i >= 0) { all[i].useCount = (all[i].useCount || 0) + 1; persist(all); }
    } catch {
      setNotice("Could not reach the clipboard — copy the text manually.");
    }
  };

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return;
    setImporting(true);
    setNotice("");
    try {
      let added = 0;
      let skipped = 0;
      for (const f of Array.from(files)) {
        const text = await f.text();
        const items = parseImport(f.name, text)
          .filter((i) => (i.body || "").trim())
          // Files that carry no category land in the tab the user is viewing.
          .map((i) => ({
            ...i,
            category: i.category || (cat !== "All" ? cat : "General"),
            subcategory: i.subcategory || (sub !== "All" && cat !== "All" ? sub : "Custom"),
          }));
        const r = addPromptsBulk(items);
        added += r.added;
        skipped += r.skipped;
      }
      setPrompts(getPrompts());
      setNotice(
        added
          ? `Imported ${added} prompt${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} (empty or already in the library)` : ""}.`
          : "Nothing was imported — no readable prompts were found in that file.",
      );
    } catch (e: any) {
      setNotice(`Import failed — ${e?.message || String(e)}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(prompts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prompt-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addCategory = () => {
    const c = newCat.trim();
    if (!c) return;
    const next = { ...customCats, [c]: Array.from(new Set([...(customCats[c] || []), newSub.trim() || "Custom"])) };
    setCustomCats(next);
    saveCustomPromptCats(next);
    setNewCat("");
    setNewSub("");
    setShowNewCat(false);
    setCat(c);
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2.5">
            <BookMarked className="w-7 h-7 text-indigo-600" />
            Prompt Library
          </h1>
          <p className="text-[14px] text-slate-500 mt-1">
            {prompts.length} saved prompt{prompts.length === 1 ? "" : "s"} — write them by hand or import a file.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".json,.csv,.tsv,.txt,.md,.markdown"
            className="hidden"
            onChange={(e) => onImport(e.target.files)}
          />
          <button
            onClick={exportAll}
            disabled={!prompts.length}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          <button
            onClick={() => setEditing({ ...blank(), category: cat !== "All" ? cat : "Stock Analysis", subcategory: sub !== "All" && cat !== "All" ? sub : subsFor(cat !== "All" ? cat : "Stock Analysis")[0] || "Custom" })}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-bold hover:bg-indigo-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New prompt
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 text-[13px] text-indigo-800">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice("")} className="text-indigo-400 hover:text-indigo-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* category tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {["All", ...Object.keys(allCats)].map((c) => (
          <button
            key={c}
            onClick={() => { setCat(c); setSub("All"); }}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-black border transition ${
              cat === c
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
            }`}
          >
            {c}
            <span className={`ml-1.5 text-[11px] ${cat === c ? "text-indigo-100" : "text-slate-400"}`}>
              {c === "All" ? prompts.length : countIn(c)}
            </span>
          </button>
        ))}
        <button
          onClick={() => setShowNewCat((s) => !s)}
          className="px-3 py-2 rounded-xl text-[13px] font-black border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 flex items-center gap-1.5"
        >
          <FolderPlus className="w-4 h-4" /> Category
        </button>
      </div>

      {showNewCat && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="New category name"
            className="px-3 py-2 rounded-lg border border-slate-200 text-[13px] font-bold w-52 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <input
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            placeholder="First sub-category (optional)"
            className="px-3 py-2 rounded-lg border border-slate-200 text-[13px] font-bold w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <button onClick={addCategory} className="px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-[13px] font-black hover:bg-indigo-700">
            Add
          </button>
        </div>
      )}

      {/* sub-category chips */}
      {cat !== "All" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-black uppercase tracking-wide text-slate-400">Sub-category</span>
          {["All", ...subsFor(cat)].map((s) => (
            <button
              key={s}
              onClick={() => setSub(s)}
              className={`px-3 py-1.5 rounded-lg text-[12.5px] font-black border transition ${
                sub === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {s}
            </button>
          ))}
          <SubAdder
            onAdd={(name) => {
              const next = { ...customCats, [cat]: Array.from(new Set([...(customCats[cat] || subsFor(cat)), name])) };
              setCustomCats(next);
              saveCustomPromptCats(next);
              setSub(name);
            }}
          />
        </div>
      )}

      {/* search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, prompt text and tags…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
          />
        </div>
        <button
          onClick={() => setOnlyFav((f) => !f)}
          className={`px-3.5 py-2.5 rounded-xl text-[13px] font-bold border flex items-center gap-2 transition ${
            onlyFav ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Star className={`w-4 h-4 ${onlyFav ? "fill-amber-500 text-amber-500" : ""}`} /> Favourites
        </button>
      </div>

      {/* list */}
      {!filtered.length ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-16 text-center">
          <BookMarked className="w-10 h-10 mx-auto text-slate-300" />
          <div className="text-[16px] font-black text-slate-700 mt-3">
            {prompts.length ? "Nothing matches those filters" : "Your library is empty"}
          </div>
          <p className="text-[13.5px] text-slate-500 mt-1.5 max-w-lg mx-auto">
            {prompts.length
              ? "Try a different category or clear the search."
              : "Write a prompt by hand, or import a JSON, CSV, Markdown or text file. Markdown files are split on ## headings; text files on --- separators."}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
              <div className="flex items-start gap-2">
                <h3 className="text-[15px] font-black text-slate-900 flex-1 leading-snug">{p.title}</h3>
                <button
                  onClick={() => {
                    const all = getPrompts();
                    const i = all.findIndex((x) => x.id === p.id);
                    if (i >= 0) { all[i].favorite = !all[i].favorite; persist(all); }
                  }}
                  className="p-1 shrink-0"
                  aria-label={p.favorite ? "Remove from favourites" : "Add to favourites"}
                >
                  <Star className={`w-4 h-4 ${p.favorite ? "fill-amber-400 text-amber-400" : "text-slate-300 hover:text-amber-400"}`} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-indigo-50 text-indigo-700">{p.category}</span>
                {p.subcategory && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-slate-100 text-slate-600">{p.subcategory}</span>
                )}
                {p.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-50 text-slate-500 border border-slate-200">
                    #{t}
                  </span>
                ))}
              </div>

              <p className="text-[13px] text-slate-600 mt-2.5 whitespace-pre-wrap line-clamp-5 flex-1">{p.body}</p>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => copy(p)}
                  className={`px-3 py-1.5 rounded-lg text-[12.5px] font-black flex items-center gap-1.5 transition ${
                    copied === p.id ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {copied === p.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === p.id ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => setEditing(p)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-[12.5px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
                    deletePrompt(p.id);
                    setPrompts(getPrompts());
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-600 ml-auto"
                  aria-label={`Delete ${p.title}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                {p.useCount > 0 && (
                  <span className="text-[11px] font-bold text-slate-400 tabular-nums">used {p.useCount}×</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* editor */}
      {editing && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]" onClick={() => { setEditing(null); setEditorError(""); speech.stop(); }} />
          <div className="fixed inset-x-3 top-10 bottom-10 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[min(46rem,calc(100vw-2rem))] bg-white rounded-2xl z-[110] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-[17px] font-black text-slate-900">
                {editing.id ? "Edit prompt" : "New prompt"}
              </h2>
              <button onClick={() => { setEditing(null); setEditorError(""); speech.stop(); }} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="text-[12px] font-black uppercase tracking-wide text-slate-500">Title</label>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="Short name for this prompt"
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[14px] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-black uppercase tracking-wide text-slate-500">Category</label>
                  <select
                    value={editing.category}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value, subcategory: subsFor(e.target.value)[0] || "Custom" })}
                    className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13.5px] font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  >
                    {Object.keys(allCats).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-black uppercase tracking-wide text-slate-500">Sub-category</label>
                  <input
                    list="sub-options"
                    value={editing.subcategory}
                    onChange={(e) => setEditing({ ...editing, subcategory: e.target.value })}
                    placeholder="Pick one or type a new name"
                    className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13.5px] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <datalist id="sub-options">
                    {subsFor(editing.category).map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-black uppercase tracking-wide text-slate-500">Prompt text</label>
                  {speech.supported && (
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => (speech.listening ? speech.stop() : speech.start())}
                      className={`px-2.5 py-1 rounded-lg text-[12px] font-black flex items-center gap-1.5 transition ${
                        speech.listening ? "bg-rose-600 text-white animate-pulse" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5" />
                      {speech.listening ? "Listening…" : "Dictate"}
                    </button>
                  )}
                </div>
                <textarea
                  ref={bodyRef}
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  rows={12}
                  placeholder="Write the prompt. Use {{placeholders}} for the bits you swap out each time."
                  className="mt-1.5 w-full px-3.5 py-3 rounded-xl border border-slate-200 text-[13.5px] leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-y"
                />
                {speech.listening && speech.interim && (
                  <p className="text-[12.5px] text-slate-400 italic mt-1">{speech.interim}</p>
                )}
                {speech.error && <p className="text-[12.5px] text-amber-700 mt-1">{speech.error}</p>}
              </div>

              <div>
                <label className="text-[12px] font-black uppercase tracking-wide text-slate-500">
                  Tags <span className="font-bold normal-case text-slate-400">(comma separated)</span>
                </label>
                <input
                  value={editing.tags.join(", ")}
                  onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                  placeholder="earnings, screening, quick"
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
              {/* The page-level notice sits behind this modal's backdrop, so
                  validation has to report itself inside the modal. */}
              {editorError && (
                <p className="w-full text-[13px] font-bold text-rose-700 mb-1">{editorError}</p>
              )}
              <button onClick={save} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[14px] font-black hover:bg-indigo-700">
                Save prompt
              </button>
              <button
                onClick={() => { setEditing(null); setEditorError(""); speech.stop(); }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-[14px] font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SubAdder({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-2.5 py-1.5 rounded-lg text-[12.5px] font-black border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600"
      >
        + Sub
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const name = v.trim();
        if (name) onAdd(name);
        setV("");
        setOpen(false);
      }}
      className="flex items-center gap-1.5"
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Sub-category"
        className="w-36 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12.5px] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[12.5px] font-black">
        Add
      </button>
    </form>
  );
}
