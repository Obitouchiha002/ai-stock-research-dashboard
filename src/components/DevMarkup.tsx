"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Brush, Trash2, X, Mic, Square, StickyNote, List, Code2, Undo2, Move } from "lucide-react";

// ---------------------------------------------------------------------------
// Developer markup tool — SECURE / hidden. Unlock with Ctrl/Cmd+Shift+D.
// Everything is anchored to the PAGE CONTENT (stored in content coordinates and
// offset by the scroll container), so a note/mark stays on the element it was
// placed on and scrolls WITH the page — it is not stuck to the screen.
//   • Draggable sticky notes (text + VOICE note) you can drop & move anywhere
//   • Freehand pen marks (content-anchored, undo / clear)
//   • Saves per page (localStorage) so you remember what to change later
// ---------------------------------------------------------------------------

type Note = { id: string; dx: number; dy: number; text: string; audio: string | null; ts: number };
type Stroke = { color: string; pts: { x: number; y: number }[] };
type PageData = { notes: Note[]; strokes: Stroke[] };
const STORE = "sa_dev_markup_v2";
const COLORS = ["#ef4444", "#2563eb", "#10b981", "#f59e0b", "#111827"];

const loadAll = (): Record<string, PageData> => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };
const saveAll = (m: Record<string, PageData>) => { try { localStorage.setItem(STORE, JSON.stringify(m)); } catch { /* quota */ } };
const mainEl = () => (typeof document !== "undefined" ? (document.querySelector("main") as HTMLElement | null) : null);

