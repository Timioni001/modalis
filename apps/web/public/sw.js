/*
 * Modalis service worker: lets the installed app open without a connection and show what you saw
 * last, including your balances.
 *
 * Network first, always: when online, every request goes to the network and the fresh answer is
 * kept. Only when the network fails is the last kept copy served. Writes (POST and the like) are
 * never cached or replayed, and a signed transaction never passes through here.
 */
const CACHE = "modalis-v1";
const SHELL = ["/app", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  // Sent on sign-out, so the next person on this device can't open the last person's balances.
  if (event.data === "clear") event.waitUntil(caches.delete(CACHE));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === "navigate") {
          const shell = await caches.match("/app");
          if (shell) return shell;
        }
        return new Response("You're offline, and this hasn't been opened on this device before.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }),
  );
});
