/* 자동 생성 파일(tools/stamp.js) — 직접 고치지 마세요. 재방문 속도와 오프라인 동작을 위한 서비스 워커. */
const BUILD = 'ccc3fd6d1082-bf054264b8da';
const CACHE = 'api-book-' + BUILD;
const PRECACHE = [
  "./",
  "app.css?v=ccc3fd6d1082",
  "sim.css?v=ccc3fd6d1082",
  "ui-kit.js?v=ccc3fd6d1082",
  "data/merged.js?v=ea32cca761d5",
  "data/legacy.js?v=16898af37395",
  "search.js?v=ccc3fd6d1082",
  "core.js?v=ccc3fd6d1082",
  "views.js?v=ccc3fd6d1082",
  "palette.js?v=ccc3fd6d1082",
  "boot.js?v=ccc3fd6d1082",
  "graph.js?v=ccc3fd6d1082",
  "viz.js?v=ccc3fd6d1082",
  "topo.js?v=ccc3fd6d1082",
  "sim.js?v=ccc3fd6d1082",
  "data/4.22.js?v=bf054264b8da",
  "data/4.22.fidx.js?v=bf054264b8da"
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const r = await Promise.allSettled(PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' }))));
    const bad = r.filter(x => x.status === 'rejected').length; if (bad) console.warn('[sw] 사전 캐시 실패', bad, '개 — 온라인에서 필요할 때 받습니다');
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith('api-book-') || k.startsWith('ocp-api-book-')) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  if (r.mode === 'navigate') {   // HTML 은 네트워크 우선(새 배포를 바로 받음), 오프라인이면 캐시
    e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(u.origin + u.pathname, cp)); } return res; })
      .catch(() => caches.match(u.origin + u.pathname).then(h => h || caches.match(new URL('./', location.href).href)).then(h => h || Response.error())));
    return;
  }
  // 코드·데이터는 ?v= 해시가 URL 에 들어 있어 내용이 바뀌면 URL 도 바뀐다 → 캐시 우선
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => {
    if (res.ok && u.search.includes('v=')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
    return res;
  })));
});
