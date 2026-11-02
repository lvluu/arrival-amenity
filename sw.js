// Cache-first app shell so the app works offline after first load. Bump VERSION on each release.
const VERSION = "v1";
const SHELL = [
  "./", "index.html", "app.js", "parse.js", "manifest.json", "icon.svg",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
];

self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));
self.addEventListener("fetch", (e) => e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request))));
