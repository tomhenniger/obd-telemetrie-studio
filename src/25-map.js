/* ============================================================
   Karten-Modul — Canvas-Slippy-Map mit OSM-Kacheln + GPS-Track
   Kein Leaflet, keine externen Skripte; es werden nur Kachelbilder geladen.
   ============================================================ */

const TILE = 256;
const TILE_SERVERS = [
  { id: 'osm',   name: 'OpenStreetMap', url: z => `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
    attr: '© OpenStreetMap-Mitwirkende', max: 19, dark: false },
  { id: 'carto', name: 'Carto Dark',    url: () => `https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`,
    attr: '© OpenStreetMap · © CARTO', max: 20, dark: true, retina: true },
  { id: 'cartol', name: 'Carto Hell',   url: () => `https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png`,
    attr: '© OpenStreetMap · © CARTO', max: 20, dark: false, retina: true },
  { id: 'none',  name: 'Ohne Karte',    url: null, attr: '', max: 22, dark: true }
];

const lon2x = (lon, z) => (lon + 180) / 360 * Math.pow(2, z);
const lat2y = (lat, z) => {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
};
const x2lon = (x, z) => x / Math.pow(2, z) * 360 - 180;
const y2lat = (y, z) => {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

class TrackMap {
  constructor(host) {
    this.host = host;
    this.canvas = el('canvas', { class: 'map-canvas' });
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.cache = new Map();
    this.pending = new Set();
    this.server = TILE_SERVERS[0];
    this.zoom = 13; this.center = [52, 10];
    this.track = null; this.colorFn = null;
    this.marker = null;
    this.tilesFailed = 0;
    this._bind();
    this.resize();
  }
  setServer(id) {
    const s = TILE_SERVERS.find(t => t.id === id);
    if (s) { this.server = s; this.cache.clear(); this.tilesFailed = 0; this.draw(); }
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(120, this.host.clientWidth), h = Math.max(160, this.host.clientHeight);
    this.dpr = dpr; this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
  }
  _bind() {
    const c = this.canvas;
    this._ro = new ResizeObserver(raf(() => { this.resize(); this.draw(); }));
    this._ro.observe(this.host);
    let drag = null;
    const pts = new Map();
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      drag = { x: e.clientX, y: e.clientY, moved: false };
    });
    c.addEventListener('pointermove', e => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        drag = null;                                   // zwei Finger sind kein Ziehen
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (this._pinch) {
          const f = d / this._pinch;
          if (Math.abs(Math.log2(f)) > 0.02) {
            const r = c.getBoundingClientRect();
            this.zoomBy(Math.log2(f), (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
            this._pinch = d;
          }
        } else this._pinch = d;
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        drag.x = e.clientX; drag.y = e.clientY;
        this.panPx(-dx, -dy);
      } else {
        const r = c.getBoundingClientRect();
        this.hoverAt(e.clientX - r.left, e.clientY - r.top);
      }
    });
    const up = e => {
      if (drag && !drag.moved) {                       // Tippen statt Ziehen: Messpunkt setzen
        const r = c.getBoundingClientRect();
        this.marker = null;
        this.hoverAt(e.clientX - r.left, e.clientY - r.top);
      }
      pts.delete(e.pointerId);
      if (pts.size < 2) this._pinch = null;
      if (!pts.size) drag = null;
      else if (pts.size === 1) {                       // Ziehen am verbliebenen Finger neu ansetzen
        const [q] = [...pts.values()];
        drag = { x: q[0], y: q[1], moved: true };
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { if (this.hoverIdx !== null) { this.hoverIdx = null; this.draw(); if (this.onHover) this.onHover(null); } });
    c.addEventListener('wheel', e => { e.preventDefault();
      // deltaMode: 0 = Pixel (Trackpad), 1 = Zeilen (klassisches Mausrad), 2 = Seiten
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? this.h || 400 : 1;
      let px = e.deltaY * unit;
      if (e.ctrlKey) px *= 3;                          // Trackpad-Kneifgeste meldet kleinere Werte
      this._wheelAcc = (this._wheelAcc || 0) + px;
      const r = c.getBoundingClientRect();
      this._wheelAt = [e.clientX - r.left, e.clientY - r.top];
      if (this._wheelTimer) return;
      // Ereignisse eines Wischers zusammenfassen und einmal pro Bild anwenden
      this._wheelTimer = requestAnimationFrame(() => {
        this._wheelTimer = null;
        const dz = clamp(-this._wheelAcc / 180, -0.7, 0.7);
        this._wheelAcc = 0;
        if (Math.abs(dz) > 0.001) this.zoomBy(dz, this._wheelAt[0], this._wheelAt[1]);
      });
    }, { passive: false });
    c.addEventListener('dblclick', () => this.fit());
  }
  panPx(dx, dy) {
    const z = this.zoom;
    const cx = lon2x(this.center[1], z) + dx / TILE, cy = lat2y(this.center[0], z) + dy / TILE;
    this.center = [clamp(y2lat(cy, z), -85, 85), x2lon(cx, z)];
    this.draw();
  }
  zoomBy(dz, px, py) {
    const old = this.zoom;
    const nz = clamp(old + dz, 2, this.server.max);
    if (nz === old) return;
    if (px !== undefined) {
      const before = this.unproject(px, py, old);
      this.zoom = nz;
      const after = this.unproject(px, py, nz);
      this.center = [this.center[0] + (before[0] - after[0]), this.center[1] + (before[1] - after[1])];
    } else this.zoom = nz;
    this.draw();
  }
  project(lat, lon, z) {
    z = z === undefined ? this.zoom : z;
    const cx = lon2x(this.center[1], z), cy = lat2y(this.center[0], z);
    return [(lon2x(lon, z) - cx) * TILE + this.w / 2, (lat2y(lat, z) - cy) * TILE + this.h / 2];
  }
  unproject(px, py, z) {
    z = z === undefined ? this.zoom : z;
    const cx = lon2x(this.center[1], z), cy = lat2y(this.center[0], z);
    return [y2lat(cy + (py - this.h / 2) / TILE, z), x2lon(cx + (px - this.w / 2) / TILE, z)];
  }
  setTrack(track, colorFn) { this.track = track; this.colorFn = colorFn; this.draw(); }
  fit(pad) {
    const t = this.track; if (!t || !t.n) return;
    pad = pad || 28;
    const b = t.bbox;
    let z = this.server.max;
    for (; z > 2; z -= 0.25) {
      const w = (lon2x(b.lonMax, z) - lon2x(b.lonMin, z)) * TILE;
      const h = (lat2y(b.latMin, z) - lat2y(b.latMax, z)) * TILE;
      if (w <= this.w - pad * 2 && h <= this.h - pad * 2) break;
    }
    this.zoom = z;
    this.center = [(b.latMin + b.latMax) / 2, (b.lonMin + b.lonMax) / 2];
    this.draw();
  }
  hoverAt(px, py) {
    const t = this.track; if (!t) return;
    let best = -1, bestD = 900;
    const stride = Math.max(1, Math.floor(t.n / 1500));
    for (let i = 0; i < t.n; i += stride) {
      const p = this.project(t.lat[i], t.lon[i]);
      const d = (p[0] - px) ** 2 + (p[1] - py) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best !== this.hoverIdx) {
      this.hoverIdx = best >= 0 ? best : null;
      this.draw();
      if (this.onHover) this.onHover(this.hoverIdx === null ? null : t.t[this.hoverIdx]);
    }
  }
  setMarkerTime(tv) {
    const t = this.track; if (!t) return;
    const m = (tv === null || tv === undefined) ? null : bisect(t.t, tv);
    if (m === this.marker) return;
    this.marker = m;
    this._scheduleDraw();
  }
  tileUrl(z, x, y) {
    if (!this.server.url) return null;
    const n = Math.pow(2, z);
    x = ((x % n) + n) % n;
    if (y < 0 || y >= n) return null;
    return this.server.url(z).replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }
  getTile(z, x, y) {
    const key = z + '/' + x + '/' + y;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.pending.has(key) || this.pending.size > 24) return null;
    const url = this.tileUrl(z, x, y); if (!url) return null;
    this.pending.add(key);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { this.cache.set(key, img); this.pending.delete(key); this._scheduleDraw(); };
    img.onerror = () => { this.pending.delete(key); this.cache.set(key, 'err'); this.tilesFailed++; this._scheduleDraw(); };
    img.src = url;
    return null;
  }
  _scheduleDraw() { if (this._pend) return; this._pend = true; requestAnimationFrame(() => { this._pend = false; this.draw(); }); }

  draw() {
    if (!THEME) readTheme();
    const ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = themeVar('--map-bg', '#0d1117');
    ctx.fillRect(0, 0, this.w, this.h);

    // Kacheln
    if (this.server.url) {
      const z = Math.round(this.zoom);
      const scale = Math.pow(2, this.zoom - z);
      const cx = lon2x(this.center[1], z), cy = lat2y(this.center[0], z);
      const halfW = this.w / 2 / (TILE * scale), halfH = this.h / 2 / (TILE * scale);
      const x0 = Math.floor(cx - halfW), x1 = Math.ceil(cx + halfW);
      const y0 = Math.floor(cy - halfH), y1 = Math.ceil(cy + halfH);
      const size = TILE * scale;
      ctx.imageSmoothingEnabled = true;
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const img = this.getTile(z, tx, ty);
        const px = (tx - cx) * size + this.w / 2, py = (ty - cy) * size + this.h / 2;
        if (img && img !== 'err') ctx.drawImage(img, px, py, size + 1, size + 1);
      }
      if (this.server.dark === false && themeVar('--is-dark', '0') === '1') {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(90,105,130,.55)'; ctx.fillRect(0, 0, this.w, this.h);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    const t = this.track;
    if (t && t.n > 1) {
      // Track
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // Untergrund-Kontur
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < t.n; i++) {
        const p = this.project(t.lat[i], t.lon[i]);
        if (!pen) { ctx.moveTo(p[0], p[1]); pen = true; } else ctx.lineTo(p[0], p[1]);
      }
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 7; ctx.stroke();

      const gapSet = new Set((t.gaps || []).map(g => g.i));
      if (this.colorFn) {
        for (let i = 1; i < t.n; i++) {
          const a = this.project(t.lat[i - 1], t.lon[i - 1]), b = this.project(t.lat[i], t.lon[i]);
          if (Math.max(Math.abs(a[0]), Math.abs(b[0])) > this.w * 3 && Math.max(Math.abs(a[1]), Math.abs(b[1])) > this.h * 3) continue;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
          ctx.strokeStyle = this.colorFn(i);
          ctx.lineWidth = 4;
          if (gapSet.has(i)) { ctx.setLineDash([5, 6]); ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(160,170,190,.8)'; }
          ctx.stroke(); ctx.setLineDash([]);
        }
      } else {
        ctx.beginPath(); pen = false;
        for (let i = 0; i < t.n; i++) {
          const p = this.project(t.lat[i], t.lon[i]);
          if (!pen) { ctx.moveTo(p[0], p[1]); pen = true; } else ctx.lineTo(p[0], p[1]);
        }
        ctx.strokeStyle = THEME.accent; ctx.lineWidth = 4; ctx.stroke();
      }

      // Start / Ziel
      const s = this.project(t.lat[0], t.lon[0]), e = this.project(t.lat[t.n - 1], t.lon[t.n - 1]);
      this._pin(s[0], s[1], THEME.ok, 'A');
      this._pin(e[0], e[1], THEME.crit, 'B');

      const mk = this.marker !== null && this.marker !== undefined ? this.marker : this.hoverIdx;
      if (mk !== null && mk !== undefined && mk >= 0 && mk < t.n) {
        const p = this.project(t.lat[mk], t.lon[mk]);
        ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, 6.284);
        ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
        ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, 6.284);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = THEME.accent; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }

    // Maßstab + Attribution
    this._scaleBar(ctx);
    if (this.server.attr) {
      ctx.font = '10px ' + FONT_UI;
      const txt = this.server.attr;
      const w = ctx.measureText(txt).width + 10;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(this.w - w - 2, this.h - 16, w, 14);
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, this.w - w + 3, this.h - 9);
    }
    if (this.tilesFailed > 6 && this.server.url) {
      ctx.font = '12px ' + FONT_UI; ctx.fillStyle = THEME.text2; ctx.textAlign = 'center';
      ctx.fillText('Kartenkacheln nicht erreichbar – Track wird ohne Karte gezeichnet', this.w / 2, 18);
    }
  }
  _pin(x, y, color, label) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.284);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#0b0e14'; ctx.font = 'bold 9px ' + FONT_UI;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + .5);
  }
  _scaleBar(ctx) {
    const mPerPx = 156543.03392 * Math.cos(this.center[0] * Math.PI / 180) / Math.pow(2, this.zoom);
    const targets = [10,20,50,100,200,500,1000,2000,5000,10000,20000,50000];
    let m = targets[0];
    for (const t of targets) { if (t / mPerPx < 110) m = t; }
    const px = m / mPerPx;
    const x = 10, y = this.h - 12;
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + px, y); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.moveTo(x, y); ctx.lineTo(x + px, y);
    ctx.moveTo(x + px, y - 3); ctx.lineTo(x + px, y + 3); ctx.stroke();
    ctx.font = '10px ' + FONT_MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillText(m >= 1000 ? (m/1000)+' km' : m+' m', x + 2, y - 4);
    ctx.fillStyle = '#fff'; ctx.fillText(m >= 1000 ? (m/1000)+' km' : m+' m', x + 1, y - 5);
  }
}

/* Farbrampen für Track-Einfärbung */
const RAMPS = {
  speed:   [[0,'#3b82f6'],[.35,'#22c55e'],[.6,'#eab308'],[.82,'#f97316'],[1,'#ef4444']],
  thermal: [[0,'#1e40af'],[.35,'#06b6d4'],[.6,'#84cc16'],[.8,'#f59e0b'],[1,'#dc2626']],
  diverge: [[0,'#2563eb'],[.5,'#94a3b8'],[1,'#dc2626']]
};
function rampColor(ramp, t) {
  const st = RAMPS[ramp] || RAMPS.speed;
  t = clamp(t, 0, 1);
  for (let i = 1; i < st.length; i++) {
    if (t <= st[i][0]) {
      const f = (t - st[i-1][0]) / (st[i][0] - st[i-1][0]);
      return mixHex(st[i-1][1], st[i][1], f);
    }
  }
  return st[st.length-1][1];
}
function mixHex(a, b, f) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa>>16)&255, (pb>>16)&255, f));
  const g = Math.round(lerp((pa>>8)&255, (pb>>8)&255, f));
  const bl = Math.round(lerp(pa&255, pb&255, f));
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}
