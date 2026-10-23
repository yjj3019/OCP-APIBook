/* 배포 스탬프: 정적 파일의 내용 해시를 index.html 의 ?v= 토큰과 서비스 워커(sw.js)에 반영한다.
 *   node tools/stamp.js           (데이터를 다시 빌드한 뒤, 또는 코드·CSS·폰트를 고친 뒤 실행)
 * - 코드 토큰: 앱 JS/CSS/폰트 전체의 해시. 하나라도 바뀌면 모든 코드 URL 이 바뀐다(지연 로딩 스크립트 포함: core.js 의 ?v= 를 재사용).
 * - 데이터 토큰: data/merged.js, data/legacy.js 는 각자의 해시. 나머지 data/ 파일은 MERGED.build 를 ?v= 로 쓴다.
 * - sw.js 는 이 값들로 매번 새로 생성된다(캐시 이름에 해시가 들어가 오래된 캐시는 자동 삭제). */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const R = p => path.join(__dirname, '..', p);
const sha = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);

const CODE = ['app.css', 'sim.css', 'fonts/fonts.css', 'ui-kit.js', 'search.js', 'core.js', 'views.js', 'palette.js', 'boot.js', 'graph.js', 'viz.js', 'topo.js', 'sim.js'];
const LAZY = ['graph.js', 'viz.js', 'topo.js', 'sim.js'];
const fonts = fs.readdirSync(R('fonts')).filter(f => f.endsWith('.woff2')).sort();
const codeHash = sha(Buffer.concat(CODE.map(f => fs.readFileSync(R(f))).concat(fonts.map(f => fs.readFileSync(R('fonts/' + f))))));
const mHash = sha(fs.readFileSync(R('data/merged.js'))), lHash = sha(fs.readFileSync(R('data/legacy.js')));
const win = {}; vm.runInNewContext(fs.readFileSync(R('data/merged.js'), 'utf8'), { window: win });
const build = win.MERGED.build, latest = win.MERGED.default;

let html = fs.readFileSync(R('index.html'), 'utf8');
html = html.replace(/((?:app|sim)\.css|(?:ui-kit|search|core|views|palette|boot)\.js)\?v=[\w.-]+/g, `$1?v=${codeHash}`)
  .replace(/data\/merged\.js\?v=[\w.-]+/, `data/merged.js?v=${mHash}`).replace(/data\/legacy\.js\?v=[\w.-]+/, `data/legacy.js?v=${lHash}`);
fs.writeFileSync(R('index.html'), html);

// 사전 캐시 목록: index.html 이 참조하는 같은 출처 자원 + 지연 로딩 코드 + 기본 버전 핵심 데이터 + 글꼴
const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:|\/\/)/.test(u));
const pre = [...new Set(['./'].concat(refs, LAZY.map(f => `${f}?v=${codeHash}`), [`data/${latest}.js?v=${build}`, `data/${latest}.fidx.js?v=${build}`], fonts.map(f => `fonts/${f}`)))];

const sw = `/* 자동 생성 파일(tools/stamp.js) — 직접 고치지 마세요. 재방문 속도와 오프라인 동작을 위한 서비스 워커. */
const BUILD = '${codeHash}-${build}';
const CACHE = 'ocp-api-book-' + BUILD;
const PRECACHE = ${JSON.stringify(pre, null, 2)};

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
`;
fs.writeFileSync(R('sw.js'), sw);
console.log(JSON.stringify({ codeHash, merged: mHash, legacy: lHash, dataBuild: build, precache: pre.length }));
