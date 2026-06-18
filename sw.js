// ============================================================
// SERVICE WORKER — Scotland & Ireland 2026 Trip Planner
// Caches the app shell for offline use.
// ============================================================

const CACHE_NAME = "si2026-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
];

// Install — cache app shell
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// Activate — delete old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - App shell files → Cache first
// - Google Sheets CSV → Network first, fall back to cache
// - Everything else → Network first
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Google Sheets CSV — network first, cache as backup
  if (url.includes("docs.google.com") && url.includes("output=csv")) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell — cache first
  if (SHELL_FILES.some(f => url.endsWith(f.replace("./", "")))) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // Default — network first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
