/* ============================================================
   Canvas-Diagramm-Engine — Zeitreihen, Histogramme, Streudiagramme,
   2D-Dichte, Sparklines. Kein externes Framework.
   ============================================================ */

function themeVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
let THEME = null;
function readTheme() {
  THEME = {
    bg:      themeVar('--surface', '#111'),
    grid:    themeVar('--chart-grid', 'rgba(255,255,255,.07)'),
    gridB:   themeVar('--chart-grid-strong', 'rgba(255,255,255,.14)'),
    axis:    themeVar('--text-3', '#8b93a1'),
    text:    themeVar('--text-1', '#e8ecf1'),
    text2:   themeVar('--text-2', '#a8b0bd'),
    accent:  themeVar('--accent', '#4da3ff'),
    crosshair: themeVar('--chart-crosshair', 'rgba(255,255,255,.35)'),
    band:    themeVar('--chart-band', 'rgba(77,163,255,.10)'),
    ok:      themeVar('--ok', '#3ddc84'),
    warn:    themeVar('--warn', '#ffb020'),
    crit:    themeVar('--crit', '#ff5d5d'),
    series:  (themeVar('--series', '') || '').split(',').map(s => s.trim()).filter(Boolean)
  };
  if (!THEME.series.length) THEME.series = ['#4da3ff','#ff7a59','#3ddc84','#ffc247','#b388ff','#4dd0e1','#f06292','#9ccc65','#ffa726','#7986cb'];
  return THEME;
}

class Chart {
  constructor(host, opts) {
    this.host = host;
    this.opts = Object.assign({ type: 'timeseries', pad: null, legend: true, height: 260 }, opts || {});
    this.canvas = el('canvas', { class: 'chart-canvas' });
    this.host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.dpr = 1;
    this.hover = null;
    this.series = [];
    this.axes = [];
    this._bind();
    this.resize();
    Chart.all.push(this);
  }
  destroy() {
    const i = Chart.all.indexOf(this); if (i >= 0) Chart.all.splice(i, 1);
    if (this._ro) this._ro.disconnect();
    this.host.innerHTML = '';
  }
  _bind() {
    const c = this.canvas;
    this._ro = new ResizeObserver(raf(() => { this.resize(); this.draw(); }));
    this._ro.observe(this.host);
    const move = e => {
      const r = c.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      this.setHover(x, y, e);
    };
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerdown', e => { c.setPointerCapture && c.setPointerCapture(e.pointerId); move(e); this._down = true; });
    c.addEventListener('pointerup',   () => { this._down = false; });
    c.addEventListener('pointerleave', () => { if (!this._down) { this.hover = null; this.draw(); Chart.emitHover(null, this); } });
    c.addEventListener('touchmove', e => { if (this.opts.type === 'timeseries') e.preventDefault(); move(e); }, { passive: false });
    c.addEventListener('dblclick', () => { if (this.opts.onReset) this.opts.onReset(); });
    c.addEventListener('wheel', e => {
      if (!this.opts.onZoom || this.opts.type !== 'timeseries') return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const fx = clamp((e.clientX - r.left - this.plot.x) / this.plot.w, 0, 1);
      this.opts.onZoom(e.deltaY > 0 ? 1.25 : 0.8, fx);
    }, { passive: false });
  }
  setHover(px, py, e) {
    if (!this.plot) return;
    const inside = px >= this.plot.x - 8 && px <= this.plot.x + this.plot.w + 8;
    this.hover = inside ? { px, py } : null;
    this.draw();
    if (this.opts.type === 'timeseries' && this.xScale)
      Chart.emitHover(this.hover ? this.xScale.inv(clamp(px, this.plot.x, this.plot.x + this.plot.w)) : null, this);
  }
  setExternalHover(xValue) {
    if (this.opts.type !== 'timeseries' || !this.xScale) return;
    this.extHover = xValue;
    this.draw();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(120, this.host.clientWidth);
    const h = this.opts.height;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.w = w; this.h = h;
  }
  setData(cfg) { Object.assign(this, cfg); this.draw(); }

