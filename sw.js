/* Service worker: permite instalar la app y abrirla rápido.
   Estrategia "red primero con tope": si la red no responde en 2,5 s se sirve la copia guardada y la nueva versión
   se guarda en segundo plano para la próxima apertura. Nunca guarda datos del servidor (solo la cáscara de la app). */
const CACHE = "hb-palermo-v38";
const SHELL = ["./", "index.html", "app.js", "config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const TOPE_MS = 2500;
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return; // API y CDN: siempre directo a la red
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const red = fetch(e.request.mode === "navigate" ? e.request : new Request(e.request.url, { cache: "no-cache" })).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; });
    const guardada = await cache.match(e.request);
    if (!guardada) return red.catch(() => caches.match("index.html"));
    const primera = await Promise.race([red.catch(() => null), new Promise(res => setTimeout(() => res("tope"), TOPE_MS))]);
    return primera && primera !== "tope" ? primera : guardada;
  })());
});
