/// <reference lib="webworker" />
// Network-first with cache backup: online users get the latest files, offline still works.
// A new version waits until the page asks it to take over (the "Update" button), then the page reloads.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `arrival-fruit-${BUILD_ID}`;
const SHELL = ["./", "app.js", "pdf.worker.min.mjs", "manifest.json", "icon.svg", "template.xlsx"];

sw.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") sw.skipWaiting();
});

sw.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== sw.location.origin || url.pathname.startsWith("/api/")) return;
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
