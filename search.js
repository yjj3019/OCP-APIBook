/* 검색 엔진: 브라우저(window.ApiSearch)와 Node(module.exports) 양쪽에서 동작 */
(function (root) {
  const CAT_KO = {
    network_apis: '네트워크', monitoring_apis: '모니터링', metadata_apis: '메타데이터', config_apis: '클러스터 설정',
    extension_apis: '확장', schedule_and_quota_apis: '스케줄·쿼터', operator_apis: '오퍼레이터', provisioning_apis: '프로비저닝',
    template_apis: '템플릿', workloads_apis: '워크로드', operatorhub_apis: '오퍼레이터허브', security_apis: '보안',
    autoscale_apis: '오토스케일', role_apis: '역할', rbac_apis: 'RBAC', console_apis: '콘솔', machine_apis: '머신',
    storage_apis: '스토리지', policy_apis: '정책', user_and_group_apis: '사용자·그룹', image_apis: '이미지',
    authorization_apis: '권한', node_apis: '노드', oauth_apis: '인증(OAuth)', project_apis: '프로젝트',
  };
  const CAT_EN = k => k.replace(/_apis$/, '').replace(/_/g, ' ');

  // 한글 키워드 -> 영문 검색어
  const KO = {
    '라우트': ['route'], '라우터': ['route', 'router', 'ingresscontroller'], '네트워크': ['network'], '정책': ['policy'],
    '노드': ['node'], '머신': ['machine'], '스토리지': ['storage', 'volume'], '저장소': ['storage', 'volume'],
    '볼륨': ['volume', 'persistentvolume'], '모니터링': ['monitoring', 'prometheus', 'alert'], '알림': ['alert', 'alertmanager'],
    '경고': ['alert'], '인증': ['oauth', 'authentication', 'identity'], '로그인': ['oauth', 'user', 'identity'],
    '권한': ['role', 'rbac', 'authorization', 'binding'], '역할': ['role', 'clusterrole'], '사용자': ['user', 'identity'],
    '유저': ['user'], '그룹': ['group'], '프로젝트': ['project', 'namespace'], '네임스페이스': ['namespace'],
    '이미지': ['image', 'imagestream'], '레지스트리': ['registry', 'image'], '빌드': ['build'], '배포': ['deployment', 'deploymentconfig'],
    '템플릿': ['template'], '오퍼레이터': ['operator', 'clusteroperator'], '콘솔': ['console'], '인그레스': ['ingress', 'route', 'ingresscontroller'],
    '서비스': ['service'], '시크릿': ['secret'], '비밀': ['secret'], '설정': ['config', 'configuration'], '구성': ['config', 'configuration'],
    '쿼터': ['quota'], '제한': ['limit', 'quota'], '스케줄러': ['scheduler'], '스케줄': ['schedule', 'scheduler'],
    '오토스케일': ['autoscaler', 'horizontalpodautoscaler'], '오토스케일러': ['autoscaler'], '확장': ['autoscaler', 'scale', 'extension'],
    '보안': ['security', 'securitycontextconstraints'], '인증서': ['certificate', 'certificatesigningrequest'], '클러스터': ['cluster'],
    '프록시': ['proxy'], '로깅': ['logging', 'log'], '로그': ['log', 'logging'], '백업': ['backup', 'etcd'], '스냅샷': ['snapshot'],
    '파드': ['pod'], '컨테이너': ['container', 'pod'], '설치': ['install', 'installconfig'], '업그레이드': ['clusterversion', 'update'],
    '업데이트': ['clusterversion', 'update'], '버전': ['version', 'clusterversion'], '도메인': ['dns', 'domain'], '트래픽': ['network', 'ingress', 'route'],
    '방화벽': ['egressfirewall', 'networkpolicy'], '프로메테우스': ['prometheus'], '규칙': ['rule'], '카탈로그': ['catalog', 'catalogsource'],
    '구독': ['subscription'], '머신세트': ['machineset'], '상태': ['status', 'health'], '토큰': ['token'], '웹훅': ['webhook'],
    '컨트롤러': ['controller'], '스토리지클래스': ['storageclass'], '환경': ['environment', 'env'], '리소스': ['resource'],
    '커스텀': ['custom', 'customresourcedefinition'], '예약': ['schedule', 'cronjob'], '작업': ['job', 'cronjob'], '잡': ['job'],
    '크론': ['cronjob'], '데몬': ['daemonset'], '복제': ['replicaset', 'replication'], '접근': ['access', 'authorization'],
    '암호화': ['encryption', 'apiserver'], '감사': ['audit'], '노출': ['route', 'service'], '호스트': ['host'],
    '설명': [], '사용법': [], '방법': [], '만들기': [], '생성': [], '조회': [], '삭제': [], '예제': [], '예시': [],
    '스트림': ['stream', 'imagestream'], '이미지스트림': ['imagestream'], '태그': ['tag', 'imagetag'], '풀': ['pull'], '가져오기': ['import'],
    '조직': ['group', 'user'], '계정': ['serviceaccount', 'user'], '서비스계정': ['serviceaccount'], '설정맵': ['configmap'], '네트워크정책': ['networkpolicy'],
    '가상머신': ['virtualmachine', 'vm'], '폐지': ['deprecated', 'removed'], '폐지예정': ['deprecated', 'removed'], '변경불가': ['immutable', 'cannot', 'changed'], '불변': ['immutable'], '미리보기': ['preview', 'technology'], '기능게이트': ['feature', 'gate'], '제약': ['must', 'cannot', 'only'], '싱글턴': ['singleton', 'cluster'], '상호배타': ['mutually', 'exclusive'], '쿠버네티스': ['kubernetes'], '오픈시프트': ['openshift'],
  };
  const KO_KEYS = Object.keys(KO).sort((a, b) => b.length - a.length);
  // 영문 별칭
  const EN = {
    ingress: ['route', 'ingresscontroller'], lb: ['loadbalancer', 'service'], cm: ['configmap'], pvc: ['persistentvolumeclaim'],
    pv: ['persistentvolume'], sa: ['serviceaccount'], ns: ['namespace'], deploy: ['deployment'], svc: ['service'], sts: ['statefulset'],
    ds: ['daemonset'], hpa: ['horizontalpodautoscaler'], crd: ['customresourcedefinition'], scc: ['securitycontextconstraints'],
    rbac: ['role', 'rolebinding', 'clusterrole'], cert: ['certificate'], csr: ['certificatesigningrequest'], sc: ['storageclass'],
    vm: ['virtualmachine'], dns: ['dns'], tls: ['route', 'certificate'], login: ['oauth', 'user'], secret: ['secret'],
    permission: ['role', 'rolebinding', 'authorization'], permissions: ['role', 'rolebinding', 'authorization'], auth: ['oauth', 'authentication', 'authorization'],
    firewall: ['egressfirewall', 'networkpolicy'], egress: ['egress'], pod: ['pod'], volume: ['persistentvolume', 'volume'],
    quota: ['resourcequota', 'clusterresourcequota'], limit: ['limitrange', 'resourcequota'], alert: ['prometheusrule', 'alertmanager'],
    upgrade: ['clusterversion'], update: ['clusterversion'], scale: ['horizontalpodautoscaler', 'machineset'], log: ['clusterlogging', 'logging'],
  };
  const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'for', 'and', 'or', 'in', 'on', 'is', 'how', 'what', 'api', 'apis', 'use', 'with', 'object', 'objects']);
  const FW = { name: 10, alias: 7, group: 4, cat: 3, pname: 2.6, fname: 2.2, cname: 3.4, cons: 1.1, ep: 1.4, desc: 2, pdesc: 0.8 };

  const hasKo = s => /[가-힣]/.test(s);
  const camel = s => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase();
  const words = s => camel(s).split(/[^a-z0-9가-힣]+/).filter(Boolean);
  function stem(t) {
    if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
    if (t.length > 4 && t.endsWith('sses')) return t.slice(0, -2);
    if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1);
    return t;
  }
  function addAll(set, toks) { for (const t of toks) { set.add(t); const s = stem(t); if (s !== t) set.add(s); } return set; }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1); // 전치 (두 행 전 값 사용)
        cur[j] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }
  const segs = p => p.split('.').map(x => x.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(x => x.length > 3); // 소문자로 붙여 쓴 필드명(namedport 등)
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sentences = t => t.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);

  function create(BOOK) {
    const docs = BOOK.apis.map((a, i) => {
      const d = a.d || { desc: '', props: [], eps: [], required: [] };
      const desc = d.desc.replace(/Compatibility level.*$/s, '').trim();
      const nameToks = words(a.kind);
      const low = a.kind.toLowerCase();
      const catKo = CAT_KO[a.book] || '';
      const f = {
        name: addAll(new Set([low]), nameToks),
        alias: new Set(),
        group: addAll(new Set(), [...a.group.toLowerCase().split(/[./-]+/), a.version.toLowerCase()].filter(Boolean)),
        cat: addAll(new Set(), [...words(CAT_EN(a.book)), ...words(catKo)]),
        pname: addAll(new Set(), d.props.flatMap(p => words(p.n))),
        fname: addAll(new Set(), (a.fp || []).flatMap(p => words(p))),
        cname: new Set([...d.props.map(p => p.n), ...(a.fp || [])].flatMap(segs)),   // 붙여 쓴 필드명(정확 일치 전용)   // 중첩 필드 경로(spec.tls.termination 등)
        cons: addAll(new Set(), words((a.cons || []).map(c => c.x).join(' '))),   // 제약·제한 사항 문장
        ep: addAll(new Set(), d.eps.flatMap(e => words(e.p))),
        desc: addAll(new Set(), words(desc)),
        pdesc: addAll(new Set(), d.props.flatMap(p => words(p.d))),
      };
      return {
        i, a, low, desc, nameToks, f, catKo,
        initials: nameToks.length > 1 ? nameToks.map(t => t[0]).join('') : '',
        bounds: nameToks.reduce((o, t) => (o.set.add(o.n), o.n += t.length, o), { set: new Set(), n: 0 }).set,   // 이름 안 단어 시작 위치
        gv: (a.group ? a.group + '/' : '') + a.version,
        ns: d.eps.some(e => e.p.includes('{namespace}')),
        sents: [{ t: desc, src: '설명' }].concat(sentences(desc).map(t => ({ t, src: '설명' })), d.props.map(p => ({ t: p.n + ' — ' + p.d, src: '필드' })), (a.fp || []).filter(p => p.includes('.')).slice(0, 800).map(p => ({ t: p, src: '필드 경로' }))).map(x => (x.l = x.t.toLowerCase(), x)),
      };
    });
    // 문서 빈도(IDF)
    const df = new Map();
    for (const d of docs) {
      const seen = new Set();
      for (const k in d.f) d.f[k].forEach(t => seen.add(t));
      seen.forEach(t => df.set(t, (df.get(t) || 0) + 1));
    }
    const N = docs.length;
    const idf = t => 0.45 + 0.55 * Math.max(0, Math.log(N / ((df.get(t) || 0) + 1))) / Math.log(N);
    const vocab = []; // "혹시 이것?" 용 이름 목록
    docs.forEach(d => vocab.push(d));

    const guide = BOOK.guide.map(s => {
      const text = s.html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
      return { s, title: s.title.toLowerCase(), text: text.toLowerCase(), raw: text.replace(/\s+/g, ' ') };
    });

    // ---------- 역색인 ----------
    const tIdx0 = (typeof performance !== 'undefined' ? performance : Date).now();
    const FIELDS = Object.keys(FW);
    const FUZZY_F = new Set(['name', 'group', 'pname', 'cat']);
    const tokId = new Map(), toks = [], posts = [];            // 단어 -> id, id -> 단어, id -> [필드별 문서 목록]
    docs.forEach(d => FIELDS.forEach((k, fi) => d.f[k].forEach(t => {
      let id = tokId.get(t);
      if (id === undefined) { id = toks.length; tokId.set(t, id); toks.push(t); posts.push([]); }
      (posts[id][fi] || (posts[id][fi] = [])).push(d.i);
    })));
    const sorted = toks.map((_, i) => i).sort((a, b) => (toks[a] < toks[b] ? -1 : toks[a] > toks[b] ? 1 : 0)); // 접두 검색용
    const lowerBound = s => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (toks[sorted[m]] < s) lo = m + 1; else hi = m; } return lo; };
    const tri = new Map();                                       // 3-gram -> 단어 id (부분 문자열 검색용)
    toks.forEach((t, id) => { for (let i = 0; i + 3 <= t.length; i++) { const g = t.substr(i, 3); let a = tri.get(g); if (!a) tri.set(g, a = []); if (a[a.length - 1] !== id) a.push(id); } });
    const fuzzyIds = [...new Set(docs.flatMap(d => [...FUZZY_F].flatMap(k => [...d.f[k]].map(t => tokId.get(t)))))]; // 오타 보정 대상 어휘
    const fuzzyFi = FIELDS.map(k => FUZZY_F.has(k));
    const acrDocs = docs.filter(d => d.initials);
    const onlyC = toks.map((_, id) => posts[id].every((arr, fi) => !arr || FIELDS[fi] === 'cname'));   // cname 에서만 나온 단어는 부분/접두 일치 제외
    const mcache = new Map(), rcache = new Map();

    // 한 단어와 일치하는 어휘를 모은다. m: 모든 필드에서 유효, mf: 이름·그룹·필드명·분류에서만 유효(오타)
    function matches(term) {
      let r = mcache.get(term); if (r) return r;
      const m = new Map(), mf = new Map();
      const ex = tokId.get(term); if (ex !== undefined) m.set(ex, 1);
      if (term.length > 2) {
        for (let p = lowerBound(term); p < sorted.length; p++) { const id = sorted[p]; if (!toks[id].startsWith(term)) break; if (!m.has(id) && !onlyC[id]) m.set(id, 0.75); }
        if (term.length >= 3) {
          let cand = null;
          for (let i = 0; i + 3 <= term.length; i++) { const a = tri.get(term.substr(i, 3)); if (!a) { cand = []; break; } if (!cand || a.length < cand.length) cand = a; }
          for (const id of cand || []) if (!m.has(id) && !onlyC[id] && toks[id].includes(term)) m.set(id, 0.45);
        }
        if (term.length >= 4) {
          const mx = term.length >= 8 ? 2 : 1;
          for (const id of fuzzyIds) {
            if (m.has(id)) continue; const tk = toks[id];
            if (Math.abs(tk.length - term.length) > mx) continue;
            const dd = lev(term, tk, mx); if (dd <= mx) mf.set(id, 0.6 - 0.1 * dd);
          }
        }
      }
      r = { m, mf }; mcache.set(term, r); return r;
    }
    // 한 검색어(동의어 포함)에 대해 문서별 최고 점수
    function termScores(term) {
      const res = new Map();
      const put = (doc, v, f) => { const c = res.get(doc); if (!c || v > c.v) res.set(doc, { v, f }); };
      for (const alt of term.alts) {
        if (alt.acr) {
          for (const d of acrDocs) {
            const q = d.initials === alt.t ? 1 : d.initials.startsWith(alt.t) && alt.t.length >= 2 ? 0.55 : 0;
            if (q) put(d.i, FW.name * q * alt.w, 'name');
          }
          continue;
        }
        const w = idf(alt.t), { m, mf } = matches(alt.t);
        for (const [id, q] of m) { const pl = posts[id]; for (let fi = 0; fi < pl.length; fi++) { const arr = pl[fi]; if (!arr) continue; const k = FIELDS[fi], v = FW[k] * q * alt.w * (k === 'name' ? 1 : w); for (let j = 0; j < arr.length; j++) put(arr[j], v, k); } }
        for (const [id, q] of mf) { const pl = posts[id]; for (let fi = 0; fi < pl.length; fi++) { const arr = pl[fi]; if (!arr || !fuzzyFi[fi]) continue; const k = FIELDS[fi], v = FW[k] * q * alt.w * (k === 'name' ? 1 : w); for (let j = 0; j < arr.length; j++) put(arr[j], v, k); } }
      }
      return res;
    }
    const stats = { tokens: toks.length, docs: docs.length, buildMs: 0 };
    stats.buildMs = (typeof performance !== 'undefined' ? performance : Date).now() - tIdx0;

    function parse(q) {
      const raw = q.trim();
      const joined = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
      const joinedS = stem(joined);
      const toks = [];
      for (const w of raw.split(/\s+/)) {
        if (!w) continue;
        if (hasKo(w)) { toks.push(w.toLowerCase()); continue; }
        for (const x of words(w)) toks.push(x);
      }
      const terms = [];
      for (const t of [...new Set(toks)]) {
        if (STOP.has(t)) continue;
        const alts = [];
        if (hasKo(t)) {
          let hit = false;
          for (const k of (KO[t] ? [t] : KO_KEYS)) if (t.includes(k) || (t.length >= 2 && k.startsWith(t))) { KO[k].forEach(e => alts.push({ t: e, w: 0.8 })); hit = true; break; }
          if (!hit) { const g = t.replace(/[가-힣]+/g, ''); if (!g) continue; alts.push({ t: g, w: 1 }); }
          if (!alts.length) continue;
        } else {
          alts.push({ t, w: 1 });
          const s = stem(t); if (s !== t) alts.push({ t: s, w: 0.95 });
          (EN[t] || []).forEach(e => alts.push({ t: e, w: 0.7 }));
          if (t.length >= 2 && t.length <= 6) alts.push({ t, w: 0.9, acr: true });
        }
        terms.push({ t, alts });
      }
      return { raw, joined, joinedS, terms };
    }

    // 단어 경계에서 시작하는 부분 문자열일 때만 인정 (rolle ⊄ controller 같은 우연한 일치 제외)
    function wordSub(d, j) { for (let p = d.low.indexOf(j); p >= 0; p = d.low.indexOf(j, p + 1)) if (d.bounds.has(p)) return true; return false; }

    function snippetFor(d, P) {
      const alts = new Set(); P.terms.forEach(t => t.alts.forEach(a => { if (!a.acr) alts.add(a.t); }));
      let best = null, bs = 0;
      for (const s of d.sents.slice(1)) {
        const l = s.l; let n = 0;
        alts.forEach(a => { if (l.includes(a)) n++; });
        const sc = n * (s.src === '필드 경로' ? 7 : 10) - Math.min(s.t.length, 400) / 100 + (s.src === '설명' ? 1 : 0);
        if (n && sc > bs) { bs = sc; best = s; }
      }
      const first = (sentences(d.desc)[0] || d.desc);
      const pick = best && P.terms.length ? best : { t: first, src: '설명' };
      let t = pick.t;
      if (t.length > 170) {
        const l = t.toLowerCase(); let at = -1; alts.forEach(a => { const p = l.indexOf(a); if (p >= 0 && (at < 0 || p < at)) at = p; });
        const st = Math.max(0, at - 50); t = (st ? '… ' : '') + t.slice(st, st + 170) + '…';
      }
      return { text: t, src: pick.src };
    }

    function search(q, opt) {
      opt = opt || {};
      const key = q.trim() + '|' + (opt.cat || '');
      const hit = rcache.get(key); if (hit) return hit;
      const P = parse(q);
      const inCat = d => !opt.cat || d.a.book === opt.cat;
      if (!P.terms.length && !P.joined) return { apis: docs.filter(inCat).map(d => ({ d, score: 0 })), guide: [], P, relaxed: false };

      const per = P.terms.map(termScores);
      const rl = P.raw.toLowerCase();
      const cand = new Set();
      per.forEach(m => m.forEach((_, i) => cand.add(i)));
      const useGv = /[./]/.test(rl) && rl.length >= 4;
      if (P.joined.length >= 2 || useGv) docs.forEach(d => { if ((P.joined.length >= 2 && (d.low.includes(P.joined) || d.initials === P.joined)) || (useGv && (d.gv.toLowerCase().includes(rl) || (d.a.group && rl.includes(d.a.group.toLowerCase()))))) cand.add(d.i); });

      let res = [];
      cand.forEach(i => {
        const d = docs[i]; if (!inCat(d)) return;
        let total = 0, missing = 0; const why = {};
        for (const m of per) { const c = m.get(i); if (!c) missing++; else { total += c.v; why[c.f] = (why[c.f] || 0) + c.v; } }
        if (P.joined.length >= 2) {
          if (d.low === P.joined) total += 200; else if (P.joinedS !== P.joined && d.low === P.joinedS) total += 190; else if (d.low.startsWith(P.joined)) total += 60;
          else if (wordSub(d, P.joined)) total += 30; else if (d.initials && d.initials === P.joined) total += 40;
        }
        if (useGv && (d.gv.toLowerCase().includes(rl) || (d.a.group && rl.includes(d.a.group.toLowerCase())))) {
          // 정확히 일치(group/version 또는 group)하면 가산, 부분 일치(gateway.networking.k8s.io ⊃ networking.k8s.io, v1 ⊂ v1alpha1)는 약하게
          total += (d.gv.toLowerCase() === rl || (d.a.group && d.a.group.toLowerCase() === rl)) ? 60 : 30; missing = 0;
        }
        if (P.terms.length && d.desc.toLowerCase().includes(P.terms.map(t => t.t).join(' '))) total += 6;
        total -= d.low.length * 0.01;
        if (total > 0) res.push({ d, total, missing, why });
      });
      const strict = res.filter(r => r.missing === 0);
      let relaxed = false;
      if (strict.length >= 3 || P.terms.length < 2) res = strict;
      else { const need = Math.ceil(P.terms.length / 2); res = res.filter(r => P.terms.length - r.missing >= need); relaxed = strict.length < res.length; res.forEach(r => { r.total *= 1 - 0.25 * r.missing; r.rx = r.missing > 0; }); }
      res.sort((x, y) => y.total - x.total || x.d.a.kind.localeCompare(y.d.a.kind));
      const apis = res.slice(0, 80).map(r => ({ d: r.d, score: r.total, why: Object.keys(r.why).sort((a, b) => r.why[b] - r.why[a])[0], rx: r.rx, snip: null }));
      // 가이드 검색
      const gt = P.terms.map(t => t.alts.filter(a => !a.acr).map(a => a.t));
      const gres = [];
      if (gt.length && !opt.cat) {
        for (const g of guide) {
          let sc = 0, ok = true;
          for (const alts of gt) {
            const inT = alts.some(a => g.title.includes(a)), inX = alts.some(a => g.text.includes(a));
            if (!inT && !inX) { ok = false; break; }
            sc += inT ? 5 : 1;
          }
          if (ok) gres.push({ g: g.s, score: sc, raw: g.raw });
        }
        gres.sort((a, b) => b.score - a.score);
      }
      const out = { apis, guide: gres.slice(0, 6), P, relaxed };
      if (rcache.size > 300) rcache.delete(rcache.keys().next().value);
      rcache.set(key, out);
      return out;
    }

    function snippet(d, P) { return snippetFor(d, P); }

    function suggest(q) {
      const t = q.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (t.length < 3) return [];
      return docs.map(d => ({ d, v: lev(t, d.low, Math.max(2, Math.floor(t.length / 3))) })).filter(x => x.v <= Math.max(2, Math.floor(t.length / 3))).sort((a, b) => a.v - b.v).slice(0, 4).map(x => x.d);
    }

    function highlighter(P) {
      const set = new Set();
      P.terms.forEach(t => t.alts.forEach(a => { if (!a.acr && a.t.length >= 2) set.add(a.t); }));
      if (P.joined.length >= 3) set.add(P.joined);
      if (!set.size) return s => s;
      const re = new RegExp('(' + [...set].sort((a, b) => b.length - a.length).map(esc).join('|') + ')', 'gi');
      return s => s.replace(re, '\u0001$1\u0002');
    }

    return { docs, search, snippet, suggest, highlighter, CAT_KO, stats };
  }

  const api = { create, CAT_KO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ApiSearch = api;
})(typeof window !== 'undefined' ? window : globalThis);
