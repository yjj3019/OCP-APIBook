// SPDX-License-Identifier: Apache-2.0
// node tools/test-build.js : data/ 검증
const fs = require('fs'), path = require('path'), vm = require('vm');
const D = path.join(__dirname, '..', 'data');
const load = f => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(D, f), 'utf8'), { window: w }); return w; };
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const V = load('versions.js').VERSIONS, M = load('merged.js').MERGED, LG = load('legacy.js').LEGACY;
const core = {}, keys = new Set();
for (const v of M.list) {
  core[v] = load(v + '.js').DB[v];
  for (const a of core[v].apis) keys.add(a.kind + '|' + a.group);
}
ok(Object.keys(M.apis).length === keys.size, `merged 키 수 ${Object.keys(M.apis).length} == (kind,group) 합집합 ${keys.size}`);
let bad = 0;
for (const [k, r] of Object.entries(M.apis)) {
  if (JSON.stringify(r.vers) !== JSON.stringify(Object.keys(r.id).sort((a, b) => { const [x1, y1] = a.split('.').map(Number), [x2, y2] = b.split('.').map(Number); return x2 - x1 || y2 - y1; }))) bad++;
  for (const v of r.vers) if (!core[v].apis.some(a => a.id === r.id[v] && a.kind + '|' + a.group === k)) bad++;
}
ok(bad === 0, `vers/id 일치 및 id 가 core 에 존재 (불일치 ${bad})`);
const top = M.default, topIds = new Set(core[top].apis.map(a => a.kind + '|' + a.group));
const legKeys = new Set(LG.apis.map(a => a.kind + '|' + a.group));
const expect = Object.keys(M.apis).filter(k => !M.apis[k].vers.includes(top));
ok(LG.apis.every(a => !topIds.has(a.kind + '|' + a.group)) && legKeys.size === expect.length && expect.every(k => legKeys.has(k)), `legacy ${LG.apis.length}개 == ${top} 에 없는 API ${expect.length}개`);
ok(LG.apis.every(a => a.rv && LG.fidx[a.id] !== undefined || !a.d), 'legacy rv/fidx 존재');
const R = M.apis['Route|route.openshift.io'];
ok(R && R.vers.length === 3, 'Route vers 3개');
ok(R && R.cons.some(c => c.t === 'imm'), 'Route cons 에 imm 있음: ' + (R.cons.find(c => c.t === 'imm') || {}).x);
ok(R && R.tier['4.22'] === 1, 'Route tier[4.22]===1');
ok(R && R.ns === true, 'Route ns===true');
// 원문 타입 접미사(_v2 등)는 버전마다 달라 정규화 후 비교하므로, 실제 변경이 없는 Route 의 tdiff 는 비어야 한다
ok(R && R.tdiff.length === 0, 'Route tdiff 비어 있음(접미사 정규화): ' + JSON.stringify(R && R.tdiff));
ok(Object.values(M.apis).every(r => r.tdiff.every(d => new Set(Object.values(d.t).map(x => String(x).replace(/_v\d+/g, ''))).size > 1)), 'tdiff 에 접미사만 다른 가짜 변경 없음 (총 ' + Object.values(M.apis).reduce((a, r) => a + r.tdiff.length, 0) + ')');
ok(/^[0-9a-f]{12}$/.test(M.build), 'MERGED.build 12자리 16진: ' + M.build);
ok(JSON.stringify((M.apis['Backup|config.openshift.io'] || {}).vers) === '["4.21"]' && legKeys.has('Backup|config.openshift.io'), 'Backup vers==[4.21] 및 legacy 포함');
ok(JSON.stringify((M.apis['BackendTLSPolicy|gateway.networking.k8s.io'] || {}).vers) === '["4.22"]', 'BackendTLSPolicy vers==[4.22]');
const fmt = r => ['fdiff', 'rdiff'].every(k => Array.isArray(r[k]) && r[k].every(x => typeof x.p === 'string' && Array.isArray(x.v))) &&
  Array.isArray(r.tdiff) && r.tdiff.every(x => typeof x.p === 'string' && x.t && typeof x.t === 'object') && r.ediff.every(x => typeof x.e === 'string' && Array.isArray(x.v));
