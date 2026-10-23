async (page) => {
  const VERS = ['4.22', '4.21', '4.20'];
  const POOL = 6;
  const base = v => `https://docs.redhat.com/en/documentation/openshift_container_platform/${v}/html-single/`;

  // ---------- 페이지 안에서 실행되는 함수들 ----------
  const extractIndex = () => {
    let t = document.querySelector('section[id=api-index] table');
    if (!t) t = [...document.querySelectorAll('main table')].find(x => x.querySelector('a[href*="_apis/"]'));
    if (!t) return [];
    return [...t.querySelectorAll('tbody tr')].map(tr => {
      const a = tr.querySelector('a'); const tds = tr.querySelectorAll('td');
      return a ? { url: a.href, kind: a.textContent.trim(), gv: (tds[1] ? tds[1].textContent : '').replace(/\s+/g, ' ').trim() } : null;
    }).filter(Boolean);
  };

  const extractGuide = () => {
    const root = document.querySelector('main');
    const heads = [...root.querySelectorAll('h1,h2,h3,h4')].filter(h => h.innerText.trim() && !h.closest('nav'));
    const set = new Set(heads);
    const clean = (node) => {
      const c = document.createElement('div'); c.appendChild(node.cloneNode(true));
      c.querySelectorAll('script,style,button,svg,rh-button,rh-icon,rh-tooltip,pf-popover,rh-cta,rh-disclosure').forEach(e => e.remove());
      c.querySelectorAll('rh-alert').forEach(a => {
        const kind = ((a.className || '').match(/\b(note|important|warning|tip|caution)\b/) || [, 'note'])[1];
        const head = a.querySelector('[slot="header"]'); const title = head ? head.textContent.trim() : kind;
        if (head) head.remove();
        const aside = document.createElement('aside'); aside.className = 'alert ' + kind;
        const t = document.createElement('strong'); t.textContent = title; aside.appendChild(t);
        while (a.firstChild) aside.appendChild(a.firstChild);
        a.replaceWith(aside);
      });
      c.querySelectorAll('rh-code-block,rh-table').forEach(w => { while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w); w.remove(); });
      c.querySelectorAll('pre span, code span').forEach(s => s.replaceWith(document.createTextNode(s.textContent)));
      c.querySelectorAll('*').forEach(e => {
        const keep = e.tagName === 'ASIDE' ? ['class'] : ['href', 'colspan', 'rowspan'];
        [...e.attributes].forEach(a => { if (!keep.includes(a.name)) e.removeAttribute(a.name); });
        if (e.tagName === 'A') { const h = e.getAttribute('href') || ''; if (h.startsWith('/')) e.setAttribute('href', 'https://docs.redhat.com' + h); e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener'); }
      });
      c.querySelectorAll('pre').forEach(p => { p.textContent = p.textContent.replace(/\n+$/, ''); });
      return c.innerHTML;
    };
    const out = []; let cur = null;
    const walk = (el) => {
      for (const ch of el.children) {
        if (set.has(ch)) { cur = { level: +ch.tagName[1], id: ch.id || ch.closest('section')?.id || '', title: ch.innerText.trim().replace(/\s+/g, ' '), html: [] }; out.push(cur); }
        else if ([...set].some(h => ch.contains(h))) walk(ch);
        else if (cur && ch.innerText && ch.innerText.trim()) cur.html.push(clean(ch));
      }
    };
    walk(root);
    return out.map(s => ({ level: s.level, id: s.id, title: s.title, html: s.html.join('\n') }));
  };

  const extractAPIs = (ids) => {
    const NB = / /g, SHOW = /(^|\n)\s*(Show more|Show less)\s*(?=\n|$)/g;
    const nb = s => s.replace(NB, ' ').replace(SHOW, '$1');
    const cell = td => { const c = td.cloneNode(true); c.querySelectorAll('rh-button,button,rh-icon,rh-tooltip').forEach(x => x.remove()); return c.textContent.replace(NB, ' ').replace(/\s+/g, ' ').replace(/\s*Show (more|less)$/, '').trim(); };
    const res = {}; const dict = {};
    const bodyText = (h, stopSel) => {
      let w = h; const sec = h.closest('section');
      while (w.parentElement && w.parentElement !== sec) w = w.parentElement;
      const out = [];
      for (let n = w.nextElementSibling; n; n = n.nextElementSibling) { if (n.matches(stopSel) || n.querySelector(stopSel)) break; out.push(nb(n.innerText)); }
      return out.join('\n');
    };
    const parseHead = (t) => {
      const di = t.indexOf('\nType\n');
      const desc = (di >= 0 ? t.slice(0, di) : t).replace(/^\s*Description\s*/, '').replace(/\n{2,}/g, '\n').trim();
      const ty = ((t.match(/\nType\n+([^\n]+)/) || [])[1] || '').trim();
      const rm = t.match(/\nRequired\s*\n([\s\S]*?)(?:\n\s*\nProperty|\n\s*Property|$)/);
      const rq = rm ? rm[1].split('\n').map(s => s.trim()).filter(s => s && s !== 'Expand') : [];
      return { desc, ty, rq };
    };
    // 텍스트 상한(상향됨): 최상위 설명 20000, 경로 설명 12000, 표 행 설명 20000, 최상위 필드 설명 20000. 이전 상한(8000/3000/4000/4000)에 걸려 잘린 원본은 build.js 가 표시함
    const rowsOf = (tbl, dmax) => tbl ? [...tbl.querySelectorAll('tbody tr')].map(tr => { const c = [...tr.children].map(cell); return [c[0], c[1] || '', (c[2] || '').slice(0, dmax)]; }).filter(r => r[0]) : [];

    for (const id of ids) {
      let el = document.getElementById(id) || [...document.querySelectorAll('[id]')].find(e => e.id.toLowerCase() === id.toLowerCase());
      if (!el) { res[id] = null; continue; }
      const sec = el.tagName === 'SECTION' ? el : el.closest('section');
      const txt = nb(sec.innerText).replace(/\r/g, '');
      const after = txt.slice(txt.indexOf('\n') + 1);
      const top = parseHead(after.split(/\n\d+\.\d+\.\s+Specification/)[0]);
      const out = { desc: top.desc.slice(0, 20000), type: top.ty, required: top.rq };
      const specH = [...sec.querySelectorAll('h3')].find(h => /Specification/i.test(h.innerText));
      const epH = [...sec.querySelectorAll('h3')].find(h => /API endpoints/i.test(h.innerText));
      out.props = []; out.fields = [];
      if (specH) {
        const ss = specH.closest('section');
        const heads = [...ss.querySelectorAll('h4,h5,h6')].filter(h => !epH || !epH.closest('section').contains(h));
        out.props = rowsOf(ss.querySelector("table"), 20000).map(r => ({ n: r[0], t: r[1], d: r[2] }));
        for (const h of heads) {
          const path = nb(h.innerText).trim().replace(/^[\d.]+\s*/, '');
          const t = bodyText(h, 'h4,h5,h6');
          const meta = parseHead(t.split(/\nProperty\s/)[0]);
          let w = h; const sc = h.closest('section'); while (w.parentElement && w.parentElement !== sc) w = w.parentElement;
          let tbl = null; for (let n = w.nextElementSibling; n; n = n.nextElementSibling) { if (n.matches('h4,h5,h6') || n.querySelector('h4,h5,h6')) break; const q = n.matches('table') ? n : n.querySelector('table'); if (q) { tbl = q; break; } }
          out.fields.push({ p: path, t: meta.ty, q: meta.rq, d: meta.desc.slice(0, 12000), r: rowsOf(tbl, 20000) });
        }
      }
      out.eps = [];
      if (epH) {
        const es = epH.closest('section');
        for (const h of es.querySelectorAll('h4,h5')) {
          const path = nb(h.innerText).trim().replace(/^[\d.]+\s*/, '');
          let t = bodyText(h, 'h4,h5'); if (!/Table [\d.]+\./.test(t)) t = nb(h.closest('section').innerText);
          const blocks = t.split(/(?:^|\n)HTTP method\s*\n/).slice(1);
          const ms = blocks.map(b => {
            const ln = b.split('\n');
            const m = ln[0].trim(); const di = ln.findIndex(l => /^Description$/.test(l.trim()));
            const d = di >= 0 ? (ln[di + 1] || '').trim() : '';
            const lines = ln.map(l => l.trim()).filter(l => l && l !== 'Show more' && l !== 'Show less' && l !== 'Expand');
            const q = [], bodyT = [], resp = [];
            for (let i = 0; i < lines.length; i++) {
              if (/^Table [\d.]+\. Query parameters/.test(lines[i])) {
                i += 2;
                while (i < lines.length && !/^Table /.test(lines[i]) && !/^HTTP method/.test(lines[i])) {
                  const nm = lines[i], ty = lines[i + 1] || '', ds = lines[i + 2] || '';
                  if (!dict[nm]) dict[nm] = [ty, /^Table /.test(ds) ? '' : ds.slice(0, 700)];
                  q.push(nm); i += /^Table /.test(ds) ? 2 : 3;
                }
                i--;
              }
              else if (/^Table [\d.]+\. Body parameters/.test(lines[i])) { i += 2; bodyT.push(lines[i + 1] || ''); i += 2; while (i < lines.length && !/^Table /.test(lines[i])) i++; i--; }
              else if (/^Table [\d.]+\. HTTP responses/.test(lines[i])) { i += 2; while (i < lines.length && !/^Table /.test(lines[i])) { resp.push([lines[i], lines[i + 1] || '']); i += 2; } i--; }
            }
            return { m, d, q, b: bodyT[0] || '', r: resp };
          });
          out.eps.push({ p: path, ms });
        }
      }
      res[id] = out;
    }
    res.__p = dict;
    return res;
  };

  // ---------- 탭 풀과 안정화 대기 ----------
  const ctx = page.context();
  const pages = [page];
  for (let i = 1; i < POOL; i++) pages.push(await ctx.newPage());
  const open = async (p, url) => {
    for (let i = 0; i < 3; i++) {
      try {
        await p.goto(url, { waitUntil: 'load', timeout: 120000 });
        await p.waitForSelector('main section', { timeout: 120000 });
        let last = '', same = 0;
        for (let k = 0; k < 40; k++) {
          const n = await p.evaluate(() => document.querySelector('main').innerText.length + '/' + document.querySelectorAll('main rh-table,main rh-code-block').length);
          if (n === last) { if (++same >= 2) break; } else same = 0;
          last = n; await p.waitForTimeout(700);
        }
        return true;
      } catch (e) { /* 재시도 */ }
    }
    return false;
  };

  // ---------- 1단계: 버전별 개요 페이지(가이드 + API 목록) 병렬 ----------
  const R = {}; const failed = [];
  await Promise.all(VERS.map(async (v, i) => {
    const p = pages[i];
    if (!(await open(p, base(v) + 'api_overview/index'))) { failed.push(v + ' overview'); return; }
    R[v] = { index: await p.evaluate(extractIndex), guide: await p.evaluate(extractGuide), apis: {}, params: {}, books: {} };
  }));

  // ---------- 2단계: (버전, 북) 작업 큐를 6개 탭이 나눠 처리 ----------
  const tasks = [];
  for (const v of VERS) {
    if (!R[v]) continue;
    const byBook = {};
    R[v].index.forEach(r => { const b = r.url.split('/html-single/')[1].split('/')[0]; (byBook[b] ||= []).push(r.url.split('#')[1]); });
    R[v].books = Object.fromEntries(Object.entries(byBook).map(([b, ids]) => [b, ids.length]));
    Object.entries(byBook).forEach(([b, ids]) => tasks.push({ v, b, ids, tries: 0 }));
  }
  // 큰 북부터 처리해 꼬리 지연을 줄인다
  tasks.sort((a, b) => b.ids.length - a.ids.length);
  const t0 = Date.now();
  await Promise.all(pages.map(async (p) => {
    while (tasks.length) {
      const t = tasks.shift();
      try {
        if (!(await open(p, base(t.v) + t.b + '/index'))) throw new Error('open failed');
        const out = await p.evaluate(extractAPIs, t.ids);
        Object.assign(R[t.v].params, out.__p); delete out.__p;
        Object.assign(R[t.v].apis, out);
      } catch (e) { if (++t.tries < 3) tasks.push(t); else failed.push(t.v + ' ' + t.b + ' ' + String(e.message).slice(0, 80)); }
    }
  }));

  // ---------- 3단계: 결과를 about:blank 탭의 window 변수에 보관(파일로 내보내기용) ----------
  for (let i = 1; i < pages.length; i++) await pages[i].close();
  await page.goto('about:blank');
  for (const v of Object.keys(R)) await page.evaluate(([k, d]) => { window['__v' + k] = d; }, [v, R[v]]);
  const sum = {};
  for (const v of Object.keys(R)) {
    const a = Object.values(R[v].apis);
    sum[v] = { index: R[v].index.length, apis: a.length, nulls: a.filter(x => !x).length, fields: a.reduce((s, x) => s + (x ? x.fields.reduce((q, f) => q + f.r.length, 0) : 0), 0), eps: a.reduce((s, x) => s + (x ? x.eps.length : 0), 0), noResp: a.reduce((s, x) => s + (x ? x.eps.reduce((q, e) => q + e.ms.filter(m => !m.r.length).length, 0) : 0), 0), guide: R[v].guide.length, size: JSON.stringify(R[v]).length };
  }
  return { sec: Math.round((Date.now() - t0) / 1000), failed, sum };
}
