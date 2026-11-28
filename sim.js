// SPDX-License-Identifier: MIT
/* API 설계 시뮬레이터: 스펙 기반 폼 → YAML → 스키마 검증 → 요청/응답 시뮬레이션 */
(function (root) {
  'use strict';
  const ui = (typeof module !== 'undefined' && module.exports ? require('./locale') : root.ApiBookLocale).text;
  const endpoints = typeof module !== 'undefined' && module.exports ? require('./endpoints') : root.ApiEndpoints;
  const LSKEY = 'apibook.sim.';
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const clone = v => JSON.parse(JSON.stringify(v));

  /* ====================== 미니 YAML (파서 + 덤퍼) ====================== */
  const MAX_INPUT = 1 << 20, MAX_DEPTH = 64;                      // 입력 1MB, 중첩 64단계 상한
  const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype']);
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const UNSUP = ui('지원하지 않는 YAML 문법: ');
  const clip = s => s.length > 40 ? s.slice(0, 40) + '…' : s;
  const BLOCK_RE = /^[|>](?:[1-9][-+]?|[-+][1-9]?)?$/;
  /* i 위치가 스칼라의 시작인지: 줄 처음, ': '/'- '/'? ' 뒤, 흐름식([ { ,) 안의 항목 처음. 평문 중간의 따옴표는 따옴표가 아님 */
  function scalarStart(line, i, d) {
    let j = i - 1; while (j >= 0 && line[j] === ' ') j--;
    if (j < 0) return true;
    const p = line[j];
    if (d > 0 && /[\[{,:]/.test(p)) return true;
    return j < i - 1 && (p === ':' || p === '?' || (p === '-' && (j === 0 || line[j - 1] === ' ')));
  }
  function stripComment(line) {
    let q = null, d = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '\\' && q === '"') i++; else if (c === q) { if (q === "'" && line[i + 1] === "'") i++; else q = null; } }
      else if (c === '"' || c === "'") { if (scalarStart(line, i, d)) q = c; }
      else if (c === '[' || c === '{') { if (d > 0 || scalarStart(line, i, d)) d++; }
      else if ((c === ']' || c === '}') && d > 0) d--;
      else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
    return line;
  }
  /* 2^53 을 넘는 정수는 정밀도가 깨지므로 문자열로 유지하고 경고(WARN 은 yamlParse 호출 동안만 설정) */
  let WARN = null;
  const bigWarn = s => { if (WARN && WARN.length < 20) WARN.push(ui`정수 ${clip(s)} 는 2^53 을 넘어 정밀도가 손실되므로 문자열로 유지했습니다`); };
  const NUM_RE = /-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/y;
  /* JSON 텍스트에서 문자열 밖의 큰 정수 토큰을 따옴표로 감쌈(JSON.parse 전에) */
  function bigQuote(t) {
    if (!/\d{16}/.test(t)) return t;
    let out = '', i = 0;
    while (i < t.length) {
      const c = t[i];
      if (c === '"') { let j = i + 1; while (j < t.length && t[j] !== '"') j += t[j] === '\\' ? 2 : 1; out += t.slice(i, j + 1); i = j + 1; continue; }
      if (c === '-' || (c >= '0' && c <= '9')) { NUM_RE.lastIndex = i; const m = NUM_RE.exec(t); if (m) { const s = m[0]; if (/^-?\d+$/.test(s) && !Number.isSafeInteger(Number(s))) { out += '"' + s + '"'; bigWarn(s); } else out += s; i += s.length; continue; } }
      out += c; i++;
    }
    return out;
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
    if (s[0] === '"') { try { return JSON.parse(s); } catch (e) { throw new Error(ui('따옴표가 올바르지 않습니다: ') + clip(s)); } }
    if (s[0] === "'") { if (s.length < 2 || s[s.length - 1] !== "'") throw new Error(ui('따옴표가 닫히지 않았습니다: ') + clip(s)); return s.slice(1, -1).replace(/''/g, "'"); }
    if (s[0] === '&' || s[0] === '*') throw new Error(UNSUP + (s[0] === '&' ? ui('앵커(&)') : ui('별칭(*)')) + ui(' — 값을 직접 풀어서 써 주세요: ') + clip(s));
    if (s[0] === '!') throw new Error(UNSUP + ui('태그(!)') + ': ' + clip(s));
    if (s[0] === '[' || s[0] === '{') return flow(s, depth || 0);
    if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
    if (/^[-+]?\d+$/.test(s)) { const n = parseInt(s, 10); if (Number.isSafeInteger(n)) return n; bigWarn(s); return s; }
    if (/^[-+]?\.(inf|Inf|INF)$/.test(s) || /^\.(nan|NaN|NAN)$/.test(s)) { if (WARN && WARN.length < 20) WARN.push(ui`${s} 는 JSON 으로 표현할 수 없어 API 서버로 보낼 수 없습니다`); return /n/i.test(s[1]) ? NaN : s[0] === '-' ? -Infinity : Infinity; }
    if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(s)) return parseFloat(s);
    return s;
  }
  function flow(s, depth) {
    if (depth >= MAX_DEPTH) throw new Error(ui('중첩이 너무 깊습니다 (최대 ') + MAX_DEPTH + ui('단계)'));
    s = s.trim();
    if (s[0] === '[') {
      if (s[s.length - 1] !== ']') throw new Error(UNSUP + ui('여러 줄에 걸친 흐름식 [ ] 은 한 줄로 쓰거나 블록 형식으로 바꿔 주세요: ') + clip(s));
      return splitTop(s.slice(1, -1)).map(x => scalar(x, depth + 1));
    }
    if (s[s.length - 1] !== '}') throw new Error(UNSUP + ui('여러 줄에 걸친 흐름식 { } 은 한 줄로 쓰거나 블록 형식으로 바꿔 주세요: ') + clip(s));
    const o = {};
    for (const part of splitTop(s.slice(1, -1))) {
      const ks = keySplit(part.trim()); if (!ks) throw new Error(ui("'key: value' 형식이 아닙니다: ") + clip(part));
      if (DANGEROUS.has(ks[0])) throw new Error(ui`허용되지 않는 키 "${ks[0]}"`);
      if (hasOwn(o, ks[0])) throw new Error(ui`중복된 키 "${ks[0]}"`);
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
      try { key = q === '"' ? JSON.parse(t.slice(0, j + 1)) : t.slice(1, j).replace(/''/g, "'"); } catch (e) { throw new Error(ui('따옴표가 올바르지 않습니다: ') + clip(t)); }
      rest = t.slice(j + 2).trim();
    } else {
      const m = t.match(/^([^]*?):(?:\s+([^]*))?$/); if (!m) return null;
      key = m[1].trim(); rest = (m[2] || '').trim();
      if (key.includes(' #') || key === '') return null;
      if (key[0] === '&' || key[0] === '*' || key[0] === '!') throw new Error(UNSUP + ui('앵커/별칭/태그: ') + clip(t));
    }
    return [key, rest];
  }
  const isSeq = t => t === '-' || t.startsWith('- ');
  function parseDoc(rawLines, start) {
    const L = [];
    const wrap = (n, fn) => { try { return fn(); } catch (e) { if (e instanceof RangeError || e instanceof TypeError || /^줄 \d+:/.test(e.message)) throw e; throw new Error(ui`줄 ${n}: ${e.message}`); } };
    rawLines.forEach((line, idx) => {
      const n = start + idx + 1;
      if (line.trim() !== '' && /^\t/.test(line)) throw new Error(ui`줄 ${n}: 탭 대신 공백으로 들여써 주세요`);
      const t = stripComment(line), ind = /^ */.exec(line)[0].length;
      if (!t.trim()) { L.push({ blank: true, comment: line.trim() !== '', indent: ind, raw: line, n }); return; }
      const m = /^( *)([^]*)$/.exec(t); L.push({ indent: m[1].length, text: m[2].trimEnd(), raw: line, n });
    });
    let i = 0;
    const skip = () => { while (i < L.length && L[i].blank) i++; };
    const KS = ln => wrap(ln.n, () => keySplit(ln.text));
    function block(head, indent, ln0) {
      if (/[1-9]/.test(head)) throw new Error(ui`줄 ${ln0.n}: ${UNSUP}블록 들여쓰기 표시자(${head})`);
      const raw = []; let ci = -1;                                        // 공백만 있는 줄은 {ws: 원문} 으로 보관(들여쓰기 확정 후 처리)
      while (i < L.length) {
        const ln = L[i];
        if (ln.blank && !ln.comment) { raw.push({ ws: ln.raw }); i++; continue; }   // 빈 줄(공백만 있는 줄 포함)
        if (ln.indent <= indent) break;                                   // 블록 끝(들여쓰기가 얕은 주석 포함)
        if (ci < 0) ci = ln.indent; else if (ln.indent < ci) break;
        raw.push(ln.raw.slice(Math.min(ci, ln.raw.length))); i++;         // '#' 로 시작하는 줄도 원문 그대로
      }
      let tb = 0; while (raw.length && typeof raw[raw.length - 1] !== 'string') { raw.pop(); tb++; }
      const lines = raw.map(x => typeof x === 'string' ? x : ci >= 0 && x.ws.length > ci ? x.ws.slice(ci) : '');   // 들여쓰기보다 긴 공백은 내용으로 유지
      const keep = head.includes('+'), strip = head.includes('-');
      let txt = '';
      if (head[0] === '|') txt = lines.join('\n');
      else {                                                              // 접기(YAML 1.2): 이어진 줄은 공백, 빈 줄 k개는 개행 k개, 더 들여쓴 줄 주변은 개행 k+1개
        let prev = null, nb = 0;
        for (const l of lines) {
          if (l === '') { nb++; continue; }
          if (prev === null) txt += '\n'.repeat(nb);
          else txt += /^[ \t]/.test(l) || /^[ \t]/.test(prev) ? '\n'.repeat(nb + 1) : nb ? '\n'.repeat(nb) : ' ';
          txt += l; prev = l; nb = 0;
        }
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
      if (dep > MAX_DEPTH) throw new Error(ui`줄 ${L[i].n}: 중첩이 너무 깊습니다 (최대 ${MAX_DEPTH}단계)`);
      const o = {}; let prevPlain = false;
      for (;;) {
        skip(); if (i >= L.length) break; const ln = L[i];
        if (ln.indent < indent) break;
        if (ln.indent > indent) throw new Error(prevPlain ? ui`줄 ${ln.n}: 여러 줄 평문 스칼라는 지원하지 않습니다. 값을 한 줄로 쓰거나 "|"(줄 유지) 또는 ">"(줄 접기) 블록 스칼라를 쓰세요` : ui`줄 ${ln.n}: 들여쓰기가 맞지 않습니다`);
        if (isSeq(ln.text)) break;
        const ks = KS(ln); if (!ks) throw new Error(ui`줄 ${ln.n}: 'key: value' 형식이 아닙니다 → ${clip(ln.text)}`);
        const [k, rest] = ks; i++;
        if (DANGEROUS.has(k)) throw new Error(ui`줄 ${ln.n}: 허용되지 않는 키 "${k}"`);
        if (hasOwn(o, k)) throw new Error(ui`줄 ${ln.n}: 중복된 키 "${k}"`);
        if (rest === '') { skip(); const nx = L[i]; o[k] = nx && (nx.indent > indent || (nx.indent === indent && isSeq(nx.text))) ? node(nx.indent, dep + 1) : null; }
        else if (BLOCK_RE.test(rest)) o[k] = block(rest, indent, ln);
        else o[k] = wrap(ln.n, () => scalar(rest, 0));
        prevPlain = rest !== '' && !BLOCK_RE.test(rest);
      }
      return o;
    }
    function seq(indent, dep) {
      if (dep > MAX_DEPTH) throw new Error(ui`줄 ${L[i].n}: 중첩이 너무 깊습니다 (최대 ${MAX_DEPTH}단계)`);
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
    if (i < L.length) throw new Error(ui`줄 ${L[i].n}: 해석할 수 없는 내용입니다 → ${clip(L[i].text || L[i].raw)}`);
    return v;
  }
  /* 파싱된 JSON 에 위험 키/과도한 중첩이 없는지 확인 */
  function treeOK(v, dep) {
    if (v === null || typeof v !== 'object') return true;
    if (dep > MAX_DEPTH) return false;
    if (Array.isArray(v)) return v.every(x => treeOK(x, dep + 1));
    return Object.keys(v).every(k => !DANGEROUS.has(k) && treeOK(v[k], dep + 1));
  }
  /* 문서 목록을 돌려줌(--- 로 나뉜 여러 문서, 최상위 JSON 배열은 문서 여러 개). warns 배열을 주면 경고(큰 정수 등)를 넣어 줌 */
  function yamlParse(text, warns) {
    if (typeof text !== 'string') throw new Error(ui('문자열이 아닙니다'));
    if (text.length > MAX_INPUT) throw new Error(ui`입력이 너무 큽니다 (최대 ${MAX_INPUT >> 20}MB)`);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);              // UTF-8 BOM
    const prevW = WARN; WARN = Array.isArray(warns) ? warns : null;
    try { return yamlParseInner(text); }
    catch (e) {
      if (e instanceof RangeError) throw new Error(ui('중첩이 너무 깊어 해석할 수 없습니다 (최대 ') + MAX_DEPTH + ui('단계)'));
      if (e instanceof TypeError || e instanceof SyntaxError) throw new Error(ui('YAML을 해석할 수 없습니다 (') + e.message + ')');
      throw e;
    } finally { WARN = prevW; }
  }
  /* 값 하나를 해석(자유 형식 입력용): JSON 우선, 아니면 단일 YAML 문서. 배열은 배열 그대로. 빈 입력은 undefined */
  function parseValue(text, warns) {
    if (typeof text !== 'string') throw new Error(ui('문자열이 아닙니다'));
    const t = text.replace(/^﻿/, '').trim(); if (t === '') return undefined;
    if (t.length > MAX_INPUT) throw new Error(ui`입력이 너무 큽니다 (최대 ${MAX_INPUT >> 20}MB)`);
    const prevW = WARN; WARN = Array.isArray(warns) ? warns : null;
    let j, ok = false;
    const wn = WARN ? WARN.length : 0;
    try { j = JSON.parse(bigQuote(t)); ok = true; } catch (e) { if (WARN) WARN.length = wn; /* YAML 로 시도 */ } finally { WARN = prevW; }
    if (ok) { if (!treeOK(j, 0)) throw new Error(ui('허용되지 않는 키(__proto__ 등)가 있거나 중첩이 너무 깊습니다')); return j; }
    const docs = yamlParse(t, warns);
    if (docs.length > 1) throw new Error(ui('문서(---)가 여러 개입니다. 값 하나만 입력하세요'));
    return docs.length ? docs[0] : null;
  }
  function yamlParseInner(text) {
    const t = text.trim();
    if (t[0] === '{' && /\}\s*$/.test(t) || t[0] === '[' && /\]\s*$/.test(t)) {
      let j, ok = false; const wn = WARN ? WARN.length : 0; try { j = JSON.parse(bigQuote(t)); ok = true; } catch (e) { if (WARN) WARN.length = wn; /* YAML 흐름식일 수 있음 */ }
      if (ok) { if (!treeOK(j, 0)) throw new Error(ui('허용되지 않는 키(__proto__ 등)가 있거나 중첩이 너무 깊습니다')); return Array.isArray(j) ? j : [j]; }
    }
    const docs = []; let cur = [], st = 0;
    const cut = idx => { if (cur.some(l => l.trim())) docs.push({ lines: cur, st }); cur = []; st = idx + 1; };
    text.replace(/\r/g, '').split('\n').forEach((line, idx) => { if (/^(---|\.\.\.)(\s+#.*|\s*)$/.test(line)) cut(idx); else cur.push(line); });   // '--- # 주석' 문서 시작, '...' 문서 끝
    if (cur.some(l => l.trim())) docs.push({ lines: cur, st });
    return docs.map(d => parseDoc(d.lines, d.st));
  }
  const RESERVED = /^(true|false|null|yes|no|on|off|y|n|~|[-+]?\.inf|\.nan)$/i;
  const jq = s => JSON.stringify(s).replace(/[\u0085\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const yq = s => (s === '' || /^\s|\s$|^[-?:,\[\]{}#&*!|>'"%@`]|: | #|:$|[\x00-\x1f\x7f\u0085\u2028\u2029]|^\.\.\./.test(s) || RESERVED.test(s) || /^[-+]?\.?\d/.test(s)) ? jq(s) : s;
  const numY = v => Number.isFinite(v) ? String(v) : Number.isNaN(v) ? '.nan' : v > 0 ? '.inf' : '-.inf';   // Infinity/NaN 은 YAML 표기로(문자열 "Infinity" 로 되돌아오지 않게)
  const inl = v => v === null || v === undefined ? 'null' : typeof v === 'string' ? yq(v) : typeof v === 'number' ? numY(v) : Array.isArray(v) ? '[]' : isObj(v) ? '{}' : String(v);
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
    { name: 'name', type: 'string', desc: ui('리소스 이름. 소문자·숫자·"-"·"."만 사용하고 네임스페이스 안에서 유일해야 합니다.'), required: true, kind: 'scalar', st: 'string' },
    { name: 'namespace', type: 'string', desc: ui('리소스가 속한 네임스페이스.'), required: false, kind: 'scalar', st: 'string' },
    { name: 'generateName', type: 'string', desc: ui('name을 비워 두면 이 접두사 뒤에 임의 문자열을 붙여 서버가 이름을 만듭니다.'), required: false, kind: 'scalar', st: 'string' },
    { name: 'labels', type: 'object (string)', desc: ui('리소스를 선택·분류하는 키-값 쌍.'), required: false, kind: 'map', st: 'string' },
    { name: 'annotations', type: 'object (string)', desc: ui('도구와 사람이 참고하는 부가 정보(선택에 쓰이지 않음).'), required: false, kind: 'map', st: 'string' },
    { name: 'finalizers', type: 'array (string)', desc: ui('삭제 전에 정리 작업이 끝날 때까지 삭제를 막는 식별자 목록.'), required: false, kind: 'array-scalar', st: 'string' },
  ];
  const reviewKinds = new Map([
    ['authorization.k8s.io', ['SelfSubjectAccessReview', 'LocalSubjectAccessReview', 'SubjectAccessReview', 'SelfSubjectRulesReview']],
    ['authentication.k8s.io', ['TokenReview', 'SelfSubjectReview']],
    ['security.openshift.io', ['PodSecurityPolicyReview', 'PodSecurityPolicySelfSubjectReview', 'PodSecurityPolicySubjectReview']],
    ['authorization.openshift.io', ['LocalResourceAccessReview', 'LocalSubjectAccessReview', 'ResourceAccessReview', 'SubjectAccessReview', 'SelfSubjectRulesReview', 'SubjectRulesReview']],
  ]);
  function needsName(a) {
    return !reviewKinds.get(a.group)?.includes(a.kind) || !!a.d.required?.includes('metadata');
  }
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
        if (p === '' && nm === 'metadata') { out.push({ name: 'metadata', type: 'ObjectMeta', desc: r[2], required: needsName(a), kind: 'meta' }); continue; }
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
  /* 설명 문장에서 서버 기본값 추출(보수적: 틀린 값보다 못 찾는 쪽을 택함). 반환 null | { v, cond, src } — cond: "… when X" 같은 조건부 기본값(채우지 않음) */
  const DEF_VAGUE = /subject to change|reasonable default|may change|change over time|platform (?:is left to )?choose|chosen by the platform|platform default|depends on|implementation[- ]defined|implementation[- ]specific/i;
  const DEF_STOP = /^(?:the|a|an|this|that|these|its|their|his|her|all|any|each|every|some|empty|nil|null|unset|none|no|not|whatever|same|current|value|values|be|being|to|use|used|using|true|false|either|one|whichever|defined|determined|set|whether|if|when|what|which|where|false|nothing|default|defaults|current|existing|other|another|zero|off|on|in|of|by|for|at|as)$/i;
  const DEF_ABS = /\b(?:if|when)\b([^,;]{0,70}?)\b(?:not\s+(?:be\s+)?(?:specified|set|provided|present|given|defined|configured|supplied)|(?:do|does)\s+not\s+specify|(?:is|are)\s+(?:unspecified|unset|empty|omitted|nil|null|absent|missing|blank)|unspecified|unset|empty|omitted|nil|absent|missing|blank)\b\s*(?:\([^)]{0,40}\))?\s*,?\s*(?:then\s+)?(?:it\s+|this\s+(?:field\s+|value\s+)?|the\s+field\s+)?/gi;
  const DEF_ONLY = /may only be set|only applies|only valid|only used when|ignored unless|ignored if|will be cleared|only be specified|only (?:be )?(?:set|used|allowed|applicable|honou?red|relevant) (?:when|if|for|with)/i;   // 특정 조건에서만 쓰이는 필드 → 조건부
  const DEF_UNIT = /^\s+(?:seconds?|secs?|minutes?|mins?|hours?|days?|milliseconds?|ms|bytes?|retries|times|attempts|pods?|replicas?|percent|%|MiB|GiB|KiB)\b/i;
  const DEF_LEAD = /\b(?:defaults?\s+(?:to|is|value\s+is)|defaulted\s+to|(?:the\s+)?default\s+(?:value\s+)?(?:is|will\s+be)|default(?:\s+value)?\s*[:=]|(?:the\s+)?default\s+behaviou?r\s+is|default\s+value\s*,)\s*/gi;
  function defVal(rest, tt, desc, quotedOnly) {
    const q = rest.match(/^(["'`“])(.*?)(["'`”])/);
    let tok, tail, quoted = false;
    if (q && q[2].length <= 80) { tok = q[2]; tail = rest.slice(q[0].length); quoted = true; }
    else { if (quotedOnly) return null; const m = rest.match(/^[^\s,;()"'`“”]+/); if (!m) return null; tok = m[0].replace(/[.:]+$/, ''); tail = rest.slice(tok.length); if (!/^(?:-?\d[\w.\/%:-]*|[A-Za-z][\w.\/-]*|\/[\w.\/-]+)$/.test(tok)) return null; }
    if (quoted) { tok = tok.replace(/\\([*_])/g, '$1'); if (/\\/.test(tok)) return null; }                  // 문서의 마크다운 이스케이프(\*) 만 풀고, 그 밖의 역슬래시는 원문 확인이 어려워 버림
    if (tok === '' || tok.length > 80) return null;
    // 값 뒤: 문장 끝/구두점/괄호 또는 정수 단위만 허용. "… when X" 류는 조건부, 그 밖의 이어지는 낱말은 거부
    let cond = false;
    const um = tail.match(DEF_UNIT);
    if (um && /^(?:integer|number)$/.test(tt) && /^-?\d+$/.test(tok)) tail = tail.slice(um[0].length);
    if (/^\s*,?\s*(?:if|when)\s+(?:(?:it|this|the\s+field|the\s+value)\s+is\s+)?(?:not\s+(?:set|specified|provided)|unset|unspecified|empty|omitted|nil)\s*(?:$|[.;,)])/i.test(tail) || /^\s+for\s+backwards?\s+compatibility\b/i.test(tail)) tail = '';   // "… if unset" 은 무조건
    if (/^\s*[,;]?\s*(?:if|when|unless|for|on|in|except|only|depending|based|per|until|after|before|while|but|otherwise|where|provided)\b/i.test(tail)) cond = true;
    else if (!/^(?:$|[;,)(:]|\.(?:\s|$)|\s*\(|\s+-\s|\s*—|\s+(?:and\s+)?(?:which|meaning|i\.e\.|e\.g\.)\b)/i.test(tail)) return null;
    let v;
    if (tt === 'boolean') { if (!/^(?:true|false)$/i.test(tok)) return null; v = tok.toLowerCase() === 'true'; }
    else if (tt === 'integer' || tt === 'number') {
      if (/^0[0-7]{3}$/.test(tok) && tt === 'integer') v = parseInt(tok, 8);                    // 파일 모드 0644 → 420(JSON 은 10진수)
      else if ((tt === 'integer' ? /^-?\d{1,15}$/ : /^-?\d{1,15}(?:\.\d+)?$/).test(tok)) v = Number(tok); else return null;
    } else if (tt === 'intorstring') v = !quoted && /^-?\d{1,15}$/.test(tok) ? Number(tok) : (/^\d+(?:\.\d+)?%$/.test(tok) || quoted) ? tok : null;   // "1" 처럼 따옴표면 문자열
    else if (tt === 'string') {
      if (quoted) v = tok;
      else if (/^-?\d+$/.test(tok)) return null;                                                 // 문자열 필드에 따옴표 없는 정수는 다른 값 설명일 때가 많음
      else if (/^-?\d|^\/./.test(tok)) v = tok;                                                 // 30s, 25%, /dev/termination-log 처럼 숫자·경로면 문자열 그대로
      else { const en = enumOf(desc) || [], inEnum = en.includes(tok) || new RegExp('["\'`]' + tok.replace(/[.\/-]/g, '\\$&') + '["\'`]').test(desc); if (DEF_STOP.test(tok) && !inEnum) return null; if (!/[A-Z]/.test(tok) && !inEnum) return null; v = tok; }
    } else return null;
    if (v == null || v === '') return null;
    return { v, cond };
  }
  function defaultFrom(desc, type) {
    desc = String(desc || ''); if (!/default/i.test(desc) || DEF_VAGUE.test(desc)) return null;
    const n = normT(type), tt = PRIM[n] || (subOf(type) === 'intorstring' ? 'intorstring' : (n === 'string' || subOf(type) === 'quantity' || subOf(type) === 'time') ? 'string' : '') || (['string', 'integer', 'number', 'boolean', 'intorstring'].includes(type) ? type : '');
    if (!tt) return null;
    const found = [];
    const sents = desc.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"'*(-])|\s\*\s|\s-\s(?=["'])/);
    for (const s of sents) {
      DEF_LEAD.lastIndex = 0; let m;
      while ((m = DEF_LEAD.exec(s))) {
        const lead = m[0], at = m.index, pre = s.slice(0, at);
        const r = defVal(s.slice(at + lead.length), tt, desc, /behaviou?r|value\s*,/i.test(lead));   // "default behavior is" 류는 따옴표 값만
        if (!r) continue;
        // 앞 문맥이 조건이면(If X is enabled, … / For Y, … / Otherwise …) 조건부. "If not specified," 같은 '값이 없을 때' 는 무조건으로 봄
        const pre2 = pre.replace(DEF_ABS, (all, mid) => /\b(?:and|or|but)\b/i.test(mid) ? all : ' ');
        if (/\b(?:if|when|whenever|unless|for|otherwise|except|only|while|where|once|after|before)\b/i.test(pre2) || /\bdefault/i.test(pre2) || pre.split('(').length > pre.split(')').length) r.cond = true;   // 열린 괄호 안(다른 값 설명)도 조건부
        found.push(Object.assign(r, { src: s.slice(at, at + lead.length + 40).trim() }));
      }
      const pm = tt === 'integer' || tt === 'number' ? s.match(/\bdefault\s+(-?\d{1,15})\s*(?=[,;)]|\.(?:\s|$)|$)/i) : null;   // "weight … between 0 and 256, default 100, that …"
      if (pm && !found.some(f => f.v === Number(pm[1]))) found.push({ v: Number(pm[1]), cond: /\b(?:if|when|for|otherwise|unless)\b/i.test(s.slice(0, pm.index).replace(DEF_ABS, ' ')), src: pm[0] });
      const qm = tt === 'string' || tt === 'intorstring' ? s.match(/(["'])([^"']{1,60})\1\s+is\s+the\s+default\b(?=\s*(?:[.,;)]|$))/i) : null;
      if (qm) found.push({ v: qm[2], cond: /\b(?:if|when|for|otherwise|unless)\b/i.test(s.slice(0, qm.index)), src: qm[0] });
      // "* edge - … (default)" 같은 목록 항목
      const bm = tt === 'string' ? s.match(/^["']?([A-Za-z][\w-]{0,40})["']?\s+(?:-|is)\s[^*]*?\(default\)\s*\.?$/) : null;
      if (bm && !DEF_STOP.test(bm[1])) found.push({ v: bm[1], cond: false, src: bm[0].slice(0, 40) });
    }
    if (!found.length) return null;
    const vals = [...new Set(found.map(f => JSON.stringify(f.v)))];
    if (vals.length > 1) return null;                                     // 서로 다른 값이 둘 이상이면 모호 → 버림
    return { v: found[0].v, cond: found.some(f => f.cond) || DEF_ONLY.test(desc), src: found[0].src };
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
  const DNS = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/, DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, DNS1035 = /^[a-z]([-a-z0-9]*[a-z0-9])?$/;
  const LABEL_KINDS = new Set(['Namespace', 'Project', 'ProjectRequest']), PATHSEG_KINDS = new Set(['Role', 'ClusterRole', 'RoleBinding', 'ClusterRoleBinding']);
  /* kind 별 이름 규칙(apiserver 와 같은 규칙). 오류면 { ko, en }, 아니면 null */
  function nameError(kind, n) {
    if (PATHSEG_KINDS.has(kind)) {                                       // RBAC: 경로 세그먼트 규칙만(system:aggregate-to-admin 같은 이름 허용)
      const bad = n === '.' ? "may not be '.'" : n === '..' ? "may not be '..'" : n.includes('/') ? "may not contain '/'" : n.includes('%') ? "may not contain '%'" : '';
      return bad ? { ko: ui('이름 형식 오류: "."·".."은 쓸 수 없고 "/"·"%"를 포함할 수 없습니다'), en: bad } : null;
    }
    const svc = kind === 'Service', lbl = svc || LABEL_KINDS.has(kind), max = lbl ? 63 : 253;
    if (n.length > max) return { ko: ui`이름이 너무 깁니다: ${max}자 이하여야 합니다 (현재 ${n.length}자)`, en: `must be no more than ${max} characters` };
    if (svc ? DNS1035.test(n) : lbl ? DNS_LABEL.test(n) : DNS.test(n)) return null;
    if (svc) return { ko: ui('이름 형식 오류(DNS-1035 레이블): 소문자·숫자·"-"만 가능하고 영소문자로 시작, 영숫자로 끝나야 하며 63자 이하여야 합니다'), en: "a DNS-1035 label must consist of lower case alphanumeric characters or '-', start with an alphabetic character, and end with an alphanumeric character" };
    if (lbl) return { ko: ui('이름 형식 오류(DNS-1123 레이블): 소문자·숫자·"-"만 가능하고 영숫자로 시작·끝나야 하며 63자 이하여야 합니다'), en: "a lowercase RFC 1123 label must consist of lower case alphanumeric characters or '-', and must start and end with an alphanumeric character" };
    return { ko: ui('이름 형식 오류(DNS-1123 서브도메인): 소문자·숫자·"-"·"."만 가능하고 영숫자로 시작·끝나야 하며 253자 이하여야 합니다'), en: "a lowercase RFC 1123 subdomain must consist of lower case alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character" };
  }
  const empty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  function validate(M, a, d, sch) {
    const issues = [];
    const add = (level, p, msg, code, x) => issues.push(Object.assign({ level, path: pstr(p), msg, code }, code === 'unknown' ? { segments: p } : {}, x));
    if (M.apiVersion !== d.gv) add('error', ['apiVersion'], ui`apiVersion은 "${d.gv}" 이어야 합니다 (현재: ${JSON.stringify(M.apiVersion)})`, 'mismatch');
    if (M.kind !== a.kind) add('error', ['kind'], ui`kind는 "${a.kind}" 이어야 합니다 (현재: ${JSON.stringify(M.kind)})`, 'mismatch');
    const md = M.metadata;
    if (!isObj(md)) {
      if (md !== undefined) add('error', ['metadata'], ui('객체여야 합니다'), 'type');
      else if (needsName(a)) add('error', ['metadata'], ui('필수 값 없음'), 'required');
    }
    else {
      if (md.name != null && typeof md.name !== 'string') add('error', ['metadata', 'name'], ui('문자열이어야 합니다'), 'type');
      if (needsName(a) && empty(md.name) && empty(md.generateName)) add('error', ['metadata', 'name'], ui('필수 값 없음: name 또는 generateName 중 하나가 필요합니다'), 'required');
      else if (typeof md.name === 'string' && md.name) {
        const ne = nameError(a.kind, md.name);
        if (ne) add('error', ['metadata', 'name'], ne.ko, 'invalid', { val: md.name, rule: ne.en });
      }
      if (d.ns && empty(md.namespace)) add('warn', ['metadata', 'namespace'], ui('네임스페이스 범위 리소스입니다. 비워 두면 현재 프로젝트(네임스페이스)에 만들어집니다'), 'hint');
      if (!d.ns && !empty(md.namespace)) add('warn', ['metadata', 'namespace'], ui('클러스터 범위 리소스라 namespace는 무시됩니다'), 'hint');
      for (const field of ['namespace', 'generateName']) {
        if (md[field] != null && typeof md[field] !== 'string') add('error', ['metadata', field], ui('문자열이어야 합니다'), 'type');
      }
      for (const field of ['labels', 'annotations']) {
        if (md[field] == null) continue;
        if (!isObj(md[field])) add('error', ['metadata', field], ui('문자열 값을 가진 맵이어야 합니다'), 'type');
        else for (const [k, v] of Object.entries(md[field])) if (typeof v !== 'string') add('error', ['metadata', field, k], ui('문자열이어야 합니다'), 'type');
      }
      if (md.finalizers != null && (!Array.isArray(md.finalizers) || md.finalizers.some(x => typeof x !== 'string'))) add('error', ['metadata', 'finalizers'], ui('문자열 배열이어야 합니다'), 'type');
      if (!empty(md.namespace) && typeof md.namespace === 'string' && (md.namespace.length > 63 || !DNS_LABEL.test(md.namespace))) add('error', ['metadata', 'namespace'], ui('네임스페이스 형식 오류: 소문자·숫자·"-"만, 63자 이하'), 'invalid');
      for (const k of Object.keys(md)) if (!META.some(m => m.name === k) && !['uid', 'resourceVersion', 'generation', 'creationTimestamp', 'ownerReferences', 'managedFields', 'deletionTimestamp', 'selfLink'].includes(k)) add('warn', ['metadata', k], ui`알 수 없는 필드 "${k}"`, 'unknown');
    }
    const typeOK = (st, v) => {
      if (/^string$/i.test(st)) return typeof v === 'string';
      if (/^integer$/i.test(st)) return typeof v === 'number' && Number.isInteger(v);
      if (/^number$/i.test(st)) return typeof v === 'number' && Number.isFinite(v);   // .inf/.nan 은 JSON 으로 보낼 수 없음
      if (/^boolean$/i.test(st)) return typeof v === 'boolean';
      return true;
    };
    const itemOK = (kid, v) => (kid.sub === 'intorstring' || kid.sub === 'quantity') ? (typeof v === 'string' || typeof v === 'number') : typeOK(kid.st, v);
    const tname = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v === 'number' ? 'number' : typeof v;
    function walk(val, sp, vp, depth) {
      if (!isObj(val)) return;
      const kids = sch.children(sp), names = new Set(kids.map(k => k.name));
      if (sp === '') ['apiVersion', 'kind', 'metadata'].forEach(n => names.add(n));
      for (const k of Object.keys(val)) if (!names.has(k) && !(sp === '' && k === 'status')) add('warn', vp.concat(k), ui`스펙에 없는 필드 "${k}"${nearest(k, [...names]) ? ui` — 혹시 "${nearest(k, [...names])}"?` : ''}`, 'unknown');
      for (const kid of kids) {
        if (kid.kind === 'meta') continue;
        const p = vp.concat(kid.name), v = val[kid.name], present = v !== undefined;
        if (kid.required && (!present || v === null || empty(v) && kid.kind !== 'object' && kid.kind !== 'map-object' && kid.kind !== 'any' && !(kid.kind === 'scalar' && kid.st === 'boolean' && typeof v === 'boolean') && !(kid.name === 'apiGroup' && v === ''))) {
          add('error', p, ui('필수 값 없음'), 'required'); if (!present) continue;
        }
        if (!present) continue;
        if (v === null) { if (kid.required) continue; add('warn', p, ui('값이 비어 있습니다(null)'), 'hint'); continue; }
        const en = kid.kind === 'scalar' && typeof v === 'string' ? enumOf(kid.desc) : null;
        if (kid.kind === 'scalar') {
          if (kid.sub === 'intorstring') { if (typeof v !== 'string' && typeof v !== 'number') add('error', p, ui('숫자 또는 문자열이어야 합니다'), 'type'); }
          else if (kid.sub === 'quantity') { if (typeof v !== 'string' && typeof v !== 'number') add('error', p, ui('수량은 문자열(예: "100m")이어야 합니다'), 'type'); }
          else if (!typeOK(kid.st, v)) add('error', p, ui`${kid.st === 'string' ? ui('문자열') : kid.st === 'boolean' ? ui('불리언(true/false)') : kid.st === 'integer' ? ui('정수') : ui('숫자')}여야 합니다 (현재: ${tname(v)})`, 'type', { exp: kid.st, act: tname(v) });
          else if (en && v !== '' && !en.includes(v)) add('warn', p, ui`설명에 나온 값(${en.join(', ')})이 아닙니다`, 'enum');
        } else if (kid.kind === 'object') { if (!isObj(v)) add('error', p, ui`객체여야 합니다 (현재: ${tname(v)})`, 'type', { exp: 'object', act: tname(v) }); else walk(v, kid.cpath, p, depth + 1); }
        else if (kid.kind === 'array-object') {
          if (!Array.isArray(v)) add('error', p, ui`배열이어야 합니다 (현재: ${tname(v)})`, 'type', { exp: 'array', act: tname(v) });
          else v.forEach((it, i) => { if (!isObj(it)) add('error', p.concat(i), ui('객체여야 합니다'), 'type'); else walk(it, kid.cpath, p.concat(i), depth + 1); });
        } else if (kid.kind === 'array-scalar') {
          if (!Array.isArray(v)) add('error', p, ui`배열이어야 합니다 (현재: ${tname(v)})`, 'type', { exp: 'array', act: tname(v) });
          else v.forEach((it, i) => { if (!itemOK(kid, it)) add('error', p.concat(i), ui`항목 타입 오류: ${kid.st} 여야 합니다`, 'type'); });
        } else if (kid.kind === 'map') {
          if (!isObj(v)) add('error', p, ui`맵(키-값)이어야 합니다 (현재: ${tname(v)})`, 'type');
          else for (const [mk, mv] of Object.entries(v)) if (!itemOK(kid, mv)) add('error', p.concat(mk), ui`값은 ${kid.st} 여야 합니다`, 'type');
        } else if (kid.kind === 'map-object') { if (!isObj(v)) add('error', p, ui('맵이어야 합니다'), 'type'); }
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
  /* RFC 6902 JSON Patch (RFC 6901 포인터). 원본은 건드리지 않고 사본에 적용. 실패하면 Error(서버 메시지와 비슷한 영어 문구) */
  const deepEq = (x, y) => { if (x === y) return true; if (Array.isArray(x)) return Array.isArray(y) && x.length === y.length && x.every((v, i) => deepEq(v, y[i])); if (isObj(x) && isObj(y)) { const kx = Object.keys(x); return kx.length === Object.keys(y).length && kx.every(k => hasOwn(y, k) && deepEq(x[k], y[k])); } return false; };
  function jsonPatch(doc, ops) {
    if (!Array.isArray(ops)) throw new Error('json patch must be an array of operations');
    const ptr = (s, f) => {
      if (typeof s !== 'string') throw new Error(`operation is missing "${f}" string`);
      if (s === '') return [];
      if (s[0] !== '/') throw new Error(`invalid JSON pointer "${s}": must start with "/"`);
      return s.slice(1).split('/').map(x => { if (/~(?![01])/.test(x)) throw new Error(`invalid JSON pointer "${s}": bad escape`); const u = x.replace(/~1/g, '/').replace(/~0/g, '~'); if (DANGEROUS.has(u)) throw new Error(`invalid JSON pointer "${s}": forbidden key "${u}"`); return u; });
    };
    const IDX = /^(0|[1-9]\d*)$/;
    const kid = (c, k) => Array.isArray(c) ? (IDX.test(k) && +k < c.length ? c[+k] : undefined) : isObj(c) && hasOwn(c, k) ? c[k] : undefined;
    const get = (r, p) => { let c = r; for (const k of p) { c = kid(c, k); if (c === undefined) return undefined; } return c; };
    const miss = (op, s) => new Error(`${op} operation does not apply: doc is missing path: "${s}"`);
    const add = (r, p, v, s, op) => {
      if (!p.length) return v;
      const par = get(r, p.slice(0, -1)), k = p[p.length - 1];
      if (Array.isArray(par)) { const n = k === '-' ? par.length : IDX.test(k) ? +k : -1; if (n < 0 || n > par.length) throw new Error(`${op} operation does not apply: index out of range: "${s}"`); par.splice(n, 0, v); }
      else if (isObj(par)) par[k] = v; else throw miss(op, s);
      return r;
    };
    const remove = (r, p, s, op) => {
      if (!p.length) throw new Error(`${op} operation does not apply: cannot remove the document root`);
      const par = get(r, p.slice(0, -1)), k = p[p.length - 1];
      if (Array.isArray(par) && IDX.test(k) && +k < par.length) par.splice(+k, 1);
      else if (isObj(par) && hasOwn(par, k)) delete par[k]; else throw miss(op, s);
      return r;
    };
    let r = clone(doc);
    ops.forEach((o, i) => {
      if (!isObj(o) || typeof o.op !== 'string') throw new Error(`operation ${i} is not an object with an "op" string`);
      const p = ptr(o.path, 'path'), needV = ['add', 'replace', 'test'].includes(o.op);
      if (needV && !hasOwn(o, 'value')) throw new Error(`${o.op} operation ${i} is missing "value"`);
      const v = needV ? clone(o.value === undefined ? null : o.value) : undefined;
      switch (o.op) {
        case 'add': r = add(r, p, v, o.path, 'add'); break;
        case 'remove': r = remove(r, p, o.path, 'remove'); break;
        case 'replace': if (get(r, p) === undefined) throw new Error(`replace operation does not apply: doc is missing key: "${o.path}"`); r = p.length ? (remove(r, p, o.path, 'replace'), add(r, p, v, o.path, 'replace')) : v; break;
        case 'test': if (!deepEq(get(r, p), v)) throw new Error(`testing value "${o.path}" failed: test failed`); break;
        case 'move': case 'copy': {
          const f = ptr(o.from, 'from'), fv = get(r, f);
          if (fv === undefined) throw new Error(`${o.op} operation does not apply: doc is missing from path: "${o.from}"`);
          if (o.op === 'move') { if (p.length > f.length && f.every((x, j) => x === p[j])) throw new Error(`move operation does not apply: "from" ${o.from} is a prefix of "path" ${o.path}`); r = remove(r, f, o.from, 'move'); r = add(r, p, fv, o.path, 'move'); }
          else r = add(r, p, clone(fv), o.path, 'copy');
          break;
        }
        default: throw new Error(`Unexpected kind: ${o.op}`);
      }
    });
    return r;
  }
  function statusObj(code, reason, message, extra) {
    return Object.assign({ kind: 'Status', apiVersion: 'v1', metadata: {}, status: 'Failure', message, reason, code }, extra || {});
  }
  function resNames(d) {
    const ops = endpoints.operations(d.a);
    const path = (ops.list || ops.create || ops.get || ops.replace || ops.patch || ops.delete)?.p;
    const plural = path?.split('/').filter(part => !part.startsWith('{')).pop() || d.a.kind.toLowerCase();
    return { plural, full: d.a.group ? plural + '.' + d.a.group : plural, ops };
  }
  const NAMEPH = ui('<이름>');
  const OPS = [['create', ui('생성 (POST)'), 'POST'], ['get', ui('조회 (GET)'), 'GET'], ['replace', ui('전체 교체 (PUT)'), 'PUT'], ['patch', ui('일부 수정 (PATCH)'), 'PATCH'], ['delete', ui('삭제 (DELETE)'), 'DELETE']];
  /* 작업별 문서 엔드포인트 유무: [op, 라벨, 문서에 있는지] */
  function opsOf(d) {
    const ops = endpoints.operations(d.a);
    return OPS.map(([op, label, m]) => [op, label, !!ops[op]]);
  }
  function k8sName(d, M) { const n = M.metadata && (M.metadata.name || M.metadata.generateName); return n || ''; }
  const errText = i => i.code === 'required' ? `${i.path}: Required value` : i.code === 'invalid' ? `${i.path}: Invalid value: "${i.val}": ${i.rule || 'invalid'}` : i.code === 'mismatch' ? `${i.path}: Invalid value` : `${i.path}: ${i.msg}`;
  function causes(issues) {
    return issues.filter(i => i.level === 'error').map(i => ({ reason: i.code === 'required' ? 'FieldValueRequired' : 'FieldValueInvalid', message: errText(i).replace(i.path + ': ', ''), field: i.path }));
  }
  /* 서버가 돌려줄 객체. ns: 요청 경로의 네임스페이스, op: generateName 은 create 에서만 적용 */
  function serverObject(M, d, sch, ns, op) {
    const o = clone(M); o.metadata = Object.assign({}, isObj(o.metadata) ? o.metadata : {});
    const nm = k8sName(d, M) || 'example';
    o.metadata.uid = uid(d.a.id + nm); o.metadata.resourceVersion = '482113'; o.metadata.generation = 1;
    o.metadata.creationTimestamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    if ((op || 'create') === 'create' && empty(o.metadata.name) && o.metadata.generateName) o.metadata.name = o.metadata.generateName + 'x7k2p';
    if (d.ns && empty(o.metadata.namespace)) o.metadata.namespace = ns || 'default';
    if (!d.ns) delete o.metadata.namespace;                               // 클러스터 범위: 서버가 namespace 를 지움
    if (sch.hasStatus && !o.status) o.status = {};
    return o;
  }
  /* 설명에서 추정한 무조건 기본값을 사용자가 넣은 객체 바로 아래의 빠진 스칼라에만 채움(status·metadata 제외). 반환 [{ path, v }] */
  const defMemo = new Map();
  const kidDef = k => { if (k.kind !== 'scalar') return null; const key = k.type + '\u0000' + k.desc; if (!defMemo.has(key)) defMemo.set(key, defaultFrom(k.desc, k.type)); const r = defMemo.get(key); return r && !r.cond ? r : null; };
  function applyDefaults(o, sch) {
    const out = [];
    const walk = (obj, sp, vp, depth) => {
      if (depth > 12 || !isObj(obj)) return;
      for (const kid of sch.children(sp)) {
        if (!depth && ['metadata', 'status', 'apiVersion', 'kind'].includes(kid.name)) continue;
        const v = hasOwn(obj, kid.name) ? obj[kid.name] : undefined, p = vp.concat(kid.name);
        if (kid.kind === 'scalar') { const d = v === undefined ? kidDef(kid) : null; if (d) { obj[kid.name] = d.v; out.push({ path: pstr(p), v: d.v }); } }
        else if (kid.kind === 'object') walk(v, kid.cpath, p, depth + 1);
        else if (kid.kind === 'array-object' && Array.isArray(v)) v.forEach((x, i) => walk(x, kid.cpath, p.concat(i), depth + 1));
        else if (kid.kind === 'map-object' && isObj(v)) Object.keys(v).forEach(k => walk(v[k], kid.cpath, p.concat(k), depth + 1));
      }
    };
    walk(o, '', [], 0); return out;
  }
  /* op: create|get|replace|patch|delete */
  function simulate(opt, M, a, d, sch, issues, docs) {
    // 네임스페이스: 입력창 값 > 매니페스트 metadata.namespace > default (입력창 표시값과 같은 규칙)
    const md = isObj(M.metadata) ? M.metadata : {}, strv = v => typeof v === 'string' ? v : '';
    const rn = resNames(d), ns = d.ns ? (strv(opt.ns) || strv(md.namespace) || 'default') : '', name = strv(opt.name) || strv(md.name) || NAMEPH;
    const ep = rn.ops[opt.op];
    if (!ep) return { supported: false, req: null, status: null, documented: [], note: ui('이 버전의 문서에는 해당 작업의 엔드포인트가 없습니다.') };
    if (ep.p.includes('{name}') && (name === NAMEPH || !name.trim())) {
      return { supported: true, req: null, status: null, documented: [],
        note: ui('요청 경로에 리소스 이름이 필요합니다. 이름 입력란에 대상 이름을 입력하세요.') };
    }
    const eNs = encodeURIComponent(ns), eName = name === NAMEPH ? name : encodeURIComponent(name);   // 경로 세그먼트는 URL 인코딩
    const fill = p => p.replace('{namespace}', () => eNs || 'default').replace('{name}', () => eName);
    const q = []; if (opt.dry === 'All' && opt.op !== 'get') q.push('dryRun=All');   // dryRun 은 쓰기 요청에만 적용한다.
    if (opt.op !== 'get' && opt.op !== 'delete') q.push('fieldValidation=' + encodeURIComponent(opt.fv));
    const method = OPS.find(([op]) => op === opt.op)[2];
    const path = fill(ep.p);
    const qs = q.length ? '?' + q.join('&') : '';
    const headers = ['Authorization: Bearer <token>', 'Accept: application/json'];
    let body = null, ctype = null;
    if (opt.op === 'create' || opt.op === 'replace') { ctype = 'application/json'; body = clone(M); if (opt.op === 'replace') { body.metadata = Object.assign({}, body.metadata, { resourceVersion: '482113' }); } }
    if (opt.op === 'patch') { ctype = opt.ptype; try { body = JSON.parse(bigQuote(opt.pbody || '{}')); if (!treeOK(body, 0)) body = null; } catch (e) { body = null; } }
    if (ctype) headers.splice(1, 0, 'Content-Type: ' + ctype);
    const req = { method, path: path + qs, headers, body };
    // 문서가 정의한 응답 코드
    const ms = ep && ep.ms.find(m => m.m === method);
    const documented = ms ? ms.r : [];
    let status = 200, body2 = null, warnings = [], note = '', defaults = [];
    const sc = opt.scn;
    const gr = a.group || '', resName = rn.full;
    const fail = (code, reason, msg, extra) => { status = code; body2 = statusObj(code, reason, msg, extra); };
    if (sc === 'unauth') fail(401, 'Unauthorized', 'Unauthorized');
    else if (sc === 'forbidden') fail(403, 'Forbidden', `${resName} is forbidden: User "system:serviceaccount:default:viewer" cannot ${({ create: 'create', get: 'get', replace: 'update', patch: 'patch', delete: 'delete' })[opt.op]} resource "${rn.plural}" in API group "${gr}"${d.ns ? ` in the namespace "${ns}"` : ' at the cluster scope'}`, { details: { group: gr, kind: rn.plural } });
    else {
      // 순서: create = 디코드 400 → 이름/네임스페이스 400 → 422 → 409 / replace = 디코드 400 → 이름/네임스페이스 400 → 404 → 409 → 422
      //       patch = 본문 400 → 404 → 409 → 패치 적용(실패 422) → 결과 디코드/이름/네임스페이스 400 → 422
      const kgr = a.kind + (gr ? '.' + gr : ''), hasName = name !== NAMEPH, det = { name, group: gr, kind: rn.plural };
      const notFound = () => fail(404, 'NotFound', `${resName} "${name}" not found`, { details: det });
      const conflict = () => fail(409, 'Conflict', `Operation cannot be fulfilled on ${resName} "${name}": the object has been modified; please apply your changes to the latest version and try again`, { details: det });
      // 서버에 이미 있는 객체(조회·패치 기준): 폼 매니페스트에 URL 의 이름·네임스페이스를 입힌 것
      const cur = clone(M); if (!isObj(cur.metadata)) cur.metadata = {};
      if (hasName) cur.metadata.name = name; if (d.ns) cur.metadata.namespace = ns;
      const decode400 = (obj, iss) => {
        const e = iss.filter(i => i.level === 'error'), mis = e.filter(i => i.code === 'mismatch'), ty = e.filter(i => i.code === 'type'), unk = iss.filter(i => i.code === 'unknown');
        if (mis.length) fail(400, 'BadRequest', `the API version in the data (${obj.apiVersion}) does not match the expected API version (${d.gv})`);
        else if (ty.length) { const te = ty[0], goT = ({ integer: 'int32', number: 'float64', boolean: 'bool', string: 'string', object: 'object', array: 'array' })[te.exp] || te.exp || 'value'; fail(400, 'BadRequest', `${a.kind} in version "${a.version}" cannot be handled as a ${a.kind}: json: cannot unmarshal ${te.act === 'boolean' ? 'bool' : (te.act || 'value')} into Go struct field ${a.kind}.${te.path} of type ${goT}`); }
        else if (unk.length && opt.fv === 'Strict') fail(400, 'BadRequest', `${unk.map(u => `strict decoding error: unknown field "${u.path}"`).join(', ')}`);
        else return false;
        return true;
      };
      const ident400 = obj => {   // URL 의 이름·네임스페이스와 본문이 맞는지(generateName 은 create 에서만 의미가 있음)
        const bm = isObj(obj.metadata) ? obj.metadata : {}, bn = strv(bm.name), bns = strv(bm.namespace);
        if (opt.op !== 'create' && !hasName && !bn) fail(422, 'Invalid', `${kgr} "" is invalid: metadata.name: Required value: name is required`, { details: { name: '', group: gr, kind: a.kind, causes: [{ reason: 'FieldValueRequired', message: 'Required value: name is required', field: 'metadata.name' }] } });
        else if (opt.op !== 'create' && bn !== name) fail(400, 'BadRequest', `the name of the object (${bn}) does not match the name on the URL (${name})`);
        else if (d.ns && bns && bns !== ns) fail(400, 'BadRequest', 'the namespace of the provided object does not match the namespace sent on the request');
        else return false;
        return true;
      };
      const invalid422 = iss => {
        const e = iss.filter(i => i.level === 'error'); if (!e.length) return false;
        fail(422, 'Invalid', `${kgr} "${name}" is invalid: ${e.length > 1 ? '[' : ''}${e.map(errText).join(', ')}${e.length > 1 ? ']' : ''}`, { details: { name, group: gr, kind: a.kind, causes: causes(iss) } });
        return true;
      };
      const ok = (obj, iss) => {
        status = opt.op === 'create' ? 201 : 200;
        body2 = serverObject(obj, d, sch, ns, opt.op);
        const unknown = iss.filter(i => i.code === 'unknown');
        for (const issue of unknown) delAt(body2, issue.segments);
        if (opt.fv === 'Warn') warnings = unknown.map(u => `unknown field "${u.path}"`);
        defaults = applyDefaults(body2, sch);
        if (opt.dry === 'All') note = ui('dryRun=All 이므로 서버가 검증만 하고 저장하지 않습니다(응답은 저장했다면 받을 내용과 같습니다).');
      };
      if (opt.op === 'get' || opt.op === 'delete') {
        if (sc === 'notfound') notFound();
        else if (opt.op === 'get') { status = 200; body2 = serverObject(cur, d, sch, ns, 'get'); }
        else { status = 200; body2 = { kind: 'Status', apiVersion: 'v1', metadata: {}, status: 'Success', details: { name, group: gr, kind: rn.plural, uid: uid(a.id + name) } }; if (opt.dry === 'All') note = ui('dryRun=All 이므로 서버가 삭제할 수 있는지만 확인하고 실제로 삭제하지 않습니다.'); }
      } else if (opt.op === 'create') {
        if (!decode400(M, issues) && !ident400(M) && !invalid422(issues)) { if (sc === 'conflict') fail(409, 'AlreadyExists', `${resName} "${name}" already exists`, { details: det }); else ok(M, issues); }
      } else if (opt.op === 'replace') {
        if (!decode400(M, issues) && !ident400(M)) { if (sc === 'notfound') notFound(); else if (sc === 'conflict') conflict(); else if (!invalid422(issues)) ok(M, issues); }
      } else {
        const JP = ctype === 'application/json-patch+json';
        if (!body) fail(400, 'BadRequest', 'the body of the request was in an unknown format - accepted media types include: application/json-patch+json, application/merge-patch+json, application/apply-patch+yaml');
        else if (JP && !Array.isArray(body)) fail(400, 'BadRequest', 'the body of the request was in an unknown format - json-patch body must be a JSON array of operations');
        else if (!JP && !isObj(body)) fail(400, 'BadRequest', `the body of the request was in an unknown format - ${PATCH_T[ctype] || 'merge'}-patch body must be a JSON object`);
        else if (sc === 'notfound') notFound();
        else if (sc === 'conflict') conflict();
        else {
          let target = null;
          try { target = JP ? jsonPatch(cur, body) : mergePatch(cur, body); } catch (e) { fail(422, 'Invalid', `the server rejected our request due to an error in our request: ${e.message}`, { details: det }); }
          if (!body2 && !isObj(target)) fail(422, 'Invalid', 'the server rejected our request due to an error in our request: patched result is not an object', { details: det });
          if (!body2) { const iss2 = validate(target, a, d, sch); if (!decode400(target, iss2) && !ident400(target) && !invalid422(iss2)) ok(target, iss2); }
          if (ctype === 'application/strategic-merge-patch+json' && status < 300) note = (note ? note + ' ' : '') + ui('strategic-merge-patch 는 merge-patch 로 근사했습니다(목록의 병합 키는 반영하지 않음).');
        }
      }
    }
    return { req, status, body: body2, warnings, note, documented, ns, name, defaults };
  }
  /* POSIX 셸 인용: 작은따옴표로 감싸고 ' 는 '\'' 로. 값은 절대 셸이 해석하지 못하고 데이터로만 쓰임 */
  const sq = s => "'" + String(s).replace(/\0/g, '').replace(/'/g, "'\\''") + "'";
  const shw = s => /^[A-Za-z0-9_.,:\/=@%+][A-Za-z0-9_.,:\/=@%+-]*$/.test(s) ? s : sq(s);   // 안전한 문자만이면 그대로, 아니면 인용
  const curl = r => {
    const parts = ['curl -sS -X ' + r.method];
    r.headers.forEach(h => parts.push(h === 'Authorization: Bearer <token>' ? '-H "Authorization: Bearer $TOKEN"' : '-H ' + sq(h)));
    if (r.body) parts.push('-d ' + sq(JSON.stringify(r.body)));
    parts.push('"$APISERVER"' + sq(r.path));
    return ui('# 사설 인증기관을 사용하는 경우 --cacert <CA 파일>을 추가하세요\n') + parts.join(' \\\n  ');
  };
  const PATCH_T = { 'application/merge-patch+json': 'merge', 'application/json-patch+json': 'json', 'application/strategic-merge-patch+json': 'strategic' };
  /* 같은 요청을 oc 로: body 를 주면 create/replace 는 표준 입력(-f -)으로 넘김. fieldValidation → --validate(create/replace 만) */
  function ocCmd(o, d, ns, name, body, requestPath) {
    const res = shw(d.low + (d.a.group ? '.' + d.a.group : '')), nsf = d.ns && ns ? ' -n ' + shw(ns) : '';
    const dash = String(name)[0] === '-', nm = dash ? '' : ' ' + shw(name), tail = dash ? ' -- ' + shw(name) : '';   // 이름이 '-' 로 시작하면 옵션으로 읽히지 않게 -- 뒤에 둠
    const dry = o.dry === 'All' && o.op !== 'get' ? ' --dry-run=server' : '', val = FVS.includes(o.fv) ? ' --validate=' + o.fv.toLowerCase() : '';
    const src = body != null ? `printf '%s\\n' ${sq(JSON.stringify(body))} | ` : '', file = body != null ? '-' : shw(d.low + '.yaml');
    if (requestPath && endpoints.operations(d.a)[o.op]?.p.includes('/{name}/')) {
      const raw = '--raw ' + sq(requestPath);
      if (o.op === 'get' || o.op === 'delete') return `oc ${o.op} ${raw}`;
      if (o.op === 'create' || o.op === 'replace') return `${src}oc ${o.op} ${raw} -f ${file}`;
      // oc patch has no --raw flag. The curl command above uses the exact PATCH endpoint.
      return ui('# 이 하위 리소스의 PATCH 요청은 위 curl 명령을 사용하세요.');
    }
    switch (o.op) {
      case 'create': return `${src}oc create -f ${file}${nsf}${dry}${val}`;
      case 'get': return `oc get ${res}${nm}${nsf} -o yaml${tail}`;
      case 'replace': return `${src}oc replace -f ${file}${nsf}${dry}${val}`;
      case 'patch': return `oc patch ${res}${nm}${nsf} --type=${PATCH_T[o.ptype] || 'merge'} -p ${sq(o.pbody == null ? '' : o.pbody)}${dry}${tail}`;
      default: return `oc delete ${res}${nm}${nsf}${dry}${tail}`;
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
  const privacyNote = ui('Secret, Route TLS 개인 키, TokenReview 토큰, 직접 입력한 패치 본문은 메모리에만 둡니다. 목록과 이전 적용 기록도 검사합니다.');
  const PREF = 'apibook.simulation.autosave';
  let draftDatabase;
  function openDraftDatabase() {
    if (!draftDatabase) draftDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open('apibook.simulator', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); draftDatabase = null; };
        scrubStoredDrafts(db).then(() => resolve(db), err => { db.close(); reject(err); });
      };
    }).catch(err => { draftDatabase = null; throw err; });
    return draftDatabase;
  }
  // Read, merge and replace inside one transaction shared by all tabs.
  async function draftTransaction(key, change) {
    const db = await openDraftDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite'), records = tx.objectStore('drafts');
      const cleared = records.get('@cleared');
      const request = records.get(key);
      let value, failure;
      request.onsuccess = () => {
        try { value = change(request.result, records, cleared.result); }
        catch (err) { failure = err; tx.abort(); }
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(failure || tx.error || new Error(ui('초안 저장 중단')));
    });
  }
  const migratedSecrets = new Map();
  function containsSecret(value) {
    const nodes = [value], seen = new WeakSet();
    while (nodes.length) {
      const node = nodes.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (node.kind === 'Secret' || node.kind === 'SecretList' || (node.kind === 'Route' && node.spec?.tls?.key) ||
          (node.kind === 'TokenReview' && node.spec?.token)) return true;
      if (Array.isArray(node.items) && (
        (node.kind === 'RouteList' && node.items.some(it => it?.spec?.tls?.key)) ||
        (node.kind === 'TokenReviewList' && node.items.some(it => it?.spec?.token))
      )) return true;
      const applied = node.metadata?.annotations?.['kubectl.kubernetes.io/last-applied-configuration'];
      if (typeof applied === 'string' && applied.trim()) {
        try {
          const snapshot = JSON.parse(applied);
          if (!isObj(snapshot)) return true;
          nodes.push(snapshot);
        } catch { return true; }
      }
      for (const child of Object.values(node)) if (child && typeof child === 'object') nodes.push(child);
    }
    return false;
  }
  const sensitiveDraft = it => it?.id === 'secret-v1' || containsSecret(it?.M) ||
    (typeof it?.opt?.pbody === 'string' && it.opt.pbody !== defaultOpt().pbody && it.opt.pbody.trim() !== '');
  function persistentDrafts(store) {
    const items = store.items.filter(it => it && !sensitiveDraft(it));
    return { items, active: Math.max(0, items.indexOf(store.items[store.active])) };
  }
  function keepInMemory(key, drafts) {
    migratedSecrets.set(key, (migratedSecrets.get(key) || []).concat(drafts));
  }
  function scrubStoredDrafts(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite'), recovered = new Map();
      const scan = tx.objectStore('drafts').openCursor();
      scan.onsuccess = () => {
        const cursor = scan.result;
        if (!cursor) return;
        const old = cursor.value;
        if (Array.isArray(old?.items)) {
          const privateItems = old.items.filter(sensitiveDraft);
          if (privateItems.length) {
            cursor.update(persistentDrafts(old));
            recovered.set(cursor.key, privateItems);
          }
        }
        cursor.continue();
      };
      tx.oncomplete = () => {
        recovered.forEach((drafts, key) => keepInMemory(key, drafts));
        resolve();
      };
      tx.onabort = () => reject(tx.error || new Error(ui('기존 초안을 정리하지 못했습니다.')));
    });
  }
  function cleanDrafts(storage, clear) {
    if (clear) migratedSecrets.clear();
    for (const key of Object.keys(storage).filter(k => k.startsWith(LSKEY))) {
      if (clear) { storage.removeItem(key); continue; }
      let old;
      try { old = JSON.parse(storage.getItem(key)); } catch { continue; }
      if (!Array.isArray(old?.items)) continue;
      const secrets = old.items.filter(sensitiveDraft);
      if (secrets.length) {
        storage.setItem(key, JSON.stringify(persistentDrafts(old)));
        keepInMemory(key, secrets);
      }
    }
  }
  function manifestDocuments(text) {
    if (typeof text !== 'string' || text.length > MAX_INPUT) throw new Error(ui('YAML 문자열을 입력하세요 (최대 ') + (MAX_INPUT >> 20) + 'MB)');
    const entries = [];
    for (const part of text.replace(/^\uFEFF/, '').split(/^(?:---|\.\.\.)[ \t]*(?:#[^\n]*)?\r?$/m)) {
      if (!part.split('\n').some(line => line.trim() && !line.trimStart().startsWith('#'))) continue;
      const warnings = [];
      try {
        for (const M of yamlParse(part, warnings)) entries.push({ M, warnings });
      } catch (e) {
        entries.push({ parseError: e.message, warnings });
      }
    }
    if (!entries.length) throw new Error(ui('검증할 문서가 없습니다'));
    return entries;
  }
  function checkDocument(entry, docs, schemaOf) {
    if (entry.parseError) return { issues: [{ level: 'error', path: 'YAML', msg: entry.parseError, code: 'parse' }] };
    const M = entry.M;
    if (!isObj(M)) return { issues: [{ level: 'error', path: '', msg: ui('리소스 객체가 필요합니다') }] };
    const d = docs.find(d => d.a.kind === M.kind && d.gv === M.apiVersion);
    if (!d) return { issues: [{ level: 'error', path: 'apiVersion/kind', msg: ui('이 릴리스의 API와 일치하지 않습니다') }] };
    return { id: d.a.id, issues: validate(M, d.a, d, schemaOf(d.a.id)) };
  }
  function assessDocuments(entries, docs, schemaOf) {
    return entries.map((entry, i) => {
      const { id, issues } = checkDocument(entry, docs, schemaOf);
      return { document: i + 1, id, kind: typeof entry.M?.kind === 'string' ? entry.M.kind : undefined,
        apiVersion: typeof entry.M?.apiVersion === 'string' ? entry.M.apiVersion : undefined,
        warnings: entry.warnings, valid: !issues.some(x => x.level === 'error'),
        issues: issues.map(({ level, path, msg, code }) => ({ level, path, msg, code })) };
    });
  }
  function upgradeImpact(before, after) {
    const key = x => JSON.stringify([x.level, x.path, x.code, x.msg]);
    const difference = (left, right) => {
      const known = new Set(right.map(key));
      return left.filter(x => !known.has(key(x)));
    };
    return before.map((old, i) => {
      const next = after[i], previous = new Set(old.issues.map(key));
      return { document: old.document, kind: old.kind, apiVersion: old.apiVersion, warnings: old.warnings,
        fromValid: old.valid, toValid: next.valid, introduced: difference(next.issues, old.issues),
        resolved: difference(old.issues, next.issues), remaining: next.issues.filter(x => previous.has(key(x))) };
    });
  }
  /* localStorage 값을 검증해 복원. JSON 으로는 유효하지만 형식이 다르면 빈 상태 */
  function restoreStore(raw, docOf) {
    const empty0 = { items: [], active: 0 };
    let s; try { s = typeof raw === 'string' ? JSON.parse(raw) : null; } catch (e) { return empty0; }
    if (!isObj(s) || !Array.isArray(s.items)) return empty0;
    const items = [], want = Number.isInteger(s.active) ? s.active : 0;
    let act = 0;
    s.items.forEach((it, j) => {
      if (j === want) act = items.length;   // 활성 항목의 새 위치(그 항목이 빠지면 다음에 남는 항목)
      if (!isObj(it) || typeof it.id !== 'string' || !isObj(it.M) || !treeOK(it.M, 0)) return;
      let dd = null; try { dd = docOf(it.id); } catch (e) { /* 무시 */ }
      if (!dd) return;
      items.push({ id: it.id, M: it.M, opt: cleanOpt(it.opt),
        uid: typeof it.uid === 'string' ? it.uid : 'legacy:' + JSON.stringify([it.id, it.M.metadata?.namespace, it.M.metadata?.name, j]),
        ...(it.conflict ? { conflict: true } : {}) });
    });
    if (want >= s.items.length) act = items.length - 1;
    return { items, active: Math.max(0, Math.min(act, items.length - 1)) };
  }
  const draftName = it => it.M.metadata?.name && JSON.stringify([it.id, it.M.metadata.namespace || '', it.M.metadata.name]);
  function sameValue(a, b) {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => hasOwn(b, k) && sameValue(a[k], b[k]));
  }
  const sameDraft = (a, b) => a.id === b.id && sameValue(a.M, b.M) && sameValue(a.opt, b.opt);
  function mergeLegacyDrafts(existing, legacy) {
    if (!existing.items.length) return legacy;
    const items = existing.items.slice(), unmatched = new Set(items);
    for (const draft of legacy.items) {
      const match = [...unmatched].find(it => sameDraft(it, draft));
      if (match) { unmatched.delete(match); continue; }
      const uidTaken = items.some(it => it.uid === draft.uid);
      const name = draftName(draft);
      if (uidTaken || (name && items.some(it => draftName(it) === name))) {
        items.push({ ...draft, uid: uidTaken ? crypto.randomUUID() : draft.uid, conflict: true });
      } else items.push(draft);
    }
    return { items, active: existing.active };
  }
  function mergeDrafts(base, local, latest) {
    const byId = new Map(base.items.map(it => [it.uid, it]));
    const current = new Set(local.items.map(it => it.uid));
    const items = latest.items.slice(), aliases = new Map();
    let conflict = false;
    for (const old of base.items) {
      if (current.has(old.uid)) continue;
      const i = items.findIndex(it => it.uid === old.uid);
      if (i >= 0 && sameDraft(items[i], old)) items.splice(i, 1);
      else if (i >= 0) conflict = true;
    }
    for (const draft of local.items) {
      const old = byId.get(draft.uid);
      if (old && sameDraft(old, draft)) continue;
      let i = items.findIndex(it => it.uid === draft.uid);
      if (i < 0 && !old && draftName(draft)) i = items.findIndex(it => !it.conflict && draftName(it) === draftName(draft));
      if (i < 0) {
        items.push(draft);
        if (old) conflict = true; // 다른 탭의 삭제와 이 탭의 수정이 겹쳤다.
      } else if (sameDraft(items[i], draft)) {
        if (items[i].uid !== draft.uid) aliases.set(draft.uid, { uid: items[i].uid });
      } else if (old && sameDraft(items[i], old)) {
        items[i] = draft;
      } else {
        // 다른 탭은 원본을 계속 편집한다. 이 탭의 후속 입력은 새 보관본만 갱신한다.
        const fork = { uid: items[i].uid === draft.uid ? crypto.randomUUID() : draft.uid, conflict: true };
        aliases.set(draft.uid, fork);
        items.push({ ...draft, ...fork });
        conflict = true;
      }
    }
    const selected = local.items[local.active]?.uid;
    const active = items.findIndex(it => it.uid === (aliases.get(selected)?.uid || selected));
    return { snapshot: { items, active: Math.max(0, active) }, conflict, aliases };
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
    let canCoordinate = false;
    try { canCoordinate = !!(globalThis.indexedDB && globalThis.crypto?.randomUUID); }
    catch { /* 브라우저 정책이 저장소 접근 자체를 차단해도 편집기는 사용할 수 있다. */ }
    const memoryOnly = ui('탭 간 저장을 조정할 수 없어 메모리에서만 편집합니다. 로컬 파일 또는 localhost에서 열어 주세요.');
    let autoSave = false, storageError = '';
    try {
      autoSave = canCoordinate && localStorage.getItem(PREF) !== 'off';
      const key = LSKEY + ver;
      const raw = localStorage.getItem(key);
      const migrated = migratedSecrets.get(key) || [];
      cleanDrafts(localStorage, false);
      const saved = restoreStore(raw, C.docOf);
      const memory = restoreStore(JSON.stringify({ items: migrated }), C.docOf);
      store.items = saved.items.concat(memory.items); store.active = saved.active;
      migratedSecrets.delete(key); } catch { storageError = ui('브라우저 저장소를 사용할 수 없습니다.'); }
    let dead = false, tab = 'yaml', busy = false;
    const schemas = new Map(), loaded = new Set();   // loaded: ensureFields 가 끝난 id (그 전에는 스키마를 캐시하지 않음)
    let baseline = clone(persistentDrafts(store));
    const key = LSKEY + ver;
    let generation = 0, lastClear;
    const aliases = new Map();
    function remap(snapshot) {
      for (const draft of snapshot.items) {
        const alias = aliases.get(draft.uid);
        if (alias) Object.assign(draft, alias);
      }
    }
    let writes = Promise.resolve();
    const save = () => {
      const note = host.querySelector('#storage-note');
      if (!autoSave) return;
      for (const draft of store.items) draft.uid ||= crypto.randomUUID();
      const local = clone(persistentDrafts(store)), epoch = generation;
      writes = writes.then(async () => {
        if (epoch !== generation || localStorage.getItem(PREF) === 'off') return;
        remap(local);
        const merged = await draftTransaction(key, (saved, records, cleared) => {
          if (cleared !== lastClear || epoch !== generation || localStorage.getItem(PREF) === 'off') return;
          const disk = persistentDrafts(saved || { items: [], active: 0 });
          const result = mergeDrafts(baseline, local, disk);
          records.put(result.snapshot, key);
          return result;
        });
        if (!merged || epoch !== generation) return;
        for (const [id, alias] of merged.aliases) aliases.set(id, alias);
        remap(local);
        remap(store);
        if (merged.aliases.size && !dead) rememberTab();
        baseline = local;
        if (merged.conflict) note.textContent = ui('다른 탭의 변경을 감지했습니다. 저장된 두 편집본은 새로고침 후 확인할 수 있습니다. 삭제와 수정이 겹치면 수정본을 유지합니다.');
      }).catch(() => { note.textContent = ui('저장하지 못했습니다. 편집 내용은 이 화면에 있습니다.'); });
    };
    const item = () => store.items[store.active];
    const docOf = id => C.docOf(id);
    const schemaOf = id => {
      if (schemas.has(id)) return schemas.get(id);
      const s = makeSchema(docOf(id).a, (C.fields() || {})[id] || []);   // 항상 C.fields() 의 현재 객체를 읽는다
      if (loaded.has(id)) schemas.set(id, s);
      return s;
    };
    const ensure = id => Promise.resolve(C.ensureFields(id)).then(() => { loaded.add(id); });

    host.innerHTML = ui`<div class="sim">
      <h2 class="d-title" style="font-family:var(--sans);font-size:22px">API 설계 시뮬레이터 <span class="gv">${esc(ver)}</span></h2>
      <p class="note" style="margin:0 0 10px">리소스를 설계하면 YAML이 만들어지고, 스펙(필수 값·타입·알 수 없는 필드)으로 검증합니다. 요청을 보냈을 때 서버가 어떻게 응답할지도 가상으로 확인합니다. 실제 클러스터에는 아무것도 전송하지 않습니다.</p>
      <div class="sbar"><label class="chk"><input type="checkbox" id="autosave"> 이 브라우저에 초안 자동 저장</label>
        <button class="btn ghost" id="clear-drafts">모든 버전의 저장본 지우기</button></div>
      <p class="note" id="storage-note" role="status">${privacyNote}</p>
      <p class="note" id="draft-status" role="status"></p><div id="import-report" aria-live="polite"></div>
      <div class="rtabs" id="rtabs"></div>
      <div class="note" id="loaderr" role="status" style="margin:0 0 6px;min-height:0" hidden></div>
      <div class="addres"><input class="tfind" id="addq" placeholder="＋ 리소스 추가 (예: route, service, networkpolicy)" autocomplete="off" aria-label="리소스 추가"><div class="addlist" id="addlist" hidden></div></div>
      <div class="related" id="related"></div>
      <div class="simgrid"><section class="simform" id="sform"><p class="note">스키마를 불러오는 중…</p></section>
      <section class="simout"><div class="tabs" role="tablist" aria-label="출력" id="otabs"><button role="tab" id="sim-ot-yaml" data-t="yaml" aria-controls="obody" aria-selected="true" tabindex="0">YAML</button><button role="tab" id="sim-ot-check" data-t="check" aria-controls="obody" aria-selected="false" tabindex="-1">검증 <span id="cbadge"></span></button><button role="tab" id="sim-ot-req" data-t="req" aria-controls="obody" aria-selected="false" tabindex="-1">요청·응답</button></div><div id="obody" role="tabpanel" aria-labelledby="sim-ot-yaml" tabindex="0"></div></section></div></div>`;
    const $ = s => host.querySelector(s);

    const autosave = $('#autosave');
    autosave.disabled = !canCoordinate;
    autosave.checked = autoSave;
    if (storageError || !autoSave) $('#storage-note').textContent = storageError || (canCoordinate ? ui('자동 저장이 꺼져 있습니다. 편집 내용은 메모리에만 유지됩니다.') : memoryOnly);
    async function setAutoSave(on, erase = false) {
      generation++;
      autoSave = on; autosave.checked = on;
      try {
        localStorage.setItem(PREF, on ? 'on' : 'off');
        if (erase) {
          cleanDrafts(localStorage, true);
          const marker = crypto.getRandomValues(new Uint32Array(2)).join('-');
          if (globalThis.indexedDB) await draftTransaction(key, (_, records) => {
            records.clear();
            records.put(marker, '@cleared');
          });
          lastClear = marker;
          baseline = { items: [], active: 0 };
          localStorage.setItem(PREF + '.cleared', marker);
        }
        $('#storage-note').textContent = on ? privacyNote : (erase ? ui('모든 버전의 저장본을 지웠습니다. ') : '') + ui('이후 편집 내용은 메모리에만 유지됩니다.');
        if (on) save();
      } catch { $('#storage-note').textContent = ui('브라우저 저장소 변경에 실패했습니다.'); }
    }
    const syncPreference = e => {
      if (e.key === PREF + '.cleared') { generation++; lastClear = e.newValue; baseline = { items: [], active: 0 }; }
      if (e.key !== PREF) return;
      generation++;
      autoSave = canCoordinate && e.newValue !== 'off'; autosave.checked = autoSave;
      $('#storage-note').textContent = autoSave ? privacyNote : ui('자동 저장이 꺼져 있습니다.');
    };
    window.addEventListener('storage', syncPreference);
    autosave.onchange = () => setAutoSave(autosave.checked);
    $('#clear-drafts').onclick = () => setAutoSave(false, true);
    /* ---- 리소스 추가 / 탭 ---- */
    function newItem(id) {
      const d = docOf(id), a = d.a, M = { apiVersion: d.gv, kind: a.kind, ...(needsName(a) ? { metadata: { name: 'my-' + a.kind.toLowerCase().slice(0, 30) } } : {}) };
      if (d.ns && M.metadata) M.metadata.namespace = 'default';
      const it = { id, M, opt: defaultOpt() };
      ensureRequired(M, [], '', schemaOf(id), 0);
      return it;
    }
    function addItem(id, quiet) {   // 필드 파일이 이미 로드된 id 만 호출할 것
      if (!loaded.has(id)) return;
      if (!docOf(id)) return;
      const ex = store.items.findIndex(i => i.id === id);
      if (ex >= 0) store.active = ex; else { store.items.push(newItem(id)); store.active = store.items.length - 1; }
      save(); if (!quiet) { renderTabs(); renderForm(); renderOut(); }
    }
    function setBusy(b, msg) {
      busy = b; const le = $('#loaderr'); le.style.color = ''; le.hidden = !msg; le.textContent = msg || '';
      aq.disabled = b; host.querySelectorAll('#related .chip, #addlist .ai').forEach(x => { x.disabled = b; });
    }
    async function addItemAsync(id) {   // 필드 로드 후에 추가. 실패하면 폼 위쪽에 오류 한 줄
      if (busy || !docOf(id) || dead) return;
      if (!loaded.has(id)) {
        setBusy(true, ui('불러오는 중…'));
        try { await ensure(id); } catch (e) { if (dead) return; setBusy(false); const le = $('#loaderr'); le.hidden = false; le.style.color = 'var(--bad)'; le.textContent = ui('스키마 데이터를 불러오지 못했습니다: ') + (e && e.message || e); return; }
        if (dead) return; setBusy(false);
      }
      addItem(id);
    }
    function rememberTab() {
      const draft = item();
      if (!draft) return;
      const state = draft.uid && !sensitiveDraft(draft) ? { draftUid: draft.uid } : null;
      try { history.replaceState(state, '', C.hash('sim:' + draft.id)); } catch {}
    }
    function renderTabs() {
      rememberTab();
      const rt = $('#rtabs'); rt.innerHTML = '';
      if (!store.items.length) rt.appendChild(el('span', { class: 'note', text: ui('아래 입력창에서 리소스를 추가하세요.') }));
      store.items.forEach((it, i) => {
        const a = docOf(it.id).a;
        rt.appendChild(el('span', { class: 'rtab' + (i === store.active ? ' on' : '') }, [
          el('button', { class: 'rt', text: store.items.filter(other => other.id === it.id).length > 1 ? a.kind + ' · ' + ([it.M.metadata?.namespace, it.M.metadata?.name || (i + 1)].filter(Boolean).join('/')) + (it.conflict ? ui(' (충돌 보관본)') : '') : a.kind, title: docOf(it.id).gv, onclick: () => { store.active = i; save(); renderTabs(); renderForm(); renderOut(); } }),
          el('button', { class: 'rx', text: '×', 'aria-label': a.kind + ui(' 닫기'), onclick: () => { closeTab(store, i); save(); renderTabs(); renderForm(); renderOut(); } }),
        ]));
      });
      const rel = $('#related'); rel.innerHTML = '';
      if (item() && C.G && C.G.adj.has(item().id)) {
        const seen = new Set(store.items.map(i => i.id)), ids = [];
        for (const e of C.G.adj.get(item().id)) { if (e.type === 'same' || e.type === 'variant') continue; const o = e.s === item().id ? e.t : e.s; if (!seen.has(o) && !ids.includes(o)) ids.push(o); }
        if (ids.length) { rel.appendChild(el('span', { class: 'note', text: ui('연결된 API 추가:') })); ids.slice(0, 8).forEach(o => rel.appendChild(el('button', { class: 'chip', text: '+ ' + C.G.byId.get(o).kind, onclick: () => addItemAsync(o) }))); }
      }
    }
    const aq = $('#addq'), al = $('#addlist');
    aq.addEventListener('input', () => {
      const q = aq.value.trim(); al.innerHTML = ''; if (!q) { al.hidden = true; return; }
      const r = C.E.search(q).apis.slice(0, 8); al.hidden = !r.length;
      r.forEach(x => al.appendChild(el('button', { class: 'ai', onclick: () => { aq.value = ''; al.hidden = true; addItemAsync(x.d.a.id); } }, [el('b', { text: x.d.a.kind }), el('span', { class: 'gv', text: ' ' + x.d.gv })])));
    });
    aq.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = al.querySelector('.ai'); if (b) b.click(); } else if (e.key === 'Escape') { al.hidden = true; } });

    /* ---- 폼 ---- */
    function refreshOut() { renderOut(); save(); }
    let seq = 0; const nid = p => `sim-${p}-${++seq}`;   // 설명/오류 요소 id(경로에는 공백 등이 있을 수 있어 카운터 사용)
    /* 다시 그릴 때 키보드 포커스 유지: 포커스된 컨트롤의 필드(data-vp)와 그 필드 안에서의 위치를 기억했다가 복원 */
    const ownCtl = w => [...w.querySelectorAll('input,select,textarea,button')].filter(x => x.closest('.sf') === w && !x.disabled);
    function focusKey() {
      const a = document.activeElement, f = $('#sform'); if (!a || !f || !f.contains(a)) return null;
      const w = a.closest('.sf[data-vp]');
      if (w) { const c = ownCtl(w); return { vp: w.dataset.vp, i: c.indexOf(a), tag: a.tagName, cls: a.className }; }
      const bar = a.closest('.sbar'); return bar && bar === f.querySelector('.sbar') ? { bar: [...bar.querySelectorAll('button,a')].indexOf(a) } : null;
    }
    function refocus(k) {
      if (!k) return; let t = null;
      if (k.vp !== undefined) {
        const w = host.querySelector(`.sf[data-vp="${CSS.escape(k.vp)}"]`); if (!w) return;
        const c = ownCtl(w);
        t =(c[k.i] && c[k.i].tagName === k.tag ? c[k.i] : null) || c.find(x => x.tagName === k.tag && x.className === k.cls) || c[Math.min(Math.max(k.i, 0), c.length - 1)] || null;
      } else { const bar = $('#sform .sbar'); t = bar && bar.querySelectorAll('button,a')[k.bar]; }
      if (t) t.focus({ preventScroll: true });
    }
    /* 항목/키 추가 뒤: 해당 필드의 마지막 입력(새 항목)으로 포커스 */
    function focusLast(vp) {
      const w = host.querySelector(`.sf[data-vp="${CSS.escape(pstr(vp))}"]`), b = w && w.querySelector(':scope > .sfb'); if (!b) return;
      const rows = b.querySelectorAll(':scope > .sitem, :scope > .kv'), r = rows[rows.length - 1];
      const t = r && (r.querySelector('input:not([type="checkbox"]):not([disabled]),select:not([disabled]),textarea') || r.querySelector('button')); if (t) t.focus();
    }
    function renderForm() {
      const fk = focusKey(); try { renderForm0(); } finally { refocus(fk); }
    }
    function renderForm0() {
      const f = $('#sform'); f.innerHTML = '';
      const it = item(); if (!it) { f.appendChild(el('div', { class: 'empty', text: ui('리소스를 추가하면 설계 폼이 나타납니다.') })); return; }
      const d = docOf(it.id), a = d.a, sch = schemaOf(it.id), M = it.M;
      const bar = el('div', { class: 'sbar' }, [
        el('button', { class: 'btn ghost', text: ui('필수 값 예시로 채우기'), onclick: () => { sampleFill(M, [], '', sch, 0); if (needsName(a) && isObj(M.metadata) && empty(M.metadata.name) && empty(M.metadata.generateName)) M.metadata.name = 'example'; renderForm(); refreshOut(); } }),
        el('button', { class: 'btn ghost', text: ui('YAML 가져오기'), onclick: () => toggleImport() }),
        el('button', { class: 'btn ghost', text: ui('폼 값 초기화'), title: ui('요청 설정은 유지됩니다.'), onclick: () => { store.items[store.active] = Object.assign(newItem(it.id), { opt: it.opt, uid: it.uid, ...(it.conflict ? { conflict: true } : {}) }); save(); renderForm(); renderOut(); } }),
        el('a', { class: 'btn ghost', href: C.hash('api:' + it.id), text: ui('스펙 보기') }),
      ]);
      f.appendChild(bar);
      const imp = el('div', { class: 'import', id: 'imp', hidden: true }, [
        el('textarea', { id: 'imptxt', 'aria-label': ui('가져올 YAML 또는 JSON'), rows: 8, placeholder: ui('YAML 또는 JSON을 붙여 넣으세요. 여러 문서는 ---로 구분하세요. 각 문서를 해당 API로 검증합니다.'), spellcheck: 'false' }),
        el('div', { class: 'sbar' }, [el('button', { class: 'btn', text: ui('폼에 적용'), onclick: doImport }), el('span', { id: 'imperr', class: 'note', style: 'margin:0;color:var(--bad)' })]),
      ]);
      f.appendChild(imp);
      f.appendChild(el('div', { class: 'sfix' }, [fixed('apiVersion', M.apiVersion), fixed('kind', M.kind)]));
      const root = el('div', { class: 'sroot', id: 'sroot' });
      root.appendChild(metaField(M, needsName(a)));
      renderKids(root, '', [], sch, M, 0);
      f.appendChild(root);
      markIssues();
    }
    function fixed(k, v) { return el('div', { class: 'sf fixedf' }, [el('div', { class: 'sfh' }, [el('span', { class: 'sfn', text: k }), el('span', { class: 'ftp', text: ui('고정') }), el('code', { class: 'fv', text: v })])]); }
    function metaField(M, required) {
      const wrap = el('div', { class: 'sf', 'data-vp': 'metadata' });
      wrap.appendChild(el('div', { class: 'sfh' }, [el('span', { class: 'sfn', text: 'metadata' }), el('span', { class: 'ftp', text: 'ObjectMeta' }), required && el('span', { class: 'req', text: ui('필수') })]));
      const body = el('div', { class: 'sfb' }); wrap.appendChild(body);
      META.forEach(kid => renderField(body, required ? kid : { ...kid, required: false }, ['metadata', kid.name], null, M, 1, true));
      return wrap;
    }
    function renderKids(container, sp, vp, sch, M, depth) {
      sch.children(sp).forEach(kid => { if (kid.kind === 'meta') return; renderField(container, kid, vp.concat(kid.name), sch, M, depth, false); });
    }
    function renderField(container, kid, vp, sch, M, depth, isMeta) {
      const present = hasAt(M, vp);
      const wrap = el('div', { class: 'sf' + (present ? '' : ' off'), 'data-vp': pstr(vp) });
      const chk = el('input', { type: 'checkbox', class: 'sfc', 'aria-label': kid.name + ui(' 포함'), checked: present, disabled: kid.required && (!isMeta || present) });
      const head = el('div', { class: 'sfh' }, [chk, el('span', { class: 'sfn', text: kid.name }), el('span', { class: 'ftp', text: kid.type })]);
      if (kid.required && !(isMeta && kid.name !== 'name')) head.appendChild(el('span', { class: 'req', text: ui('필수') }));
      const kd = !isMeta && kidDef(kid); if (kd) head.appendChild(el('span', { class: 'fdef', text: ui('기본 ') + JSON.stringify(kd.v), title: ui('설명 문장에서 추정한 서버 기본값(생략하면 서버가 채울 것으로 보임)') }));
      const did = kid.desc ? nid('d') : null;
      if (kid.desc) head.appendChild(el('button', { class: 'sfi', type: 'button', text: 'ⓘ', title: ui('설명 보기'), 'aria-label': kid.name + ui(' 설명'), 'aria-expanded': 'false', 'aria-controls': did, onclick: e => { const dd = wrap.querySelector(':scope > .sfd'); dd.hidden = !dd.hidden; e.currentTarget.setAttribute('aria-expanded', String(!dd.hidden)); } }));
      wrap.appendChild(head);
      if (kid.desc) wrap.appendChild(el('div', { class: 'sfd', id: did, hidden: true, text: kid.desc }));
      const err = el('div', { class: 'sfe', id: nid('e'), hidden: true }); wrap.appendChild(err);
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
          inp = el('input', { class: 'sin', type: num ? 'number' : 'text', step: kid.st === 'integer' ? '1' : 'any', value: v == null ? '' : String(v), list: lid, placeholder: en ? en.join(' / ') : (kid.st === 'string' ? ui('문자열') : kid.st), 'aria-label': kid.name, spellcheck: 'false' });
          inp.addEventListener('input', () => { const s = inp.value; set(num ? (s === '' ? null : Number(s)) : (kid.sub === 'intorstring' && /^\d{1,15}$/.test(s) ? Number(s) : s)); });
          if (en) { const dl = el('datalist', { id: lid }, en.map(x => el('option', { value: x }))); body.appendChild(dl); }
        }
        body.appendChild(inp);
      } else if (kid.kind === 'object') {
        renderKids(body, kid.cpath, vp, sch, M, depth + 1);
      } else if (kid.kind === 'array-object') {
        const arr = Array.isArray(v) ? v : [];
        arr.forEach((_, i) => {
          const card = el('div', { class: 'sitem' }, [el('div', { class: 'sih' }, [el('b', { text: ui`항목 ${i + 1}` }), el('button', { class: 'rx', text: ui('삭제'), onclick: () => { arr.splice(i, 1); renderForm(); refreshOut(); } })])]);
          renderKids(card, kid.cpath, vp.concat(i), sch, M, depth + 1); body.appendChild(card);
        });
        body.appendChild(el('button', { class: 'btn ghost', text: ui('＋ 항목 추가'), onclick: () => { arr.push({}); ensureRequired(M, vp.concat(arr.length - 1), kid.cpath, sch, 0); renderForm(); refreshOut(); focusLast(vp); } }));
      } else if (kid.kind === 'array-scalar') {   // 항목마다 입력 하나(쉼표가 든 값도 그대로)
        const num = /^(integer|number)$/.test(kid.st), arr = Array.isArray(v) ? v : [];
        const attach = () => { if (getAt(M, vp) !== arr) setAt(M, vp, arr); };
        const conv = s => num ? (s.trim() === '' ? null : isNaN(Number(s)) ? s : Number(s)) : kid.st === 'boolean' ? s.trim() === 'true' : s;
        arr.forEach((x, i) => {
          const inp = el('input', { class: 'sin', type: 'text', value: x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x), placeholder: kid.st === 'string' ? ui('문자열') : kid.st, 'aria-label': ui`${kid.name} 항목 ${i + 1}`, spellcheck: 'false' });
          inp.addEventListener('input', () => { attach(); arr[i] = conv(inp.value); refreshOut(); });
          body.appendChild(el('div', { class: 'kv kv1' }, [inp, el('button', { class: 'rx', type: 'button', text: '×', 'aria-label': ui`${kid.name} 항목 ${i + 1} 삭제`, onclick: () => { attach(); arr.splice(i, 1); renderForm(); refreshOut(); } })]));
        });
        body.appendChild(el('button', { class: 'btn ghost', type: 'button', text: ui('＋ 항목 추가'), onclick: () => { attach(); arr.push(num ? null : kid.st === 'boolean' ? false : ''); renderForm(); refreshOut(); focusLast(vp); } }));
      } else if (kid.kind === 'map') {
        const o = isObj(v) ? v : {}, num = /^(integer|number)$/.test(kid.st);
        const attach = () => { if (getAt(M, vp) !== o) setAt(M, vp, o); };
        Object.keys(o).forEach(k => {
          const kin = el('input', { class: 'sin k', value: k, 'aria-label': ui('키'), spellcheck: 'false' }), vin = el('input', { class: 'sin', value: o[k] == null ? '' : String(o[k]), 'aria-label': ui('값'), spellcheck: 'false' });
          let curK = k;
          kin.addEventListener('change', () => {   // 다시 그리지 않고 제자리에서 키 이름 변경(순서 유지) → 포커스 유지
            const nk = kin.value; if (nk === curK || !nk || DANGEROUS.has(nk) || hasOwn(o, nk)) { kin.value = curK; return; }
            attach(); const ent = Object.entries(o); for (const [kk] of ent) delete o[kk]; for (const [kk, vv] of ent) o[kk === curK ? nk : kk] = vv;
            curK = nk; refreshOut();
          });
          vin.addEventListener('input', () => { attach(); o[curK] = num ? (vin.value === '' ? null : Number(vin.value)) : vin.value; refreshOut(); });
          body.appendChild(el('div', { class: 'kv' }, [kin, vin, el('button', { class: 'rx', type: 'button', text: '×', 'aria-label': ui('삭제'), onclick: () => { attach(); delete o[curK]; renderForm(); refreshOut(); } })]));
        });
        body.appendChild(el('button', { class: 'btn ghost', type: 'button', text: ui('＋ 키 추가'), onclick: () => { attach(); let n = 'key', i = 1; while (hasOwn(o, n)) n = 'key' + (++i); o[n] = num ? 0 : ''; renderForm(); refreshOut(); focusLast(vp); } }));
      } else {
        const ta = el('textarea', { class: 'sin', rows: 3, spellcheck: 'false', 'aria-label': kid.name, placeholder: ui('자유 형식 JSON 또는 YAML') }); ta.value = (isObj(v) && !Object.keys(v).length) ? '' : (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
        ta.addEventListener('change', () => {   // 값 하나로 해석(배열 [1,2] / [] 도 그대로)
          const w = []; let pv;
          try { pv = parseValue(ta.value, w); } catch (e) { ta.classList.add('bad'); ta.setAttribute('aria-invalid', 'true'); ta.title = e.message; return; }
          ta.classList.remove('bad'); ta.removeAttribute('aria-invalid'); ta.title = w.join(' · ');
          set(pv === undefined ? {} : pv);
        });
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
        // 접근성: 이 필드 자신의 입력(하위 필드 제외)에 aria-invalid / aria-describedby(오류 문구)
        const bad = list.some(i => i.level === 'error');
        w.querySelectorAll('input,select,textarea').forEach(x => {
          if (x.closest('.sf') !== w) return;
          if (bad || x.classList.contains('bad')) x.setAttribute('aria-invalid', 'true'); else x.removeAttribute('aria-invalid');
          if (e && list.length) x.setAttribute('aria-describedby', e.id); else x.removeAttribute('aria-describedby');
        });
      });
    }
    function currentIssues() { const it = item(); if (!it) return []; const d = docOf(it.id); return validate(it.M, d.a, d, schemaOf(it.id)); }

    /* ---- YAML 가져오기 ---- */
    function toggleImport() { const i = $('#imp'); i.hidden = !i.hidden; }
    async function doImport() {
      if (busy) return;
      const err = $('#imperr'), report = $('#import-report');
      err.textContent = ''; report.replaceChildren();
      try {
        const docs = manifestDocuments($('#imptxt').value);
        setBusy(true, ui('스키마를 확인하는 중…'));
        const ids = docs.map(({ M }) => C.E.docs.find(d => d.a.kind === M?.kind && d.gv === M?.apiVersion)?.a.id);
        await Promise.all([...new Set(ids.filter(Boolean))].map(ensure));
        if (dead) return;
        const imported = [], results = el('ol');
        docs.forEach(entry => {
          const { M, warnings } = entry;
          const { id, issues } = checkDocument(entry, C.E.docs, schemaOf);
          if (id) imported.push({ id, M, opt: defaultOpt() });
          const row = el('li', { text: (M?.kind || ui('리소스')) + ' · ' + (M?.metadata?.name || ui('이름 없음')) + ' — ' + (id ? (issues.length ? ui('진단 ') + issues.length + ui('건') : ui('검증 통과')) : ui('가져오기 실패')) });
          if (issues.length) row.appendChild(el('ul', {}, issues.map(i => el('li', { text: (i.level === 'error' ? ui('오류 ') : ui('경고 ')) + i.path + ' · ' + i.msg }))));
          warnings.forEach(w => row.appendChild(el('p', { class: 'note', text: w })));
          results.appendChild(row);
        });
        if (imported.length) {
          const remaining = new Set(store.items);
          let first;
          for (const resource of imported) {
            const identity = draftName(resource);
            const active = item();
            const existing = identity && (remaining.has(active) && draftName(active) === identity ? active :
              [...remaining].find(it => !it.conflict && draftName(it) === identity));
            if (existing) { existing.M = resource.M; remaining.delete(existing); }
            else store.items.push(resource);
            first ||= existing || resource;
          }
          store.active = store.items.indexOf(first);
          save(); renderTabs(); renderForm(); renderOut();
        }
        report.append(el('p', { text: ui`문서 ${docs.length}개 중 ${imported.length}개를 편집 탭에 열었습니다.` }), results);
      } catch (e) { if (!dead) err.textContent = ui('가져오기 오류: ') + e.message; }
      finally { if (!dead) setBusy(false); }
    }

    /* ---- 출력 ---- */
    const manifestOf = it => { const sch = schemaOf(it.id); return ordered(it.M, '', sch); };
    function renderOut() {
      const it = item(), ob = $('#obody'); ob.innerHTML = '';
      $('#draft-status').textContent = sensitiveDraft(it) ? ui('보호 대상 내용이 있거나 이전 적용 기록을 확인할 수 없어 이 초안은 메모리에만 보관합니다.') : '';
      host.querySelectorAll('#otabs [role="tab"]').forEach(b => { const on = b.dataset.t === tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on) ob.setAttribute('aria-labelledby', b.id); });
      if (!it) { $('#cbadge').textContent = ''; return; }
      const d = docOf(it.id), sch = schemaOf(it.id), issues = currentIssues(), errs = issues.filter(i => i.level === 'error').length, warns = issues.length - errs;
      const reqN = issues.filter(i => i.level === 'error' && i.code === 'required').length, onlyReq = errs > 0 && reqN === errs;
      const badgeTip = onlyReq ? ui('아직 비어 있는 필수 값이 있습니다. 폼에서 채우거나 "필수 값 예시로 채우기"를 누르세요.') : ui('스키마 검증 오류입니다. 검증 탭에서 자세히 볼 수 있습니다.');
      $('#cbadge').innerHTML = errs ? `<span class="bdg bad" title="${esc(badgeTip)}" role="img" aria-label="${esc(errs + ui('개 ') + badgeTip)}">${errs}</span>` : (warns ? `<span class="bdg warn">${warns}</span>` : '<span class="bdg ok">✓</span>');
      markIssues();
      if (tab === 'yaml') {
        const all = el('label', { class: 'chk' }, [el('input', { type: 'checkbox', id: 'allres' }), document.createTextNode(ui(' 전체 리소스(---) 보기'))]);
        const txt = store.items.length > 1 && host.__all ? store.items.map(i => yamlDump(manifestOf(i))).join('\n---\n') : yamlDump(manifestOf(it));
        ob.appendChild(el('div', { class: 'sbar' }, [store.items.length > 1 ? all : null, el('span', { class: 'vbad ' + (errs ? (onlyReq ? 'warn' : 'bad') : 'ok'), title: errs ? badgeTip : '', text: errs ? (onlyReq ? ui`필수 값 ${errs}개 필요` : ui`✖ 오류 ${errs}개`) : ui('✔ 스키마 검증 통과') + (warns ? ui` (경고 ${warns})` : '') })]));
        const pre = el('pre', { class: 'simyaml' }, [el('button', { class: 'copy', text: ui('복사'), onclick: e => { const b = e.target; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { b.textContent = ui('복사됨'); setTimeout(() => b.textContent = ui('복사'), 1200); }).catch(() => {}); } }), el('code', { text: txt })]);
        ob.appendChild(pre);
        const cb = ob.querySelector('#allres'); if (cb) { cb.checked = !!host.__all; cb.addEventListener('change', () => { host.__all = cb.checked; renderOut(); }); }
        const displayed = host.__all ? store.items : [it];
        const canApply = displayed.every(draft => {
          const ops = endpoints.operations(docOf(draft.id).a);
          const collection = ops.create?.p;
          return typeof draft.M.metadata?.name === 'string' && draft.M.metadata.name.trim() &&
            collection && !collection.includes('{name}') && ops.get?.p === collection + '/{name}' &&
            ops.patch?.p === ops.get.p;
        });
        ob.appendChild(el('p', { class: 'note', text: canApply
          ? ui`적용: oc apply -f ${d.low}.yaml  ·  검증만: oc apply --dry-run=server -f ${d.low}.yaml`
          : ui('요청·응답 탭에서 이 리소스가 지원하는 작업과 명령을 확인하세요.') }));
      } else if (tab === 'check') {
        if (!issues.length) ob.appendChild(el('div', { class: 'empty', html: ui('<b>문제가 없습니다.</b><p class="hint">필수 값, 타입, 이름 형식, 알 수 없는 필드를 점검했습니다.</p>') }));
        else {
          const ul = el('div', { class: 'issues' });
          [...issues].sort((x, y) => (x.level === 'error' ? 0 : 1) - (y.level === 'error' ? 0 : 1)).forEach(i => ul.appendChild(el('button', { class: 'iss ' + i.level, onclick: () => { const w = host.querySelector(`.sf[data-vp="${CSS.escape(i.path)}"]`); if (w) { const rm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; w.scrollIntoView({ block: 'center', behavior: rm ? 'auto' : 'smooth' }); w.classList.add('flash'); setTimeout(() => w.classList.remove('flash'), 1200); } } }, [el('span', { class: 'lv', text: i.level === 'error' ? ui('오류') : ui('경고') }), el('code', { text: i.path || ui('(루트)') }), el('span', { text: ' ' + i.msg })])));
          ob.appendChild(ul);
        }
        ob.appendChild(el('p', { class: 'note', text: ui('스펙 문서의 필드 표(필수 여부·타입)를 기준으로 하며, 어드미션 웹훅·기본값 적용·정책 검사는 포함하지 않습니다. “허용 값” 경고는 설명 문장에서 추출한 힌트라 틀릴 수 있습니다.') }));
      } else renderReq(ob, it, d, sch, issues);
    }
    function renderReq(ob, it, d, sch, issues) {
      const o = it.opt, ops = opsOf(d).filter(op => op[2]);
      if (!ops.length) { ob.textContent = ui('이 버전에서 시뮬레이션할 수 있는 문서 경로가 없습니다.'); return; }
      if (!ops.some(([op]) => op === o.op)) o.op = ops[0][0];
      const sel = (id, label, opts, val) => `<label class="sl"><span>${label}</span><select id="${id}" class="vsel">${opts.map(([v, t]) => `<option value="${v}"${v === val ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
      const ctl = el('div', { class: 'reqctl', html:
        sel('o-op', ui('작업'), ops, o.op) +
        sel('o-fv', 'fieldValidation', [['Ignore', ui('Ignore (무시)')], ['Warn', ui('Warn (경고, 기본)')], ['Strict', ui('Strict (오류)')]], o.fv) +
        sel('o-dry', 'dryRun', [['None', ui('없음 (실제 저장)')], ['All', ui('All (검증만)')]], o.dry) +
        sel('o-scn', ui('시나리오'), [['ok', ui('정상')], ['notfound', ui('대상 없음(404)')], ['conflict', ui('이미 존재/충돌(409)')], ['forbidden', ui('권한 없음(403)')], ['unauth', ui('인증 실패(401)')]], o.scn) +
        (d.ns ? ui`<label class="sl"><span>네임스페이스</span><input id="o-ns" class="sin" value="${esc(o.ns || (it.M.metadata && it.M.metadata.namespace) || 'default')}"></label>` : '') +
        ui`<label class="sl"><span>이름</span><input id="o-name" class="sin" value="${esc(o.name || (it.M.metadata && it.M.metadata.name) || '')}"></label>` });
      ob.appendChild(ctl);
      if (o.op === 'patch') ob.appendChild(el('div', { class: 'reqctl', html: sel('o-pt', ui('패치 종류'), [['application/merge-patch+json', 'merge-patch (JSON Merge Patch)'], ['application/json-patch+json', 'json-patch'], ['application/strategic-merge-patch+json', 'strategic-merge-patch']], o.ptype) + ui`<label class="sl" style="flex:1 1 100%"><span>패치 본문(JSON)</span><textarea id="o-pb" class="sin" rows="3" spellcheck="false">${esc(o.pbody)}</textarea></label>` }));
      const bind = (id, key, re) => { const e = ob.querySelector('#' + id); if (!e) return; e.addEventListener(e.tagName === 'SELECT' ? 'change' : 'input', () => { o[key] = e.value; save(); if (re) renderOut(); else drawResult(); }); };
      bind('o-op', 'op', true); bind('o-fv', 'fv'); bind('o-dry', 'dry'); bind('o-scn', 'scn'); bind('o-ns', 'ns'); bind('o-name', 'name'); bind('o-pt', 'ptype'); bind('o-pb', 'pbody');
      const res = el('div', { id: 'simres' }); ob.appendChild(res);
      function drawResult() {
        const r = simulate(Object.assign({}, o), it.M, d.a, d, sch, issues, C);
        if (!r.req) { res.textContent = r.note; return; }
        const ok = r.status < 300, cls = ok ? 'ok' : r.status < 500 ? 'warn' : 'bad';
        const doc = r.documented.length ? ui`<div class="mq"><b>문서에 정의된 응답</b> ${r.documented.map(x => `<span class="resp${String(x[0]).startsWith(r.status) ? ' hit' : ''}">${esc(x[0])} <code>${esc(x[1])}</code></span>`).join('')}</div>` : '';
        res.innerHTML = ui`<h4 class="rh">요청</h4><pre class="simreq"><code>${esc(r.req.method + ' ' + r.req.path + '\n' + r.req.headers.join('\n') + (r.req.body ? '\n\n' + JSON.stringify(r.req.body, null, 2) : ''))}</code></pre>
          <h4 class="rh">예상 응답</h4><div class="statusline ${cls}"><b>${r.status}</b> ${esc(({ 200: 'OK', 201: 'Created', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Entity' })[r.status] || '')}</div>
          ${r.warnings.length ? `<div class="warnhdr">Warning: ${r.warnings.map(esc).join('; ')}</div>` : ''}${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}
          <pre class="simreq"><code>${esc(JSON.stringify(r.body, null, 2))}</code></pre>${r.defaults && r.defaults.length ? ui`<div class="sdefs"><h4 class="rh">서버가 채운 기본값(문서 기준 추정)</h4><ul>${r.defaults.map(x => `<li><code>${esc(x.path)}</code> = <code>${esc(JSON.stringify(x.v))}</code></li>`).join('')}</ul><p class="note">필드 설명 문장("Defaults to …")에서 추정한 값입니다. 실제 apiserver 기본값 처리·어드미션·웹훅·컨트롤러 동작과 다를 수 있습니다.</p></div>` : ''}${doc}
          <details class="epd"><summary>curl / oc 로 보내기</summary><div class="in"><pre class="simreq"><code>${esc('TOKEN=$(oc whoami -t)\nAPISERVER=$(oc whoami --show-server)\n\n' + curl(r.req) + ui('\n\n# oc 로는\n') + ocCmd(o, d, r.ns, r.name, r.req.body, r.req.path))}</code></pre></div></details>
          <p class="note">이 응답은 문서의 스키마 규칙으로 계산한 <b>가상 응답</b>입니다. 기본값은 설명 문장에서 추정한 것만 채우며, 실제 클러스터의 어드미션·웹훅·RBAC·충돌 검사는 반영하지 않습니다.</p>`;
      }
      drawResult();
    }
    host.querySelector('#otabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; renderOut(); } });
    host.querySelector('#otabs').addEventListener('keydown', e => {   // 탭 목록: ←/→ 이동, Home/End 처음/끝
      const bs = [...host.querySelectorAll('#otabs [role="tab"]')], i = bs.findIndex(b => b.dataset.t === tab);
      const j = e.key === 'ArrowRight' ? (i + 1) % bs.length : e.key === 'ArrowLeft' ? (i + bs.length - 1) % bs.length : e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : -1;
      if (j < 0) return; e.preventDefault(); tab = bs[j].dataset.t; renderOut(); bs[j].focus();
    });

    /* ---- 시작 ---- */
    async function start() {
      const first = C.docOf('route-route-openshift-io-v1') ? 'route-route-openshift-io-v1' : C.E.docs[0].a.id;
      const ids = [...new Set([apiId, ...store.items.map(i => i.id), (!apiId && !store.items.length) ? first : null].filter(id => id && docOf(id)))];
      try { await Promise.all(ids.map(ensure)); }
      catch (e) {
        if (dead) return;
        const f = $('#sform'); f.innerHTML = ui('<div class="empty">스키마 데이터를 불러오지 못했습니다: ') + esc((e && e.message) || String(e)) + ui('<p><button class="btn" id="retry">다시 시도</button></p></div>');
        f.querySelector('#retry').addEventListener('click', () => { f.innerHTML = ui('<p class="note">스키마를 불러오는 중…</p>'); start(); });
        return;
      }
      if (dead) return;
      try {
        if (apiId) {
          const selected = store.items.findIndex(it => it.id === apiId && it.uid === history.state?.draftUid);
          if (selected >= 0) store.active = selected;
          else if (item()?.id !== apiId) addItem(apiId, true);
        }
        if (!store.items.length) addItem(first, true);
        renderTabs(); renderForm(); renderOut();
      } catch (e) { $('#sform').innerHTML = ui('<div class="empty">시뮬레이터를 표시하지 못했습니다: ') + esc(e.message) + '</div>'; }
    }
    async function restoreDrafts() {
      let cleanupNote = '';
      const clear = $('#clear-drafts'), add = $('#addq');
      autosave.disabled = clear.disabled = add.disabled = true;
      try {
        if (canCoordinate) {
          let consumed;
          const saved = await draftTransaction(key, (existing, records, cleared) => {
            lastClear = cleared;
            const disk = restoreStore(JSON.stringify(existing), C.docOf);
            const raw = storageError ? null : localStorage.getItem(key);
            if (raw === null) return disk;
            let old;
            try { old = JSON.parse(raw); } catch { return disk; }
            if (!Array.isArray(old?.items)) return disk;
            const legacy = restoreStore(raw, C.docOf);
            const merged = mergeLegacyDrafts(disk, persistentDrafts(legacy));
            if (merged.items.length !== disk.items.length) records.put(merged, key);
            if (legacy.items.length === old.items.length) consumed = raw;
            return merged;
          });
          if (consumed !== undefined) {
            try { if (localStorage.getItem(key) === consumed) localStorage.removeItem(key); }
            catch { cleanupNote = ui('초안을 이전했습니다. 이전 저장본 정리는 다음에 다시 시도합니다.'); }
          }
          const recovered = restoreStore(JSON.stringify({ items: migratedSecrets.get(key) || [] }), C.docOf);
          migratedSecrets.delete(key);
          const memory = store.items.filter(sensitiveDraft).concat(recovered.items);
          const selected = store.items[store.active];
          const restored = restoreStore(JSON.stringify(saved), C.docOf);
          store.items = restored.items.concat(memory);
          store.active = selected && memory.includes(selected) ? store.items.indexOf(selected) : restored.active;
          baseline = clone(persistentDrafts(store));
        }
      } catch {
        autoSave = false;
        storageError = ui('초안 저장소를 열지 못했습니다. 이 화면에서는 메모리로 편집합니다.');
      }
      if (dead) return;
      autosave.disabled = !canCoordinate || !!storageError;
      autosave.checked = autoSave;
      clear.disabled = add.disabled = false;
      if (storageError || cleanupNote) $('#storage-note').textContent = storageError || cleanupNote;
      start();
    }
    restoreDrafts();
    return { destroy() { dead = true; window.removeEventListener('storage', syncPreference); } };
  }

  /* 공개 API: mount, yamlParse, yamlDump, validate, makeSchema, simulate (opsOf 는 보조).
     _t 는 Node 테스트 전용 내부 함수 모음이며 공개 API 가 아니다 — 언제든 바뀌거나 사라질 수 있으니 화면 코드에서 쓰지 말 것. */
  root.Sim = { needsName, assessDocuments, upgradeImpact, manifestDocuments, checkDocument, mount, yamlParse, yamlDump, validate, makeSchema, simulate, opsOf, _t: { ensureRequired, sampleFill, setAt, getAt, delAt, hasAt, mergePatch, resNames, curl, ocCmd, sq, defaultFor, ordered, restoreStore, closeTab, cleanOpt, normT, jsonPatch, parseValue, nameError, serverObject, defaultFrom, applyDefaults } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Sim;
})(typeof window !== 'undefined' ? window : globalThis);
