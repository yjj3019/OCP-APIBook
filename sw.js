/* 자동 생성 파일(tools/stamp.js) — 직접 고치지 마세요. 재방문 속도와 오프라인 동작을 위한 서비스 워커. */
const BUILD = '81a89c3f8e8c-e8c97e61676f';
const CACHE = 'ocp-api-book-' + BUILD;
const PRECACHE = [
  "./",
  "fonts/plex-sans.woff2",
  "fonts/plex-mono-400.woff2",
  "fonts/fonts.css",
  "app.css?v=81a89c3f8e8c",
  "sim.css?v=81a89c3f8e8c",
  "ui-kit.js?v=81a89c3f8e8c",
  "data/merged.js?v=d8d18de3d907",
  "data/legacy.js?v=16898af37395",
  "search.js?v=81a89c3f8e8c",
  "core.js?v=81a89c3f8e8c",
  "views.js?v=81a89c3f8e8c",
  "palette.js?v=81a89c3f8e8c",
  "boot.js?v=81a89c3f8e8c",
  "graph.js?v=81a89c3f8e8c",
  "viz.js?v=81a89c3f8e8c",
  "topo.js?v=81a89c3f8e8c",
  "sim.js?v=81a89c3f8e8c",
  "data/4.22.js?v=e8c97e61676f",
  "data/4.22.fidx.js?v=e8c97e61676f",
  "fonts/plex-mono-500.woff2",
  "fonts/plex-mono-600.woff2"
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { /* 일부 실패해도 설치는 진행 */ })));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('ocp-api-book-') && k !== CACHE) await caches.delete(k);
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
    if (res.ok && (u.search.includes('v=') || u.pathname.startsWith('/fonts/'))) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
    return res;
  })));
});
