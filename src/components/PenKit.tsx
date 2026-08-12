"use client";

import React, { useEffect, useRef, useState } from "react";
import { Brush, Eraser, Trash2, X, Check } from "lucide-react";

// A temporary on-screen annotation layer — draw anywhere over the app with a
// finger/stylus to mark things up. Nothing is saved; clearing or reloading wipes
// it. Only shown on touch devices (it's meant for tablets / touch screens).
const COLORS = ["#ef4444", "#2563eb", "#10b981", "#f59e0b", "#111827"];
const SIZES = [3, 6, 12];

export default function PenKit() {
  const [isTouch, setIsTouch] = useState(false);
  const [on, setOn] = useState(false);        // drawing mode active
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [erasing, setErasing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setIsTouch(typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0));
  }, []);

  // Size the canvas to the viewport (and on resize / orientation change).
  useEffect(() => {
    if (!isTouch) return;
    const fit = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      // Preserve existing drawing across a resize.
      const prev = document.createElement("canvas");
      prev.width = c.width; prev.height = c.height;
      prev.getContext("2d")?.drawImage(c, 0, 0);
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
      c.style.width = `${window.innerWidth}px`;
      c.style.height = `${window.innerHeight}px`;
      const ctx = c.getContext("2d");
      if (ctx) { ctx.scale(dpr, dpr); ctx.drawImage(prev, 0, 0, prev.width / dpr, prev.height / dpr); }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [isTouch]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent) => {
    if (!on) return;
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!on || !drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = erasing ? size * 4 : size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const end = () => { drawing.current = false; last.current = null; };

  const clearAll = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
  };

  if (!isTouch) return null;

  return (
    <>
      {/* The drawing surface — only intercepts touches while drawing mode is on. */}
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        className="fixed inset-0 z-[60] touch-none"
        style={{ pointerEvents: on ? "auto" : "none" }}
      />

      {/* Toolbar (when active) */}
      {on && (
        <div className="fixed z-[61] bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 shadow-lg rounded-2xl px-3 py-2">
          {COLORS.map((c) => (
            <button key={c} onClick={() => { setColor(c); setErasing(false); }}
              className={`w-6 h-6 rounded-full border-2 transition ${color === c && !erasing ? "border-slate-800 scale-110" : "border-white"}`}
              style={{ backgroundColor: c }} aria-label="pen colour" />
          ))}
          <span className="w-px h-6 bg-slate-200" />
          {SIZES.map((s) => (
            <button key={s} onClick={() => setSize(s)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${size === s ? "bg-slate-900" : "bg-slate-100"}`} aria-label="brush size">
              <span className="rounded-full" style={{ width: s + 2, height: s + 2, backgroundColor: size === s ? "#fff" : "#475569" }} />
            </button>
          ))}
          <span className="w-px h-6 bg-slate-200" />
          <button onClick={() => setErasing((v) => !v)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${erasing ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"}`} aria-label="eraser">
            <Eraser className="w-4 h-4" />
          </button>
          <button onClick={clearAll} className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-rose-600" aria-label="clear all">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => { setOn(false); setErasing(false); }} className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-600 text-white" aria-label="done">
            <Check className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Floating brush FAB (when not active) */}
      {!on && (
        <button onClick={() => setOn(true)}
          className="fixed z-[61] bottom-24 left-4 w-12 h-12 rounded-full bg-slate-900 text-white shadow-lg flex items-center justify-center active:scale-95 transition"
          aria-label="Marker pen">
          <Brush className="w-5 h-5" />
        </button>
      )}
    </>
  );
}
