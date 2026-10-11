// Service worker: offline app shell, and showing push notifications.
const CACHE = "sleepwatch-v2";
const FILES = ["./", "index.html", "styles.css", "app.js", "data.js", "util.js", "charts.js", "planner.js", "tips.js", "config.js",
  "views/home.js", "views/sleep.js", "views/fitness.js", "views/tennis.js", "views/calendar.js", "views/settings.js", "views/tips.js",
  "manifest.webmanifest", "icon-180.png"];

self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); });
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: "שעון שינה", body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "שעון שינה", {
    body: d.body || "", tag: d.tag, icon: "icon-180.png", badge: "icon-180.png", data: { url: d.url || "./" }, lang: "he", dir: "rtl",
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
