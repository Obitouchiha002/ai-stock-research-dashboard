"use client";

import { useEffect } from "react";

// Registers the minimal service worker so the app is installable as a PWA and
// opens in standalone (full-screen, no browser tabs / URL bar).
export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") reg();
    else window.addEventListener("load", reg, { once: true });
  }, []);
  return null;
}
