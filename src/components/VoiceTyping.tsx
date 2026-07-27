"use client";

/**
 * App-wide voice typing.
 *
 * Rather than bolting a mic onto every input in the app, this tracks the last
 * field the user was typing in and dictates into that. One control, every text
 * box — including ones added later.
 *
 * Mounted once in AppShell. Shortcut: Cmd/Ctrl + Shift + V.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, X } from "lucide-react";
import {
  SPEECH_LANGS,
  insertIntoElement,
  isTypableElement,
  useSpeech,
} from "@/lib/useSpeech";

export default function VoiceTyping() {
  // The field to dictate into. Held in a ref because clicking the mic button
  // moves focus, and by then document.activeElement is the button.
  const targetRef = useRef<HTMLElement | null>(null);
  const [targetLabel, setTargetLabel] = useState("");
  const [showLangs, setShowLangs] = useState(false);
  const [toast, setToast] = useState("");

  const describe = (el: HTMLElement): string => {
    const a = el as HTMLInputElement;
    const byLabel = el.getAttribute("aria-label") || a.placeholder || "";
    if (byLabel) return byLabel.length > 40 ? `${byLabel.slice(0, 40)}…` : byLabel;
    return el.tagName === "TEXTAREA" ? "text area" : "text field";
  };

  // Remember every typable field the user touches.
  useEffect(() => {
    const remember = () => {
      const el = document.activeElement as HTMLElement | null;
      if (isTypableElement(el)) {
        targetRef.current = el;
        setTargetLabel(describe(el));
      }
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);

  const handleFinal = useCallback((chunk: string) => {
    const text = chunk.trim();
    if (!text) return;
    const ok = insertIntoElement(targetRef.current, text);
    if (!ok) {
      // Nothing focused — don't drop what was said.
      navigator.clipboard?.writeText(text).catch(() => {});
      setToast("No text box was focused — the dictated text was copied to your clipboard instead.");
      setTimeout(() => setToast(""), 5000);
    }
  }, []);

  const { supported, listening, interim, error, lang, setLang, start, stop } = useSpeech(handleFinal);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Cmd/Ctrl + Shift + V
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && listening) stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, listening, stop]);

  if (!supported) return null;

  return (
    <>
      {/* Mic button. Sits above the notes FAB so neither is covered. */}
      <button
        // Keeps focus in the text field — without this, clicking the button
        // blurs the input and the caret position is lost.
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        title={`Voice typing (${navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Shift+V)`}
        aria-label={listening ? "Stop voice typing" : "Start voice typing"}
        className={`fixed bottom-36 md:bottom-[86px] right-4 md:right-6 z-[90] w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 print:hidden ${
          listening
            ? "bg-rose-600 text-white animate-pulse"
            : "bg-white text-slate-600 border border-slate-200 hover:text-indigo-600"
        }`}
      >
        {listening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>

      {/* Live panel while dictating */}
      {listening && (
        <div className="fixed bottom-52 md:bottom-[150px] right-4 md:right-6 z-[95] w-[min(22rem,calc(100vw-2rem))] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden print:hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 border-b border-rose-100">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600" />
            </span>
            <span className="text-[13px] font-black text-rose-700">Listening…</span>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowLangs((s) => !s)}
              className="ml-auto px-2 py-0.5 rounded-md bg-white border border-rose-200 text-[11.5px] font-black text-rose-700 hover:bg-rose-50"
            >
              {SPEECH_LANGS.find((l) => l.code === lang)?.label || lang}
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={stop}
              className="text-rose-400 hover:text-rose-700"
              aria-label="Stop"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {showLangs && (
            <div className="max-h-44 overflow-y-auto border-b border-slate-100">
              {SPEECH_LANGS.map((l) => (
                <button
                  key={l.code}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setLang(l.code);
                    setShowLangs(false);
                    // Language only takes effect on a fresh recogniser.
                    stop();
                    setTimeout(start, 120);
                  }}
                  className={`w-full text-left px-4 py-2 text-[13px] font-bold hover:bg-slate-50 ${
                    l.code === lang ? "text-indigo-700 bg-indigo-50/60" : "text-slate-600"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}

          <div className="px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">
              Typing into
            </div>
            <div className="text-[13px] font-bold text-slate-800 truncate">
              {targetLabel || "nothing focused — click a text box first"}
            </div>
            <div className="mt-2 min-h-[2.5rem] text-[13.5px] text-slate-500 italic">
              {interim || "Speak now…"}
            </div>
          </div>
        </div>
      )}

      {(error || toast) && (
        <div className="fixed bottom-52 md:bottom-[150px] right-4 md:right-6 z-[95] w-[min(22rem,calc(100vw-2rem))] px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-800 shadow-lg print:hidden">
          {error || toast}
        </div>
      )}
    </>
  );
}
