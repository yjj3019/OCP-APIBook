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
      this.yaw = 0; this.pitch = -0.18; this.distance = 1;
      this.sel = null; this.hover = null; this.keep = null; this.alpha = 0; this.raf = 0; this.dirty = true; this.w = 300; this.h = 300;
      this.ptr = new Map(); this._bind();
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas.parentElement);
      this._cc = null; this._tc = () => { this._cc = null; this.request(); };
      window.addEventListener('themechange', this._tc); this._mq = matchMedia('(prefers-color-scheme: dark)'); this._mq.addEventListener('change', this._tc);
      this._dq = null; this._dr = () => this.resize();
      this.resize();
    }
    destroy() { cancelAnimationFrame(this.raf); this.ro.disconnect(); window.removeEventListener('themechange', this._tc); this._mq.removeEventListener('change', this._tc); if (this._dq) this._dq.removeEventListener('change', this._dr); this.dead = true; }
    colors() { return this._cc || (this._cc = { dark: isDark(), ink: css('--ink') || '#111', sub: css('--sub') || '#666', line: css('--line') || '#ccc', accent: css('--accent') || '#2d5bff', bg: css('--bg') || '#fff', panel: css('--panel') || '#fff' }); }
    resize() {
      const p = this.c.parentElement, w = Math.max(200, p.clientWidth), h = Math.max(200, p.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.c.width = w * dpr; this.c.height = h * dpr; this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
      if (this.dpr !== dpr || !this._dq) { if (this._dq) this._dq.removeEventListener('change', this._dr); this._dq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); this._dq.addEventListener('change', this._dr); }
      this.dpr = dpr; this.w = w; this.h = h; this.request();
    }
    setData(nodes, edges, opt) {
      opt = opt || {};
      this.nodes = nodes; this.map = new Map(nodes.map(n => [n.id, n]));
      this.edges = edges.map(e => Object.assign({}, e, { sourceEdge: e, a: this.map.get(e.s), b: this.map.get(e.t) })).filter(e => e.a && e.b);
      this.nb = new Map(nodes.map(n => [n.id, new Set()]));
      this.edges.forEach(e => { this.nb.get(e.s).add(e.t); this.nb.get(e.t).add(e.s); });
      nodes.forEach((n, i) => { if (n.x === undefined) { const a = i * 2.399, r = 30 + 14 * Math.sqrt(i); n.x = Math.cos(a) * r; n.y = Math.sin(a) * r; } n.vx = n.vy = 0; });
      this.sel = opt.sel || null; this.hover = null;
      const warm = opt.warm === undefined ? 220 : opt.warm;
      if (this.o.spatial) nodes.forEach(n => { n.vz = 0; });
      for (let i = 0; i < warm; i++) this.tick(Math.max(0.05, 1 - i / warm));
      if (this.o.spatial) this.distance = 2.6 * Math.max(1, ...nodes.map(n => Math.hypot(n.x, n.y, n.z) + n.r));
      this.fit(opt.fitPad); this.alpha = (opt.animate === false || matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0 : 0.25; this.request();
    }
    tick(a) {
      const ns = this.nodes, n = ns.length, rep = this.o.rep;
      for (let i = 0; i < n; i++) {
        const p = ns[i];
        for (let j = i + 1; j < n; j++) {
          const q = ns[j], dz = this.o.spatial ? q.z - p.z : 0; let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > 160000) continue; if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
          const d = Math.sqrt(d2), min = p.r + q.r + 10; let f = rep * a / d; if (d < min) f += (min - d) * 0.6;
          const fx = dx / d * f, fy = dy / d * f;
          if (!p.fixed) { p.vx -= fx; p.vy -= fy; } if (!q.fixed) { q.vx += fx; q.vy += fy; }
          if (this.o.spatial) { p.vz -= dz / d * f; q.vz += dz / d * f; }
        }
      }
      for (const e of this.edges) {
        const s = STYLE[e.type] || STYLE.mention, dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
        const dz = this.o.spatial ? e.b.z - e.a.z : 0, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const f = (d - (this.o.edgeLen || s.len)) * 0.045 * a * s.str, fx = dx / d * f, fy = dy / d * f;
        if (!e.a.fixed) { e.a.vx += fx; e.a.vy += fy; } if (!e.b.fixed) { e.b.vx -= fx; e.b.vy -= fy; }
        if (this.o.spatial) { e.a.vz += dz / d * f; e.b.vz -= dz / d * f; }
      }
      for (const p of ns) {
        if (p.fixed) { p.vx = p.vy = 0; continue; }
        if (p.tx !== undefined) { p.vx += (p.tx - p.x) * 0.05 * a; p.vy += (p.ty - p.y) * 0.05 * a; }
        p.vx -= p.x * this.o.gravity * a; p.vy -= p.y * this.o.gravity * a;
        p.vx *= 0.8; p.vy *= 0.8; p.x += p.vx; p.y += p.vy;
        if (this.o.spatial) {
          p.vz += ((p.tz - p.z) * 0.05 - p.z * this.o.gravity) * a;
          p.vz *= 0.8; p.z += p.vz;
        }
      }
    }
    project(n) {
      if (!this.o.spatial) return n;
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const x = cy * n.x + sy * n.z, z = cy * n.z - sy * n.x;
      const depth = sp * n.y + cp * z;
      const scale = this.distance / Math.max(this.distance * 0.2, this.distance - depth);
      return { ...n, x: x * scale, y: (cp * n.y - sp * z) * scale, r: n.r * scale, depth, scale };
    }
    orbit(yaw, pitch) {
      const anchor = this.map.get(this.sel), before = anchor && this.project(anchor);
      this.yaw += yaw;
      this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch + pitch));
      if (anchor) {
        const after = this.project(anchor);
        this.view.x += (before.x - after.x) * this.view.k;
        this.view.y += (before.y - after.y) * this.view.k;
      }
      this.hover = null; this.o.onHover(null); this.request();
    }
    fit(pad) {
      pad = pad === undefined ? (this.o.spatial && this.w < 480 ? 18 : 40) : pad;
      if (!this.nodes.length) return;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const node of this.nodes) { const n = this.project(node); x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r); }
      const k = Math.min((this.w - pad * 2) / Math.max(40, x1 - x0), (this.h - pad * 2) / Math.max(40, y1 - y0), 2.2);
      this.view = { k, x: this.w / 2 - (x0 + x1) / 2 * k, y: this.h / 2 - (y0 + y1) / 2 * k };
      this.request();
    }
    focusOn(id, k) {
      const node = this.map.get(id); if (!node) return;
      const n = this.project(node);
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
      let depth = -Infinity, inside = false;
      for (const node of this.nodes) {
        if (this.keep && !this.keep.has(node.id) && node.id !== this.sel) continue;
        const n = this.project(node), d = Math.hypot(n.x - x, n.y - y);
        if (d > n.r + 5 / this.view.k) continue;
        const covers = d <= n.r;
        const closer = this.o.spatial && covers ? !inside || n.depth >= depth : !inside && d < bd;
        if (this.o.spatial ? closer : d < bd) {
          best = node; bd = d; depth = n.depth; inside = covers;
        }
      }
      return best;
    }
    draw() {
      const ctx = this.ctx, v = this.view, { dark, ink, sub, line, accent, bg, panel } = this.colors();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
      ctx.translate(v.x, v.y); ctx.scale(v.k, v.k);
      const focus = this.pathEdges ? null : this.sel || this.hover, fset = focus ? new Set([focus, ...(this.nb.get(focus) || [])]) : null;
      const bright = id => (!this.keep || this.keep.has(id)) && (!fset || fset.has(id));
      const nodes = this.o.spatial ? this.nodes.map(n => this.project(n)).sort((a, b) => a.depth - b.depth) : this.nodes;
      const projected = this.o.spatial ? new Map(nodes.map(n => [n.id, n])) : this.map;
      // 간선
      for (const e of this.edges) {
        const s = STYLE[e.type] || STYLE.mention, inc = this.pathEdges ? this.pathEdges.has(e.sourceEdge) : focus && (e.s === focus || e.t === focus);
        const keepE = !this.keep || (this.keep.has(e.s) && this.keep.has(e.t));
        const alpha = this.pathEdges ? (inc ? 1 : 0.045) : !keepE ? 0.05 : focus ? (inc ? 0.95 : (this.o.dimEdge === undefined ? 0.07 : this.o.dimEdge)) : 0.5;
        ctx.globalAlpha = alpha; ctx.strokeStyle = inc ? accent : sub; ctx.lineWidth = (inc ? s.w + 0.8 : s.w) / Math.sqrt(v.k);
        ctx.setLineDash(s.dash.map(x => x / Math.sqrt(v.k)));
        const a = projected.get(e.s), b = projected.get(e.t);
        if (this.o.spatial && !inc) ctx.globalAlpha *= Math.min(1, (a.scale + b.scale) / 2.5);
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        const x0 = a.x + ux * a.r, y0 = a.y + uy * a.r, x1 = b.x - ux * (b.r + (s.arrow ? 2 : 0)), y1 = b.y - uy * (b.r + (s.arrow ? 2 : 0));
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
        if (s.arrow && alpha > 0.1) { const al = 7 / Math.sqrt(v.k); ctx.fillStyle = inc ? accent : sub; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - ux * al - uy * al * 0.5, y1 - uy * al + ux * al * 0.5); ctx.lineTo(x1 - ux * al + uy * al * 0.5, y1 - uy * al - ux * al * 0.5); ctx.closePath(); ctx.fill(); }
        if (inc && e.labels && e.labels.length && this.o.edgeLabels !== false && v.k > 0.55) {
          const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, txt = e.labels[0]; ctx.globalAlpha = 1; ctx.font = `${11 / Math.sqrt(v.k)}px "Noto Sans KR",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 4 / Math.sqrt(v.k); ctx.strokeStyle = bg; ctx.strokeText(txt, mx, my); ctx.fillStyle = ink; ctx.fillText(txt, mx, my);
        }
      }
      ctx.globalAlpha = 1;
      // 노드
      for (const n of nodes) {
        const on = bright(n.id) && (!this.keep || this.keep.has(n.id));
        ctx.globalAlpha = on ? 1 : (this.o.dimNode === undefined ? 0.14 : this.o.dimNode);
        const color = n.ci !== undefined ? catColor(n.ci, dark) : n.color;
        ctx.fillStyle = color;
        if (this.o.spatial) {
          const sphere = ctx.createRadialGradient(n.x - n.r * 0.35, n.y - n.r * 0.4, 0, n.x, n.y, n.r);
          sphere.addColorStop(0, '#fff'); sphere.addColorStop(0.38, color); sphere.addColorStop(1, '#263249');
          ctx.fillStyle = sphere; ctx.globalAlpha *= Math.min(1, n.scale);
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.2832); ctx.fill();
        if (n.id === this.sel || n.center) { ctx.lineWidth = 2.5 / Math.sqrt(v.k); ctx.strokeStyle = n.id === this.sel ? accent : ink; ctx.stroke(); ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3 / Math.sqrt(v.k), 0, 6.2832); ctx.lineWidth = 1.2 / Math.sqrt(v.k); ctx.stroke(); }
        else { ctx.lineWidth = 1 / v.k; ctx.strokeStyle = panel; ctx.stroke(); }
      }
      // 라벨
      ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const fs = this.o.spatial ? Math.max(11 / v.k, 12 / Math.sqrt(v.k)) : 12 / Math.sqrt(v.k);
      ctx.font = `600 ${fs}px "JetBrains Mono",Consolas,monospace`;
      const labelDegree = this.o.spatial && this.w < 480 && v.k < 0.6 ? 18 : 9;
      for (const n of nodes) {
        const lab = (this.pathEdges && this.keep?.has(n.id)) || this.o.labels === 'all' || n.id === this.sel || n.id === this.hover || (fset && fset.has(n.id) && (n.id === focus || v.k > 0.7)) || (this.o.labels === 'auto' && (n.deg >= labelDegree || v.k > 1.7));
        if (!lab || (this.keep && !this.keep.has(n.id) && n.id !== this.sel)) continue;
        if (!bright(n.id) && !(this.o.labels === 'all')) continue;
        ctx.lineWidth = 4 / Math.sqrt(v.k); ctx.strokeStyle = bg; ctx.strokeText(n.label, n.x, n.y + n.r + 3); ctx.fillStyle = ink; ctx.fillText(n.label, n.x, n.y + n.r + 3);
      }
    }
    _bind() {
      const c = this.c, emb = !!this.o.embedded; c.style.touchAction = emb ? 'pan-y' : 'none'; c.style.cursor = 'grab';
      let drag = null, moved = 0, pinch = null, down = null, armed = false;
      if (emb) { c.addEventListener('pointerdown', () => { armed = true; }); c.addEventListener('pointerleave', () => { armed = false; }); }
      const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      if (this.o.spatial) c.addEventListener('keydown', e => {
        const step = { ArrowLeft: [-0.16, 0], ArrowRight: [0.16, 0], ArrowUp: [0, -0.16], ArrowDown: [0, 0.16] }[e.key];
        if (step) { e.preventDefault(); this.orbit(...step); }
      });
      c.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        c.setPointerCapture(e.pointerId); this.ptr.set(e.pointerId, pos(e)); moved = 0; down = pos(e);
        if (this.ptr.size === 2) { if (drag && drag.type === 'node') drag.n.fixed = !!drag.n.pin; const [a, b] = [...this.ptr.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: this.view.k }; drag = null; return; }
        const [px, py] = pos(e), n = this.hit(px, py);
        if (this.o.spatial) {
          drag = { type: 'orbit', n, x: px, y: py }; return;
        }
        drag = n ? { type: 'node', n } : { type: 'pan', x: px - this.view.x, y: py - this.view.y };
        if (n) { n.fixed = true; }
      });
      c.addEventListener('pointermove', e => {
        const [px, py] = pos(e);
        if (this.ptr.has(e.pointerId)) this.ptr.set(e.pointerId, [px, py]);
        if (pinch && this.ptr.size === 2) { const [a, b] = [...this.ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; this.zoomAt(mx, my, Math.max(this.o.minZoom, Math.min(this.o.maxZoom, pinch.k * d / Math.max(1, pinch.d)))); return; }
        if (drag) {
          if (down && Math.hypot(px - down[0], py - down[1]) >= 5) moved = Infinity;
          if (drag.type === 'orbit') {
            if (moved) {
              const step = Math.PI / Math.min(this.w, this.h);
              this.orbit((px - drag.x) * step, (drag.y - py) * step);
              drag.x = px; drag.y = py;
            }
            return;
          }
          if (drag.type === 'pan') { if (!moved) return; this.view.x = px - drag.x; this.view.y = py - drag.y; this.request(); }
          else if (moved) { const [wx, wy] = this.toWorld(px, py); drag.n.x = wx; drag.n.y = wy; this.reheat(0.3); this.request(); }
          return;
        }
        const n = this.hit(px, py), id = n ? n.id : null;
        if (id !== this.hover) { this.hover = id; c.style.cursor = n ? 'pointer' : 'grab'; this.request(); }
        this.o.onHover(n, px, py, e.pointerType);
      });
      const up = e => {
        const was = this.ptr.has(e.pointerId); this.ptr.delete(e.pointerId); if (this.ptr.size < 2) pinch = null;
        if (!was || !drag) return;
        if (drag.type === 'node') { drag.n.fixed = !!drag.n.pin; if (!moved) this.o.onSelect(drag.n); }
        else if (!moved && e.type !== 'pointercancel') this.o.onSelect(drag.n || null);
        drag = null;
      };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      c.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.o.onHover(null); this.request(); } });
      c.addEventListener('wheel', e => {
        if (emb && !armed && !e.ctrlKey && !e.metaKey) return;   // 페이지 스크롤에 맡김
        e.preventDefault(); const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.h : 1);
        const [px, py] = pos(e); this.zoomAt(px, py, Math.max(this.o.minZoom, Math.min(this.o.maxZoom, this.view.k * Math.exp(-dy * 0.0015))));
      }, { passive: false });
      c.addEventListener('dblclick', () => this.fit());
    }
    zoomAt(px, py, k) { const v = this.view, [wx, wy] = this.toWorld(px, py); v.k = k; v.x = px - wx * k; v.y = py - wy * k; this.request(); }
    zoomBy(f) { this.zoomAt(this.w / 2, this.h / 2, Math.max(this.o.minZoom, Math.min(this.o.maxZoom, this.view.k * f))); }
  }
  root.GraphView = GraphView; root.GraphStyle = STYLE; root.GraphColor = catColor; root.GraphDark = isDark;
})(window);
