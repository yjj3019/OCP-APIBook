// SPDX-License-Identifier: Apache-2.0
/* 캔버스 그래프 뷰: 힘 기반 배치, 확대/이동/드래그, 선택·강조. 외부 라이브러리 없음. */
(function (root) {
  const STYLE = {
    mention: { dash: [], w: 1.5, arrow: true, len: 80, str: 1 },
    curated: { dash: [7, 4], w: 1.5, arrow: true, len: 80, str: 1 },
    variant: { dash: [1.5, 3.5], w: 1.4, arrow: true, len: 70, str: 0.8 },
    same:    { dash: [2, 3], w: 1.3, arrow: false, len: 60, str: 0.8 },
    group:   { dash: [], w: 0.9, arrow: false, len: 110, str: 0.35 },
  };
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  function catColor(i, dark) { return `hsl(${Math.round((i * 137.508) % 360)} ${dark ? 62 : 58}% ${dark ? 64 : 46}%)`; }

  class GraphView {
    constructor(canvas, o) {
      this.c = canvas; this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ onSelect() {}, onHover() {}, labels: 'auto', rep: 700, gravity: 0.002, minZoom: 0.15, maxZoom: 5 }, o);
      this.view = { x: 0, y: 0, k: 1 }; this.nodes = []; this.edges = []; this.map = new Map(); this.nb = new Map();
      this.sel = null; this.hover = null; this.keep = null; this.alpha = 0; this.raf = 0; this.dirty = true; this.w = 300; this.h = 300;
      this.ptr = new Map(); this._bind();
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas.parentElement);
      this._cc = null; this._tc = () => { this._cc = null; this.request(); };
      window.addEventListener('themechange', this._tc); this._mq = matchMedia('(prefers-color-scheme: dark)'); this._mq.addEventListener('change', this._tc);
      this.resize();
    }
    destroy() { cancelAnimationFrame(this.raf); this.ro.disconnect(); window.removeEventListener('themechange', this._tc); this._mq.removeEventListener('change', this._tc); this.dead = true; }
    colors() { return this._cc || (this._cc = { dark: isDark(), ink: css('--ink') || '#111', sub: css('--sub') || '#666', line: css('--line') || '#ccc', accent: css('--accent') || '#2d5bff', bg: css('--bg') || '#fff', panel: css('--panel') || '#fff' }); }
    resize() {
      const p = this.c.parentElement, w = Math.max(200, p.clientWidth), h = Math.max(200, p.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.c.width = w * dpr; this.c.height = h * dpr; this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
      this.dpr = dpr; this.w = w; this.h = h; this.request();
    }
    setData(nodes, edges, opt) {
      opt = opt || {};
      this.nodes = nodes; this.map = new Map(nodes.map(n => [n.id, n]));
      this.edges = edges.map(e => Object.assign({}, e, { a: this.map.get(e.s), b: this.map.get(e.t) })).filter(e => e.a && e.b);
      this.nb = new Map(nodes.map(n => [n.id, new Set()]));
      this.edges.forEach(e => { this.nb.get(e.s).add(e.t); this.nb.get(e.t).add(e.s); });
      nodes.forEach((n, i) => { if (n.x === undefined) { const a = i * 2.399, r = 30 + 14 * Math.sqrt(i); n.x = Math.cos(a) * r; n.y = Math.sin(a) * r; } n.vx = n.vy = 0; });
      this.sel = opt.sel || null; this.hover = null;
      const warm = opt.warm === undefined ? 220 : opt.warm;
      for (let i = 0; i < warm; i++) this.tick(Math.max(0.05, 1 - i / warm));
      this.fit(opt.fitPad); this.alpha = (opt.animate === false || matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0 : 0.25; this.request();
    }
    tick(a) {
      const ns = this.nodes, n = ns.length, rep = this.o.rep;
      for (let i = 0; i < n; i++) {
        const p = ns[i];
        for (let j = i + 1; j < n; j++) {
          const q = ns[j]; let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
          if (d2 > 160000) continue; if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
          const d = Math.sqrt(d2), min = p.r + q.r + 10; let f = rep * a / d; if (d < min) f += (min - d) * 0.6;
          const fx = dx / d * f, fy = dy / d * f;
          if (!p.fixed) { p.vx -= fx; p.vy -= fy; } if (!q.fixed) { q.vx += fx; q.vy += fy; }
        }
      }
      for (const e of this.edges) {
        const s = STYLE[e.type] || STYLE.mention, dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - (this.o.edgeLen || s.len)) * 0.045 * a * s.str, fx = dx / d * f, fy = dy / d * f;
        if (!e.a.fixed) { e.a.vx += fx; e.a.vy += fy; } if (!e.b.fixed) { e.b.vx -= fx; e.b.vy -= fy; }
      }
      for (const p of ns) {
        if (p.fixed) { p.vx = p.vy = 0; continue; }
        if (p.tx !== undefined) { p.vx += (p.tx - p.x) * 0.05 * a; p.vy += (p.ty - p.y) * 0.05 * a; }
        p.vx -= p.x * this.o.gravity * a; p.vy -= p.y * this.o.gravity * a;
        p.vx *= 0.8; p.vy *= 0.8; p.x += p.vx; p.y += p.vy;
      }
    }
    fit(pad) {
      pad = pad === undefined ? 40 : pad;
      if (!this.nodes.length) return;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const n of this.nodes) { x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r); }
      const k = Math.min((this.w - pad * 2) / Math.max(40, x1 - x0), (this.h - pad * 2) / Math.max(40, y1 - y0), 2.2);
      this.view = { k, x: this.w / 2 - (x0 + x1) / 2 * k, y: this.h / 2 - (y0 + y1) / 2 * k };
      this.request();
    }
    focusOn(id, k) {
      const n = this.map.get(id); if (!n) return;
      k = k || Math.max(this.view.k, 1.1); this.view = { k, x: this.w / 2 - n.x * k, y: this.h / 2 - n.y * k }; this.request();
    }
    select(id) { this.sel = id; this.request(); }
    setKeep(set) { this.keep = set; this.request(); }
    reheat(a) { this.alpha = a === undefined ? 0.5 : a; this.request(); }
    request() { this.dirty = true; if (!this.raf && !this.dead) this.raf = requestAnimationFrame(() => this.frame()); }
    frame() {
      this.raf = 0; if (this.dead) return;
      if (this.alpha > 0.01) { this.tick(this.alpha); this.alpha *= 0.96; this.dirty = true; } else this.alpha = 0;
      if (this.dirty) { this.dirty = false; this.draw(); }
      if (this.alpha > 0.01) this.raf = requestAnimationFrame(() => this.frame());
    }
    toWorld(px, py) { return [(px - this.view.x) / this.view.k, (py - this.view.y) / this.view.k]; }
    hit(px, py) {
      const [x, y] = this.toWorld(px, py); let best = null, bd = 1e9;
      for (const n of this.nodes) { if (this.keep && !this.keep.has(n.id) && n.id !== this.sel) continue; const d = Math.hypot(n.x - x, n.y - y), r = n.r + 5 / this.view.k; if (d <= r && d < bd) { best = n; bd = d; } }
      return best;
    }
    draw() {
      const ctx = this.ctx, v = this.view, { dark, ink, sub, line, accent, bg, panel } = this.colors();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
      ctx.translate(v.x, v.y); ctx.scale(v.k, v.k);
      const focus = this.sel || this.hover, fset = focus ? new Set([focus, ...(this.nb.get(focus) || [])]) : null;
      const bright = id => (!this.keep || this.keep.has(id)) && (!fset || fset.has(id));
      // 간선
      for (const e of this.edges) {
        const s = STYLE[e.type] || STYLE.mention, inc = focus && (e.s === focus || e.t === focus);
        const keepE = !this.keep || (this.keep.has(e.s) && this.keep.has(e.t));
        const alpha = !keepE ? 0.05 : focus ? (inc ? 0.95 : (this.o.dimEdge === undefined ? 0.07 : this.o.dimEdge)) : 0.5;
        ctx.globalAlpha = alpha; ctx.strokeStyle = inc ? accent : sub; ctx.lineWidth = (inc ? s.w + 0.8 : s.w) / Math.sqrt(v.k);
        ctx.setLineDash(s.dash.map(x => x / Math.sqrt(v.k)));
        const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        const x0 = e.a.x + ux * e.a.r, y0 = e.a.y + uy * e.a.r, x1 = e.b.x - ux * (e.b.r + (s.arrow ? 2 : 0)), y1 = e.b.y - uy * (e.b.r + (s.arrow ? 2 : 0));
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
        if (s.arrow && alpha > 0.1) { const al = 7 / Math.sqrt(v.k); ctx.fillStyle = inc ? accent : sub; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - ux * al - uy * al * 0.5, y1 - uy * al + ux * al * 0.5); ctx.lineTo(x1 - ux * al + uy * al * 0.5, y1 - uy * al - ux * al * 0.5); ctx.closePath(); ctx.fill(); }
        if (inc && e.labels && e.labels.length && this.o.edgeLabels !== false && v.k > 0.55) {
          const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, txt = e.labels[0]; ctx.globalAlpha = 1; ctx.font = `${11 / Math.sqrt(v.k)}px "Noto Sans KR",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 4 / Math.sqrt(v.k); ctx.strokeStyle = bg; ctx.strokeText(txt, mx, my); ctx.fillStyle = ink; ctx.fillText(txt, mx, my);
        }
      }
      ctx.globalAlpha = 1;
      // 노드
      for (const n of this.nodes) {
        const on = bright(n.id) && (!this.keep || this.keep.has(n.id));
        ctx.globalAlpha = on ? 1 : (this.o.dimNode === undefined ? 0.14 : this.o.dimNode); ctx.fillStyle = n.ci !== undefined ? catColor(n.ci, dark) : n.color; ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.2832); ctx.fill();
        if (n.id === this.sel || n.center) { ctx.lineWidth = 2.5 / Math.sqrt(v.k); ctx.strokeStyle = n.id === this.sel ? accent : ink; ctx.stroke(); ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3 / Math.sqrt(v.k), 0, 6.2832); ctx.lineWidth = 1.2 / Math.sqrt(v.k); ctx.stroke(); }
        else { ctx.lineWidth = 1 / v.k; ctx.strokeStyle = panel; ctx.stroke(); }
      }
      // 라벨
      ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const fs = 12 / Math.sqrt(v.k); ctx.font = `600 ${fs}px "JetBrains Mono",Consolas,monospace`;
      for (const n of this.nodes) {
        const lab = this.o.labels === 'all' || n.id === this.sel || n.id === this.hover || (fset && fset.has(n.id) && (n.id === focus || v.k > 0.7)) || (this.o.labels === 'auto' && (n.deg >= 9 || v.k > 1.7));
        if (!lab || (this.keep && !this.keep.has(n.id) && n.id !== this.sel)) continue;
        if (!bright(n.id) && !(this.o.labels === 'all')) continue;
        ctx.lineWidth = 4 / Math.sqrt(v.k); ctx.strokeStyle = bg; ctx.strokeText(n.label, n.x, n.y + n.r + 3); ctx.fillStyle = ink; ctx.fillText(n.label, n.x, n.y + n.r + 3);
      }
    }
    _bind() {
      const c = this.c; c.style.touchAction = 'none'; c.style.cursor = 'grab';
      let drag = null, moved = 0, pinch = null;
      const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      c.addEventListener('pointerdown', e => {
        c.setPointerCapture(e.pointerId); this.ptr.set(e.pointerId, pos(e)); moved = 0;
        if (this.ptr.size === 2) { if (drag && drag.type === 'node') drag.n.fixed = !!drag.n.pin; const [a, b] = [...this.ptr.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: this.view.k }; drag = null; return; }
        const [px, py] = pos(e), n = this.hit(px, py);
        drag = n ? { type: 'node', n } : { type: 'pan', x: px - this.view.x, y: py - this.view.y };
        if (n) { n.fixed = true; }
      });
      c.addEventListener('pointermove', e => {
        const [px, py] = pos(e);
        if (this.ptr.has(e.pointerId)) this.ptr.set(e.pointerId, [px, py]);
        if (pinch && this.ptr.size === 2) { const [a, b] = [...this.ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; this.zoomAt(mx, my, Math.max(this.o.minZoom, Math.min(this.o.maxZoom, pinch.k * d / pinch.d))); return; }
        if (drag) {
          moved++;
          if (drag.type === 'pan') { this.view.x = px - drag.x; this.view.y = py - drag.y; this.request(); }
          else { const [wx, wy] = this.toWorld(px, py); drag.n.x = wx; drag.n.y = wy; if (moved > 2) this.reheat(0.3); this.request(); }
          return;
        }
        const n = this.hit(px, py), id = n ? n.id : null;
        if (id !== this.hover) { this.hover = id; c.style.cursor = n ? 'pointer' : 'grab'; this.request(); }
        this.o.onHover(n, px, py, e.pointerType);
      });
      const up = e => {
        const was = this.ptr.has(e.pointerId); this.ptr.delete(e.pointerId); if (this.ptr.size < 2) pinch = null;
        if (!was || !drag) return;
        if (drag.type === 'node') { drag.n.fixed = !!drag.n.pin; if (moved <= 3) this.o.onSelect(drag.n); }
        else if (moved <= 3) this.o.onSelect(null);
        drag = null;
      };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      c.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.o.onHover(null); this.request(); } });
      c.addEventListener('wheel', e => { e.preventDefault(); const [px, py] = pos(e); this.zoomAt(px, py, Math.max(this.o.minZoom, Math.min(this.o.maxZoom, this.view.k * Math.exp(-e.deltaY * 0.0015)))); }, { passive: false });
      c.addEventListener('dblclick', () => this.fit());
    }
    zoomAt(px, py, k) { const v = this.view, [wx, wy] = this.toWorld(px, py); v.k = k; v.x = px - wx * k; v.y = py - wy * k; this.request(); }
    zoomBy(f) { this.zoomAt(this.w / 2, this.h / 2, Math.max(this.o.minZoom, Math.min(this.o.maxZoom, this.view.k * f))); }
  }
  root.GraphView = GraphView; root.GraphStyle = STYLE; root.GraphColor = catColor; root.GraphDark = isDark;
})(window);
