"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  Brush, Highlighter, Minus, ArrowUpRight, Square as SquareIcon, Eraser, StickyNote,
  MousePointer2, Undo2, Redo2, Trash2, List, X, Code2, Mic, Square, Move,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Developer markup tool — SECURE / hidden. Unlock by tapping the app logo 5×
// (also Ctrl/Cmd+Shift+D, or ?dev=1).
// Marks & notes are rendered INSIDE the scroll container (main) in content
// coordinates, so the browser scrolls them natively with the page (no lag) and
// they clip to the content area (never spill over the header/sidebar).
// Tools: move · pen · highlighter · line · arrow · box · eraser · sticky note
// (text + voice) · colours · sizes · undo/redo · clear. Saved per page.
// ---------------------------------------------------------------------------

type Kind = "free" | "highlight" | "line" | "arrow" | "rect";
type Pt = { x: number; y: number };
type Stroke = { kind: Kind; color: string; size: number; pts: Pt[] };
type Note = { id: string; dx: number; dy: number; text: string; audio: string | null; ts: number };
type PageData = { notes: Note[]; strokes: Stroke[] };
type Tool = "select" | "pen" | "highlight" | "line" | "arrow" | "rect" | "eraser";

const STORE = "sa_dev_markup_v3";
const COLORS = ["#ef4444", "#2563eb", "#10b981", "#f59e0b", "#111827"];
const SIZES = [2, 4, 8];

const loadAll = (): Record<string, PageData> => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };
const saveAll = (m: Record<string, PageData>) => { try { localStorage.setItem(STORE, JSON.stringify(m)); } catch { /* quota */ } };
const mainEl = () => (typeof document !== "undefined" ? (document.querySelector("main") as HTMLElement | null) : null);

