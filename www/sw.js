/* =====================================================
   Spendio – Service Worker
   Strategy: Cache-first for assets, network-first for pages
   Auto-updates: new SW activates immediately and notifies clients
===================================================== */

const CACHE_NAME = "spendio-v86";
const OFFLINE_PAGE = "./index.html";

// Core files to precache on install
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png",
];

// ── INSTALL ────────────────────────────────────────────
self.addEventListener("install", (event) => {
  // Skip waiting — take over immediately when a new version is deployed
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache
            .add(url)
            .catch((err) => console.warn("[SW] Failed to cache:", url, err)),
        ),
      );
    }),
  );
});

// ── ACTIVATE ───────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Remove old caches from previous versions
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log("[SW] Deleting old cache:", key);
              return caches.delete(key);
            }),
        ),
      ),
      // Take control of all existing clients immediately
      clients.claim(),
    ])
  );
});
// ── FETCH ──────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests (except fonts/cdn)
  if (request.method !== "GET") return;

  // Navigation requests (HTML pages) — network first, fallback to cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh page
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline: return cached page
          return caches.match(OFFLINE_PAGE) || caches.match("./index.html");
        }),
    );
    return;
  }

  // Assets — stale-while-revalidate (serve from cache instantly, update in background)
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response.ok && url.origin === self.location.origin) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached); // Offline: return whatever we have

        // Return cached version immediately if available, otherwise wait for network
        return cached || networkFetch;
      }),
    ),
  );
});

// ── MESSAGE HANDLER ────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CHECK_UPDATE") {
    // Client is asking if there's a new SW waiting
    self.registration.update();
  }
});
