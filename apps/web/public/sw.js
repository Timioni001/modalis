/* Only immutable public assets are cached. Personal pages and APIs always use the network. */
const CACHE = "modalis-public-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("modalis-") && key !== CACHE).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => {
  if (event.data === "clear") event.waitUntil(caches.delete(CACHE));
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/_next/static/") && !/^\/(icon-(192|512)\.png|mark\.svg|apple-touch-icon\.png)$/.test(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req);
    if (hit) return hit;
    const response = await fetch(req);
    if (response.ok) await cache.put(req, response.clone());
    return response;
  }));
});
