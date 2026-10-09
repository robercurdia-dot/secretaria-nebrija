/* Service worker: la app funciona sin conexión. Sube VERSION cuando publiques cambios. */
var VERSION = "secretaria-v5";
var PRECACHE = [
  "./", "index.html", "app.css", "app.js", "manifest.webmanifest",
  "lib/xlsx.full.min.js", "lib/qrcode.min.js", "lib/jszip.min.js",
  "img/escudo.png", "img/icon-192.png", "img/icon-512.png", "img/apple-touch-icon.png", "img/favicon-32.png",
  "apps-script/Code.gs"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION && k !== VERSION + "-ext"; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;                       // los envíos a la hoja de Google no se tocan
  var url = new URL(req.url);

  // Tipografías de Google: se guardan al verlas por primera vez
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(VERSION + "-ext").then(function (c) {
      return c.match(req).then(function (hit) {
        var red = fetch(req).then(function (r) { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(function () { return hit; });
        return hit || red;
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // Código de la app: primero la red (para recibir las novedades), y si no hay conexión, la copia guardada
  var esCodigo = req.mode === "navigate" || /\.(html|js|css|webmanifest|gs)$/.test(url.pathname) || url.pathname.slice(-1) === "/";
  if (esCodigo) {
    e.respondWith(fetch(req).then(function (r) {
      var copia = r.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copia); });
      return r;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("index.html"); });
    }));
    return;
  }
  // Librerías e imágenes: copia guardada primero
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      var copia = r.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copia); });
      return r;
    });
  }));
});
