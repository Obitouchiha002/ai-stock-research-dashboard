"use client";

/**
 * Web Speech API wrapper for dictation.
 *
 * Speech recognition is browser-native (Chrome, Edge, Safari) — nothing is sent
 * to this app's servers and no API key is involved. Firefox has no support, so
 * callers must check `supported` and hide the control rather than offering a
 * button that silently does nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export const SPEECH_LANGS: { code: string; label: string }[] = [
  { code: "en-IN", label: "English (India)" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "mr-IN", label: "मराठी" },
  { code: "gu-IN", label: "ગુજરાતી" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "bn-IN", label: "বাংলা" },
];

const LANG_KEY = "sa_speech_lang";

function getRecognitionCtor(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function speechSupported(): boolean {
  return !!getRecognitionCtor();
}

export type SpeechState = {
  supported: boolean;
  listening: boolean;
  /** Text confirmed by the engine since start(). */
  finalText: string;
  /** Live guess for the phrase still being spoken. */
  interim: string;
  error: string;
  lang: string;
  setLang: (l: string) => void;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

/**
 * @param onFinal called with each confirmed chunk as it lands, so a caller can
 *                stream text into an input instead of waiting for stop().
 */
export function useSpeech(onFinal?: (chunk: string) => void): SpeechState {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [lang, setLangState] = useState("en-IN");

  const recRef = useRef<any>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  // Distinguishes a user-requested stop from the engine's own auto-timeout.
  const wantListening = useRef(false);

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved) setLangState(saved);
    } catch {
      /* private mode — keep the default */
    }
  }, []);

  const setLang = useCallback((l: string) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const build = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let fin = "";
      let inter = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else inter += r[0].transcript;
      }
      if (fin) {
        setFinalText((t) => t + fin);
        onFinalRef.current?.(fin);
      }
      setInterim(inter);
    };

    rec.onerror = (e: any) => {
      const code = String(e?.error || "");
      // "no-speech" and "aborted" are normal in continuous mode — a silent
      // pause is not an error worth showing the user.
      if (code === "no-speech" || code === "aborted") return;
      setError(
        code === "not-allowed" || code === "service-not-allowed"
          ? "Microphone access was blocked. Allow it in your browser's site settings."
          : code === "network"
            ? "Speech recognition needs a network connection."
            : `Speech recognition error: ${code}`,
      );
      wantListening.current = false;
      setListening(false);
    };

    // Browsers cut the stream after a pause; restart while the user still
    // wants to dictate so long passages don't need repeated clicking.
    rec.onend = () => {
      if (wantListening.current) {
        try {
          rec.start();
          return;
        } catch {
          /* fall through to stopping */
        }
      }
      setListening(false);
      setInterim("");
    };

    return rec;
  }, [lang]);

  const start = useCallback(() => {
    if (!getRecognitionCtor()) return;
    setError("");
    wantListening.current = true;
    try {
      recRef.current?.abort?.();
    } catch {
      /* ignore */
    }
    const rec = build();
    if (!rec) return;
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (e: any) {
      setError(e?.message || "Could not start the microphone.");
      wantListening.current = false;
      setListening(false);
    }
  }, [build]);

  const stop = useCallback(() => {
    wantListening.current = false;
    try {
      recRef.current?.stop?.();
    } catch {
      /* ignore */
    }
    setListening(false);
    setInterim("");
  }, []);

  const reset = useCallback(() => {
    setFinalText("");
    setInterim("");
    setError("");
  }, []);

  // Never leave the mic open when the component goes away.
  useEffect(
    () => () => {
      wantListening.current = false;
      try {
        recRef.current?.abort?.();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return { supported, listening, finalText, interim, error, lang, setLang, start, stop, reset };
}

/**
 * Write text into a React-controlled input/textarea at the caret.
 *
 * Assigning `.value` directly does NOT fire React's onChange — React installs
 * its own value setter on the element instance. Calling the prototype setter
 * and then dispatching a bubbling `input` event is what makes React see it.
 */
export function insertIntoElement(el: HTMLElement | null, text: string): boolean {
  if (!el || !text) return false;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (!setter) return false;

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    // Space between words unless we're at the start or already after whitespace.
    const pad = before && !/\s$/.test(before) ? " " : "";
    const insert = pad + text;

    setter.call(el, before + insert + after);
    el.dispatchEvent(new Event("input", { bubbles: true }));

    const caret = start + insert.length;
    try {
      el.setSelectionRange(caret, caret);
    } catch {
      /* number/email inputs disallow selection ranges */
    }
    return true;
  }

  if (el.isContentEditable) {
    el.focus();
    document.execCommand("insertText", false, text);
    return true;
  }

  return false;
}

/** Is this element something a user types into? */
export function isTypableElement(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const e = el as HTMLElement;
  if (e.isContentEditable) return true;
  if (e instanceof HTMLTextAreaElement) return !e.disabled && !e.readOnly;
  if (e instanceof HTMLInputElement) {
    const bad = ["checkbox", "radio", "range", "color", "file", "submit", "button", "reset", "image"];
    return !e.disabled && !e.readOnly && !bad.includes(e.type);
  }
  return false;
}
