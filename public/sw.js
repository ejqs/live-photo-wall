/* Live Photo Wall service worker.
 * Keeps the wall playing when the venue connection drops:
 *  - photos (/img/*), uploaded fonts and overlays (/a/*) and build assets: cache first, kept forever
 *  - wall pages and the manifest: network first, falling back to the last good copy
 */
const VERSION = "v1";
const MEDIA = `lpw-media-${VERSION}`;
const STATIC = `lpw-static-${VERSION}`;
const PAGES = `lpw-pages-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll(["/wall", "/wall/play"]).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("lpw-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200) cache.put(request, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(request, cacheName, cacheKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(cacheKey || request, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = await cache.match(cacheKey || request, { ignoreSearch: !cacheKey, ignoreVary: true });
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;

  if (p.startsWith("/img/") || p.startsWith("/a/")) {
    event.respondWith(cacheFirst(req, MEDIA));
    return;
  }
  if (p.startsWith("/_next/static/") || p === "/icon.png" || p.startsWith("/icon-")) {
    event.respondWith(cacheFirst(req, STATIC));
    return;
  }
  if (p === "/api/wall/manifest") {
    event.respondWith(networkFirst(req, PAGES, new Request(url.origin + p)));
    return;
  }
  if (req.mode === "navigate" && (p === "/wall" || p.startsWith("/wall/"))) {
    event.respondWith(networkFirst(req, PAGES));
    return;
  }
});

/* Count how many of the given URLs are already stored (for "Cached 100%"). */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "count-cached" && Array.isArray(data.urls)) {
    caches.open(MEDIA).then(async (cache) => {
      let n = 0;
      for (const u of data.urls) if (await cache.match(u, { ignoreVary: true })) n++;
      event.source?.postMessage({ type: "cached-count", id: data.id, count: n, total: data.urls.length });
    });
  }
});
