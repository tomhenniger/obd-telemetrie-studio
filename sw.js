/* Service Worker: die App offline verfügbar halten und Kartenkacheln zwischenspeichern.
   Die App selbst wird bei jedem Start im Hintergrund erneuert (stale-while-revalidate),
   damit eine installierte Fassung nicht auf altem Stand einfriert. */
const APP_CACHE = 'obd-app-v2';
const TILE_CACHE = 'obd-tiles-v1';
const TILE_LIMIT = 1200;                       // etwa 25 MB
const APP_FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-maskable.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== APP_CACHE && k !== TILE_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function trimTiles() {
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  if (keys.length <= TILE_LIMIT) return;
  for (const k of keys.slice(0, keys.length - TILE_LIMIT)) await c.delete(k);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* Kartenkacheln: erst aus dem Speicher, sonst laden und ablegen */
  if (/tile\.openstreetmap|tiles\.|basemaps|cartocdn|arcgisonline|opentopomap/i.test(url.host)) {
    e.respondWith((async () => {
      const c = await caches.open(TILE_CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) { await c.put(req, res.clone()); trimTiles(); }
        return res;
      } catch (err) { return hit || Response.error(); }
    })());
    return;
  }
  /* Overpass und andere fremde Dienste nie aus dem Speicher beantworten */
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(APP_CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(async res => {
      if (res && res.ok) {
        /* Hat sich die Seite geändert, sagen wir es den offenen Fenstern –
           sonst arbeitet jemand tagelang mit der Fassung von gestern weiter. */
        if (hit && /text\/html/.test(res.headers.get('content-type') || '')) {
          const [a, b] = await Promise.all([hit.clone().text(), res.clone().text()]);
          if (a.length !== b.length) {
            const cl = await self.clients.matchAll({ type: 'window' });
            cl.forEach(w => w.postMessage({ type: 'update-ready' }));
          }
        }
        c.put(req, res.clone());
      }
      return res;
    }).catch(() => null);
    return hit || (await net) || new Response('Offline und nicht im Zwischenspeicher.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'clear-tiles') e.waitUntil(caches.delete(TILE_CACHE));
});
