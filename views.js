// SPDX-License-Identifier: Apache-2.0
/* 화면들: 홈 · 탐색 · API 상세 · 버전 비교 · 가이드 · 토폴로지 · 시뮬레이터 */
(function () {
  'use strict';
  const App = window.App, $ = App.$, esc = App.esc, ic = App.ic, MG = App.MG, VL = App.VL, U = App.U;
  const CAT = ApiSearch.CAT_KO, V = App.views;
  const CAT_IC = { network_apis: 'network', monitoring_apis: 'activity', metadata_apis: 'tag', config_apis: 'settings', extension_apis: 'package', schedule_and_quota_apis: 'clock', operator_apis: 'cpu', provisioning_apis: 'server', template_apis: 'file-text', workloads_apis: 'box', operatorhub_apis: 'layers', security_apis: 'shield', autoscale_apis: 'zap', role_apis: 'users', rbac_apis: 'lock', console_apis: 'terminal', machine_apis: 'hard-drive', storage_apis: 'database', policy_apis: 'list', user_and_group_apis: 'users', image_apis: 'package', authorization_apis: 'lock', node_apis: 'cpu', oauth_apis: 'lock', project_apis: 'folder' };
  const catName = b => CAT[b] || String(b).replace(/_apis$/, '').replace(/_/g, ' ');
  const bset = (a, ver) => App.pickVer(a.m, ver || App.ver);
  const gvOf = (a, ver) => { const v = bset(a, ver); return (a.group ? a.group + '/' : '') + a.m.gv[v]; };
  const docLike = a => ({ a, gv: (a.group ? a.group + '/' : '') + a.version, low: a.kind.toLowerCase(), ns: a.d && a.d.eps.some(e => e.p.includes('{namespace}')) });
  const stabBadge = (a, ver) => { const s = App.stab(a.m.gv[bset(a, ver)]); return `<span class="badge ${s}" title="${esc(App.STAB[s][1])}">${App.STAB[s][0]}</span>`; };
  const scopeBadge = a => a.m.ns === true ? '<span class="badge">네임스페이스</span>' : a.m.ns === false ? '<span class="badge">클러스터</span>' : '';
  const diffSets = (from, to) => {
    const A = [], R = [], C = [], S = [];
    for (const [k, m] of Object.entries(MG.apis)) {
      const x = m.vers.includes(from), y = m.vers.includes(to);
      if (y && !x) A.push(k); else if (x && !y) R.push(k);
      else if (x && y) (m.fp[from] === m.fp[to] && m.gv[from] === m.gv[to] ? S : C).push(k);
    }
    return { A, R, C, S };
  };
  const diffNums = (m, from, to) => {
    const add = m.fdiff.filter(e => e.v.includes(to) && !e.v.includes(from)).length, del = m.fdiff.filter(e => e.v.includes(from) && !e.v.includes(to)).length;
    return { add, del, typ: m.tdiff.filter(e => e.t[to] !== e.t[from]).length, ep: m.ediff.filter(e => e.v.includes(from) !== e.v.includes(to)).length, gv: m.gv[from] !== m.gv[to] ? `${m.gv[from]} → ${m.gv[to]}` : '' };
  };

  /* ====================== 홈 ====================== */
  V.home = async () => {
    App.title(''); App.curKey = null;
    const keys = Object.keys(MG.apis).length, E = U.E;
    const tools = [['topology', '토폴로지', 'API 사이의 연결을 그래프로 보고, 노드를 눌러 설명과 관계를 확인합니다.', 'topology'], ['sim', 'API 설계 시뮬레이터', '스펙 기반 폼으로 리소스를 설계하고 검증하며 요청·응답을 미리 확인합니다.', 'flask'], ['compare', '버전 비교', '4.22 · 4.21 · 4.20 사이에 추가·삭제·변경된 API와 필드를 봅니다.', 'compare'], ['guide', '가이드', 'API 지원 단계, 호환성 정책, 폐지 정책, kubelet 로그 설정.', 'file-text']];
    const favs = App.fav.list().filter(k => U.byKey.has(k)), recs = App.recent.list().filter(k => U.byKey.has(k) && !favs.includes(k)).slice(0, 6);
    const lrow = k => { const a = U.byKey.get(k); return `<a class="lrow" href="${App.hrefFor(a)}"><span class="k">${esc(a.kind)}</span>${stabBadge(a)}<span class="g">${esc(a.group || 'core')}</span></a>`; };
    const sel = App.ver, older = VL[VL.indexOf(sel) + 1], prev = older || sel, cur2 = older ? sel : (VL[VL.indexOf(sel) - 1] || sel), ds = diffSets(prev, cur2);
    const names = (arr, n) => arr.slice(0, n).map(k => k.split('|')[0]).join(', ') + (arr.length > n ? ' 외 ' + (arr.length - n) + '개' : '');
    const cats = Object.entries(U.cats).sort((x, y) => y[1] - x[1]);
    const page = App.render(`
      <section class="hero">
        <div class="eyebrow">API 레퍼런스 · ${VL.join(' · ')}</div>
        <h1>API를 찾고, 비교하고,<br> 직접 설계해 보세요</h1>
        <p>세 버전의 API 레퍼런스를 한곳에 모았습니다. 필드 이름만 알아도 찾을 수 있고, 버전별 제약과 변경 사항이 함께 표시됩니다.</p>
        <button class="herosearch" id="hs">${ic('search', 20)}<span>API·필드·가이드 검색 (예: route)</span><kbd>Ctrl K</kbd></button>
        <div class="examples">${['route', '네트워크 정책', 'mcp', 'pvc', 'termination', 'deprecated'].map(x => `<a class="chip" href="${App.href('browse:q=' + encodeURIComponent(x))}">${esc(x)}</a>`).join('')}</div>
      </section>
      <div class="stats">
        <div class="card stat"><span class="i">${ic('book', 20)}</span><span class="v">${App.fmt(keys)}</span><span class="l">통합 API (${App.fmt(Object.keys(MG.apis).filter(k => MG.apis[k].vers.includes(App.LATEST)).length)}개가 ${App.LATEST})</span></div>
        <div class="card stat"><span class="i">${ic('list', 20)}</span><span class="v">${App.fmt(U.fieldCount)}</span><span class="l">검색되는 필드 경로</span></div>
        <div class="card stat"><span class="i">${ic('shield', 20)}</span><span class="v">${App.fmt(U.consCount)}</span><span class="l">추출한 제약·제한 사항</span></div>
        <div class="card stat"><span class="i">${ic('layers', 20)}</span><span class="v">${VL.length}</span><span class="l">비교 가능한 버전</span></div>
      </div>
      <h2 class="sec">도구</h2>
      <div class="grid g4">${tools.map(([id, t, d, i]) => `<a class="card tool" href="${App.href(id)}"><span class="ti">${ic(i, 19)}</span><b>${t}</b><span>${d}</span></a>`).join('')}</div>
      <h2 class="sec">분류별 둘러보기 <span class="c">${cats.length}</span></h2>
      <div class="grid g4">${cats.map(([b, n]) => `<a class="card catcard" href="${App.href('browse:cat=' + b)}"><span class="ci">${ic(CAT_IC[b] || 'box', 18)}</span><span><b>${esc(catName(b))}</b><small>${n} API</small></span></a>`).join('')}</div>
      <div class="grid g2" style="margin-top:28px">
        <div class="card listcard"><div class="cardhead">${ic('clock', 15)} 최근 본 · 즐겨찾기</div>${favs.concat(recs).length ? favs.map(lrow).concat(recs.map(lrow)).join('') : `<p class="note" style="padding:6px 12px 12px">API 상세에서 ${ic('star', 13)}를 눌러 즐겨찾기에 추가하세요. 최근 본 API도 여기에 쌓입니다.</p>`}</div>
        <div class="card listcard"><div class="cardhead">${ic('compare', 15)} ${prev} → ${cur2} 변화 <a class="c" style="margin-left:auto" href="${App.href('compare')}">전체 보기</a></div>
          <div class="change"><div class="add"><b>+${ds.A.length}</b><span>추가</span></div><div class="del"><b>−${ds.R.length}</b><span>삭제</span></div><div class="chg"><b>${ds.C.length}</b><span>변경</span></div></div>
          <p class="note" style="padding:0 14px 12px;margin:0">${ds.A.length ? `<b>추가</b> ${esc(names(ds.A, 4))}<br>` : ''}${ds.R.length ? `<b>삭제</b> ${esc(names(ds.R, 4))}` : ''}</p></div>
      </div>`);
    $('#hs').addEventListener('click', () => App.openPalette && App.openPalette());
    $('#main .page').insertAdjacentHTML('beforeend', '<p class="foot note" style="margin-top:34px">비공식 프로젝트이며 원문 문서의 저작자와 제휴·보증 관계가 없습니다. API 내용은 Apache-2.0으로 공개된 문서에서 수집해 변형했습니다. <a href="#" id="aboutlink2">정보 · 고지</a></p>');
    $('#aboutlink2').addEventListener('click', e => { e.preventDefault(); App.showAbout(); });
  };

  /* ====================== 탐색 ====================== */
  const parseQS = s => { const o = {}; (s || '').split('&').forEach(p => { if (!p) return; const i = p.indexOf('='); o[App.dec(i < 0 ? p : p.slice(0, i))] = i < 0 ? '' : App.dec(p.slice(i + 1)); }); return o; };
  const rowHTML = (r, i, P, H, q) => {
    const a = r.d.a, m = a.m, s = q ? U.E.snippet(r.d, P) : { text: App.firstSent(a.d && a.d.desc.replace(/Compatibility level.*$/s, '')), src: '설명' };
    return `<li><a class="row" data-i="${i}" href="${App.hrefFor(a)}"><div class="l1"><span class="kind">${App.hlz(a.kind, H)}</span><span class="gv">${App.hlz(gvOf(a), H)}</span>${stabBadge(a)}${scopeBadge(a)}<span class="badge">${esc(catName(a.book))}</span></div>
      <p class="snip">${s.src !== '설명' ? '<em>필드</em>' : ''}${App.hlz(s.text, H)}</p><div class="l2">${App.pills(m)}${App.consChips(m, 4)}</div></a></li>`;
  };
  V.browse = async (arg, my) => {
    App.title('API 탐색'); App.curKey = null;
    const st = Object.assign({ q: '', cat: '', sc: '', st: '', cn: '', sort: '' }, parseQS(arg)), E = U.E;
    const opt = (v, l, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`;
    const fsel = (id, label, opts) => `<label class="fchip${st[id] ? ' on' : ''}" id="f-${id}">${label}<select data-f="${id}" aria-label="${label}">${opts}</select></label>`;
    const catOpts = opt('', '전체', st.cat) + Object.keys(U.cats).sort((x, y) => catName(x).localeCompare(catName(y), 'ko')).map(b => opt(b, `${catName(b)} (${U.cats[b]})`, st.cat)).join('');
    App.render(`<div class="pagehead"><div class="eyebrow">API 탐색</div><h1>모든 버전을 한 번에 검색</h1><p>같은 API는 버전과 관계없이 한 번만 나오고, 제공 버전과 제약·제한 사항이 함께 표시됩니다. 필드 이름·설명·한글 키워드도 검색됩니다.</p></div>
      <div class="browsebar"><div class="qbox">${ic('search', 17)}<input id="bq" type="search" autocomplete="off" spellcheck="false" placeholder="API 이름, 그룹, 필드(spec.tls), 한글 키워드, deprecated …" value="${esc(st.q)}" aria-label="API 검색"><button class="x" id="bx" aria-label="지우기" ${st.q ? '' : 'hidden'}>${ic('x', 15)}</button></div>
        <label class="fchip">정렬<select data-f="sort" aria-label="정렬">${opt('', '관련도/이름', st.sort)}${opt('name', '이름순', st.sort)}${opt('group', '그룹순', st.sort)}${opt('new', '신규 우선', st.sort)}</select></label></div>
      <div class="filters">${fsel('cat', '분류', catOpts)}
        ${fsel('sc', '범위', opt('', '전체', st.sc) + opt('ns', '네임스페이스', st.sc) + opt('cl', '클러스터', st.sc))}
        ${fsel('st', '안정성', opt('', '전체', st.st) + opt('ga', 'GA', st.st) + opt('beta', 'Beta', st.st) + opt('alpha', 'Alpha', st.st))}
        ${fsel('cn', '제약', opt('', '전체', st.cn) + opt('dep', '폐지 예정 있음', st.cn) + opt('prev', '미리보기·기능 게이트', st.cn) + opt('imm', '변경 불가 필드', st.cn) + opt('ver', '일부 버전에만 제공', st.cn))}
        <button class="btn ghost sm" id="fclr" hidden>${ic('x', 13)} 필터 초기화</button></div>
      <div class="count" id="bc" aria-live="polite"></div><ul class="list" id="bl"></ul><div id="bm" style="margin-top:12px;text-align:center"></div><div id="bg"></div>`);
    let cur = -1, shown = [], limit = 60, rows = [], P = null, H = null;
    const apply = () => {
      const t0 = performance.now(), q = st.q.trim(), r = E.search(q, { cat: st.cat });
      P = r.P; H = E.highlighter(P);
      let list = r.apis.filter(x => {
        const a = x.d.a, m = a.m, f = m.flags || {};
        if (st.sc === 'ns' && m.ns !== true) return false; if (st.sc === 'cl' && m.ns !== false) return false;
        if (st.st && App.stab(m.gv[App.pickVer(m, App.ver)]) !== st.st) return false;
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
      $('#bc').innerHTML = `<span><b>${rows.length}</b>개 API</span> <span class="badge info">${VL.join(' · ')} 통합</span>${r.relaxed ? ' <span class="badge beta">일부 단어만 일치한 결과 포함</span>' : ''}<span style="margin-left:auto;font:12px var(--mono)">${(performance.now() - t0).toFixed(1)}ms</span>`;
      if (!rows.length) {
        const sg = q ? E.suggest(q) : [];
        $('#bl').innerHTML = `<li class="empty"><b>${q ? `‘${esc(q)}’` : '조건'}</b>에 맞는 API가 없습니다.${sg.length ? `<p class="hint">혹시 이것인가요? ${sg.map(d => `<a href="${App.href('browse:q=' + encodeURIComponent(d.a.kind))}">${esc(d.a.kind)}</a>`).join(' · ')}</p>` : '<p class="hint">검색어를 줄이거나 필터를 해제해 보세요.</p>'}</li>`;
      } else $('#bl').innerHTML = shown.map((x, i) => rowHTML(x, i, P, H, q)).join('');
      $('#bm').innerHTML = rows.length > shown.length ? `<button class="btn ghost" id="more">${ic('chevron-down', 14)} ${rows.length - shown.length}개 더 보기</button>` : '';
      const g = $('#bg'); g.innerHTML = q && r.guide.length ? `<div class="sec-title">가이드 문서</div><ul class="list guidelist">${r.guide.map(x => `<li><a class="row" href="${App.href('guide:' + x.g.id)}"><div class="l1"><span style="font-weight:500">${App.hlz(x.g.title, H)}</span></div></a></li>`).join('')}</ul>` : '';
      mark();
    };
    const mark = (noScroll) => { App.$$('#bl .row').forEach((e, i) => e.classList.toggle('cur', i === cur)); const c = $('#bl .row.cur'); if (c && !noScroll) c.scrollIntoView({ block: 'nearest' }); };
    const sync = () => { const qs = Object.entries(st).filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'); history.replaceState(null, '', App.href('browse' + (qs ? ':' + qs : ''))); };
    let raf = 0; const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (my !== undefined && my !== App.activeSeq) return; if (!document.body.contains($('#bq'))) return; limit = 60; apply(); sync(); }); };
    $('#bq').addEventListener('input', e => { st.q = e.target.value; later(); });
    $('#bq').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!shown.length) return; e.preventDefault(); cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; mark(); }
      else if (e.key === 'Enter' && cur >= 0 && shown[cur]) location.hash = App.hrefFor(shown[cur].d.a);
      else if (e.key === 'Escape' && st.q) { st.q = ''; e.target.value = ''; later(); }
    });
    $('#bx').addEventListener('click', () => { st.q = ''; $('#bq').value = ''; $('#bq').focus(); later(); });
    App.$$('select[data-f]').forEach(s => s.addEventListener('change', () => { st[s.dataset.f] = s.value; later(); }));
    $('#fclr').addEventListener('click', () => { st.cat = st.sc = st.st = st.cn = ''; App.$$('select[data-f]').forEach(s => { if (s.dataset.f !== 'sort') s.value = ''; }); later(); });
    $('#bm').addEventListener('click', e => {
      if (!e.target.closest('#more')) return;
      const from = shown.length; limit += 120; shown = rows.slice(0, limit);
      $('#bl').insertAdjacentHTML('beforeend', shown.slice(from).map((x, i) => rowHTML(x, from + i, P, H, st.q.trim())).join(''));
      $('#bm').innerHTML = rows.length > shown.length ? `<button class="btn ghost" id="more">${ic('chevron-down', 14)} ${rows.length - shown.length}개 더 보기</button>` : '';
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
    const head = [`apiVersion: ${d.gv}`, `kind: ${a.kind}`, 'metadata:', '  name: <이름>']; if (d.ns) head.push('  namespace: <네임스페이스>');
    const body = obj('', 0, 0); if (!body.length && a.d.props.some(p => p.n === 'spec')) body.push("spec: {}   # 필드는 아래 '필드' 참고");
    return head.concat(body).join('\n');
  };
  const ocFor = d => {
    const a = d.a, r = a.group ? `${d.low}.${a.group}` : d.low, n = d.ns ? ' -n <네임스페이스>' : '';
    return `# 목록 보기\noc get ${r}${d.ns ? ' -A' : ''}\n\n# 하나 자세히 보기\noc get ${r} <이름>${n} -o yaml\n\n# 필드 설명 보기\noc explain ${r}\noc explain ${r}.spec\n\n# 서버에 적용하기 전 검증만 (저장 안 함)\noc apply --dry-run=server -f ${d.low}.yaml\n\n# 만들기·수정 (위 YAML을 ${d.low}.yaml 로 저장)\noc apply -f ${d.low}.yaml\n\n# 편집 · 삭제\noc edit ${r} <이름>${n}\noc delete ${r} <이름>${n}`;
  };
  const restFor = d => {
    const eps = (d.a.d && d.a.d.eps) || [], fill = p => p.replace('{namespace}', '<네임스페이스>').replace('{name}', '<이름>'), has = (e, m) => e.ms.some(x => x.m === m);
    const col = eps.find(e => !/\{name\}|watch/.test(e.p) && has(e, 'GET')), one = eps.find(e => /\{name\}$/.test(e.p) && has(e, 'GET'));
    if (!col && !one) return '# 이 API는 REST 예시를 만들 수 없습니다. 아래 엔드포인트를 참고하세요.';
    const H = '-H "Authorization: Bearer $TOKEN"'; let s = 'TOKEN=$(oc whoami -t)\nAPISERVER=$(oc whoami --show-server)\n';
    if (col) s += `\n# 목록 조회\ncurl -sk ${H} "$APISERVER${fill(col.p)}"`;
    if (one) s += `\n\n# 하나 조회\ncurl -sk ${H} "$APISERVER${fill(one.p)}"`;
    if (col && has(col, 'POST')) s += `\n\n# 생성 (본문은 위 YAML 파일)\ncurl -sk -X POST ${H} -H "Content-Type: application/yaml" --data-binary @${d.low}.yaml \\\n  "$APISERVER${fill(col.p)}?fieldValidation=Strict"`;
    if (one && has(one, 'PATCH')) s += `\n\n# 일부만 수정 (merge patch)\ncurl -sk -X PATCH ${H} -H "Content-Type: application/merge-patch+json" \\\n  -d '{"metadata":{"labels":{"app":"demo"}}}' "$APISERVER${fill(one.p)}"`;
    if (one && has(one, 'DELETE')) s += `\n\n# 삭제\ncurl -sk -X DELETE ${H} "$APISERVER${fill(one.p)}"`;
    return s;
  };
  const CONS_GROUPS = [
    ['dep', '폐지 예정', 'alert', 'bad', '설명에 폐지·제거 예정이라고 적힌 필드나 동작입니다. 새로 만드는 리소스에서는 피하세요.'],
    ['prev', '미리보기 · 알파/베타 · 기능 게이트', 'flask', 'warn', '설명에 Technology Preview, 알파·베타 수준, 기능 게이트가 언급된 항목입니다. 안정 버전이라도 일부 필드는 아직 성숙하지 않았을 수 있습니다.'],
    ['imm', '변경 불가', 'lock', 'info', '만든 뒤에는 바꿀 수 없거나 읽기 전용인 필드입니다. 처음부터 올바르게 정해야 합니다.'],
    ['single', '이름 · 싱글턴', 'hash', 'mute', '이름이나 개수에 제한이 있는 리소스입니다.'],
    ['excl', '상호 배타 · 택일', 'git-branch', 'mute', '함께 쓸 수 없거나 정확히 하나만 골라야 하는 필드입니다.'],
    ['cond', '조건부', 'info', 'mute', '특정 조건에서만 유효하거나 필수가 되는 필드입니다.'],
    ['limit', '값 범위 · 형식', 'filter', 'mute', '길이·개수·범위·형식 제한이나 허용 값 목록입니다.'],
  ];
  function consCard(a, m, dv) {
    const L = VL.slice().reverse(), at = App.availText(m), stab = App.stab(m.gv[dv]);
    const gvs = L.filter(v => m.vers.includes(v)).map(v => `${v} ${m.gv[v]}`), gvChanged = new Set(m.vers.map(v => m.gv[v])).size > 1;
    const tiers = [...new Set(m.vers.map(v => m.tier && m.tier[v]).filter(Boolean))];
    const tierBy = L.filter(v => m.tier && m.tier[v]).map(v => `${v}: 레벨 ${m.tier[v]}`);
    const items = (type) => m.cons.filter(c => c.t === type);
    const itemHTML = c => `<div class="citem"><code${c.ps && c.ps.length > 1 ? ` title="${esc(c.ps.join(', '))}"` : ''}>${esc(c.p || 'API 전체')}</code>${c.n > 1 ? `<span class="morep">외 ${c.n - 1}곳</span>` : ''}${esc(c.x)}${c.v.length < m.vers.length ? `<span class="vs">${c.v.map(v => `<span class="vp">${v}</span>`).join('')}</span>` : ''}</div>`;
    const grp = (cls, icon, title, right, body, open) => `<details class="cgroup ${cls}"${open ? ' open' : ''}><summary><span class="ci ${cls}">${ic(icon, 15)}</span><span>${title}</span><span class="ct">${right || ''}${ic('chevron-right', 14, 'chev')}</span></summary>${body}</details>`;
    let h = grp(at ? 'warn' : 'ok', 'layers', '제공 버전', at ? `<span class="badge beta">${esc(at)}</span>` : `<span class="badge ga">전 버전 제공</span>`,
      `<p class="csum">${at ? `제공 범위: <b>${esc(at)}</b>. 선택한 버전에 없으면 가장 최신 제공 버전의 내용을 보여 줍니다.` : `조사한 ${VL.length}개 버전(${VL.join(', ')}) 모두에서 제공됩니다.`}</p><div class="citems"><div class="vrow" style="margin:0">${L.map(v => `<span class="vchip${m.vers.includes(v) ? '' : ' off'}">${v} ${m.vers.includes(v) ? esc(m.gv[v]) : '없음'}</span>`).join('')}</div>${gvChanged ? `<div class="citem">API 버전이 릴리스마다 바뀌었습니다: ${esc(gvs.join(' → '))}. 이전 버전용 매니페스트는 <code>apiVersion</code>을 확인하세요.</div>` : ''}</div>`, true);
    h += grp(stab === 'ga' ? 'ok' : stab === 'beta' ? 'warn' : 'bad', 'shield', '안정성 · 호환성', `<span class="badge ${stab}">${App.STAB[stab][0]}</span>`,
      `<p class="csum"><b>${esc(m.gv[dv])}</b> — ${esc(App.STAB[stab][1])}.</p>${tiers.length ? `<div class="citems">${tiers.map(t => `<div class="citem"><code>호환성 레벨 ${t}</code>${esc(App.TIER[t])}</div>`).join('')}${tiers.length > 1 ? `<div class="citem">버전별: ${esc(tierBy.join(' · '))}</div>` : ''}</div>` : '<p class="csum">원문에 호환성 레벨 표기가 없습니다.</p>'}`, stab !== 'ga' || tiers.some(t => t >= 3));
    h += grp('mute', 'box', '범위', `<span class="badge">${m.ns === true ? '네임스페이스' : m.ns === false ? '클러스터' : '정보 없음'}</span>`, `<p class="csum">${m.ns === true ? '네임스페이스 범위 리소스입니다. <code>metadata.namespace</code>가 필요하며 생략하면 현재 프로젝트에 만들어집니다.' : m.ns === false ? '클러스터 범위 리소스입니다. 네임스페이스 없이 전역으로 존재하며 <code>namespace</code>는 무시됩니다.' : '원문 엔드포인트 정보로는 범위를 판단할 수 없습니다.'}</p>`);
    for (const [t, title, icon, cls, desc] of CONS_GROUPS) {
      const list = items(t); if (!list.length) continue;
      h += grp(cls, icon, title, `<span>${list.length}개</span>`, `<p class="csum">${desc}</p><div class="citems">${list.slice(0, 40).map(itemHTML).join('')}${list.length > 40 ? `<div class="note">앞 40개만 표시합니다.</div>` : ''}</div>`, (t === 'dep' || t === 'prev' || t === 'single') && list.length <= 6);
    }
    const nf = m.fdiff.length, nt = m.tdiff.length, nr = m.rdiff.length, ne = m.ediff.length;
    if (m.vers.length > 1 && (nf || nt || nr || ne)) {
      const vsp = vs => `<span class="vs">${vs.map(v => `<span class="vp">${v}</span>`).join('')}</span>`;
      h += grp('info', 'compare', '버전별 차이', `<span>필드 ${nf} · 타입 ${nt} · 필수 ${nr} · 엔드포인트 ${ne}</span>`,
        `<div class="citems">${nf ? `<div class="citem"><b>일부 버전에만 있는 필드</b></div>${m.fdiff.map(e => `<div class="citem"><code>${esc(e.p)}</code>${e.sub ? `<span class="morep">하위 ${e.sub}개 포함</span>` : ''}${vsp(e.v)}</div>`).join('')}` : ''}
        ${nt ? `<div class="citem"><b>버전마다 타입이 다른 필드</b></div>${m.tdiff.map(e => `<div class="citem"><code>${esc(e.p)}</code>${Object.entries(e.t).map(([v, t]) => `<span class="vp">${v}</span> ${esc(t)}`).join(' · ')}</div>`).join('')}` : ''}
        ${nr ? `<div class="citem"><b>필수 여부가 다른 필드 (필수인 버전)</b></div>${m.rdiff.map(e => `<div class="citem"><code>${esc(e.p)}</code>${e.sub ? `<span class="morep">하위 ${e.sub}개 포함</span>` : ''}${vsp(e.v)}</div>`).join('')}` : ''}
        ${ne ? `<div class="citem"><b>일부 버전에만 있는 엔드포인트</b></div>${m.ediff.map(e => `<div class="citem"><code>${esc(e.e)}</code>${vsp(e.v)}</div>`).join('')}` : ''}${m.trunc ? '<div class="note">항목이 많아 일부만 표시합니다.</div>' : ''}</div>`, false);
    }
    const n = m.cons.length;
    return `<section class="card consbox" id="c-cons"><div style="display:flex;align-items:center;gap:10px;padding:12px 18px 8px"><span class="ci info" style="width:28px;height:28px;border-radius:8px;display:grid;place-items:center">${ic('shield', 16)}</span><b style="font-size:15.5px">제약 · 제한 사항</b><span class="note" style="margin:0 0 0 auto" title="원문 설명 문장에서 패턴 매칭으로 자동 추출했습니다. 오탐이나 누락이 있을 수 있으니 중요한 판단은 원문을 확인하세요.">원문 설명에서 자동 추출 · ${n}건</span></div>${h}</section>`;
  }
  function epsHTML(a, params) {
    const mblock = m => `<div class="mb"><div class="mh"><span class="m ${m.m}">${m.m}</span> ${esc(m.d)}</div>
      ${m.q.length ? `<div class="mq"><b>쿼리 파라미터</b>${m.q.map(n => `<div><code>${esc(n)}</code> <span class="ftp">${esc((params[n] || [])[0] || '')}</span> ${esc(App.short((params[n] || [])[1], 150))}</div>`).join('')}</div>` : ''}
      ${m.b ? `<div class="mq"><b>요청 본문</b> <code>${esc(m.b)}</code></div>` : (m.m === 'PATCH' ? '<div class="mq"><b>요청 본문</b> <span class="ftp">Patch (JSON Patch / Merge Patch / Strategic Merge Patch)</span></div>' : '')}
      ${m.r.length ? `<div class="mq"><b>응답</b> ${m.r.map(r => `<span class="resp">${esc(r[0])} <code>${esc(r[1])}</code></span>`).join('')}</div>` : ''}</div>`;
    return a.d.eps.map(e => `<details class="epd"><summary><span class="ms">${[...new Set(e.ms.map(m => m.m))].map(m => `<span class="m ${m}">${m}</span>`).join('')}</span><code>${esc(e.p)}</code></summary><div class="in">${e.ms.map(mblock).join('')}</div></details>`).join('');
  }
  function fieldTree(host, a, F, consBy) {
    const byPath = new Map(F.map(f => [f.p, f])), topRows = a.d.props.map(p => [p.n, p.t, p.d]);
    const rows = p => p === '' ? topRows : (byPath.get(p) ? byPath.get(p).r : []), reqs = p => new Set(p === '' ? a.d.required : (byPath.get(p) ? byPath.get(p).q : []));
    const base = n => n.replace(/(\[\]|\{\})+$/, ''), childOf = (p, n) => { for (const s of ['[]', '{}', '']) { const c = p + '.' + base(n) + s, f = byPath.get(c); if (f && f.r.length) return c; } return null; };
    const visible = (p, r) => !/(\[\]|\{\})$/.test(r[0]) || !rows(p).some(x => x[0] === base(r[0]));
    const chips = path => { const l = consBy.get(path); if (!l) return ''; return `<span class="fcons">${l.map(c => `<span class="cons ${c.t}" title="${esc(c.x)}">${c.t === 'dep' ? ic('alert', 11) + '폐지' : c.t === 'prev' ? ic('flask', 11) + '미리보기' : c.t === 'imm' ? ic('lock', 11) + '변경 불가' : ''}</span>`).join('')}</span>`; };
    const rowHTML = (p, r) => { const c = childOf(p, r[0]), full = (p + '.' + r[0]).replace(/^\./, ''); return `<div class="fr"><div class="fh${c ? ' has' : ''}"${c ? ` data-p="${esc(c)}" role="button" tabindex="0" aria-expanded="false"` : ''}><span class="tg">${c ? '▸' : '·'}</span><span class="fn">${esc(r[0])}</span><span class="ftp">${esc(r[1])}</span>${reqs(p).has(r[0]) ? '<span class="req">필수</span>' : ''}${chips(full)}</div><div class="fdsc">${esc(r[2])}</div><div class="fc" hidden></div></div>`; };
    const list = p => rows(p).filter(r => visible(p, r)).map(r => rowHTML(p, r)).join('');
    const all = []; for (const p of [''].concat([...byPath.keys()])) rows(p).forEach(r => { if (!/(\[\]|\{\})$/.test(r[0])) { const path = (p + '.' + r[0]).replace(/^\./, ''); all.push({ path, t: r[1], d: r[2], req: reqs(p).has(r[0]) }); } });
    host.innerHTML = `<div class="ftoolbar"><input class="ff" id="fq" placeholder="필드 검색 (예: tls, termination, port) — ${all.length.toLocaleString('ko-KR')}개 필드" aria-label="필드 검색"><button class="btn ghost sm" id="fexp">${ic('chevron-down', 13)} 1단계 펼치기</button></div><div class="ftree" id="ft">${list('')}</div>`;
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
      ft.innerHTML = `<div class="count" style="margin:6px 0">${hit.length}개 일치${hit.length > 120 ? ' (상위 120개)' : ''}</div>` + hit.slice(0, 120).map(f => `<div class="fr flat"><div class="fh"><span class="fn">${hlr(f.path)}</span><span class="ftp">${esc(f.t)}</span>${f.req ? '<span class="req">필수</span>' : ''}${chips(f.path)}</div><div class="fdsc">${hlr(f.d)}</div></div>`).join('');
    });
  }
  V.api = async rawId => {
    const my = App.activeSeq, id = App.dec(rawId), ver = App.ver; let key = null;
    for (const v of [ver].concat(VL)) { key = U.idKey.get(v + '|' + id); if (key) break; }
    if (!key) { App.title('찾을 수 없음'); App.render(`<button class="back" id="bk">${ic('chevron-left', 15)} 뒤로</button><div class="empty"><h1 style="font-size:18px">해당 API를 찾을 수 없습니다.</h1><p class="hint"><a href="${App.href('browse')}">API 탐색으로 이동</a></p></div>`); $('#bk').addEventListener('click', () => history.back()); return; }
    const m = MG.apis[key], dv = App.pickVer(m, ver), missing = !m.vers.includes(ver);
    await App.loadCore(dv); if (my !== App.activeSeq) return; const db = App.prep(dv); let a = U.byKey.get(key); if (!a || a.rv !== dv) a = db.apis.find(x => x.id === m.id[dv]) || a;
    if (!a.d) { App.render('<div class="empty">이 API의 상세 데이터가 없습니다.</div>'); return; }
    a.key = key; a.m = m; a.cons = m.cons;   // 최신이 아닌 버전의 레코드에도 통합 정보를 붙인다
    App.curKey = key; App.recent.push(key); App.title(a.kind);
    const d = docLike(a), x = a.d, fav = App.fav.has(key), first = App.firstSent(x.desc.replace(/Compatibility level.*$/s, '')), rest = x.desc.replace(/Compatibility level.*$/s, '').replace(/\s+/g, ' ').trim().slice(first.length).trim();
    const hrefV = v => `#${v}/api:${m.id[v]}`, stab = App.stab(m.gv[dv]);
    const tabs = [['c-cons', '제약·제한', 'shield'], ['c-usage', '사용 예시', 'code'], ['c-fields', '필드', 'list'], ['c-eps', '엔드포인트', 'server'], ['c-rel', '관계', 'topology']];
    const root = App.render(`
      <nav class="crumb" aria-label="경로"><a href="${App.href('')}">홈</a>${ic('chevron-right', 12)}<a href="${App.href('browse:cat=' + a.book)}">${esc(catName(a.book))}</a>${ic('chevron-right', 12)}<span>${esc(a.kind)}</span></nav>
      <section class="card dhead"><div class="top"><div><h1 class="d-title">${esc(a.kind)}</h1><div class="dbadges"><span class="gv">${esc(d.gv)}</span><span class="badge ${stab}" title="${esc(App.STAB[stab][1])}">${App.STAB[stab][0]}</span>${scopeBadge(a)}<span class="badge">${esc(catName(a.book))}</span>${m.tier && m.tier[dv] ? `<span class="badge info" title="${esc(App.TIER[m.tier[dv]])}">호환성 레벨 ${m.tier[dv]}</span>` : ''}</div></div>
        <div class="dact"><button class="btn ghost" id="favb" aria-pressed="${fav}">${ic(fav ? 'star-fill' : 'star', 15)} <span>${fav ? '즐겨찾기됨' : '즐겨찾기'}</span></button><button class="btn ghost" id="cpb">${ic('copy', 15)} 이름 복사</button><a class="btn primary" href="${App.href('sim:' + m.id[dv])}">${ic('flask', 15)} 시뮬레이터에서 설계</a></div></div>
        ${missing ? `<div class="isum" style="margin-top:14px;background:var(--warn-soft);color:var(--warn)">${ic('info', 14)} 선택한 <b>${ver}</b>에는 없는 API입니다. 제공되는 가장 최신 버전(<b>${dv}</b>) 기준으로 보여 줍니다.</div>` : ''}
        <div class="vrow"><span class="note" style="margin:0">제공 버전</span>${VL.slice().reverse().map(v => m.vers.includes(v) ? `<a class="vchip${v === dv ? ' on' : ''}" href="${hrefV(v)}" title="${m.fp[v] !== m.fp[dv] ? '선택 버전과 필드·엔드포인트가 다릅니다' : '선택 버전과 같습니다'}">${v} ${esc(m.gv[v])}${m.fp[v] !== m.fp[dv] ? ' ●' : ''}</a>` : `<span class="vchip off">${v} 없음</span>`).join('')}<span class="note" style="margin:0">● 선택한 버전과 다름</span></div>
        <p class="lead">${esc(first)}</p>${rest ? `<button class="more" id="more">자세히 보기</button><div class="full" id="full" hidden>${esc(rest)}</div>` : ''}
        ${x.required.length ? `<p class="note" style="margin-top:10px">반드시 넣어야 하는 필드: ${x.required.map(r => `<code class="req">${esc(r)}</code>`).join(' ')}</p>` : ''}
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
    $('#favb').addEventListener('click', () => { const on = App.fav.toggle(key); $('#favb').setAttribute('aria-pressed', on); $('#favb').innerHTML = `${ic(on ? 'star-fill' : 'star', 15)} <span>${on ? '즐겨찾기됨' : '즐겨찾기'}</span>`; App.toast(on ? '즐겨찾기에 추가했습니다' : '즐겨찾기에서 뺐습니다', on ? 'star-fill' : 'star'); });
    $('#cpb').addEventListener('click', e => App.copy(`${d.gv} ${a.kind}`, e.currentTarget));
    const mb = $('#more'); if (mb) mb.addEventListener('click', () => { $('#full').hidden = !$('#full').hidden; mb.textContent = $('#full').hidden ? '자세히 보기' : '접기'; });
    // 섹션 탭: 스크롤 이동 + 현재 위치 강조
    const secs = tabs.map(t => document.getElementById(t[0]));
    $('#stabs').addEventListener('click', e => { const t = e.target.closest('[data-sec]'); if (!t) return; e.preventDefault(); const el = document.getElementById(t.dataset.sec); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 118, behavior: 'smooth' }); });
    const io = new IntersectionObserver(es => { es.forEach(en => { if (en.isIntersecting) App.$$('#stabs a').forEach(t => { const on = t.dataset.sec === en.target.id; t.classList.toggle('on', on); if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); }); }); }, { rootMargin: '-120px 0px -65% 0px' });
    secs.forEach(s => s && io.observe(s));
    // 중첩 필드(큰 파일)는 뒤늦게, 관계도는 화면에 들어올 때
    let dead = false, live = null;
    const consBy = new Map(); m.cons.forEach(c => { if (['dep', 'prev', 'imm'].includes(c.t)) (c.ps && c.ps.length ? c.ps : (c.p ? [c.p] : [])).forEach(p => { if (!consBy.has(p)) consBy.set(p, []); consBy.get(p).push(c); }); });
    const loadF = () => App.ensureFields(dv, a.id).then(() => {
      if (dead) return; const F = App.fields(dv)[a.id] || []; const fh = $('#fieldhost'); if (fh) fieldTree(fh, a, F, consBy);
      tabsC[0][1] = yamlFull(d, F); if (ct === 0 && $('#codeb')) setCode(0);
    }).catch(() => { if (dead) return; const fh = $('#fieldhost'); if (!fh) return; fh.innerHTML = '<div class="empty" style="padding:20px"><p class="hint">중첩 필드 데이터를 불러오지 못했습니다.</p><button class="btn ghost sm" id="fretry">다시 시도</button></div>'; $('#fretry').addEventListener('click', () => { fh.innerHTML = '<div class="skel" style="height:120px"></div>'; loadF(); }); });
    loadF();
    const relIO = new IntersectionObserver(async es => {
      if (!es.some(e => e.isIntersecting)) return; relIO.disconnect();
      try { const [eng] = await Promise.all([App.engines(dv), App.lazyGraph()]); if (dead) return; Topo.init({ E: eng.E, G: eng.G, CAT, esc, go: App.nav, hash: App.href }); const host = $('#ego'); host.innerHTML = ''; live = Topo.mountEgo(host, m.id[dv]); } catch (e) { const h = $('#ego'); if (h) h.innerHTML = '<p class="note">관계도를 불러오지 못했습니다.</p>'; }
    }, { rootMargin: '300px' });
    relIO.observe($('#c-rel'));
    return () => { dead = true; io.disconnect(); relIO.disconnect(); if (live && live.destroy) live.destroy(); };
  };

  /* ====================== 버전 비교 ====================== */
  V.compare = async arg => {
    App.title('버전 비교'); App.curKey = null;
    const qs = parseQS(arg), to0 = VL.includes(qs.to) ? qs.to : App.ver, from0 = VL.includes(qs.from) ? qs.from : (VL[VL.indexOf(to0) + 1] || VL[VL.indexOf(to0) - 1]);
    let tab = ['added', 'removed', 'changed', 'same'].includes(qs.tab) ? qs.tab : 'changed';
    App.render(`<div class="pagehead"><div class="eyebrow">버전 비교</div><h1>어떤 API가 달라졌나</h1><p>두 버전 사이에서 추가·삭제·변경된 API를 봅니다. 변경은 필드·타입·엔드포인트나 API 버전(v1beta1 → v1)이 달라진 경우입니다.</p></div>
      <div class="browsebar"><label class="fchip">기준<select id="cf" aria-label="기준 버전">${VL.map(v => `<option${v === from0 ? ' selected' : ''}>${v}</option>`).join('')}</select></label>${ic('arrow-right', 16)}<label class="fchip">대상<select id="ct" aria-label="대상 버전">${VL.map(v => `<option${v === to0 ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <div class="qbox" style="max-width:300px">${ic('search', 17)}<input id="cq" placeholder="API 이름으로 거르기" aria-label="이름 필터"></div></div><div id="cres"></div>`);
    const render = () => {
      const f = $('#cf').value, t = $('#ct').value, q = $('#cq').value.trim().toLowerCase();
      history.replaceState(null, '', App.href(`compare:from=${f}&to=${t}&tab=${tab}`));
      if (f === t) { $('#cres').innerHTML = '<div class="empty">서로 다른 두 버전을 고르세요.</div>'; return; }
      const ds = diffSets(f, t), flt = arr => q ? arr.filter(k => k.toLowerCase().includes(q)) : arr;
      const sets = { added: flt(ds.A), removed: flt(ds.R), changed: flt(ds.C), same: flt(ds.S) };
      const label = { added: `${t}에 새로 생긴 API`, removed: `${f}에 있었으나 ${t}에는 없는 API`, changed: '양쪽에 있지만 필드·엔드포인트·API 버전이 다른 API', same: '양쪽에서 같은 API' };
      const li = k => {
        const m = MG.apis[k], [kind, group] = k.split('|'), tv = tab === 'removed' ? f : t, n = diffNums(m, f, t), parts = [];
        if (tab === 'changed') { if (n.gv) parts.push(`API 버전 ${esc(n.gv)}`); if (n.add) parts.push(`필드 +${n.add}`); if (n.del) parts.push(`필드 −${n.del}`); if (n.typ) parts.push(`타입 변경 ${n.typ}`); if (n.ep) parts.push(`엔드포인트 ${n.ep}`); if (!parts.length) parts.push('필드 설명·세부 정의 변경'); }
        return `<li><a class="row" href="#${tv}/api:${m.id[tv]}"><div class="l1"><span class="kind">${esc(kind)}</span><span class="gv">${esc(group || 'core')}/${esc(m.gv[tv])}</span><span class="badge">${esc(catName(m.book))}</span>${parts.length ? `<span class="spacer"></span>${parts.map(p => `<span class="cons ver">${p}</span>`).join('')}` : ''}</div></a></li>`;
      };
      $('#cres').innerHTML = `<div class="filters">${[['added', `추가 ${ds.A.length}`], ['removed', `삭제 ${ds.R.length}`], ['changed', `변경 ${ds.C.length}`], ['same', `동일 ${ds.S.length}`]].map(([k, l]) => `<button class="chip" data-ctab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>
        <p class="note" style="margin:0 0 10px">${f} → ${t} · ${label[tab]}</p><ul class="list">${sets[tab].slice(0, 400).map(li).join('') || '<li class="empty">해당하는 API가 없습니다.</li>'}</ul>`;
    };
    $('#cf').onchange = $('#ct').onchange = render; $('#cq').oninput = render;
    $('#cres').addEventListener('click', e => { const b = e.target.closest('[data-ctab]'); if (b) { tab = b.dataset.ctab; render(); } });
    render();
  };

  /* ====================== 가이드 ====================== */
  V.guide = async rawId => {
    const my = App.activeSeq, id = App.dec(rawId);
    App.title('가이드'); App.curKey = null; await App.loadCore(App.ver); if (my !== App.activeSeq) return; const G = App.prep(App.ver).guide;
    const g = id && G.find(s => s.id === id);
    if (!g) {
      if (id) App.toast('해당 가이드를 찾을 수 없어 목록을 보여 드립니다', 'info');
      App.render(`<div class="pagehead"><div class="eyebrow">가이드 · ${App.ver}</div><h1>API 지원 단계와 정책</h1><p>API 지원 단계, 호환성 정책, 폐지 정책, kubelet 로그 설정 문서입니다. 상단 검색에서 본문도 찾을 수 있습니다.</p></div><ul class="list guidelist">${G.filter(x => x.level <= 3 && !/^Overview|^API overview|^OpenShift Container|^(The )?[Pp]latformb/.test(x.title)).map(x => `<li><a class="row" href="${App.href('guide:' + x.id)}" style="${x.level === 3 ? 'margin-left:18px;width:calc(100% - 18px)' : ''}"><span style="font-weight:${x.level === 2 ? 600 : 400}">${esc(x.title)}</span></a></li>`).join('')}</ul>`);
      return;
    }
    App.title(g.title);
    App.render(`<button class="back" id="gb">${ic('chevron-left', 15)} 가이드 목록</button><div class="pagehead"><h1 style="font-size:22px">${esc(g.title)}</h1></div><div class="guide">${App.sanitize(g.html)}</div>`);
    $('#gb').onclick = () => App.nav('guide');
    App.$$('.guide pre').forEach(p => { const t = p.textContent; p.innerHTML = App.hi(t, 'bash'); const b = document.createElement('button'); b.className = 'copy'; b.innerHTML = ic('copy', 13) + ' 복사'; b.onclick = e => App.copy(t, e.currentTarget); p.prepend(b); });
  };

  /* ====================== 토폴로지 · 시뮬레이터 ====================== */
  V.topology = async rawSel => {
    const my = App.activeSeq, sel = App.dec(rawSel);
    App.title('토폴로지'); App.curKey = null; const ver = App.ver;
    App.render(`<div class="pagehead"><div class="eyebrow">토폴로지 · ${ver}</div><h1>API 사이의 연결</h1><p>색은 분류, 크기는 연결 수입니다. 노드를 누르면 설명과 연결 목록이 오른쪽에 나옵니다. 점선은 문서가 아니라 일반적인 구조를 정리한 관계입니다.</p></div><div id="topo"><div class="skel" style="height:420px"></div></div>`, true);
    const [eng] = await Promise.all([App.engines(ver), App.lazyGraph()]);
    if (my !== App.activeSeq) return;
    Topo.init({ E: eng.E, G: eng.G, CAT, esc, go: App.nav, hash: App.href });
    const host = $('#topo'); if (!host) return; host.innerHTML = '';
    const live = Topo.mountFull(host, eng.G.byId.has(sel) ? sel : null);
    return () => live && live.destroy && live.destroy();
  };
  V.sim = async rawId => {
    const my = App.activeSeq, id = App.dec(rawId);
    App.title('API 설계 시뮬레이터'); App.curKey = null; const ver = App.ver;
    App.render('<h1 class="sr-only">API 설계 시뮬레이터</h1><div id="simhost"><div class="skel" style="height:420px"></div></div>', true);
    const [eng] = await Promise.all([App.engines(ver), App.lazySim()]);
    if (my !== App.activeSeq) return;
    let want = id; const key = id && (U.idKey.get(ver + '|' + id) || (VL.map(v => U.idKey.get(v + '|' + id)).find(Boolean)));
    if (key) { const m = MG.apis[key]; want = m.id[ver] || ''; if (!want) App.toast(`${ver}에는 ${m.kind}가 없어 다른 리소스로 시작합니다`, 'info'); }
    const ctx = { E: eng.E, G: eng.G, CAT, esc, ver, VER: { list: VL }, db: eng.db, go: App.nav, hash: App.href, ensureFields: i => App.ensureFields(ver, i), fields: () => App.fields(ver), docOf: i => eng.E.docs.find(d => d.a.id === i), short: App.short, firstSent: App.firstSent };
    const host = $('#simhost'); if (!host) return; host.innerHTML = '';
    const live = Sim.mount(host, ctx, want || '');
    return () => live && live.destroy && live.destroy();
  };
  V.notfound = async () => { App.title('찾을 수 없음'); App.render(`<div class="empty"><h1 style="font-size:18px">페이지를 찾을 수 없습니다.</h1><p class="hint"><a href="${App.href('')}">홈으로</a></p></div>`); };
})();
