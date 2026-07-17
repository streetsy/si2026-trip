// Scotland & Ireland 2026 Trip Planner service worker.
// Caches the app shell and Firebase SDKs for offline use.

const CACHE_NAME = "si2026-v4";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./notes.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Let Firestore and Firebase authentication manage their own offline state.
  if (
    url.includes("firestore.googleapis.com") ||
    url.includes("firebase.googleapis.com") ||
    url.includes("identitytoolkit.googleapis.com") ||
    url.includes("securetoken.googleapis.com") ||
    url.includes("firebaseio.com")
  ) return;

  // The published Google Sheet is always refreshed first, then cached.
  if (url.includes("docs.google.com") && url.includes("output=csv")) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Always prefer a new deployment when online, with an offline fallback.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (event.request.method === "GET") {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
