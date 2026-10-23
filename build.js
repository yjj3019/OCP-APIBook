/* 수집 원본(_scrape/v<버전>.json) -> data/ 아래 버전별 데이터베이스
 *   data/versions.js        버전 목록과 API 가용성/변경 요약(작게 유지)
 *   data/<ver>.js           가이드 + API 목록 + 설명·최상위 필드·엔드포인트
 *   data/<ver>.fidx.js      중첩 필드 경로 색인(이름만, 검색용)
 *   data/<ver>.fields.js    중첩 필드 상세(설명 포함, 상세 화면에서 지연 로딩)
 * 사용: node build.js [버전...]   (기본: _scrape 에 있는 모든 버전)
 */
const fs = require('fs'), path = require('path');
const crypto = require('crypto');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const SRC = path.join(__dirname, '_scrape'), OUT = path.join(__dirname, 'data');
fs.mkdirSync(OUT, { recursive: true });

const all = fs.readdirSync(SRC).map(f => (f.match(/^v(\d+\.\d+)\.json$/) || [])[1]).filter(Boolean);
const vers = (process.argv.length > 2 ? process.argv.slice(2) : all).sort((a, b) => parseFloat(b) - parseFloat(a));
const WINDOW = (name, v, obj) => `(window.${name}=window.${name}||{})[${JSON.stringify(v)}]=${JSON.stringify(obj)};\n`;
const fp = o => crypto.createHash('md5').update(JSON.stringify(o)).digest('hex').slice(0, 8);

const meta = { list: vers, default: vers[0], apis: {} };   // apis: "Kind|group" -> { ver: {id, v, fp} }
const report = {};

for (const v of vers) {
  const R = read(path.join(SRC, `v${v}.json`));
  const guide = R.guide.filter(s => s.id && s.id !== 'api-index').map(s => ({ id: s.id, level: s.level, title: s.title, html: s.html }));
  const apis = [], fidx = {}, fields = {};
  let missing = 0;

  // 원문 오류 방어: 같은 앵커를 가리키는 행이 둘이면 이름이 앵커와 맞는 행만 남긴다(예: 4.20의 IPAddress → IPAddressClaim)
  const pick = new Map(); const dropped = [];
  for (const r of R.index) {
    const id = r.url.split('#')[1], ok = id.startsWith(r.kind.toLowerCase() + '-'), p = pick.get(id);
    if (!p) pick.set(id, { r, ok }); else if (ok && !p.ok) { dropped.push(p.r.kind); pick.set(id, { r, ok }); } else dropped.push(r.kind);
  }
  const rows = [...pick.values()].map(x => x.r);
  for (const row of rows) {
    const id = row.url.split('#')[1], book = row.url.split('/html-single/')[1].split('/')[0];
    const slash = row.gv.lastIndexOf('/');
    const group = slash >= 0 ? row.gv.slice(0, slash) : '', version = slash >= 0 ? row.gv.slice(slash + 1) : row.gv;
    const d = R.apis[id];
    if (!d) { missing++; apis.push({ id, kind: row.kind, group, version, book, url: row.url, d: null }); continue; }
    const names = new Set(d.props.map(p => p.n));
    const required = d.required.filter(r => names.has(r));
    const eps = d.eps.map(e => ({ p: e.p, ms: e.ms }));
    apis.push({ id, kind: row.kind, group, version, book, url: row.url, d: { desc: d.desc, type: d.type, required, props: d.props, eps } });

    // 중첩 필드: 이름만 색인, 상세는 별도 파일
    const paths = new Set(d.props.map(p => p.n));
    for (const f of d.fields) for (const r of f.r) paths.add((f.p + '.' + r[0]).replace(/^\./, ''));
    fidx[id] = [...paths];
    if (d.fields.length) fields[id] = d.fields;

    // 버전 간 비교용 지문: 필드 경로+타입, 엔드포인트 경로+메서드
    const sig = { f: d.props.map(p => p.n + ':' + p.t), n: d.fields.flatMap(f => f.r.map(r => f.p + '.' + r[0] + ':' + r[1])), e: d.eps.map(e => e.p + ' ' + e.ms.map(m => m.m).join(',')) };
    const key = row.kind + '|' + group;
    ((meta.apis[key] ||= {})[v] = { id, v: version, fp: fp(sig) });
  }

  fs.writeFileSync(path.join(OUT, `${v}.js`), WINDOW('DB', v, { guide, apis, params: R.params }));
  fs.writeFileSync(path.join(OUT, `${v}.fidx.js`), WINDOW('FIDX', v, fidx));
  fs.writeFileSync(path.join(OUT, `${v}.fields.js`), WINDOW('FIELDS', v, fields));
  const sz = f => (fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(2) + 'MB';
  report[v] = { apis: apis.length, missing, dropped, guide: guide.length, files: [`${v}.js ${sz(v + '.js')}`, `${v}.fidx.js ${sz(v + '.fidx.js')}`, `${v}.fields.js ${sz(v + '.fields.js')}`] };
}

// 변경 요약(버전 쌍별)
const summary = {};
for (let i = 0; i < vers.length - 1; i++) {
  const a = vers[i], b = vers[i + 1]; let added = 0, removed = 0, changed = 0, same = 0;
  for (const k in meta.apis) { const x = meta.apis[k][a], y = meta.apis[k][b]; if (x && !y) added++; else if (!x && y) removed++; else if (x && y) (x.fp === y.fp ? same++ : changed++); }
  summary[`${b}→${a}`] = { 추가: added, 삭제: removed, 변경: changed, 동일: same };
}
meta.summary = summary;
fs.writeFileSync(path.join(OUT, 'versions.js'), 'window.VERSIONS=' + JSON.stringify(meta) + ';\n');
console.log(JSON.stringify({ report, summary }, null, 1));
