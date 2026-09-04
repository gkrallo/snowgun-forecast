/* Service worker för Snöprognos.
   Syftet är att appen ska starta och visa senaste prognosen även när det inte
   finns täckning ute vid spåret. Väderdata cachas inte här — den hanteras av
   appens egen kopia i localStorage. */

const VERSION = "snoprognos-v3";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

// Biblioteken laddas från CDN. Utan dem ritas ingen graf och ingen karta,
// så de sparas första gången de hämtas.
const CDN = ["cdn.jsdelivr.net", "unpkg.com"];

// Dessa ska alltid gå mot nätet: färsk data är hela poängen, och OSM:s
// användarvillkor tillåter inte att man cachar kartrutor i bulk.
const ALWAYS_NETWORK = ["api.open-meteo.com", "nominatim.openstreetmap.org", "tile.openstreetmap.org"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (ALWAYS_NETWORK.some(h => url.hostname.endsWith(h))) return;

  // Sidnavigering: nät först, men fall tillbaka på den sparade sidan offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  // Bibliotek och egna filer: cache först, uppdatera i bakgrunden.
  if (url.origin === self.location.origin || CDN.some(h => url.hostname.endsWith(h))) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res && (res.ok || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
