// SPDX-License-Identifier: Apache-2.0
/* API Book MCP 서버 (stdio, 의존성 없음)
 *   node mcp/server.js
 * data/ 의 API 레퍼런스를 MCP 도구로 노출한다. 읽기 전용이며 네트워크·클러스터에 접근하지 않는다.
 * 도구: search_apis, get_api, get_fields, get_constraints, compare_versions, list_apis, generate_manifest
 * 프로토콜: JSON-RPC 2.0, 줄 단위(newline-delimited) JSON. 로그는 stderr 로만 남긴다. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SERVER = { name: 'api-book', version: '1.1.0' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

/* ---------- 데이터 적재 ---------- */
const ApiSearch = require(path.join(ROOT, 'search.js'));
const dataFile = rel => path.join(ROOT, 'data', rel);
const VERS = [];
let ctx, loaded, MERGED, LATEST, MAPIS, engines, unifiedEngine, generation;

function catalogGeneration() {
  const s = fs.statSync(dataFile('merged.js'), { bigint: true, throwIfNoEntry: false });
  return s && [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join('/');
}
function selectGeneration(id) {
  if (id === generation) return;
  const next = vm.createContext({});
  next.window = next;
  vm.runInContext(fs.readFileSync(dataFile('merged.js'), 'utf8'), next);
  const merged = next.MERGED;
  const records = Object.values(merged.apis);
  VERS.splice(0, VERS.length, ...merged.list);
  ctx = next; MERGED = merged; LATEST = merged.default; MAPIS = records;
  loaded = new Set(['merged.js']); engines = {}; unifiedEngine = undefined;
  generation = id;
}
function currentCatalog(action) {
  // Publishing swaps the whole data directory. Discard a result if it changed during a lazy read.
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = catalogGeneration();
    if (!before) {
      // The publisher may be between the two directory renames (notably on Windows).
      if (attempt < 2) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      continue;
    }
    try {
      selectGeneration(before);
      const result = action();
      if (before === catalogGeneration()) return result;
    } catch (error) {
      if (before === catalogGeneration()) throw error;
    }
    generation = undefined;
  }
  throw new Error('카탈로그가 갱신 중입니다. 조회를 다시 시도해 주세요.');
}
function load(rel) {
  if (loaded.has(rel)) return;
  vm.runInContext(fs.readFileSync(dataFile(rel), 'utf8'), ctx, { filename: rel });
  loaded.add(rel);
}
currentCatalog(() => {});
function core(v) {
  if (!VERS.includes(v)) throw new Error(`지원하지 않는 버전: ${v} (가능: ${VERS.join(', ')})`);
  if (!engines[v]) {
    load(`${v}.js`); load(`${v}.fidx.js`);
    const db = ctx.DB[v], fi = (ctx.FIDX && ctx.FIDX[v]) || {};
    db.apis.forEach(a => { a.cons = MERGED.apis[a.kind + '|' + a.group].cons.filter(c => c.v.includes(v)); a.fp = fi[a.id] || []; if (a.d) a.d.eps.forEach(e => { e.m = e.ms.map(x => x.m + ': ' + x.d); }); });
    engines[v] = { db, byId: new Map(db.apis.map(a => [a.id, a])), E: ApiSearch.create({ guide: db.guide, apis: db.apis }) };
  }
  return engines[v];
}
function searchEngine(version) {
  if (version) return core(version).E;
  if (!unifiedEngine) {
    load('legacy.js');
    const { db } = core(LATEST);
    const apis = ApiSearch.unifiedRecords(db.apis, ctx.LEGACY, MERGED);
    unifiedEngine = ApiSearch.create({ guide: db.guide, apis });
  }
  return unifiedEngine;
}
function fieldsOf(v, a) {
  load(`${v}.fields.${a.book}.js`);
  return (ctx.FIELDS && ctx.FIELDS[v] && ctx.FIELDS[v][a.id]) || [];
}

