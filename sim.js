/* API 설계 시뮬레이터: 스펙 기반 폼 → YAML → 스키마 검증 → 요청/응답 시뮬레이션 */
(function (root) {
  'use strict';
  const LSKEY = 'apibook.sim.';
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const clone = v => JSON.parse(JSON.stringify(v));

  /* ====================== 미니 YAML (파서 + 덤퍼) ====================== */
  const MAX_INPUT = 1 << 20, MAX_DEPTH = 64;                      // 입력 1MB, 중첩 64단계 상한
  const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype']);
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const UNSUP = '지원하지 않는 YAML 문법: ';
  const clip = s => s.length > 40 ? s.slice(0, 40) + '…' : s;
  const BLOCK_RE = /^[|>](?:[1-9][-+]?|[-+][1-9]?)?$/;
  function stripComment(line) {
    let q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = null; }
      else if (c === '"' || c === "'") { if (i === 0 || /[\s:\[{,\-]/.test(line[i - 1])) q = c; }
      else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
    return line;
  }
  function splitTop(s) {
    const out = []; let d = 0, q = null, cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { cur += c; if (c === '\\' && q === '"') { cur += s[++i] || ''; } else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === '[' || c === '{') d++; if (c === ']' || c === '}') d--;
      if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c;
    }
    if (cur.trim() !== '') out.push(cur);
    return out;
  }
  function scalar(s, depth) {
    s = s.trim();
    if (s === '' || s === '~' || /^null$/i.test(s)) return null;
    if (s[0] === '"') { try { return JSON.parse(s); } catch (e) { throw new Error('따옴표가 올바르지 않습니다: ' + clip(s)); } }
    if (s[0] === "'") { if (s.length < 2 || s[s.length - 1] !== "'") throw new Error('따옴표가 닫히지 않았습니다: ' + clip(s)); return s.slice(1, -1).replace(/''/g, "'"); }
    if (s[0] === '&' || s[0] === '*') throw new Error(UNSUP + (s[0] === '&' ? '앵커(&)' : '별칭(*)') + ' — 값을 직접 풀어서 써 주세요: ' + clip(s));
    if (s[0] === '!') throw new Error(UNSUP + '태그(!)' + ': ' + clip(s));
    if (s[0] === '[' || s[0] === '{') return flow(s, depth || 0);
    if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
    if (/^[-+]?\d+$/.test(s)) return parseInt(s, 10);
    if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(s)) return parseFloat(s);
    return s;
  }
  function flow(s, depth) {
    if (depth >= MAX_DEPTH) throw new Error('중첩이 너무 깊습니다 (최대 ' + MAX_DEPTH + '단계)');
    s = s.trim();
    if (s[0] === '[') {
      if (s[s.length - 1] !== ']') throw new Error(UNSUP + '여러 줄에 걸친 흐름식 [ ] 은 한 줄로 쓰거나 블록 형식으로 바꿔 주세요: ' + clip(s));
      return splitTop(s.slice(1, -1)).map(x => scalar(x, depth + 1));
    }
    if (s[s.length - 1] !== '}') throw new Error(UNSUP + '여러 줄에 걸친 흐름식 { } 은 한 줄로 쓰거나 블록 형식으로 바꿔 주세요: ' + clip(s));
    const o = {};
    for (const part of splitTop(s.slice(1, -1))) {
      const ks = keySplit(part.trim()); if (!ks) throw new Error("'key: value' 형식이 아닙니다: " + clip(part));
      if (DANGEROUS.has(ks[0])) throw new Error(`허용되지 않는 키 "${ks[0]}"`);
      if (hasOwn(o, ks[0])) throw new Error(`중복된 키 "${ks[0]}"`);
      o[ks[0]] = ks[1] === '' ? null : scalar(ks[1], depth + 1);
    }
    return o;
  }
  function keySplit(t) {
    if (!t || t[0] === '[' || t[0] === '{') return null;
    let key, rest;
    if (t[0] === '"' || t[0] === "'") {
      const q = t[0]; let j = 1; for (; j < t.length; j++) { if (t[j] === '\\' && q === '"') j++; else if (t[j] === q) break; }
      if (j >= t.length || (t[j + 1] !== ':' || (t[j + 2] !== undefined && t[j + 2] !== ' '))) return null;
      try { key = q === '"' ? JSON.parse(t.slice(0, j + 1)) : t.slice(1, j).replace(/''/g, "'"); } catch (e) { throw new Error('따옴표가 올바르지 않습니다: ' + clip(t)); }
      rest = t.slice(j + 2).trim();
    } else {
      const m = t.match(/^([^]*?):(?:\s+([^]*))?$/); if (!m) return null;
      key = m[1].trim(); rest = (m[2] || '').trim();
      if (key.includes(' #') || key === '') return null;
      if (key[0] === '&' || key[0] === '*' || key[0] === '!') throw new Error(UNSUP + '앵커/별칭/태그: ' + clip(t));
    }
    return [key, rest];
  }
  const isSeq = t => t === '-' || t.startsWith('- ');
  function parseDoc(rawLines, start) {
    const L = [];
    const wrap = (n, fn) => { try { return fn(); } catch (e) { if (e instanceof RangeError || e instanceof TypeError || /^줄 \d+:/.test(e.message)) throw e; throw new Error(`줄 ${n}: ${e.message}`); } };
    rawLines.forEach((line, idx) => {
      const n = start + idx + 1;
      if (line.trim() !== '' && /^\t/.test(line)) throw new Error(`줄 ${n}: 탭 대신 공백으로 들여써 주세요`);
      const t = stripComment(line), ind = /^ */.exec(line)[0].length;
      if (!t.trim()) { L.push({ blank: true, comment: line.trim() !== '', indent: ind, raw: line, n }); return; }
      const m = /^( *)([^]*)$/.exec(t); L.push({ indent: m[1].length, text: m[2].trimEnd(), raw: line, n });
    });
    let i = 0;
    const skip = () => { while (i < L.length && L[i].blank) i++; };
    const KS = ln => wrap(ln.n, () => keySplit(ln.text));
    function block(head, indent, ln0) {
      if (/[1-9]/.test(head)) throw new Error(`줄 ${ln0.n}: ${UNSUP}블록 들여쓰기 표시자(${head})`);
      const lines = []; let ci = -1;
      while (i < L.length) {
        const ln = L[i];
        if (ln.blank && !ln.comment) { lines.push(''); i++; continue; }   // 빈 줄
        if (ln.indent <= indent) break;                                   // 블록 끝(들여쓰기가 얕은 주석 포함)
        if (ci < 0) ci = ln.indent; else if (ln.indent < ci) break;
        lines.push(ln.raw.slice(Math.min(ci, ln.raw.length))); i++;       // '#' 로 시작하는 줄도 원문 그대로
      }
      let tb = 0; while (lines.length && lines[lines.length - 1] === '') { lines.pop(); tb++; }
      const keep = head.includes('+'), strip = head.includes('-');
      let txt = '';
      if (head[0] === '|') txt = lines.join('\n');
      else for (let k = 0; k < lines.length; k++) {                      // 접기: 이어진 줄은 공백, 빈 줄은 개행 1개, 들여쓴 줄은 개행 유지
        const l = lines[k], pv = lines[k - 1];
        if (l === '') txt += '\n'; else if (k > 0 && pv !== '') txt += (l[0] === ' ' || pv[0] === ' ') ? '\n' : ' ';
        txt += l;
      }
      if (lines.length) { if (!strip) txt += '\n'; if (keep) txt += '\n'.repeat(tb); } else if (keep) txt = '\n'.repeat(tb);
      return txt;
    }
    function node(minIndent, dep) {
      skip(); if (i >= L.length) return null;
      const ln = L[i]; if (ln.indent < minIndent) return null;
      if (isSeq(ln.text)) return seq(ln.indent, dep);
      if (KS(ln)) return map(ln.indent, dep);
      i++; return wrap(ln.n, () => scalar(ln.text, 0));
    }
    function map(indent, dep) {
      if (dep > MAX_DEPTH) throw new Error(`줄 ${L[i].n}: 중첩이 너무 깊습니다 (최대 ${MAX_DEPTH}단계)`);
      const o = {};
      for (;;) {
        skip(); if (i >= L.length) break; const ln = L[i];
        if (ln.indent < indent) break;
        if (ln.indent > indent) throw new Error(`줄 ${ln.n}: 들여쓰기가 맞지 않습니다`);
        if (isSeq(ln.text)) break;
        const ks = KS(ln); if (!ks) throw new Error(`줄 ${ln.n}: 'key: value' 형식이 아닙니다 → ${clip(ln.text)}`);
        const [k, rest] = ks; i++;
        if (DANGEROUS.has(k)) throw new Error(`줄 ${ln.n}: 허용되지 않는 키 "${k}"`);
        if (hasOwn(o, k)) throw new Error(`줄 ${ln.n}: 중복된 키 "${k}"`);
        if (rest === '') { skip(); const nx = L[i]; o[k] = nx && (nx.indent > indent || (nx.indent === indent && isSeq(nx.text))) ? node(nx.indent, dep + 1) : null; }
        else if (BLOCK_RE.test(rest)) o[k] = block(rest, indent, ln);
        else o[k] = wrap(ln.n, () => scalar(rest, 0));
      }
      return o;
    }
    function seq(indent, dep) {
      if (dep > MAX_DEPTH) throw new Error(`줄 ${L[i].n}: 중첩이 너무 깊습니다 (최대 ${MAX_DEPTH}단계)`);
      const a = [];
      for (;;) {
        skip(); if (i >= L.length) break; const ln = L[i];
        if (ln.indent !== indent || !isSeq(ln.text)) break;
        const rest = ln.text.slice(1).trim(), off = indent + (ln.text.length - rest.length);
        if (rest === '') { i++; skip(); const nx = L[i]; a.push(nx && nx.indent > indent ? node(nx.indent, dep + 1) : null); }
        else if (isSeq(rest)) { L[i] = Object.assign({}, ln, { indent: off, text: rest }); a.push(seq(off, dep + 1)); }
        else if (BLOCK_RE.test(rest)) { i++; a.push(block(rest, indent, ln)); }
        else if (KS({ n: ln.n, text: rest })) { L[i] = Object.assign({}, ln, { indent: off, text: rest }); a.push(map(off, dep + 1)); }
        else { i++; a.push(wrap(ln.n, () => scalar(rest, 0))); }
      }
      return a;
    }
    const v = node(0, 0); skip();
    if (i < L.length) throw new Error(`줄 ${L[i].n}: 해석할 수 없는 내용입니다 → ${clip(L[i].text || L[i].raw)}`);
    return v;
  }
  /* 파싱된 JSON 에 위험 키/과도한 중첩이 없는지 확인 */
  function treeOK(v, dep) {
    if (v === null || typeof v !== 'object') return true;
    if (dep > MAX_DEPTH) return false;
    if (Array.isArray(v)) return v.every(x => treeOK(x, dep + 1));
    return Object.keys(v).every(k => !DANGEROUS.has(k) && treeOK(v[k], dep + 1));
  }
  function yamlParse(text) {
    if (typeof text !== 'string') throw new Error('문자열이 아닙니다');
    if (text.length > MAX_INPUT) throw new Error(`입력이 너무 큽니다 (최대 ${MAX_INPUT >> 20}MB)`);
    try { return yamlParseInner(text); }
    catch (e) {
      if (e instanceof RangeError) throw new Error('중첩이 너무 깊어 해석할 수 없습니다 (최대 ' + MAX_DEPTH + '단계)');
      if (e instanceof TypeError || e instanceof SyntaxError) throw new Error('YAML을 해석할 수 없습니다 (' + e.message + ')');
      throw e;
    }
  }
  function yamlParseInner(text) {
    const t = text.trim();
    if (t[0] === '{' && /\}\s*$/.test(t) || t[0] === '[' && /\]\s*$/.test(t)) {
      let j, ok = false; try { j = JSON.parse(t); ok = true; } catch (e) { /* YAML 흐름식일 수 있음 */ }
      if (ok) { if (!treeOK(j, 0)) throw new Error('허용되지 않는 키(__proto__ 등)가 있거나 중첩이 너무 깊습니다'); return Array.isArray(j) ? j : [j]; }
    }
    const docs = []; let cur = [], st = 0;
    text.replace(/\r/g, '').split('\n').forEach((line, idx) => { if (/^---\s*$/.test(line)) { if (cur.some(l => l.trim())) docs.push({ lines: cur, st }); cur = []; st = idx + 1; } else cur.push(line); });
    if (cur.some(l => l.trim())) docs.push({ lines: cur, st });
    return docs.map(d => parseDoc(d.lines, d.st));
  }
  const RESERVED = /^(true|false|null|yes|no|on|off|y|n|~|[-+]?\.inf|\.nan)$/i;
  const jq = s => JSON.stringify(s).replace(/[\u0085\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const yq = s => (s === '' || /^\s|\s$|^[-?:,\[\]{}#&*!|>'"%@`]|: | #|:$|[\x00-\x1f\x7f\u0085\u2028\u2029]|^\.\.\./.test(s) || RESERVED.test(s) || /^[-+]?\.?\d/.test(s)) ? jq(s) : s;
  const inl = v => v === null || v === undefined ? 'null' : typeof v === 'string' ? yq(v) : Array.isArray(v) ? '[]' : isObj(v) ? '{}' : String(v);
  function yamlDump(v, ind) {
    ind = ind || 0; const pad = ' '.repeat(ind);
    if (Array.isArray(v)) {
      if (!v.length) return pad + '[]';
      return v.map(x => {
        if ((isObj(x) && Object.keys(x).length) || (Array.isArray(x) && x.length)) return pad + '- ' + yamlDump(x, ind + 2).slice(ind + 2);
        return pad + '- ' + inl(x);
      }).join('\n');
    }
    if (isObj(v)) {
      const ks = Object.keys(v); if (!ks.length) return pad + '{}';
      return ks.map(k => {
        const x = v[k], key = /^[A-Za-z_][\w.\/-]*$/.test(k) && !RESERVED.test(k) ? k : jq(k);
        if ((isObj(x) && Object.keys(x).length) || (Array.isArray(x) && x.length)) return pad + key + ':\n' + yamlDump(x, ind + 2);
        return pad + key + ': ' + inl(x);
      }).join('\n');
    }
    return pad + inl(v);
  }

  /* ====================== 경로 도우미 ====================== */
  const badPath = p => p.some(k => typeof k === 'string' && DANGEROUS.has(k));
  const getAt = (o, p) => { if (badPath(p)) return undefined; let c = o; for (const k of p) { if (c == null || typeof c !== 'object' || !hasOwn(c, k)) return undefined; c = c[k]; } return c; };
  const hasAt = (o, p) => { if (badPath(p)) return false; const par = getAt(o, p.slice(0, -1)); return par != null && typeof par === 'object' && hasOwn(par, p[p.length - 1]) && par[p[p.length - 1]] !== undefined; };
  const setAt = (o, p, v) => { if (badPath(p) || !p.length) return; let c = o; for (let i = 0; i < p.length - 1; i++) { if (!hasOwn(c, p[i]) || c[p[i]] == null || typeof c[p[i]] !== 'object') c[p[i]] = typeof p[i + 1] === 'number' ? [] : {}; c = c[p[i]]; } c[p[p.length - 1]] = v; };
  const delAt = (o, p) => { if (badPath(p) || !p.length) return; const par = getAt(o, p.slice(0, -1)); if (par == null || typeof par !== 'object') return; if (Array.isArray(par)) par.splice(p[p.length - 1], 1); else delete par[p[p.length - 1]]; };
  const pstr = p => p.map((k, i) => typeof k === 'number' ? `[${k}]` : (i ? '.' : '') + k).join('');

  /* ====================== 스키마 ====================== */
  const BASE_RE = /(\[\]|\{\})+$/;
  /* 타입 문자열 정규화: 소문자, 공백/하이픈/밑줄 제거, _v2 같은 버전 접미사 제거
     (데이터에는 integer-or-string, IntOrString, Quantity, Time, RawExtension, Status_v2 같은 변형이 섞여 있음) */
  const normT = t => String(t == null ? '' : t).trim().toLowerCase().replace(/[\s_-]+/g, '').replace(/v\d+(?:alpha\d+|beta\d+)?$/, '');
  const PRIM = { string: 'string', integer: 'integer', int: 'integer', int32: 'integer', int64: 'integer', number: 'number', float: 'number', float32: 'number', float64: 'number', double: 'number', boolean: 'boolean', bool: 'boolean' };
  const SUBT = { time: 'time', microtime: 'time', metatime: 'time', duration: 'time', date: 'time', datetime: 'time', quantity: 'quantity', intorstring: 'intorstring', integerorstring: 'intorstring' };
  const subOf = t => { const n = normT(t); return SUBT[n] || (/^k8s\.io\//.test(n) ? 'time' : ''); };
  const META = [
    { name: 'name', type: 'string', desc: '리소스 이름. 소문자·숫자·"-"·"."만 사용하고 네임스페이스 안에서 유일해야 합니다.', required: true, kind: 'scalar', st: 'string' },
    { name: 'namespace', type: 'string', desc: '리소스가 속한 네임스페이스.', required: false, kind: 'scalar', st: 'string' },
    { name: 'generateName', type: 'string', desc: 'name을 비워 두면 이 접두사 뒤에 임의 문자열을 붙여 서버가 이름을 만듭니다.', required: false, kind: 'scalar', st: 'string' },
    { name: 'labels', type: 'object (string)', desc: '리소스를 선택·분류하는 키-값 쌍.', required: false, kind: 'map', st: 'string' },
    { name: 'annotations', type: 'object (string)', desc: '도구와 사람이 참고하는 부가 정보(선택에 쓰이지 않음).', required: false, kind: 'map', st: 'string' },
    { name: 'finalizers', type: 'array (string)', desc: '삭제 전에 정리 작업이 끝날 때까지 삭제를 막는 식별자 목록.', required: false, kind: 'array-scalar', st: 'string' },
  ];
  function makeSchema(a, F) {
    const byPath = new Map((F || []).map(f => [f.p, f]));
    const cache = new Map();
    const rowsOf = p => p === '' ? a.d.props.map(x => [x.n, x.t, x.d]) : (byPath.get(p) ? byPath.get(p).r : []);
    const reqOf = p => new Set(p === '' ? a.d.required : (byPath.get(p) ? byPath.get(p).q : []));
    function classify(p, name, t, desc, req) {
      const bn = name, tl = (t || '').trim();
      const o = { name: bn, type: tl, desc: desc || '', required: req };
      const am = tl.match(/^array\s*\((.+)\)$/i), mm = tl.match(/^object\s*\((.+)\)$/i);
      if (/^array/i.test(tl)) {
        if (am) { o.kind = 'array-scalar'; const it = am[1].trim(), sb = subOf(it); o.st = PRIM[normT(it)] || (sb ? 'string' : it); if (sb) o.sub = sb; return o; }
        const ip = p + '.' + bn + '[]'; if (byPath.has(ip) && byPath.get(ip).r.length) { o.kind = 'array-object'; o.cpath = ip; return o; }
        o.kind = 'array-scalar'; o.st = 'string'; return o;
      }
      if (mm) { o.kind = 'map'; const it = mm[1].trim(), sb = subOf(it); o.st = PRIM[normT(it)] || (sb ? 'string' : it); if (sb) o.sub = sb; return o; }
      const nt = normT(tl), prim = PRIM[nt], sub = subOf(tl);
      if (!prim && !sub) {
        const cp = p + '.' + bn; if (byPath.has(cp) && byPath.get(cp).r.length) { o.kind = 'object'; o.cpath = cp; return o; }
        const mp = p + '.' + bn + '{}'; if (byPath.has(mp) && byPath.get(mp).r.length) { o.kind = 'map-object'; o.cpath = mp; return o; }
        o.kind = 'any'; return o;
      }
      o.kind = 'scalar'; o.st = prim || 'string'; if (sub) o.sub = sub; return o;
    }
    function children(p) {
      if (cache.has(p)) return cache.get(p);
      const rows = rowsOf(p), rq = reqOf(p), out = [];
      for (const r of rows) {
        const nm = r[0];
        if (DANGEROUS.has(nm.replace(BASE_RE, ''))) continue;
        if (BAD(nm) && rows.some(x => x[0] === nm.replace(BASE_RE, ''))) continue;
        if (p === '' && ['apiVersion', 'kind'].includes(nm)) continue;
        if (p === '' && nm === 'metadata') { out.push({ name: 'metadata', type: 'ObjectMeta', desc: r[2], required: true, kind: 'meta' }); continue; }
        out.push(classify(p, nm.replace(BASE_RE, ''), r[1], r[2], rq.has(nm)));
      }
      cache.set(p, out); return out;
    }
    const BAD = nm => BASE_RE.test(nm);
    return { children, byPath, hasStatus: a.d.props.some(x => x.n === 'status') };
  }

  /* 설명에서 허용 값 후보 추출(힌트 용도) */
  function enumOf(desc) {
    const m = (desc || '').match(/(?:valid|allowed|supported|possible|accepted)\s+(?:values|options)[^:.]{0,30}[:]?\s*([^.]{3,200})|must be one of:?\s*([^.]{3,200})|one of:?\s*([^.]{3,200})/i);
    if (!m) return null;
    const src = m[1] || m[2] || m[3];
    const toks = [...src.matchAll(/["'`]([A-Za-z0-9_.\/-]{1,40})["'`]|\b([A-Z][A-Za-z0-9_-]{1,30})\b/g)].map(x => x[1] || x[2]);
    const u = [...new Set(toks)].filter(t => !/^(Valid|Values|Value|Default|If|The|This|Must|One|Or|And|Allowed|Supported|None|Defaults)$/.test(t));
    return u.length >= 2 && u.length <= 12 ? u : null;
  }

  /* ====================== 값 기본값 / 예시 ====================== */
  function defaultFor(kid, sch, spathOf) {
    switch (kid.kind) {
      case 'object': case 'map-object': case 'any': return {};
      case 'array-object': case 'array-scalar': return [];
      case 'map': return {};
      case 'scalar': return kid.st === 'boolean' ? false : (/^(integer|number)$/.test(kid.st) ? null : '');
      default: return '';
    }
  }
  function ensureRequired(M, vp, sp, sch, depth) {
    if (depth > 6) return;
    for (const kid of sch.children(sp)) {
      if (!kid.required) continue;
      const p = vp.concat(kid.name);
      if (!hasAt(M, p)) setAt(M, p, defaultFor(kid, sch));
      const v = getAt(M, p);
      if (kid.kind === 'object' && isObj(v)) ensureRequired(M, p, kid.cpath, sch, depth + 1);
      if (kid.kind === 'array-object' && Array.isArray(v) && !v.length) { v.push({}); ensureRequired(M, p.concat(0), kid.cpath, sch, depth + 1); }
    }
  }
  const SAMPLE = { name: 'example', namespace: 'default', kind: 'Service', host: 'example.apps.cluster.local', port: 8080, targetPort: 8080, replicas: 1, image: 'quay.io/example/app:latest', path: '/', protocol: 'TCP', weight: 100, type: 'ClusterIP', termination: 'edge', apiGroup: '', insecureEdgeTerminationPolicy: 'Redirect' };
  function sampleFill(M, vp, sp, sch, depth) {
    if (depth > 6) return;
    for (const kid of sch.children(sp)) {
      if (!kid.required) continue;
      const p = vp.concat(kid.name); let v = getAt(M, p);
      if (kid.kind === 'scalar') {
        if (v === '' || v == null) { const s = SAMPLE[kid.name]; setAt(M, p, kid.st === 'boolean' ? true : /^(integer|number)$/.test(kid.st) ? (typeof s === 'number' ? s : 1) : kid.sub === 'intorstring' && typeof s === 'number' ? s : kid.sub === 'quantity' ? '100m' : (typeof s === 'string' ? s : 'example')); }
      } else if (kid.kind === 'array-scalar' && Array.isArray(v) && !v.length) setAt(M, p, [kid.st === 'string' ? 'example' : 1]);
      else if (kid.kind === 'map' && isObj(v) && !Object.keys(v).length) setAt(M, p, { example: kid.st === 'string' ? 'value' : 1 });
      else if (kid.kind === 'object' && isObj(v)) sampleFill(M, p, kid.cpath, sch, depth + 1);
      else if (kid.kind === 'array-object' && Array.isArray(v)) { if (!v.length) { v.push({}); ensureRequired(M, p.concat(0), kid.cpath, sch, depth + 1); } v.forEach((_, i) => sampleFill(M, p.concat(i), kid.cpath, sch, depth + 1)); }
    }
  }

  /* ====================== 검증 ====================== */
  const DNS = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/, DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  const empty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  function validate(M, a, d, sch) {
    const issues = [];
    const add = (level, p, msg, code, x) => issues.push(Object.assign({ level, path: pstr(p), msg, code }, x || {}));
    if (M.apiVersion !== d.gv) add('error', ['apiVersion'], `apiVersion은 "${d.gv}" 이어야 합니다 (현재: ${JSON.stringify(M.apiVersion)})`, 'mismatch');
    if (M.kind !== a.kind) add('error', ['kind'], `kind는 "${a.kind}" 이어야 합니다 (현재: ${JSON.stringify(M.kind)})`, 'mismatch');
    const md = M.metadata;
    if (!isObj(md)) add('error', ['metadata'], '필수 값 없음', 'required');
    else {
      if (empty(md.name) && empty(md.generateName)) add('error', ['metadata', 'name'], '필수 값 없음: name 또는 generateName 중 하나가 필요합니다', 'required');
      else if (!empty(md.name)) {
        if (typeof md.name !== 'string') add('error', ['metadata', 'name'], '문자열이어야 합니다', 'type');
        else if (md.name.length > 253 || !DNS.test(md.name)) add('error', ['metadata', 'name'], '이름 형식 오류: 소문자·숫자·"-"·"."만 가능하고 영숫자로 시작·끝나야 하며 253자 이하여야 합니다', 'invalid', { val: md.name, rule: "a lowercase RFC 1123 subdomain must consist of lower case alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character" });
      }
      if (d.ns && empty(md.namespace)) add('warn', ['metadata', 'namespace'], '네임스페이스 범위 리소스입니다. 비워 두면 현재 프로젝트(네임스페이스)에 만들어집니다', 'hint');
      if (!d.ns && !empty(md.namespace)) add('warn', ['metadata', 'namespace'], '클러스터 범위 리소스라 namespace는 무시됩니다', 'hint');
      if (!empty(md.namespace) && typeof md.namespace === 'string' && (md.namespace.length > 63 || !DNS_LABEL.test(md.namespace))) add('error', ['metadata', 'namespace'], '네임스페이스 형식 오류: 소문자·숫자·"-"만, 63자 이하', 'invalid');
      if (isObj(md.labels)) for (const [k, v] of Object.entries(md.labels)) if (typeof v !== 'string') add('error', ['metadata', 'labels', k], '라벨 값은 문자열이어야 합니다', 'type');
      for (const k of Object.keys(md)) if (!META.some(m => m.name === k) && !['uid', 'resourceVersion', 'generation', 'creationTimestamp', 'ownerReferences', 'managedFields', 'deletionTimestamp', 'selfLink'].includes(k)) add('warn', ['metadata', k], `알 수 없는 필드 "${k}"`, 'unknown');
    }
    const typeOK = (st, v) => {
      if (/^string$/i.test(st)) return typeof v === 'string';
      if (/^integer$/i.test(st)) return typeof v === 'number' && Number.isInteger(v);
      if (/^number$/i.test(st)) return typeof v === 'number';
      if (/^boolean$/i.test(st)) return typeof v === 'boolean';
      return true;
    };
    const itemOK = (kid, v) => (kid.sub === 'intorstring' || kid.sub === 'quantity') ? (typeof v === 'string' || typeof v === 'number') : typeOK(kid.st, v);
    const tname = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v === 'number' ? 'number' : typeof v;
    function walk(val, sp, vp, depth) {
      if (!isObj(val)) return;
      const kids = sch.children(sp), names = new Set(kids.map(k => k.name));
      if (sp === '') ['apiVersion', 'kind', 'metadata'].forEach(n => names.add(n));
      for (const k of Object.keys(val)) if (!names.has(k) && !(sp === '' && k === 'status')) add('warn', vp.concat(k), `스펙에 없는 필드 "${k}"${nearest(k, [...names]) ? ` — 혹시 "${nearest(k, [...names])}"?` : ''}`, 'unknown');
      for (const kid of kids) {
        if (kid.kind === 'meta') continue;
        const p = vp.concat(kid.name), v = val[kid.name], present = v !== undefined;
        if (kid.required && (!present || empty(v) && kid.kind !== 'object' && kid.kind !== 'map-object' && kid.kind !== 'any' && !(kid.kind === 'scalar' && kid.st === 'boolean' && typeof v === 'boolean') && !(kid.name === 'apiGroup' && v === ''))) {
          add('error', p, '필수 값 없음', 'required'); if (!present) continue;
        }
        if (!present) continue;
        if (v === null) { if (kid.required) continue; add('warn', p, '값이 비어 있습니다(null)', 'hint'); continue; }
        const en = kid.kind === 'scalar' && typeof v === 'string' ? enumOf(kid.desc) : null;
        if (kid.kind === 'scalar') {
          if (kid.sub === 'intorstring') { if (typeof v !== 'string' && typeof v !== 'number') add('error', p, '숫자 또는 문자열이어야 합니다', 'type'); }
          else if (kid.sub === 'quantity') { if (typeof v !== 'string' && typeof v !== 'number') add('error', p, '수량은 문자열(예: "100m")이어야 합니다', 'type'); }
          else if (!typeOK(kid.st, v)) add('error', p, `${kid.st === 'string' ? '문자열' : kid.st === 'boolean' ? '불리언(true/false)' : kid.st === 'integer' ? '정수' : '숫자'}여야 합니다 (현재: ${tname(v)})`, 'type', { exp: kid.st, act: tname(v) });
          else if (en && v !== '' && !en.includes(v)) add('warn', p, `설명에 나온 값(${en.join(', ')})이 아닙니다`, 'enum');
        } else if (kid.kind === 'object') { if (!isObj(v)) add('error', p, `객체여야 합니다 (현재: ${tname(v)})`, 'type', { exp: 'object', act: tname(v) }); else walk(v, kid.cpath, p, depth + 1); }
        else if (kid.kind === 'array-object') {
          if (!Array.isArray(v)) add('error', p, `배열이어야 합니다 (현재: ${tname(v)})`, 'type', { exp: 'array', act: tname(v) });
          else v.forEach((it, i) => { if (!isObj(it)) add('error', p.concat(i), '객체여야 합니다', 'type'); else walk(it, kid.cpath, p.concat(i), depth + 1); });
        } else if (kid.kind === 'array-scalar') {
          if (!Array.isArray(v)) add('error', p, `배열이어야 합니다 (현재: ${tname(v)})`, 'type', { exp: 'array', act: tname(v) });
          else v.forEach((it, i) => { if (!itemOK(kid, it)) add('error', p.concat(i), `항목 타입 오류: ${kid.st} 여야 합니다`, 'type'); });
        } else if (kid.kind === 'map') {
          if (!isObj(v)) add('error', p, `맵(키-값)이어야 합니다 (현재: ${tname(v)})`, 'type');
          else for (const [mk, mv] of Object.entries(v)) if (!itemOK(kid, mv)) add('error', p.concat(mk), `값은 ${kid.st} 여야 합니다`, 'type');
        } else if (kid.kind === 'map-object') { if (!isObj(v)) add('error', p, '맵이어야 합니다', 'type'); }
      }
    }
    walk(M, '', [], 0);
    return issues;
  }
  function nearest(k, names) {
    let best = null, bd = 3; const lk = k.toLowerCase();
    for (const n of names) { const d = lev(lk, n.toLowerCase()); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  function lev(a, b) {
    const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }

  /* ====================== 시뮬레이션 ====================== */
  const uid = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } const x = (h >>> 0).toString(16).padStart(8, '0'); return `${x}-1b2c-4d3e-8f4a-${x}5e6f7a8b`.slice(0, 36); };
  function mergePatch(t, p) {
    if (!isObj(p)) return clone(p);
    const r = isObj(t) ? clone(t) : {};
    for (const [k, v] of Object.entries(p)) { if (DANGEROUS.has(k)) continue; if (v === null) delete r[k]; else r[k] = mergePatch(hasOwn(r, k) ? r[k] : undefined, v); }
    return r;
  }
  function statusObj(code, reason, message, extra) {
    return Object.assign({ kind: 'Status', apiVersion: 'v1', metadata: {}, status: 'Failure', message, reason, code }, extra || {});
  }
  function resNames(d) {
    const eps = (d.a.d && d.a.d.eps) || [];
    // 네임스페이스 리소스는 {namespace} 가 들어간 경로만(클러스터 전체 목록 경로는 생성에 쓸 수 없음)
    const okNs = e => !d.ns || e.p.includes('{namespace}');
    const cols = eps.filter(e => !/\{name\}|watch/.test(e.p) && okNs(e)), ones = eps.filter(e => /\{name\}$/.test(e.p) && !/watch/.test(e.p) && okNs(e));
    const col = cols.find(e => e.ms.some(m => m.m === 'POST')) || cols[0], one = ones.find(e => e.ms.some(m => m.m === 'GET')) || ones[0];
    const plural = col ? col.p.split('/').pop() : one ? one.p.split('/').slice(-2)[0] : d.low + 's';
    return { plural, full: d.a.group ? `${plural}.${d.a.group}` : plural, col, one };
  }
  const NAMEPH = '<이름>';
  const OPS = [['create', '생성 (POST)', 'POST'], ['get', '조회 (GET)', 'GET'], ['replace', '전체 교체 (PUT)', 'PUT'], ['patch', '일부 수정 (PATCH)', 'PATCH'], ['delete', '삭제 (DELETE)', 'DELETE']];
  /* 작업별 문서 엔드포인트 유무: [op, 라벨, 문서에 있는지] */
  function opsOf(d) {
    const rn = resNames(d), has = (e, m) => !!e && e.ms.some(x => x.m === m);
    return OPS.map(([op, label, m]) => [op, label, has(op === 'create' ? rn.col : rn.one, m)]);
  }
  function k8sName(d, M) { const n = M.metadata && (M.metadata.name || M.metadata.generateName); return n || ''; }
  const errText = i => i.code === 'required' ? `${i.path}: Required value` : i.code === 'invalid' ? `${i.path}: Invalid value: "${i.val}": ${i.rule || 'invalid'}` : i.code === 'mismatch' ? `${i.path}: Invalid value` : `${i.path}: ${i.msg}`;
  function causes(issues) {
    return issues.filter(i => i.level === 'error').map(i => ({ reason: i.code === 'required' ? 'FieldValueRequired' : 'FieldValueInvalid', message: errText(i).replace(i.path + ': ', ''), field: i.path }));
  }
  function serverObject(M, d, sch) {
    const o = clone(M); o.metadata = Object.assign({}, o.metadata);
    const nm = k8sName(d, M) || 'example';
    o.metadata.uid = uid(d.a.id + nm); o.metadata.resourceVersion = '482113'; o.metadata.generation = 1;
    o.metadata.creationTimestamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    if (empty(o.metadata.name) && o.metadata.generateName) o.metadata.name = o.metadata.generateName + 'x7k2p';
    if (d.ns && empty(o.metadata.namespace)) o.metadata.namespace = 'default';
    if (sch.hasStatus && !o.status) o.status = {};
    return o;
  }
  /* op: create|get|replace|patch|delete */
  function simulate(opt, M, a, d, sch, issues, docs) {
    // 네임스페이스: 입력창 값 > 매니페스트 metadata.namespace > default (입력창 표시값과 같은 규칙)
    const md = isObj(M.metadata) ? M.metadata : {}, strv = v => typeof v === 'string' ? v : '';
    const rn = resNames(d), ns = d.ns ? (strv(opt.ns) || strv(md.namespace) || 'default') : '', name = strv(opt.name) || strv(md.name) || NAMEPH;
    const eNs = encodeURIComponent(ns), eName = name === NAMEPH ? name : encodeURIComponent(name);   // 경로 세그먼트는 URL 인코딩
    const fill = p => p.replace('{namespace}', () => eNs || 'default').replace('{name}', () => eName);
    const q = []; if (opt.dry === 'All') q.push('dryRun=All'); if (opt.op !== 'get' && opt.op !== 'delete') q.push('fieldValidation=' + encodeURIComponent(opt.fv));
    const base = (a.group ? `/apis/${a.group}/${a.version}` : `/api/${a.version}`) + (d.ns ? '/namespaces/' + eNs : '') + '/' + rn.plural;
    const colPath = rn.col ? fill(rn.col.p) : base;
    const itemPath = rn.one ? fill(rn.one.p) : colPath + '/' + eName;
    const method = { create: 'POST', get: 'GET', replace: 'PUT', patch: 'PATCH', delete: 'DELETE' }[opt.op];
    const path = opt.op === 'create' ? colPath : itemPath;
    const qs = q.length ? '?' + q.join('&') : '';
    const headers = ['Authorization: Bearer <token>', 'Accept: application/json'];
    let body = null, ctype = null;
    if (opt.op === 'create' || opt.op === 'replace') { ctype = 'application/json'; body = clone(M); if (opt.op === 'replace') { body.metadata = Object.assign({}, body.metadata, { resourceVersion: '482113' }); } }
    if (opt.op === 'patch') { ctype = opt.ptype; try { body = JSON.parse(opt.pbody || '{}'); if (!treeOK(body, 0)) body = null; } catch (e) { body = null; } }
    if (ctype) headers.splice(1, 0, 'Content-Type: ' + ctype);
    const req = { method, path: path + qs, headers, body };
    // 문서가 정의한 응답 코드
    const ep = (opt.op === 'create' ? rn.col : rn.one);
    const ms = ep && ep.ms.find(m => m.m === method);
    const documented = ms ? ms.r : [];
    let status = 200, body2 = null, warnings = [], note = '';
    const sc = opt.scn;
    const gr = a.group || '', resName = rn.full;
    const fail = (code, reason, msg, extra) => { status = code; body2 = statusObj(code, reason, msg, extra); };
    if (sc === 'unauth') fail(401, 'Unauthorized', 'Unauthorized');
    else if (sc === 'forbidden') fail(403, 'Forbidden', `${resName} is forbidden: User "system:serviceaccount:default:viewer" cannot ${({ create: 'create', get: 'get', replace: 'update', patch: 'patch', delete: 'delete' })[opt.op]} resource "${rn.plural}" in API group "${gr}"${d.ns ? ` in the namespace "${ns}"` : ' at the cluster scope'}`, { details: { group: gr, kind: rn.plural } });
    else {
      const errs = issues.filter(i => i.level === 'error'), unk = issues.filter(i => i.code === 'unknown');
      const typeErr = errs.filter(i => i.code === 'type'), mism = errs.filter(i => i.code === 'mismatch');
      let target = M;
      if (opt.op === 'patch') {
        if (!body) { fail(400, 'BadRequest', 'the body of the request was in an unknown format - accepted media types include: application/json-patch+json, application/merge-patch+json, application/apply-patch+yaml'); }
        else if (ctype === 'application/merge-patch+json') target = mergePatch(M, body);
        else target = M;
      }
      if (status === 200 && !body2) {
        const iss2 = opt.op === 'patch' && ctype === 'application/merge-patch+json' ? validate(target, a, d, sch) : issues;
        const errs2 = iss2.filter(i => i.level === 'error'), unk2 = iss2.filter(i => i.code === 'unknown'), type2 = errs2.filter(i => i.code === 'type'), mis2 = errs2.filter(i => i.code === 'mismatch');
        if (opt.op === 'get' || opt.op === 'delete') {
          if (sc === 'notfound') fail(404, 'NotFound', `${resName} "${name}" not found`, { details: { name, group: gr, kind: rn.plural } });
          else if (opt.op === 'get') { status = 200; body2 = serverObject(M, d, sch); }
          else { status = 200; body2 = { kind: 'Status', apiVersion: 'v1', metadata: {}, status: 'Success', details: { name, group: gr, kind: rn.plural, uid: uid(a.id + name) } }; }
        } else if (mis2.length) fail(400, 'BadRequest', `the API version in the data (${M.apiVersion}) does not match the expected API version (${d.gv})`);
        else if (type2.length) { const te = type2[0], goT = ({ integer: 'int32', number: 'float64', boolean: 'bool', string: 'string', object: 'object', array: 'array' })[te.exp] || te.exp || 'value'; fail(400, 'BadRequest', `${a.kind} in version "${a.version}" cannot be handled as a ${a.kind}: json: cannot unmarshal ${te.act === 'boolean' ? 'bool' : (te.act || 'value')} into Go struct field ${a.kind}.${te.path} of type ${goT}`); }
        else if (unk2.length && opt.fv === 'Strict') fail(400, 'BadRequest', `${unk2.map(u => `strict decoding error: unknown field "${u.path}"`).join(', ')}`);
        else if (errs2.length) fail(422, 'Invalid', `${a.kind}.${gr || 'v1'} "${name}" is invalid: ${errs2.length > 1 ? '[' : ''}${errs2.map(errText).join(', ')}${errs2.length > 1 ? ']' : ''}`, { details: { name, group: gr, kind: a.kind, causes: causes(iss2) } });
        else if (sc === 'conflict' && opt.op === 'create') fail(409, 'AlreadyExists', `${resName} "${name}" already exists`, { details: { name, group: gr, kind: rn.plural } });
        else if (sc === 'conflict') fail(409, 'Conflict', `Operation cannot be fulfilled on ${resName} "${name}": the object has been modified; please apply your changes to the latest version and try again`, { details: { name, group: gr, kind: rn.plural } });
        else if (sc === 'notfound' && opt.op !== 'create') fail(404, 'NotFound', `${resName} "${name}" not found`, { details: { name, group: gr, kind: rn.plural } });
        else {
          status = opt.op === 'create' ? 201 : 200; body2 = serverObject(target, d, sch);
          if (unk2.length && opt.fv === 'Warn') warnings = unk2.map(u => `unknown field "${u.path}"`);
          if (opt.dry === 'All') note = 'dryRun=All 이므로 서버가 검증만 하고 저장하지 않습니다(응답은 저장했다면 받을 내용과 같습니다).';
        }
      }
    }
    return { req, status, body: body2, warnings, note, documented, ns, name };
  }
  /* POSIX 셸 인용: 작은따옴표로 감싸고 ' 는 '\'' 로. 값은 절대 셸이 해석하지 못하고 데이터로만 쓰임 */
  const sq = s => "'" + String(s).replace(/\0/g, '').replace(/'/g, "'\\''") + "'";
  const shw = s => /^[A-Za-z0-9_.,:\/=@%+][A-Za-z0-9_.,:\/=@%+-]*$/.test(s) ? s : sq(s);   // 안전한 문자만이면 그대로, 아니면 인용
  const curl = r => {
    const parts = ['curl -sk -X ' + r.method];
    r.headers.forEach(h => parts.push(h === 'Authorization: Bearer <token>' ? '-H "Authorization: Bearer $TOKEN"' : '-H ' + sq(h)));
    if (r.body) parts.push('-d ' + sq(JSON.stringify(r.body)));
    parts.push('"$APISERVER"' + sq(r.path));
    return '# 자체 서명 인증서 환경용. 운영에서는 -k 를 빼고 --cacert 를 쓰세요\n' + parts.join(' \\\n  ');
  };
  const PATCH_T = { 'application/merge-patch+json': 'merge', 'application/json-patch+json': 'json', 'application/strategic-merge-patch+json': 'strategic' };
  function ocCmd(o, d, ns, name) {
    const res = shw(d.low + (d.a.group ? '.' + d.a.group : '')), nsf = d.ns && ns ? ' -n ' + shw(ns) : '';
    const dash = String(name)[0] === '-', nm = dash ? '' : ' ' + shw(name), tail = dash ? ' -- ' + shw(name) : '';   // 이름이 '-' 로 시작하면 옵션으로 읽히지 않게 -- 뒤에 둠
    switch (o.op) {
      case 'create': return `oc apply -f ${shw(d.low + '.yaml')}${o.dry === 'All' ? ' --dry-run=server' : ''}`;
      case 'get': return `oc get ${res}${nm}${nsf} -o yaml${tail}`;
      case 'replace': return `oc replace -f ${shw(d.low + '.yaml')}`;
      case 'patch': return `oc patch ${res}${nm}${nsf} --type=${PATCH_T[o.ptype] || 'merge'} -p ${sq(o.pbody == null ? '' : o.pbody)}${tail}`;
      default: return `oc delete ${res}${nm}${nsf}${tail}`;
    }
  }
  function ordered(M, sp, sch) {
    if (!isObj(M)) return M;
    const out = {}, kids = sch.children(sp);
    const names = sp === '' ? ['apiVersion', 'kind', 'metadata'].concat(kids.map(k => k.name)) : kids.map(k => k.name);
    for (const n of names) if (!DANGEROUS.has(n) && hasOwn(M, n) && M[n] !== undefined) { const kid = kids.find(k => k.name === n); out[n] = !kid ? M[n] : kid.kind === 'object' ? ordered(M[n], kid.cpath, sch) : kid.kind === 'array-object' && Array.isArray(M[n]) ? M[n].map(x => ordered(x, kid.cpath, sch)) : M[n]; }
    for (const k of Object.keys(M)) if (!DANGEROUS.has(k) && !hasOwn(out, k)) out[k] = M[k];
    return out;
  }

  /* ====================== 저장소 / 탭 ====================== */
  const FVS = ['Ignore', 'Warn', 'Strict'], SCNS = ['ok', 'notfound', 'conflict', 'forbidden', 'unauth'], PTS = Object.keys(PATCH_T);
  const defaultOpt = () => ({ op: 'create', fv: 'Warn', dry: 'None', scn: 'ok', ptype: PTS[0], pbody: '{"metadata":{"annotations":{"sim/touched":"true"}}}', ns: '', name: '' });
  function cleanOpt(o) {
    const d = defaultOpt(); if (!isObj(o)) return d;
    [['op', OPS.map(x => x[0])], ['fv', FVS], ['dry', ['None', 'All']], ['scn', SCNS], ['ptype', PTS]].forEach(([k, list]) => { if (list.includes(o[k])) d[k] = o[k]; });
    ['pbody', 'ns', 'name'].forEach(k => { if (typeof o[k] === 'string' && o[k].length <= 100000) d[k] = o[k]; });
    return d;
  }
  /* localStorage 값을 검증해 복원. JSON 으로는 유효하지만 형식이 다르면 빈 상태 */
  function restoreStore(raw, docOf) {
    const empty0 = { items: [], active: 0 };
    let s; try { s = typeof raw === 'string' ? JSON.parse(raw) : null; } catch (e) { return empty0; }
    if (!isObj(s) || !Array.isArray(s.items)) return empty0;
    const seen = new Set(), items = [];
    for (const it of s.items) {
      if (!isObj(it) || typeof it.id !== 'string' || seen.has(it.id) || !isObj(it.M) || !treeOK(it.M, 0)) continue;
      let dd = null; try { dd = docOf(it.id); } catch (e) { /* 무시 */ }
      if (!dd) continue;
      seen.add(it.id); items.push({ id: it.id, M: it.M, opt: cleanOpt(it.opt) });
    }
    const act = Number.isInteger(s.active) ? s.active : 0;
    return { items, active: Math.max(0, Math.min(act, items.length - 1)) };
  }
  /* i 번째 탭 닫기: 활성 탭이 뒤로 밀리면 인덱스를 보정 */
  function closeTab(store, i) {
    if (i < 0 || i >= store.items.length) return;
    store.items.splice(i, 1);
    if (i < store.active) store.active--;
    store.active = Math.max(0, Math.min(store.active, store.items.length - 1));
  }

  /* ====================== UI ====================== */
  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); }
    (kids || []).forEach(c => c && e.appendChild(c));
    return e;
  }
  function mount(host, C, apiId) {
    const esc = C.esc, ver = C.ver;
    const store = { items: [], active: 0 };
    try { const s = restoreStore(localStorage.getItem(LSKEY + ver), C.docOf); store.items = s.items; store.active = s.active; } catch (e) { /* 저장소 접근 불가/손상: 빈 상태로 시작 */ }
    let F = null, dead = false, tab = 'yaml';
    const schemas = new Map();
    const save = () => { try { localStorage.setItem(LSKEY + ver, JSON.stringify({ items: store.items.map(i => ({ id: i.id, M: i.M, opt: i.opt })), active: store.active })); } catch (e) {} };
    const item = () => store.items[store.active];
    const docOf = id => C.docOf(id);
    const schemaOf = id => { if (!schemas.has(id)) schemas.set(id, makeSchema(docOf(id).a, (F && F[id]) || [])); return schemas.get(id); };

    host.innerHTML = `<div class="sim">
      <h2 class="d-title" style="font-family:var(--sans);font-size:22px">API 설계 시뮬레이터 <span class="gv">${esc(ver)}</span></h2>
      <p class="note" style="margin:0 0 10px">리소스를 설계하면 YAML이 만들어지고, 스펙(필수 값·타입·알 수 없는 필드)으로 검증합니다. 요청을 보냈을 때 서버가 어떻게 응답할지도 가상으로 확인합니다. 실제 클러스터에는 아무것도 전송하지 않습니다.</p>
      <div class="rtabs" id="rtabs"></div>
      <div class="addres"><input class="tfind" id="addq" placeholder="＋ 리소스 추가 (예: route, service, networkpolicy)" autocomplete="off" aria-label="리소스 추가"><div class="addlist" id="addlist" hidden></div></div>
      <div class="related" id="related"></div>
      <div class="simgrid"><section class="simform" id="sform"><p class="note">스키마를 불러오는 중…</p></section>
      <section class="simout"><div class="tabs" role="tablist" id="otabs"><button data-t="yaml" aria-selected="true">YAML</button><button data-t="check" aria-selected="false">검증 <span id="cbadge"></span></button><button data-t="req" aria-selected="false">요청·응답</button></div><div id="obody"></div></section></div></div>`;
    const $ = s => host.querySelector(s);

    /* ---- 리소스 추가 / 탭 ---- */
    function newItem(id) {
      const d = docOf(id), a = d.a, M = { apiVersion: d.gv, kind: a.kind, metadata: { name: 'my-' + a.kind.toLowerCase().slice(0, 30) } };
      if (d.ns) M.metadata.namespace = 'default';
      const it = { id, M, opt: defaultOpt() };
      ensureRequired(M, [], '', schemaOf(id), 0);
      return it;
    }
    function addItem(id, quiet) {
      if (!docOf(id)) return;
      const ex = store.items.findIndex(i => i.id === id);
      if (ex >= 0) store.active = ex; else { store.items.push(newItem(id)); store.active = store.items.length - 1; }
      save(); if (!quiet) { renderTabs(); renderForm(); renderOut(); }
    }
    function renderTabs() {
      if (item()) { try { history.replaceState(null, '', C.hash('sim:' + item().id)); } catch (e) {} }
      const rt = $('#rtabs'); rt.innerHTML = '';
      if (!store.items.length) rt.appendChild(el('span', { class: 'note', text: '아래 입력창에서 리소스를 추가하세요.' }));
      store.items.forEach((it, i) => {
        const a = docOf(it.id).a;
        rt.appendChild(el('span', { class: 'rtab' + (i === store.active ? ' on' : '') }, [
          el('button', { class: 'rt', text: a.kind, title: docOf(it.id).gv, onclick: () => { store.active = i; save(); renderTabs(); renderForm(); renderOut(); } }),
          el('button', { class: 'rx', text: '×', 'aria-label': a.kind + ' 닫기', onclick: () => { closeTab(store, i); save(); renderTabs(); renderForm(); renderOut(); } }),
        ]));
      });
      const rel = $('#related'); rel.innerHTML = '';
      if (item() && C.G && C.G.adj.has(item().id)) {
        const seen = new Set(store.items.map(i => i.id)), ids = [];
        for (const e of C.G.adj.get(item().id)) { if (e.type === 'same' || e.type === 'variant') continue; const o = e.s === item().id ? e.t : e.s; if (!seen.has(o) && !ids.includes(o)) ids.push(o); }
        if (ids.length) { rel.appendChild(el('span', { class: 'note', text: '연결된 API 추가:' })); ids.slice(0, 8).forEach(o => rel.appendChild(el('button', { class: 'chip', text: '+ ' + C.G.byId.get(o).kind, onclick: () => addItem(o) }))); }
      }
    }
    const aq = $('#addq'), al = $('#addlist');
    aq.addEventListener('input', () => {
      const q = aq.value.trim(); al.innerHTML = ''; if (!q) { al.hidden = true; return; }
      const r = C.E.search(q).apis.slice(0, 8); al.hidden = !r.length;
      r.forEach(x => al.appendChild(el('button', { class: 'ai', onclick: () => { aq.value = ''; al.hidden = true; addItem(x.d.a.id); } }, [el('b', { text: x.d.a.kind }), el('span', { class: 'gv', text: ' ' + x.d.gv })])));
    });
    aq.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = al.querySelector('.ai'); if (b) b.click(); } else if (e.key === 'Escape') { al.hidden = true; } });

    /* ---- 폼 ---- */
    function refreshOut() { renderOut(); save(); }
    function renderForm() {
      const f = $('#sform'); f.innerHTML = '';
      const it = item(); if (!it) { f.appendChild(el('div', { class: 'empty', text: '리소스를 추가하면 설계 폼이 나타납니다.' })); return; }
      const d = docOf(it.id), a = d.a, sch = schemaOf(it.id), M = it.M;
      const bar = el('div', { class: 'sbar' }, [
        el('button', { class: 'btn ghost', text: '필수 값 예시로 채우기', onclick: () => { sampleFill(M, [], '', sch, 0); if (isObj(M.metadata) && empty(M.metadata.name)) M.metadata.name = 'example'; renderForm(); refreshOut(); } }),
        el('button', { class: 'btn ghost', text: 'YAML 가져오기', onclick: () => toggleImport() }),
        el('button', { class: 'btn ghost', text: '초기화', onclick: () => { store.items[store.active] = Object.assign(newItem(it.id), { opt: it.opt }); save(); renderForm(); renderOut(); } }),
        el('a', { class: 'btn ghost', href: C.hash('api:' + it.id), text: '스펙 보기' }),
      ]);
      f.appendChild(bar);
      const imp = el('div', { class: 'import', id: 'imp', hidden: true }, [
        el('textarea', { id: 'imptxt', 'aria-label': '가져올 YAML 또는 JSON', rows: 8, placeholder: 'YAML 또는 JSON을 붙여 넣으세요. 여러 문서(---)면 이 리소스와 같은 kind만 가져옵니다.', spellcheck: 'false' }),
        el('div', { class: 'sbar' }, [el('button', { class: 'btn', text: '폼에 적용', onclick: doImport }), el('span', { id: 'imperr', class: 'note', style: 'margin:0;color:var(--bad)' })]),
      ]);
      f.appendChild(imp);
      f.appendChild(el('div', { class: 'sfix' }, [fixed('apiVersion', M.apiVersion), fixed('kind', M.kind)]));
      const root = el('div', { class: 'sroot', id: 'sroot' });
      root.appendChild(metaField(M));
      renderKids(root, '', [], sch, M, 0);
      f.appendChild(root);
      markIssues();
    }
    function fixed(k, v) { return el('div', { class: 'sf fixedf' }, [el('div', { class: 'sfh' }, [el('span', { class: 'sfn', text: k }), el('span', { class: 'ftp', text: '고정' }), el('code', { class: 'fv', text: v })])]); }
    function metaField(M) {
      const wrap = el('div', { class: 'sf', 'data-vp': 'metadata' });
      wrap.appendChild(el('div', { class: 'sfh' }, [el('span', { class: 'sfn', text: 'metadata' }), el('span', { class: 'ftp', text: 'ObjectMeta' }), el('span', { class: 'req', text: '필수' })]));
      const body = el('div', { class: 'sfb' }); wrap.appendChild(body);
      if (!isObj(M.metadata)) M.metadata = {};
      META.forEach(kid => renderField(body, kid, ['metadata', kid.name], null, M, 1, true));
      return wrap;
    }
    function renderKids(container, sp, vp, sch, M, depth) {
      sch.children(sp).forEach(kid => { if (kid.kind === 'meta') return; renderField(container, kid, vp.concat(kid.name), sch, M, depth, false); });
    }
    function renderField(container, kid, vp, sch, M, depth, isMeta) {
      const present = hasAt(M, vp);
      const wrap = el('div', { class: 'sf' + (present ? '' : ' off'), 'data-vp': pstr(vp) });
      const chk = el('input', { type: 'checkbox', class: 'sfc', 'aria-label': kid.name + ' 포함', checked: present, disabled: kid.required && !isMeta ? true : (isMeta && kid.name === 'name' ? true : false) });
      const head = el('div', { class: 'sfh' }, [chk, el('span', { class: 'sfn', text: kid.name }), el('span', { class: 'ftp', text: kid.type })]);
      if (kid.required && !(isMeta && kid.name !== 'name')) head.appendChild(el('span', { class: 'req', text: '필수' }));
      if (kid.desc) head.appendChild(el('button', { class: 'sfi', text: 'ⓘ', title: '설명 보기', 'aria-label': kid.name + ' 설명', onclick: () => { const dd = wrap.querySelector(':scope > .sfd'); dd.hidden = !dd.hidden; } }));
      wrap.appendChild(head);
      if (kid.desc) wrap.appendChild(el('div', { class: 'sfd', hidden: true, text: kid.desc }));
      const err = el('div', { class: 'sfe', hidden: true }); wrap.appendChild(err);
      chk.addEventListener('change', () => {
        if (chk.checked) { setAt(M, vp, defaultFor(kid, sch)); if (kid.kind === 'object') ensureRequired(M, vp, kid.cpath, sch, 0); if (kid.kind === 'array-object') { /* 항목은 직접 추가 */ } }
        else delAt(M, vp);
        renderForm(); refreshOut();
      });
      if (present) wrap.appendChild(valueEditor(kid, vp, sch, M, depth));
      container.appendChild(wrap);
    }
    function valueEditor(kid, vp, sch, M, depth) {
      const body = el('div', { class: 'sfb' }), v = getAt(M, vp);
      const set = nv => { setAt(M, vp, nv); refreshOut(); };
      const en = kid.kind === 'scalar' ? enumOf(kid.desc) : null;
      if (kid.kind === 'scalar') {
        let inp;
        if (kid.st === 'boolean') {
          inp = el('select', { class: 'sin', 'aria-label': kid.name }, [el('option', { value: 'true', text: 'true' }), el('option', { value: 'false', text: 'false' })]);
          inp.value = String(v === true);
          inp.addEventListener('change', () => set(inp.value === 'true'));
        } else {
          const num = /^(integer|number)$/.test(kid.st);
          const lid = en ? 'dl-' + Math.random().toString(36).slice(2, 8) : null;
          inp = el('input', { class: 'sin', type: num ? 'number' : 'text', step: kid.st === 'integer' ? '1' : 'any', value: v == null ? '' : String(v), list: lid, placeholder: en ? en.join(' / ') : (kid.st === 'string' ? '문자열' : kid.st), 'aria-label': kid.name, spellcheck: 'false' });
          inp.addEventListener('input', () => { const s = inp.value; set(num ? (s === '' ? null : Number(s)) : (kid.sub === 'intorstring' && /^\d{1,15}$/.test(s) ? Number(s) : s)); });
          if (en) { const dl = el('datalist', { id: lid }, en.map(x => el('option', { value: x }))); body.appendChild(dl); }
        }
        body.appendChild(inp);
      } else if (kid.kind === 'object') {
        renderKids(body, kid.cpath, vp, sch, M, depth + 1);
      } else if (kid.kind === 'array-object') {
        const arr = Array.isArray(v) ? v : [];
        arr.forEach((_, i) => {
          const card = el('div', { class: 'sitem' }, [el('div', { class: 'sih' }, [el('b', { text: `항목 ${i + 1}` }), el('button', { class: 'rx', text: '삭제', onclick: () => { arr.splice(i, 1); renderForm(); refreshOut(); } })])]);
          renderKids(card, kid.cpath, vp.concat(i), sch, M, depth + 1); body.appendChild(card);
        });
        body.appendChild(el('button', { class: 'btn ghost', text: '＋ 항목 추가', onclick: () => { arr.push({}); ensureRequired(M, vp.concat(arr.length - 1), kid.cpath, sch, 0); renderForm(); refreshOut(); } }));
      } else if (kid.kind === 'array-scalar') {
        const num = /^(integer|number)$/.test(kid.st);
        const inp = el('input', { class: 'sin', type: 'text', value: (Array.isArray(v) ? v : []).join(', '), placeholder: '쉼표로 구분 (예: a, b, c)', 'aria-label': kid.name, spellcheck: 'false' });
        inp.addEventListener('input', () => set(inp.value.split(',').map(s => s.trim()).filter(s => s !== '').map(s => num ? (isNaN(Number(s)) ? s : Number(s)) : (kid.st === 'boolean' ? s === 'true' : s))));
        body.appendChild(inp);
      } else if (kid.kind === 'map') {
        const o = isObj(v) ? v : {}, num = /^(integer|number)$/.test(kid.st);
        Object.keys(o).forEach(k => {
          const kin = el('input', { class: 'sin k', value: k, 'aria-label': '키', spellcheck: 'false' }), vin = el('input', { class: 'sin', value: o[k] == null ? '' : String(o[k]), 'aria-label': '값', spellcheck: 'false' });
          let curK = k;
          kin.addEventListener('change', () => { const nk = kin.value; if (nk === curK || !nk || DANGEROUS.has(nk) || hasOwn(o, nk)) { kin.value = curK; return; } const nv = {}; for (const kk of Object.keys(o)) nv[kk === curK ? nk : kk] = o[kk]; setAt(M, vp, nv); renderForm(); refreshOut(); });
          vin.addEventListener('input', () => { o[curK] = num ? (vin.value === '' ? null : Number(vin.value)) : vin.value; refreshOut(); });
          body.appendChild(el('div', { class: 'kv' }, [kin, vin, el('button', { class: 'rx', text: '×', 'aria-label': '삭제', onclick: () => { delete o[k]; renderForm(); refreshOut(); } })]));
        });
        body.appendChild(el('button', { class: 'btn ghost', text: '＋ 키 추가', onclick: () => { let n = 'key', i = 1; while (n in o) n = 'key' + (++i); o[n] = num ? 0 : ''; renderForm(); refreshOut(); } }));
      } else {
        const ta = el('textarea', { class: 'sin', rows: 3, spellcheck: 'false', 'aria-label': kid.name, placeholder: '자유 형식 JSON 또는 YAML' }); ta.value = (isObj(v) && !Object.keys(v).length) ? '' : (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
        ta.addEventListener('change', () => { const s = ta.value.trim(); if (!s) return set({}); try { set(yamlParse(s)[0]); ta.classList.remove('bad'); } catch (e) { ta.classList.add('bad'); } });
        body.appendChild(ta);
      }
      return body;
    }
    function markIssues() {
      const it = item(); if (!it) return;
      const by = {}; currentIssues().forEach(i => { (by[i.path] = by[i.path] || []).push(i); });
      host.querySelectorAll('.sf[data-vp]').forEach(w => {
        const list = by[w.dataset.vp] || [], e = w.querySelector(':scope > .sfe');
        w.classList.toggle('bad', list.some(i => i.level === 'error')); w.classList.toggle('warnf', !list.some(i => i.level === 'error') && list.length > 0);
        if (e) { e.hidden = !list.length; e.textContent = list.map(i => i.msg).join(' · '); e.className = 'sfe' + (list.some(i => i.level === 'error') ? '' : ' warn'); }
      });
    }
    function currentIssues() { const it = item(); if (!it) return []; const d = docOf(it.id); return validate(it.M, d.a, d, schemaOf(it.id)); }

    /* ---- YAML 가져오기 ---- */
    function toggleImport() { const i = $('#imp'); i.hidden = !i.hidden; }
    function doImport() {
      const it = item(), d = docOf(it.id), err = $('#imperr'); err.textContent = '';
      try {
        const docs = yamlParse($('#imptxt').value).filter(isObj); if (!docs.length) throw new Error('가져올 내용이 없습니다');
        const hit = docs.find(x => x.kind === d.a.kind) || docs[0];
        if (hit.kind && hit.kind !== d.a.kind) { const o = C.E.docs.find(x => x.a.kind === hit.kind && (!hit.apiVersion || x.gv === hit.apiVersion)); if (o) { addItem(o.a.id, true); item().M = hit; save(); renderTabs(); renderForm(); renderOut(); return; } throw new Error(`kind가 ${hit.kind} 입니다. 이 버전에서 해당 API를 찾지 못했습니다`); }
        it.M = hit; save(); renderForm(); renderOut();
      } catch (e) { err.textContent = 'YAML 오류: ' + e.message; }
    }

    /* ---- 출력 ---- */
    const manifestOf = it => { const sch = schemaOf(it.id); return ordered(it.M, '', sch); };
    function renderOut() {
      const it = item(), ob = $('#obody'); ob.innerHTML = '';
      host.querySelectorAll('#otabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === tab));
      if (!it) { $('#cbadge').textContent = ''; return; }
      const d = docOf(it.id), sch = schemaOf(it.id), issues = currentIssues(), errs = issues.filter(i => i.level === 'error').length, warns = issues.length - errs;
      const reqN = issues.filter(i => i.level === 'error' && i.code === 'required').length, onlyReq = errs > 0 && reqN === errs;
      const badgeTip = onlyReq ? '아직 비어 있는 필수 값이 있습니다. 폼에서 채우거나 "필수 값 예시로 채우기"를 누르세요.' : '스키마 검증 오류입니다. 검증 탭에서 자세히 볼 수 있습니다.';
      $('#cbadge').innerHTML = errs ? `<span class="bdg bad" title="${esc(badgeTip)}" role="img" aria-label="${esc(errs + '개 ' + badgeTip)}">${errs}</span>` : (warns ? `<span class="bdg warn">${warns}</span>` : '<span class="bdg ok">✓</span>');
      markIssues();
      if (tab === 'yaml') {
        const all = el('label', { class: 'chk' }, [el('input', { type: 'checkbox', id: 'allres' }), document.createTextNode(' 전체 리소스(---) 보기')]);
        const txt = store.items.length > 1 && host.__all ? store.items.map(i => yamlDump(manifestOf(i))).join('\n---\n') : yamlDump(manifestOf(it));
        ob.appendChild(el('div', { class: 'sbar' }, [store.items.length > 1 ? all : null, el('span', { class: 'vbad ' + (errs ? (onlyReq ? 'warn' : 'bad') : 'ok'), title: errs ? badgeTip : '', text: errs ? (onlyReq ? `필수 값 ${errs}개 필요` : `✖ 오류 ${errs}개`) : '✔ 스키마 검증 통과' + (warns ? ` (경고 ${warns})` : '') })]));
        const pre = el('pre', { class: 'simyaml' }, [el('button', { class: 'copy', text: '복사', onclick: e => { const b = e.target; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { b.textContent = '복사됨'; setTimeout(() => b.textContent = '복사', 1200); }).catch(() => {}); } }), el('code', { text: txt })]);
        ob.appendChild(pre);
        const cb = ob.querySelector('#allres'); if (cb) { cb.checked = !!host.__all; cb.addEventListener('change', () => { host.__all = cb.checked; renderOut(); }); }
        ob.appendChild(el('p', { class: 'note', text: `적용: oc apply -f ${d.low}.yaml  ·  검증만: oc apply --dry-run=server -f ${d.low}.yaml` }));
      } else if (tab === 'check') {
        if (!issues.length) ob.appendChild(el('div', { class: 'empty', html: '<b>문제가 없습니다.</b><p class="hint">필수 값, 타입, 이름 형식, 알 수 없는 필드를 점검했습니다.</p>' }));
        else {
          const ul = el('div', { class: 'issues' });
          [...issues].sort((x, y) => (x.level === 'error' ? 0 : 1) - (y.level === 'error' ? 0 : 1)).forEach(i => ul.appendChild(el('button', { class: 'iss ' + i.level, onclick: () => { const w = host.querySelector(`.sf[data-vp="${CSS.escape(i.path)}"]`); if (w) { w.scrollIntoView({ block: 'center', behavior: 'smooth' }); w.classList.add('flash'); setTimeout(() => w.classList.remove('flash'), 1200); } } }, [el('span', { class: 'lv', text: i.level === 'error' ? '오류' : '경고' }), el('code', { text: i.path || '(루트)' }), el('span', { text: ' ' + i.msg })])));
          ob.appendChild(ul);
        }
        ob.appendChild(el('p', { class: 'note', text: '스펙 문서의 필드 표(필수 여부·타입)를 기준으로 하며, 어드미션 웹훅·기본값 적용·정책 검사는 포함하지 않습니다. “허용 값” 경고는 설명 문장에서 추출한 힌트라 틀릴 수 있습니다.' }));
      } else renderReq(ob, it, d, sch, issues);
    }
    function renderReq(ob, it, d, sch, issues) {
      const o = it.opt, ops = opsOf(d);
      const sel = (id, label, opts, val) => `<label class="sl"><span>${label}</span><select id="${id}" class="vsel">${opts.map(([v, t]) => `<option value="${v}"${v === val ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
      const ctl = el('div', { class: 'reqctl', html:
        sel('o-op', '작업', ops.map(x => [x[0], x[1] + (x[2] ? '' : ' — 문서에 없음')]), o.op) +
        sel('o-fv', 'fieldValidation', [['Ignore', 'Ignore (무시)'], ['Warn', 'Warn (경고, 기본)'], ['Strict', 'Strict (오류)']], o.fv) +
        sel('o-dry', 'dryRun', [['None', '없음 (실제 저장)'], ['All', 'All (검증만)']], o.dry) +
        sel('o-scn', '시나리오', [['ok', '정상'], ['notfound', '대상 없음(404)'], ['conflict', '이미 존재/충돌(409)'], ['forbidden', '권한 없음(403)'], ['unauth', '인증 실패(401)']], o.scn) +
        (d.ns ? `<label class="sl"><span>네임스페이스</span><input id="o-ns" class="sin" value="${esc(o.ns || (it.M.metadata && it.M.metadata.namespace) || 'default')}"></label>` : '') +
        `<label class="sl"><span>이름</span><input id="o-name" class="sin" value="${esc(o.name || (it.M.metadata && it.M.metadata.name) || '')}"></label>` });
      ob.appendChild(ctl);
      if (o.op === 'patch') ob.appendChild(el('div', { class: 'reqctl', html: sel('o-pt', '패치 종류', [['application/merge-patch+json', 'merge-patch (JSON Merge Patch)'], ['application/json-patch+json', 'json-patch'], ['application/strategic-merge-patch+json', 'strategic-merge-patch']], o.ptype) + `<label class="sl" style="flex:1 1 100%"><span>패치 본문(JSON)</span><textarea id="o-pb" class="sin" rows="3" spellcheck="false">${esc(o.pbody)}</textarea></label>` }));
      const bind = (id, key, re) => { const e = ob.querySelector('#' + id); if (!e) return; e.addEventListener(e.tagName === 'SELECT' ? 'change' : 'input', () => { o[key] = e.value; save(); if (re) renderOut(); else drawResult(); }); };
      bind('o-op', 'op', true); bind('o-fv', 'fv'); bind('o-dry', 'dry'); bind('o-scn', 'scn'); bind('o-ns', 'ns'); bind('o-name', 'name'); bind('o-pt', 'ptype'); bind('o-pb', 'pbody');
      const res = el('div', { id: 'simres' }); ob.appendChild(res);
      function drawResult() {
        const r = simulate(Object.assign({}, o), it.M, d.a, d, sch, issues, C);
        const ok = r.status < 300, cls = ok ? 'ok' : r.status < 500 ? 'warn' : 'bad';
        const doc = r.documented.length ? `<div class="mq"><b>문서에 정의된 응답</b> ${r.documented.map(x => `<span class="resp${String(x[0]).startsWith(r.status) ? ' hit' : ''}">${esc(x[0])} <code>${esc(x[1])}</code></span>`).join('')}</div>` : '';
        res.innerHTML = `<h4 class="rh">요청</h4><pre class="simreq"><code>${esc(r.req.method + ' ' + r.req.path + '\n' + r.req.headers.join('\n') + (r.req.body ? '\n\n' + JSON.stringify(r.req.body, null, 2) : ''))}</code></pre>
          <h4 class="rh">예상 응답</h4><div class="statusline ${cls}"><b>${r.status}</b> ${esc(({ 200: 'OK', 201: 'Created', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Entity' })[r.status] || '')}</div>
          ${r.warnings.length ? `<div class="warnhdr">Warning: ${r.warnings.map(esc).join('; ')}</div>` : ''}${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}
          <pre class="simreq"><code>${esc(JSON.stringify(r.body, null, 2))}</code></pre>${doc}
          <details class="epd"><summary>curl / oc 로 보내기</summary><div class="in"><pre class="simreq"><code>${esc('TOKEN=$(oc whoami -t)\nAPISERVER=$(oc whoami --show-server)\n\n' + curl(r.req) + '\n\n# oc 로는\n' + ocCmd(o, d, r.ns, r.name))}</code></pre></div></details>
          <p class="note">이 응답은 문서의 스키마 규칙으로 계산한 <b>가상 응답</b>입니다. 실제 클러스터의 기본값·어드미션·RBAC·충돌 검사는 반영하지 않습니다.</p>`;
      }
      drawResult();
    }
    host.querySelector('#otabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; renderOut(); } });

    /* ---- 시작 ---- */
    C.getFields().then(fa => {
      if (dead) return; F = fa;
      if (apiId) addItem(apiId, true);
      if (!store.items.length) { const first = C.docOf('route-route-openshift-io-v1') ? 'route-route-openshift-io-v1' : C.E.docs[0].a.id; addItem(first, true); }
      renderTabs(); renderForm(); renderOut();
    }).catch(e => { $('#sform').innerHTML = '<div class="empty">스키마 데이터를 불러오지 못했습니다: ' + esc(e.message) + '</div>'; });
    return { destroy() { dead = true; } };
  }

  root.Sim = { mount, yamlParse, yamlDump, validate, makeSchema, simulate, opsOf, _t: { ensureRequired, sampleFill, setAt, getAt, delAt, hasAt, mergePatch, resNames, curl, ocCmd, sq, defaultFor, ordered, restoreStore, closeTab, cleanOpt, normT } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Sim;
})(typeof window !== 'undefined' ? window : globalThis);
