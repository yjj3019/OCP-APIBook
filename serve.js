// SPDX-License-Identifier: Apache-2.0
// 정적 서버: node serve.js [port] [--host 0.0.0.0] [--no-precompress] [--dev]
// 기본은 127.0.0.1(로컬 전용). 외부 허용은 --host 0.0.0.0 또는 HOST 환경변수.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('node:crypto');
const ROOT = fs.realpathSync.native(__dirname), args = process.argv.slice(2);
const hi = args.indexOf('--host');
const port = +(args.find(a => /^\d+$/.test(a)) || process.env.PORT || 8080);
const host = (hi >= 0 && args[hi + 1]) || process.env.HOST || '127.0.0.1';
const LOOPBACK = ['127.0.0.1', 'localhost', '::1'].includes(host);
const DEV = args.includes('--dev');

const T = 'text/', U = '; charset=utf-8';
const MIME = { '.html': T + 'html' + U, '.js': T + 'javascript' + U, '.css': T + 'css' + U, '.json': 'application/json' + U,
  '.svg': 'image/svg+xml' + U, '.txt': T + 'plain' + U, '.md': T + 'markdown' + U, '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const TEXTUAL = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.md']);
// Pages와 동일한 공개 파일 및 데이터 카탈로그만 서비스한다.
const ROOT_NOEXT = new Set(['LICENSE', 'NOTICE']);                                          // 확장자 없는 공개 문서
const { publicFiles, isDataFile, canonicalBytes, loaderHash } = require('./tools/site-files.js');
// 보안 헤더. CSP 는 인라인 스크립트/이벤트 핸들러를 막아 XSS 피해를 줄인다(script-src 에 'unsafe-inline' 금지).
// style-src 'unsafe-inline' 은 JS 가 만드는 style="" 속성 때문이다. 글꼴은 사용자 시스템 글꼴만 쓴다(웹 글꼴 없음). base-uri 'none' 은 <base> 주입으로 스크립트 경로를 바꾸는 공격 차단.
// 환경변수/인자로 바꿀 수 없게 상수로 고정한다(약화 방지).
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': `default-src 'self'; script-src 'self' '${loaderHash}'; style-src 'self' 'unsafe-inline'; font-src 'none'; img-src 'self' data:; connect-src 'self' https://api.github.com/repos/openshift/openshift-docs/commits/; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'Cross-Origin-Opener-Policy': 'same-origin' };