export default function DevMarkup() {
  const pathname = usePathname() || "/";
  const [dev, setDev] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [recId, setRecId] = useState<string | null>(null);
  const [sizeTick, setSizeTick] = useState(0);
  const [, setHist] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cur = useRef<Stroke | null>(null);
  const erasing = useRef(false);
  const drag = useRef<{ id: string; offx: number; offy: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const notesRef = useRef<Note[]>([]); notesRef.current = notes;
  const strokesRef = useRef<Stroke[]>([]); strokesRef.current = strokes;
  const past = useRef<Stroke[][]>([]);
  const future = useRef<Stroke[][]>([]);

  // Unlock: logo 5× (AppShell) · Ctrl/Cmd+Shift+D · ?dev=1.
  useEffect(() => {
    let on = localStorage.getItem("sa_devmode") === "1";
    try { const u = new URLSearchParams(window.location.search).get("dev"); if (u === "1") on = true; else if (u === "0") on = false; } catch { /* ignore */ }
    setDev(on); localStorage.setItem("sa_devmode", on ? "1" : "0");
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "D" || e.key === "d")) { e.preventDefault(); setDev((v) => { const n = !v; localStorage.setItem("sa_devmode", n ? "1" : "0"); return n; }); } };
    const onFlag = () => setDev(localStorage.getItem("sa_devmode") === "1");
    window.addEventListener("keydown", onKey);
    window.addEventListener("sa-devmode", onFlag);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("sa-devmode", onFlag); };
  }, []);

  // Portal target + this page's data.
  useEffect(() => { if (!dev) { setHost(null); return; } setHost(mainEl()); const d = loadAll()[pathname] || { notes: [], strokes: [] }; setNotes(d.notes || []); setStrokes(d.strokes || []); past.current = []; future.current = []; setHist((n) => n + 1); }, [pathname, dev]);

  // Clean drawing surface: block selection / copy / long-press callout / overscroll.
  useEffect(() => {
    if (!dev) return;
    const html = document.documentElement; html.classList.add("dev-markup-active");
    const inField = (t: any) => t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable);
    const noCtx = (e: Event) => e.preventDefault();
    const noSel = (e: Event) => { if (!inField(e.target)) e.preventDefault(); };
    document.addEventListener("contextmenu", noCtx);
    document.addEventListener("selectstart", noSel);
    document.addEventListener("copy", noSel);
    document.addEventListener("cut", noSel);
    return () => { html.classList.remove("dev-markup-active"); document.removeEventListener("contextmenu", noCtx); document.removeEventListener("selectstart", noSel); document.removeEventListener("copy", noSel); document.removeEventListener("cut", noSel); };
  }, [dev]);

  // Resize the canvas only on real layout resize (not on every data update —
  // that was the big lag source). The canvas is also re-sized on each pen-down.
  useEffect(() => {
    if (!dev || !host) return;
    let t: any;
    const bump = () => { clearTimeout(t); t = setTimeout(() => setSizeTick((n) => n + 1), 200); };
    const ro = new ResizeObserver(bump); ro.observe(host);
    window.addEventListener("resize", bump);
    setSizeTick((n) => n + 1);
    return () => { clearTimeout(t); ro.disconnect(); window.removeEventListener("resize", bump); };
  }, [dev, host]);

  const persist = useCallback((n: Note[], s: Stroke[]) => { const all = loadAll(); all[pathname] = { notes: n, strokes: s }; saveAll(all); }, [pathname]);
  const saveNotes = useCallback((n: Note[]) => { setNotes(n); persist(n, strokesRef.current); }, [persist]);
  const commitStrokes = useCallback((s: Stroke[]) => { setStrokes(s); persist(notesRef.current, s); }, [persist]);
  const snapshot = () => { past.current = [...past.current.slice(-40), strokesRef.current]; future.current = []; setHist((n) => n + 1); };
  const undo = () => { if (!past.current.length) return; future.current = [strokesRef.current, ...future.current]; const prev = past.current[past.current.length - 1]; past.current = past.current.slice(0, -1); commitStrokes(prev); setHist((n) => n + 1); };
  const redo = () => { if (!future.current.length) return; past.current = [...past.current, strokesRef.current]; const nxt = future.current[0]; future.current = future.current.slice(1); commitStrokes(nxt); setHist((n) => n + 1); };
  const clearAll = () => { if (!confirm("Clear all marks & notes on this page?")) return; snapshot(); setNotes([]); commitStrokes([]); persist([], []); };

  // Client point -> content coordinate. The canvas sits at main's padding-box
  // origin (absolute 0,0), so no padding offset — this keeps the ink on the nib.
  const toContent = (cx: number, cy: number): Pt => { const m = host || mainEl(); if (!m) return { x: cx, y: cy }; const r = m.getBoundingClientRect(); return { x: cx - r.left + m.scrollLeft, y: cy - r.top + m.scrollTop }; };

  // Draw all strokes (content coords == canvas pixels).
  const redraw = useCallback(() => {
    const c = canvasRef.current, m = host; if (!c || !m) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(m.scrollWidth, m.clientWidth), H = Math.max(m.scrollHeight, m.clientHeight);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = `${W}px`; c.style.height = `${H}px`; }
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const one = (st: Stroke) => {
      if (!st.pts.length) return;
      ctx.save(); ctx.strokeStyle = st.color; ctx.lineWidth = st.size; ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (st.kind === "highlight") { ctx.globalAlpha = 0.3; ctx.lineWidth = Math.max(10, st.size * 4); }
      if (st.kind === "free" || st.kind === "highlight") { ctx.beginPath(); st.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); }
      else { const a = st.pts[0], b = st.pts[st.pts.length - 1];
        if (st.kind === "rect") ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        else { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          if (st.kind === "arrow") { const ang = Math.atan2(b.y - a.y, b.x - a.x), h = 10 + st.size; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - h * Math.cos(ang - 0.4), b.y - h * Math.sin(ang - 0.4)); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - h * Math.cos(ang + 0.4), b.y - h * Math.sin(ang + 0.4)); ctx.stroke(); } } }
      ctx.restore();
    };
    strokesRef.current.forEach(one); if (cur.current) one(cur.current);
  }, [host]);

  useEffect(() => { if (dev && host) redraw(); }, [dev, host, strokes, sizeTick, redraw]);

  const isDrawTool = tool === "pen" || tool === "highlight" || tool === "line" || tool === "arrow" || tool === "rect";
  const eraseAt = (p: Pt) => { const th = 14 + size; const kept = strokesRef.current.filter((st) => !st.pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < th) && !(st.kind === "rect" && p.x > Math.min(st.pts[0].x, st.pts[1].x) - th && p.x < Math.max(st.pts[0].x, st.pts[1].x) + th && p.y > Math.min(st.pts[0].y, st.pts[1].y) - th && p.y < Math.max(st.pts[0].y, st.pts[1].y) + th)); if (kept.length !== strokesRef.current.length) commitStrokes(kept); };

  const coalesced = (e: React.PointerEvent): { x: number; y: number }[] => {
    const evs = (e.nativeEvent as any).getCoalescedEvents?.() as PointerEvent[] | undefined;
    const list = evs && evs.length ? evs : [e.nativeEvent as any];
    return list.map((ev) => ({ x: ev.clientX, y: ev.clientY }));
  };
  const canvasDown = (e: React.PointerEvent) => {
    if (tool === "eraser") { erasing.current = true; snapshot(); eraseAt(toContent(e.clientX, e.clientY)); return; }
    if (!isDrawTool) return; e.preventDefault();
    redraw(); // ensure the canvas covers the current content before drawing
    const p = toContent(e.clientX, e.clientY);
    cur.current = { kind: tool === "pen" ? "free" : (tool as Kind), color, size, pts: [p] };
  };
  const canvasMove = (e: React.PointerEvent) => {
    if (tool === "eraser") { if (erasing.current) coalesced(e).forEach((c) => eraseAt(toContent(c.x, c.y))); return; }
    if (!cur.current) return; e.preventDefault();
    const st = cur.current;
    if (st.kind === "free") {
      // Incremental draw — captures every coalesced Pencil sample, no full redraw.
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) { ctx.strokeStyle = st.color; ctx.lineWidth = st.size; ctx.lineCap = "round"; ctx.lineJoin = "round"; }
      coalesced(e).forEach((c) => { const p = toContent(c.x, c.y); const last = st.pts[st.pts.length - 1]; st.pts.push(p); if (ctx && last) { ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); } });
    } else {
      const p = toContent(e.clientX, e.clientY);
      if (st.kind === "highlight") st.pts.push(p); else st.pts = [st.pts[0], p];
      redraw();
    }
  };
  const canvasUp = () => { if (tool === "eraser") { erasing.current = false; return; } if (cur.current && cur.current.pts.length >= 2) { snapshot(); commitStrokes([...strokesRef.current, cur.current]); } cur.current = null; redraw(); };

  // Sticky notes.
  const addNote = () => {
    const m = host || mainEl(); if (!m) return; const r = m.getBoundingClientRect();
    const p = toContent(r.left + r.width / 2, r.top + r.height / 3);
    const id = `${Date.now()}-${notes.length}`;
    saveNotes([...notes, { id, dx: p.x, dy: p.y, text: "", audio: null, ts: Date.now() }]);
    setOpenId(id); setTool("select");
  };
  const setText = (id: string, text: string) => saveNotes(notesRef.current.map((n) => (n.id === id ? { ...n, text } : n)));
  const delNote = (id: string) => { saveNotes(notesRef.current.filter((n) => n.id !== id)); if (openId === id) setOpenId(null); };
  const dragStart = (e: React.PointerEvent, n: Note) => { e.preventDefault(); e.stopPropagation(); const p = toContent(e.clientX, e.clientY); drag.current = { id: n.id, offx: p.x - n.dx, offy: p.y - n.dy }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const dragMove = (e: React.PointerEvent) => { if (!drag.current) return; e.preventDefault(); const p = toContent(e.clientX, e.clientY); setNotes((arr) => arr.map((n) => (n.id === drag.current!.id ? { ...n, dx: p.x - drag.current!.offx, dy: p.y - drag.current!.offy } : n))); };
  const dragEnd = () => { if (drag.current) { persist(notesRef.current, strokesRef.current); drag.current = null; } };

  // Voice.
  const startRec = async (id: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = () => { const blob = new Blob(chunks.current, { type: "audio/webm" }); stream.getTracks().forEach((t) => t.stop()); const reader = new FileReader(); reader.onloadend = () => saveNotes(notesRef.current.map((n) => (n.id === id ? { ...n, audio: reader.result as string } : n))); reader.readAsDataURL(blob); setRecId(null); };
      recorder.current = mr; mr.start(); setRecId(id);
    } catch { alert("Microphone permission needed for voice notes."); }
  };
  const stopRec = () => recorder.current?.stop();

  if (!dev) return null;

  const TOOLS: { k: Tool; icon: any; label: string }[] = [
    { k: "select", icon: MousePointer2, label: "move" }, { k: "pen", icon: Brush, label: "pen" },
    { k: "highlight", icon: Highlighter, label: "highlighter" }, { k: "line", icon: Minus, label: "line" },
    { k: "arrow", icon: ArrowUpRight, label: "arrow" }, { k: "rect", icon: SquareIcon, label: "box" },
    { k: "eraser", icon: Eraser, label: "eraser" },
  ];
  const capture = tool === "eraser" || isDrawTool;

  // Everything below lives INSIDE the scroll container so it scrolls natively.
  const layer = host && createPortal(
    <div style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0, zIndex: 40 }}>
      <canvas ref={canvasRef} onPointerDown={canvasDown} onPointerMove={canvasMove} onPointerUp={canvasUp} onPointerCancel={canvasUp} onPointerLeave={canvasUp}
        className="absolute top-0 left-0 touch-none" style={{ pointerEvents: capture ? "auto" : "none", cursor: tool === "eraser" ? "cell" : isDrawTool ? "crosshair" : "default" }} />
      {notes.map((n, i) => {
        const open = openId === n.id;
        return (
          <div key={n.id} onPointerMove={dragMove} onPointerUp={dragEnd} className="absolute" style={{ left: n.dx, top: n.dy }}>
            {open ? (
              <div className="w-[300px] max-w-[80vw] -translate-x-3 bg-amber-50 rounded-xl border border-amber-300 shadow-xl">
                <div onPointerDown={(e) => dragStart(e, n)} className="flex items-center justify-between px-2.5 py-1.5 bg-amber-200/70 rounded-t-xl cursor-move touch-none">
                  <span className="text-[11px] font-black text-amber-900 flex items-center gap-1"><Move className="w-3 h-3" /> Note #{i + 1}</span>
                  <div className="flex items-center gap-0.5"><button onClick={() => delNote(n.id)} className="p-1 rounded text-rose-600 hover:bg-rose-100"><Trash2 className="w-3.5 h-3.5" /></button><button onClick={() => setOpenId(null)} className="p-1 rounded text-amber-900 hover:bg-amber-100"><X className="w-3.5 h-3.5" /></button></div>
                </div>
                <div className="p-2.5">
                  <textarea value={n.text} onChange={(e) => setText(n.id, e.target.value)} autoFocus placeholder="What to change here…" rows={3} className="w-full text-[13px] bg-transparent outline-none resize-none placeholder:text-amber-700/50" />
                  <div className="flex items-center gap-2 mt-1.5">
                    {recId === n.id ? <button onClick={stopRec} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-rose-600 text-white animate-pulse"><Square className="w-3 h-3" /> Stop</button>
                      : <button onClick={() => startRec(n.id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-slate-900 text-white"><Mic className="w-3 h-3" /> {n.audio ? "Re-record" : "Voice"}</button>}
                    {n.audio && <audio src={n.audio} controls className="h-7 flex-1 min-w-0" />}
                  </div>
                </div>
              </div>
            ) : (
              <button onPointerDown={(e) => dragStart(e, n)} onClick={() => setOpenId(n.id)} className={`-translate-x-1/2 -translate-y-1/2 min-w-7 h-7 px-1.5 rounded-full text-white text-[12px] font-black shadow-lg flex items-center justify-center border-2 border-white cursor-move touch-none ${n.audio ? "bg-rose-500" : "bg-amber-500"}`} title={n.text || "note"}>{i + 1}{n.audio ? "🎤" : ""}</button>
            )}
          </div>
        );
      })}
    </div>, host);

  return (
    <>
      {layer}

      {/* Notes list */}
      {showList && (
        <div className="fixed z-[64] bottom-24 left-1/2 -translate-x-1/2 w-[340px] max-w-[92vw] max-h-[42vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2"><span className="text-[12px] font-black text-slate-500 uppercase tracking-wide">Dev notes · this page ({notes.length})</span><button onClick={() => setShowList(false)} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button></div>
          {notes.length === 0 && <div className="text-[12px] text-slate-400 py-2">No notes yet — tap the sticky-note tool.</div>}
          <div className="space-y-1.5">
            {notes.map((n, i) => (
              <button key={n.id} onClick={() => { setOpenId(n.id); setShowList(false); const m = host; if (m) m.scrollTo({ top: Math.max(0, n.dy - window.innerHeight / 3), behavior: "smooth" }); }} className="w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50">
                <span className={`shrink-0 w-5 h-5 rounded-full text-white text-[11px] font-black flex items-center justify-center ${n.audio ? "bg-rose-500" : "bg-amber-500"}`}>{i + 1}</span>
                <span className="text-[12.5px] text-slate-700 flex-1">{n.text || <span className="text-slate-400 italic">empty</span>}</span>
                {n.audio && <Mic className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="fixed z-[65] bottom-3 left-1/2 -translate-x-1/2 max-w-[96vw] overflow-x-auto">
        <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur text-white shadow-2xl ring-1 ring-white/10 rounded-2xl px-2 py-2 w-max">
          <span className="text-[10px] font-black text-amber-400 px-1 flex items-center gap-1 shrink-0"><Code2 className="w-3.5 h-3.5" />DEV</span>
          <span className="w-px h-6 bg-white/15 shrink-0" />
          {TOOLS.map((t) => (<button key={t.k} onClick={() => setTool(t.k)} title={t.label} className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition ${tool === t.k ? "bg-indigo-500" : "bg-white/10 hover:bg-white/20"}`}><t.icon className="w-4 h-4" /></button>))}
          <button onClick={addNote} title="sticky note" className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 shrink-0"><StickyNote className="w-4 h-4" /></button>
          <span className="w-px h-6 bg-white/15 shrink-0" />
          {isDrawTool && (<>
            {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full border-2 shrink-0 transition ${color === c ? "border-white scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />)}
            {SIZES.map((s) => <button key={s} onClick={() => setSize(s)} className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${size === s ? "bg-indigo-500" : "bg-white/10"}`}><span className="rounded-full bg-white" style={{ width: s + 3, height: s + 3 }} /></button>)}
            <span className="w-px h-6 bg-white/15 shrink-0" />
          </>)}
          <button onClick={undo} disabled={!past.current.length} title="undo" className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 disabled:opacity-30 shrink-0"><Undo2 className="w-4 h-4" /></button>
          <button onClick={redo} disabled={!future.current.length} title="redo" className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 disabled:opacity-30 shrink-0"><Redo2 className="w-4 h-4" /></button>
          <button onClick={clearAll} title="clear page" className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 text-rose-300 shrink-0"><Trash2 className="w-4 h-4" /></button>
          <span className="w-px h-6 bg-white/15 shrink-0" />
          <button onClick={() => setShowList((v) => !v)} className={`w-9 h-9 rounded-lg flex items-center justify-center relative shrink-0 ${showList ? "bg-indigo-500" : "bg-white/10"}`} title="notes"><List className="w-4 h-4" />{notes.length > 0 && <span className="absolute -top-1 -right-1 text-[9px] font-black bg-rose-500 rounded-full w-4 h-4 flex items-center justify-center">{notes.length}</span>}</button>
          <button onClick={() => { setDev(false); localStorage.setItem("sa_devmode", "0"); setTool("select"); }} title="exit dev" className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 shrink-0"><X className="w-4 h-4" /></button>
        </div>
      </div>
    </>
  );
}
