/* 토폴로지(전체 관계도)와 API 상세의 '연결 관계' 화면 */
(function (root) {
  const TL = { mention: '문서에서 언급', curated: '일반 관계', same: '같은 이름', variant: '이름 변형', group: '같은 그룹' };
  const TB = { mention: '문서', curated: '일반', same: '동명', variant: '변형', group: '그룹' };
  const TIP = {
    mention: '이 문서의 설명·필드 설명에 상대 API 이름이 나오는 경우',
    curated: 'OpenShift/Kubernetes의 일반적인 구조를 바탕으로 정리한 관계(이 문서에서 추출한 것이 아님)',
    same: '이름은 같고 API 그룹이 다른 경우', variant: '이름 끝부분이 다른 API 이름과 같은 경우(예: ClusterRoleBinding → RoleBinding)', group: '같은 API 그룹에 속한 경우',
  };
  let C = null, catIdx = {};

  function init(ctx) { C = ctx; Object.keys(ctx.CAT).forEach((k, i) => catIdx[k] = i); }
  const esc = s => C.esc(s);
  const dark = () => GraphDark();
  const colorOf = n => GraphColor(catIdx[n.book] || 0, dark());
  const doc = id => C.E.docs[C.G.byId.get(id).i];
  const firstSentence = t => { t = (t || '').replace(/Compatibility level.*$/s, '').replace(/\s+/g, ' ').trim(); return t.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] || t; };
  const fullDesc = t => (t || '').replace(/Compatibility level.*$/s, '').trim();
  const dotsample = t => { const s = GraphStyle[t] || GraphStyle.mention; return `<svg width="30" height="8" aria-hidden="true"><line x1="1" y1="4" x2="29" y2="4" stroke="currentColor" stroke-width="1.6" stroke-dasharray="${s.dash.join(' ')}"/></svg>`; };

  function typeChips(state, withGroup) {
    const ts = ['mention', 'curated', 'same', 'variant'].concat(withGroup ? ['group'] : []);
    return ts.map(t => `<button class="chip tchip" data-type="${t}" aria-pressed="${!!state.types[t]}" title="${esc(TIP[t])}">${dotsample(t)} ${TL[t]}</button>`).join('');
  }

  /* ---------- 설명 패널 ---------- */
  const RANK = { curated: 0, mention: 1, variant: 2, same: 3, group: 4 };
  // 같은 상대 API로 가는 관계(일반+문서 언급 등)는 한 항목으로 합친다
  function relItems(id, types) {
    const G = C.G, out = new Map(), inn = new Map(), sym = new Map();
    const put = (m, other, e) => {
      let r = m.get(other); if (!r) m.set(other, r = { other, pairs: [], types: [] });
      (e.labels.length ? e.labels : ['']).forEach(l => r.pairs.push([RANK[e.type], l]));
      if (!r.types.includes(e.type)) r.types.push(e.type);
    };
    for (const e of G.adj.get(id)) {
      if (!types[e.type]) continue;
      const other = e.s === id ? e.t : e.s;
      put(e.type === 'same' ? sym : e.s === id ? out : inn, other, e);
    }
    const arr = m => [...m.values()].map(r => {
      r.pairs.sort((a, b) => a[0] - b[0]); r.labels = [...new Set(r.pairs.map(p => p[1]).filter(Boolean))]; r.types.sort((a, b) => RANK[a] - RANK[b]); r.rank = RANK[r.types[0]]; return r;
    }).sort((a, b) => a.rank - b.rank || G.byId.get(a.other).kind.localeCompare(G.byId.get(b.other).kind));
    return { out: arr(out), inn: arr(inn), sym: arr(sym) };
  }
  function item(r) {
    const n = C.G.byId.get(r.other), label = r.labels.slice(0, 2).join(' · ');
    return `<button class="ri" data-sel="${esc(r.other)}"><span class="rk">${esc(n.kind)}</span>${label ? `<span class="rl">${esc(label)}</span>` : ''}${r.types.map(t => `<span class="rb ${t}" title="${esc(TL[t])}">${TB[t]}</span>`).join('')}</button>`;
  }
  function infoHTML(id, types, opt) {
    opt = opt || {};
    if (!id) return `<div class="ihelp"><b>노드를 눌러 보세요</b><p>API를 지정하면 설명과 연결 관계가 여기에 표시됩니다. 마우스를 올리면 간단한 설명이 말풍선으로 나옵니다.</p>
      <p class="note">실선은 이 문서의 본문에서 찾은 관계, 점선은 일반적인 구조를 정리한 관계입니다.</p></div>`;
    const G = C.G, n = G.byId.get(id), d = doc(id), a = d.a, x = a.d;
    const scope = d.ns ? '네임스페이스 범위' : (x && x.eps.length ? '클러스터 범위' : '');
    const rel = relItems(id, types), first = firstSentence(x && x.desc), full = fullDesc(x && x.desc), rest = full.replace(/\s+/g, ' ').slice(first.length).trim();
    const rep = rel.out.concat(rel.inn).slice(0, 3).map(r => G.byId.get(r.other).kind + (r.labels[0] ? `(${r.labels[0]})` : '')).join(', ');
    const summary = (rel.out.length || rel.inn.length || rel.sym.length)
      ? `<p class="isum"><b>${esc(a.kind)}</b> — 가리킴 ${rel.out.length}개 · 참조됨 ${rel.inn.length}개${rel.sym.length ? ` · 같은 이름 ${rel.sym.length}개` : ''}${rep ? `<br><span class="rl">대표 연결: ${esc(rep)}</span>` : ''}</p>`
      : `<p class="isum">선택한 관계 종류에서는 연결된 API가 없습니다. 위에서 관계 종류를 켜 보세요.</p>`;
    const sec = (title, arr) => arr.length ? `<div class="rs"><div class="rt">${title} <span>${arr.length}</span></div><div class="rl2">${arr.slice(0, 40).map(item).join('')}</div></div>` : '';
    return `<div class="ihead"><span class="idot" style="background:${colorOf(n)}"></span><div><div class="ikind">${esc(a.kind)}</div>
      <div class="igv">${esc(d.gv)}</div></div></div>
      <div class="imeta">${scope ? `<span class="tag">${scope}</span>` : ''}<span class="tag">${esc(C.CAT[a.book] || '')}</span></div>
      <p class="idesc">${esc(first)}</p>
      ${rest ? `<details class="imore"><summary>설명 더 보기</summary><div class="ifull">${esc(rest)}</div></details>` : ''}
      ${summary}
      ${sec('이 API가 가리키는 것', rel.out)}${sec('이 API를 가리키는 것', rel.inn)}${sec('같은 이름', rel.sym)}
      <div class="iact"><button class="btn" data-act="open">상세 보기</button>${opt.focusBtn ? `<button class="btn ghost" data-act="focus">${opt.focused ? '전체 다시 보기' : '연결된 API만 보기'}</button>` : ''}</div>`;
  }

  /* ---------- 호버 말풍선 ---------- */
  function tipFor(host) {
    const t = document.createElement('div'); t.className = 'gtip'; t.hidden = true; host.appendChild(t);
    return (n, px, py, pt) => {
      if (!n || pt === 'touch') { t.hidden = true; return; }
      const d = doc(n.id), x = d.a.d, s = firstSentence(x && x.desc);
      t.innerHTML = `<b>${esc(n.label)}</b> <span>${esc(d.gv)}</span><div>${esc(s.length > 140 ? s.slice(0, 140) + '…' : s)}</div>`;
      t.hidden = false;
      const hw = host.clientWidth, w = 260, left = px + 14 + w > hw ? px - w - 14 : px + 14;
      t.style.left = Math.max(4, left) + 'px'; t.style.top = Math.min(host.clientHeight - 90, py + 14) + 'px';
    };
  }

  /* ---------- 공통: 노드/간선 구성 ---------- */
  function mkNode(n, deg, over) { return Object.assign({ id: n.id, label: n.kind, color: colorOf(n), r: 6 + Math.min(9, Math.sqrt(deg) * 1.7), deg, book: n.book }, over || {}); }
  function labelFix(nodes) {
    const cnt = {}; nodes.forEach(n => cnt[n.label] = (cnt[n.label] || 0) + 1);
    nodes.forEach(n => { if (cnt[n.label] > 1) { const g = C.G.byId.get(n.id).group; n.label += ' · ' + (g ? g.split('.')[0] : 'core'); } });
  }

  /* ---------- API 상세: 연결 관계(중심 API 기준) ---------- */
  function mountEgo(host, centerId) {
    const G = C.G, state = { depth: 1, types: { mention: true, curated: true, same: true, variant: true, group: false }, sel: centerId };
    host.innerHTML = `<h3>연결 관계</h3>
      <div class="tctl"><div class="tchips">${typeChips(state, true)}</div>
      <div class="seg" role="group" aria-label="탐색 깊이"><button data-depth="1" aria-pressed="true">1단계</button><button data-depth="2" aria-pressed="false">2단계</button></div></div>
      <div class="egobox"><div class="gcv"><canvas role="img" aria-label="API 연결 관계도"></canvas><div class="zbtn"><button data-z="in" aria-label="확대">+</button><button data-z="out" aria-label="축소">−</button><button data-z="fit" aria-label="맞춤">⤢</button></div></div>
      <div class="tinfo" id="egoinfo"></div></div>
      <p class="note">노드를 누르면 설명이 옆(좁은 화면에서는 아래)에 나타납니다. 실선은 문서에서 찾은 관계, 점선은 일반적인 구조입니다. 휠로 확대, 드래그로 이동합니다.</p>`;
    const cv = host.querySelector('canvas'), info = host.querySelector('#egoinfo'), box = host.querySelector('.gcv');
    const hover = tipFor(box);
    const view = new GraphView(cv, { labels: 'all', rep: 900, edgeLen: 95, gravity: 0.004, dimEdge: 0.3, dimNode: 0.5, onSelect: n => { if (n) selectNode(n.id); }, onHover: hover });
    function build() {
      const edgeOk = e => state.types[e.type], set = new Map([[centerId, 0]]), cap = state.depth === 1 ? 30 : 46;
      let frontier = [centerId];
      for (let dd = 1; dd <= state.depth; dd++) {
        const next = [];
        for (const f of frontier) for (const e of G.adj.get(f).filter(edgeOk).sort((a, b) => b.w - a.w)) { const o = e.s === f ? e.t : e.s; if (!set.has(o) && set.size < cap) { set.set(o, dd); next.push(o); } }
        frontier = next;
      }
      const gedges = [], me = G.byId.get(centerId);
      if (state.types.group && me.group) G.nodes.filter(n => n !== me && n.group === me.group).slice(0, 14).forEach(n => { if (!set.has(n.id)) set.set(n.id, 1); gedges.push({ s: centerId, t: n.id, type: 'group', labels: ['같은 그룹'], w: 1 }); });
      const edges = G.edges.filter(e => edgeOk(e) && set.has(e.s) && set.has(e.t)).concat(gedges);
      const deg = {}; edges.forEach(e => { deg[e.s] = (deg[e.s] || 0) + 1; deg[e.t] = (deg[e.t] || 0) + 1; });
      const ids = [...set.keys()], n1 = ids.filter(i => set.get(i) === 1), n2 = ids.filter(i => set.get(i) === 2);
      const nodes = ids.map(id => {
        const n = G.byId.get(id), dist = set.get(id);
        const o = id === centerId ? { r: 15, center: true, fixed: true, pin: true, x: 0, y: 0 } : null;
        const node = mkNode(n, deg[id] || 0, o);
        if (!o) { const arr = dist === 1 ? n1 : n2, i = arr.indexOf(id), ang = (i / Math.max(1, arr.length)) * Math.PI * 2 + (dist === 2 ? 0.3 : 0), rr = dist === 1 ? 150 : 270; node.x = Math.cos(ang) * rr; node.y = Math.sin(ang) * rr; }
        return node;
      });
      labelFix(nodes);
      view.setData(nodes, edges, { sel: state.sel, warm: 260 });
      view.select(state.sel); renderInfo();
    }
    function renderInfo() { info.innerHTML = infoHTML(state.sel, state.types); }
    function selectNode(id) { state.sel = id; view.select(id); renderInfo(); }
    host.querySelector('.tchips').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (!b) return; state.types[b.dataset.type] = !state.types[b.dataset.type]; b.setAttribute('aria-pressed', state.types[b.dataset.type]); build(); });
    host.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('[data-depth]'); if (!b) return; state.depth = +b.dataset.depth; host.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); build(); });
    box.addEventListener('click', e => { const z = e.target.closest('[data-z]'); if (!z) return; z.dataset.z === 'fit' ? view.fit() : view.zoomBy(z.dataset.z === 'in' ? 1.3 : 1 / 1.3); });
    info.addEventListener('click', e => {
      const s = e.target.closest('[data-sel]'); if (s) { selectNode(s.dataset.sel); return; }   // 그래프에 이미 모두 보이므로 화면은 움직이지 않는다
      const a = e.target.closest('[data-act]'); if (a && a.dataset.act === 'open') C.go('api:' + state.sel);
    });
    build();
    return { destroy: () => view.destroy() };
  }

  /* ---------- 토폴로지 전체 화면 ---------- */
  function mountFull(host, selId) {
    const G = C.G, E = C.E, cats = [...new Set(G.nodes.map(n => n.book))].sort((a, b) => (C.CAT[a] || a).localeCompare(C.CAT[b] || b, 'ko'));
    const state = { types: { mention: true, curated: true, same: true, variant: true }, sel: selId || null, cat: '', q: '', hideIso: false, focused: false };
    const pos = new Map();
    host.innerHTML = `<div class="tctl"><input class="tfind" id="tfind" type="search" placeholder="API 찾아서 강조 (예: route, 네트워크, mcp)" autocomplete="off" aria-label="토폴로지에서 API 찾기">
        <label class="chk"><input type="checkbox" id="tiso"> 연결 없는 API 숨기기</label><button class="btn ghost" id="trelay">배치 다시</button></div>
      <div class="tchips" id="ttypes">${typeChips(state, false)}</div>
      <div class="tchips cats" id="tcats">${cats.map(b => `<button class="chip" data-tcat="${b}" aria-pressed="false"><i class="dot" style="background:${GraphColor(catIdx[b], dark())}"></i>${esc(C.CAT[b] || String(b).replace(/_apis$/, '').replace(/_/g, ' '))}</button>`).join('')}</div>
      <div class="tbody"><div class="gcv big"><canvas role="img" aria-label="전체 API 토폴로지 그래프. 키보드로는 아래 노드 목록을 사용하세요"></canvas><div class="zbtn"><button data-z="in" aria-label="확대">+</button><button data-z="out" aria-label="축소">−</button><button data-z="fit" aria-label="맞춤">⤢</button></div><div class="gstat" id="tstat"></div></div>
      <div class="tinfo" id="tinfo"></div></div>
      <details class="epd" id="nl"><summary>노드 목록 (키보드·스크린리더용)</summary><div class="in" id="nlist"></div></details>`;
    cats.forEach(b => { if (!(b in catIdx)) catIdx[b] = Object.keys(catIdx).length; });
    const cv = host.querySelector('canvas'), info = host.querySelector('#tinfo'), box = host.querySelector('.gcv'), stat = host.querySelector('#tstat');
    const hover = tipFor(box);
    const view = new GraphView(cv, { labels: 'auto', rep: 380, edgeLen: 46, gravity: 0.0025, onSelect: n => selectNode(n ? n.id : null), onHover: hover });
    let ringR = 0;
    function centers() {
      const cnt = {}; G.nodes.forEach(n => cnt[n.book] = (cnt[n.book] || 0) + 1);
      const total = cats.reduce((s, b) => s + Math.sqrt(cnt[b]), 0), out = {}; let ang = 0; ringR = 140 + total * 4.5;
      cats.forEach(b => { const share = Math.sqrt(cnt[b]) / total * Math.PI * 2; ang += share / 2; out[b] = [Math.cos(ang) * ringR, Math.sin(ang) * ringR]; ang += share / 2; });
      return out;
    }
    const cen = centers();
    function build(keepPos) {
      const edges = G.edges.filter(e => state.types[e.type]), deg = {};
      edges.forEach(e => { deg[e.s] = (deg[e.s] || 0) + 1; deg[e.t] = (deg[e.t] || 0) + 1; });
      let list = G.nodes.filter(n => !state.hideIso || deg[n.id]);
      const nodes = list.map((n, i) => {
        const node = mkNode(n, deg[n.id] || 0, { tx: cen[n.book][0], ty: cen[n.book][1] });
        const p = keepPos && pos.get(n.id); if (p) { node.x = p[0]; node.y = p[1]; } else { const a = i * 2.4; node.x = cen[n.book][0] + Math.cos(a) * 30; node.y = cen[n.book][1] + Math.sin(a) * 30; }
        return node;
      });
      labelFix(nodes);
      view.setData(nodes, edges, { sel: state.sel, warm: keepPos ? 50 : 200 });
      view.select(state.sel); applyKeep(); renderInfo(); stat.textContent = `API ${nodes.length}개 · 관계 ${view.edges.length}개`;
    }
    function savePos() { view.nodes.forEach(n => pos.set(n.id, [n.x, n.y])); }
    function applyKeep() {
      let keep = null;
      if (state.q) { const r = E.search(state.q).apis.slice(0, 40); keep = new Set(r.map(x => x.d.a.url.split('#')[1])); }
      else if (state.cat) keep = new Set(G.nodes.filter(n => n.book === state.cat).map(n => n.id));
      if (state.focused && state.sel) { const s = new Set([state.sel, ...(view.nb.get(state.sel) || [])]); keep = keep ? new Set([...keep].filter(i => s.has(i))) : s; }
      view.setKeep(keep); return keep;
    }
    function renderInfo() { info.innerHTML = infoHTML(state.sel, state.types, { focusBtn: !!state.sel, focused: state.focused }); }
    function selectNode(id) {
      state.sel = id; if (!id) state.focused = false; view.select(id); applyKeep(); renderInfo();
      history.replaceState(null, '', C.hash(id ? 'topology:' + encodeURIComponent(id) : 'topology'));
    }
    host.querySelector('#ttypes').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (!b) return; state.types[b.dataset.type] = !state.types[b.dataset.type]; b.setAttribute('aria-pressed', state.types[b.dataset.type]); savePos(); build(true); });
    host.querySelector('#tcats').addEventListener('click', e => {
      const b = e.target.closest('[data-tcat]'); if (!b) return; state.cat = state.cat === b.dataset.tcat ? '' : b.dataset.tcat;
      host.querySelectorAll('#tcats .chip').forEach(x => x.setAttribute('aria-pressed', x.dataset.tcat === state.cat)); applyKeep();
    });
    const find = host.querySelector('#tfind');
    find.addEventListener('input', () => { state.q = find.value.trim(); applyKeep(); });
    find.addEventListener('keydown', e => { if (e.key === 'Enter') { const r = state.q && E.search(state.q).apis[0]; if (r) { const id = r.d.a.url.split('#')[1]; state.q = ''; find.value = ''; selectNode(id); view.focusOn(id, 1.6); } } });
    host.querySelector('#tiso').addEventListener('change', e => { state.hideIso = e.target.checked; savePos(); build(true); });
    host.querySelector('#trelay').addEventListener('click', () => { pos.clear(); build(false); });
    box.addEventListener('click', e => { const z = e.target.closest('[data-z]'); if (!z) return; z.dataset.z === 'fit' ? view.fit() : view.zoomBy(z.dataset.z === 'in' ? 1.3 : 1 / 1.3); });
    info.addEventListener('click', e => {
      const s = e.target.closest('[data-sel]'); if (s) { selectNode(s.dataset.sel); view.focusOn(s.dataset.sel, Math.max(view.view.k, 1.3)); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'open') C.go('api:' + state.sel);
      if (a.dataset.act === 'focus') { state.focused = !state.focused; applyKeep(); renderInfo(); if (state.focused) view.focusOn(state.sel, 1.2); else view.fit(); }
    });
    host.querySelector('#nl').addEventListener('toggle', e => {
      const box = host.querySelector('#nlist'); if (!e.target.open || box.dataset.ready) return; box.dataset.ready = '1';
      box.innerHTML = [...view.nodes].sort((a, b) => a.label.localeCompare(b.label)).map(n => `<button class="ri" data-nid="${esc(n.id)}" style="width:100%"><span class="rk">${esc(n.label)}</span><span class="rl">${esc(doc(n.id).gv)}</span></button>`).join('');
      box.addEventListener('click', ev => { const b = ev.target.closest('[data-nid]'); if (b) { selectNode(b.dataset.nid); view.focusOn(b.dataset.nid, 1.4); info.scrollIntoView({ block: 'nearest' }); } });
    });
    build(false);
    if (state.sel && view.map.has(state.sel)) view.focusOn(state.sel, 1.5);
    return { destroy: () => view.destroy() };
  }

  root.Topo = { init, mountEgo, mountFull };
})(window);
