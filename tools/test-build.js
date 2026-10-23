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
  if (JSON.stringify(r.vers) !== JSON.stringify(Object.keys(r.id).sort((a, b) => parseFloat(b) - parseFloat(a)))) bad++;
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
const t = R && R.tdiff.find(d => d.p === 'metadata');
ok(!!t && t.t['4.22'] !== t.t['4.21'], 'Route tdiff metadata: ' + JSON.stringify(t && t.t));
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
let seed = +process.env.SEED || 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 15; i++) { const [r, c] = flat[Math.floor(rnd() * flat.length)]; console.log(`  ${r.kind}|${c.p}|${c.t}|${c.x.slice(0, 80)}`); }
const S = V.summary, want = { '4.21→4.22': [6, 7, 72, 190], '4.20→4.21': [11, 1, 44, 214] };
for (const k in want) { const s = S[k]; ok(s && [s.추가, s.삭제, s.변경, s.동일].join() === want[k].join(), `versions.summary ${k} ${s && [s.추가, s.삭제, s.변경, s.동일]}`); }
console.log(fail ? `FAIL (${fail})` : 'ALL PASS'); process.exit(fail ? 1 : 0);
