"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  MessageSquare, Send, Plus, Paperclip, Search, X, Loader2, Trash2, Copy, Check,
  FileText, BarChart3, Sparkles, PanelLeftClose, PanelLeftOpen, Settings2,
  FolderPlus, Folder, BookMarked, ClipboardPaste, ShieldCheck, Mic, MicOff, Languages, GraduationCap,
} from "lucide-react";
import { useSpeech, SPEECH_LANGS } from "@/lib/useSpeech";

// Render the assistant's markdown (bold, bullet points, headings) cleanly.
const MD: any = {
  p: (p: any) => <p className="mb-2 last:mb-0 leading-relaxed" {...p} />,
  strong: (p: any) => <strong className="font-bold text-slate-900" {...p} />,
  em: (p: any) => <em className="italic" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-5 space-y-1 mb-2" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-5 space-y-1 mb-2" {...p} />,
  li: (p: any) => <li className="leading-relaxed" {...p} />,
  h1: (p: any) => <h3 className="font-black text-slate-900 text-[15px] mt-2 mb-1" {...p} />,
  h2: (p: any) => <h3 className="font-black text-slate-900 text-[15px] mt-2 mb-1" {...p} />,
  h3: (p: any) => <h4 className="font-bold text-slate-900 mt-2 mb-1" {...p} />,
  a: (p: any) => <a className="text-indigo-600 underline" target="_blank" rel="noreferrer" {...p} />,
  code: (p: any) => <code className="bg-slate-100 rounded px-1 py-0.5 text-[13px] font-mono" {...p} />,
  blockquote: (p: any) => <blockquote className="border-l-2 border-slate-300 pl-3 text-slate-600 italic mb-2" {...p} />,
  hr: () => <hr className="my-2 border-slate-200" />,
  table: (p: any) => <div className="overflow-x-auto mb-2"><table className="text-[13px] border-collapse" {...p} /></div>,
  th: (p: any) => <th className="border border-slate-200 px-2 py-1 bg-slate-50 font-bold text-left" {...p} />,
  td: (p: any) => <td className="border border-slate-200 px-2 py-1" {...p} />,
};
import {
  getAssistantChats, saveAssistantChat, deleteAssistantChat,
  getAssistantProjects, saveAssistantProject, deleteAssistantProject,
  getAssistantTraining, saveAssistantTraining, addAssistantLesson, removeAssistantLesson,
  getPrompts, logAiUsageDetailed,
  type AssistantChat, type AssistantMsg, type AssistantProject, type AssistantDoc, type AssistantTraining,
} from "@/lib/storage";

const genId = () => Date.now().toString() + Math.random().toString(36).slice(2, 7);
const newThread = (projectId?: string): AssistantChat => ({
  id: genId(), title: "New chat", messages: [], projectId, createdAt: Date.now(), updatedAt: Date.now(),
});

const SUGGESTIONS = [
  "Explain RSI and how to read it",
  "What does a 'Strong uptrend' mean?",
  "Summarise the document I attached",
  "Compare momentum vs value investing",
];

const VERDICT_STYLE: Record<string, string> = {
  "Confirmed": "bg-emerald-100 text-emerald-700",
  "Partly correct": "bg-amber-100 text-amber-700",
  "Disputed": "bg-rose-100 text-rose-700",
};
const VERDICT_TEXT: Record<string, string> = {
  "Confirmed": "text-emerald-600",
  "Partly correct": "text-amber-600",
  "Disputed": "text-rose-600",
};

