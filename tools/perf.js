// 성능 측정: node tools/perf.js  (임시 포트에서 serve.js 를 띄워 측정 후 종료)
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), PORT = 8700 + Math.floor(Math.random() * 200);
const FILES = ['/index.html', '/search.js', '/graph.js', '/viz.js', '/topo.js', '/sim.js', '/data/versions.js',
  '/data/4.22.js', '/data/4.22.fidx.js', '/data/4.22.fields.js'].filter(f => fs.existsSync(path.join(ROOT, f)));
const FIRST = ['/index.html', '/search.js', '/data/versions.js', '/data/4.22.js', '/data/4.22.fidx.js'];
const MODES = { identity: '', gzip: 'gzip', br: 'br' };

// 압축 해제 없이 raw 응답을 받아 전송 바이트와 소요시간(ms)을 잰다
function get(url, headers) {
  return new Promise((ok, no) => {
    const t0 = process.hrtime.bigint();
    http.get({ port: PORT, host: '127.0.0.1', path: url, headers, agent: false }, res => {
      let n = 0;
      res.on('data', c => n += c.length);
      res.on('end', () => ok({ status: res.statusCode, bytes: n, ms: Number(process.hrtime.bigint() - t0) / 1e6, etag: res.headers.etag }));
    }).on('error', no);
  });
}
const kb = n => (n / 1024).toFixed(1).padStart(9);
const ms = n => n.toFixed(1).padStart(8);
const pct = (a, b) => ((1 - a / b) * 100).toFixed(1).padStart(5) + '%';

(async () => {
  // --no-precompress: 순수 콜드(첫 요청 때 압축) 시간을 재기 위해 선압축 비활성화
  const srv = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT), '--no-precompress'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { if (await get('/index.html', {}).then(() => 1, () => 0)) break; await new Promise(r => setTimeout(r, 100)); }
    const rows = [], size = {};
    for (const f of FILES) {
      const r = { f, t: {} };
      for (const [m, ae] of Object.entries(MODES)) {
        const h = ae ? { 'Accept-Encoding': ae } : {};
        const a = await get(f, h), b = await get(f, h), c = await get(f, { ...h, 'If-None-Match': a.etag });
        r.t[m] = { bytes: a.bytes, cold: a.ms, warm: b.ms, c304: c.status === 304 ? c.ms : NaN };
      }
      rows.push(r); size[f] = r.t;
    }
    console.log(`\n[전송 크기]  (KB, 감소율은 원본 대비)`);
    console.log('파일'.padEnd(24) + '원본'.padStart(9) + ' gzip'.padStart(10) + ' 감소율'.padStart(8) + ' br'.padStart(10) + ' 감소율'.padStart(8));
    for (const { f, t } of rows)
      console.log(f.padEnd(24) + kb(t.identity.bytes) + ' ' + kb(t.gzip.bytes) + ' ' + pct(t.gzip.bytes, t.identity.bytes) + ' ' + kb(t.br.bytes) + ' ' + pct(t.br.bytes, t.identity.bytes));
    console.log(`\n[응답 시간 ms]  콜드=첫 요청, 웜=두 번째 요청(캐시), 304=If-None-Match 재검증`);
    console.log('파일'.padEnd(24) + ['identity', 'gzip', 'br'].map(m => (m + ' 콜드/웜/304').padStart(28)).join(''));
    for (const { f, t } of rows)
      console.log(f.padEnd(24) + ['identity', 'gzip', 'br'].map(m => `${ms(t[m].cold)} /${ms(t[m].warm)} /${ms(t[m].c304)}`.padStart(28)).join(''));
    const fs1 = FIRST.filter(f => size[f]), sum = m => fs1.reduce((s, f) => s + size[f][m].bytes, 0);
    const sc = m => fs1.reduce((s, f) => s + size[f][m].cold, 0), sw = m => fs1.reduce((s, f) => s + size[f][m].warm, 0);
    console.log(`\n[합계] 첫 화면 필요 파일 (${fs1.length}개: ${fs1.join(', ')})`);
    console.log('방식'.padEnd(10) + '전송량 KB'.padStart(12) + '감소율'.padStart(9) + '콜드합 ms'.padStart(12) + '웜합 ms'.padStart(10));
    for (const m of Object.keys(MODES))
      console.log(m.padEnd(10) + kb(sum(m)).padStart(12) + (m === 'identity' ? '' : pct(sum(m), sum('identity'))).padStart(9) + ms(sc(m)).padStart(12) + ms(sw(m)).padStart(10));
  } finally { srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