  draw() {
    if (!THEME) readTheme();
    const ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const t = this.opts.type;
    if (t === 'timeseries') this.drawTimeseries();
    else if (t === 'hist')  this.drawHist();
    else if (t === 'scatter') this.drawScatter();
    else if (t === 'heat')  this.drawHeat();
    else if (t === 'bars')  this.drawBars();
    else if (t === 'spark') this.drawSpark();
  }

  /* Achsentitel unten/links */
  _axisTitles() {
    if (!this.xTitle && !this.yTitle) return;
    const ctx = this.ctx, P = this.plot;
    ctx.save();
    ctx.font = '11px ' + FONT_UI; ctx.fillStyle = THEME.axis;
    if (this.xTitle) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(this.xTitle, P.x + P.w / 2, this.h - 1);
    }
    if (this.yTitle) {
      ctx.translate(10, P.y + P.h / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(this.yTitle, 0, 0);
    }
    ctx.restore();
  }

  /* ---------- gemeinsame Achsen-Helfer ---------- */
  _plotRect(padL, padR, padT, padB) {
    const p = this.opts.pad || {};
    const x = p.l !== undefined ? p.l : padL, r = p.r !== undefined ? p.r : padR;
    const y = p.t !== undefined ? p.t : padT, b = p.b !== undefined ? p.b : padB;
    this.plot = { x, y, w: Math.max(10, this.w - x - r), h: Math.max(10, this.h - y - b) };
    return this.plot;
  }
  _scale(lo, hi, a, b, flip) {
    if (!(hi > lo)) { hi = lo + 1; }
    const f = v => flip ? b - (v - lo) / (hi - lo) * (b - a) : a + (v - lo) / (hi - lo) * (b - a);
    f.inv = px => flip ? lo + (b - px) / (b - a) * (hi - lo) : lo + (px - a) / (b - a) * (hi - lo);
    f.lo = lo; f.hi = hi;
    return f;
  }
  _gridY(sc, ticks, fmtFn, side, color) {
    const ctx = this.ctx, P = this.plot;
    ctx.save();
    ctx.font = '11px ' + FONT_MONO;
    ctx.textBaseline = 'middle';
    ctx.textAlign = side === 'right' ? 'left' : 'right';
    for (const v of ticks) {
      const y = Math.round(sc(v)) + .5;
      if (y < P.y - 1 || y > P.y + P.h + 1) continue;
      if (side !== 'right') {
        ctx.strokeStyle = Math.abs(v) < 1e-9 ? THEME.gridB : THEME.grid;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(P.x, y); ctx.lineTo(P.x + P.w, y); ctx.stroke();
      }
      ctx.fillStyle = color || THEME.axis;
      ctx.fillText(fmtFn(v), side === 'right' ? P.x + P.w + 6 : P.x - 7, y);
    }
    ctx.restore();
  }

