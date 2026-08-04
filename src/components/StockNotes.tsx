"use client";

import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Trash2, StickyNote, Send, Loader2, AlertTriangle } from "lucide-react";
import { getNotesForSymbol, saveNote, deleteNote } from "@/lib/storage";

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

// Pull the first {...} JSON block out of an AI reply and validate a ticker.
function parseDetect(txt: string): { symbol?: string; topic?: string; category?: string } | null {
  if (!txt) return null;
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const sym = String(o.symbol || "").trim().toUpperCase();
    const okSym = /^[A-Z0-9.\-=^&]{1,15}$/.test(sym) ? sym : "";
    return { symbol: okSym, topic: String(o.topic || "").trim(), category: String(o.category || "").trim() };
  } catch {
    return null;
  }
}

export default function StockNotes({
  symbol,
  stockName,
  compact = false,
  autoPage = "",
  autoSection = "",
}: {
  symbol: string;
  stockName?: string;
  compact?: boolean;
  autoPage?: string; // where the note was written (e.g. "Analyze", "Markets")
  autoSection?: string; // section within that page (e.g. "Technical")
}) {
  const NOTE_CATS = ["General", "Fundamental", "Technical", "News", "Risk", "Watch", "Idea"];
  const [notes, setNotes] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("General");
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [error, setError] = useState("");
  const [detecting, setDetecting] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const isGeneral = !symbol || symbol === "GENERAL";
  const reload = () => setNotes(getNotesForSymbol(symbol));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // Save a text note, auto-tagging the page/section it was written on.
  const persist = (over: { symbol?: string; topic?: string; category?: string }) => {
    const finalSym = over.symbol || symbol;
    saveNote({
      symbol: finalSym,
      stockName: over.symbol && over.symbol !== "GENERAL" ? over.symbol : stockName || symbol,
      type: "text",
      text: text.trim(),
      topic: (over.topic || topic).trim(),
      category: over.category || category,
      page: autoPage || undefined,
      section: autoSection || undefined,
    });
    setText("");
    setTopic("");
    reload();
  };

  const addText = async () => {
    if (!text.trim()) return;
    // Fallback smarts: a GENERAL note has no page/stock context, so ask the AI to
    // identify the stock + topic from what was written instead of dumping it into
    // the GENERAL pile. Notes on a real page/stock skip this (already tagged).
    if (isGeneral && text.trim().length > 12) {
      setDetecting(true);
      try {
        const prompt = `From the note below, identify the stock and a short topic. Return ONLY compact JSON: {"symbol":"<Yahoo ticker, or empty if none>","topic":"<3-6 word topic>","category":"<one of General,Fundamental,Technical,News,Risk,Watch,Idea>"}. For Indian stocks append .NS. Use "" for symbol if no specific stock is mentioned.\n\nNote: """${text.trim()}"""`;
        const res = await fetch("/api/gemini/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const j = await res.json();
        persist(parseDetect(j?.text) || {});
      } catch {
        persist({});
      } finally {
        setDetecting(false);
      }
      return;
    }
    persist({});
  };

  const startRec = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        // Cap size so localStorage isn't blown out (~1.5MB base64 limit per note).
        if (blob.size > 1_100_000) {
          setError("Voice note too long (keep under ~1 min). Not saved.");
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          saveNote({ symbol, stockName: stockName || symbol, type: "voice", audio: reader.result, durationSec: recSecs, topic: topic.trim(), category, page: autoPage || undefined, section: autoSection || undefined });
          reload();
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs((s) => {
        if (s >= 90) { stopRec(); return s; } // hard cap 90s
        return s + 1;
      }), 1000);
    } catch (e: any) {
      setError("Microphone access denied or unavailable.");
    }
  };
  const stopRec = () => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const remove = (id: string) => { deleteNote(id); reload(); };

  return (
    <div className="space-y-3">
      {/* Composer */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <StickyNote className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-black text-slate-700">Notes for {isGeneral ? "General" : symbol}</span>
          <span className="text-[10px] text-slate-400">· {notes.length} saved</span>
          {autoPage && (
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">
              📍 {autoPage}{autoSection ? ` · ${autoSection}` : ""}
            </span>
          )}
          {isGeneral && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">✨ stock auto-detected on save</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (e.g. Q3 results, breakout)"
            className="flex-1 min-w-[10rem] text-sm bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 focus:ring-2 focus:ring-indigo-200 outline-none"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm bg-white border border-slate-200 rounded-xl px-2.5 py-2 font-bold text-slate-600 focus:ring-2 focus:ring-indigo-200 outline-none"
          >
            {NOTE_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addText(); }}
          placeholder={`Write a note while analyzing ${symbol}… (Cmd/Ctrl+Enter to save)`}
          rows={compact ? 2 : 3}
          className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
        />
        <div className="flex items-center justify-between mt-2 gap-2">
          {recording ? (
            <button onClick={stopRec} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 animate-pulse">
              <Square className="w-3.5 h-3.5" /> Stop · {recSecs}s
            </button>
          ) : (
            <button onClick={startRec} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
              <Mic className="w-3.5 h-3.5" /> Voice Note
            </button>
          )}
          <button onClick={addText} disabled={!text.trim() || detecting} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50">
            {detecting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Detecting…</> : <><Send className="w-3.5 h-3.5" /> Save Note</>}
          </button>
        </div>
        {error && <div className="mt-2 text-[11px] text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</div>}
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="text-center text-xs text-slate-400 py-6 bg-slate-50 rounded-xl border border-slate-100">
          No notes yet for {symbol}. Add your first observation above.
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="bg-white border border-slate-200 rounded-xl p-3 group">
              <div className="flex items-start justify-between mb-1.5 gap-2">
                <div className="min-w-0">
                  {(n.topic || n.category || n.page) && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {n.topic && <span className="text-[13px] font-black text-slate-900">{n.topic}</span>}
                      {n.category && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-700">{n.category}</span>
                      )}
                      {n.page && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">📍 {n.page}{n.section ? ` · ${n.section}` : ""}</span>
                      )}
                    </div>
                  )}
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                    {n.type === "voice" ? <Mic className="w-3 h-3 text-indigo-500" /> : <StickyNote className="w-3 h-3 text-amber-500" />}
                    {n.type} · {new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {timeAgo(n.createdAt)}
                  </span>
                </div>
                <button onClick={() => remove(n.id)} className="text-slate-300 hover:text-rose-600 transition md:opacity-0 md:group-hover:opacity-100 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {n.type === "voice" ? (
                <audio controls src={n.audio} className="w-full h-9 mt-1" />
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{n.text}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
