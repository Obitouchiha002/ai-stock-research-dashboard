// Minimal service worker — enables PWA install (standalone, no browser chrome).
// Intentionally passes every request straight through with NO caching, so the
// app is never served a stale bundle after a deploy.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* network passthrough */ });
