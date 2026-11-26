const CACHE = "dispertador-v1";
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app.js",
  "js/core.js",
  "js/store.js",
  "js/native.js",
  "js/web-alarm.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html"))),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action || "open";
  const keys = event.notification.data?.keys ?? [];
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        const c = clients[0];
        c.postMessage({ type: "notification-action", action, keys });
        return c.focus();
      }
      const q = action === "open" ? "" : `?acao=${encodeURIComponent(action)}&dose=${encodeURIComponent(keys[0] ?? "")}`;
      return self.clients.openWindow(`./${q}`);
    }),
  );
});
