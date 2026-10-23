/* ui-kit.js - 인라인 SVG 아이콘(Icon) + 경량 구문 강조(Hi). 외부 의존성 없음. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 공통: HTML 이스케이프                                                */
  /* ------------------------------------------------------------------ */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const ESC_RE = /[&<>"]/g;
  const ESC_TEST = /[&<>"]/;
  function e(s) { return ESC_TEST.test(s) ? s.replace(ESC_RE, (c) => ESC[c]) : s; }

  /* ------------------------------------------------------------------ */
  /* 1) 아이콘                                                            */
  /* 항목: 문자열 = path d, '!'로 시작 = 채운 path, 배열 = [cx,cy,r] 원      */
  /* ------------------------------------------------------------------ */
  const rect = (x, y, w, h) => `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  const DOT = (x, y) => `M${x} ${y}H${x + 0.01}`;
  const STAR = 'M12 3L14.8 9L21 9.8L16.5 14.2L17.7 20.5L12 17.4L6.3 20.5L7.5 14.2L3 9.8L9.2 9Z';

  const ICONS = {
    'search': [[11, 11, 7], 'M21 21L16.2 16.2'],
    'home': ['M3 11L12 3L21 11', 'M5 10V20H19V10', 'M10 20V14H14V20'],
    'book': ['M4 19.5V5A2 2 0 0 1 6 3H20V17H6A2 2 0 0 0 4 19.5Z', 'M4 19.5A2 2 0 0 0 6 21.5H20V17'],
    'layers': ['M12 3L3 8L12 13L21 8Z', 'M3 12L12 17L21 12', 'M3 16L12 21L21 16'],
    'topology': [[12, 5, 2.5], [5, 19, 2.5], [19, 19, 2.5], 'M11 7.3L6 16.7', 'M13 7.3L18 16.7', 'M7.5 19H16.5'],
    'compare': [rect(3, 4, 7, 16), rect(14, 4, 7, 16), 'M5.5 9H7.5', 'M5.5 13H7.5', 'M16.5 9H18.5', 'M16.5 13H18.5'],
    'flask': ['M9 3H15', 'M10 3V9L4.5 19A1.5 1.5 0 0 0 6 21H18A1.5 1.5 0 0 0 19.5 19L14 9V3', 'M7.5 15H16.5'],
    'menu': ['M4 6H20', 'M4 12H20', 'M4 18H20'],
    'x': ['M6 6L18 18', 'M18 6L6 18'],
    'sun': [[12, 12, 4], 'M12 2V4', 'M12 20V22', 'M4.9 4.9L6.3 6.3', 'M17.7 17.7L19.1 19.1', 'M2 12H4', 'M20 12H22', 'M4.9 19.1L6.3 17.7', 'M17.7 6.3L19.1 4.9'],
    'moon': ['M20 14.5A8 8 0 0 1 9.5 4A8 8 0 1 0 20 14.5Z'],
    'monitor': [rect(3, 4, 18, 12), 'M8 20H16', 'M12 16V20'],
    'copy': [rect(9, 9, 11, 11), 'M5 15H4V4H15V5'],
    'check': ['M4 12.5L9.5 18L20 6.5'],
    'chevron-right': ['M9 5L16 12L9 19'],
    'chevron-down': ['M5 9L12 16L19 9'],
    'chevron-left': ['M15 5L8 12L15 19'],
    'chevron-up': ['M5 15L12 8L19 15'],
    'external': ['M14 4H20V10', 'M20 4L11 13', 'M18 14V20H4V6H10'],
    'star': [STAR],
    'star-fill': ['!' + STAR],
    'clock': [[12, 12, 9], 'M12 7V12L15.5 14'],
    'filter': ['M3 4H21L14 12.5V19L10 21V12.5Z'],
    'command': ['M15 6V18A3 3 0 1 0 18 15H6A3 3 0 1 0 9 18V6A3 3 0 1 0 6 9H18A3 3 0 1 0 15 6Z'],
    'keyboard': [rect(2, 6, 20, 12), DOT(6, 10), DOT(10, 10), DOT(14, 10), DOT(18, 10), 'M7 14H17'],
    'arrow-right': ['M4 12H20', 'M14 6L20 12L14 18'],
    'arrow-up-right': ['M7 17L17 7', 'M8 7H17V16'],
    'hash': ['M5 9H20', 'M4 15H19', 'M10 3L8 21', 'M16 3L14 21'],
    'box': ['M12 3L20.5 7.5V16.5L12 21L3.5 16.5V7.5Z', 'M3.5 7.5L12 12L20.5 7.5', 'M12 12V21'],
    'server': [rect(3, 4, 18, 6), rect(3, 14, 18, 6), DOT(7, 7), DOT(7, 17)],
    'shield': ['M12 3L20 6V12C20 16.5 16.5 19.8 12 21C7.5 19.8 4 16.5 4 12V6Z', 'M9 12L11 14L15 10'],
    'network': [[12, 12, 9], 'M3 12H21', 'M12 3C15 6 15 18 12 21C9 18 9 6 12 3Z'],
    'database': ['M3 5A9 3 0 0 0 21 5A9 3 0 0 0 3 5Z', 'M3 5V19A9 3 0 0 0 21 19V5', 'M3 12A9 3 0 0 0 21 12'],
    'cpu': [rect(6, 6, 12, 12), rect(9, 9, 6, 6), 'M9 2V6', 'M15 2V6', 'M9 18V22', 'M15 18V22', 'M2 9H6', 'M2 15H6', 'M18 9H22', 'M18 15H22'],
    'hard-drive': [rect(3, 14, 18, 5), 'M3 14L6 5H18L21 14', DOT(7, 16.5)],
    'users': [[9, 8, 3.5], 'M2.5 20V19A5.5 5.5 0 0 1 8 13.5H10A5.5 5.5 0 0 1 15.5 19V20', 'M16 4.6A3.5 3.5 0 0 1 16 11.4', 'M18 13.8A5.5 5.5 0 0 1 21.5 19V20'],
    'lock': [rect(5, 11, 14, 10), 'M8 11V7A4 4 0 0 1 16 7V11', 'M12 15V17'],
    'cloud': ['M7 18A4.5 4.5 0 0 1 6.5 9A6 6 0 0 1 18 10A4 4 0 0 1 17.5 18Z'],
    'activity': ['M3 12H7L10 4L14 20L17 12H21'],
    'package': [rect(3, 8, 18, 13), 'M3 8L5 3H19L21 8', 'M10 12H14'],
    'settings': [[16, 6, 2], [10, 12, 2], [14, 18, 2], 'M4 6H14', 'M18 6H20', 'M4 12H8', 'M12 12H20', 'M4 18H12', 'M16 18H20'],
    'info': [[12, 12, 9], 'M12 11V16', DOT(12, 8)],
    'alert': ['M12 3L22 20H2Z', 'M12 10V14', DOT(12, 17)],
    'tag': ['M3 4V11.5L12.5 21L21 12.5L11.5 3H4Z', DOT(8, 8)],
    'folder': ['M3 5H10L12 8H21V19H3Z'],
    'list': ['M8 6H21', 'M8 12H21', 'M8 18H21', DOT(3, 6), DOT(3, 12), DOT(3, 18)],
    'grid': [rect(3, 3, 7, 7), rect(14, 3, 7, 7), rect(3, 14, 7, 7), rect(14, 14, 7, 7)],
    'download': ['M12 4V15', 'M7 10.5L12 15.5L17 10.5', 'M4 20H20'],
    'plus': ['M12 5V19', 'M5 12H19'],
    'minus': ['M5 12H19'],
    'play': ['M7 4L19 12L7 20Z'],
    'refresh': ['M4 12A8 8 0 0 1 18 6.7', 'M19 3V7.5H14.5', 'M20 12A8 8 0 0 1 6 17.3', 'M5 21V16.5H9.5'],
    'link': ['M10 14A4 4 0 0 0 15.5 14.5L18.5 11.5A4 4 0 0 0 12.8 5.8L11.5 7', 'M14 10A4 4 0 0 0 8.5 9.5L5.5 12.5A4 4 0 0 0 11.2 18.2L12.5 17'],
    'code': ['M8 7L3 12L8 17', 'M16 7L21 12L16 17', 'M14 4L10 20'],
    'terminal': ['M4 7L9 12L4 17', 'M12 19H20'],
    'file-text': ['M5 3H14L19 8V21H5Z', 'M14 3V8H19', 'M8.5 13H15.5', 'M8.5 17H15.5'],
    'git-branch': [[6, 5, 2], [6, 19, 2], [18, 8, 2], 'M6 7V17', 'M18 10V11A3 3 0 0 1 15 14H9A3 3 0 0 0 6 17'],
    'zap': ['M13 2L4 14H12L11 22L20 10H12Z'],
    'eye': ['M2 12C4.5 7.5 8 5.5 12 5.5C16 5.5 19.5 7.5 22 12C19.5 16.5 16 18.5 12 18.5C8 18.5 4.5 16.5 2 12Z', [12, 12, 3]],
    'trash': ['M4 7H20', 'M9 7V4H15V7', 'M6 7L7 21H17L18 7', 'M10 11V17', 'M14 11V17'],
  };
  const FALLBACK = [[12, 12, 3]];

  function body(items) {
    let s = '';
    for (const it of items) {
      if (Array.isArray(it)) s += `<circle cx="${it[0]}" cy="${it[1]}" r="${it[2]}"/>`;
      else if (it.charCodeAt(0) === 33) s += `<path d="${it.slice(1)}" fill="currentColor"/>`;
      else s += `<path d="${it}"/>`;
    }
    return s;
  }

  const CACHE = Object.create(null);
  function Icon(name, size = 16, cls = '') {
    let sz = Number(size);
    if (!isFinite(sz) || sz <= 0) sz = 16;
    const c = cls ? ' ' + e(String(cls)).trim() : '';
    const key = String(name);
    let inner = CACHE[key];
    if (inner === undefined) {
      inner = body(Object.prototype.hasOwnProperty.call(ICONS, key) ? ICONS[key] : FALLBACK);
      CACHE[key] = inner;
    }
    return `<svg class="ic${c}" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
  }
  Icon.names = Object.keys(ICONS);

  /* ------------------------------------------------------------------ */
  /* 2) 구문 강조                                                         */
  /* ------------------------------------------------------------------ */
  function mk(cls, t) { return t ? '<span class="tk-' + cls + '">' + e(t) + '</span>' : ''; }
  const isWs = (ch) => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';

  const RE_NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
  const RE_SPECIAL = /[0-9@?!*]/y;
  const RE_PH = /<[^<>\s"'=]{1,60}>/y;
  const RE_URL = /https?:\/\/[^\s"'`$<>\\|&;()]+/y;
  const RE_URL_IN = /https?:\/\/[^\s"'`$<>\\]+/y;

  // `$...` 변수/치환의 끝 인덱스(없으면 -1)
  function varEnd(s, i) {
    const c1 = s[i + 1];
    if (c1 === '{') {
      const lim = Math.min(s.length, i + 300);
      for (let j = i + 2; j < lim; j++) {
        if (s[j] === '}') return j + 1;
        if (s[j] === '\n') return -1;
      }
      return -1;
    }
    if (c1 === '(') {
      let d = 0;
      const lim = Math.min(s.length, i + 400);
      for (let j = i + 1; j < lim; j++) {
        const ch = s[j];
        if (ch === '(') d++;
        else if (ch === ')') { d--; if (d === 0) return j + 1; }
      }
      return -1;
    }
    RE_NAME.lastIndex = i + 1;
    let m = RE_NAME.exec(s);
    if (m) return i + 1 + m[0].length;
    RE_SPECIAL.lastIndex = i + 1;
    m = RE_SPECIAL.exec(s);
    return m ? i + 2 : -1;
  }
  function phEnd(s, i) {
    RE_PH.lastIndex = i;
    const m = RE_PH.exec(s);
    return m ? i + m[0].length : -1;
  }
  function urlEnd(s, i, inString) {
    const re = inString ? RE_URL_IN : RE_URL;
    re.lastIndex = i;
    const m = re.exec(s);
    return m ? i + m[0].length : -1;
  }

  // 텍스트 안의 자리표시자/변수/URL 을 분리. base: 나머지 글자의 클래스(null=일반)
  const RE_JUMP = /<|\$|https?:\/\//g;
  function inl(t, base, vars) {
    let o = '', last = 0;
    const plain = (a, b) => { if (b > a) o += base ? mk(base, t.slice(a, b)) : e(t.slice(a, b)); };
    RE_JUMP.lastIndex = 0;
    let m;
    while ((m = RE_JUMP.exec(t))) {
      const i = m.index, ch = t[i];
      let end = -1, cls = 'v';
      if (ch === '<') { if (vars) end = phEnd(t, i); }
      else if (ch === '$') { if (vars) end = varEnd(t, i); }
      else { end = urlEnd(t, i, true); cls = 'u'; }
      if (end > i) {
        plain(last, i);
        o += mk(cls, t.slice(i, end));
        last = end;
        RE_JUMP.lastIndex = end;
      }
    }
    plain(last, t.length);
    return o;
  }

  /* ---------------------------- YAML ---------------------------- */
  const NUM_RE = /^[-+]?(?:\d[\d_]*(?:\.\d+)?(?:[eE][-+]?\d+)?|\.\d+|0x[0-9a-fA-F]+|\.inf|\.nan)$/;
  const BOOL_RE = /^(?:true|false|null|~|True|False|TRUE|FALSE|Null|NULL)$/;

  function classify(t) {
    if (NUM_RE.test(t)) return mk('n', t);
    if (BOOL_RE.test(t)) return mk('b', t);
    return inl(t, null, true);
  }

  // 따옴표 문자열의 끝(닫는 따옴표 다음 인덱스), 없으면 -1
  function endQuote(s, i) {
    const q = s[i], n = s.length;
    let j = i + 1;
    while (j < n) {
      const ch = s[j];
      if (q === '"' && ch === '\\') { j += 2; continue; }
      if (ch === q) {
        if (q === "'" && s[j + 1] === "'") { j += 2; continue; }
        return j + 1;
      }
      j++;
    }
    return -1;
  }

  function wsRun(s, i) { let j = i; while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\r')) j++; return j; }

  function yamlFlow(s, i) {
    const n = s.length;
    let o = '';
    while (i < n) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\r') { const j = wsRun(s, i); o += e(s.slice(i, j)); i = j; continue; }
      if (c === '#' && (i === 0 || isWs(s[i - 1]))) { o += mk('c', s.slice(i)); break; }
      if (c === '{' || c === '}' || c === '[' || c === ']' || c === ',') { o += mk('p', c); i++; continue; }
      if (c === '"' || c === "'") {
        let j = endQuote(s, i);
        if (j < 0) { o += mk('s', s.slice(i)); break; }
        const k = wsRun(s, j);
        o += mk(s[k] === ':' ? 'k' : 's', s.slice(i, j));
        i = j;
        continue;
      }
      if (c === ':' && (i + 1 >= n || isWs(s[i + 1]) || ',]}'.includes(s[i + 1]))) { o += mk('p', ':'); i++; continue; }
      let j = i + 1;
      while (j < n) {
        const ch = s[j];
        if (',[]{}'.includes(ch)) break;
        if (ch === ':' && (j + 1 >= n || isWs(s[j + 1]) || ',]}'.includes(s[j + 1]))) break;
        if (ch === '#' && isWs(s[j - 1])) break;
        j++;
      }
      let t = s.slice(i, j);
      const tt = t.replace(/\s+$/, '');
      const k = wsRun(s, i + tt.length);
      o += (s[k] === ':' && (k + 1 >= n || isWs(s[k + 1]) || ',]}'.includes(s[k + 1]))) ? mk('k', tt) : classify(tt);
      o += e(t.slice(tt.length));
      i = j;
    }
    return o;
  }

  function yamlTail(s, i) { // 공백 + 주석 (뒤 내용은 일반)
    const j = wsRun(s, i);
    let o = e(s.slice(i, j));
    if (j < s.length) o += (s[j] === '#' && (j === 0 || isWs(s[j - 1]))) ? mk('c', s.slice(j)) : e(s.slice(j));
    return o;
  }

  function yamlValue(s, i, st, parent) {
    const n = s.length;
    let o = '';
    for (;;) {
      const j = wsRun(s, i);
      o += e(s.slice(i, j));
      i = j;
      if (i >= n) return o;
      const c = s[i];
      if (c === '#' && (i === 0 || isWs(s[i - 1]))) return o + mk('c', s.slice(i));
      if (c === '&' || c === '*' || c === '!') { // 앵커/별칭/태그
        let k = i + 1;
        while (k < n && !isWs(s[k])) k++;
        if (k > i + 1) { o += mk('v', s.slice(i, k)); i = k; continue; }
      }
      if (c === '|' || c === '>') {
        const m = /^[|>][+\-0-9]*(?=\s|$)/.exec(s.slice(i, i + 8));
        if (m) { st.block = parent; return o + mk('p', m[0]) + yamlTail(s, i + m[0].length); }
      }
      if (c === '[' || c === '{') return o + yamlFlow(s, i);
      if (c === '"' || c === "'") {
        const k = endQuote(s, i);
        if (k < 0) return o + mk('s', s.slice(i));
        return o + mk('s', s.slice(i, k)) + yamlTail(s, k);
      }
      let end = n;
      for (let k = i + 1; k < n; k++) if (s[k] === '#' && isWs(s[k - 1])) { end = k; break; }
      const text = s.slice(i, end);
      const t = text.replace(/\s+$/, '');
      o += classify(t) + e(text.slice(t.length));
      if (end < n) o += mk('c', s.slice(end));
      return o;
    }
  }

  // 키 텍스트의 끝 인덱스(콜론 앞), 키가 아니면 -1
  function findKey(s, i) {
    const n = s.length, c = s[i];
    if (c === '"' || c === "'") {
      const j = endQuote(s, i);
      if (j < 0) return -1;
      const k = wsRun(s, j);
      return (s[k] === ':' && (k + 1 >= n || isWs(s[k + 1]))) ? j : -1;
    }
    if ('[{#|>%@`'.includes(c)) return -1;
    for (let j = i; j < n; j++) {
      const ch = s[j];
      if (ch === ':' && (j + 1 >= n || isWs(s[j + 1]))) {
        if (j === i) return -1;
        let k = j;
        while (k > i && (s[k - 1] === ' ' || s[k - 1] === '\t')) k--;
        return k;
      }
      if (ch === '#' && j > i && isWs(s[j - 1])) return -1;
    }
    return -1;
  }

  function yamlLine(s, st) {
    const n = s.length;
    let i = wsRun(s, 0);
    const indent = i;
    if (st.block >= 0) {
      if (i >= n) return e(s);
      if (indent > st.block) return e(s.slice(0, i)) + mk('s', s.slice(i));
      st.block = -1;
    }
    if (i >= n) return e(s);
    let o = e(s.slice(0, i));
    if (s[i] === '#') return o + mk('c', s.slice(i));
    if (indent === 0 && (s.startsWith('---') || s.startsWith('...')) && (n === 3 || isWs(s[3]))) {
      o += mk('p', s.slice(0, 3));
      return o + yamlValue(s, 3, st, 0);
    }
    let lastDash = -1;
    while (s[i] === '-' && (i + 1 >= n || isWs(s[i + 1]))) {
      o += mk('p', '-');
      lastDash = i;
      i++;
      const j = wsRun(s, i);
      o += e(s.slice(i, j));
      i = j;
    }
    if (i >= n) return o;
    const kEnd = findKey(s, i);
    if (kEnd >= 0) {
      const col = i;
      o += mk('k', s.slice(i, kEnd));
      let j = wsRun(s, kEnd);
      o += e(s.slice(kEnd, j));
      o += mk('p', ':');
      return o + yamlValue(s, j + 1, st, col);
    }
    return o + yamlValue(s, i, st, lastDash >= 0 ? lastDash : indent);
  }

  function yaml(text) {
    try {
      const src = String(text == null ? '' : text);
      const lines = src.split('\n');
      const st = { block: -1 };
      const out = new Array(lines.length);
      for (let k = 0; k < lines.length; k++) out[k] = yamlLine(lines[k], st);
      return out.join('\n');
    } catch (_) { return e(String(text == null ? '' : text)); }
  }

  /* ---------------------------- JSON ---------------------------- */
  const J_NUM = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const J_WORD = /[A-Za-z_][A-Za-z0-9_$]*/y;

  function json(text) {
    try {
      const s = String(text == null ? '' : text), n = s.length;
      let o = '', i = 0, ps = 0;
      const flush = (to) => { if (to > ps) o += e(s.slice(ps, to)); };
      while (i < n) {
        const c = s[i];
        if (c === '"') {
          let j = i + 1;
          while (j < n && s[j] !== '"' && s[j] !== '\n') { j += s[j] === '\\' ? 2 : 1; }
          if (j > n) j = n;
          const end = (j < n && s[j] === '"') ? j + 1 : j;
          let k = end;
          while (k < n && (s[k] === ' ' || s[k] === '\t' || s[k] === '\r' || s[k] === '\n')) k++;
          flush(i);
          o += mk(s[k] === ':' && end > i + 1 && s[end - 1] === '"' ? 'k' : 's', s.slice(i, end));
          i = ps = end;
        } else if (c === '{' || c === '}' || c === '[' || c === ']' || c === ',' || c === ':') {
          flush(i); o += mk('p', c); i = ps = i + 1;
        } else if ((c >= '0' && c <= '9') || (c === '-' && s[i + 1] >= '0' && s[i + 1] <= '9')) {
          J_NUM.lastIndex = i;
          const m = J_NUM.exec(s);
          flush(i); o += mk('n', m[0]); i = ps = i + m[0].length;
        } else if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_') {
          J_WORD.lastIndex = i;
          const m = J_WORD.exec(s);
          const w = m[0];
          if (w === 'true' || w === 'false' || w === 'null') { flush(i); o += mk('b', w); ps = i + w.length; }
          i += w.length;
        } else i++;
      }
      flush(n);
      return o;
    } catch (_) { return e(String(text == null ? '' : text)); }
  }

  /* ---------------------------- bash ---------------------------- */
  const KW = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'while', 'until', 'case', 'esac', 'function']);
  const KEEP_CMD = new Set(['sudo', 'time', 'nohup', 'exec', 'env', 'command', 'watch', 'xargs', 'nice', 'if', 'then', 'else', 'elif', 'do', 'while', 'until']);
  const ASSIGN = /^([A-Za-z_][A-Za-z0-9_]*)\+?=/;
  const NUM_WORD = /^\d+(?:\.\d+)?$/;
  const isStop = (ch) => {
    switch (ch) {
      case ' ': case '\t': case '\r': case '\n': case '"': case "'": case '`': case '$': case '\\':
      case '|': case '&': case ';': case '<': case '>': case '(': case ')': return true;
      default: return false;
    }
  };

  function bash(text) {
    try {
      const s = String(text == null ? '' : text), n = s.length;
      let o = '', i = 0, cmd = true, asg = false;
      while (i < n) {
        const c = s[i];
        if (c === '\n') { o += '\n'; cmd = true; asg = false; i++; continue; }
        if (c === ' ' || c === '\t' || c === '\r') { const j = wsRun(s, i); o += e(s.slice(i, j)); asg = false; i = j; continue; }
        if (c === '\\') {
          if (s[i + 1] === '\n') { o += '\\\n'; i += 2; continue; }
          if (s[i + 1] === '\r' && s[i + 2] === '\n') { o += '\\\r\n'; i += 3; continue; }
          o += e(s.slice(i, i + 2)); i += 2; cmd = asg; continue;
        }
        if (c === '#') {
          let j = s.indexOf('\n', i); if (j < 0) j = n;
          o += mk('c', s.slice(i, j)); i = j; continue;
        }
        if (c === '"') {
          let j = i + 1;
          while (j < n) {
            const ch = s[j];
            if (ch === '\\') j += 2;
            else if (ch === '"') break;
            else if (ch === '$' && s[j + 1] === '(') { const ve = varEnd(s, j); j = ve > 0 ? ve : j + 1; }
            else j++;
          }
          const end = j < n ? j + 1 : n;
          o += inl(s.slice(i, end), 's', true); i = end; cmd = asg; continue;
        }
        if (c === "'") {
          const j = s.indexOf("'", i + 1);
          const end = j < 0 ? n : j + 1;
          o += inl(s.slice(i, end), 's', false); i = end; cmd = asg; continue;
        }
        if (c === '$') {
          const ve = varEnd(s, i);
          if (ve > 0) { o += mk('v', s.slice(i, ve)); i = ve; } else { o += '$'; i++; }
          cmd = asg; continue;
        }
        if (c === '`') {
          const j = s.indexOf('`', i + 1);
          const end = j < 0 ? n : j + 1;
          o += mk('v', s.slice(i, end)); i = end; cmd = asg; continue;
        }
        if (c === '<') {
          const pe = phEnd(s, i);
          if (pe > 0) { o += mk('v', s.slice(i, pe)); i = pe; cmd = asg; continue; }
        }
        if (c === '|' || c === '&' || c === ';' || c === '<' || c === '>') {
          let j = i + 1;
          while (j < n && (s[j] === '|' || s[j] === '&' || s[j] === ';' || s[j] === '<' || s[j] === '>')) j++;
          const r = s.slice(i, j);
          o += mk('p', r);
          cmd = r.indexOf('|') >= 0 || r.indexOf(';') >= 0 || r === '&&' || r === '&';
          asg = false; i = j; continue;
        }
        if (c === '(') { o += mk('p', '('); cmd = true; i++; continue; }
        if (c === ')') { o += mk('p', ')'); cmd = false; i++; continue; }
        if (c === 'h') {
          const ue = urlEnd(s, i, false);
          if (ue > 0) { o += mk('u', s.slice(i, ue)); i = ue; cmd = false; continue; }
        }
        let j = i;
        while (j < n && !isStop(s[j])) j++;
        if (j === i) { o += e(c); i++; continue; }
        const w = s.slice(i, j);
        if (c === '-' && !/^-\d/.test(w)) {
          const eq = w.indexOf('=');
          if (eq < 0) o += mk('f', w);
          else o += mk('f', w.slice(0, eq)) + '=' + inl(w.slice(eq + 1), null, false);
        } else if (cmd) {
          const m = ASSIGN.exec(w);
          if (m) {
            o += mk('k', m[1]) + e(w.slice(m[1].length, w.indexOf('=') + 1)) + inl(w.slice(w.indexOf('=') + 1), null, false);
            asg = j === i + w.indexOf('=') + 1;
            cmd = true;
          } else if (KW.has(w)) { o += mk('b', w); cmd = KEEP_CMD.has(w); }
          else { o += mk('cmd', w); cmd = KEEP_CMD.has(w); }
        } else if (NUM_WORD.test(w)) o += mk('n', w);
        else o += e(w);
        i = j;
      }
      return o;
    } catch (_) { return e(String(text == null ? '' : text)); }
  }

  function auto(text, lang) {
    const t = String(text == null ? '' : text);
    switch (String(lang == null ? '' : lang).toLowerCase()) {
      case 'yaml': case 'yml': return yaml(t);
      case 'json': return json(t);
      case 'bash': case 'sh': case 'shell': case 'zsh': return bash(t);
      default: return e(t);
    }
  }

  const Hi = { yaml, json, bash, auto, escape: e };

  window.Icon = Icon;
  window.Hi = Hi;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Icon, Hi };
})();
