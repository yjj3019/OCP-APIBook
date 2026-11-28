// SPDX-License-Identifier: Apache-2.0
/* 화면들: 홈 · 탐색 · API 상세 · 버전 비교 · 가이드 · 토폴로지 · 시뮬레이터 */
(function () {
  'use strict';
  const ui = window.ApiBookLocale.text;
  const App = window.App, $ = App.$, esc = App.esc, ic = App.ic, MG = App.MG, VL = App.VL, U = App.U;
  const CAT = App.categories, V = App.views;
  const CAT_IC = { network_apis: 'network', monitoring_apis: 'activity', metadata_apis: 'tag', config_apis: 'settings', extension_apis: 'package', schedule_and_quota_apis: 'clock', operator_apis: 'cpu', provisioning_apis: 'server', template_apis: 'file-text', workloads_apis: 'box', operatorhub_apis: 'layers', security_apis: 'shield', autoscale_apis: 'zap', role_apis: 'users', rbac_apis: 'lock', console_apis: 'terminal', machine_apis: 'hard-drive', storage_apis: 'database', policy_apis: 'list', user_and_group_apis: 'users', image_apis: 'package', authorization_apis: 'lock', node_apis: 'cpu', oauth_apis: 'lock', project_apis: 'folder' };
  const catName = b => CAT[b] || String(b).replace(/_apis$/, '').replace(/_/g, ' ');
  const bset = (a, ver) => App.pickVer(a.m, ver || App.ver);
  const gvOf = (a, ver) => { const v = bset(a, ver); return (a.group ? a.group + '/' : '') + a.m.gv[v]; };
  const docLike = a => ({ a, gv: (a.group ? a.group + '/' : '') + a.version, low: a.kind.toLowerCase(), ns: a.d && a.d.eps.some(e => e.p.includes('{namespace}')) });
  const stabBadge = (a, ver) => { const s = App.stab(a.m.gv[bset(a, ver)]); return `<span class="badge ${s}" title="${esc(App.STAB[s][1])}">${App.STAB[s][0]}</span>`; };
  const scopeBadge = a => a.m.ns === true ? ui('<span class="badge">네임스페이스</span>') : a.m.ns === false ? ui('<span class="badge">클러스터</span>') : '';
  const diffSets = (from, to) => {
    const A = [], R = [], C = [], S = [];
    for (const [k, m] of Object.entries(MG.apis)) {
      const x = m.vers.includes(from), y = m.vers.includes(to);
      if (y && !x) A.push(k); else if (x && !y) R.push(k);
      else if (x && y) (m.fp[from] === m.fp[to] && m.gv[from] === m.gv[to] ? S : C).push(k);
    }
    return { A, R, C, S };
  };


  /* ====================== 홈 ====================== */
  function savedResourceList() {
    const favs = App.fav.list().filter(k => U.byKey.has(k));
    const recent = App.recent.list().filter(k => U.byKey.has(k) && !favs.includes(k)).slice(0, 6);
    const resourceLink = k => {
      const a = U.byKey.get(k);
      return `<a class="lrow" href="${App.hrefFor(a)}"><span class="k">${esc(a.kind)}</span>${stabBadge(a)}<span class="g">${esc(a.group || 'core')}</span></a>`;
    };
    return `${favs.length ? ui('<h3>즐겨찾기</h3>') + favs.map(resourceLink).join('') : ''}
          ${recent.length ? ui('<h3>최근 본 API</h3>') + recent.map(resourceLink).join('') : ''}
          ${favs.length || recent.length ? '' : ui`<p>최근 본 API가 여기에 표시됩니다. 상세 화면에서 별표를 누르면 즐겨찾기에 저장됩니다.</p><a class="dash-link" href="${App.href('browse')}">API 탐색 ${ic('arrow-right', 14)}</a>`}`;
  }

  function setFavoriteButton(button, on) {
    button.setAttribute('aria-pressed', on);
    button.innerHTML = `${ic(on ? 'star-fill' : 'star', 15)} <span>${on ? ui('즐겨찾기됨') : ui('즐겨찾기')}</span>`;
  }

  App.refreshPersonalViews = () => {
    const saved = $('#saved-resources');
    if (saved) saved.innerHTML = savedResourceList();
    const favorite = $('#favb');
    if (favorite) setFavoriteButton(favorite, App.fav.has(App.curKey));
    App.renderSide();
  };

  V.home = async () => {
    App.title(''); App.curKey = null;
    const apis = Object.values(MG.apis);
    const tools = [
      ['topology', ui('토폴로지'), ui('3D 그래프에서 리소스 관계 추적'), 'topology'],
      ['sim', ui('설계 시뮬레이터'), ui('YAML 작성과 스키마 검증'), 'flask'],
      ['compare', ui('버전 비교'), ui('릴리스 사이의 API 변경 확인'), 'compare'],
      ['guide', ui('가이드'), ui('API 지원 단계와 호환성 정책'), 'file-text']
    ];
    const sel = App.ver, index = VL.indexOf(sel);
    const from = VL[index + 1] || sel, to = VL[index + 1] ? sel : (VL[index - 1] || sel);
    const ds = diffSets(from, to);
    const compareLink = tab => esc(App.href('compare:from=' + from + '&to=' + to + '&tab=' + tab));
    const releases = VL.map(version => ({ version, count: apis.filter(a => a.vers.includes(version)).length }));
    const largest = Math.max(1, ...releases.map(r => r.count));
    const cats = Object.entries(U.cats).sort((a, b) => b[1] - a[1] || catName(a[0]).localeCompare(catName(b[0]), App.locale));
    const catLink = ([id, count]) => `<a class="catalog-topic" href="${App.href('browse:cat=' + id)}">
      ${ic(CAT_IC[id] || 'box', 18)}<span>${esc(catName(id))}</span><small>${count} ${App.locale === 'en' && count !== 1 ? 'APIs' : 'API'}</small>${ic('chevron-right', 14)}</a>`;
    const page = App.render(ui`
      <section class="catalog-hero" aria-labelledby="catalog-heading">
        <div class="catalog-intro">
          <h1 id="catalog-heading">API 레퍼런스</h1>
          <p class="catalog-lead">리소스와 필드를 찾고, 릴리스별 스키마를 확인하세요.</p>
          <form class="catalog-search" id="catalog-search" role="search" aria-label="API 카탈로그 검색">
            ${ic('search', 20)}<input type="search" id="home-query" aria-label="API 이름 또는 필드 경로" placeholder="API명 또는 필드 경로" autocomplete="off" spellcheck="false">
            <button type="submit">검색</button>
          </form>
          <div class="query-examples"><span>검색 예시</span>${['Route', 'spec.tls', ui('네트워크 정책')].map(q => `<a href="${App.href('browse:q=' + encodeURIComponent(q))}">${esc(q)}</a>`).join('')}</div>
        </div>
        <section class="release-chart" aria-labelledby="release-chart-title">
          <h2 id="release-chart-title">릴리스별 API 수</h2>
          <ul>${releases.map(({ version, count }) => ui`<li><a href="#${esc(version)}/home" aria-label="OCP ${esc(version)} 기준으로 보기, API ${count}개"${version === sel ? ' aria-current="true"' : ''}>
            <span class="release-label">${esc(version)}</span><span class="release-track" aria-hidden="true"><i style="width:${100 * count / largest}%"></i></span><b>${count}</b>
          </a></li>`).join('')}</ul>
        </section>
      </section>
      <dl class="catalog-totals" aria-label="전체 릴리스 통합 색인">
        ${[['book', ui('통합 API'), apis.length], ['list', ui('필드 경로'), U.fieldCount], ['shield', ui('제약 사항'), U.consCount], ['layers', ui('수록 릴리스'), VL.length]].map(([icon, label, value]) => `<div><dt>${ic(icon, 15)}${label}</dt><dd>${App.fmt(value)}</dd></div>`).join('')}
      </dl>
      <section aria-labelledby="work-tools"><h2 class="dash-heading" id="work-tools">작업 도구</h2>
        <div class="work-tools">${tools.map(([id, label, desc, icon]) => `<a class="work-tool" href="${App.href(id)}">
          <span class="tool-icon" data-tool="${id}">${ic(icon, 19)}</span>${ic('arrow-right', 16)}<b>${label}</b><span class="tool-desc">${desc}</span></a>`).join('')}</div>
      </section>
      <div class="catalog-panels">
        <div class="catalog-workspace"><section class="dash-panel release-panel"><div class="dash-panel-title"><h2>릴리스 변경</h2>
          <a class="dash-link" href="${compareLink('changed')}">비교 열기 ${ic('arrow-right', 14)}</a></div>
          <p class="compare-pair"><span>OCP ${esc(from)}</span> ${ic('arrow-right', 18)} <strong>OCP ${esc(to)}</strong></p>
          <div class="change-links">${[['added', ui('추가'), ds.A], ['removed', ui('삭제'), ds.R], ['changed', ui('변경'), ds.C]].map(([tab, label, arr]) => `<a href="${compareLink(tab)}"><span>${label}</span><b>${arr.length}</b></a>`).join('')}</div>
          ${ds.A.length || ds.R.length ? ui`<details class="release-notes"><summary>추가·삭제된 API 이름</summary>
            ${[[ui('추가'), ds.A], [ui('삭제'), ds.R]].filter(([, items]) => items.length).map(([label, items]) => `<p><b>${label}</b> ${items.map(key => esc(key.split('|')[0])).join(', ')}</p>`).join('')}</details>` : ''}
        </section>
        <section class="dash-panel saved-panel"><div class="dash-panel-title"><h2>내 API</h2>${ic('star', 17)}</div>
          <div id="saved-resources">${savedResourceList()}</div>
        </section></div>
        <section class="dash-panel topics-panel"><div class="dash-panel-title"><h2>API 분류</h2><span>${cats.length}개 분류</span></div>
          <div class="topic-list">${cats.slice(0, 6).map(catLink).join('')}</div>
          ${cats.length > 6 ? ui`<details class="more-topics"><summary>나머지 ${cats.length - 6}개 분류</summary><div class="topic-list">${cats.slice(6).map(catLink).join('')}</div></details>` : ''}
        </section>
      </div>`);
    page.classList.add('catalog-home');
    const sourcePanel = document.createElement('details');
    sourcePanel.className = 'epd'; sourcePanel.innerHTML = ui('<summary>카탈로그 원본과 갱신 상태</summary><div class="in" id="catalog-source"></div>');
    page.appendChild(sourcePanel);
    const showSource = async () => {
      if (!sourcePanel.open) return;
      sourcePanel.removeEventListener('toggle', showSource);
      const box = sourcePanel.querySelector('#catalog-source');
      try {
        await App.lazy('data/versions.js');
        const source = window.VERSIONS.sources[sel];
        const repo = 'https://github.com/openshift/openshift-docs';
        box.innerHTML = '<p>' + esc(sel) + ui(' 수록 원본 · <a href="') + repo + '/commit/' + esc(source.revision) + '">' + esc(source.revision.slice(0, 12)) +
          '</a> · ' + esc(source.revisionDate.slice(0, 10)) + ui('</p><button class="btn ghost" type="button">GitHub에서 최신 원본 확인</button>') +
          ui('<p role="status"></p><a href="https://github.com/yjj3019/OCP-APIBook/pulls?q=is%3Apr+is%3Aopen+head%3Aautomation%2Frefresh-api-catalog">검토 중인 카탈로그 갱신 PR</a>');
        const btn = box.querySelector('button'), status = box.querySelector('[role=status]');
        btn.onclick = async () => {
          btn.disabled = true; status.textContent = ui('원본 커밋 조회 중…');
          try {
            const url = 'https://api.github.com/repos/openshift/openshift-docs/commits/' + encodeURIComponent(source.branch);
            const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(10000) });
            if (!res.ok) throw new Error(String(res.status));
            const { sha } = await res.json();
            if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(ui('원본 커밋 형식 오류'));
            const link = document.createElement('a'); link.href = repo + '/commit/' + sha; link.textContent = sha.slice(0, 12);
            status.replaceChildren(sha === source.revision ? ui('수록 원본과 일치합니다 · ') : ui('새 원본 커밋이 있습니다 · '), link);
          } catch { status.textContent = ui('최신 원본을 확인하지 못했습니다. 네트워크 연결 또는 GitHub 요청 한도를 확인한 뒤 다시 시도하세요.'); }
          finally { btn.disabled = false; }
        };
      } catch {
        box.textContent = ui('원본 기록을 열 수 없습니다. 접었다가 다시 열어 주세요.');
        sourcePanel.addEventListener('toggle', showSource);
      }
    };
    sourcePanel.addEventListener('toggle', showSource);
    $('#catalog-search').addEventListener('submit', event => {
      event.preventDefault();
      const query = $('#home-query').value.trim();
      location.hash = App.href(query ? 'browse:q=' + encodeURIComponent(query) : 'browse');
    });
    $('#main .page').insertAdjacentHTML('beforeend', ui('<p class="foot note" style="margin-top:34px">비공식 프로젝트이며 원문 문서의 저작자와 제휴·보증 관계가 없습니다. API 내용은 Apache-2.0으로 공개된 문서에서 수집해 변형했습니다. <a href="#" id="aboutlink2">정보 · 고지</a></p>'));
    $('#aboutlink2').addEventListener('click', e => { e.preventDefault(); App.showAbout(); });
  };

  /* ====================== 탐색 ====================== */
  const parseQS = s => { const o = {}; (s || '').split('&').forEach(p => { if (!p) return; const i = p.indexOf('='); o[App.dec(i < 0 ? p : p.slice(0, i))] = i < 0 ? '' : App.dec(p.slice(i + 1)); }); return o; };
  const rowHTML = (r, i, P, H, q) => {
    const a = r.d.a, m = a.m, s = q ? U.E.snippet(r.d, P) : { text: App.firstSent(a.d && a.d.desc.replace(/Compatibility level.*$/s, '')), src: '설명' };
    const v = App.fieldRelease(r.fieldVersions);
    return `<li><a class="row" data-i="${i}" href="${App.hrefFor(a, v)}"><div class="l1"><span class="kind">${App.hlz(a.kind, H)}</span><span class="gv">${App.hlz(gvOf(a, v), H)}</span>${stabBadge(a, v)}${scopeBadge(a)}<span class="badge">${esc(catName(a.book))}</span></div>
      <p class="snip">${v ? ui`<em>필드 · ${r.fieldVersions.join(" · ")}</em>` : s.src !== '설명' ? ui('<em>필드</em>') : ''}${App.hlz(s.text, H)}</p><div class="l2">${App.pills(m)}${App.consChips(m, 4)}</div></a></li>`;
  };
  V.browse = async (arg, my) => {
    App.title(ui('API 탐색')); App.curKey = null;
    const st = Object.assign({ q: '', cat: '', sc: '', st: '', cn: '', sort: '' }, parseQS(arg)), E = U.E;
    const opt = (v, l, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`;
    const fsel = (id, label, opts) => `<label class="fchip${st[id] ? ' on' : ''}" id="f-${id}">${label}<select data-f="${id}" aria-label="${label}">${opts}</select></label>`;
    const catOpts = opt('', ui('전체'), st.cat) + Object.keys(U.cats).sort((x, y) => catName(x).localeCompare(catName(y), App.locale)).map(b => opt(b, `${catName(b)} (${U.cats[b]})`, st.cat)).join('');
    App.render(ui`<div class="pagehead"><div class="eyebrow">API 탐색</div><h1>모든 버전을 한 번에 검색</h1><p>같은 API는 버전과 관계없이 한 번만 나오고, 제공 버전과 제약·제한 사항이 함께 표시됩니다. 필드 이름·설명·한글 키워드도 검색됩니다.</p></div>
      <div class="browsebar"><div class="qbox">${ic('search', 17)}<input id="bq" type="search" autocomplete="off" spellcheck="false" placeholder="API 이름, 그룹, 필드(spec.tls), 한글 키워드, deprecated …" value="${esc(st.q)}" aria-label="API 검색"><button class="x" id="bx" aria-label="지우기" ${st.q ? '' : 'hidden'}>${ic('x', 15)}</button></div>
        <label class="fchip">정렬<select data-f="sort" aria-label="정렬">${opt('', ui('관련도/이름'), st.sort)}${opt('name', ui('이름순'), st.sort)}${opt('group', ui('그룹순'), st.sort)}${opt('new', ui('신규 우선'), st.sort)}</select></label></div>
      <div class="filters">${fsel('cat', ui('분류'), catOpts)}
        ${fsel('sc', ui('범위'), opt('', ui('전체'), st.sc) + opt('ns', ui('네임스페이스'), st.sc) + opt('cl', ui('클러스터'), st.sc))}
        ${fsel('st', ui('안정성'), opt('', ui('전체'), st.st) + opt('ga', 'GA', st.st) + opt('beta', 'Beta', st.st) + opt('alpha', 'Alpha', st.st))}
        ${fsel('cn', ui('제약'), opt('', ui('전체'), st.cn) + opt('dep', ui('폐지 예정 있음'), st.cn) + opt('prev', ui('미리보기·기능 게이트'), st.cn) + opt('imm', ui('변경 불가 필드'), st.cn) + opt('ver', ui('일부 버전에만 제공'), st.cn))}
        <button class="btn ghost sm" id="fclr" hidden>${ic('x', 13)} 필터 초기화</button></div>
      <div class="count" id="bc" aria-live="polite"></div><ul class="list" id="bl"></ul><div id="bm" style="margin-top:12px;text-align:center"></div><div id="bg"></div>`);
    let cur = -1, shown = [], limit = 60, rows = [], P = null, H = null;
    const pageSize = 120;
    const renderMore = () => {
      const next = Math.min(pageSize, rows.length - shown.length);
      $('#bm').innerHTML = next ? ui`<button class="btn ghost" id="more">${ic('chevron-down', 14)} ${next}개 더 보기</button>` : '';
    };
    const apply = () => {
      const q = st.q.trim(), r = E.search(q, { cat: st.cat });
      P = r.P; H = E.highlighter(P);
      let list = r.apis.filter(x => {
        const a = x.d.a, m = a.m, f = m.constraintTotals || m.flags || {};
        if (st.sc === 'ns' && m.ns !== true) return false; if (st.sc === 'cl' && m.ns !== false) return false;
        if (st.st && App.stab(m.gv[App.fieldRelease(x.fieldVersions) || App.pickVer(m, App.ver)]) !== st.st) return false;
        if (st.cn === 'dep' && !f.dep) return false; if (st.cn === 'prev' && !f.prev) return false; if (st.cn === 'imm' && !f.imm) return false;
        if (st.cn === 'ver' && !App.availText(m)) return false;
        return true;
      });
      if (st.sort === 'name' || (!q && !st.sort)) list = list.slice().sort((x, y) => x.d.a.kind.localeCompare(y.d.a.kind));
      else if (st.sort === 'group') list = list.slice().sort((x, y) => (x.d.a.group + x.d.a.kind).localeCompare(y.d.a.group + y.d.a.kind));
      else if (st.sort === 'new') { const born = m => (m.vers.includes(VL[0]) ? 0 : 100) + VL.indexOf(m.vers[m.vers.length - 1]); list = list.slice().sort((x, y) => (born(x.d.a.m) - born(y.d.a.m)) || x.d.a.kind.localeCompare(y.d.a.kind)); }
      rows = list; shown = rows.slice(0, limit); cur = rows.length && q ? 0 : -1;
      const anyF = st.cat || st.sc || st.st || st.cn;
      $('#fclr').hidden = !anyF; ['cat', 'sc', 'st', 'cn'].forEach(k => $('#f-' + k).classList.toggle('on', !!st[k]));
      $('#bx').hidden = !st.q;
      $('#bc').innerHTML = ui`<span><b>${rows.length}</b>개 API</span> <span class="badge info">${VL.join(' · ')} 통합</span>${r.relaxed ? ui(' <span class="badge beta">일부 단어만 일치한 결과 포함</span>') : ''}`;
      if (!rows.length) {
        const sg = q ? E.suggest(q) : [];
        $('#bl').innerHTML = ui`<li class="empty"><b>${q ? `‘${esc(q)}’` : ui('조건')}</b>에 맞는 API가 없습니다.${sg.length ? ui`<p class="hint">혹시 이것인가요? ${sg.map(d => `<a href="${App.href('browse:q=' + encodeURIComponent(d.a.kind))}">${esc(d.a.kind)}</a>`).join(' · ')}</p>` : ui('<p class="hint">검색어를 줄이거나 필터를 해제해 보세요.</p>')}</li>`;
      } else $('#bl').innerHTML = shown.map((x, i) => rowHTML(x, i, P, H, q)).join('');
      renderMore();
      const g = $('#bg'); g.innerHTML = q && r.guide.length ? ui`<div class="sec-title">가이드 문서</div><ul class="list guidelist">${r.guide.map(x => `<li><a class="row" href="${App.href('guide:' + x.g.id)}"><div class="l1"><span style="font-weight:500">${App.hlz(x.g.title, H)}</span></div></a></li>`).join('')}</ul>` : '';
      mark(true);
    };
    const mark = (noScroll) => { App.$$('#bl .row').forEach((e, i) => e.classList.toggle('cur', i === cur)); const c = $('#bl .row.cur'); if (c && !noScroll) c.scrollIntoView({ block: 'nearest' }); };
    const sync = () => { const qs = Object.entries(st).filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'); history.replaceState(null, '', App.href('browse' + (qs ? ':' + qs : ''))); };
    let raf = 0; const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (my !== undefined && my !== App.activeSeq) return; if (!document.body.contains($('#bq'))) return; limit = 60; apply(); sync(); }); };
    $('#bq').addEventListener('input', e => { st.q = e.target.value; later(); });
    $('#bq').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!shown.length) return; e.preventDefault(); cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; mark(); }
      else if (e.key === 'Enter' && cur >= 0 && shown[cur]) location.hash = App.hrefFor(shown[cur].d.a, App.fieldRelease(shown[cur].fieldVersions));
      else if (e.key === 'Escape' && st.q) { st.q = ''; e.target.value = ''; later(); }
    });
    $('#bx').addEventListener('click', () => { st.q = ''; $('#bq').value = ''; $('#bq').focus(); later(); });
    App.$$('select[data-f]').forEach(s => s.addEventListener('change', () => { st[s.dataset.f] = s.value; later(); }));
    $('#fclr').addEventListener('click', () => { st.cat = st.sc = st.st = st.cn = ''; App.$$('select[data-f]').forEach(s => { if (s.dataset.f !== 'sort') s.value = ''; }); later(); });
    $('#bm').addEventListener('click', e => {
      if (!e.target.closest('#more')) return;
      const from = shown.length; limit += pageSize; shown = rows.slice(0, limit);
      $('#bl').insertAdjacentHTML('beforeend', shown.slice(from).map((x, i) => rowHTML(x, from + i, P, H, st.q.trim())).join(''));
      renderMore();
      mark(true); const nx = App.$$('#bl .row')[from]; if (nx) nx.focus({ preventScroll: true });
    });
    $('#bl').addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const rows = App.$$('#bl .row'), i = rows.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); const nx = rows[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (nx) nx.focus(); else if (e.key === 'ArrowUp') $('#bq').focus();
    });
    apply(); if (!st.q) $('#bq').focus({ preventScroll: true });
  };

  /* ====================== API 상세 ====================== */
  const nameHint = window.ApiBookLocale.choice('<이름>', '<name>');
  const namespaceHint = window.ApiBookLocale.choice('<네임스페이스>', '<namespace>');
  const yamlFull = (d, F) => {
    const a = d.a, byPath = F ? new Map(F.map(f => [f.p, f])) : new Map(), PR = /^(string|integer|number|boolean)/i;
    const rowsOf = p => p === '' ? a.d.props.map(x => [x.n, x.t]) : (byPath.get(p) ? byPath.get(p).r : []), reqOf = p => p === '' ? a.d.required : (byPath.get(p) ? byPath.get(p).q : []);
    const ph = (t, n) => { t = (t || '').toLowerCase(); if (t.startsWith('string')) return `"<${n}>"`; if (/^(integer|number)/.test(t)) return '0'; if (t.startsWith('boolean')) return 'false'; if (t.startsWith('array')) return '[]'; if (/^(time|microtime)$/.test(t)) return '"2025-01-01T00:00:00Z"'; if (/^(duration|quantity|intorstring)$/.test(t)) return `"<${n}>"`; return '{}'; };
    function obj(path, ind, depth) {
      const out = [], rows = rowsOf(path), pad = ' '.repeat(ind);
      for (const name of reqOf(path)) {
        if (path === '' && ['apiVersion', 'kind', 'metadata'].includes(name)) continue;
        const row = rows.find(r => r[0] === name), t = row ? row[1] : '', cp = path + '.' + name;
        if (/^array/i.test(t) && !PR.test(t.replace(/^array\s*\(?/i, ''))) {
          const ip = cp + '[]', item = depth < 6 && byPath.has(ip) ? obj(ip, ind + 4, depth + 1) : [];
          if (item.length) { item[0] = ' '.repeat(ind + 2) + '- ' + item[0].trimStart(); out.push(pad + name + ':', ...item); } else out.push(pad + name + ': []');
        } else if (/^object$/i.test(t) || (byPath.has(cp) && !PR.test(t))) {
          const sub = depth < 6 ? obj(cp, ind + 2, depth + 1) : []; if (sub.length) out.push(pad + name + ':', ...sub); else out.push(pad + name + ': {}');
        } else out.push(pad + name + ': ' + ph(t, name));
      }
      return out;
    }
    const head = [`apiVersion: ${d.gv}`, `kind: ${a.kind}`, 'metadata:', '  name: ' + nameHint]; if (d.ns) head.push('  namespace: ' + namespaceHint);
    const body = obj('', 0, 0); if (!body.length && a.d.props.some(p => p.n === 'spec')) body.push(ui("spec: {}   # 필드는 아래 '필드' 참고"));
    return head.concat(body).join('\n');
  };
  const ocFor = d => {
    const a = d.a, ops = ApiEndpoints.operations(a), blocks = [];
    const add = (label, command) => blocks.push('# ' + ui(label) + '\n' + command);
    const raw = op => "'" + op.p.replace('{namespace}', namespaceHint).replace('{name}', nameHint) + "'";
    const sub = op => op && op.p.includes('/{name}/');
    const ns = op => op.p.includes('{namespace}') ? " -n '" + namespaceHint + "'" : '';
    const r = d.low + (a.group ? '.' + a.group : ''), file = d.low + '.yaml';
    const item = op => r + " '" + nameHint + "'" + ns(op);
    if (ops.list) add('목록 보기', 'oc get ' + r + (ns(ops.list) || (d.ns ? ' -A' : '')));
    if (ops.get) add('하나 자세히 보기', sub(ops.get) ? 'oc get --raw ' + raw(ops.get) : 'oc get ' + item(ops.get) + ' -o yaml');
    if ([ops.list, ops.get, ops.create].some(op => op && !sub(op))) {
      const explain = 'oc explain ' + r + ' --api-version=' + d.gv;
      const spec = a.d.props.some(p => p.n === 'spec') ? '\noc explain ' + r + '.spec --api-version=' + d.gv : '';
      add('필드 설명 보기', explain + spec);
    }
    if (ops.create) {
      if (sub(ops.create)) {
        add('생성 (POST)', '# ' + ui('요청 본문은 JSON 파일로 저장하세요.') + '\noc create --raw ' + raw(ops.create) + ' -f ' + d.low + '.json');
      } else if (ops.get && !sub(ops.get) && ops.patch && !sub(ops.patch)) {
        add('서버에서 검증', 'oc apply --dry-run=server -f ' + file);
        add('만들기·수정', 'oc apply -f ' + file);
      } else {
        add('생성 (POST)', 'oc create -f ' + file);
      }
    }
    if (sub(ops.replace)) add('전체 교체 (PUT)', '# ' + ui('요청 본문은 JSON 파일로 저장하세요.') + '\noc replace --raw ' + raw(ops.replace) + ' -f ' + d.low + '.json');
    if (ops.get && !sub(ops.get) && ops.patch && !sub(ops.patch)) add('편집', 'oc edit ' + item(ops.patch));
    if (ops.delete) add('삭제 (DELETE)', sub(ops.delete) ? 'oc delete --raw ' + raw(ops.delete) : 'oc delete ' + item(ops.delete));
    return blocks.join('\n\n') || ui('# 이 API의 문서에서 요청 예시를 찾지 못했습니다.');
  };
  const restFor = d => {
    const ops = ApiEndpoints.operations(d.a);
    const fill = p => p.replace('{namespace}', namespaceHint).replace('{name}', nameHint);
    if (!Object.values(ops).some(Boolean)) return ui('# 이 API의 문서에서 요청 예시를 찾지 못했습니다.');
    const H = '-H "Authorization: Bearer $TOKEN"'; let s = 'TOKEN=$(oc whoami -t)\nAPISERVER=$(oc whoami --show-server)\n';
    if (ops.list) s += ui`\n# 목록 조회\ncurl -sS ${H} "$APISERVER${fill(ops.list.p)}"`;
    if (ops.get) s += ui`\n\n# 하나 조회\ncurl -sS ${H} "$APISERVER${fill(ops.get.p)}"`;
    if (ops.create) s += ui`\n\n# 생성 (본문은 위 YAML 파일)\ncurl -sS -X POST ${H} -H "Content-Type: application/yaml" --data-binary @${d.low}.yaml \\\n  "$APISERVER${fill(ops.create.p)}?fieldValidation=Strict"`;
    if (ops.patch) s += ui`\n\n# 일부만 수정 (merge patch)\ncurl -sS -X PATCH ${H} -H "Content-Type: application/merge-patch+json" \\\n  -d '{"metadata":{"labels":{"app":"demo"}}}' "$APISERVER${fill(ops.patch.p)}"`;
    if (ops.delete) s += ui`\n\n# 삭제\ncurl -sS -X DELETE ${H} "$APISERVER${fill(ops.delete.p)}"`;
    return s;
  };
  const CONS_GROUPS = [
    ['dep', ui('폐지 예정'), 'alert', 'bad', ui('설명에 폐지·제거 예정이라고 적힌 필드나 동작입니다. 새로 만드는 리소스에서는 피하세요.')],
    ['prev', ui('미리보기 · 알파/베타 · 기능 게이트'), 'flask', 'warn', ui('설명에 Technology Preview, 알파·베타 수준, 기능 게이트가 언급된 항목입니다. 안정 버전이라도 일부 필드는 아직 성숙하지 않았을 수 있습니다.')],
    ['imm', ui('변경 불가'), 'lock', 'info', ui('만든 뒤에는 바꿀 수 없거나 읽기 전용인 필드입니다. 처음부터 올바르게 정해야 합니다.')],
    ['single', ui('이름 · 싱글턴'), 'hash', 'mute', ui('이름이나 개수에 제한이 있는 리소스입니다.')],
    ['excl', ui('상호 배타 · 택일'), 'git-branch', 'mute', ui('함께 쓸 수 없거나 정확히 하나만 골라야 하는 필드입니다.')],
    ['cond', ui('조건부'), 'info', 'mute', ui('특정 조건에서만 유효하거나 필수가 되는 필드입니다.')],
    ['limit', ui('값 범위 · 형식'), 'filter', 'mute', ui('길이·개수·범위·형식 제한이나 허용 값 목록입니다.')],
  ];
  const pathsAt = (c, v) => c.pathsByVersion ? c.pathsByVersion[v] || [] : c.ps || [c.p];
  function consCard(a, m, dv) {
    const L = VL.slice().reverse(), at = App.availText(m), stab = App.stab(m.gv[dv]);
    const gvs = L.filter(v => m.vers.includes(v)).map(v => `${v} ${m.gv[v]}`), gvChanged = new Set(m.vers.map(v => m.gv[v])).size > 1;
    const tiers = [...new Set(m.vers.map(v => m.tier && m.tier[v]).filter(Boolean))];
    const tierBy = L.filter(v => m.tier && m.tier[v]).map(v => ui`${v}: 레벨 ${m.tier[v]}`);
    const items = (type) => m.cons.filter(c => c.t === type && c.v.includes(dv));
    const itemHTML = c => {
      const paths = pathsAt(c, dv), count = c.pathsByVersion ? paths.length : c.n || 1;
      return `<div class="citem"><code title="${esc(paths.join(', '))}">${esc(paths[0] || ui('API 전체'))}</code>${count > 1 ? ui`<span class="morep">외 ${count - 1}곳</span>` : ''}${esc(c.x)}</div>`;
    };
    const grp = (cls, icon, title, right, body, open) => `<details class="cgroup ${cls}"${open ? ' open' : ''}><summary><span class="ci ${cls}">${ic(icon, 15)}</span><span>${title}</span><span class="ct">${right || ''}${ic('chevron-right', 14, 'chev')}</span></summary>${body}</details>`;
    let h = grp(at ? 'warn' : 'ok', 'layers', ui('제공 버전'), at ? `<span class="badge beta">${esc(at)}</span>` : ui`<span class="badge ga">전 버전 제공</span>`,
      `<p class="csum">${at ? ui`제공 범위: <b>${esc(at)}</b>. 선택한 버전에 없으면 가장 최신 제공 버전의 내용을 보여 줍니다.` : ui`조사한 ${VL.length}개 버전(${VL.join(', ')}) 모두에서 제공됩니다.`}</p><div class="citems"><div class="vrow" style="margin:0">${L.map(v => `<span class="vchip${m.vers.includes(v) ? '' : ' off'}">${v} ${m.vers.includes(v) ? esc(m.gv[v]) : ui('없음')}</span>`).join('')}</div>${gvChanged ? ui`<div class="citem">API 버전이 릴리스마다 바뀌었습니다: ${esc(gvs.join(' → '))}. 이전 버전용 매니페스트는 <code>apiVersion</code>을 확인하세요.</div>` : ''}</div>`, true);
    h += grp(stab === 'ga' ? 'ok' : stab === 'beta' ? 'warn' : 'bad', 'shield', ui('안정성 · 호환성'), `<span class="badge ${stab}">${App.STAB[stab][0]}</span>`,
      `<p class="csum"><b>${esc(m.gv[dv])}</b> — ${esc(App.STAB[stab][1])}.</p>${tiers.length ? `<div class="citems">${tiers.map(t => ui`<div class="citem"><code>호환성 레벨 ${t}</code>${esc(App.TIER[t])}</div>`).join('')}${tiers.length > 1 ? ui`<div class="citem">버전별: ${esc(tierBy.join(' · '))}</div>` : ''}</div>` : ui('<p class="csum">원문에 호환성 레벨 표기가 없습니다.</p>')}`, stab !== 'ga' || tiers.some(t => t >= 3));
    h += grp('mute', 'box', ui('범위'), `<span class="badge">${m.ns === true ? ui('네임스페이스') : m.ns === false ? ui('클러스터') : ui('정보 없음')}</span>`, `<p class="csum">${m.ns === true ? ui('네임스페이스 범위 리소스입니다. <code>metadata.namespace</code>가 필요하며 생략하면 현재 프로젝트에 만들어집니다.') : m.ns === false ? ui('클러스터 범위 리소스입니다. 네임스페이스 없이 전역으로 존재하며 <code>namespace</code>는 무시됩니다.') : ui('원문 엔드포인트 정보로는 범위를 판단할 수 없습니다.')}</p>`);
    for (const [t, title, icon, cls, desc] of CONS_GROUPS) {
      const list = items(t), total = m.countsByVersion[dv][t] || 0;
      if (!total) continue;
      h += grp(cls, icon, title, `<span>${list.length === total ? total + ui('건') : list.length + ' / ' + total + ui('건')}</span>`, `<p class="csum">${desc}</p><div class="citems">${list.map(itemHTML).join('')}${list.length < total ? ui`<p class="note">전체 ${total}건 중 ${list.length}건을 표시합니다.</p>` : ''}</div>`, (t === 'dep' || t === 'prev' || t === 'single') && list.length <= 6);
    }
    const nf = m.fdiff.length, nt = m.tdiff.length, nr = m.rdiff.length, ne = m.ediff.length;
    if (m.vers.length > 1 && (nf || nt || nr || ne)) {
      const vsp = vs => `<span class="vs">${vs.map(v => `<span class="vp">${v}</span>`).join('')}</span>`;
      h += grp('info', 'compare', ui('버전별 차이'), ui`<span>필드 ${nf} · 타입 ${nt} · 필수 ${nr} · 엔드포인트 ${ne}</span>`,
        `<div class="citems">${nf ? ui`<div class="citem"><b>일부 버전에만 있는 필드</b></div>${m.fdiff.map(e => `<div class="citem"><code>${esc(e.p)}</code>${e.sub ? ui`<span class="morep">하위 ${e.sub}개 포함</span>` : ''}${vsp(e.v)}</div>`).join('')}` : ''}
        ${nt ? ui`<div class="citem"><b>버전마다 타입이 다른 필드</b></div>${m.tdiff.map(e => `<div class="citem"><code>${esc(e.p)}</code>${Object.entries(e.t).map(([v, t]) => `<span class="vp">${v}</span> ${esc(t)}`).join(' · ')}</div>`).join('')}` : ''}
        ${nr ? ui`<div class="citem"><b>필수 여부가 다른 필드 (필수인 버전)</b></div>${m.rdiff.map(e => `<div class="citem"><code>${esc(e.p)}</code>${e.sub ? ui`<span class="morep">하위 ${e.sub}개 포함</span>` : ''}${vsp(e.v)}</div>`).join('')}` : ''}
        ${ne ? ui`<div class="citem"><b>일부 버전에만 있는 엔드포인트</b></div>${m.ediff.map(e => `<div class="citem"><code>${esc(e.e)}</code>${vsp(e.v)}</div>`).join('')}` : ''}${m.diffTrunc ? ui('<div class="note">항목이 많아 일부만 표시합니다.</div>') : ''}</div>`, false);
    }
    const n = Object.values(m.countsByVersion[dv]).reduce((sum, count) => sum + count, 0);
    return ui`<section class="card consbox" id="c-cons"><div style="display:flex;align-items:center;gap:10px;padding:12px 18px 8px"><span class="ci info" style="width:28px;height:28px;border-radius:8px;display:grid;place-items:center">${ic('shield', 16)}</span><b style="font-size:15.5px">제약 · 제한 사항</b><span class="note" style="margin:0 0 0 auto" title="원문 설명 문장에서 패턴 매칭으로 자동 추출했습니다. 오탐이나 누락이 있을 수 있으니 중요한 판단은 원문을 확인하세요.">${dv} 문서 기준 · 전체 ${n}건</span></div>${h}</section>`;
  }
  function epsHTML(a, params) {
    const mblock = m => `<div class="mb"><div class="mh"><span class="m ${m.m}">${m.m}</span> ${esc(m.d)}</div>
      ${m.q.length ? ui`<div class="mq"><b>쿼리 파라미터</b>${m.q.map(n => `<div><code>${esc(n)}</code> <span class="ftp">${esc((params[n] || [])[0] || '')}</span> ${esc(App.short((params[n] || [])[1], 150))}</div>`).join('')}</div>` : ''}
      ${m.b ? ui`<div class="mq"><b>요청 본문</b> <code>${esc(m.b)}</code></div>` : (m.m === 'PATCH' ? ui('<div class="mq"><b>요청 본문</b> <span class="ftp">Patch (JSON Patch / Merge Patch / Strategic Merge Patch)</span></div>') : '')}
      ${m.r.length ? ui`<div class="mq"><b>응답</b> ${m.r.map(r => `<span class="resp">${esc(r[0])} <code>${esc(r[1])}</code></span>`).join('')}</div>` : ''}</div>`;
    return a.d.eps.map(e => `<details class="epd"><summary><span class="ms">${[...new Set(e.ms.map(m => m.m))].map(m => `<span class="m ${m}">${m}</span>`).join('')}</span><code>${esc(e.p)}</code></summary><div class="in">${e.ms.map(mblock).join('')}</div></details>`).join('');
  }
  function fieldTree(host, a, F, consBy) {
    const byPath = new Map(F.map(f => [f.p, f])), topRows = a.d.props.map(p => [p.n, p.t, p.d]);
    const rows = p => p === '' ? topRows : (byPath.get(p) ? byPath.get(p).r : []), reqs = p => new Set(p === '' ? a.d.required : (byPath.get(p) ? byPath.get(p).q : []));
    const base = n => n.replace(/(\[\]|\{\})+$/, ''), childOf = (p, n) => { for (const s of ['[]', '{}', '']) { const c = p + '.' + base(n) + s, f = byPath.get(c); if (f && f.r.length) return c; } return null; };
    const visible = (p, r) => !/(\[\]|\{\})$/.test(r[0]) || !rows(p).some(x => x[0] === base(r[0]));
    const chips = path => { const l = consBy.get(path); if (!l) return ''; return `<span class="fcons">${l.map(c => `<span class="cons ${c.t}" title="${esc(c.x)}">${c.t === 'dep' ? ic('alert', 11) + ui('폐지') : c.t === 'prev' ? ic('flask', 11) + ui('미리보기') : c.t === 'imm' ? ic('lock', 11) + ui('변경 불가') : ''}</span>`).join('')}</span>`; };
    const rowHTML = (p, r) => { const c = childOf(p, r[0]), full = (p + '.' + r[0]).replace(/^\./, ''); return `<div class="fr"><div class="fh${c ? ' has' : ''}"${c ? ` data-p="${esc(c)}" role="button" tabindex="0" aria-expanded="false"` : ''}><span class="tg">${c ? '▸' : '·'}</span><span class="fn">${esc(r[0])}</span><span class="ftp">${esc(r[1])}</span>${reqs(p).has(r[0]) ? ui('<span class="req">필수</span>') : ''}${chips(full)}</div><div class="fdsc">${esc(r[2])}</div><div class="fc" hidden></div></div>`; };
    const list = p => rows(p).filter(r => visible(p, r)).map(r => rowHTML(p, r)).join('');
    const all = []; for (const p of [''].concat([...byPath.keys()])) rows(p).forEach(r => { if (!/(\[\]|\{\})$/.test(r[0])) { const path = (p + '.' + r[0]).replace(/^\./, ''); all.push({ path, t: r[1], d: r[2], req: reqs(p).has(r[0]) }); } });
    host.innerHTML = ui`<div class="ftoolbar"><input class="ff" id="fq" placeholder="필드 검색 (예: tls, termination, port) — ${all.length.toLocaleString(App.locale)}개 필드" aria-label="필드 검색"><button class="btn ghost sm" id="fexp">${ic('chevron-down', 13)} 1단계 펼치기</button></div><div class="ftree" id="ft">${list('')}</div>`;
    const ft = host.querySelector('#ft'), fq = host.querySelector('#fq');
    function toggle(h, force) { const box = h.parentElement.querySelector('.fc'), p = h.dataset.p, open = force === undefined ? box.hidden : force; if (open) { if (!box.innerHTML) box.innerHTML = list(p); box.hidden = false; h.querySelector('.tg').textContent = '▾'; h.setAttribute('aria-expanded', 'true'); } else { box.hidden = true; h.querySelector('.tg').textContent = '▸'; h.setAttribute('aria-expanded', 'false'); } }
    const sp = ft.querySelector('.fh[data-p=".spec"]'); if (sp) toggle(sp, true);
    ft.addEventListener('click', e => { const h = e.target.closest('.fh.has'); if (h) return toggle(h); const d = e.target.closest('.fdsc'); if (d) d.classList.toggle('open'); });
    ft.addEventListener('keydown', e => { const h = e.target.closest('.fh.has'); if (h && e.target === h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(h); } });
    host.querySelector('#fexp').addEventListener('click', () => { ft.querySelectorAll(':scope > .fr > .fh.has').forEach(h => toggle(h, true)); });
    fq.addEventListener('input', () => {
      const w = fq.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!w.length) { ft.innerHTML = list(''); const s = ft.querySelector('.fh[data-p=".spec"]'); if (s) toggle(s, true); return; }
      const hit = all.filter(f => { const hay = (f.path + ' ' + f.d).toLowerCase(); return w.every(x => hay.includes(x)); });
      const re = new RegExp('(' + w.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
      const hlr = t => t.split(re).map((p, i) => (i % 2 ? '<mark>' + esc(p) + '</mark>' : esc(p))).join('');
      ft.innerHTML = ui`<div class="count" style="margin:6px 0">${hit.length}개 일치${hit.length > 120 ? ui(' (상위 120개)') : ''}</div>` + hit.slice(0, 120).map(f => `<div class="fr flat"><div class="fh"><span class="fn">${hlr(f.path)}</span><span class="ftp">${esc(f.t)}</span>${f.req ? ui('<span class="req">필수</span>') : ''}${chips(f.path)}</div><div class="fdsc">${hlr(f.d)}</div></div>`).join('');
    });
  }
  V.api = async rawId => {
    const my = App.activeSeq, id = App.dec(rawId), ver = App.ver; let key = null;
    for (const v of [ver].concat(VL)) { key = U.idKey.get(v + '|' + id); if (key) break; }
    if (!key) { App.title(ui('찾을 수 없음')); App.render(ui`<button class="back" id="bk">${ic('chevron-left', 15)} 뒤로</button><div class="empty"><h1 style="font-size:18px">해당 API를 찾을 수 없습니다.</h1><p class="hint"><a href="${App.href('browse')}">API 탐색으로 이동</a></p></div>`); $('#bk').addEventListener('click', () => history.back()); return; }
    const m = MG.apis[key], dv = App.pickVer(m, ver), missing = !m.vers.includes(ver);
    await App.loadCore(dv); if (my !== App.activeSeq) return; const db = App.prep(dv); let a = U.byKey.get(key); if (!a || a.rv !== dv) a = db.apis.find(x => x.id === m.id[dv]) || a;
    if (!a.d) { App.render(ui('<div class="empty">이 API의 상세 데이터가 없습니다.</div>')); return; }
    a.key = key; a.m = m; a.cons = m.cons;   // 최신이 아닌 버전의 레코드에도 통합 정보를 붙인다
    App.curKey = key; App.recent.push(key); App.title(a.kind);
    const d = docLike(a), x = a.d, fav = App.fav.has(key), first = App.firstSent(x.desc.replace(/Compatibility level.*$/s, '')), rest = x.desc.replace(/Compatibility level.*$/s, '').replace(/\s+/g, ' ').trim().slice(first.length).trim();
    const hrefV = v => `#${v}/api:${m.id[v]}`, stab = App.stab(m.gv[dv]);
    const tabs = [['c-cons', ui('제약·제한'), 'shield'], ['c-usage', ui('사용 예시'), 'code'], ['c-fields', ui('필드'), 'list'], ['c-eps', ui('엔드포인트'), 'server'], ['c-rel', ui('관계'), 'topology']];
    const root = App.render(ui`
      <nav class="crumb" aria-label="경로"><a href="${App.href('')}">홈</a>${ic('chevron-right', 12)}<a href="${App.href('browse:cat=' + a.book)}">${esc(catName(a.book))}</a>${ic('chevron-right', 12)}<span>${esc(a.kind)}</span></nav>
      <section class="card dhead"><div class="top"><div><h1 class="d-title">${esc(a.kind)}</h1><div class="dbadges"><span class="gv">${esc(d.gv)}</span><span class="badge ${stab}" title="${esc(App.STAB[stab][1])}">${App.STAB[stab][0]}</span>${scopeBadge(a)}<span class="badge">${esc(catName(a.book))}</span>${m.tier && m.tier[dv] ? ui`<span class="badge info" title="${esc(App.TIER[m.tier[dv]])}">호환성 레벨 ${m.tier[dv]}</span>` : ''}</div></div>
        <div class="dact"><button class="btn ghost" id="favb" aria-pressed="${fav}">${ic(fav ? 'star-fill' : 'star', 15)} <span>${fav ? ui('즐겨찾기됨') : ui('즐겨찾기')}</span></button><button class="btn ghost" id="cpb">${ic('copy', 15)} 이름 복사</button><a class="btn primary" href="#${dv}/sim:${m.id[dv]}">${ic('flask', 15)} 시뮬레이터에서 설계</a></div></div>
        ${missing ? ui`<div class="isum" style="margin-top:14px;background:var(--warn-soft);color:var(--warn)">${ic('info', 14)} 선택한 <b>${ver}</b>에는 없는 API입니다. 제공되는 가장 최신 버전(<b>${dv}</b>) 기준으로 보여 줍니다.</div>` : ''}
        <div class="vrow"><span class="note" style="margin:0">제공 버전</span>${VL.slice().reverse().map(v => m.vers.includes(v) ? `<a class="vchip${v === dv ? ' on' : ''}" href="${hrefV(v)}" title="${m.fp[v] !== m.fp[dv] ? ui('선택 버전과 필드·엔드포인트가 다릅니다') : ui('선택 버전과 같습니다')}">${v} ${esc(m.gv[v])}${m.fp[v] !== m.fp[dv] ? ' ●' : ''}</a>` : ui`<span class="vchip off">${v} 없음</span>`).join('')}<span class="note" style="margin:0">● 선택한 버전과 다름</span></div>
        <p class="lead">${esc(first)}</p>${rest ? ui`<button class="more" id="more">자세히 보기</button><div class="full" id="full" hidden>${esc(rest)}</div>` : ''}
        ${x.required.length ? ui`<p class="note" style="margin-top:10px">반드시 넣어야 하는 필드: ${x.required.map(r => `<code class="req">${esc(r)}</code>`).join(' ')}</p>` : ''}
      </section>
      <div style="margin-top:16px">${consCard(a, m, dv)}</div>
      <div class="sticky-tabs"><div class="tabs" id="stabs">${tabs.map(([i, l, ico]) => `<a href="#" data-sec="${i}" class="${i === 'c-cons' ? 'on' : ''}"${i === 'c-cons' ? ' aria-current="true"' : ''}>${ic(ico, 14)} ${l}</a>`).join('')}</div></div>
      <section id="c-usage"><h2 class="sec">사용 예시</h2><div class="code"><div class="codehead"><div class="codetabs" role="tablist" aria-label="예시 형식"><button role="tab" id="ctab0" data-t="0" aria-selected="true" aria-controls="codep">YAML</button><button role="tab" id="ctab1" data-t="1" aria-selected="false" aria-controls="codep">oc 명령</button><button role="tab" id="ctab2" data-t="2" aria-selected="false" aria-controls="codep">REST</button></div><button class="cp" id="cp">${ic('copy', 14)} 복사</button></div><pre id="codep" role="tabpanel" aria-labelledby="ctab0" tabindex="0"><code id="codeb"></code></pre></div><p class="note">필수 필드(하위 필드 포함)로 만든 기본 틀입니다. 값은 필드 설명을 보고 채우세요. 실제 검증은 <a href="${App.href('sim:' + m.id[dv])}">시뮬레이터</a>에서 할 수 있습니다.</p></section>
      <section id="c-fields"><h2 class="sec">필드 <span class="c">${x.props.length}개 최상위</span></h2><div id="fieldhost"><div class="skel" style="height:120px"></div></div></section>
      <section id="c-eps"><h2 class="sec">엔드포인트 <span class="c">${x.eps.length}개</span></h2><div id="epshost">${epsHTML(a, db.params || {})}</div></section>
      <section id="c-rel"><h2 class="sec">관계</h2><div id="ego"><div class="skel" style="height:160px"></div></div></section>
      <a class="ext" href="${esc(App.safeUrl(a.url))}" target="_blank" rel="noopener">${ic('external', 14)} 공식 문서에서 전체 설명 보기</a>`);
    // 코드 탭
    const tabsC = [['yaml', yamlFull(d, null)], ['bash', ocFor(d)], ['bash', restFor(d)]]; let ct = 0;
    const setCode = i => { ct = i; App.$$('.codehead [data-t]').forEach((b, j) => { b.setAttribute('aria-selected', j === i); b.tabIndex = j === i ? 0 : -1; }); const cpn = $('#codep'); if (cpn) cpn.setAttribute('aria-labelledby', 'ctab' + i); $('#codeb').innerHTML = App.hi(tabsC[i][1], tabsC[i][0]); };
    setCode(0);
    $('.codehead').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) setCode(+b.dataset.t); });
    $('.codetabs').addEventListener('keydown', e => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const n = (ct + (e.key === 'ArrowRight' ? 1 : -1) + 3) % 3; setCode(n); App.$$('.codehead [data-t]')[n].focus(); });
    $('#cp').addEventListener('click', e => App.copy(tabsC[ct][1], e.currentTarget));
    $('#favb').addEventListener('click', () => { const on = App.fav.toggle(key); setFavoriteButton($('#favb'), on); App.toast(on ? ui('즐겨찾기에 추가했습니다') : ui('즐겨찾기에서 뺐습니다'), on ? 'star-fill' : 'star'); });
    $('#cpb').addEventListener('click', e => App.copy(`${d.gv} ${a.kind}`, e.currentTarget));
    const mb = $('#more'); if (mb) mb.addEventListener('click', () => { $('#full').hidden = !$('#full').hidden; mb.textContent = $('#full').hidden ? ui('자세히 보기') : ui('접기'); });
    // 섹션 탭: 스크롤 이동 + 현재 위치 강조
    const secs = tabs.map(t => document.getElementById(t[0]));
    $('#stabs').addEventListener('click', e => { const t = e.target.closest('[data-sec]'); if (!t) return; e.preventDefault(); const el = document.getElementById(t.dataset.sec); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 118, behavior: 'smooth' }); });
    const io = new IntersectionObserver(es => { es.forEach(en => { if (en.isIntersecting) App.$$('#stabs a').forEach(t => { const on = t.dataset.sec === en.target.id; t.classList.toggle('on', on); if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); }); }); }, { rootMargin: '-120px 0px -65% 0px' });
    secs.forEach(s => s && io.observe(s));
    // 중첩 필드(큰 파일)는 뒤늦게, 관계도는 화면에 들어올 때
    let dead = false, live = null;
    const consBy = new Map(); m.cons.forEach(c => { if (c.v.includes(dv) && ['dep', 'prev', 'imm'].includes(c.t)) pathsAt(c, dv).forEach(p => { if (!consBy.has(p)) consBy.set(p, []); consBy.get(p).push(c); }); });
    const loadF = () => App.ensureFields(dv, a.id).then(() => {
      if (dead) return; const F = App.fields(dv)[a.id] || []; const fh = $('#fieldhost'); if (fh) fieldTree(fh, a, F, consBy);
      tabsC[0][1] = yamlFull(d, F); if (ct === 0 && $('#codeb')) setCode(0);
    }).catch(() => {
      const fh = $('#fieldhost'); if (dead || !fh) return;
      fh.innerHTML = ui('<div class="empty" style="padding:20px"><p class="hint">중첩 필드를 불러오지 못했습니다. 카탈로그가 갱신됐다면 페이지를 새로고침해 주세요.</p><button class="btn ghost sm" id="fretry">다시 시도</button> <button class="btn ghost sm" id="freload">페이지 새로고침</button></div>');
      $('#fretry').addEventListener('click', () => { fh.innerHTML = '<div class="skel" style="height:120px"></div>'; loadF(); });
      $('#freload').addEventListener('click', () => location.reload());
    });
    loadF();
    const relIO = new IntersectionObserver(async es => {
      if (!es.some(e => e.isIntersecting)) return; relIO.disconnect();
      try { const [eng] = await Promise.all([App.engines(dv), App.lazyGraph()]); if (dead) return; Topo.init({ E: eng.E, G: eng.G, CAT, esc, go: App.nav, hash: App.href }); const host = $('#ego'); host.innerHTML = ''; live = Topo.mountEgo(host, m.id[dv]); } catch (e) { const h = $('#ego'); if (h) h.innerHTML = ui('<p class="note">관계도를 불러오지 못했습니다.</p>'); }
    }, { rootMargin: '300px' });
    relIO.observe($('#c-rel'));
    return () => { dead = true; io.disconnect(); relIO.disconnect(); if (live && live.destroy) live.destroy(); };
  };

  /* ====================== 버전 비교 ====================== */
  function setupImpact(form, from, to) {
    const input = form.querySelector('textarea'), output = form.querySelector('output'), button = form.querySelector('button');
    let sequence = 0;
    function invalidate() {
      sequence++;
      output.replaceChildren();
      button.disabled = !input.value.trim() || from.value === to.value;
    }
    input.addEventListener('input', invalidate);
    from.addEventListener('change', invalidate);
    to.addEventListener('change', invalidate);
    invalidate();
    async function assess(entries, v) {
      const { E } = await App.engines(v);
      const schemas = new Map(), ids = new Map();
      for (const { M } of entries) {
        const doc = E.docs.find(d => d.gv === M?.apiVersion && d.a.kind === M?.kind);
        if (doc) ids.set(doc.a.id, doc.a);
      }
      await Promise.all([...ids].map(async ([id, a]) => {
        await App.ensureFields(v, id);
        schemas.set(id, Sim.makeSchema(a, App.fields(v)[id] || []));
      }));
      return Sim.assessDocuments(entries, E.docs, id => schemas.get(id));
    }
    form.onsubmit = async event => {
      event.preventDefault();
      const seq = ++sequence, f = from.value, t = to.value, text = input.value;
      if (f === t || !text.trim()) return;
      button.disabled = true;
      output.textContent = ui('두 릴리스의 스키마를 검사하는 중…');
      try {
        await App.lazySim();
        const entries = Sim.manifestDocuments(text);
        const [before, after] = await Promise.all([assess(entries, f), assess(entries, t)]);
        if (seq !== sequence || !form.isConnected) return;
        output.innerHTML = Sim.upgradeImpact(before, after).map(d => {
          const state = ok => ok ? ui('통과') : ui('오류');
          const issues = (title, rows) => rows.length ? '<h4>' + title + '</h4><ul>' + rows.map(x => '<li>' +
            (x.level === 'error' ? ui('오류') : ui('경고')) + ' · <code>' + esc(x.path || ui('문서')) + '</code> · ' + esc(x.msg) + '</li>').join('') + '</ul>' : '';
          return ui('<section><h3>문서 ') + d.document + ' · ' + esc(d.kind || ui('리소스')) + '</h3><p>' + f + ' ' + state(d.fromValid) +
            ' → ' + t + ' ' + state(d.toValid) + '</p>' + issues(ui('새로 발생'), d.introduced) + issues(ui('해소'), d.resolved) +
            issues(ui('두 버전 공통'), d.remaining) + d.warnings.map(w => '<p>' + esc(w) + '</p>').join('') + '</section>';
        }).join('');
      } catch (err) {
        if (seq === sequence) output.textContent = ui('검사 오류 · ') + err.message;
      } finally { if (seq === sequence) button.disabled = false; }
    };
  }
  V.compare = async arg => {
    App.title(ui('버전 비교')); App.curKey = null;
    const qs = parseQS(arg), to0 = VL.includes(qs.to) ? qs.to : App.ver, from0 = VL.includes(qs.from) ? qs.from : (VL[VL.indexOf(to0) + 1] || VL[VL.indexOf(to0) - 1]);
    let tab = ['added', 'removed', 'changed', 'same'].includes(qs.tab) ? qs.tab : 'changed';
    App.render(ui`<div class="pagehead"><div class="eyebrow">버전 비교</div><h1>어떤 API가 달라졌나</h1><p>두 버전 사이에서 추가·삭제·변경된 API를 봅니다. 변경은 필드·타입·엔드포인트나 API 버전(v1beta1 → v1)이 달라진 경우입니다.</p></div>
      <div class="browsebar"><label class="fchip">기준<select id="cf" aria-label="기준 버전">${VL.map(v => `<option${v === from0 ? ' selected' : ''}>${v}</option>`).join('')}</select></label>${ic('arrow-right', 16)}<label class="fchip">대상<select id="ct" aria-label="대상 버전">${VL.map(v => `<option${v === to0 ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <div class="qbox" style="max-width:300px">${ic('search', 17)}<input id="cq" placeholder="API 이름으로 거르기" aria-label="이름 필터"></div></div>
      <details class="impact"><summary>내 YAML 업그레이드 영향 검사</summary>
      <form id="impact-form" autocomplete="off"><label for="impact-yaml">검사할 YAML 또는 JSON</label>
      <textarea id="impact-yaml" rows="6" spellcheck="false" placeholder="여러 문서는 ---로 구분합니다"></textarea>
      <p class="note">입력은 이 화면에서만 처리합니다. 결과는 수록된 스키마를 기준으로 하며 클러스터 정책은 별도 확인이 필요합니다.</p>
      <button class="btn" type="submit">두 버전에서 검사</button><output aria-live="polite"></output></form></details>
      <div id="cres"></div>`);
    setupImpact($('#impact-form'), $('#cf'), $('#ct'));
    $('#cq').value = qs.q || '';
    let pair = '';
    const differences = new Map();
    function comparison(key, from, to) {
      if (pair !== from + '/' + to) { pair = from + '/' + to; differences.clear(); }
      if (!differences.has(key)) differences.set(key, ApiSearch.compareReleases(MG.apis[key], from, to));
      return differences.get(key);
    }
    $('#cres').addEventListener('toggle', event => {
      const details = event.target;
      if (!details.open || !details.dataset.constraintKey || details.querySelector('section')) return;
      const k = details.dataset.constraintKey, f = $('#cf').value, t = $('#ct').value;
      const diff = comparison(k, f, t), m = MG.apis[k];
      const column = (v, sentences) => '<div><a href="#' + v + '/api:' + esc(m.id[v]) + '">' + v + ui(' API 상세</a>') +
        (sentences.length ? '<ul>' + sentences.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ui('<p>차이가 있는 문장 없음</p>')) + '</div>';
      details.insertAdjacentHTML('beforeend', diff.constraintChanges.map(c => '<section><code>' + esc(c.path || ui('API 전체')) +
        '</code><div class="constraint-pair">' + column(f, c.from) + column(t, c.to) + '</div></section>').join(''));
    }, true);
    const render = (addHistory = false) => {
      const f = $('#cf').value, t = $('#ct').value, query = $('#cq').value, q = query.trim().toLowerCase();
      const hash = App.href(`compare:from=${f}&to=${t}&tab=${tab}` + (query ? '&q=' + encodeURIComponent(query) : ''));
      if (location.hash !== hash) {
        if (addHistory) history.pushState(null, '', hash);
        else history.replaceState(null, '', hash);
      }
      if (f === t) { $('#cres').innerHTML = ui('<div class="empty">서로 다른 두 버전을 고르세요.</div>'); return; }
      const ds = diffSets(f, t), flt = arr => q ? arr.filter(k => k.toLowerCase().includes(q)) : arr;
      const sets = { added: flt(ds.A), removed: flt(ds.R), changed: flt(ds.C), same: flt(ds.S) };
      const label = { added: ui`${t}에 새로 생긴 API`, removed: ui`${f}에 있었으나 ${t}에는 없는 API`, changed: ui('양쪽에 있지만 필드·엔드포인트·API 버전이 다른 API'), same: ui('필드 구조·엔드포인트·API 버전이 같은 API. 문서의 제약 문장은 달라질 수 있습니다.') };
      const li = k => {
        const m = MG.apis[k], [kind, group] = k.split('|'), tv = tab === 'removed' ? f : t, parts = [];
        let required = '', constraints = '';
        const diff = (tab === 'changed' || tab === 'same') && comparison(k, f, t);
        if (diff && (diff.constraintChanges.length || diff.constraintsTruncated)) {
          const count = diff.constraintChanges.length;
          constraints = '<details data-constraint-key="' + esc(k) + '"><summary>' +
            (count ? ui('문서 제약 변경 · ') + count + ui('개 경로') : ui('문서 제약 · 일부 수록')) + '</summary>' +
            ui('<p class="note">문서에서 추출한 문장 차이입니다. 서버 동작 변경 여부는 별도 확인이 필요합니다.') +
            (diff.constraintsTruncated ? ui(' 추출 목록 일부만 수록되어 있습니다.') : '') + '</p></details>';
        }
        if (tab === 'changed') {
          const [before, after] = diff.apiVersions;
          if (before !== after) parts.push(before + ' → ' + after);
          for (const [key, label] of [['fieldChanges', ui('필드')], ['typeChanges', ui('타입')], ['endpointChanges', ui('엔드포인트')]])
            if (diff[key].length) parts.push(label + ui(' 변경 ') + diff[key].length);
          const states = { absent: ui('없음'), optional: ui('선택'), required: ui('필수') };
          if (diff.requiredChanges.length) required = ui('<details><summary>필수 여부 변경 ') + diff.requiredChanges.length + ui('건</summary><ul>') +
            diff.requiredChanges.map(e => '<li><code>' + esc(e.path) + '</code> · ' + states[e.from] + ' → ' + states[e.to] + (e.sub ? ui(' (하위 ') + e.sub + ui('개 포함)') : '') + '</li>').join('') + '</ul></details>';
          if (!parts.length && !required) parts.push(ui('세부 정의 변경'));
        }
        return `<li><a class="row" href="#${tv}/api:${m.id[tv]}"><div class="l1"><span class="kind">${esc(kind)}</span><span class="gv">${esc(group || 'core')}/${esc(m.gv[tv])}</span><span class="badge">${esc(catName(m.book))}</span>${parts.length ? `<span class="spacer"></span>${parts.map(p => `<span class="cons ver">${p}</span>`).join('')}` : ''}</div></a>${required}${constraints}</li>`;
      };
      $('#cres').innerHTML = `<div class="filters">${[['added', ui`추가 ${ds.A.length}`], ['removed', ui`삭제 ${ds.R.length}`], ['changed', ui`변경 ${ds.C.length}`], ['same', ui`구조 동일 ${ds.S.length}`]].map(([k, l]) => `<button class="chip" data-ctab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>
        <p class="note" style="margin:0 0 10px">${f} → ${t} · ${label[tab]}</p><ul class="list">${sets[tab].slice(0, 400).map(li).join('') || ui('<li class="empty">해당하는 API가 없습니다.</li>')}</ul>`;
    };
    $('#cf').onchange = $('#ct').onchange = () => render(true); $('#cq').oninput = () => render();
    $('#cres').addEventListener('click', e => { const b = e.target.closest('[data-ctab]'); if (b) { tab = b.dataset.ctab; render(true); } });
    render();
  };

  /* ====================== 가이드 ====================== */
  function guideContents(entries) {
    const roots = [], parents = [];
    for (const entry of entries) {
      while (parents.length && parents[parents.length - 1].entry.level >= entry.level) parents.pop();
      const node = { entry, children: [] };
      (parents.length ? parents[parents.length - 1].children : roots).push(node);
      parents.push(node);
    }
    const row = ({ entry, children }) => {
      const id = esc(entry.id), title = esc(entry.title);
      const link = `<a class="row" href="${App.href('guide:' + encodeURIComponent(entry.id))}">${title}</a>`;
      const toggle = children.length ? `<button type="button" class="guide-toggle iconbtn" aria-expanded="true" aria-controls="toc-${id}" aria-label="${esc(ui('하위 항목') + ' · ' + entry.title)}">${ic('chevron-down', 16)}</button>` : '';
      return `<li><div class="guide-entry">${link}${toggle}</div>${children.length ? `<ul id="toc-${id}">${children.map(row).join('')}</ul>` : ''}</li>`;
    };
    return roots.map(row).join('');
  }
  V.guide = async rawId => {
    const my = App.activeSeq, id = App.dec(rawId);
    App.title(ui('가이드')); App.curKey = null; await App.loadCore(App.ver); if (my !== App.activeSeq) return; const G = App.prep(App.ver).guide;
    const g = id && G.find(s => s.id === id);
    if (!g) {
      if (id) {
        history.replaceState(history.state, '', App.href('guide'));
        App.toast(ui('해당 가이드를 찾을 수 없어 목록을 보여 드립니다'), 'info');
      }
      App.render(ui`<div class="pagehead"><div class="eyebrow">가이드 · ${App.ver}</div><h1>API 지원 단계와 정책</h1><p>API 지원 단계, 호환성 정책, 폐지 정책, kubelet 로그 설정 문서입니다. 상단 검색에서 본문도 찾을 수 있습니다.</p></div><ul class="list guidelist guide-toc">${guideContents(G)}</ul>`);
      $('.guide-toc').onclick = e => {
        const button = e.target.closest('.guide-toggle');
        if (!button) return;
        const list = document.getElementById(button.getAttribute('aria-controls'));
        list.hidden = !list.hidden;
        button.setAttribute('aria-expanded', String(!list.hidden));
      };
      return;
    }
    App.title(g.title);
    await App.lazy('data/versions.js');
    if (my !== App.activeSeq) return;
    const overview = window.VERSIONS.sources[App.ver].overview;
    const source = App.safeUrl(overview + '#' + encodeURIComponent(id));
    App.render(ui`<button class="back" id="gb">${ic('chevron-left', 15)} 가이드 목록</button><div class="pagehead"><h1 style="font-size:22px">${esc(g.title)}</h1><a class="note" href="${esc(source)}" target="_blank" rel="noopener noreferrer">${ui('원문 보기')}</a></div><div class="guide">${App.sanitize(g.html)}</div>`);
    $('#gb').onclick = () => App.nav('guide');
    const byId = new Map(G.map(entry => [entry.id, entry]));
    for (const a of App.$$('.guide a[href]')) {
      const [documentUrl, fragment] = a.href.split('#');
      const target = App.dec(fragment || '');
      if (documentUrl !== overview || !byId.has(target)) continue;
      a.href = App.href('guide:' + encodeURIComponent(target));
      a.removeAttribute('target');
      a.removeAttribute('rel');
    }
    const index = G.indexOf(g), children = [];
    for (let i = index + 1; i < G.length && G[i].level > g.level; i++) {
      if (G[i].level === g.level + 1) children.push(G[i]);
    }
    if (children.length) {
      const existing = new Set(App.$$('.guide a').map(a => a.hash));
      const missing = children.filter(child => !existing.has(App.href('guide:' + encodeURIComponent(child.id))));
      if (missing.length) $('.guide').insertAdjacentHTML('beforeend', `<nav aria-label="${ui('하위 항목')}"><h2>${ui('하위 항목')}</h2><ul>${missing.map(child => `<li><a href="${App.href('guide:' + encodeURIComponent(child.id))}">${esc(child.title)}</a></li>`).join('')}</ul></nav>`);
    }
    App.$$('.guide pre').forEach(pre => {
      const text = pre.textContent;
      const commands = text.trimEnd().split('\n').every(line => line.startsWith('$ '));
      pre.innerHTML = App.hi(text, /^\s*apiVersion:/.test(text) ? 'yaml' : 'bash');
      const button = document.createElement('button');
      button.className = 'copy';
      button.innerHTML = ic('copy', 13) + (commands ? ui(' 명령 복사') : ui(' 복사'));
      button.onclick = () => App.copy(commands ? text.replace(/^\$ /gm, '') : text, button);
      pre.prepend(button);
    });
  };

  /* ====================== 토폴로지 · 시뮬레이터 ====================== */
  V.topology = async rawSel => {
    const my = App.activeSeq, sel = App.dec(rawSel);
    App.title(ui('토폴로지')); App.curKey = null; const ver = App.ver;
    App.render(ui`<div class="pagehead"><div class="eyebrow">토폴로지 · ${ver}</div><h1>API 사이의 연결</h1><p>색은 분류, 크기는 연결 수입니다. 노드를 누르면 설명과 연결 목록이 오른쪽에 나옵니다. 점선은 문서가 아니라 일반적인 구조를 정리한 관계입니다.</p></div><div id="topo"><div class="skel" style="height:420px"></div></div>`, true);
    const [eng] = await Promise.all([App.engines(ver), App.lazyGraph()]);
    if (my !== App.activeSeq) return;
    Topo.init({ E: eng.E, G: eng.G, CAT, esc, go: App.nav, hash: App.href });
    const host = $('#topo'); if (!host) return; host.innerHTML = '';
    const valid = eng.G.byId.has(sel);
    const live = Topo.mountFull(host, valid ? sel : null);
    if (sel && !valid) {
      history.replaceState(null, '', App.href('topology'));
      const notice = document.createElement('p');
      notice.textContent = ui('선택한 API는 이 릴리스에 없습니다. 전체 관계도를 표시합니다.');
      host.querySelector('#tinfo').prepend(notice);
    }
    return () => live && live.destroy && live.destroy();
  };
  V.sim = async rawId => {
    const my = App.activeSeq, id = App.dec(rawId);
    App.title(ui('API 설계 시뮬레이터')); App.curKey = null; const ver = App.ver;
    App.render(ui('<h1 class="sr-only">API 설계 시뮬레이터</h1><div id="simhost"><div class="skel" style="height:420px"></div></div>'), true);
    const [eng] = await Promise.all([App.engines(ver), App.lazySim()]);
    if (my !== App.activeSeq) return;
    const key = id && (U.idKey.get(ver + '|' + id) || VL.map(v => U.idKey.get(v + '|' + id)).find(Boolean));
    const want = key ? MG.apis[key].id[ver] : id;
    if (id && !eng.E.docs.some(d => d.a.id === want)) {
      App.render(`<section id="sim-missing" class="empty"><h1>${ui('이 버전에서 요청한 리소스를 찾을 수 없습니다.')}</h1>
        <p><code>${esc(ver)} / ${esc(id)}</code></p>
        <p><a href="${App.href('sim')}">${ui('시뮬레이터 열기')}</a> · <a href="${App.href('browse')}">${ui('API 찾아보기')}</a></p></section>`, true);
      return;
    }
    const ctx = { E: eng.E, G: eng.G, CAT, esc, ver, VER: { list: VL }, db: eng.db, go: App.nav, hash: App.href, ensureFields: i => App.ensureFields(ver, i), fields: () => App.fields(ver), docOf: i => eng.E.docs.find(d => d.a.id === i), short: App.short, firstSent: App.firstSent };
    const host = $('#simhost'); if (!host) return; host.innerHTML = '';
    const live = Sim.mount(host, ctx, want || '');
    return () => live && live.destroy && live.destroy();
  };
  V.notfound = async () => { App.title(ui('찾을 수 없음')); App.render(ui`<div class="empty"><h1 style="font-size:18px">페이지를 찾을 수 없습니다.</h1><p class="hint"><a href="${App.href('')}">홈으로</a></p></div>`); };
})();