  /* ---------- Zeitreihen ---------- */
  drawTimeseries() {
    const ctx = this.ctx;
    const P = this._plotRect(46, this.axes && this.axes.length > 1 ? 46 : 12, 10, 24);
    const [x0, x1] = this.xRange;
    this.xScale = this._scale(x0, x1, P.x, P.x + P.w);

    // Phasenbänder
    if (this.bands) for (const b of this.bands) {
      const a = clamp(this.xScale(b.t0), P.x, P.x + P.w), c = clamp(this.xScale(b.t1), P.x, P.x + P.w);
      if (c - a < 0.4) continue;
      ctx.fillStyle = b.color; ctx.fillRect(a, P.y, c - a, P.h);
    }

    // X-Gitter
    const xt = niceTicks(x0, x1, Math.max(3, Math.round(P.w / 90)));
    ctx.save(); ctx.font = '11px ' + FONT_MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of xt.ticks) {
      const px = Math.round(this.xScale(v)) + .5;
      if (px < P.x || px > P.x + P.w) continue;
      ctx.strokeStyle = THEME.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, P.y); ctx.lineTo(px, P.y + P.h); ctx.stroke();
      ctx.fillStyle = THEME.axis;
      ctx.fillText(this.xFormat ? this.xFormat(v) : fmtTick(v), px, P.y + P.h + 6);
    }
    ctx.restore();

    // Achsen (max 2)
    const axes = this.axes || [];
    axes.forEach((ax, i) => {
      ax.scale = this._scale(ax.lo, ax.hi, P.y + P.h, P.y, false);
      const t = niceTicks(ax.lo, ax.hi, Math.max(2, Math.round(P.h / 42)));
      ax.ticks = t.ticks; ax.step = t.step;
      this._gridY(ax.scale, t.ticks, v => fmtTick(v, t.step), i === 0 ? 'left' : 'right',
                  axes.length > 1 ? ax.color : THEME.axis);
    });

    // Sollwertbänder
    if (this.refBands) for (const rb of this.refBands) {
      const ax = axes[rb.axis || 0]; if (!ax) continue;
      const ya = ax.scale(clamp(rb.hi, ax.lo, ax.hi)), yb = ax.scale(clamp(rb.lo, ax.lo, ax.hi));
      ctx.fillStyle = rb.color || THEME.band;
      ctx.fillRect(P.x, Math.min(ya, yb), P.w, Math.abs(yb - ya));
    }

    // Linien
    ctx.save();
    ctx.beginPath(); ctx.rect(P.x, P.y - 2, P.w, P.h + 4); ctx.clip();
    for (const s of this.series) {
      const ax = s.axis < 0 ? this._selfAxis(s) : axes[s.axis || 0];
      if (!ax) continue;
      s._ax = ax;
      this._drawLine(s, ax);
    }
    ctx.restore();

    // Rahmen
    ctx.strokeStyle = THEME.gridB; ctx.lineWidth = 1;
    ctx.strokeRect(P.x + .5, P.y + .5, P.w - 1, P.h - 1);

    // Crosshair
    const hx = this.hover ? this.hover.px : (this.extHover !== null && this.extHover !== undefined ? this.xScale(this.extHover) : null);
    if (hx !== null && hx >= P.x - 2 && hx <= P.x + P.w + 2) this._crosshair(clamp(hx, P.x, P.x + P.w), P, axes);
  }
  /* Eigene Skala für Serien, die keine Achse abbekommen haben */
  _selfAxis(s) {
    const P = this.plot, X = this.xScale;
    let lo = Infinity, hi = -Infinity;
    const n = s.n !== undefined ? s.n : s.x.length;
    const i0 = Math.max(0, bisect(s.x, X.lo)), i1 = Math.min(n - 1, bisect(s.x, X.hi) + 1);
    for (let i = i0; i <= i1; i++) { const v = s.y[i]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    if (!isFinite(lo)) return null;
    if (hi === lo) { hi = lo + 1; lo -= 1; }
    const pad = (hi - lo) * 0.10;
    return { lo: lo - pad, hi: hi + pad, scale: this._scale(lo - pad, hi + pad, P.y + P.h, P.y, false) };
  }
  _drawLine(s, ax) {
    const ctx = this.ctx, P = this.plot, X = this.xScale, Y = ax.scale;
    const xs = s.x, ys = s.y, n = s.n !== undefined ? s.n : xs.length;
    if (!n) return;
    const i0 = Math.max(0, bisect(xs, X.lo) - 1);
    let i1 = bisect(xs, X.hi) + 2; if (i1 > n) i1 = n;
    const span = i1 - i0; if (span < 1) return;
    const maxPts = Math.round(P.w * 2);
    let idx = null;
    if (span > maxPts * 1.5) {
      const sx = xs.subarray ? xs.subarray(i0, i1) : xs.slice(i0, i1);
      const sy = ys.subarray ? ys.subarray(i0, i1) : ys.slice(i0, i1);
      idx = lttb(sx, sy, maxPts);
    }
    const count = idx ? idx.length : span;
    const get = k => idx ? i0 + idx[k] : i0 + k;

    if (s.fill) {
      // segmentweise füllen, damit Datenlücken keine Dreiecke erzeugen
      const g = ctx.createLinearGradient(0, P.y, 0, P.y + P.h);
      g.addColorStop(0, s.color + '38'); g.addColorStop(1, s.color + '00');
      ctx.fillStyle = g;
      let started = false, lastX = 0, firstX = 0, pts = 0;
      const closeSeg = () => {
        if (started && pts > 1) { ctx.lineTo(lastX, P.y + P.h); ctx.closePath(); ctx.fill(); }
        started = false; pts = 0;
      };
      for (let k = 0; k < count; k++) {
        const i = get(k), v = ys[i];
        if (!(v === v)) { closeSeg(); continue; }
        const px = X(xs[i]), py = Y(v);
        if (!started) { ctx.beginPath(); ctx.moveTo(px, P.y + P.h); ctx.lineTo(px, py); started = true; firstX = px; }
        else ctx.lineTo(px, py);
        lastX = px; pts++;
      }
      closeSeg();
    }
    ctx.beginPath();
    let pen = false;
    for (let k = 0; k < count; k++) {
      const i = get(k), v = ys[i];
      if (!(v === v)) { pen = false; continue; }
      const px = X(xs[i]), py = Y(v);
      if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width || 1.6;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (s.dash) ctx.setLineDash(s.dash);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  _crosshair(px, P, axes) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = THEME.crosshair; ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(Math.round(px) + .5, P.y); ctx.lineTo(Math.round(px) + .5, P.y + P.h); ctx.stroke();
    ctx.setLineDash([]);
    const tv = this.xScale.inv(px);
    for (const s of this.series) {
      const ax = s.axis < 0 ? s._ax : axes[s.axis || 0]; if (!ax) continue;
      const i = bisect(s.x, tv);
      if (i < 0) continue;
      const v = s.y[i]; if (!(v === v)) continue;
      const py = ax.scale(v);
      if (py < P.y - 2 || py > P.y + P.h + 2) continue;
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, 6.284);
      ctx.fillStyle = s.color; ctx.fill();
      ctx.strokeStyle = THEME.bg; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- Histogramm ---------- */
  drawHist() {
    const ctx = this.ctx, H = this.histData;
    const P = this._plotRect(46, 12, 10, this.xTitle ? 42 : 26);
    if (!H) return;
    let maxC = 0; for (let i = 0; i < H.bins; i++) if (H.counts[i] > maxC) maxC = H.counts[i];
    const X = this._scale(H.lo, H.hi, P.x, P.x + P.w);
    const Y = this._scale(0, maxC * 1.08, P.y + P.h, P.y, false);
    const yt = niceTicks(0, maxC * 1.08, Math.max(2, Math.round(P.h / 40)));
    this._gridY(Y, yt.ticks, v => this.yFormat ? this.yFormat(v) : fmtTick(v, yt.step));
    const bw = P.w / H.bins;
    for (let i = 0; i < H.bins; i++) {
      const v = H.counts[i]; if (v <= 0) continue;
      const x = P.x + i * bw, y = Y(v);
      ctx.fillStyle = this.barColor ? this.barColor(H.lo + (i + .5) * H.w, v / (maxC || 1)) : THEME.accent;
      ctx.fillRect(x + .5, y, Math.max(1, bw - 1), P.y + P.h - y);
    }
    ctx.save(); ctx.font = '11px ' + FONT_MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const xt = niceTicks(H.lo, H.hi, Math.max(2, Math.round(P.w / 70)));
    ctx.fillStyle = THEME.axis;
    for (const v of xt.ticks) { const px = X(v); if (px < P.x - 2 || px > P.x + P.w + 2) continue; ctx.fillText(fmtTick(v, xt.step), px, P.y + P.h + 6); }
    ctx.restore();
    ctx.strokeStyle = THEME.gridB; ctx.strokeRect(P.x + .5, P.y + .5, P.w - 1, P.h - 1);
    this._axisTitles();
    this.xScale = X; this.yScale = Y;
    if (this.hover) {
      const bi = clamp(Math.floor((X.inv(this.hover.px) - H.lo) / H.w), 0, H.bins - 1);
      const x = P.x + bi * bw;
      ctx.strokeStyle = THEME.crosshair; ctx.strokeRect(x + .5, P.y + .5, Math.max(1, bw - 1), P.h - 1);
      this.hoverBin = bi;
    } else this.hoverBin = null;
  }

  /* ---------- Streudiagramm ---------- */
  drawScatter() {
    const ctx = this.ctx, D = this.scatterData;
    const P = this._plotRect(this.yTitle ? 60 : 48, 12, 10, this.xTitle ? 42 : 26);
    if (!D) return;
    const X = this._scale(D.xlo, D.xhi, P.x, P.x + P.w);
    const Y = this._scale(D.ylo, D.yhi, P.y + P.h, P.y, false);
    const yt = niceTicks(D.ylo, D.yhi, Math.max(2, Math.round(P.h / 40)));
    this._gridY(Y, yt.ticks, v => fmtTick(v, yt.step));
    const xt = niceTicks(D.xlo, D.xhi, Math.max(2, Math.round(P.w / 80)));
    ctx.save(); ctx.font = '11px ' + FONT_MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = THEME.axis;
    for (const v of xt.ticks) { const px = X(v); if (px < P.x - 2 || px > P.x + P.w + 2) continue;
      ctx.strokeStyle = THEME.grid; ctx.beginPath(); ctx.moveTo(Math.round(px)+.5, P.y); ctx.lineTo(Math.round(px)+.5, P.y+P.h); ctx.stroke();
      ctx.fillText(fmtTick(v, xt.step), px, P.y + P.h + 6); }
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
    const n = D.n, r = D.r || 1.7;
    for (let i = 0; i < n; i++) {
      const x = D.x[i], y = D.y[i];
      if (!(x === x) || !(y === y)) continue;
      ctx.fillStyle = D.color ? D.color(i) : THEME.accent + '66';
      ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, 6.284); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = THEME.gridB; ctx.strokeRect(P.x + .5, P.y + .5, P.w - 1, P.h - 1);
    this._axisTitles();
    this.xScale = X; this.yScale = Y;
  }

  /* ---------- 2D-Dichte ---------- */
  drawHeat() {
    const ctx = this.ctx, D = this.heatData;
    const P = this._plotRect(this.yTitle ? 60 : 48, 12, 10, this.xTitle ? 42 : 26);
    if (!D) return;
    const X = this._scale(D.xlo, D.xhi, P.x, P.x + P.w);
    const Y = this._scale(D.ylo, D.yhi, P.y + P.h, P.y, false);
    const cw = P.w / D.nx, ch = P.h / D.ny;
    const logMax = Math.log1p(D.max);
    for (let cy = 0; cy < D.ny; cy++) for (let cx = 0; cx < D.nx; cx++) {
      const v = D.cells[cy * D.nx + cx]; if (v <= 0) continue;
      ctx.fillStyle = heatColor(Math.log1p(v) / logMax);
      ctx.fillRect(P.x + cx * cw, P.y + P.h - (cy + 1) * ch, cw + .6, ch + .6);
    }
    const yt = niceTicks(D.ylo, D.yhi, Math.max(2, Math.round(P.h / 40)));
    this._gridY(Y, yt.ticks, v => fmtTick(v, yt.step));
    const xt = niceTicks(D.xlo, D.xhi, Math.max(2, Math.round(P.w / 80)));
    ctx.save(); ctx.font = '11px ' + FONT_MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = THEME.axis;
    for (const v of xt.ticks) { const px = X(v); if (px < P.x - 2 || px > P.x + P.w + 2) continue; ctx.fillText(fmtTick(v, xt.step), px, P.y + P.h + 6); }
    ctx.restore();
    if (this.overlay) this.overlay(ctx, X, Y, P);
    ctx.strokeStyle = THEME.gridB; ctx.strokeRect(P.x + .5, P.y + .5, P.w - 1, P.h - 1);
    this._axisTitles();
    this.xScale = X; this.yScale = Y;
  }

  /* ---------- Balken (kategorial) ---------- */
  drawBars() {
    const ctx = this.ctx, D = this.barData || [];
    if (!D.length) { this._plotRect(this.opts.labelWidth || 116, 46, 6, 6); return; }
    // Rechten Rand aus der breitesten Beschriftung ableiten, sonst wird sie abgeschnitten
    ctx.font = '12px ' + FONT_MONO;
    let rightPad = 20;
    for (const d of D) {
      const t = d.text !== undefined ? d.text : fmt(d.value, 1);
      rightPad = Math.max(rightPad, ctx.measureText(t).width + 16);
    }
    const P = this._plotRect(this.opts.labelWidth || 116, Math.min(rightPad, this.w * 0.45), 6, 6);
    let max = 0; for (const d of D) if (d.value > max) max = d.value;
    const bh = P.h / D.length;
    ctx.save(); ctx.font = '12px ' + FONT_UI; ctx.textBaseline = 'middle';
    D.forEach((d, i) => {
      const y = P.y + i * bh, h = Math.max(6, bh * 0.62);
      const yc = y + bh / 2;
      ctx.textAlign = 'right'; ctx.fillStyle = THEME.text2;
      ctx.fillText(d.label, P.x - 10, yc);
      const w = max > 0 ? (d.value / max) * P.w : 0;
      ctx.fillStyle = d.color || THEME.accent;
      roundRect(ctx, P.x, yc - h / 2, Math.max(2, w), h, 3); ctx.fill();
      ctx.textAlign = 'left'; ctx.fillStyle = THEME.text;
      ctx.font = '12px ' + FONT_MONO;
      ctx.fillText(d.text !== undefined ? d.text : fmt(d.value, 1), P.x + Math.max(2, w) + 8, yc);
      ctx.font = '12px ' + FONT_UI;
    });
    ctx.restore();
  }

  /* ---------- Sparkline ---------- */
  drawSpark() {
    const ctx = this.ctx, s = this.sparkData;
    if (!s || !s.y || !s.y.length) return;
    const P = this._plotRect(1, 1, 3, 3);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < s.y.length; i++) { const v = s.y[i]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    if (!isFinite(lo)) return;
    if (hi === lo) { hi = lo + 1; lo -= 1; }
    const X = this._scale(0, s.y.length - 1, P.x, P.x + P.w);
    const Y = this._scale(lo, hi, P.y + P.h, P.y, false);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < s.y.length; i++) {
      const v = s.y[i]; if (!(v === v)) { pen = false; continue; }
      const px = X(i), py = Y(v);
      if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = s.color || THEME.accent; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
    ctx.stroke();
  }
}
Chart.all = [];
Chart.hoverListeners = [];
Chart.onHover = (tag, fn) => {
  const i = Chart.hoverListeners.findIndex(l => l.tag === tag);
  const entry = { tag, fn };
  if (i >= 0) Chart.hoverListeners[i] = entry; else Chart.hoverListeners.push(entry);
};
Chart.emitHover = (x, src) => {
  for (const c of Chart.all) if (c !== src && c.opts.type === 'timeseries' && c.opts.syncHover !== false) c.setExternalHover(x);
  Chart.hoverListeners.forEach(l => { try { l.fn(x, src); } catch (e) {} });
};
Chart.redrawAll = () => { readTheme(); Chart.all.forEach(c => { c.resize(); c.draw(); }); };

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/* Dichte-Farbrampe (dunkelblau -> türkis -> gelb -> rot) */
function heatColor(t) {
  t = clamp(t, 0, 1);
  const stops = [[0,[20,32,58,0]],[0.12,[26,74,138,.75]],[0.38,[24,150,160,.85]],[0.62,[120,190,90,.9]],[0.82,[240,190,60,.95]],[1,[240,80,60,1]]];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i];
      const f = (t - a) / (b - a);
      return 'rgba(' + Math.round(lerp(ca[0], cb[0], f)) + ',' + Math.round(lerp(ca[1], cb[1], f)) + ',' +
             Math.round(lerp(ca[2], cb[2], f)) + ',' + lerp(ca[3], cb[3], f).toFixed(3) + ')';
    }
  }
  return 'rgba(240,80,60,1)';
}
const FONT_UI = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const FONT_MONO = 'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace';
