/*
 * SaveTheSoul service worker.
 *
 * Privacy-first caching policy:
 *  - ONLY public, non-personal pages are cached: the crisis help page and the offline page.
 *  - API responses and authenticated pages (/patient, /clinician) are NEVER stored.
 *  - When offline, any navigation falls back to /offline, which shows emergency numbers.
 */
const CACHE = "sts-public-v2";
const PRECACHE = ["/help", "/offline", "/icon.png", "/brand/logo-mark.png", "/brand/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never intercept API traffic

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE);
        if (url.pathname === "/help") return (await cache.match("/help")) || cache.match("/offline");
        return cache.match("/offline");
      }),
    );
    return;
  }

  // Static build assets: cache-first is safe (content-hashed, non-personal).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