export default function DevMarkup() {
  const pathname = usePathname() || "/";
  const [dev, setDev] = useState(false);
  const [tool, setTool] = useState<"select" | "pen">("select");
  const [color, setColor] = useState(COLORS[0]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [recId, setRecId] = useState<string | null>(null);
  const [, force] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cur = useRef<Stroke | null>(null);
  const drag = useRef<{ id: string; offx: number; offy: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const notesRef = useRef<Note[]>([]); notesRef.current = notes;
  const strokesRef = useRef<Stroke[]>([]); strokesRef.current = strokes;

  // Unlock / lock with Ctrl/Cmd+Shift+D (persisted).
  useEffect(() => {
    setDev(localStorage.getItem("sa_devmode") === "1");
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setDev((v) => { const n = !v; localStorage.setItem("sa_devmode", n ? "1" : "0"); return n; });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load this page's data on route change / when dev turns on.
  useEffect(() => { if (dev) { const d = loadAll()[pathname] || { notes: [], strokes: [] }; setNotes(d.notes || []); setStrokes(d.strokes || []); } }, [pathname, dev]);

  const persist = useCallback((n: Note[], s: Stroke[]) => {
    const all = loadAll(); all[pathname] = { notes: n, strokes: s }; saveAll(all);
  }, [pathname]);
  const saveNotes = useCallback((n: Note[]) => { setNotes(n); persist(n, strokesRef.current); }, [persist]);
  const saveStrokes = useCallback((s: Stroke[]) => { setStrokes(s); persist(notesRef.current, s); }, [persist]);

  // Content <-> screen mapping through the scroll container (main).
  const toContent = (clientX: number, clientY: number) => { const m = mainEl(); if (!m) return { x: clientX, y: clientY }; const r = m.getBoundingClientRect(); return { x: clientX - r.left + m.scrollLeft, y: clientY - r.top + m.scrollTop }; };
  const toScreen = (dx: number, dy: number) => { const m = mainEl(); if (!m) return { left: dx, top: dy }; const r = m.getBoundingClientRect(); return { left: r.left + dx - m.scrollLeft, top: r.top + dy - m.scrollTop }; };

  // Reposition everything on scroll / resize.
  useEffect(() => {
    if (!dev) return;
    const tick = () => force((n) => n + 1);
    const m = mainEl();
    m?.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    return () => { m?.removeEventListener("scroll", tick); window.removeEventListener("resize", tick); };
  }, [dev]);

  // Fit canvas + redraw strokes (translated to current scroll) on every render.
  useEffect(() => {
    if (!dev) return;
    const c = canvasRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== window.innerWidth * dpr || c.height !== window.innerHeight * dpr) {
      c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr;
      c.style.width = `${window.innerWidth}px`; c.style.height = `${window.innerHeight}px`;
    }
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const draw = (st: Stroke) => {
      if (st.pts.length < 1) return;
      ctx.strokeStyle = st.color; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      st.pts.forEach((p, i) => { const s = toScreen(p.x, p.y); i ? ctx.lineTo(s.left, s.top) : ctx.moveTo(s.left, s.top); });
      ctx.stroke();
    };
    strokes.forEach(draw);
    if (cur.current) draw(cur.current);
  });

  // --- Pen (content-anchored strokes) ---
  const penDown = (e: React.PointerEvent) => { if (tool !== "pen") return; e.preventDefault(); const p = toContent(e.clientX, e.clientY); cur.current = { color, pts: [p] }; force((n) => n + 1); };
  const penMove = (e: React.PointerEvent) => { if (tool !== "pen" || !cur.current) return; e.preventDefault(); cur.current.pts.push(toContent(e.clientX, e.clientY)); force((n) => n + 1); };
  const penUp = () => { if (cur.current && cur.current.pts.length > 1) saveStrokes([...strokesRef.current, cur.current]); cur.current = null; force((n) => n + 1); };
  const undo = () => saveStrokes(strokesRef.current.slice(0, -1));
  const clearAll = () => { saveStrokes([]); };

  // --- Sticky notes ---
  const addNote = () => {
    const m = mainEl(); const r = m?.getBoundingClientRect();
    // Drop near the centre of the current view.
    const p = toContent((r?.left || 0) + (r?.width || window.innerWidth) / 2, (r?.top || 0) + (r?.height || window.innerHeight) / 3);
    const id = `${Date.now()}-${notes.length}`;
    saveNotes([...notes, { id, dx: p.x, dy: p.y, text: "", audio: null, ts: Date.now() }]);
    setOpenId(id);
  };
  const setText = (id: string, text: string) => saveNotes(notesRef.current.map((n) => (n.id === id ? { ...n, text } : n)));
  const delNote = (id: string) => { saveNotes(notesRef.current.filter((n) => n.id !== id)); if (openId === id) setOpenId(null); };

  // Drag a note (content coords) — sticks to the page.
  const dragStart = (e: React.PointerEvent, n: Note) => {
    e.preventDefault(); e.stopPropagation();
    const s = toScreen(n.dx, n.dy);
    drag.current = { id: n.id, offx: e.clientX - s.left, offy: e.clientY - s.top };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const dragMove = (e: React.PointerEvent) => {
    if (!drag.current) return; e.preventDefault();
    const p = toContent(e.clientX - drag.current.offx, e.clientY - drag.current.offy);
    setNotes((arr) => arr.map((n) => (n.id === drag.current!.id ? { ...n, dx: p.x, dy: p.y } : n)));
  };
  const dragEnd = () => { if (drag.current) { persist(notesRef.current, strokesRef.current); drag.current = null; } };

  // --- Voice ---
  const startRec = async (id: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        const reader = new FileReader();
        reader.onloadend = () => saveNotes(notesRef.current.map((n) => (n.id === id ? { ...n, audio: reader.result as string } : n)));
        reader.readAsDataURL(blob);
        setRecId(null);
      };
      recorder.current = mr; mr.start(); setRecId(id);
    } catch { alert("Microphone permission needed for voice notes."); }
  };
  const stopRec = () => recorder.current?.stop();

  if (!dev) return null;

  return (
    <>
      {/* Pen canvas — captures pointer only in pen mode; strokes anchored to content */}
      <canvas ref={canvasRef} onPointerDown={penDown} onPointerMove={penMove} onPointerUp={penUp} onPointerCancel={penUp} onPointerLeave={penUp}
        className="fixed inset-0 z-[60] touch-none" style={{ pointerEvents: tool === "pen" ? "auto" : "none" }} />

      {/* Sticky notes (drag to move; scroll with content) */}
      {notes.map((n, i) => {
        const s = toScreen(n.dx, n.dy);
        const open = openId === n.id;
        return (
          <div key={n.id} onPointerMove={dragMove} onPointerUp={dragEnd}
            className="fixed z-[63]" style={{ left: s.left, top: s.top }}>
            {open ? (
              <div className="w-[300px] max-w-[86vw] -translate-x-3 bg-amber-50 rounded-xl border border-amber-300 shadow-2xl">
                <div onPointerDown={(e) => dragStart(e, n)} className="flex items-center justify-between px-2.5 py-1.5 bg-amber-200/70 rounded-t-xl cursor-move touch-none">
                  <span className="text-[11px] font-black text-amber-900 flex items-center gap-1"><Move className="w-3 h-3" /> Note #{i + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => delNote(n.id)} className="p-1 rounded text-rose-600 hover:bg-rose-100"><Trash2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setOpenId(null)} className="p-1 rounded text-amber-900 hover:bg-amber-100"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="p-2.5">
                  <textarea value={n.text} onChange={(e) => setText(n.id, e.target.value)} autoFocus placeholder="What to change here…" rows={3}
                    className="w-full text-[13px] bg-transparent outline-none resize-none placeholder:text-amber-700/50" />
                  <div className="flex items-center gap-2 mt-1.5">
                    {recId === n.id ? (
                      <button onClick={stopRec} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-rose-600 text-white animate-pulse"><Square className="w-3 h-3" /> Stop</button>
                    ) : (
                      <button onClick={() => startRec(n.id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-slate-900 text-white"><Mic className="w-3 h-3" /> {n.audio ? "Re-record" : "Voice"}</button>
                    )}
                    {n.audio && <audio src={n.audio} controls className="h-7 flex-1 min-w-0" />}
                  </div>
                </div>
              </div>
            ) : (
              <button onPointerDown={(e) => dragStart(e, n)} onClick={() => setOpenId(n.id)}
                className={`-translate-x-1/2 -translate-y-1/2 min-w-7 h-7 px-1.5 rounded-full text-white text-[12px] font-black shadow-lg flex items-center justify-center border-2 border-white cursor-move touch-none ${n.audio ? "bg-rose-500" : "bg-amber-500"}`}
                title={n.text || "note"}>
                {i + 1}{n.audio ? "🎤" : ""}
              </button>
            )}
          </div>
        );
      })}

      {/* Notes list */}
      {showList && (
        <div className="fixed z-[64] bottom-20 left-1/2 -translate-x-1/2 w-[340px] max-w-[92vw] max-h-[45vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-black text-slate-500 uppercase tracking-wide">Dev notes · this page ({notes.length})</span>
            <button onClick={() => setShowList(false)} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          {notes.length === 0 && <div className="text-[12px] text-slate-400 py-2">No notes yet — tap the sticky-note button to add one.</div>}
          <div className="space-y-1.5">
            {notes.map((n, i) => (
              <button key={n.id} onClick={() => { setOpenId(n.id); setShowList(false); const s = toScreen(n.dx, n.dy); const m = mainEl(); if (m && (s.top < 80 || s.top > window.innerHeight - 80)) m.scrollTop += s.top - window.innerHeight / 3; }}
                className="w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50">
                <span className={`shrink-0 w-5 h-5 rounded-full text-white text-[11px] font-black flex items-center justify-center ${n.audio ? "bg-rose-500" : "bg-amber-500"}`}>{i + 1}</span>
                <span className="text-[12.5px] text-slate-700 flex-1">{n.text || <span className="text-slate-400 italic">empty</span>}</span>
                {n.audio && <Mic className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="fixed z-[65] bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-900 text-white shadow-2xl rounded-2xl px-2.5 py-2">
        <span className="text-[10px] font-black text-amber-400 px-1 flex items-center gap-1"><Code2 className="w-3.5 h-3.5" />DEV</span>
        <span className="w-px h-6 bg-white/20" />
        <button onClick={addNote} className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20" title="add sticky note"><StickyNote className="w-4 h-4" /></button>
        <button onClick={() => setTool(tool === "pen" ? "select" : "pen")} className={`w-9 h-9 rounded-lg flex items-center justify-center ${tool === "pen" ? "bg-indigo-500" : "bg-white/10"}`} title="pen"><Brush className="w-4 h-4" /></button>
        {tool === "pen" && (
          <>
            {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full border-2 ${color === c ? "border-white scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />)}
            <button onClick={undo} className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10" title="undo stroke"><Undo2 className="w-4 h-4" /></button>
            <button onClick={clearAll} className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10" title="clear pen"><Trash2 className="w-4 h-4" /></button>
          </>
        )}
        <span className="w-px h-6 bg-white/20" />
        <button onClick={() => setShowList((v) => !v)} className={`w-9 h-9 rounded-lg flex items-center justify-center relative ${showList ? "bg-indigo-500" : "bg-white/10"}`} title="notes on this page">
          <List className="w-4 h-4" />
          {notes.length > 0 && <span className="absolute -top-1 -right-1 text-[9px] font-black bg-rose-500 rounded-full w-4 h-4 flex items-center justify-center">{notes.length}</span>}
        </button>
        <button onClick={() => { setDev(false); localStorage.setItem("sa_devmode", "0"); setTool("select"); }} className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10" title="exit dev mode (Ctrl+Shift+D)"><X className="w-4 h-4" /></button>
      </div>
    </>
  );
}
