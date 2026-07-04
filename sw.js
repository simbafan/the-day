/* THE DAY - service worker.
   Job: make the app launch offline from the home screen, and keep fonts working offline.
   Scope is the directory this file is served from (/the-day/), because it registers with a relative path.
   Bump VERSION on every deploy so the old cache is cleaned in activate. */
const VERSION = "the-day-v4";
const FONTS   = "the-day-fonts-v1";
const SHELL   = ["./", "./index.html"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* Page navigation: network-first so an online launch always gets the latest index.html,
     fall back to the cached shell when offline. This is what passes the airplane-mode test. */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req, { cache: "no-store" })
        .then(res => {
          if (res.ok) { /* only cache a real 200; never persist a 404/502 as the offline shell */
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put("./index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("./index.html").then(hit => hit || caches.match("./")))
    );
    return;
  }

  /* Google Fonts (cross-origin): stale-while-revalidate. Serve cache instantly, refresh in the
     background. Never a launch dependency; a font miss falls through to the system-font stack. */
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(FONTS).then(c =>
        c.match(req).then(hit => {
          const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  /* Everything else same-origin: cache-first, then network. */
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit))
    );
  }
});