const cc = Object.entries(M.apis).filter(([k]) => /^ControllerConfig/.test(k)).map(x => x[1]);
const five = [...cc, ...Object.values(M.apis).filter(r => r.fdiff.length || r.tdiff.length)].slice(0, 5);
ok(five.length === 5 && five.every(fmt), 'fdiff/tdiff/rdiff/ediff 형식 (5개 샘플)');
ok(Object.values(M.apis).every(fmt), '전체 diff 형식');
const sz = f => (fs.statSync(path.join(D, f)).size / 1024).toFixed(0) + 'KB';
console.log(`size merged.js ${sz('merged.js')}, legacy.js ${sz('legacy.js')}`);
ok(fs.statSync(path.join(D, 'merged.js')).size <= 1048576, 'merged.js <= 1MB');
const all = Object.values(M.apis), cnt = {}, flat = [];
for (const r of all) for (const c of r.cons) { cnt[c.t] = (cnt[c.t] || 0) + 1; flat.push([r, c]); }
console.log('cons 유형별:', JSON.stringify(cnt), '총', flat.length, '/ trunc', all.filter(r => r.trunc).length);
ok(all.every(r => r.cons.every(c => c.x.length <= 240)), 'x 길이 <= 240');
ok(all.every(r => r.cons.every(c => Array.isArray(c.v) && c.v.length && c.v.every(v => r.vers.includes(v)))), 'cons v 는 API 가 존재하는 버전의 부분집합');
ok(all.every(r => new Set(r.cons.map(c => c.t + '\u0000' + c.x)).size === r.cons.length), 'API 안에서 (유형, 문장) 중복 없음(묶음)');
ok(all.every(r => r.cons.every(c => !c.ps || (c.ps.length >= 2 && c.ps.length <= 40 && c.ps[0] === c.p && c.n >= c.ps.length))), 'ps/n 형식 (ps>=2개, <=40, ps[0]===p, n>=ps 길이)');
ok(all.every(r => { const f = {}; r.cons.forEach(c => f[c.t] = (f[c.t] || 0) + 1); return JSON.stringify(f) === JSON.stringify(r.flags); }), 'flags == 묶음 개수');
let seed = +process.env.SEED || 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 15; i++) { const [r, c] = flat[Math.floor(rnd() * flat.length)]; console.log(`  ${r.kind}|${c.p}|${c.t}|${c.x.slice(0, 80)}`); }
{
  const sep = (r, a, b) => [...r.fdiff, ...r.rdiff, ...r.ediff].some(e => e.v.includes(a) !== e.v.includes(b)) || r.tdiff.some(e => e.t && e.t[a] !== undefined && e.t[b] !== undefined && e.t[a] !== e.t[b]);
  let mism = 0; const ex = [];
  for (let i = 0; i + 1 < M.list.length; i++) { const a = M.list[i], b = M.list[i + 1]; for (const r of all) if (r.vers.includes(a) && r.vers.includes(b) && (r.fp[a] !== r.fp[b]) !== sep(r, a, b)) { mism++; if (ex.length < 5) ex.push(`${r.kind} ${b}→${a}`); } }
  ok(mism === 0, `버전 지문(변경 여부)과 차이 목록이 일치 (불일치 ${mism}${ex.length ? ': ' + ex.join(', ') : ''})`);
  const S = V.summary; ok(Object.keys(S).length === M.list.length - 1 && Object.values(S).every(s => s.추가 + s.동일 + s.변경 >= 0), 'versions.summary 버전 쌍 ' + JSON.stringify(S));
}
// ───────── 강화 검사 ─────────
const HDR = '/* Derived from the Red Hat OpenShift Container Platform documentation (Apache-2.0); extracted and reformatted, with generated constraint summaries. See NOTICE. */';
const files = fs.readdirSync(D).filter(f => f.endsWith('.js'));
ok(files.every(f => fs.readFileSync(path.join(D, f), 'utf8').split('\n', 1)[0] === HDR), `(g) 모든 데이터 파일(${files.length}개) 첫 줄이 헤더 주석`);
ok(!files.some(f => /^\d+\.\d+\.fields\.js$/.test(f)), '옛 단일 <버전>.fields.js 없음');
// (a) guide html 안전성
const BADHTML = /<\s*(script|style|iframe|object|embed|base|link|meta)\b|\bon\w+\s*=|javascript:/i;
let badG = 0, badHref = 0, nHref = 0;
for (const v of M.list) for (const g of core[v].guide) {
  if (BADHTML.test(g.html)) badG++;
  for (const m of g.html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) { nHref++; if (!/^https?:\/\//i.test(m[1] ?? m[2])) badHref++; }
}
ok(badG === 0, `(a) guide html 에 위험 태그/속성 없음 (위반 ${badG})`);
ok(badHref === 0, `(a) href 는 https?:// 로만 시작 (검사 ${nHref}, 위반 ${badHref})`);
// (b) url
ok(M.list.every(v => core[v].apis.every(a => typeof a.url === 'string' && a.url.startsWith('https://docs.redhat.com/'))), '(b) 모든 API url 이 https://docs.redhat.com/ 로 시작');
// 분할 필드 파일 로드(순서 무관 확인을 위해 역순으로 같은 전역에 로드)
const FLD = {}, bookFiles = {};
{
  const w = {}; const ctx = vm.createContext({ window: w });
  for (const v of M.list) {
    bookFiles[v] = files.filter(f => f.startsWith(v + '.fields.')).sort().reverse();
    for (const f of bookFiles[v]) vm.runInContext(fs.readFileSync(path.join(D, f), 'utf8'), ctx);
  }
  Object.assign(FLD, w.FIELDS || {});
}
// (e) _scrape 에서 독립적으로 만든 기대 구조와 비교
{
  const ZW = /[​‌‍﻿]/g, CUT = ' …(원문에서 계속)';
  const z = o => typeof o === 'string' ? o.replace(ZW, '') : Array.isArray(o) ? o.map(z) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, x]) => [z(k), z(x)])) : o;
  let bad = 0, nApi = 0, dup = 0, miss = 0, extra = 0;
  for (const v of M.list) {
    const R = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_scrape', `v${v}.json`), 'utf8').replace(/^﻿/, ''));
    const exp = {}, book = {};
    for (const a of core[v].apis) { const d = R.apis[a.id]; if (d && d.fields.length) { exp[a.id] = d.fields; book[a.id] = a.book; } }
    const { replaceMarks: TM } = require('./trademark.js');
    const mk = (s, c) => TM(typeof s === 'string' && s.length >= c - 1 ? s + CUT : s);
    const ty = (t, sub) => { const x = String(t == null ? '' : t).replace(/`/g, '').replace(/\s+/g, ' ').trim(); return x || (sub ? 'object' : ''); };
    const E = {};
    for (const id in exp) {
      const fl = exp[id];
      const has = p => fl.some(g => g.p === p || g.p.startsWith(p + '.') || g.p.startsWith(p + '[]'));
      E[id] = z(fl.map(f => ({ ...f, t: ty(f.t, f.r.length), d: mk(f.d, 3000), r: f.r.map(r => [r[0], ty(r[1], has(f.p + '.' + r[0])), mk(r[2], 4000)]) })));
    }
    const got = FLD[v] || {}, seen = {};
    for (const f of bookFiles[v]) {   // 각 id 가 정확히 하나의 책 파일에, 그리고 그 API 의 book 과 같은 파일에 있는지
      const w = {}; vm.runInNewContext(fs.readFileSync(path.join(D, f), 'utf8'), { window: w });
      const b = f.slice(v.length + 8, -3);
      for (const id in w.FIELDS[v]) { seen[id] = (seen[id] || 0) + 1; if (book[id] !== b) bad++; }
    }
    for (const id in exp) { nApi++; if (!seen[id]) miss++; else if (seen[id] > 1) dup++; }
    for (const id in seen) if (!(id in exp)) extra++;
    if (JSON.stringify(Object.keys(E).sort().map(k => [k, E[k]])) !== JSON.stringify(Object.keys(got).sort().map(k => [k, got[k]]))) bad++;
  }
  ok(miss === 0 && dup === 0 && extra === 0 && bad === 0, `(e) 필드 있는 API ${nApi}개가 각각 정확히 한 책 파일에 있고(누락 ${miss}, 중복 ${dup}, 초과 ${extra}) 병합 결과가 기대 구조와 동일 (불일치 ${bad})`);
}
// (c)(d) 모든 문자열 검사
{
  let zw = 0, tick = 0, strs = 0;
  const walk = o => {
    if (typeof o === 'string') { strs++; if (/[​‌‍﻿]/.test(o)) zw++; }
    else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const k in o) { walk(k); walk(o[k]); }
  };
  walk(V); walk(M); walk(LG); for (const v of M.list) { walk(core[v]); walk(FLD[v]); walk(load(v + '.fidx.js').FIDX[v]); }
  ok(zw === 0, `(c) 제로 폭 문자 없음 (검사 문자열 ${strs}개, 위반 ${zw})`);
  for (const v of M.list) {
    for (const a of core[v].apis) if (a.d) for (const p of a.d.props) if (/`/.test(p.t)) tick++;
    for (const id in FLD[v] || {}) for (const f of FLD[v][id]) { if (/`/.test(f.t)) tick++; for (const r of f.r) if (/`/.test(r[1])) tick++; }
  }
  ok(tick === 0, `(d) 타입에 백틱(백틱만인 행 포함) 없음 (위반 ${tick})`);
}
// (f) fdiff/rdiff 파생 항목 없음, sub 형식
{
  let bad = 0, nsub = 0;
  for (const r of Object.values(M.apis)) for (const k of ['fdiff', 'rdiff']) {
    for (const x of r[k]) {
      if (x.sub !== undefined) { nsub++; if (!Number.isInteger(x.sub) || x.sub < 1) bad++; }
      for (const y of r[k]) if (x !== y && x.v.join() === y.v.join() && (x.p.startsWith(y.p + '.') || x.p.startsWith(y.p + '[].'))) bad++;
    }
  }
  ok(bad === 0, `(f) fdiff/rdiff 에 부모와 같은 v 인 하위 항목 없음, sub 는 양의 정수 (sub 항목 ${nsub}, 위반 ${bad})`);
}
// (h) 설명 문장에 상표 이름이 남지 않음(식별자 제외) — 원문 라이선스 조건
{
  const { MARK_LEFT } = require('./trademark.js'); let left = 0; const ex = [];
  const chk = (s, w) => { if (typeof s === 'string' && MARK_LEFT.test(s)) { left++; if (ex.length < 3) ex.push(w + ': ' + s.match(/.{0,30}(OpenShift|Reds+Hat).{0,20}/)[0]); } };
  for (const v of M.list) { for (const a of core[v].apis) { if (!a.d) continue; chk(a.d.desc, a.kind); a.d.props.forEach(p => chk(p.d, a.kind + '.' + p.n)); } core[v].guide.forEach(g => { chk(g.title, 'guide'); chk(String(g.html).replace(/<[^>]*>/g, ' '), 'guide ' + g.id); }); for (const id in (FLD[v] || {})) FLD[v][id].forEach(f => { chk(f.d, id); f.r.forEach(r => chk(r[2], id + f.p + '.' + r[0])); }); }
  for (const r of all) r.cons.forEach(c => chk(c.x, r.kind + ' cons'));
  ok(left === 0, '(h) 설명·가이드·제약 문장에 상표 이름 없음 (남은 ' + left + (ex.length ? ': ' + ex.join(' | ') : '') + ')');
}
console.log(fail ? `FAIL (${fail})` : 'ALL PASS'); process.exit(fail ? 1 : 0);
