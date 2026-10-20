// VolleyScout - service worker (v3): uso offline dopo la prima apertura con rete.
// Salva in memoria SOLO la vera pagina dell'app (controlla che contenga id="app"),
// cosi' non puo' restare bloccata su pagine sbagliate. Se c'e' rete, la pagina si aggiorna da sola.
var CACHE = 'volleyscout-v3';
var CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

function isApp(res) {
  return res.clone().text().then(function (t) { return t.indexOf('id="app"') > -1; }).catch(function () { return false; });
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(CORE).then(function () {
        return c.match('./index.html').then(function (r) {
          return r ? isApp(r).then(function (ok) { if (!ok) return c.delete('./index.html'); }) : null;
        });
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function cachedPage() { return caches.match('./index.html', { ignoreSearch: true }); }

function networkFirstPage(req) {
  return new Promise(function (resolve) {
    var done = false;
    function finish(res) { if (!done && res) { done = true; resolve(res); } }
    var timer = setTimeout(function () { cachedPage().then(finish); }, 4000);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) {
        isApp(res).then(function (ok) {
          if (ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('./index.html', copy); }); }
        });
        finish(res);
      } else {
        cachedPage().then(function (r) { finish(r || res); });
      }
    }).catch(function () {
      clearTimeout(timer);
      cachedPage().then(function (r) { finish(r || Response.error()); });
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (req.mode === 'navigate') { e.respondWith(networkFirstPage(req)); return; }
  if (url.origin === self.location.origin || /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
  }
});