function timeAgo(ms: number): string {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function AssistantPage() {
  const [chats, setChats] = useState<AssistantChat[]>([]);
  const [projects, setProjects] = useState<AssistantProject[]>([]);
  const [activeId, setActiveId] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>(""); // "" = all chats
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [ctxCache, setCtxCache] = useState<Record<string, any>>({});
  const [stockInput, setStockInput] = useState("");
  const [stockLoading, setStockLoading] = useState(false);

  const [attaching, setAttaching] = useState(false);
  const [banner, setBanner] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [verify, setVerify] = useState<Record<string, any>>({});

  // popovers / panels
  const [plusOpen, setPlusOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [stockOpen, setStockOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptSearch, setPromptSearch] = useState("");
  const [langOpen, setLangOpen] = useState(false);
  const [trainOpen, setTrainOpen] = useState(false);
  const [training, setTraining] = useState<AssistantTraining>({ globalInstructions: "", lessons: [] });
  const [lessonDraft, setLessonDraft] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Voice typing → dictate straight into the composer.
  const speech = useSpeech((chunk: string) =>
    setInput((v) => `${v}${v && !v.endsWith(" ") ? " " : ""}${chunk}`),
  );

  const active = useMemo(() => chats.find((c) => c.id === activeId) || null, [chats, activeId]);
  const activeProject = useMemo(() => projects.find((p) => p.id === active?.projectId) || null, [projects, active]);

  useEffect(() => {
    const cs = getAssistantChats();
    setChats(cs);
    setProjects(getAssistantProjects());
    setTraining(getAssistantTraining());
    if (cs.length) setActiveId(cs[0].id);
  }, []);

  // ---- train the AI (persistent memory across all chats) ----
  const updateTraining = (patch: Partial<AssistantTraining>) =>
    setTraining((t) => { const next = { ...t, ...patch }; saveAssistantTraining(next); return next; });
  const addLesson = () => {
    const text = lessonDraft.trim();
    if (!text) return;
    setTraining(addAssistantLesson(text));
    setLessonDraft("");
  };
  const delLesson = (id: string) => setTraining(removeAssistantLesson(id));
  const teachFrom = (idx: number) => {
    const q = active?.messages[idx - 1]?.content || "";
    setLessonDraft(q ? `About "${q.slice(0, 60)}": the correct answer is ` : "");
    setCustomizeOpen(false);
    setTrainOpen(true);
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [active?.messages, sending]);

  useEffect(() => {
    const s = active?.stockSymbol;
    if (s && !ctxCache[s]) loadStock(s, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // ---------- persistence ----------
  const persist = (t: AssistantChat) => {
    setChats((prev) => {
      const i = prev.findIndex((c) => c.id === t.id);
      return i >= 0 ? prev.map((c) => (c.id === t.id ? t : c)) : [t, ...prev];
    });
    setActiveId(t.id);
    saveAssistantChat(t);
  };
  const patchActive = (patch: Partial<AssistantChat>) => { if (active) persist({ ...active, ...patch }); };
  const ensureActive = (): AssistantChat => active || newThread(projectFilter || undefined);

  const saveProject = (p: AssistantProject) => {
    setProjects((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      return i >= 0 ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev];
    });
    saveAssistantProject(p);
  };
  const patchProject = (patch: Partial<AssistantProject>) => { if (activeProject) saveProject({ ...activeProject, ...patch }); };

  // ---------- chats ----------
  const newChat = () => {
    const nt = newThread(projectFilter || undefined);
    setChats((prev) => [nt, ...prev]);
    setActiveId(nt.id);
    setInput(""); setStockOpen(false); setCustomizeOpen(false);
    setTimeout(() => taRef.current?.focus(), 40);
  };
  const removeChat = (id: string) => {
    deleteAssistantChat(id);
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (id === activeId) setActiveId(next[0]?.id || "");
      return next;
    });
  };

  // ---------- projects ----------
  const newProject = () => {
    const name = (typeof window !== "undefined" ? window.prompt("Project name?") : "")?.trim();
    if (!name) return;
    const p: AssistantProject = { id: genId(), name, createdAt: Date.now(), updatedAt: Date.now() };
    saveProject(p);
    setProjectFilter(p.id);
  };
  const removeProject = (id: string) => {
    deleteAssistantProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setChats(getAssistantChats()); // chats were detached
    if (projectFilter === id) setProjectFilter("");
  };

  // ---------- stock context ----------
  const loadStock = async (sym: string, silent = false) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setStockLoading(true);
    if (!silent) setBanner("");
    try {
      const res = await fetch("/api/momentum", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: s, market: s.endsWith(".NS") || s.endsWith(".BO") ? "IN" : "US" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not load stock");
      setCtxCache((prev) => ({ ...prev, [s]: j.momentum }));
      if (!silent) { persist({ ...ensureActive(), stockSymbol: s }); setStockOpen(false); setStockInput(""); }
    } catch (e: any) {
      if (!silent) setBanner(e?.message || "Could not load that stock.");
    } finally { setStockLoading(false); }
  };

  // ---------- documents ----------
  const attachDocs = (docs: AssistantDoc[]) => {
    const t = ensureActive();
    persist({ ...t, docs: [...(t.docs || []), ...docs] });
  };
  const onFiles = async (fl: FileList | null) => {
    const files = fl ? Array.from(fl) : [];
    if (!files.length) return;
    setAttaching(true); setBanner("");
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/research/extract", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not read the file(s).");
      const ok = (j.files || []).filter((f: any) => f.ok && f.text);
      const failed = (j.files || []).filter((f: any) => !f.ok || !f.text);
      if (!ok.length) throw new Error(failed[0]?.reason || "No readable text found.");
      attachDocs(ok.map((f: any) => ({ name: f.name, text: f.text, chars: f.chars })));
      if (failed.length) setBanner(`${failed.length} file(s) couldn't be read and were skipped.`);
    } catch (e: any) { setBanner(e?.message || "Could not read the file(s)."); }
    finally { setAttaching(false); }
  };
  const savePaste = () => {
    const text = pasteText.trim();
    if (!text) return;
    attachDocs([{ name: `Pasted note ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, text, chars: text.length }]);
    setPasteText(""); setPasteOpen(false);
  };
  const removeDoc = (name: string, src: "chat" | "project") => {
    if (src === "project" && activeProject) patchProject({ docs: (activeProject.docs || []).filter((d) => d.name !== name) });
    else if (active) patchActive({ docs: (active.docs || []).filter((d) => d.name !== name) });
  };

  // ---------- effective context ----------
  const effDocs = useMemo(() => [
    ...((activeProject?.docs || []).map((d) => ({ ...d, src: "project" as const }))),
    ...((active?.docs || []).map((d) => ({ ...d, src: "chat" as const }))),
  ], [activeProject, active]);
  const effInstr = [activeProject?.instructions, active?.instructions].filter(Boolean).join("\n\n").trim();

  // ---------- send ----------
  const buildPrompt = (q: string, msgs: AssistantMsg[], ctx: any, symbol?: string) => {
    const history = msgs.slice(-9, -1).map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`).join("\n");
    const ctxStr = ctx ? JSON.stringify({
      name: ctx.name, symbol: ctx.symbol, view: ctx.snapshot?.finalMomentumView,
      priceStrength: ctx.priceStrength?.rating, returns: ctx.priceStrength?.returnsDisplay,
      buyerDemand: ctx.buyerDemand?.rating, sector: ctx.sectorRank,
      quarterlyEps: ctx.quarterlyEps?.trendLabel, quarterlySales: ctx.quarterlySales?.trendLabel,
      forwardPe: ctx.forwardValuation, quality: ctx.qualityRatios, setup: ctx.shortTermSetup,
    }) : "";
    const docsStr = effDocs.length
      ? effDocs.map((d) => `--- DOCUMENT: ${d.name} ---\n${String(d.text).slice(0, 24000)}`).join("\n\n")
      : "";
    const trainStr = [training.globalInstructions?.trim(), ...(training.lessons || []).map((l) => `- ${l.text}`)].filter(Boolean).join("\n");
    return `You are StockAnalytix's research assistant — warm, sharp and genuinely helpful, like a friendly expert analyst.
STYLE:
- Reply in the SAME language the user asked in (English, Hindi, or Hinglish) — never switch the language on them.
- Talk like a human having a conversation, not like a stiff report. Be clear and concise.
- Format with Markdown: **bold** the key terms, numbers and verdicts; use "- " bullet points for lists of factors; add a short **bold sub-heading** only when the answer is long.
- Use a few tasteful, professional emojis where they genuinely add clarity (e.g. 📈 📉 ⚠️ ✅ 💡 🔍) — at most one per point, never childish or spammy.
RULES: Research/education support only. NO buy/sell advice, NO price predictions, NO guarantees.${docsStr ? " When documents are provided, ground factual claims in them and name the file." : ""}
${trainStr ? `\nPERSISTENT TRAINING — the user taught you these; always honour them:\n${trainStr}\n` : ""}${effInstr ? `\nUSER'S CUSTOM INSTRUCTIONS (follow these):\n${effInstr}\n` : ""}${symbol && ctx ? `\nThe user is asking about ${ctx.name} (${ctx.symbol}). Ground answers in the data below.` : ""}
${ctxStr ? `\nLOADED STOCK DATA: ${ctxStr}` : ""}
${docsStr ? `\nATTACHED DOCUMENTS:\n${docsStr}` : ""}
${history ? `\nCONVERSATION SO FAR:\n${history}` : ""}

User question: ${q}`;
  };

  const send = async () => {
    const q = input.trim();
    if (!q || sending) return;
    if (speech.listening) speech.stop();
    setInput(""); setPlusOpen(false);
    const base = ensureActive();
    const msgs: AssistantMsg[] = [...base.messages, { role: "user", content: q, at: Date.now() }];
    const title = base.title === "New chat" || !base.title ? q.slice(0, 44) : base.title;
    const thread = { ...base, title, messages: msgs };
    const aiAt = Date.now() + 1;
    // Show an empty AI bubble immediately; it fills as tokens stream in.
    persist({ ...thread, messages: [...msgs, { role: "ai", content: "", at: aiAt }] });
    setSending(true);
    const ctx = thread.stockSymbol ? ctxCache[thread.stockSymbol] : null;
    const prompt = buildPrompt(q, msgs, ctx, thread.stockSymbol);
    const liveUpdate = (content: string) =>
      setChats((prev) => prev.map((c) => (c.id === thread.id ? { ...c, messages: [...msgs, { role: "ai", content, at: aiAt }] } : c)));
    let acc = "";
    try {
      const res = await fetch("/api/ai/stream", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }),
      });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          liveUpdate(acc);
        }
      }
      if (!acc.trim()) {
        // Streaming unavailable — fall back to the non-streaming route.
        const r2 = await fetch("/api/gemini/generate", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }),
        });
        const j2 = await r2.json();
        acc = r2.ok && j2.text ? j2.text : "Sorry, I couldn't answer that right now. Please try again in a moment.";
        logAiUsageDetailed("AI Research", j2?.usage ?? { tokens: j2?.aiTokens });
      }
    } catch {
      acc = acc || "Sorry, I couldn't answer that right now. Please try again in a moment.";
    } finally {
      persist({ ...thread, messages: [...msgs, { role: "ai", content: acc, at: aiAt }] });
      setSending(false);
    }
  };

  // Cross-verify an AI answer with other independent models.
  const crossVerify = async (idx: number) => {
    if (!active) return;
    const answer = active.messages[idx]?.content || "";
    const question = active.messages[idx - 1]?.content || "";
    if (!answer.trim()) return;
    const key = `${active.id}:${idx}`;
    setVerify((p) => ({ ...p, [key]: { loading: true } }));
    const parts: string[] = [];
    if (effInstr) parts.push(`Instructions: ${effInstr}`);
    if (stock && ctxCache[stock]) parts.push(`Stock data: ${JSON.stringify({ name: ctxCache[stock].name, symbol: ctxCache[stock].symbol, view: ctxCache[stock].snapshot?.finalMomentumView })}`);
    if (effDocs.length) parts.push(effDocs.map((d) => `DOC ${d.name}: ${String(d.text).slice(0, 6000)}`).join("\n\n"));
    try {
      const res = await fetch("/api/ai/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, context: parts.join("\n\n") }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Verification failed.");
      setVerify((p) => ({ ...p, [key]: { overall: j.overall, checks: j.checks } }));
    } catch (e: any) {
      setVerify((p) => ({ ...p, [key]: { error: e?.message || "Verification failed." } }));
    }
  };

  const copyMsg = (text: string, idx: number) => {
    try { navigator.clipboard.writeText(text); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 1400); } catch {}
  };

  const insertPrompt = (body: string) => {
    setInput((v) => (v ? `${v}\n${body}` : body));
    setPromptOpen(false);
    setTimeout(() => taRef.current?.focus(), 30);
  };

  // sidebar chat list respects the project filter
  const visibleChats = projectFilter ? chats.filter((c) => c.projectId === projectFilter) : chats;
  const savedPrompts = useMemo(() => {
    const s = promptSearch.trim().toLowerCase();
    return getPrompts().filter((p) => !s || p.title.toLowerCase().includes(s) || p.body.toLowerCase().includes(s)).slice(0, 40);
  }, [promptSearch, promptOpen]);

  const stock = active?.stockSymbol || "";

  const PLUS_ITEMS = [
    { icon: Paperclip, label: "Upload document / report", onClick: () => { setPlusOpen(false); fileRef.current?.click(); } },
    { icon: ClipboardPaste, label: "Paste text as context", onClick: () => { setPlusOpen(false); setPasteOpen(true); } },
    { icon: BookMarked, label: "Insert saved prompt", onClick: () => { setPlusOpen(false); setPromptOpen(true); } },
    { icon: Settings2, label: "Custom instructions", onClick: () => { setPlusOpen(false); setCustomizeOpen(true); } },
    { icon: BarChart3, label: "Set stock context", onClick: () => { setPlusOpen(false); setStockOpen(true); } },
  ];

  return (
    <div className="flex h-[calc(100vh-72px)] overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
          <div className="p-3">
            <button onClick={newChat} className="w-full flex items-center gap-2 px-3 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition">
              <Plus className="w-4 h-4" /> New chat
            </button>
          </div>

          {/* Projects */}
          <div className="px-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Projects</span>
              <button onClick={newProject} className="text-slate-400 hover:text-indigo-600" title="New project"><FolderPlus className="w-4 h-4" /></button>
            </div>
            <button onClick={() => setProjectFilter("")} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] font-semibold ${!projectFilter ? "bg-white border border-slate-200 shadow-sm text-slate-800" : "text-slate-500 hover:bg-white/70"}`}>
              All chats
            </button>
            {projects.map((p) => (
              <div key={p.id} className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer ${projectFilter === p.id ? "bg-white border border-slate-200 shadow-sm" : "hover:bg-white/70"}`} onClick={() => setProjectFilter(p.id)}>
                <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="flex-1 min-w-0 text-[13px] font-semibold text-slate-700 truncate">{p.name}</span>
                <span onClick={(e) => { e.stopPropagation(); removeProject(p.id); }} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></span>
              </div>
            ))}
          </div>

          {/* Chats */}
          <div className="flex-1 overflow-y-auto px-2 pt-3 pb-3 mt-2 border-t border-slate-200 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">{projectFilter ? "Project chats" : "History"}</span>
            {visibleChats.length === 0 && <p className="text-[11px] text-slate-400 px-2 py-3 text-center">No conversations yet.</p>}
            {visibleChats.map((c) => (
              <button key={c.id} onClick={() => setActiveId(c.id)} className={`w-full group flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition ${c.id === activeId ? "bg-white border border-slate-200 shadow-sm" : "hover:bg-white/70"}`}>
                <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="flex-1 min-w-0 text-[13px] font-semibold text-slate-700 truncate">{c.title || "New chat"}</span>
                <span className="text-[10px] text-slate-300 shrink-0">{timeAgo(c.updatedAt)}</span>
                <span onClick={(e) => { e.stopPropagation(); removeChat(c.id); }} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></span>
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white">
          <button onClick={() => setSidebarOpen((v) => !v)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100" title="Toggle history">
            {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
          </button>
          <h1 className="text-[15px] font-black text-slate-900 truncate flex items-center gap-1.5 min-w-0">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            {activeProject ? <span className="truncate">{activeProject.name}</span> : "AI Research"}
          </h1>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
            {stock && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
                <BarChart3 className="w-3 h-3" /> {stock}
                <button onClick={() => patchActive({ stockSymbol: undefined })} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
              </span>
            )}
            {effDocs.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100">
                <FileText className="w-3 h-3" /> {effDocs.length} doc{effDocs.length > 1 ? "s" : ""}
              </span>
            )}
            {effInstr && <span className="text-[11px] font-bold px-2 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-100">custom prompt</span>}
            <button onClick={() => { setTrainOpen((v) => !v); setCustomizeOpen(false); }} className={`p-1.5 rounded-lg hover:bg-slate-100 ${trainOpen ? "text-indigo-600 bg-indigo-50" : "text-slate-400 hover:text-indigo-600"}`} title="Train the AI (persistent memory)">
              <GraduationCap className="w-5 h-5" />
            </button>
            <button onClick={() => { setCustomizeOpen((v) => !v); setTrainOpen(false); }} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100" title="Customize (instructions & docs)">
              <Settings2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Customize panel */}
        {customizeOpen && (
          <div className="shrink-0 px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-3 max-h-[46vh] overflow-y-auto">
            {activeProject && (
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1">Project instructions — apply to every chat in “{activeProject.name}”</label>
                <textarea value={activeProject.instructions || ""} onChange={(e) => patchProject({ instructions: e.target.value })} rows={2}
                  placeholder="e.g. You are my equity research analyst. Always be concise and cite the documents."
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
              </div>
            )}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1">Custom instructions (this chat)</label>
              <textarea value={active?.instructions || ""} onChange={(e) => patchActive({ instructions: e.target.value })} rows={2}
                placeholder="Tell the AI how to respond — tone, format, what to focus on…"
                className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
            </div>
            {effDocs.length > 0 && (
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1">Attached documents</label>
                <div className="flex flex-wrap gap-1.5">
                  {effDocs.map((d, i) => (
                    <span key={`${d.name}-${i}`} className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 bg-white text-slate-700 rounded-lg border border-slate-200">
                      <FileText className="w-3.5 h-3.5 text-indigo-500" /> {d.name}
                      {d.src === "project" && <span className="text-[9px] text-amber-600">project</span>}
                      <button onClick={() => removeDoc(d.name, d.src)} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                {activeProject && (
                  <p className="text-[10px] text-slate-400 mt-1">Tip: upload a doc while a project is open to share it across all its chats.</p>
                )}
              </div>
            )}
            <div className="text-right">
              <button onClick={() => setCustomizeOpen(false)} className="text-[12px] font-bold text-slate-500 hover:text-slate-800">Done</button>
            </div>
          </div>
        )}

        {/* Train the AI */}
        {trainOpen && (
          <div className="shrink-0 px-4 py-3 bg-indigo-50/40 border-b border-slate-200 space-y-3 max-h-[52vh] overflow-y-auto">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              <h3 className="text-[13px] font-black text-slate-800">Train the AI</h3>
              <span className="text-[11px] text-slate-400">applies to every chat, custom instructions</span>
              <button onClick={() => setTrainOpen(false)} className="ml-auto text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1">Global instructions / persona</label>
              <textarea value={training.globalInstructions} onChange={(e) => updateTraining({ globalInstructions: e.target.value })} rows={2}
                placeholder="e.g. You are my personal equity analyst. Answer in Hinglish, keep it short, always flag the biggest risk."
                className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1">Teach a fact / correction</label>
              <div className="flex gap-2">
                <input value={lessonDraft} onChange={(e) => setLessonDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLesson(); } }}
                  placeholder={`e.g. Call RSI over 70 "stretched", not "overbought".`}
                  className="flex-1 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200" />
                <button onClick={addLesson} disabled={!lessonDraft.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">Teach</button>
              </div>
              {(training.lessons || []).length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {training.lessons.map((l) => (
                    <div key={l.id} className="flex items-start gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                      <GraduationCap className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                      <span className="flex-1 text-[13px] text-slate-700">{l.text}</span>
                      <button onClick={() => delLesson(l.id)} className="text-slate-300 hover:text-rose-600 shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400">These are sent with every message so the AI stays trained to your style and corrections. Tip: hit “Teach” under any answer to correct it.</p>
          </div>
        )}

        {/* Set-stock inline */}
        {stockOpen && (
          <div className="shrink-0 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <form onSubmit={(e) => { e.preventDefault(); loadStock(stockInput); }} className="flex gap-2 max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input autoFocus value={stockInput} onChange={(e) => setStockInput(e.target.value)} placeholder="Stock, e.g. AAPL, RELIANCE.NS"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none" />
              </div>
              <button type="submit" disabled={stockLoading} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                {stockLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Load
              </button>
              <button type="button" onClick={() => setStockOpen(false)} className="px-2 text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </form>
          </div>
        )}

        {/* Paste text */}
        {pasteOpen && (
          <div className="shrink-0 px-4 py-3 bg-slate-50 border-b border-slate-200">
            <textarea autoFocus value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} placeholder="Paste a report, notes, or any text to use as context…"
              className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => { setPasteOpen(false); setPasteText(""); }} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800">Cancel</button>
              <button onClick={savePaste} disabled={!pasteText.trim()} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">Add as context</button>
            </div>
          </div>
        )}

        {/* Saved prompt picker */}
        {promptOpen && (
          <div className="shrink-0 px-4 py-3 bg-slate-50 border-b border-slate-200 max-h-[40vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input autoFocus value={promptSearch} onChange={(e) => setPromptSearch(e.target.value)} placeholder="Search your Prompt Library…"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none" />
              </div>
              <button onClick={() => setPromptOpen(false)} className="px-2 text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            {savedPrompts.length === 0 ? (
              <p className="text-[12px] text-slate-400 py-3 text-center">No saved prompts. Add some in the Prompt Library.</p>
            ) : (
              <div className="space-y-1.5">
                {savedPrompts.map((p) => (
                  <button key={p.id} onClick={() => insertPrompt(p.body)} className="w-full text-left bg-white border border-slate-200 rounded-lg px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50/40 transition">
                    <div className="text-[13px] font-bold text-slate-800 truncate">{p.title || p.body.slice(0, 50)}</div>
                    <div className="text-[11px] text-slate-500 truncate">{p.body}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {banner && (
          <div className="shrink-0 px-4 py-2 bg-amber-50 border-b border-amber-200 text-[12px] font-medium text-amber-800 flex items-center justify-between">
            <span>{banner}</span><button onClick={() => setBanner("")}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto">
            {!active || active.messages.length === 0 ? (
              <div className="text-center pt-10">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4"><Sparkles className="w-7 h-7" /></div>
                <h2 className="text-xl font-black text-slate-900 mb-1">How can I help with your research?</h2>
                <p className="text-slate-500 font-medium mb-6 text-sm">Ask anything · load a stock · attach a report · use “+” to paste text, insert a saved prompt, or set custom instructions.</p>
                <div className="grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => { setInput(s); setTimeout(() => taRef.current?.focus(), 20); }}
                      className="text-left text-[13px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl px-3.5 py-3 hover:border-indigo-300 hover:bg-indigo-50/40 transition">{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {active.messages.map((m, idx) => {
                  const v = verify[`${active.id}:${idx}`];
                  const isEmptyAi = m.role === "ai" && !m.content;
                  return (
                    <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      {m.role === "ai" && <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mr-2 mt-0.5"><Sparkles className="w-4 h-4" /></div>}
                      <div className="max-w-[85%] min-w-0">
                        <div className={`rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-800"}`}>
                          {isEmptyAi ? (
                            <div className="flex gap-1 items-center py-1">
                              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
                              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0.12s" }} />
                              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0.24s" }} />
                            </div>
                          ) : m.role === "ai" ? (
                            <div className="text-[14px]"><ReactMarkdown components={MD}>{m.content}</ReactMarkdown></div>
                          ) : (
                            <div className="text-[14px] whitespace-pre-wrap leading-relaxed">{m.content}</div>
                          )}
                        </div>
                        {m.role === "ai" && m.content && (
                          <div className="flex items-center gap-3 mt-1.5 px-1">
                            <button onClick={() => copyMsg(m.content, idx)} className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1">
                              {copiedIdx === idx ? <><Check className="w-3 h-3 text-emerald-600" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                            </button>
                            <button onClick={() => crossVerify(idx)} disabled={v?.loading} className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 disabled:opacity-60">
                              {v?.loading ? <><Loader2 className="w-3 h-3 animate-spin" /> Cross-verifying…</> : <><ShieldCheck className="w-3 h-3" /> Cross-verify</>}
                            </button>
                            <button onClick={() => teachFrom(idx)} className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1" title="Teach the AI a correction from this answer">
                              <GraduationCap className="w-3 h-3" /> Teach
                            </button>
                          </div>
                        )}
                        {v && !v.loading && (v.checks || v.error) && (
                          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            {v.error ? (
                              <div className="text-[12px] text-rose-600 font-medium">{v.error}</div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 mb-2">
                                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                                  <span className={`text-[11px] font-black px-2 py-0.5 rounded ${VERDICT_STYLE[v.overall] || "bg-slate-200 text-slate-600"}`}>{v.overall}</span>
                                  <span className="text-[11px] text-slate-500 font-medium">cross-checked by {v.checks.length} model{v.checks.length > 1 ? "s" : ""}</span>
                                </div>
                                <div className="space-y-1">
                                  {v.checks.map((c: any, i: number) => (
                                    <div key={i} className="text-[12px] leading-snug">
                                      <span className="font-bold text-slate-600">{c.provider}: </span>
                                      <b className={VERDICT_TEXT[c.verdict] || "text-slate-500"}>{c.verdict}</b>
                                      {c.notes ? <span className="text-slate-500"> — {c.notes}</span> : null}
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
          <div className="max-w-3xl mx-auto">
            {effDocs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {effDocs.map((d, i) => (
                  <span key={`${d.name}-${i}`} className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100">
                    <FileText className="w-3.5 h-3.5" /> {d.name}
                    <button onClick={() => removeDoc(d.name, d.src)} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-2 py-2 focus-within:ring-2 focus-within:ring-indigo-200">
              {/* + menu */}
              <div className="relative shrink-0">
                <button onClick={() => setPlusOpen((v) => !v)} className={`p-1.5 rounded-lg transition ${plusOpen ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:text-indigo-600 hover:bg-slate-100"}`} title="Add">
                  <Plus className="w-5 h-5" />
                </button>
                {plusOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setPlusOpen(false)} />
                    <div className="absolute bottom-full mb-2 left-0 z-20 w-60 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden py-1">
                      {PLUS_ITEMS.map((it) => (
                        <button key={it.label} onClick={it.onClick} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition">
                          <it.icon className="w-4 h-4 text-slate-400" /> {it.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <textarea ref={taRef} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1}
                placeholder={speech.listening ? "Listening… speak now" : effDocs.length ? "Ask about your documents…" : stock ? `Ask about ${stock}…` : "Ask anything…"}
                className="no-focus-outline flex-1 bg-transparent resize-none outline-none text-sm py-1.5 max-h-40 leading-relaxed" />
              {speech.supported && (
                <>
                  {/* compact voice-language picker (icon only) */}
                  <div className="relative shrink-0">
                    <button onClick={() => setLangOpen((v) => !v)} title={`Voice language: ${SPEECH_LANGS.find((l) => l.code === speech.lang)?.label || speech.lang}`}
                      className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition">
                      <Languages className="w-5 h-5" />
                    </button>
                    {langOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
                        <div className="absolute bottom-full mb-2 right-0 z-20 w-44 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl py-1">
                          {SPEECH_LANGS.map((l) => (
                            <button key={l.code} onClick={() => { speech.setLang(l.code); setLangOpen(false); }}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] font-semibold text-left hover:bg-indigo-50 ${speech.lang === l.code ? "text-indigo-700" : "text-slate-600"}`}>
                              {l.label}{speech.lang === l.code && <Check className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button onClick={() => (speech.listening ? speech.stop() : speech.start())}
                    className={`p-2 rounded-xl shrink-0 transition ${speech.listening ? "bg-rose-100 text-rose-600 animate-pulse" : "text-slate-400 hover:text-indigo-600 hover:bg-slate-100"}`}
                    title={speech.listening ? "Stop dictation" : "Voice type"}>
                    {speech.listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                </>
              )}
              <button onClick={send} disabled={!input.trim() || sending} className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 shrink-0 transition">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            {speech.listening && (
              <div className="mt-1.5 px-1 text-[11px] font-semibold text-rose-500 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" /> Listening…
                {speech.interim && <span className="text-slate-400 italic font-normal truncate">{speech.interim}</span>}
              </div>
            )}
            {speech.error && (
              <div className="mt-1.5 px-1 text-[11px] font-semibold text-amber-600">{speech.error}</div>
            )}
            <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.md,.csv,.docx,.doc" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            <p className="mt-1.5 text-center text-[10px] text-slate-400 font-medium">
              Research support only. Not buy/sell advice. AI can make mistakes — verify independently. Enter to send · Shift+Enter = new line.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
