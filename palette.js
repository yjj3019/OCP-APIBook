/* 커맨드 팔레트(Ctrl/⌘+K, /), 단축키, 도움말 */
(function () {
  'use strict';
  const App = window.App, $ = App.$, esc = App.esc, ic = App.ic, U = App.U, VL = App.VL;
  let open = false, sel = 0, items = [], prevFocus = null, gTimer = 0, gPending = false;
  const box = () => $('#palette');

  const commands = () => [
    { t: '홈', k: 'home 홈 메인 대시보드', i: 'home', run: () => App.nav('') },
    { t: 'API 탐색', k: 'browse 탐색 목록 필터 검색', i: 'book', run: () => App.nav('browse') },
    { t: '토폴로지', k: 'topology 관계 그래프 연결', i: 'topology', run: () => App.nav('topology') },
    { t: 'API 설계 시뮬레이터', k: 'simulator sim 시뮬레이터 설계 검증 yaml', i: 'flask', run: () => App.nav('sim') },
    { t: '버전 비교', k: 'compare diff 비교 변경 버전', i: 'compare', run: () => App.nav('compare') },
    { t: '가이드', k: 'guide 가이드 호환성 정책 tier', i: 'file-text', run: () => App.nav('guide') },
    { t: '테마 바꾸기 (시스템/라이트/다크)', k: 'theme dark light 다크 라이트 테마', i: 'sun', run: () => App.cycleTheme() },
    ...VL.map(v => ({ t: `문서 버전을 ${v}로 전환`, k: `version 버전 ${v}`, i: 'layers', run: () => { const { h } = App.parseHash(); App.setVer(v); location.hash = v + '/' + h; App.go(); } })),
    { t: '단축키 보기', k: 'help shortcut 단축키 도움말', i: 'keyboard', run: () => App.showHelp() },
  ];

  function build(q) {
    const out = [], E = U.E; q = q.trim();
    if (!q) {
      const favs = App.fav.list().filter(k => U.byKey.has(k)), recs = App.recent.list().filter(k => U.byKey.has(k) && !favs.includes(k)).slice(0, 5);
      if (favs.length) out.push({ g: '즐겨찾기' }, ...favs.slice(0, 5).map(k => ({ type: 'api', a: U.byKey.get(k) })));
      if (recs.length) out.push({ g: '최근 본 API' }, ...recs.map(k => ({ type: 'api', a: U.byKey.get(k) })));
      out.push({ g: '바로가기' }, ...commands().slice(0, 8).map(c => ({ type: 'cmd', c })));
      return { out, P: null, H: s => s };
    }
    const r = E.search(q), P = r.P, H = E.highlighter(P), apis = r.apis.slice(0, 7);
    if (apis.length) out.push({ g: 'API' }, ...apis.map(x => ({ type: 'api', a: x.d.a, d: x.d, P })));
    const fields = [];
    for (const x of r.apis.slice(0, 30)) { const s = E.snippet(x.d, P); if (s.src === '필드 경로' && fields.length < 4) fields.push({ type: 'field', a: x.d.a, text: s.text }); }
    if (fields.length) out.push({ g: '필드' }, ...fields);
    if (r.guide.length) out.push({ g: '가이드' }, ...r.guide.slice(0, 3).map(x => ({ type: 'guide', g2: x.g })));
    const ql = q.toLowerCase(), cmds = commands().filter(c => (c.t + ' ' + c.k).toLowerCase().includes(ql)).slice(0, 4);
    if (cmds.length) out.push({ g: '이동 · 동작' }, ...cmds.map(c => ({ type: 'cmd', c })));
    if (!out.length) out.push({ empty: true });
    return { out, P, H };
  }
  function itemHTML(it, i, H) {
    if (it.g) return `<div class="palgrp">${it.g}</div>`;
    if (it.empty) return `<div class="empty" style="padding:28px 12px"><b>결과가 없습니다.</b><p class="hint">다른 단어로 검색해 보세요.</p></div>`;
    const sl = `role="option" data-i="${i}" aria-selected="${i === sel}"`;
    if (it.type === 'cmd') return `<button class="palit" ${sl}><span class="pi">${ic(it.c.i, 15)}</span><span class="pt"><b style="font-family:var(--sans);font-weight:500">${esc(it.c.t)}</b></span></button>`;
    if (it.type === 'guide') return `<button class="palit" ${sl}><span class="pi">${ic('file-text', 15)}</span><span class="pt"><b style="font-family:var(--sans);font-weight:500">${App.hlz(it.g2.title, H)}</b><small>가이드</small></span></button>`;
    const a = it.a, gv = (a.group ? a.group + '/' : '') + a.m.gv[App.pickVer(a.m, App.ver)];
    if (it.type === 'field') return `<button class="palit" ${sl}><span class="pi">${ic('list', 15)}</span><span class="pt"><b>${esc(a.kind)}</b><small>${App.hlz(it.text, H)}</small></span><span class="pr"><span class="badge mono">필드</span></span></button>`;
    const at = App.availText(a.m), s = it.d && it.P ? U.E.snippet(it.d, it.P) : { text: App.firstSent(a.d && a.d.desc) };
    return `<button class="palit" ${sl}><span class="pi">${ic('box', 15)}</span><span class="pt"><b>${App.hlz(a.kind, H)}</b> <span class="gv">${esc(gv)}</span><small>${App.hlz(App.short(s.text, 110), H)}</small></span><span class="pr">${at ? `<span class="cons ver">${esc(at)}</span>` : ''}<span class="badge ${App.stab(a.m.gv[App.pickVer(a.m, App.ver)])}">${App.STAB[App.stab(a.m.gv[App.pickVer(a.m, App.ver)])][0]}</span></span></button>`;
  }
  let H = s => s;
  function render() {
    const q = $('#palin').value, r = build(q); H = r.H; items = r.out; const act = items.filter(x => x.type);
    sel = Math.min(sel, Math.max(0, items.length - 1)); while (items[sel] && !items[sel].type && sel < items.length - 1) sel++;
    $('#palres').innerHTML = items.map((it, i) => itemHTML(it, i, H)).join('');
    $('#palres').setAttribute('role', 'listbox');
  }
  function move(d) {
    const idx = items.map((x, i) => x.type ? i : -1).filter(i => i >= 0); if (!idx.length) return;
    const p = idx.indexOf(sel); sel = idx[(p + d + idx.length) % idx.length] ?? idx[0];
    App.$$('#palres .palit').forEach(b => b.setAttribute('aria-selected', +b.dataset.i === sel));
    const b = $('#palres .palit[aria-selected="true"]'); if (b) b.scrollIntoView({ block: 'nearest' });
  }
  function run(i, mod) {
    const it = items[i]; if (!it || !it.type) return; close();
    if (it.type === 'cmd') return it.c.run();
    if (it.type === 'guide') return App.nav('guide:' + it.g2.id);
    const a = it.a, v = App.pickVer(a.m, App.ver);
    if (mod) return App.nav('sim:' + a.m.id[v]);
    location.hash = App.hrefFor(a);
  }
  App.openPalette = (initial) => {
    if (open) return; open = true; prevFocus = document.activeElement; const b = box(); b.hidden = false;
    const inp = $('#palin'); inp.value = initial || ''; sel = 0; render(); setTimeout(() => inp.focus(), 0);
  };
  function close() { if (!open) return; open = false; box().hidden = true; if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* 무시 */ } }
  App.closePalette = close;

  App.showHelp = () => {
    const h = $('#help'); if (!h.hidden) { h.hidden = true; return; }
    const K = (...k) => k.map(x => `<kbd>${x}</kbd>`).join('');
    h.innerHTML = `<div class="helpbox" role="dialog" aria-modal="true" aria-label="단축키"><div style="display:flex;align-items:center"><h3 style="margin:0">단축키</h3><button class="iconbtn" style="margin-left:auto" id="helpx" aria-label="닫기">${ic('x', 18)}</button></div>
      <dl class="keys" style="margin-top:14px"><dt>${K('Ctrl', 'K')} ${K('/')}</dt><dd>검색 팔레트 열기</dd>
      <dt>${K('↑')} ${K('↓')} ${K('Enter')}</dt><dd>결과 이동 · 열기</dd>
      <dt>${K('Ctrl', 'Enter')}</dt><dd>팔레트에서 시뮬레이터로 열기</dd>
      <dt>${K('g')} ${K('h')}</dt><dd>홈</dd><dt>${K('g')} ${K('b')}</dt><dd>API 탐색</dd><dt>${K('g')} ${K('t')}</dt><dd>토폴로지</dd>
      <dt>${K('g')} ${K('s')}</dt><dd>시뮬레이터</dd><dt>${K('g')} ${K('c')}</dt><dd>버전 비교</dd><dt>${K('g')} ${K('g')}</dt><dd>가이드</dd>
      <dt>${K('f')}</dt><dd>API 상세에서 즐겨찾기 토글</dd><dt>${K('s')}</dt><dd>API 상세에서 시뮬레이터로 설계</dd>
      <dt>${K('?')}</dt><dd>이 도움말</dd><dt>${K('Esc')}</dt><dd>닫기</dd></dl>
      <p class="note" style="margin-top:16px">${ic('zap', 13)} 색인 ${U.E ? U.E.stats.tokens.toLocaleString('ko-KR') : '-'}단어 · 생성 ${U.E ? Math.round(U.E.stats.buildMs) : '-'}ms · 데이터 로딩 ${Math.round(App.bootMs || 0)}ms</p></div>`;
    h.hidden = false; $('#helpx').focus();
    h.onclick = e => { if (e.target === h || e.target.closest('#helpx')) h.hidden = true; };
  };

  document.addEventListener('DOMContentLoaded', () => {
    const inp = $('#palin');
    inp.addEventListener('input', () => { sel = 0; render(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel, e.ctrlKey || e.metaKey); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    $('#palres').addEventListener('click', e => { const b = e.target.closest('.palit'); if (b) run(+b.dataset.i, e.ctrlKey || e.metaKey); });
    $('#palette').addEventListener('mousedown', e => { if (e.target === $('#palette')) close(); });
    $('#searchbtn').addEventListener('click', () => App.openPalette());
  });
  const typing = el => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open ? close() : App.openPalette(); return; }
    if (e.key === 'Escape') { const h = $('#help'); if (h && !h.hidden) { h.hidden = true; return; } if (open) { close(); return; } document.body.classList.remove('nav-open'); return; }
    if (typing(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey || open) return;
    if (e.key === '/') { e.preventDefault(); App.openPalette(); return; }
    if (e.key === '?') { e.preventDefault(); App.showHelp(); return; }
    if (gPending) {
      gPending = false; clearTimeout(gTimer);
      const m = { h: '', b: 'browse', t: 'topology', s: 'sim', c: 'compare', g: 'guide' }[e.key]; if (m !== undefined) { e.preventDefault(); App.nav(m); } return;
    }
    if (e.key === 'g') { gPending = true; gTimer = setTimeout(() => { gPending = false; }, 1000); return; }
    if (App.cur === 'api') {
      if (e.key === 'f') { const b = $('#favb'); if (b) b.click(); } else if (e.key === 's') { const b = $('#tosim') || document.querySelector('.dact a.btn.primary'); if (b) b.click(); }
    }
  });
})();
