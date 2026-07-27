"use client";

/**
 * Document Research workspace.
 *
 * Four surfaces over one set of documents:
 *   Chat     — grounded Q&A, full-height conversation
 *   Versions — every analysis run kept immutably (v1, v2, …)
 *   Compare  — several versions lined up claim by claim
 *   Report   — the clean readable write-up, exportable
 *
 * Research support only. Not buy/sell advice. No guaranteed prediction.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle, ArrowUp, Check, ChevronDown, ChevronLeft, Columns3, FileDown,
  FileSpreadsheet, FileText, GitCompare, Layers, Loader2, MessageSquare, Mic,
  PanelLeftClose, PanelLeftOpen, Pencil, Plus, ScanSearch, ShieldCheck, Sparkles,
  Trash2, Upload, X,
} from "lucide-react";
import {
  deleteResearchProject, getActiveResearchId, getResearchProjects,
  logAiUsageDetailed, saveResearchProject, setActiveResearchId, type ResearchProject,
} from "@/lib/storage";
import { DISCLAIMER, buildReport, compareVersions, type AnalysisVersion, type ChatMessage } from "@/lib/researchTypes";

type ChatThread = { id: string; title: string; messages: ChatMessage[]; createdAt: number; updatedAt: number };

const newThread = (): ChatThread => ({
  id: `c_${Date.now()}`,
  title: "New chat",
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
import { exportReportDocx, exportReportPdf, exportReportXlsx } from "@/lib/researchExport";
import { insertIntoElement, useSpeech } from "@/lib/useSpeech";

const PROVIDER_META: Record<string, { short: string; tone: string; dot: string }> = {
  claude: { short: "Claude", tone: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  openai: { short: "OpenAI", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  gemini: { short: "Gemini", tone: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  groq: { short: "Groq", tone: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", dot: "bg-fuchsia-500" },
  perplexity: { short: "Perplexity", tone: "bg-cyan-50 text-cyan-700 border-cyan-200", dot: "bg-cyan-500" },
};
const meta = (p: string) =>
  PROVIDER_META[p] || { short: p || "—", tone: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" };

const VERDICT_TONE: Record<string, string> = {
  Supported: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Partly supported": "bg-amber-50 text-amber-700 border-amber-200",
  Contradicted: "bg-rose-50 text-rose-700 border-rose-200",
  "Not found": "bg-slate-100 text-slate-500 border-slate-200",
  Unclear: "bg-slate-100 text-slate-500 border-slate-200",
};

const newProject = (): ResearchProject => ({
  id: `r_${Date.now()}`,
  title: "Untitled research",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  focus: "",
  docs: [],
  versions: [],
  chats: [],
  activeChatId: "",
  compareIds: [],
  aiTokens: 0,
});

type Tab = "chat" | "versions" | "compare" | "report";

export default function ResearchPage() {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [project, setProject] = useState<ResearchProject>(newProject);
  const [providers, setProviders] = useState<string[]>([]);
  const [analyst, setAnalyst] = useState("");
  const [verifiers, setVerifiers] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("chat");
  const [sidebar, setSidebar] = useState(true);
  const [showProjects, setShowProjects] = useState(false);
  // Model / verifier / focus are set once and rarely touched — collapsed by default.
  const [showSetup, setShowSetup] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [verifyingId, setVerifyingId] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [autoVerify, setAutoVerify] = useState(true);
  const [stage, setStage] = useState<"" | "analysing" | "verifying">("");
  const [renaming, setRenaming] = useState("");
  const [renameText, setRenameText] = useState("");
  const [reportId, setReportId] = useState("");
  const [openClaim, setOpenClaim] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  // dragenter/leave fire for every child element — count instead of toggling.
  const dragDepth = useRef(0);
  const chatRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const speech = useSpeech((chunk) => insertIntoElement(chatRef.current, chunk.trim()));

  // The panel is an overlay on phones, so it must not start open there.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setSidebar(false);
  }, []);

  // ---------------------------------------------------------------- boot ----
  useEffect(() => {
    const all = getResearchProjects();
    setProjects(all);
    const active = all.find((p) => p.id === getActiveResearchId());
    if (active) setProject(active);

    fetch("/api/research/analyze")
      .then((r) => r.json())
      .then((j) => {
        const list: string[] = Array.isArray(j?.providers) ? j.providers : [];
        setProviders(list);
        const first = list.includes("claude") ? "claude" : list[0] || "";
        setAnalyst(first);
        setVerifiers(list.filter((p) => p !== first));
      })
      .catch(() => setProviders([]));
  }, []);

  const persist = useCallback((next: ResearchProject) => {
    setProject(next);
    const res = saveResearchProject(next);
    if (!res.ok) {
      setError(
        "Your browser's local storage is full, so this could not be saved. Delete an older research project to free space — otherwise this work will be gone when you reload.",
      );
    } else if (res.pruned.length) {
      setError(`Storage was nearly full, so ${res.pruned.join(" and ")} had to be cleared to save this.`);
    }
    setActiveResearchId(next.id);
    setProjects(getResearchProjects());
  }, []);

  const okDocs = useMemo(() => project.docs.filter((d) => d.text), [project.docs]);
  const versions: AnalysisVersion[] = project.versions || [];
  const compareIds = project.compareIds || [];

  const threads: ChatThread[] = project.chats || [];
  const activeThread = useMemo(
    () => threads.find((t) => t.id === project.activeChatId) || threads[threads.length - 1] || null,
    [threads, project.activeChatId],
  );
  const chat: ChatMessage[] = activeThread?.messages || [];

  /** Write messages into the active thread, creating one if there isn't any. */
  const withThreadMessages = useCallback(
    (base: ResearchProject, messages: ChatMessage[]): ResearchProject => {
      const list: ChatThread[] = base.chats || [];
      const id = base.activeChatId || list[list.length - 1]?.id;
      const existing = list.find((t) => t.id === id);
      const title =
        messages.find((m) => m.role === "user")?.content.slice(0, 60) || "New chat";

      if (!existing) {
        const t: ChatThread = { ...newThread(), title, messages };
        return { ...base, chats: [...list, t], activeChatId: t.id };
      }
      return {
        ...base,
        chats: list.map((t) =>
          t.id === existing.id
            ? { ...t, messages, updatedAt: Date.now(), title: t.title === "New chat" ? title : t.title }
            : t,
        ),
      };
    },
    [],
  );

  const selectedVersions = useMemo(
    () => versions.filter((v) => compareIds.includes(v.id)),
    [versions, compareIds],
  );
  const comparison = useMemo(
    () => (selectedVersions.length >= 2 ? compareVersions(selectedVersions) : null),
    [selectedVersions],
  );

  const reportVersion = useMemo(
    () => versions.find((v) => v.id === reportId) || versions[versions.length - 1] || null,
    [versions, reportId],
  );

  useEffect(() => {
    if (tab === "chat") scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, chatBusy, tab]);

  // Land in the chat box ready to type, the way a chat app should.
  useEffect(() => {
    if (tab === "chat" && !chatBusy) chatRef.current?.focus();
  }, [tab, chatBusy]);

  // Paste a file straight in from the clipboard — no dialog, no drag.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (!files.length) return;
      e.preventDefault();
      handleFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // Cmd/Ctrl+Enter runs the analysis from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !analysing && okDocs.length) {
        e.preventDefault();
        runAnalysis();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysing, okDocs.length, analyst, verifiers, autoVerify, project]);

  // -------------------------------------------------------------- upload ----
  const handleFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/research/extract", { method: "POST", body: fd });
      const j = await res.json();
      if (j.error) throw new Error(j.error);

      const failed = (j.files || []).filter((f: any) => !f.ok);
      if (failed.length) setError(failed.map((f: any) => `${f.name}: ${f.reason}`).join("  •  "));

      const added = (j.files || []).filter((f: any) => f.ok).map((f: any) => ({
        name: f.name, kind: f.kind, chars: f.chars, words: f.words, pages: f.pages, text: f.text,
      }));
      if (added.length) {
        persist({
          ...project,
          docs: [...project.docs.filter((d) => !added.some((a: any) => a.name === d.name)), ...added],
          title: project.title === "Untitled research" ? added[0].name.replace(/\.[^.]+$/, "") : project.title,
        });
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ---------------------------------------------------------------- chat ----
  const sendChat = async (text?: string) => {
    const q = (text ?? chatInput).trim();
    if (!q || chatBusy) return;
    setError("");
    speech.stop();

    const userMsg: ChatMessage = { id: `m_${Date.now()}`, role: "user", content: q, createdAt: Date.now() };
    const withUser = withThreadMessages(project, [...chat, userMsg]);
    persist(withUser);
    setChatInput("");
    setChatBusy(true);

    try {
      const res = await fetch("/api/research/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docs: okDocs.map((d) => ({ name: d.name, text: d.text })),
          messages: [...chat, userMsg].map((m) => ({ role: m.role, content: m.content })),
          provider: analyst,
        }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      logAiUsageDetailed("Document Chat", j.usage ?? { tokens: j.aiTokens }, j.provider);
      persist({
        ...withThreadMessages(withUser, [...chat, userMsg, {
          id: `m_${Date.now() + 1}`, role: "assistant", content: j.reply,
          provider: j.provider, createdAt: Date.now(),
        }]),
        aiTokens: (withUser.aiTokens || 0) + (j.aiTokens || 0),
      });
    } catch (e: any) {
      persist(withThreadMessages(withUser, [...chat, userMsg, {
        id: `m_${Date.now() + 1}`, role: "assistant", createdAt: Date.now(), error: true,
        content: `Could not answer — ${e?.message || String(e)}`,
      }]));
    } finally {
      setChatBusy(false);
    }
  };

  // ------------------------------------------------------------ versions ----
  /**
   * One action: analyse, then (unless switched off) immediately cross-verify.
   * Splitting these into two clicks meant a version usually sat unverified —
   * the verification is the point of the tool, so it runs by default.
   */
  const runAnalysis = async (opts?: { provider?: string; verifiers?: string[] }) => {
    // Explicit overrides, because a setState from the same click has not landed
    // in this closure yet — reading `analyst` here would use the previous model.
    const useProvider = opts?.provider ?? analyst;
    const useVerifiers = opts?.verifiers ?? verifiers;

    if (!okDocs.length) return setError("Upload at least one readable document first.");
    if (!useProvider) return setError("No AI provider is configured.");
    setError("");
    setAnalysing(true);
    setStage("analysing");
    try {
      const res = await fetch("/api/research/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docs: okDocs.map((d) => ({ name: d.name, text: d.text })),
          provider: useProvider,
          focus: project.focus,
        }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      logAiUsageDetailed("Document Analysis", j.usage ?? { tokens: j.aiTokens }, j.provider);

      const n = versions.length + 1;
      const v: AnalysisVersion = {
        id: `v_${Date.now()}`,
        version: n,
        label: `Version ${n}`,
        docNames: okDocs.map((d) => d.name),
        provider: j.provider,
        focus: project.focus,
        createdAt: Date.now(),
        analysis: j.analysis,
        verification: null,
        aiTokens: j.aiTokens || 0,
      };
      let next: ResearchProject = {
        ...project,
        versions: [...versions, v],
        // A second version is what makes comparison meaningful — tick it in.
        compareIds: versions.length ? Array.from(new Set([...compareIds, v.id])) : [v.id],
        aiTokens: (project.aiTokens || 0) + (j.aiTokens || 0),
        title: project.title === "Untitled research" ? j.analysis?.title || project.title : project.title,
      };
      persist(next);
      setReportId(v.id);

      if (autoVerify && useVerifiers.length) {
        setStage("verifying");
        try {
          const vr = await fetch("/api/research/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              docs: okDocs.map((d) => ({ name: d.name, text: d.text })),
              claims: j.analysis.claims,
              providers: useVerifiers,
            }),
          });
          const vj = await vr.json();
          if (vj.error) throw new Error(vj.error);
          logAiUsageDetailed("Document Verification", vj.usage ?? { tokens: vj.aiTokens });
          next = {
            ...next,
            versions: next.versions.map((x: any) => (x.id === v.id ? { ...x, verification: vj.verification } : x)),
            aiTokens: (next.aiTokens || 0) + (vj.aiTokens || 0),
          };
          persist(next);
        } catch (e: any) {
          // The analysis itself is still good — say what failed and keep it.
          setError(`Analysis saved, but cross-verification failed — ${e?.message || String(e)}. Run it again from the Versions tab.`);
        }
      }

      // A second run is almost always a comparison — go straight there.
      setTab(next.versions.length >= 2 ? "compare" : "report");
    } catch (e: any) {
      setError(`Analysis failed — ${e?.message || String(e)}`);
    } finally {
      setAnalysing(false);
      setStage("");
    }
  };

  const verifyVersion = async (v: AnalysisVersion) => {
    if (!verifiers.length) return setError("Select at least one model to verify with.");
    setError("");
    setVerifyingId(v.id);
    try {
      const res = await fetch("/api/research/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docs: okDocs.map((d) => ({ name: d.name, text: d.text })),
          claims: v.analysis.claims,
          providers: verifiers,
        }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      logAiUsageDetailed("Document Verification", j.usage ?? { tokens: j.aiTokens });
      persist({
        ...project,
        versions: versions.map((x) => (x.id === v.id ? { ...x, verification: j.verification } : x)),
        aiTokens: (project.aiTokens || 0) + (j.aiTokens || 0),
      });
    } catch (e: any) {
      setError(`Verification failed — ${e?.message || String(e)}`);
    } finally {
      setVerifyingId("");
    }
  };

  const toggleCompare = (id: string) =>
    persist({
      ...project,
      compareIds: compareIds.includes(id) ? compareIds.filter((x) => x !== id) : [...compareIds, id],
    });

  const removeVersion = (id: string) =>
    persist({
      ...project,
      versions: versions.filter((v) => v.id !== id),
      compareIds: compareIds.filter((x) => x !== id),
    });

  const saveRename = (id: string) => {
    persist({
      ...project,
      versions: versions.map((v) => (v.id === id ? { ...v, label: renameText.trim() || v.label } : v)),
    });
    setRenaming("");
  };

  // -------------------------------------------------------------- export ----
  const report = useMemo(() => {
    if (!reportVersion) return null;
    return buildReport(
      reportVersion.analysis,
      reportVersion.verification || { reviewers: [], consensus: [], score: 0, summary: "Not verified." },
      okDocs.map((d) => ({ name: d.name, chars: d.chars })),
      reportVersion.provider,
      new Date(reportVersion.createdAt).toISOString(),
    );
  }, [reportVersion, okDocs]);

  const doExport = async (fn: (r: any) => Promise<void>) => {
    if (!report) return;
    try { await fn(report); } catch (e: any) { setError(`Export failed — ${e?.message || String(e)}`); }
  };


  /**
   * The message box. Rendered inline under the empty state so it sits with the
   * content, and pinned to the bottom once a conversation is running — a fixed
   * bottom bar left it stranded far below the intro text on an empty page.
   */
  const composer = (
    <div className="max-w-3xl mx-auto px-4 py-3 w-full">
              <div className="relative">
                {/* "+" menu — attach a document or start a new project without
                    leaving the message box. */}
                {plusOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setPlusOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 z-30 w-60 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                      <button
                        onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}
                        className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100"
                      >
                        <Upload className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                        <span>
                          <span className="block text-[13px] font-black text-slate-900">Add document</span>
                          <span className="block text-[11.5px] text-slate-400">PDF · Word · Excel · CSV · text</span>
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          setPlusOpen(false);
                          const t = newThread();
                          persist({ ...project, chats: [...threads, t], activeChatId: t.id });
                        }}
                        className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100"
                      >
                        <MessageSquare className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                        <span>
                          <span className="block text-[13px] font-black text-slate-900">New chat</span>
                          <span className="block text-[11.5px] text-slate-400">Same documents, fresh thread</span>
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          setPlusOpen(false);
                          const np = newProject();
                          setProject(np);
                          setActiveResearchId(np.id);
                          setProjects(getResearchProjects());
                          setTab("chat");
                          setError("");
                          setReportId("");
                        }}
                        className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50"
                      >
                        <Plus className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                        <span>
                          <span className="block text-[13px] font-black text-slate-900">New project</span>
                          <span className="block text-[11.5px] text-slate-400">Start over with different documents</span>
                        </span>
                      </button>
                    </div>
                  </>
                )}
                <div className="flex items-end gap-2 px-3 py-2 rounded-2xl border border-slate-300 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 transition">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setPlusOpen((v) => !v)}
                    className={`shrink-0 p-2 rounded-xl transition ${
                      plusOpen ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    }`}
                    aria-label="Add document or project"
                    title="Add document, new chat or new project"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <textarea
                    ref={chatRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
                    }}
                    rows={1}
                    disabled={!okDocs.length}
                    placeholder={okDocs.length ? "Ask about your documents…  (Enter to send, Shift+Enter for a new line)" : "Upload a document first — drop it anywhere, or paste it"}
                    className="flex-1 resize-none bg-transparent text-[14.5px] leading-relaxed max-h-40 py-1.5 focus:outline-none"
                    style={{ height: "auto" }}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                    }}
                  />
                  {speech.supported && (
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => (speech.listening ? speech.stop() : speech.start())}
                      className={`shrink-0 p-2 rounded-xl transition ${
                        speech.listening ? "bg-rose-600 text-white animate-pulse" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      }`}
                      aria-label="Dictate"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => sendChat()}
                    disabled={!chatInput.trim() || chatBusy || !okDocs.length}
                    className="shrink-0 p-2 rounded-xl bg-slate-900 text-white disabled:opacity-25 hover:bg-slate-800 transition"
                    aria-label="Send"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 text-center">
                {speech.listening && speech.interim ? speech.interim : DISCLAIMER}
              </p>
    </div>
  );

  const TABS: { key: Tab; label: string; icon: any; badge?: number }[] = [
    { key: "chat", label: "Chat", icon: MessageSquare, badge: threads.length || undefined },
    { key: "versions", label: "Versions", icon: Layers, badge: versions.length || undefined },
    { key: "compare", label: "Compare", icon: GitCompare, badge: compareIds.length || undefined },
    { key: "report", label: "Report", icon: FileText },
  ];

  return (
    <div
      // AppShell's <main> adds p-4/sm:p-6 plus pb-24/md:pb-20, so a bare
      // 100vh-4rem overflowed and pushed the composer under the fold.
      className="relative flex h-[calc(100vh-4rem-2rem-6rem)] sm:h-[calc(100vh-4rem-3rem-5rem)] md:h-[calc(100vh-4rem-3rem-5rem)] min-h-[24rem] overflow-hidden bg-white"
      onDragEnter={(e) => {
        if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="absolute inset-0 z-50 bg-indigo-600/10 backdrop-blur-sm border-4 border-dashed border-indigo-500 rounded-2xl m-3 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload className="w-14 h-14 mx-auto text-indigo-600" />
            <div className="text-[20px] font-black text-indigo-800 mt-3">Drop to add to this project</div>
            <div className="text-[14px] font-bold text-indigo-600/80 mt-1">
              PDF · Word · Excel · CSV · JSON · text
            </div>
          </div>
        </div>
      )}
      {/* ======================================================= SIDE PANEL == */}
      {/* On phones the panel slides over the content — a fixed 320px column
          left the chat pane about 55px wide on a 375px screen. */}
      {sidebar && (
        <div
          className="md:hidden fixed inset-0 bg-slate-900/40 z-30"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside
        className={`shrink-0 border-r border-slate-200 bg-slate-50/70 flex flex-col transition-all duration-200
          max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-2xl ${
          sidebar ? "w-80 xl:w-[22rem]" : "w-0 overflow-hidden max-md:hidden"
        }`}
      >
        <div className="px-4 py-3.5 border-b border-slate-200">
          <div className="relative">
            <button
              onClick={() => setShowProjects((s) => !s)}
              className="w-full flex items-center gap-2 text-left"
            >
              <ScanSearch className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="flex-1 min-w-0 text-[14px] font-black text-slate-900 truncate">
                {project.title}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
            {showProjects && (
              <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-80 overflow-y-auto">
                <button
                  onClick={() => {
                    const p = newProject();
                    setProject(p); setActiveResearchId(p.id); setShowProjects(false);
                    setTab("chat"); setError("");
                  }}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-black text-indigo-700 hover:bg-indigo-50 border-b border-slate-100"
                >
                  <Plus className="w-4 h-4" /> New project
                </button>
                {projects.map((p) => (
                  <div key={p.id} className="flex items-center gap-1 px-2 py-1.5 hover:bg-slate-50 border-b border-slate-50 last:border-0">
                    <button
                      onClick={() => { setProject(p); setActiveResearchId(p.id); setShowProjects(false); setReportId(""); }}
                      className="flex-1 text-left min-w-0 px-1.5"
                    >
                      <div className="text-[13px] font-bold text-slate-900 truncate">{p.title}</div>
                      <div className="text-[11px] text-slate-400">
                        {p.docs.length} doc · {(p.versions || []).length} version{(p.versions || []).length === 1 ? "" : "s"}
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        // Deletes documents, every analysis version and all chat
                        // threads — irreversible, so it must be confirmed.
                        const vs = (p.versions || []).length;
                        if (!window.confirm(
                          `Delete "${p.title}"?\n\n${p.docs.length} document(s), ${vs} version(s) and all its chats will be permanently removed. This cannot be undone.`
                        )) return;
                        deleteResearchProject(p.id);
                        setProjects(getResearchProjects());
                      }}
                      className="p-1.5 text-slate-300 hover:text-rose-600"
                      aria-label={`Delete ${p.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* chat history */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11.5px] font-black uppercase tracking-wide text-slate-500">Chats</h3>
              <button
                onClick={() => {
                  const t = newThread();
                  persist({ ...project, chats: [...threads, t], activeChatId: t.id });
                  setTab("chat");
                }}
                className="text-[12px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>
            {!threads.length ? (
              <p className="text-[12px] text-slate-400">No chats yet — ask something to start one.</p>
            ) : (
              <div className="space-y-1">
                {[...threads].reverse().map((t) => {
                  const active = activeThread?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-2 transition ${
                        active ? "bg-white border border-indigo-200" : "hover:bg-white/70 border border-transparent"
                      }`}
                    >
                      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                      {renaming === t.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            persist({
                              ...project,
                              chats: threads.map((x) => (x.id === t.id ? { ...x, title: renameText.trim() || x.title } : x)),
                            });
                            setRenaming("");
                          }}
                          className="flex-1 min-w-0"
                        >
                          <input
                            autoFocus
                            value={renameText}
                            onChange={(e) => setRenameText(e.target.value)}
                            onBlur={() => setRenaming("")}
                            className="w-full px-1.5 py-0.5 rounded border border-slate-300 text-[12.5px] font-bold focus:outline-none"
                          />
                        </form>
                      ) : (
                        <button
                          onClick={() => { persist({ ...project, activeChatId: t.id }); setTab("chat"); }}
                          onDoubleClick={() => { setRenaming(t.id); setRenameText(t.title); }}
                          className="flex-1 min-w-0 text-left"
                          title="Double-click to rename"
                        >
                          <span className={`block text-[12.5px] truncate ${active ? "font-black text-slate-900" : "font-bold text-slate-600"}`}>
                            {t.title}
                          </span>
                          <span className="block text-[10.5px] text-slate-400">
                            {t.messages.length} message{t.messages.length === 1 ? "" : "s"}
                          </span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const rest = threads.filter((x) => x.id !== t.id);
                          persist({
                            ...project,
                            chats: rest,
                            activeChatId: activeThread?.id === t.id ? rest[rest.length - 1]?.id || "" : project.activeChatId,
                          });
                        }}
                        className="text-slate-300 hover:text-rose-600 shrink-0 transition md:opacity-0 md:group-hover:opacity-100"
                        aria-label={`Delete chat ${t.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* documents */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11.5px] font-black uppercase tracking-wide text-slate-500">Documents</h3>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-[12px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
              </button>
            </div>
            <input
              ref={fileRef} type="file" multiple className="hidden"
              accept=".pdf,.docx,.xlsx,.xls,.csv,.tsv,.json,.txt,.md,.markdown"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            {!project.docs.length ? (
              <button
                onClick={() => fileRef.current?.click()}
                className={`w-full rounded-xl border-2 border-dashed px-3 py-6 text-center transition ${
                  dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 hover:border-indigo-400"
                }`}
              >
                <Upload className="w-5 h-5 mx-auto text-slate-400" />
                <div className="text-[12.5px] font-bold text-slate-600 mt-1.5">Drop or click to upload</div>
                <div className="text-[11px] text-slate-400 mt-0.5">PDF · DOCX · XLSX · CSV · TXT</div>
              </button>
            ) : (
              <div className="space-y-1.5">
                {project.docs.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white border border-slate-200">
                    <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-bold text-slate-900 truncate">{d.name}</div>
                      <div className="text-[10.5px] text-slate-400 tabular-nums">
                        {d.kind.toUpperCase()} · {d.words.toLocaleString()} words{d.pages ? ` · ${d.pages}p` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => persist({ ...project, docs: project.docs.filter((x) => x.name !== d.name) })}
                      className="text-slate-300 hover:text-rose-600"
                      aria-label={`Remove ${d.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* focus + run */}
          <section>
            <button
              onClick={() => setShowSetup((v) => !v)}
              className="w-full flex items-center justify-between text-[11.5px] font-black uppercase tracking-wide text-slate-500 mb-2 hover:text-slate-700"
            >
              <span>Analysis setup</span>
              <span className="flex items-center gap-1.5 normal-case tracking-normal text-[11px] font-bold text-slate-400">
                {meta(analyst).short}
                {autoVerify && verifiers.length ? ` + ${verifiers.length} check` : ""}
                <ChevronDown className={`w-3.5 h-3.5 transition ${showSetup ? "rotate-180" : ""}`} />
              </span>
            </button>
          {/* model */}
          <section className={showSetup ? "" : "hidden"}>
            <h3 className="text-[11.5px] font-black uppercase tracking-wide text-slate-500 mb-2">
              Analyst model
            </h3>
            {!providers.length ? (
              <p className="text-[12px] text-amber-700">
                No provider keys found. Add one to <code className="font-mono">.env.local</code>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {providers.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setAnalyst(p); setVerifiers((v) => v.filter((x) => x !== p)); }}
                    className={`px-2.5 py-1 rounded-lg text-[12px] font-black border transition ${
                      analyst === p ? meta(p).tone : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {meta(p).short}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* verifiers */}
          <section className={showSetup ? "" : "hidden"}>
            <h3 className="text-[11.5px] font-black uppercase tracking-wide text-slate-500 mb-2">
              Cross-verify with
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {providers.filter((p) => p !== analyst).map((p) => (
                <button
                  key={p}
                  onClick={() => setVerifiers((v) => (v.includes(p) ? v.filter((x) => x !== p) : [...v, p]))}
                  className={`px-2.5 py-1 rounded-lg text-[12px] font-black border transition ${
                    verifiers.includes(p) ? meta(p).tone : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {verifiers.includes(p) ? "✓ " : ""}{meta(p).short}
                </button>
              ))}
              {!providers.filter((p) => p !== analyst).length && (
                <span className="text-[12px] text-slate-400">Add a second key to cross-verify.</span>
              )}
            </div>
          </section>

            <div className={showSetup ? "" : "hidden"}>
              <h3 className="text-[11.5px] font-black uppercase tracking-wide text-slate-500 mb-1.5">
                Focus <span className="font-bold normal-case text-slate-400">(optional)</span>
              </h3>
            <textarea
              value={project.focus}
              onChange={(e) => setProject({ ...project, focus: e.target.value })}
              onBlur={() => persist(project)}
              rows={2}
              placeholder="e.g. concentrate on margins"
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-[12.5px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
            />
            </div>
            <label className={`flex items-center gap-2 mt-2 text-[12px] font-bold text-slate-600 cursor-pointer ${showSetup ? "" : "hidden"}`}>
              <input
                type="checkbox"
                checked={autoVerify}
                onChange={(e) => setAutoVerify(e.target.checked)}
                disabled={!verifiers.length}
                className="accent-indigo-600"
              />
              Cross-verify automatically
            </label>
            <button
              onClick={() => runAnalysis()}
              disabled={analysing || !okDocs.length || !analyst}
              className="mt-2 w-full py-2.5 rounded-xl bg-indigo-600 text-white text-[13.5px] font-black hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {analysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {analysing
                ? stage === "verifying" ? "Cross-verifying…" : "Analysing…"
                : versions.length ? `Run version ${versions.length + 1}` : autoVerify && verifiers.length ? "Analyse & verify" : "Analyse"}
            </button>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {versions.length
                ? "Each run is kept — earlier versions are never overwritten."
                : "Shortcut: ⌘/Ctrl + Enter"}
            </p>
          </section>

          {/* versions list */}
          {!!versions.length && (
            <section>
              <h3 className="text-[11.5px] font-black uppercase tracking-wide text-slate-500 mb-2">
                Versions · tick to compare
              </h3>
              <div className="space-y-1.5">
                {versions.map((v) => (
                  <label
                    key={v.id}
                    className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition ${
                      compareIds.includes(v.id) ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={compareIds.includes(v.id)}
                      onChange={() => toggleCompare(v.id)}
                      className="mt-0.5 accent-indigo-600"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12.5px] font-black text-slate-900 truncate">{v.label}</span>
                      <span className="flex items-center gap-1.5 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${meta(v.provider).dot}`} />
                        <span className="text-[10.5px] font-bold text-slate-500">{meta(v.provider).short}</span>
                        <span className="text-[10.5px] text-slate-400">· {v.analysis?.claims?.length || 0} claims</span>
                        {v.verification && (
                          <span className="text-[10.5px] font-black text-emerald-600">· {v.verification.score}%</span>
                        )}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          <div className="pt-1 space-y-1">
            {project.aiTokens > 0 && (
              <p className="text-[11px] text-slate-400 tabular-nums">
                AI tokens on this project: {project.aiTokens.toLocaleString()}
              </p>
            )}
            <StorageMeter deps={[projects, project]} />
          </div>
        </div>
      </aside>

      {/* ============================================================= MAIN == */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* top bar */}
        <header className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
          <button
            onClick={() => setSidebar((s) => !s)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label={sidebar ? "Hide side panel" : "Show side panel"}
          >
            {sidebar ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
          </button>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3.5 py-1.5 rounded-lg text-[13px] font-black whitespace-nowrap flex items-center gap-1.5 transition ${
                  tab === t.key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
                {t.badge != null && (
                  <span className={`px-1.5 rounded text-[10.5px] ${tab === t.key ? "bg-white/20" : "bg-slate-200 text-slate-600"}`}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <button
            onClick={() => {
              const np = newProject();
              setProject(np);
              setActiveResearchId(np.id);
              setProjects(getResearchProjects());
              setTab("chat");
              setError("");
              setReportId("");
            }}
            className="ml-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[12.5px] font-black hover:bg-indigo-700 flex items-center gap-1.5 shrink-0"
            title="Start a new research project"
          >
            <Plus className="w-3.5 h-3.5" /> New project
          </button>
          {tab === "chat" && !!chat.length && (
            <button
              onClick={() => {
                const t = newThread();
                persist({ ...project, chats: [...threads, t], activeChatId: t.id });
              }}
              className="ml-2 px-3 py-1.5 rounded-lg border border-slate-200 text-[12.5px] font-black text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> New chat
            </button>
          )}
          <span className="ml-auto text-[12px] font-bold text-slate-400 hidden sm:block">
            {okDocs.length} doc{okDocs.length === 1 ? "" : "s"}
            {okDocs.length ? ` · ${okDocs.reduce((a, d) => a + d.words, 0).toLocaleString()} words` : ""}
          </span>
        </header>

        {/* A run takes 30-60s — say which half it is in, not just "loading". */}
        {analysing && (
          <div className="shrink-0 mx-4 mt-3 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-black text-indigo-900">
                  {stage === "verifying"
                    ? `Cross-verifying with ${verifiers.map((v) => meta(v).short).join(" and ")}…`
                    : `${meta(analyst).short} is reading ${okDocs.length} document${okDocs.length === 1 ? "" : "s"}…`}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={`h-1.5 flex-1 rounded-full ${stage ? "bg-indigo-600" : "bg-indigo-200"}`} />
                  <span className={`h-1.5 flex-1 rounded-full ${stage === "verifying" ? "bg-indigo-600" : "bg-indigo-200"}`} />
                </div>
                <div className="flex justify-between text-[11px] font-bold text-indigo-500 mt-1">
                  <span>1. Extract claims</span>
                  <span>{autoVerify && verifiers.length ? "2. Independent check" : "2. Skipped"}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="shrink-0 flex items-start gap-2.5 mx-4 mt-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError("")} className="text-rose-400 hover:text-rose-700"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ---------------------------------------------------------- CHAT -- */}
        {tab === "chat" && (
          <>
            <div
              ref={scrollRef}
              className={`flex-1 overflow-y-auto ${!chat.length ? "flex items-center" : ""}`}
            >
              <div className="w-full max-w-3xl mx-auto px-4 py-6 space-y-6">
                {!chat.length ? (
                  <div className="py-8">
                    {!okDocs.length ? (
                      /* Nothing uploaded — the drop zone IS the page, not a link
                         tucked into the side panel. */
                      <>
                      <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="w-full rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 px-6 py-12 text-center transition disabled:opacity-60"
                      >
                        {uploading ? (
                          <Loader2 className="w-12 h-12 mx-auto text-indigo-600 animate-spin" />
                        ) : (
                          <Upload className="w-12 h-12 mx-auto text-slate-400" />
                        )}
                        <h2 className="text-[21px] font-black text-slate-800 mt-4">
                          {uploading ? "Reading your document…" : "Drop a document here"}
                        </h2>
                        <p className="text-[14.5px] text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
                          Click to browse, drag a file anywhere on this page, or just paste one.
                          PDF, Word, Excel, CSV, JSON or plain text.
                        </p>
                        <p className="text-[12.5px] text-slate-400 mt-3">
                          Files stay on this machine — only the analysis calls you trigger leave it.
                        </p>
                      </button>
                      <div className="mt-4">{composer}</div>
                      </>
                    ) : (
                      <>
                        {/* Documents in, no version yet — put the next step here. */}
                        {!versions.length && (
                          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 mb-6">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="min-w-0">
                                <h2 className="text-[17px] font-black text-slate-900">
                                  {providers.length
                                    ? `Ready to analyse ${okDocs.length} document${okDocs.length === 1 ? "" : "s"}`
                                    : "No AI provider is configured"}
                                </h2>
                                <p className="text-[13.5px] text-slate-600 mt-1">
                                  {!providers.length ? (
                                    <>
                                      Add <code className="font-mono">OPENAI_API_KEY</code>,{" "}
                                      <code className="font-mono">ANTHROPIC_API_KEY</code>,{" "}
                                      <code className="font-mono">GEMINI_API_KEY</code> or{" "}
                                      <code className="font-mono">GROQ_API_KEY</code> to{" "}
                                      <code className="font-mono">.env.local</code> and restart — the button stays
                                      disabled until one is present.
                                    </>
                                  ) : (
                                    <>{meta(analyst).short} reads the source and pulls out checkable claims
                                  {autoVerify && verifiers.length
                                    ? `, then ${verifiers.map((v) => meta(v).short).join(" and ")} independently check every one.`
                                    : "."}</>
                                  )}
                                </p>
                              </div>
                              <button
                                onClick={() => runAnalysis()}
                                disabled={analysing || !analyst}
                                className="shrink-0 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-[14px] font-black hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-2"
                              >
                                {analysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                {analysing
                                  ? stage === "verifying" ? "Cross-verifying…" : "Analysing…"
                                  : autoVerify && verifiers.length ? "Analyse & verify" : "Analyse"}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="text-center py-4">
                          <ScanSearch className="w-11 h-11 mx-auto text-slate-300" />
                          <h2 className="text-[20px] font-black text-slate-800 mt-3">
                            Ask anything about your documents
                          </h2>
                          <p className="text-[14px] text-slate-500 mt-1.5 max-w-md mx-auto">
                            Answers come from your uploaded files only — anything they don&apos;t cover is reported as
                            missing, not guessed.
                          </p>
                          <div className="flex flex-wrap justify-center gap-2 mt-6">
                            {[
                              "Summarise the key points",
                              "What numbers are stated?",
                              "What is NOT covered here?",
                              "What would a sceptic question?",
                            ].map((s) => (
                              <button
                                key={s}
                                onClick={() => sendChat(s)}
                                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* sits right under the prompts instead of at the
                            bottom of an otherwise empty page */}
                        <div className="mt-4">{composer}</div>
                      </>
                    )}
                  </div>
                ) : (
                  chat.map((m) => (
                    <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                      {m.role === "user" ? (
                        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-indigo-600 text-white text-[14px] leading-relaxed whitespace-pre-wrap">
                          {m.content}
                        </div>
                      ) : (
                        <div>
                          {m.provider && (
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className={`w-2 h-2 rounded-full ${meta(m.provider).dot}`} />
                              <span className="text-[11.5px] font-black text-slate-500">{meta(m.provider).short}</span>
                            </div>
                          )}
                          <div
                            className={`prose prose-sm max-w-none text-[14.5px] leading-relaxed ${
                              m.error ? "text-rose-700" : "text-slate-800"
                            } prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-headings:font-black prose-strong:text-slate-900`}
                          >
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
                {chatBusy && (
                  <div className="flex items-center gap-2 text-[13.5px] text-slate-400 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" /> Reading the documents…
                  </div>
                )}
              </div>
            </div>

            {/* Pinned only when there are messages. It must UNMOUNT rather than
                hide: while hidden it still claimed chatRef, so autofocus and
                dictation targeted a display:none textarea. */}
            {/* One composer, rendered in two places. It used to be duplicated
                inline here, which meant every change (the + menu, for one) only
                landed on one of the two copies — and both bound chatRef. */}
            {!!chat.length && (
              <div className="shrink-0 border-t border-slate-200 bg-white">{composer}</div>
            )}
          </>
        )}

        {/* ------------------------------------------------------ VERSIONS -- */}
        {tab === "versions" && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto px-5 py-6 space-y-4">
              {versions.length >= 2 && (
                <div className="flex flex-wrap items-center gap-2 pb-1">
                  <button
                    onClick={() => { persist({ ...project, compareIds: versions.map((v) => v.id) }); setTab("compare"); }}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-[13px] font-black hover:bg-slate-800 flex items-center gap-2"
                  >
                    <GitCompare className="w-4 h-4" /> Compare all {versions.length}
                  </button>
                  {compareIds.length >= 2 && (
                    <button
                      onClick={() => setTab("compare")}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 text-[13px] font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Compare selected ({compareIds.length})
                    </button>
                  )}
                </div>
              )}
              {!versions.length ? (
                <EmptyState
                  icon={<Layers className="w-11 h-11 mx-auto text-slate-300" />}
                  title="No versions yet"
                  body="Run an analysis from the side panel. Every run is stored as its own version, so you can re-run with a different model and compare the results instead of losing the first one."
                />
              ) : (
                versions.map((v) => {
                  const ver = v.verification;
                  return (
                    <div key={v.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                        <div className="min-w-0">
                          {renaming === v.id ? (
                            <form
                              onSubmit={(e) => { e.preventDefault(); saveRename(v.id); }}
                              className="flex items-center gap-2"
                            >
                              <input
                                autoFocus
                                value={renameText}
                                onChange={(e) => setRenameText(e.target.value)}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[15px] font-black focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                              />
                              <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-black">
                                Save
                              </button>
                            </form>
                          ) : (
                            <h3 className="text-[17px] font-black text-slate-900 flex items-center gap-2">
                              {v.label}
                              <button
                                onClick={() => { setRenaming(v.id); setRenameText(v.label); }}
                                className="text-slate-300 hover:text-indigo-600"
                                aria-label="Rename version"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </h3>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${meta(v.provider).tone}`}>
                              Analysed by {meta(v.provider).short}
                            </span>
                            {(ver?.reviewers || []).filter((r: any) => r.ok).map((r: any) => (
                              <span key={r.provider} className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${meta(r.provider).tone}`}>
                                Verified by {meta(r.provider).short}
                              </span>
                            ))}
                            <span className="text-[11.5px] text-slate-400">
                              {new Date(v.createdAt).toLocaleString()} · {v.docNames.join(", ")}
                            </span>
                          </div>
                          {v.focus && (
                            <p className="text-[12.5px] text-slate-500 mt-1.5">Focus: {v.focus}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {ver && (
                            <div className="text-right">
                              <div className="text-[10.5px] font-black uppercase tracking-wide text-slate-400">Corroboration</div>
                              <div className={`text-2xl font-black tabular-nums ${
                                ver.score >= 70 ? "text-emerald-600" : ver.score >= 40 ? "text-amber-600" : "text-rose-600"
                              }`}>{ver.score}%</div>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              if (!window.confirm(`Delete ${v.label}? This analysis cannot be recovered.`)) return;
                              removeVersion(v.id);
                            }}
                            className="p-2 text-slate-300 hover:text-rose-600"
                            aria-label={`Delete ${v.label}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="p-5 space-y-3">
                        <p className="text-[14px] text-slate-700 leading-relaxed line-clamp-4">{v.analysis.summary}</p>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg text-[12px] font-black bg-slate-100 text-slate-600">
                            {v.analysis.claims.length} claims
                          </span>
                          {ver && (
                            <>
                              <span className="px-2.5 py-1 rounded-lg text-[12px] font-black bg-emerald-50 text-emerald-700">
                                {ver.consensus.filter((c: any) => c.majority === "Supported").length} supported
                              </span>
                              <span className="px-2.5 py-1 rounded-lg text-[12px] font-black bg-rose-50 text-rose-700">
                                {ver.consensus.filter((c: any) => c.majority === "Contradicted").length} contradicted
                              </span>
                              <span className="px-2.5 py-1 rounded-lg text-[12px] font-black bg-amber-50 text-amber-700">
                                {ver.consensus.filter((c: any) => c.disputed).length} disputed
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          {!ver && (
                            <button
                              onClick={() => verifyVersion(v)}
                              disabled={verifyingId === v.id || !verifiers.length}
                              className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-black hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2"
                            >
                              {verifyingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                              {verifyingId === v.id ? "Verifying…" : `Cross-verify with ${verifiers.length || 0} model${verifiers.length === 1 ? "" : "s"}`}
                            </button>
                          )}
                          <button
                            onClick={() => { setReportId(v.id); setTab("report"); }}
                            className="px-3.5 py-2 rounded-xl border border-slate-200 text-[13px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <FileText className="w-4 h-4" /> Open report
                          </button>
                          <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 text-[13px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={compareIds.includes(v.id)}
                              onChange={() => toggleCompare(v.id)}
                              className="accent-indigo-600"
                            />
                            Compare
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------- COMPARE -- */}
        {tab === "compare" && (
          <div className="flex-1 overflow-auto">
            <div className="max-w-[1400px] mx-auto px-5 py-6 space-y-4">
              {!comparison ? (
                <EmptyState
                  icon={<GitCompare className="w-11 h-11 mx-auto text-slate-300" />}
                  title={versions.length < 2 ? "Run a second version to compare" : "Tick at least two versions"}
                  body={
                    versions.length < 2
                      ? "Re-run the analysis with a different model or a different focus. The two runs are then lined up claim by claim so you can see where they agree and where they don't."
                      : "Use the checkboxes in the side panel or on the Versions tab to choose which runs to line up."
                  }
                />
              ) : (
                <>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h2 className="text-[18px] font-black text-slate-900 flex items-center gap-2">
                      <Columns3 className="w-5 h-5 text-indigo-600" /> Version comparison
                    </h2>
                    <p className="text-[13.5px] text-slate-600 mt-1.5">{comparison.summary}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                      {[
                        { label: "Raised by all", value: comparison.sharedClaims, cls: "text-emerald-600" },
                        { label: "Only in some", value: comparison.uniqueClaims, cls: "text-amber-600" },
                        { label: "Conflicting verdicts", value: comparison.conflictingClaims, cls: "text-rose-600" },
                        { label: "Overlap", value: `${comparison.overlapPct.toFixed(0)}%`, cls: "text-slate-800" },
                      ].map((s) => (
                        <div key={s.label} className="bg-slate-50 rounded-xl px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{s.label}</div>
                          <div className={`text-[22px] font-black tabular-nums ${s.cls}`}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* per-version summary cards */}
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {comparison.versions.map((v) => (
                      <div key={v.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${meta(v.provider).dot}`} />
                          <span className="text-[15px] font-black text-slate-900 truncate">{v.label}</span>
                          {v.score != null && (
                            <span className={`ml-auto text-[15px] font-black tabular-nums ${
                              v.score >= 70 ? "text-emerald-600" : v.score >= 40 ? "text-amber-600" : "text-rose-600"
                            }`}>{v.score}%</span>
                          )}
                        </div>
                        <div className="text-[12px] font-bold text-slate-500 mt-1">
                          {meta(v.provider).short} · {v.claims} claims
                          {v.reviewers.length ? ` · verified by ${v.reviewers.map((r) => meta(r).short).join(", ")}` : " · not verified"}
                        </div>
                        {v.verified && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-emerald-50 text-emerald-700">{v.supported} supported</span>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-rose-50 text-rose-700">{v.contradicted} contradicted</span>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-amber-50 text-amber-700">{v.disputed} disputed</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* claim matrix */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100">
                      <h3 className="text-[15px] font-black text-slate-800">Claim by claim</h3>
                      <p className="text-[12.5px] text-slate-500 mt-0.5">
                        Claims worded differently by different models are matched on meaning, so the same finding lines up
                        on one row.
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[13px]">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="text-left px-4 py-3 font-black uppercase tracking-wide text-[11px] min-w-[280px]">Claim</th>
                            {comparison.versions.map((v) => (
                              <th key={v.id} className="text-left px-4 py-3 font-black uppercase tracking-wide text-[11px] whitespace-nowrap">
                                <span className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${meta(v.provider).dot}`} />
                                  {v.label}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {comparison.rows.map((row) => (
                            <tr key={row.key} className={row.conflicting ? "bg-amber-50/50" : "hover:bg-slate-50/60"}>
                              <td className="px-4 py-3 align-top">
                                <div className="font-bold text-slate-900 leading-snug">{row.claim}</div>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-black ${
                                    row.presentIn === comparison.versions.length
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-amber-100 text-amber-800"
                                  }`}>
                                    {row.presentIn}/{comparison.versions.length} versions
                                  </span>
                                  {row.conflicting && (
                                    <span className="px-1.5 py-0.5 rounded text-[10.5px] font-black bg-rose-100 text-rose-700">
                                      conflicting verdicts
                                    </span>
                                  )}
                                </div>
                              </td>
                              {comparison.versions.map((v) => {
                                const cell: any = row.byVersion[v.id];
                                return (
                                  <td key={v.id} className="px-4 py-3 align-top">
                                    {!cell?.present ? (
                                      <span className="text-[12px] font-bold text-slate-300">not raised</span>
                                    ) : cell.verdict ? (
                                      <span className={`inline-block px-2 py-0.5 rounded-md text-[11.5px] font-black border ${VERDICT_TONE[cell.verdict]}`}>
                                        {cell.verdict}
                                        {cell.agreement != null && (
                                          <span className="font-bold opacity-70"> · {Math.round(cell.agreement)}%</span>
                                        )}
                                      </span>
                                    ) : (
                                      <span className="inline-block px-2 py-0.5 rounded-md text-[11.5px] font-black bg-slate-100 text-slate-500 border border-slate-200">
                                        raised, not verified
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-[12px] text-slate-500 italic">
                      A claim only one version raised is not automatically wrong, and one every version raised is not
                      automatically right — this shows where the models agree, nothing more. {DISCLAIMER}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* -------------------------------------------------------- REPORT -- */}
        {tab === "report" && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-5 py-6 space-y-5">
              {!reportVersion ? (
                <EmptyState
                  icon={<FileText className="w-11 h-11 mx-auto text-slate-300" />}
                  title="No report yet"
                  body="Run an analysis first. The report pulls together the summary, findings, figures and every verified claim into one readable write-up you can export."
                />
              ) : (
                <>
                  {/* version switcher + export */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-black uppercase tracking-wide text-slate-500">Showing</span>
                    {versions.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setReportId(v.id)}
                        className={`px-3 py-1.5 rounded-lg text-[12.5px] font-black border transition ${
                          reportVersion.id === v.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      {providers.filter((p) => p !== reportVersion.provider).length > 0 && (
                        <div className="flex items-center gap-1.5 mr-1">
                          <span className="text-[12px] font-bold text-slate-400">Re-run with</span>
                          {providers
                            .filter((p) => p !== reportVersion.provider)
                            .map((p) => (
                              <button
                                key={p}
                                onClick={() => {
                                  const vs = providers.filter((x) => x !== p);
                                  setAnalyst(p);
                                  setVerifiers(vs);
                                  // Pass explicitly — the setState above is not
                                  // visible to runAnalysis on this tick.
                                  runAnalysis({ provider: p, verifiers: vs });
                                }}
                                disabled={analysing}
                                className={`px-2.5 py-1.5 rounded-lg text-[12px] font-black border transition disabled:opacity-40 ${meta(p).tone}`}
                              >
                                {meta(p).short}
                              </button>
                            ))}
                        </div>
                      )}
                      <button onClick={() => doExport(exportReportPdf)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
                        <FileDown className="w-3.5 h-3.5 text-rose-600" /> PDF
                      </button>
                      <button onClick={() => doExport(exportReportDocx)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-600" /> Word
                      </button>
                      <button onClick={() => doExport(exportReportXlsx)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Excel
                      </button>
                    </div>
                  </div>

                  {/* headline */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h1 className="text-[22px] font-black text-slate-900">{reportVersion.analysis.title}</h1>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${meta(reportVersion.provider).tone}`}>
                            Analysed by {meta(reportVersion.provider).short}
                          </span>
                          {(reportVersion.verification?.reviewers || []).filter((r: any) => r.ok).map((r: any) => (
                            <span key={r.provider} className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${meta(r.provider).tone}`}>
                              Verified by {meta(r.provider).short}
                            </span>
                          ))}
                          <span className="text-[11.5px] text-slate-400">
                            {reportVersion.label} · {new Date(reportVersion.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {reportVersion.verification && (
                        <div className="text-right shrink-0">
                          <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">Corroboration</div>
                          <div className={`text-4xl font-black tabular-nums ${
                            reportVersion.verification.score >= 70 ? "text-emerald-600"
                            : reportVersion.verification.score >= 40 ? "text-amber-600" : "text-rose-600"
                          }`}>{reportVersion.verification.score}%</div>
                        </div>
                      )}
                    </div>
                    {reportVersion.verification && (
                      <p className="text-[13.5px] text-slate-600 mt-3 pt-3 border-t border-slate-100">
                        {reportVersion.verification.summary}
                      </p>
                    )}
                  </div>

                  <Card title="Summary">
                    <p className="text-[14.5px] leading-relaxed text-slate-700 whitespace-pre-wrap">
                      {reportVersion.analysis.summary}
                    </p>
                  </Card>

                  {!!reportVersion.analysis.keyFindings?.length && (
                    <Card title="Key findings">
                      <ul className="space-y-2.5">
                        {reportVersion.analysis.keyFindings.map((f: string, i: number) => (
                          <li key={i} className="flex gap-3 text-[14.5px] text-slate-700 leading-relaxed">
                            <span className="w-6 h-6 shrink-0 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center text-[12px] font-black">
                              {i + 1}
                            </span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}

                  {!!reportVersion.analysis.figures?.length && (
                    <Card title="Figures stated in the source">
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {reportVersion.analysis.figures.map((f: any, i: number) => (
                          <div key={i} className="bg-slate-50 rounded-xl px-4 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{f.label}</div>
                            <div className="text-[18px] font-black text-slate-900 tabular-nums mt-0.5">{f.value}</div>
                            <div className="text-[11px] text-slate-400 truncate">{f.source}</div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  <Card title={`Claims${reportVersion.verification ? " & verification" : ""}`}>
                    <div className="space-y-2.5">
                      {reportVersion.analysis.claims.map((c: any, i: number) => {
                        const con = reportVersion.verification?.consensus?.find((x: any) => x.id === c.id);
                        const open = openClaim === `${reportVersion.id}_${c.id}`;
                        return (
                          <div key={c.id} className={`rounded-xl border ${con?.disputed ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
                            <button
                              onClick={() => setOpenClaim(open ? "" : `${reportVersion.id}_${c.id}`)}
                              className="w-full text-left px-4 py-3 flex items-start gap-3"
                            >
                              <span className="w-6 h-6 shrink-0 rounded-lg bg-slate-100 text-slate-600 grid place-items-center text-[12px] font-black mt-0.5">
                                {i + 1}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-[14px] font-bold text-slate-900 leading-snug">{c.claim}</span>
                                <span className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${
                                    c.importance === "High" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-100 text-slate-600 border-slate-200"
                                  }`}>{c.importance}</span>
                                  {con && (
                                    <>
                                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${VERDICT_TONE[con.majority]}`}>
                                        {con.majority}
                                      </span>
                                      <span className="text-[11.5px] font-bold text-slate-500 tabular-nums">
                                        {Math.round(con.agreement)}% agreement
                                      </span>
                                    </>
                                  )}
                                </span>
                              </span>
                              <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 mt-1 transition ${open ? "rotate-180" : ""}`} />
                            </button>
                            {open && (
                              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
                                <blockquote className="text-[13px] text-slate-600 italic border-l-2 border-indigo-300 pl-3 leading-relaxed">
                                  “{c.evidence}” <span className="not-italic text-slate-400">— {c.source}</span>
                                </blockquote>
                                {con && Object.entries(con.byProvider).map(([p, d]: any) => (
                                  <div key={p} className="flex flex-wrap items-start gap-2 px-3 py-2 rounded-lg bg-slate-50">
                                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border shrink-0 ${meta(p).tone}`}>
                                      {meta(p).short}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border shrink-0 ${VERDICT_TONE[d.verdict]}`}>
                                      {d.verdict} · {d.confidence}%
                                    </span>
                                    <span className="text-[12.5px] text-slate-600 flex-1 min-w-[180px]">{d.note}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  {!!reportVersion.analysis.gaps?.length && (
                    <Card title="Gaps — not covered by the source">
                      <ul className="space-y-2">
                        {reportVersion.analysis.gaps.map((g: string, i: number) => (
                          <li key={i} className="text-[14.5px] text-slate-700 flex gap-2.5 leading-relaxed">
                            <span className="text-amber-500 font-black">•</span>{g}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}

                  {!!reportVersion.analysis.questions?.length && (
                    <Card title="Open questions">
                      <ul className="space-y-2">
                        {reportVersion.analysis.questions.map((q: string, i: number) => (
                          <li key={i} className="text-[14.5px] text-slate-700 flex gap-2.5 leading-relaxed">
                            <span className="text-slate-400 font-black">?</span>{q}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}

                  <p className="text-[12px] text-slate-400 italic px-1 pb-4">{DISCLAIMER}</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Browser storage fills up quietly and then drops data. Showing the number
 * turns "my document vanished" into "I can see I need to clear something".
 */
function StorageMeter({ deps }: { deps: any[] }) {
  const [used, setUsed] = useState(0);
  useEffect(() => {
    try {
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) bytes += k.length + (localStorage.getItem(k)?.length || 0);
      }
      setUsed(bytes);
    } catch {
      setUsed(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  if (!used) return null;
  // Browsers give roughly 5 MB of localStorage per origin.
  const pct = Math.min(100, (used / (5 * 1024 * 1024)) * 100);
  const tight = pct > 75;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className="text-slate-400">Browser storage</span>
        <span className={tight ? "text-amber-700" : "text-slate-400"}>
          {(used / 1024 / 1024).toFixed(1)} MB of ~5 MB
        </span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
        <div
          className={`h-full rounded-full ${pct > 90 ? "bg-rose-500" : tight ? "bg-amber-500" : "bg-slate-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {tight && (
        <p className="text-[10.5px] text-amber-700 mt-1">
          Nearly full — delete an old project to make room.
        </p>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h3 className="text-[15px] font-black text-slate-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="py-20 text-center">
      {icon}
      <h2 className="text-[18px] font-black text-slate-700 mt-3">{title}</h2>
      <p className="text-[14px] text-slate-500 mt-1.5 max-w-lg mx-auto leading-relaxed">{body}</p>
    </div>
  );
}
