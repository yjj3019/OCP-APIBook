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
const nt = t => String(t == null ? '' : t).replace(/_v\d+/g, '');   // 원문 타입 접미사(_v2 등)는 버전마다 달라 비교에서 제외(화면용 원본 문자열은 그대로 둠)
const fp = o => crypto.createHash('md5').update(JSON.stringify(o)).digest('hex').slice(0, 8);

const HASH = [];   // [파일명, 내용] — MERGED.build 해시 계산용
const KEEP = {};   // 병합/제약 추출용 원본 보관 (버전별)
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
    const sig = { f: d.props.map(p => p.n + ':' + nt(p.t)), n: d.fields.flatMap(f => f.r.map(r => f.p + '.' + r[0] + ':' + nt(r[1]))), e: d.eps.map(e => e.p + ' ' + e.ms.map(m => m.m).join(',')) };
    const key = row.kind + '|' + group;
    (KEEP[v] ||= {})[key] = { rec: apis[apis.length - 1], paths: fidx[id], d, ver: version, id, book, group, kind: row.kind };
    ((meta.apis[key] ||= {})[v] = { id, v: version, fp: fp(sig) });
  }

  const outW = (name, txt) => { fs.writeFileSync(path.join(OUT, name), txt); HASH.push([name, txt]); };
  outW(`${v}.js`, WINDOW('DB', v, { guide, apis, params: R.params }));
  outW(`${v}.fidx.js`, WINDOW('FIDX', v, fidx));
  outW(`${v}.fields.js`, WINDOW('FIELDS', v, fields));
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
{ const t = 'window.VERSIONS=' + JSON.stringify(meta) + ';\n'; fs.writeFileSync(path.join(OUT, 'versions.js'), t); HASH.push(['versions.js', t]); }
console.log(JSON.stringify({ report, summary }, null, 1));