const realpath = p => new Promise(ok => fs.realpath.native(p, (e, r) => ok(e ? null : r)));
// 실제(정규화된) 경로가 허용 대상인지 검사. realpath 는 Windows 에서 실제 대소문자와 8.3 단축 이름을 풀어주므로 이름 비교가 정확하다.
function allowed(real) {
  const rel = path.relative(ROOT, real);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false; // 루트 밖(정션/심볼릭 링크 포함)
  const parts = rel.split(path.sep), name = parts[parts.length - 1];
  if (parts.some(s => s.startsWith('.'))) return false;
  if (parts.length === 1) return publicFiles.has(name);
  return parts.length === 2 && parts[0] === 'data' && isDataFile(name);
}
// URL 경로 -> 실제 파일 경로(허용되지 않거나 없으면 null). 디렉터리는 index.html 로.
async function resolve(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (/[\0\\:<>"|?*~]/.test(p) || !p.startsWith('/')) return null;        // NUL, 백슬래시, 드라이브/ADS(:), 8.3(~), 예약 문자
  const segs = p.split('/').filter(Boolean);
  if (segs.some(s => s === '..' || s.startsWith('.') || /[. ]$/.test(s))) return null; // 상위 이동, 숨김, 후행 점/공백
  let real = await realpath(path.join(ROOT, ...segs));
  if (!real) return null;
  const st = await fs.promises.stat(real).catch(() => null);
  if (st && st.isDirectory()) real = await realpath(path.join(real, 'index.html'));
  return real && allowed(real) ? real : null;
}

// 압축 캐시(LRU): 키 = 실제 경로|인코딩 (URL 변형/쿼리와 무관). 총량 96MB·256항목 상한.
const MAX_BYTES = 96 << 20, MAX_ITEMS = 256, cache = new Map();
let total = 0;
function evict(keep) {
  for (const [k, e] of cache) {
    if (total <= MAX_BYTES && cache.size <= MAX_ITEMS) break;
    if (k !== keep) { cache.delete(k); total -= e.size; }
  }
}
function compressed(file, st, enc, snapshot, digest) {
  const key = file + '|' + enc, stamp = digest || st.mtimeMs + '|' + st.size, old = cache.get(key);
  if (old && old.stamp === stamp) { cache.delete(key); cache.set(key, old); return old.p; } // 최근 사용으로 갱신
  if (old) { cache.delete(key); total -= old.size; }                                        // 파일이 바뀜: 이전 버전 제거
  const e = { stamp, size: 0 };
  e.p = (snapshot ? Promise.resolve(snapshot) : fs.promises.readFile(file)).then(buf => new Promise((ok, no) => {
    const cb = (err, out) => err ? no(err) : ok(out);
    if (enc === 'br') zlib.brotliCompress(buf, { params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: buf.length > (1 << 20) ? 5 : 9, // 큰 파일은 낮은 품질로 빠르게
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length, [zlib.constants.BROTLI_PARAM_LGWIN]: 22 } }, cb);
    else zlib.gzip(buf, { level: buf.length > (1 << 20) ? 6 : 9 }, cb);
  })).then(out => { if (cache.get(key) === e) { e.size = out.length; total += e.size; evict(key); } return out; })
    .catch(err => { if (cache.get(key) === e) cache.delete(key); throw err; });
  cache.set(key, e);
  return e.p;
}

function send(res, code, body, extra) {
  if (res.headersSent) return res.destroy();
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC, ...extra });
  res.end(body);
}
const HOST_OK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function encodingFor(header, compressible, small) {
  if (!header) return 'identity';
  const quality = new Map();
  for (const part of header.toLowerCase().split(',')) {
    const [name, q] = part.trim().split(/\s*;\s*q\s*=\s*/);
    const value = q === undefined ? 1 : Number(q);
    quality.set(name, value >= 0 && value <= 1 ? value : 0);
  }
  const wildcard = quality.get('*');
  const score = name => quality.get(name) ?? (name === 'identity' ? (wildcard === 0 ? 0 : 1) : wildcard ?? 0);
  const order = compressible ? (small ? ['identity', 'br', 'gzip'] : ['br', 'gzip', 'identity']) : ['identity'];
  return order.filter(name => score(name) > 0).sort((a, b) => score(b) - score(a))[0];
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  if (req.url.length > 2048) return send(res, 414, 'URI Too Long');
  if (LOOPBACK && !HOST_OK.test(req.headers.host || '')) return send(res, 421, 'Misdirected Request'); // DNS rebinding 방어
  const [rawPath, query = ''] = req.url.split('#')[0].split('?');
  const file = await resolve(rawPath);
  const st = file && await fs.promises.stat(file).catch(() => null);
  if (!st || !st.isFile()) return send(res, 404, 'Not found');

  const ext = path.extname(file).toLowerCase(), accept = req.headers['accept-encoding'] || '';
  const coding = encodingFor(accept, TEXTUAL.has(ext), st.size < 1024);
  if (!coding) return send(res, 406, 'Not Acceptable', { Vary: 'Accept-Encoding' });
  const enc = coding === 'identity' ? '' : coding;
  const version = new URLSearchParams(query).get('v');
  const pinned = version !== null && (ext === '.js' || ext === '.css');
  let snapshot, digest;
  if (pinned || ext === '.html') {
    snapshot = canonicalBytes(await fs.promises.readFile(file));
    digest = crypto.createHash('sha256').update(snapshot).digest('base64url');
    if (pinned && digest !== version) return send(res, 410, 'Catalog changed. Reload the page.', { 'Cache-Control': 'no-store' });
  }
  const etag = `W/"${digest || st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16)}${enc ? '-' + enc : ''}"`;
  const headers = { 'Content-Type': MIME[ext] || (ROOT_NOEXT.has(path.basename(file)) ? 'text/plain; charset=utf-8' : 'application/octet-stream'), ETag: etag, 'Last-Modified': st.mtime.toUTCString(),
    'Cache-Control': pinned && !DEV ? 'public, max-age=31536000, immutable' : 'no-cache', ...SEC };
  if (TEXTUAL.has(ext)) headers.Vary = 'Accept-Encoding';

  // 조건부 요청: If-None-Match 가 있으면 그것만, 없으면 If-Modified-Since
  const inm = req.headers['if-none-match'], ims = Date.parse(req.headers['if-modified-since']);
  if (inm ? inm.split(',').some(t => t.trim() === etag || t.trim() === '*') : (ims <= Date.now() && ims >= Math.floor(st.mtimeMs / 1000) * 1000)) {
    res.writeHead(304, headers); return res.end();
  }
  if (enc) {
    headers['Content-Encoding'] = enc;
    const body = await compressed(file, st, enc, snapshot, digest);
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers); return res.end(req.method === 'HEAD' ? undefined : body);
  }
  headers['Content-Length'] = snapshot ? snapshot.length : st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  if (snapshot) return res.end(snapshot);
  const rs = fs.createReadStream(file);
  rs.on('error', () => res.destroy());       // 읽기 오류 -> 연결만 정리
  res.on('close', () => rs.destroy());       // 클라이언트 중단 시 스트림 정리
  rs.pipe(res);
}

const server = http.createServer({ maxHeaderSize: 8192, connectionsCheckingInterval: 2000 }, (req, res) => {
  handle(req, res).catch(e => { console.error(e.message); send(res, 500, 'Internal Server Error'); });
});
// 자원 제한(slowloris/연결 고갈 방어)
server.headersTimeout = 10000; server.requestTimeout = 15000; server.keepAliveTimeout = 5000;
server.setTimeout(30000); server.maxConnections = 256;
server.on('clientError', (e, sock) => sock.destroy());
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `포트 ${port} 가 이미 사용 중입니다. 다른 포트로 실행하세요: node serve.js ${port + 1}` : '서버 오류: ' + e.message);
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(`http://${host === '0.0.0.0' || host === '::' ? 'localhost' : host}:${server.address().port}  (바인딩: ${host}${LOOPBACK ? ', 로컬 전용' : ''})`);
  if (!LOOPBACK) console.warn('경고: 외부 노출 모드입니다. Host 헤더 검증이 꺼져 있으니 신뢰할 수 있는 네트워크에서만 사용하세요.');
  if (args.includes('--no-precompress')) return;
  // 시작 직후 data/ 를 백그라운드에서 순차 선압축 (캐시 상한의 절반까지만, 요청 처리를 막지 않음)
  (async () => {
    const dir = path.join(ROOT, 'data');
    for (const f of await fs.promises.readdir(dir).catch(() => []))
      for (const enc of ['br', 'gzip']) {
        const file = path.join(dir, f), st = await fs.promises.stat(file).catch(() => null);
        if (st && st.isFile() && TEXTUAL.has(path.extname(f)) && st.size >= 1024 && total + st.size < MAX_BYTES / 2) await compressed(file, st, enc).catch(() => {});
      }
  })();
});
