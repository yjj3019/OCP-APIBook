// 정적 서버: node serve.js [port] [--host 0.0.0.0] [--no-precompress]
// 기본은 127.0.0.1(로컬 전용). 외부 허용은 --host 0.0.0.0 또는 HOST 환경변수.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = __dirname, args = process.argv.slice(2);
const hi = args.indexOf('--host');
const port = +(args.find(a => /^\d+$/.test(a)) || process.env.PORT || 8080);
const host = (hi >= 0 && args[hi + 1]) || process.env.HOST || '127.0.0.1';

const T = 'text/', U = '; charset=utf-8';
const MIME = { '.html': T + 'html' + U, '.js': T + 'javascript' + U, '.mjs': T + 'javascript' + U, '.css': T + 'css' + U,
  '.json': 'application/json' + U, '.map': 'application/json' + U, '.svg': 'image/svg+xml' + U, '.txt': T + 'plain' + U,
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm' };
const TEXTUAL = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);
const BLOCKED = new Set(['_scrape', 'node_modules', 'tools']); // 최상위 차단 폴더 (점으로 시작하는 건 전부 차단)
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN' };

// URL -> 절대 경로. 허용되지 않으면 null
function resolve(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (/[\0\\:]/.test(p) || !p.startsWith('/')) return null;          // NUL, 백슬래시, 드라이브 문자(C:)
  const segs = p.split('/').filter(Boolean);
  if (segs.some(s => s === '..' || s.startsWith('.'))) return null;  // 상위 이동, 숨김 파일/폴더
  if (BLOCKED.has(segs[0])) return null;
  const abs = path.resolve(ROOT, ...segs);
  return abs === ROOT || abs.startsWith(ROOT + path.sep) ? abs : null; // 루트 밖 차단(이중 확인)
}

// 압축 결과 캐시: (경로+mtime+크기+인코딩) -> Promise<Buffer>
const cache = new Map();
function compressed(file, st, enc) {
  const stamp = `${file}|${st.mtimeMs}|${st.size}|`, key = stamp + enc;
  if (!cache.has(key)) {
    for (const k of cache.keys()) if (k.startsWith(file + '|') && !k.startsWith(stamp)) cache.delete(k); // 이전 버전 제거
    cache.set(key, fs.promises.readFile(file).then(buf => new Promise((ok, no) => {
      const cb = (e, out) => e ? no(e) : ok(out);
      if (enc === 'br') zlib.brotliCompress(buf, { params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: buf.length > (1 << 20) ? 5 : 9, // 큰 파일은 낮은 품질로 빠르게
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length, [zlib.constants.BROTLI_PARAM_LGWIN]: 22 } }, cb);
      else zlib.gzip(buf, { level: buf.length > (1 << 20) ? 6 : 9 }, cb);
    })).catch(e => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

function send(res, code, body, extra) {
  if (res.headersSent) return res.destroy();
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC, ...extra });
  res.end(body);
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  let file = resolve(req.url.split('?')[0].split('#')[0]);
  if (!file) return send(res, 404, 'Not found');
  let st = await fs.promises.stat(file).catch(() => null);
  if (st && st.isDirectory()) { file = path.join(file, 'index.html'); st = await fs.promises.stat(file).catch(() => null); }
  if (!st || !st.isFile()) return send(res, 404, 'Not found');

  const ext = path.extname(file).toLowerCase(), accept = req.headers['accept-encoding'] || '';
  const enc = TEXTUAL.has(ext) && st.size >= 1024 ? (/\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : '') : '';
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}${enc ? '-' + enc : ''}"`;
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: etag, 'Last-Modified': st.mtime.toUTCString(),
    'Cache-Control': 'no-cache', ...SEC };
  if (TEXTUAL.has(ext)) headers.Vary = 'Accept-Encoding';

  // 조건부 요청: If-None-Match 가 있으면 그것만, 없으면 If-Modified-Since
  const inm = req.headers['if-none-match'], ims = Date.parse(req.headers['if-modified-since']);
  if (inm ? inm.split(',').some(t => t.trim() === etag || t.trim() === '*') : ims >= Math.floor(st.mtimeMs / 1000) * 1000) {
    res.writeHead(304, headers); return res.end();
  }
  if (enc) {
    headers['Content-Encoding'] = enc;
    const body = await compressed(file, st, enc);
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers); return res.end(req.method === 'HEAD' ? undefined : body);
  }
  headers['Content-Length'] = st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  const rs = fs.createReadStream(file);
  rs.on('error', () => res.destroy());       // 읽기 오류 -> 연결만 정리
  res.on('close', () => rs.destroy());       // 클라이언트 중단 시 스트림 정리
  rs.pipe(res);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => { console.error(e.message); send(res, 500, 'Internal Server Error'); });
});
server.on('clientError', (e, sock) => sock.destroy());
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `포트 ${port} 가 이미 사용 중입니다. 다른 포트로 실행하세요: node serve.js ${port + 1}` : '서버 오류: ' + e.message);
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(`http://${host === '0.0.0.0' || host === '::' ? 'localhost' : host}:${server.address().port}  (바인딩: ${host}${host === '127.0.0.1' ? ', 로컬 전용' : ''})`);
  if (args.includes('--no-precompress')) return;
  // 시작 직후 data/ 를 백그라운드에서 순차 선압축 (요청 처리를 막지 않음)
  (async () => {
    const dir = path.join(ROOT, 'data');
    for (const f of await fs.promises.readdir(dir).catch(() => []))
      for (const enc of ['br', 'gzip']) {
        const file = path.join(dir, f), st = await fs.promises.stat(file).catch(() => null);
        if (st && st.isFile() && TEXTUAL.has(path.extname(f)) && st.size >= 1024) await compressed(file, st, enc).catch(() => {});
      }
  })();
});