/* ---------- API 찾기 ---------- */
const norm = s => String(s || '').trim().toLowerCase();
function resolve(q) {
  if (typeof q !== 'string' || !q.trim()) throw new Error('api 는 비어 있지 않은 문자열이어야 합니다 (예: Route, apps/Deployment, core/ConfigMap)');
  const k = norm(q).replace(/^(core|v1)?\//, 'core/');
  const gk = m => norm(`${m.group || 'core'}/${m.kind}`), kg = m => norm(`${m.kind}.${m.group || 'core'}`);
  let hit = MAPIS.filter(m => Object.values(m.id).some(i => i === k) || norm(m.kind) === k || gk(m) === k || kg(m) === k);
  if (hit.length > 1) {   // 같은 Kind 가 여러 그룹에 있으면 목록을 알려 준다
    const exact = hit.filter(m => gk(m) === k || kg(m) === k);
    if (exact.length === 1) hit = exact;
  }
  if (!hit.length) throw new Error(`API 를 찾지 못했습니다: "${q}". search_apis 로 먼저 검색하세요.`);
  if (hit.length > 1) throw new Error(`"${q}" 가 여러 API 와 일치합니다. "group/Kind" 형식으로 지정하세요: ` + hit.map(m => `${m.group || 'core'}/${m.kind}`).join(', '));
  return hit[0];
}
function pickVersion(m, v, query) {
  const exact = m.vers.filter(release => m.id[release] === norm(query));
  if (exact.length) {
    if (v && !exact.includes(v)) throw new Error(query + ' ID의 제공 버전: ' + exact.join(', '));
    return v || exact[0];
  }
  if (v) { if (!m.id[v]) throw new Error(`${m.kind} 는 ${v} 에 없습니다 (제공: ${m.vers.join(', ')})`); return v; }
  return m.vers.includes(LATEST) ? LATEST : m.vers[0];
}
const rec = (m, v) => core(v).byId.get(m.id[v]);
const lim = (x, dflt, max) => Number.isInteger(x) && x > 0 ? Math.min(max, x) : dflt;
const optStr = (a, k) => { if (a[k] !== undefined && typeof a[k] !== 'string') throw new Error(`${k} 는 문자열이어야 합니다`); return a[k]; };
const verArg = a => { const v = optStr(a, 'version'); if (v && !VERS.includes(v)) throw new Error(`지원하지 않는 버전: ${v} (가능: ${VERS.join(', ')})`); return v; };
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const gvOf = (m, v) => (m.group ? m.group + '/' : '') + m.gv[v];
const TYPE = { imm: '변경 불가', dep: '폐지 예정', prev: '미리보기/기능 게이트', single: '싱글턴', excl: '상호 배타', cond: '조건부', limit: '값 제한' };
const brief = (m, v) => ({ id: m.id[v], kind: m.kind, group: m.group || 'core', apiVersion: gvOf(m, v), book: m.book, namespaced: m.ns, versions: m.vers, tier: m.tier || undefined, constraints: m.countsByVersion[v] });

/* ---------- 도구 ---------- */
const VER = { type: 'string', enum: VERS, get description() { return `문서 버전 (기본 ${LATEST})`; } };
const TOOLS = [
  { name: 'search_apis', description: '컨테이너 플랫폼 API(예: route.openshift.io/Route, apps/Deployment)를 키워드로 검색한다(한글·영문, Kind, 필드 경로, 제약 문장 지원). 같은 API 는 버전과 무관하게 한 번만 나온다.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: '검색어 (예: "route tls termination", "pvc", "spec.tls.termination", "deprecated")' }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 }, version: { ...VER, description: '생략하면 모든 문서 버전을 통합 검색합니다' } }, required: ['query'] },
    run(a) {
      if (typeof a.query !== 'string' || !a.query.trim()) throw new Error('query 는 비어 있지 않은 문자열이어야 합니다');
      const v = verArg(a), r = searchEngine(v).search(a.query.slice(0, 300), {});
      const out = r.apis.slice(0, lim(a.limit, 10, 50)).map(x => {
        const record = x.d.a, m = MERGED.apis[record.kind + '|' + record.group];
        const release = v || x.fieldVersions?.[0] || record.rv || LATEST;
        const o = brief(m, release);
        o.version = release;
        if (x.fieldVersions) o.fieldVersions = x.fieldVersions;
        o.summary = cut(rec(m, release).d?.desc, 220); return o;
      });
      return { version: v || 'all', total: r.apis.length, results: out, relaxed: !!r.relaxed };
    } },
  { name: 'list_apis', description: 'API 목록을 분류(book)·범위·제약 유형으로 거르거나 개수를 센다.',
    inputSchema: { type: 'object', properties: { book: { type: 'string', description: '분류 (예: network_apis, workloads_apis). 비우면 전체' }, scope: { type: 'string', enum: ['namespaced', 'cluster'] }, has_constraint: { type: 'string', enum: Object.keys(TYPE) }, version: VER, limit: { type: 'integer', default: 100, maximum: 300 } } },
    run(a) {
      const v = verArg(a) || LATEST; optStr(a, 'book');
      if (a.scope !== undefined && !['namespaced', 'cluster'].includes(a.scope)) throw new Error('scope 는 namespaced 또는 cluster');
      if (a.has_constraint !== undefined && !TYPE[a.has_constraint]) throw new Error('has_constraint 는 ' + Object.keys(TYPE).join(', ') + ' 중 하나');
      let l = MAPIS.filter(m => m.vers.includes(v));
      if (a.book) l = l.filter(m => m.book === a.book);
      if (a.scope) l = l.filter(m => a.scope === 'cluster' ? m.ns === false : m.ns === true);
      if (a.has_constraint) l = l.filter(m => m.countsByVersion[v][a.has_constraint]);
      const books = {}; MAPIS.filter(m => m.vers.includes(v)).forEach(m => { books[m.book] = (books[m.book] || 0) + 1; });
      return { version: v, count: l.length, books, apis: l.slice(0, lim(a.limit, 100, 300)).map(m => ({ id: m.id[v], kind: m.kind, group: m.group || 'core', apiVersion: gvOf(m, v), namespaced: m.ns })) };
    } },
  { name: 'get_api', description: 'API 한 개의 개요: 설명, 제공 버전, 범위, 호환성 레벨, 엔드포인트, 최상위 필드, 제약 요약.',
    inputSchema: { type: 'object', properties: { api: { type: 'string', description: 'Kind, "group/Kind" 또는 id (예: Route, route.openshift.io/Route)' }, version: VER }, required: ['api'] },
    run(a) {
      const m = resolve(a.api), v = pickVersion(m, verArg(a), a.api), r = rec(m, v), d = r.d || {};
      return Object.assign(brief(m, v), {
        version: v, apiVersion: gvOf(m, v), docUrl: r.url, description: cut(d.desc, 1500),
        availability: m.vers.length === VERS.length ? '모든 버전에서 제공' : `제공 버전: ${m.vers.join(', ')} (없는 버전: ${VERS.filter(x => !m.vers.includes(x)).join(', ')})`,
        required: d.required || [], topLevelFields: (d.props || []).filter(p => !/^(apiVersion|kind)$/.test(p.n)).map(p => ({ name: p.n, type: p.t, description: cut(p.d, 200) })),
        endpoints: (d.eps || []).map(e => ({ path: e.p, methods: e.ms.map(x => `${x.m}: ${x.d}`),
          queryParametersByMethod: Object.fromEntries(e.ms.map(x => [x.m, x.q || []])) })),
      });
    } },
  { name: 'get_fields', description: '중첩 필드 상세. path 가 비면 최상위 필드, "spec.tls" 처럼 주면 그 하위 필드(타입·필수·설명)를 돌려준다. 배열 하위는 "spec.rules[]" 형식.',
    inputSchema: { type: 'object', properties: { api: { type: 'string' }, path: { type: 'string', description: '비우면 최상위' }, version: VER }, required: ['api'] },
    run(a) {
      const m = resolve(a.api), v = pickVersion(m, verArg(a), a.api), r = rec(m, v), p = (optStr(a, 'path') || '').trim().replace(/^\./, '');
      let children, required;
      if (!p) { children = (r.d.props || []).map(x => [x.n, x.t, x.d]); required = r.d.required || []; }
      else {
        const e = fieldsOf(v, r).find(x => x.p === '.' + p);
        if (!e) throw new Error(`경로를 찾지 못했습니다: ${p}. 상위 경로에서 get_fields 로 하위 필드를 확인하세요.`);
        children = e.r; required = e.q || [];
      }
      const known = new Set(fieldsOf(v, r).map(x => x.p));
      return { api: `${m.group || 'core'}/${m.kind}`, version: v, path: p || '(최상위)', fields: children.filter(c => !c[0].endsWith('[]')).map(([n, t, d]) => {   // 'x[]' 는 배열 항목 표시용 보조 행이라 뺀다
        const sub = (p ? p + '.' : '') + n;
        return { name: n, type: t, required: required.includes(n), description: cut(d, 400), hasChildren: known.has('.' + sub) || known.has('.' + sub + '[]') };
      }) };
    } },
  { name: 'get_constraints', description: 'API 의 제약·제한 사항(변경 불가, 폐지 예정, 미리보기, 싱글턴, 상호 배타, 조건부, 값 제한)과 각 제약이 적용되는 버전, 호환성 레벨. 원문 설명 문장에서 추출한 것이므로 정확한 내용은 원문을 확인한다.',
    inputSchema: { type: 'object', properties: { api: { type: 'string' }, version: VER, type: { type: 'string', enum: Object.keys(TYPE) } }, required: ['api'] },
    run(a) {
      const m = resolve(a.api);
      const requested = verArg(a), version = requested && pickVersion(m, requested, a.api);
      if (a.type !== undefined && !Object.hasOwn(TYPE, a.type)) throw new Error('type 은 ' + Object.keys(TYPE).join(', ') + ' 중 하나');
      const list = [], shownCounts = {};
      for (const c of m.cons || []) {
        if (version && !c.v.includes(version) || a.type && c.t !== a.type) continue;
        const scopedPaths = version && c.pathsByVersion?.[version];
        const primary = scopedPaths ? scopedPaths[0] : c.p;
        const count = scopedPaths ? scopedPaths.length : c.n;
        const versions = version ? [version] : c.v;
        list.push({ type: c.t, typeName: TYPE[c.t], path: primary || '(API 전체)', statement: c.x, versions,
          alsoAt: count > 1 ? `${count}곳 (예: ${(scopedPaths || c.ps).slice(0, 3).join(', ')})` : undefined,
          primaryPathVersions: versions.filter(v => !c.pathsByVersion || c.pathsByVersion[v].includes(primary)),
          pathsByVersion: scopedPaths ? { [version]: scopedPaths } : c.pathsByVersion });
        shownCounts[c.t] = (shownCounts[c.t] || 0) + 1;
      }
      return { api: `${m.group || 'core'}/${m.kind}`, version, versions: m.vers, tier: m.tier, counts: version ? m.countsByVersion[version] : m.constraintTotals || m.flags,
        shownCounts: version ? shownCounts : m.flags, constraints: list, note: '설명 문장에서 정규식으로 추출한 요약입니다.' };
    } },
  { name: 'compare_versions', description: 'API 의 버전 간 차이(필드 추가/삭제, 타입 변경, 필수 여부 변경, 엔드포인트 변경).',
    inputSchema: { type: 'object', properties: { api: { type: 'string' } }, required: ['api'] },
    run(a) {
      const m = resolve(a.api);
      return { api: `${m.group || 'core'}/${m.kind}`, versions: m.vers, availability: Object.fromEntries(VERS.map(v => [v, m.vers.includes(v)])),
        fieldChanges: m.fdiff || [], typeChanges: m.tdiff || [], requiredChanges: m.rdiff || [], endpointChanges: m.ediff || [],
        note: '항목의 v 는 그 필드가 존재하는 버전 목록, sub 는 함께 묶인 하위 항목 수입니다.' };
    } },
  { name: 'generate_manifest', description: '필수 필드만 채운 YAML 뼈대를 만든다(값은 자리표시자). 실제 클러스터에 적용하기 전에 값을 채워야 한다.',
    inputSchema: { type: 'object', properties: { api: { type: 'string' }, version: VER, name: { type: 'string', default: 'example' }, namespace: { type: 'string', default: 'default' } }, required: ['api'] },
    run(a) {
      const m = resolve(a.api), v = pickVersion(m, verArg(a), a.api), r = rec(m, v), ents = new Map(fieldsOf(v, r).map(x => [x.p, x]));
      const name = optStr(a, 'name') || 'example', ns = optStr(a, 'namespace') || 'default';
      if (name.length > 253 || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/.test(name)) throw new Error('name 은 소문자 RFC 1123 서브도메인이어야 합니다(소문자·숫자·"-"·".", 253자 이하)');
      if (ns.length > 63 || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(ns)) throw new Error('namespace 는 소문자 RFC 1123 라벨이어야 합니다(소문자·숫자·"-", 63자 이하)');
      const yamlString = require('../sim.js').yamlDump;
      // Workloads can have 253-character names, but selector values and container names allow 63.
      const label = name.length <= 63 ? name : name.slice(0, 50) + '-' + require('node:crypto').createHash('sha256').update(name).digest('hex').slice(0, 12);
      const container = label.split('.')[0].replace(/-+$/, '');
      const REF = {   // 문서에 하위 필드가 없는 참조 타입 중 필수로 자주 나오는 것
        LabelSelector: pad => [`${pad}matchLabels:`, `${pad}  app: ${yamlString(label)}`],
        PodTemplateSpec: pad => [`${pad}metadata:`, `${pad}  labels:`, `${pad}    app: ${yamlString(label)}`, `${pad}spec:`, `${pad}  containers:`, `${pad}  - name: ${yamlString(container)}`, `${pad}    image: "<image>"`],
      };
      const lines = [], isArr = t => /^array/i.test(t);
      const ph = t => /^int|^number/i.test(t) ? '0' : /^bool/i.test(t) ? 'false' : /^string/i.test(t) ? '"<string>"' : isArr(t) ? '[]' : '{}' + (/^object$/i.test(t) ? '' : ' # ' + t);
      // 최상위 객체 필드는 하위에 필수 필드가 있으면(예: Deployment 의 spec) 자신이 필수가 아니어도 뼈대에 넣는다. 그 아래는 필수만.
      const needsObj = (cp, d) => { const e = d < 7 && ents.get('.' + cp); return !!e && ((e.q || []).length > 0 || e.r.some(x => !x[0].endsWith('[]') && !isArr(x[1]) && needsObj(cp + '.' + x[0], d + 1))); };
      const emit = (ind, p, kids, req, depth) => {
        const out = [], pad = '  '.repeat(ind);
        for (const [n, t] of kids) {
          if (n.endsWith('[]')) continue;   // 배열 항목 표시용 행
          const cp = (p ? p + '.' : '') + n, want = req.includes(n);
          if (isArr(t)) {
            if (!want) continue;
            const it = ents.get('.' + cp + '[]');
            const sub = it && depth < 6 ? emit(ind + 1, cp + '[]', it.r.map(x => [x[0], x[1]]), it.q || [], depth + 1) : [];
            if (!sub.length) { out.push(`${pad}${n}: []`); continue; }
            out.push(`${pad}${n}:`); sub[0] = pad + '- ' + sub[0].slice(pad.length + 2); out.push(...sub);
          } else if (want || (!p && needsObj(cp, 0))) {   // 최상위 필드(spec 등)만 암묵적으로 포함
            const e = ents.get('.' + cp);
            const sub = e && depth < 6 ? emit(ind + 1, cp, e.r.map(x => [x[0], x[1]]), e.q || [], depth + 1) : [];
            if (sub.length) out.push(`${pad}${n}:`, ...sub); else if (REF[t]) out.push(`${pad}${n}:`, ...REF[t](pad + '  ')); else out.push(`${pad}${n}: ${ph(t)}`);
          }
        }
        return out;
      };
      const top = (r.d.props || []).filter(p => !/^(apiVersion|kind|metadata|status)$/.test(p.n)).map(p => [p.n, p.t]);
      lines.push(...emit(0, '', top, r.d.required || [], 0));
      const head = [`apiVersion: ${gvOf(m, v)}`, `kind: ${m.kind}`, 'metadata:', `  name: ${yamlString(name)}`].concat(m.ns ? [`  namespace: ${yamlString(ns)}`] : []);
      const yaml = head.concat(lines).join('\n') + '\n';
      return { api: `${m.group || 'core'}/${m.kind}`, version: v, namespaced: m.ns, yaml, note: '필수 필드만 포함한 뼈대입니다. "<...>" 와 0/false 는 자리표시자이고, 문서에 하위 필드가 없는 참조 타입은 {} 로 남습니다(LabelSelector·PodTemplateSpec 은 기본 틀 제공). 제약은 get_constraints 로 확인하세요.' };
    } },
];

for (const tool of TOOLS) {
  const run = tool.run;
  tool.run = args => currentCatalog(() => run(args));
}

/* ---------- JSON-RPC ---------- */
const send = o => process.stdout.write(JSON.stringify(o) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return;   // 알림(notifications/initialized 등)에는 응답하지 않는다
  if (typeof method !== 'string' || (typeof id !== 'string' && typeof id !== 'number')) return err(id === null || typeof id === 'string' || typeof id === 'number' ? id : null, -32600, 'Invalid Request');
  switch (method) {
    case 'initialize': {
      currentCatalog(() => {});
      const want = params && params.protocolVersion;
      return ok(id, { protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER,
        instructions: VERS.join('/') + ' 컨테이너 플랫폼 API 레퍼런스(읽기 전용, 비공식). search_apis 결과의 id와 version을 get_api, get_fields, get_constraints에 함께 전달하세요.' });
    }
    case 'ping': return ok(id, {});
    case 'tools/list': currentCatalog(() => {}); return ok(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      if (params !== undefined && (typeof params !== 'object' || params === null)) return err(id, -32602, 'params 는 객체여야 합니다');
      const t = TOOLS.find(x => x.name === (params && params.name));
      if (t && params.arguments !== undefined && (typeof params.arguments !== 'object' || params.arguments === null || Array.isArray(params.arguments))) return err(id, -32602, 'arguments 는 객체여야 합니다');
      if (!t) return err(id, -32602, `알 수 없는 도구: ${params && params.name}`);
      try {
        const out = t.run((params && params.arguments) || {});
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: false });
      } catch (e) { return ok(id, { content: [{ type: 'text', text: String(e && e.message || e) }], isError: true }); }
    }
    default:
      return err(id, -32601, `지원하지 않는 메서드: ${method}`);
  }
}

if (require.main === module) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    for (let i; (i = buf.indexOf('\n')) >= 0; ) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { err(null, -32700, 'JSON 파싱 오류'); continue; }
      const one = m => {
        if (!m || typeof m !== 'object' || Array.isArray(m)) return err(null, -32600, 'Invalid Request');
        try { handle(m); } catch (e) { err(typeof m.id === 'string' || typeof m.id === 'number' ? m.id : null, -32603, String(e && e.message || e)); }
      };
      if (Array.isArray(msg)) { if (!msg.length) err(null, -32600, 'Invalid Request'); else msg.forEach(one); continue; }
      one(msg);
    }
  });
  process.stdin.on('end', () => { process.exitCode = 0; });   // 남은 출력을 다 쓴 뒤 자연히 종료
  process.stderr.write(`[api-book] MCP 서버 시작 (${VERS.join(', ')}, API ${MAPIS.length}개)\n`);
}
module.exports = { TOOLS, handle };
