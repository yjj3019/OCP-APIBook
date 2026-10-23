/* 앱 코어: 상태·저장소·지연 로딩·통합 검색 엔진·라우터·셸(사이드바/테마/토스트) */
(function () {
  'use strict';
  const App = window.App = { V: '3', views: {}, U: {}, ENG: {}, t0: performance.now() };
  const $ = App.$ = (s, r) => (r || document).querySelector(s);
  App.$$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = App.esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  App.ic = (n, s, c) => (window.Icon ? Icon(n, s, c) : '');
  App.short = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); n = n || 170; return t.length > n ? t.slice(0, n) + '…' : t; };
  App.firstSent = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] || t; };
  App.hlz = (s, H) => esc(H(s)).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
  App.hi = (text, lang) => (window.Hi ? Hi.auto(text, lang) : esc(text));
  App.fmt = n => Number(n).toLocaleString('ko-KR');

  /* ---------- 저장소 ---------- */
  const LS = App.LS = {
    get(k, d) { try { const v = localStorage.getItem('apibook2.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('apibook2.' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } },
  };
  App.fav = { list: () => LS.get('fav', []), has: k => LS.get('fav', []).includes(k),
    toggle(k) { const l = LS.get('fav', []), i = l.indexOf(k); if (i >= 0) l.splice(i, 1); else l.unshift(k); LS.set('fav', l); renderSide(); return i < 0; } };
  App.recent = { list: () => LS.get('recent', []),
    push(k) { const l = LS.get('recent', []).filter(x => x !== k); l.unshift(k); LS.set('recent', l.slice(0, 12)); renderSide(); } };

  /* ---------- 토스트 · 진행 표시줄 ---------- */
  let toastT = 0;
  App.toast = (msg, icon) => {
    const t = $('#toast'); t.innerHTML = (icon ? App.ic(icon, 15) : '') + `<span>${esc(msg)}</span>`; t.classList.add('on'); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('on'); }, 1800);
  };
  const bar = { n: 0, t: 0, start() { const b = $('#bar'); this.n++; b.style.opacity = 1; b.style.width = '28%'; clearTimeout(this.t); this.t = setTimeout(() => { b.style.width = '70%'; }, 250); },
    done() { if (--this.n > 0) return; const b = $('#bar'); b.style.width = '100%'; setTimeout(() => { b.style.opacity = 0; b.style.width = '0'; }, 220); } };
  App.bar = bar;
  App.copy = (text, btn) => {
    const ok = () => { App.toast('클립보드에 복사했습니다', 'check'); if (btn) { const o = btn.innerHTML; btn.innerHTML = App.ic('check', 14) + ' 복사됨'; setTimeout(() => { btn.innerHTML = o; }, 1200); } };
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(ok).catch(() => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { App.toast('복사하지 못했습니다'); } ta.remove(); });
  };

  /* ---------- 지연 로딩 ---------- */
  const loaded = {};
  App.lazy = (...srcs) => Promise.all(srcs.map(s => loaded[s] || (loaded[s] = new Promise((ok, no) => {
    const e = document.createElement('script'); e.src = s + (s.includes('?') ? '' : '?v=' + App.V); e.onload = ok; e.onerror = () => { delete loaded[s]; no(new Error(s + ' 로드 실패')); }; document.head.appendChild(e);
  }))));
  App.lazyGraph = () => App.lazy('graph.js', 'viz.js', 'topo.js');
  App.lazySim = () => App.lazy('graph.js', 'sim.js');

  /* ---------- 데이터 ---------- */
  const MG = App.MG = window.MERGED, VL = App.VL = MG.list, LATEST = App.LATEST = MG.default;
  const DB = window.DB = window.DB || {};
  App.loadCore = v => DB[v] ? Promise.resolve() : App.lazy(`data/${v}.js`, `data/${v}.fidx.js`);
  App.getFields = async v => { await App.lazy(`data/${v}.fields.js`); return window.FIELDS[v]; };
  App.prep = v => {
    const db = DB[v]; if (db._ok) return db;
    const fi = (window.FIDX && FIDX[v]) || {};
    db.apis.forEach(a => { a.fp = fi[a.id] || []; if (a.d) a.d.eps.forEach(e => { e.m = e.ms.map(x => x.m + ': ' + x.d); }); });
    db._ok = true; return db;
  };
  /* 한 버전 전용 엔진(그래프·시뮬레이터·상세의 관계도용) */
  App.engines = async v => {
    if (!App.ENG[v]) {
      await Promise.all([App.loadCore(v), App.lazy('graph.js')]);
      const db = App.prep(v), b = { guide: db.guide, apis: db.apis };
      App.ENG[v] = { E: ApiSearch.create(b), G: ApiGraph.create(b), db };
    }
    return App.ENG[v];
  };
  /* 통합 검색 엔진: 최신 버전 + 최신에서 사라진 API(legacy) */
  const U = App.U;
  App.boot = async () => {
    const t = performance.now();
    await Promise.all([App.loadCore(LATEST), App.lazy('data/legacy.js')]);
    const db = App.prep(LATEST), lg = window.LEGACY;
    lg.apis.forEach(a => { a.fp = lg.fidx[a.id] || []; if (a.d) a.d.eps.forEach(e => { e.m = e.ms.map(x => x.m + ': ' + x.d); }); });
    const apis = db.apis.concat(lg.apis);
    apis.forEach(a => { a.key = a.kind + '|' + a.group; a.m = MG.apis[a.key]; a.rv = a.rv || LATEST; a.cons = a.m ? a.m.cons : []; });
    U.apis = apis; U.guide = db.guide; U.E = ApiSearch.create({ guide: db.guide, apis });
    U.byKey = new Map(apis.map(a => [a.key, a]));
    U.docByKey = new Map(U.E.docs.map(d => [d.a.key, d]));
    U.idKey = new Map(); for (const [k, m] of Object.entries(MG.apis)) for (const v of Object.keys(m.id)) U.idKey.set(v + '|' + m.id[v], k);
    U.cats = {}; apis.forEach(a => { U.cats[a.book] = (U.cats[a.book] || 0) + 1; });
    U.fieldCount = Object.values(window.FIDX[LATEST]).reduce((s, x) => s + x.length, 0);
    U.consCount = Object.values(MG.apis).reduce((s, m) => s + m.cons.length, 0);
    App.bootMs = performance.now() - t;
  };
  /* 선택한 버전에서 API 가 있으면 그 버전, 없으면 있는 가장 최신 버전 */
  App.pickVer = (m, want) => (m.vers.includes(want) ? want : m.vers[0]);
  App.hrefFor = (a, want) => { const v = App.pickVer(a.m, want || App.ver); return `#${App.ver}/api:${a.m.id[v]}`; };
  App.stab = gv => /alpha/i.test(gv) ? 'alpha' : /beta/i.test(gv) ? 'beta' : 'ga';
  App.STAB = { ga: ['GA', '안정 버전'], beta: ['Beta', '필드·동작이 바뀔 수 있음'], alpha: ['Alpha', '예고 없이 변경·삭제될 수 있음'] };
  App.TIER = { 1: '레벨 1 · 메이저 릴리스 동안 최소 12개월 또는 3개 마이너 릴리스(둘 중 긴 쪽) 안정', 2: '레벨 2 · 메이저 릴리스 동안 최소 9개월 또는 3개 마이너 릴리스(둘 중 긴 쪽) 안정', 3: '레벨 3 · 마이너 릴리스 내 최소 6개월 또는 1개 마이너 릴리스(둘 중 긴 쪽) 안정', 4: '레벨 4 · 호환성 보장 없음. 언제든 변경될 수 있어 장기 지원이 필요한 곳에는 쓰지 않는 것이 좋음' };
  /* 버전 가용성 문장: 전 버전 제공이면 null */
  App.availText = m => {
    const L = VL.slice().reverse(), has = L.map(v => m.vers.includes(v));
    if (has.every(Boolean)) return null;
    const a = has.indexOf(true), z = has.lastIndexOf(true), first = L[a], last = L[z], latest = L[L.length - 1];
    const contiguous = has.slice(a, z + 1).every(Boolean);
    if (contiguous) { if (last === latest) return `${first}부터`; if (first === L[0]) return `${last}까지 (이후 제거)`; return `${first}–${last}에만 있음`; }
    return m.vers.slice().reverse().join('·') + '에만 있음';
  };
  App.pills = m => `<span class="vpills">${VL.slice().reverse().map(v => `<span class="vp${m.vers.includes(v) ? '' : ' off'}" title="${v}${m.vers.includes(v) ? ' 제공 · ' + m.gv[v] : ' 에는 없음'}">${v}</span>`).join('')}</span>`;
  App.consChips = (m, max) => {
    const f = m.flags || {}, out = [], at = App.availText(m);
    if (at) out.push(`<span class="cons ver">${App.ic('layers', 12)} ${esc(at)}</span>`);
    if (f.dep) out.push(`<span class="cons dep" title="설명에 폐지·제거 예정 표시가 있는 항목">${App.ic('alert', 12)} 폐지 예정 ${f.dep}</span>`);
    if (f.prev) out.push(`<span class="cons prev" title="Technology Preview·알파/베타 수준·기능 게이트가 언급된 항목">${App.ic('flask', 12)} 미리보기 ${f.prev}</span>`);
    if (f.imm) out.push(`<span class="cons imm" title="생성 후 변경할 수 없는 필드·값">${App.ic('lock', 12)} 변경 불가 ${f.imm}</span>`);
    if (f.single) out.push(`<span class="cons misc">${App.ic('hash', 12)} 이름 제약</span>`);
    if (f.excl) out.push(`<span class="cons misc">상호 배타 ${f.excl}</span>`);
    return (max ? out.slice(0, max) : out).join('');
  };

  /* ---------- 테마 · 버전 ---------- */
  App.ver = (VL.includes(LS.get('ver')) ? LS.get('ver') : LATEST);
  const THEMES = ['system', 'light', 'dark'];
  App.theme = LS.get('theme', 'system');
  App.applyTheme = () => {
    const r = document.documentElement; if (App.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', App.theme);
    const b = $('#themebtn'); if (b) { b.innerHTML = App.ic(App.theme === 'dark' ? 'moon' : App.theme === 'light' ? 'sun' : 'monitor', 18); b.title = '테마: ' + ({ system: '시스템', light: '라이트', dark: '다크' })[App.theme] + ' (클릭하여 변경)'; b.setAttribute('aria-label', b.title); }
  };
  App.cycleTheme = () => { App.theme = THEMES[(THEMES.indexOf(App.theme) + 1) % 3]; LS.set('theme', App.theme); App.applyTheme(); App.toast('테마: ' + ({ system: '시스템', light: '라이트', dark: '다크' })[App.theme], 'sun'); if (App.cur) go(); };

  /* ---------- 라우터 ---------- */
  App.parseHash = () => {
    let h = ''; try { h = decodeURIComponent(location.hash.slice(1)); } catch (e) { h = location.hash.slice(1); }
    let v = null; const m = h.match(/^(\d+\.\d+)\/(.*)$/); if (m) { v = m[1]; h = m[2]; }
    const i = h.indexOf(':'); return { v, h, name: i < 0 ? h : h.slice(0, i), arg: i < 0 ? '' : h.slice(i + 1) };
  };
  App.href = h => '#' + App.ver + '/' + (h || '');
  App.nav = h => { location.hash = App.href(h); };
  App.setVer = v => { if (!VL.includes(v)) return; App.ver = v; LS.set('ver', v); $('#ver').value = v; };
  let seq = 0;
  async function go() {
    const my = ++seq, p = App.parseHash();
    if (p.v && VL.includes(p.v) && p.v !== App.ver) App.setVer(p.v);
    try { await App.ready; } catch (e) { return fatal(e); }
    if (my !== seq) return;
    if (App.cleanup) { try { App.cleanup(); } catch (e) { /* 정리 실패 무시 */ } App.cleanup = null; }
    const name = App.views[p.name] ? p.name : (p.name === '' ? 'home' : 'notfound');
    App.cur = name; markNav(name); bar.start();
    document.body.classList.remove('nav-open');
    try { const c = await App.views[name](p.arg, my); if (my === seq && typeof c === 'function') App.cleanup = c; }
    catch (e) { console.error(e); if (my === seq) $('#main').innerHTML = `<div class="page"><div class="empty"><b>화면을 불러오지 못했습니다</b><p class="hint">${esc(e.message)}</p><button class="btn ghost" onclick="location.reload()">새로고침</button></div></div>`; }
    finally { bar.done(); }
  }
  App.go = go;
  const fatal = e => { $('#main').innerHTML = `<div class="page"><div class="empty"><b>데이터를 불러오지 못했습니다</b><p class="hint">${esc(e.message)}</p></div></div>`; };
  App.render = (html, wide) => { const m = $('#main'); m.innerHTML = `<div class="page${wide ? ' wide' : ''}">${html}</div>`; window.scrollTo(0, 0); return m.firstElementChild; };
  App.title = t => { document.title = (t ? t + ' · ' : '') + 'OCP API Book'; };

  /* ---------- 사이드바 ---------- */
  const NAV = [['home', '홈', 'home', ''], ['browse', 'API 탐색', 'book', 'browse'], ['topology', '토폴로지', 'topology', 'topology'], ['sim', '시뮬레이터', 'flask', 'sim'], ['compare', '버전 비교', 'compare', 'compare'], ['guide', '가이드', 'file-text', 'guide']];
  function markNav(name) {
    const map = { home: 'home', browse: 'browse', api: 'browse', topology: 'topology', sim: 'sim', compare: 'compare', guide: 'guide' };
    App.$$('.navitem[data-nav]').forEach(e => { if (e.dataset.nav === map[name]) e.setAttribute('aria-current', 'page'); else e.removeAttribute('aria-current'); });
    App.$$('.sideitem[data-key]').forEach(e => e.setAttribute('aria-current', String(name === 'api' && e.dataset.key === App.curKey)));
  }
  function renderSide() {
    const s = $('#side'); if (!s || !U.byKey) return;
    const fav = App.fav.list().filter(k => U.byKey.has(k)), rec = App.recent.list().filter(k => U.byKey.has(k) && !fav.includes(k)).slice(0, 6);
    const item = k => { const a = U.byKey.get(k); return `<li><a class="sideitem" data-key="${esc(k)}" href="${App.hrefFor(a)}"><span class="k">${esc(a.kind)}</span><span class="n">${esc(a.m.gv[App.pickVer(a.m, App.ver)])}</span></a></li>`; };
    const cats = Object.entries(U.cats).sort((x, y) => (ApiSearch.CAT_KO[x[0]] || x[0]).localeCompare(ApiSearch.CAT_KO[y[0]] || y[0], 'ko'));
    s.innerHTML = `<nav aria-label="주 메뉴"><ul class="navlist">${NAV.map(([id, label, icon, h]) => `<li><a class="navitem" data-nav="${id}" href="${App.href(h)}">${App.ic(icon, 17)}<span>${label}</span></a></li>`).join('')}</ul></nav>
      ${fav.length ? `<div class="sidehead">즐겨찾기</div><ul class="sidelist">${fav.map(item).join('')}</ul>` : ''}
      ${rec.length ? `<div class="sidehead">최근 본 API</div><ul class="sidelist">${rec.map(item).join('')}</ul>` : ''}
      <div class="sidehead">분류</div><ul class="sidelist">${cats.map(([b, n]) => `<li><a class="sideitem" href="${App.href('browse:cat=' + b)}"><span class="k" style="font-family:var(--sans)">${esc(ApiSearch.CAT_KO[b] || b)}</span><span class="n">${n}</span></a></li>`).join('')}</ul>
      <div class="sidefoot"><span>${App.ic('zap', 13)} 색인 ${U.E.stats.tokens.toLocaleString('ko-KR')}단어 · ${Math.round(U.E.stats.buildMs)}ms</span><a href="#" id="helplink">${App.ic('keyboard', 13)} 단축키 보기 (?)</a><a href="https://github.com/yjj3019/OCP-APIBook" target="_blank" rel="noopener">${App.ic('external', 13)} 저장소 · Apache-2.0</a></div>`;
    markNav(App.cur);
  }
  App.renderSide = renderSide;

  /* ---------- 시작 ---------- */
  App.init = () => {
    $('#ver').innerHTML = VL.map(v => `<option value="${v}">${v}</option>`).join(''); $('#ver').value = App.ver;
    App.applyTheme();
    $('#themebtn').addEventListener('click', App.cycleTheme);
    $('#ver').addEventListener('change', e => { const { h } = App.parseHash(); App.setVer(e.target.value); location.hash = App.ver + '/' + h; if (!h) go(); });
    $('#menubtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
    $('#helpbtn').addEventListener('click', () => App.showHelp && App.showHelp());
    document.addEventListener('click', e => { if (e.target.closest('#helplink')) { e.preventDefault(); App.showHelp && App.showHelp(); } });
    window.addEventListener('hashchange', go);
    App.ready = App.boot().then(() => { renderSide(); });
    if (!location.hash) history.replaceState(null, '', '#' + App.ver + '/');
    go();
    (window.requestIdleCallback || (f => setTimeout(f, 1200)))(() => { App.lazy('graph.js', 'viz.js', 'topo.js', 'sim.js').catch(() => {}); });
  };
})();
