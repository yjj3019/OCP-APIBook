// SPDX-License-Identifier: Apache-2.0
/* 배포 스탬프: 정적 파일의 내용 해시를 index.html 의 ?v= 토큰과 서비스 워커(sw.js)에 반영한다.
 *   node tools/stamp.js           (데이터를 다시 빌드한 뒤, 또는 코드·CSS·폰트를 고친 뒤 실행)
 * - 앱 JS/CSS와 데이터 URL 및 무결성 값은 각 파일의 SHA-256으로 고정한다.
 * - sw.js 는 이 값들로 매번 새로 생성된다(캐시 이름에 해시가 들어가 오래된 캐시는 자동 삭제). */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
function stageStamps(root, data, out) {
  const text = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const sha = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);

  const CODE = ['app.css', 'sim.css', 'ui-kit.js', 'search.js', 'endpoints.js', 'core.js', 'views.js', 'palette.js', 'boot.js', 'graph.js', 'viz.js', 'topo.js', 'sim.js'];
  const LAZY = ['graph.js', 'viz.js', 'topo.js', 'sim.js'];
  const { isDataFile, pageLoader, loaderHash } = require('./site-files');
  const hashes = {};
  const digest = file => crypto.createHash('sha256').update(text(file)).digest('base64');
  for (const file of CODE) hashes[file] = digest(path.join(root, file));
  for (const file of fs.readdirSync(data).filter(isDataFile).sort()) {
    hashes['data/' + file] = digest(path.join(data, file));
  }
  const assetUrl = file => file + '?v=' + Buffer.from(hashes[file], 'base64').toString('base64url');
  const win = {}; vm.runInNewContext(text(path.join(data, 'merged.js')), { window: win });
  const build = win.MERGED.build, latest = win.MERGED.default;

  let html = text(path.join(root, 'index.html'));
  html = html.replace(/script-src 'self'(?: 'sha256-[^']+')?;/, `script-src 'self' '${loaderHash}';`)
    .replace(/<script id="page-loader">[\s\S]*?<\/script>/, () => '<script id="page-loader">' + pageLoader + '</script>')
    .replace(/<script id="catalog-hashes" type="application\/json">[^<]*<\/script>/, '<script id="catalog-hashes" type="application/json">' + JSON.stringify(hashes) + '</script>')
    .replace(/((?:src|href)=")([\w./-]+\.(?:js|css))\?v=[\w.-]+"(?: integrity="[^"]*")?/g,
      (_, attr, file) => `${attr}${assetUrl(file)}" integrity="sha256-${hashes[file]}"`);
  fs.writeFileSync(path.join(out, 'index.html'), html);

  // 사전 캐시 목록: index.html 이 참조하는 같은 출처 자원 + 지연 로딩 코드 + 기본 버전 핵심 데이터
  const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:|\/\/)/.test(u));
  const pre = [...new Set(['./'].concat(refs, LAZY.map(assetUrl), [assetUrl(`data/${latest}.js`), assetUrl(`data/${latest}.fidx.js`)]))];
  const integrity = Object.fromEntries(Object.keys(hashes).map(file => [assetUrl(file), 'sha256-' + hashes[file]]));
  integrity['./'] = 'sha256-' + crypto.createHash('sha256').update(html).digest('base64');

  const sw = `/* 자동 생성 파일(tools/stamp.js) — 직접 고치지 마세요. 재방문 속도와 오프라인 동작을 위한 서비스 워커. */
const BUILD = '${build}-${sha(html)}';
const PREFIX = 'api-book:' + encodeURIComponent(self.registration.scope) + ':';
const CACHE = PREFIX + BUILD;
const PRECACHE = ${JSON.stringify(pre, null, 2)};
const INTEGRITY = ${JSON.stringify(integrity)};

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload', integrity: INTEGRITY[u] || '' })));
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
  const scope = self.registration.scope;
  if (!r.url.startsWith(scope)) return;
  if (r.mode === 'navigate') {
    // Keep the offline HTML paired with the assets of this successfully installed worker.
    e.respondWith(fetch(r).catch(() => caches.match(self.registration.scope, { cacheName: CACHE }).then(h => h || Response.error())));
    return;
  }
  const key = r.url.slice(scope.length);
  if (!Object.hasOwn(INTEGRITY, key)) return;
  e.respondWith((async () => {
    const hit = await caches.match(r, { cacheName: CACHE }).catch(() => undefined);
    if (hit) return hit;
    const res = await fetch(new Request(r, { integrity: INTEGRITY[key] }));
    if (res.ok) {
      const copy = res.clone();
      e.waitUntil(caches.open(CACHE).then(c => c.put(r, copy)).catch(() => {}));
    }
    return res;
  })());
});
`;
  fs.writeFileSync(path.join(out, 'sw.js'), sw);
  console.log(JSON.stringify({ dataBuild: build, precache: pre.length }));
  return ['index.html', 'sw.js'].map(name => [path.join(out, name), path.join(root, name)]);
}
if (require.main === module) {
  require('./publish').withPublication(ROOT, work => stageStamps(ROOT, path.join(ROOT, 'data'), work));
}
module.exports = { stageStamps };
