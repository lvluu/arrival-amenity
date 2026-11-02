/// <reference lib="webworker" />
// Network-first with cache backup: online users always get the latest deploy, offline still works.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = "arrival-fruit";
const SHELL = ["./", "app.js", "pdf.worker.min.mjs", "manifest.json", "icon.svg"];

sw.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (e) => e.waitUntil(sw.clients.claim()));

sw.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(sw.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(async () => (await caches.match(e.request)) ?? Response.error()),
  );
});
