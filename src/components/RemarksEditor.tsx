"use client";

import React, { useEffect, useState } from "react";
import { X, Mic, MicOff, Save } from "lucide-react";
import { useSpeech, SPEECH_LANGS } from "@/lib/useSpeech";

// A big remarks / notes editor with voice dictation. Click any remark to open it;
// speak (mic) or type; Enter saves (Shift+Enter = newline).
export default function RemarksEditor({
  open, title, subtitle, value, onSave, onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  value: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value || "");
  const speech = useSpeech((chunk) => setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${chunk}`));
  useEffect(() => { if (open) setText(value || ""); }, [open, value]);
  if (!open) return null;

  const save = () => { if (speech.listening) speech.stop(); onSave(text.trim()); onClose(); };

  return (
    <div className="fixed inset-0 z-[140] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <div className="font-black text-slate-900 truncate">📝 {title}</div>
            {subtitle && <div className="text-[12px] text-slate-500 truncate">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          <textarea
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}
            placeholder="Type your note… or press the mic and speak."
            rows={8}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
          />
          {speech.listening && (
            <div className="mt-1 text-[13px] text-indigo-600 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse mr-1.5" /> Listening… {speech.interim && <span className="text-slate-400 italic">{speech.interim}</span>}
            </div>
          )}

          {/* Voice controls */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {speech.supported ? (
              <>
                <button onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${speech.listening ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}>
                  {speech.listening ? <><MicOff className="w-4 h-4" /> Stop</> : <><Mic className="w-4 h-4" /> Voice note</>}
                </button>
                <select value={speech.lang} onChange={(e) => speech.setLang(e.target.value)}
                  className="px-2 py-2 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-200">
                  {SPEECH_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </>
            ) : (
              <span className="text-[12px] text-slate-400">Voice not supported in this browser — type instead.</span>
            )}
            {text && <button onClick={() => setText("")} className="text-[12px] font-bold text-slate-400 hover:text-rose-600 ml-1">clear</button>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
          <span className="text-[11px] text-slate-400">Enter to save · Shift+Enter for a new line</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-[13px] font-bold text-slate-500 hover:text-slate-800">Cancel</button>
            <button onClick={save} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[13px] font-bold hover:bg-indigo-700 flex items-center gap-1.5">
              <Save className="w-4 h-4" /> Save &amp; add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
