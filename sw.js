/* 자동 생성 파일(tools/stamp.js) — 직접 고치지 마세요. 재방문 속도와 오프라인 동작을 위한 서비스 워커. */
const BUILD = 'c1ca8944585a-b7c8b97d7e92-a575e6b2a4cb';
const PREFIX = 'api-book:' + encodeURIComponent(self.registration.scope) + ':';
const CACHE = PREFIX + BUILD;
const PRECACHE = [
  "./",
  "app.css?v=c1ca8944585a",
  "sim.css?v=c1ca8944585a",
  "ui-kit.js?v=c1ca8944585a",
  "data/merged.js?v=4a4577052ca4",
  "data/legacy.js?v=89786c4d5b71",
  "endpoints.js?v=c1ca8944585a",
  "search.js?v=c1ca8944585a",
  "core.js?v=c1ca8944585a",
  "views.js?v=c1ca8944585a",
  "palette.js?v=c1ca8944585a",
  "boot.js?v=c1ca8944585a",
  "graph.js?v=c1ca8944585a",
  "viz.js?v=c1ca8944585a",
  "topo.js?v=c1ca8944585a",
  "sim.js?v=c1ca8944585a",
  "data/5.0.js?v=b7c8b97d7e92",
  "data/5.0.fidx.js?v=b7c8b97d7e92"
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })));
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  if (r.mode === 'navigate') {
    // Keep the offline HTML paired with the assets of this successfully installed worker.
    e.respondWith(fetch(r).catch(() => caches.match(self.registration.scope, { cacheName: CACHE }).then(h => h || Response.error())));
    return;
  }
  // 코드·데이터는 ?v= 해시가 URL 에 들어 있어 내용이 바뀌면 URL 도 바뀐다 → 캐시 우선
  e.respondWith(caches.match(r, { cacheName: CACHE }).then(hit => hit || fetch(r).then(res => {
    if (res.ok && u.search.includes('v=')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
    return res;
  })));
});