// ───────── 버전 통합(data/merged.js) + 제약 추출 + 레거시(data/legacy.js) ─────────
const PAT = {
  imm: /immutable|cannot be (changed|updated|modified|edited)|can ?not be (changed|updated|modified)|may not be (changed|updated|modified)|(is|are|be|as|marked|mark it as) read-?only|is set once|once set|must not be (changed|modified)|cannot be updated/i,
  // `will be removed` 단독은 오탐(예: "oldest backup will be removed") — 폐기/향후 릴리스 표지와 함께일 때만
  dep: /deprecat|no longer (supported|used|recommended|needed)|obsolete|planned for removal|scheduled for removal|(will be|is being) removed.{0,200}(no longer|obsolete|in a future release|next (API |major )?(version|release))|(no longer|obsolete|in a future release|next (API |major )?(version|release)).{0,200}(will be|is being) removed/i,
  // `feature gate` 단독은 제외(대부분 GA/기본 활성 게이트 설명). 기술 프리뷰·alpha/beta 표기가 함께일 때만 유지
  prev: /Technology Preview|Tech Preview|TechPreviewNoUpgrade|DevPreviewNoUpgrade|CustomNoUpgrade|Developer Preview|alpha[- ]level|beta[- ]level|this field is alpha|alpha field|\((alpha|beta)\)|(alpha|beta) (feature|field|API)|(alpha|beta|experimental|preview)\b.{0,60}feature ?gate|feature ?gate.{0,60}\b(alpha|beta|experimental|preview|disabled by default)/i,
  single: /singleton|canonical name is|only one .{0,40} (may|can|will) exist|is named .?cluster|name .{0,20}must be .?cluster/i,
  excl: /mutually exclusive|exactly one of|at most one of|only one of|one and only one|only one (field|option|of)|cannot be (set|specified|used) (together|at the same time|with(?! more than))/i,
  limit: /at most \d+|at least \d+|no more than \d+|no fewer than \d+|between \d+ and \d+|maximum( of)? \d+|minimum( of)? \d+|up to \d+|must be (a )?(positive|non-negative|between|greater|less)|valid values (are|include)|allowed values|must be one of|must match (the )?(regex|regular expression|pattern|format|^)|must be a (valid|DNS|RFC)|max length|length of .{0,40} (must|cannot|should|is limited)/i,
  cond: /only (valid|applicable|used|allowed|supported|effective|honou?red|considered) (when|if|for|with|in)|ignored (if|when|unless)|must be set (when|if)|is required (when|if)|required when|only when|has no effect (if|when|unless)|applies only|not applicable/i,
};
// 유형별 추가 제외 규칙(문장·경로·API 종류 기준)
const IMM_BAD = /immutable (representation|container image|osImage|image)|underlying immutable|contains the immutable|cannot be (modified|changed) due|^Headers cannot be modified/i;
const EXTRA = {
  imm: (s) => !IMM_BAD.test(s),
  prev: (s, p, kind) => kind !== 'FeatureGate' && !/^status\.featureGates/.test(p),
  single: (s, p) => p === '',   // 최상위(API 자체 설명)에서만
};
const PRIO = ['dep', 'prev', 'imm', 'single', 'excl', 'cond', 'limit'];
const CAP = { imm: 15, dep: 40, prev: 20, single: 3, excl: 32, cond: 12, limit: 10 };   // 묶음((유형,문장)) 기준 상한
const ALLRX = new RegExp(Object.values(PAT).map(r => r.source).join('|'), 'i');
const SKIP_PATH = /^(apiVersion|kind|metadata)(\.|$)/;
const NOISE = /^(Is required when creating resources|APIVersion defines|Kind is a string value|Standard object.?s metadata|metadata is the standard|Servers may infer|Cannot be updated\.?$|In CamelCase|More info:|Compatibility level \d)/i;
const clean = s => s.replace(/\s+/g, ' ').trim();
function sentences(text) {
  const out = [];
  for (const para of String(text || '').split(/\n+/)) for (let s of para.split(/(?<=[.!?])\s+(?=[A-Z0-9`"'(])/)) {
    s = clean(s.replace(/More info:.*$/i, ''));
    if (!s || NOISE.test(s)) continue;
    if (s.length > 300) {
      const m = ALLRX.exec(s); if (!m) continue;
      const a = Math.max(0, m.index - 120), b = Math.min(s.length, m.index + m[0].length + 120);
      s = (a > 0 ? '…' : '') + s.slice(a, b).trim() + (b < s.length ? '…' : '');
    }
    if (s.length > 240) s = s.slice(0, 239) + '…';
    out.push(s);
  }
  return out;
}
const classify = (s, p, kind) => PRIO.find(t => PAT[t].test(s) && (!EXTRA[t] || EXTRA[t](s, p, kind)));
const depth = p => p === '' ? 0 : p.split(/\.|\[\]/).filter(Boolean).length;
function extract(d, kind) {   // 상한 없이 (유형, 경로, 문장) 전부 반환. 상한은 병합 후 묶음 기준으로 적용
  const seen = new Set(), res = [];
  const push = (p, text) => {
    if (SKIP_PATH.test(p)) return;
    for (const s of sentences(text)) {
      const t = classify(s, p, kind); if (!t) continue;
      const k = p + '\u0000' + s; if (seen.has(k)) continue; seen.add(k);
      res.push({ t, p, x: s });
    }
  };
  push('', d.desc);
  for (const p of d.props) push(p.n, p.d);
  for (const f of d.fields) {
    const b = f.p.replace(/^\./, ''); push(b, f.d);
    for (const r of f.r) push((b ? b + '.' : '') + r[0], r[2]);
  }
  return res;
}
const PS_MAX = 40;
function bundle(cmap) {   // (t,p,x,v) 항목 -> (t,x) 묶음 {t,p,x,v,ps?,n?}, 유형별 CAP 은 묶음 기준
  const g = new Map();
  for (const e of cmap.values()) {
    const k = e.t + '\u0000' + e.x;
    const b = g.get(k) || g.set(k, { t: e.t, x: e.x, v: new Set(), paths: new Set() }).get(k);
    e.v.forEach(v => b.v.add(v)); b.paths.add(e.p);
  }
  const by = {};
  for (const b of g.values()) {
    const ps = [...b.paths].sort(shallow);
    const o = { t: b.t, p: ps[0], x: b.x, v: [...b.v].sort((a, c) => parseFloat(c) - parseFloat(a)) };
    if (ps.length > 1) { o.ps = ps.slice(0, PS_MAX); o.n = ps.length; }
    (by[b.t] ||= []).push(o);
  }
  const res = [];
  for (const t of PRIO) if (by[t]) res.push(...by[t].sort((a, b) => depth(a.p) - depth(b.p) || a.x.length - b.x.length || (a.x < b.x ? -1 : 1)).slice(0, CAP[t]));
  return res;
}
const shallow = (a, b) => depth(a) - depth(b) || (a < b ? -1 : 1);
function shape(d) {   // 경로 -> 타입 / 필수 경로 / 엔드포인트
  const types = new Map(), req = new Set(), eps = new Set();
  for (const p of d.props) if (!/^(apiVersion|kind)$/.test(p.n)) types.set(p.n, nt(p.t));
  for (const n of d.required) req.add(n);
  for (const f of d.fields) {
    const b = f.p.replace(/^\./, '');
    for (const r of f.r) types.set((b ? b + '.' : '') + r[0], nt(r[1]));
    for (const q of f.q || []) req.add((b ? b + '.' : '') + q);
  }
  for (const e of d.eps) eps.add(e.p + ' ' + e.ms.map(m => m.m).sort().join(','));
  return { types, req, eps };
}
const LIM = { fdiff: 120, tdiff: 60, rdiff: 60, ediff: 40, cons: 120 };
const mergedApis = {}, legacy = { apis: [], fidx: {} };
const allKeys = new Set(vers.flatMap(v => Object.keys(KEEP[v] || {})));
for (const key of allKeys) {
  const has = vers.filter(v => KEEP[v] && KEEP[v][key]);   // 내림차순
  const L = KEEP[has[0]][key];
  const rec = { kind: L.kind, group: L.group, book: L.book, vers: has, id: {}, gv: {}, fp: {}, tier: {}, ns: null };
  const shapes = {}, cmap = new Map();
  let anyEp = false, ns = false;
  for (const v of has) {
    const K = KEEP[v][key];
    rec.id[v] = K.id; rec.gv[v] = K.ver; rec.fp[v] = meta.apis[key][v].fp;
    if (K.d) {
      const m = /Compatibility level (\d)/.exec(K.d.desc || ''); if (m) rec.tier[v] = +m[1];
      shapes[v] = shape(K.d);
      if (K.d.eps.length) { anyEp = true; if (K.d.eps.some(e => e.p.includes('{namespace}'))) ns = true; }
      for (const c of extract(K.d, K.kind)) {   // 병합 키는 문장 자체(t|p|x) — 서수 키는 버전 태그를 어긋나게 함
        const kk = c.t + '|' + c.p + '|' + c.x;
        const e = cmap.get(kk); if (e) e.v.push(v); else cmap.set(kk, { t: c.t, p: c.p, x: c.x, v: [v] });
      }
    }
  }
  if (!Object.keys(rec.tier).length) delete rec.tier;
  rec.ns = anyEp ? ns : null;
  let cons = bundle(cmap), trunc = false;
  if (cons.length > LIM.cons) { cons.sort((a, b) => depth(a.p) - depth(b.p)); cons = cons.slice(0, LIM.cons); trunc = true; }
  rec.cons = cons; rec.flags = {};
  for (const c of cons) rec.flags[c.t] = (rec.flags[c.t] || 0) + 1;
  // 버전 간 차이(이 API 가 존재하는 버전 기준)
  const sv = has.filter(v => shapes[v]), diff = { fdiff: [], tdiff: [], rdiff: [], ediff: [] };
  if (sv.length > 1) {
    const paths = new Set(sv.flatMap(v => [...shapes[v].types.keys()]));
    for (const p of paths) {
      const pv = sv.filter(v => shapes[v].types.has(p));
      if (pv.length < sv.length) { if (!SKIP_PATH.test(p)) diff.fdiff.push({ p, v: pv }); continue; }
      const ts = {}; for (const v of sv) ts[v] = shapes[v].types.get(p);
      if (new Set(Object.values(ts)).size > 1) diff.tdiff.push({ p, t: ts });
    }
    const rp = new Set(sv.flatMap(v => [...shapes[v].req]));
    for (const p of rp) { const pv = sv.filter(v => shapes[v].req.has(p)); if (pv.length < sv.length) diff.rdiff.push({ p, v: pv }); }
    const ep = new Set(sv.flatMap(v => [...shapes[v].eps]));
    for (const e of ep) { const pv = sv.filter(v => shapes[v].eps.has(e)); if (pv.length < sv.length) diff.ediff.push({ e, v: pv }); }
    for (const k in diff) {
      diff[k].sort(k === 'ediff' ? (a, b) => (a.e < b.e ? -1 : 1) : (a, b) => shallow(a.p, b.p));
      if (diff[k].length > LIM[k]) { diff[k] = diff[k].slice(0, LIM[k]); trunc = true; }
    }
  }
  Object.assign(rec, diff);
  if (trunc) rec.trunc = true;
  mergedApis[key] = rec;
  if (!has.includes(vers[0])) {
    legacy.apis.push({ ...L.rec, rv: has[0] });
    if (L.paths) legacy.fidx[L.id] = L.paths;
  }
}
const legacyTxt = 'window.LEGACY=' + JSON.stringify(legacy) + ';\n';
const mergedBody = JSON.stringify({ list: vers, default: vers[0], apis: mergedApis });
// build: data/ 모든 산출물(merged 본문·legacy·versions·버전별 파일) 내용 해시 -> 지연 로딩 ?v= 캐시 토큰
const bh = crypto.createHash('sha1');
for (const [n, t] of [...HASH, ['merged', mergedBody], ['legacy.js', legacyTxt]].sort((a, b) => a[0] < b[0] ? -1 : 1)) bh.update(n + '\u0000' + t.length + '\u0000').update(t);
const build = bh.digest('hex').slice(0, 12);
fs.writeFileSync(path.join(OUT, 'merged.js'), 'window.MERGED=' + JSON.stringify({ list: vers, default: vers[0], build, apis: mergedApis }) + ';\n');
fs.writeFileSync(path.join(OUT, 'legacy.js'), legacyTxt);
console.log(`merged ${Object.keys(mergedApis).length} apis, legacy ${legacy.apis.length}`);
