/* ============================================================
   Anwendung: Zustand, Navigation, Sektionen
   ============================================================ */

const App = {
  ds: null, profile: null, diag: null, gears: null,
  range: null, current: 'overview',
  ts: ['rpm', 'speed_mix', 'boost'],
  mapMetric: 'speed_mix',
  charts: [], map: null, fileName: ''
};

const SECTIONS = [
  { id: 'overview', label: 'Überblick',    tab: 'Überblick', icon: 'gauge',  sub: 'Kennzahlen der Fahrt' },
  { id: 'series',   label: 'Zeitreihen',   tab: 'Verlauf',   icon: 'chart',  sub: 'Messgrößen über die Zeit' },
  { id: 'map',      label: 'Strecke',      tab: 'Karte',     icon: 'map',    sub: 'GPS-Route und Höhenprofil' },
  { id: 'dist',     label: 'Verteilungen', tab: 'Verteilung',icon: 'bars',   sub: 'Histogramme und Statistik je Messgröße' },
  { id: 'fields',   label: 'Kennfelder',   tab: 'Kennfeld',  icon: 'grid',   sub: 'Betriebspunkte, Klopfbild, Gangerkennung' },
  { id: 'diag',     label: 'Diagnose',     tab: 'Diagnose',  icon: 'stetho', sub: 'Messwerte gegen Werksangaben' },
  { id: 'data',     label: 'Datenqualität',tab: 'Daten',     icon: 'table',  sub: 'Abdeckung, Artefakte, Export' },
  { id: 'settings', label: 'Einstellungen',tab: 'Optionen',  icon: 'cog',    sub: 'Fahrzeugprofil und Darstellung' }
];

/* ---------- Theme ---------- */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const u = $('#theme svg use');
  if (u) u.setAttribute('href', t === 'dark' ? '#i-moon' : '#i-sun');
  PALETTE = null; THEME = null;
  store.set('theme', t);
  requestAnimationFrame(() => { Chart.redrawAll(); if (App.map) App.map.draw(); });
}

/* ---------- Datei laden ---------- */
async function loadFile(file) {
  App.fileName = file.name || 'Messfahrt';
  $('#prog').hidden = false;
  $('#drop').style.opacity = '.45';
  const setP = (p, label) => {
    $('#prog-i').style.width = (p * 100).toFixed(1) + '%';
    $('#prog-p').textContent = Math.round(p * 100) + ' %';
    if (label) $('#prog-l').textContent = label;
  };
  try {
    setP(0.02, 'Datei wird gelesen …');
    await new Promise(r => setTimeout(r, 16));
    const text = await file.text();
    setP(0.12, 'Zeilen werden ausgewertet …');
    await new Promise(r => setTimeout(r, 16));
    const parsed = await parseCSV(text, (p, rows) =>
      setP(0.12 + p * 0.66, 'Zeilen werden ausgewertet … ' + fmt(rows, 0)));
    if (!parsed.series.size) throw new Error('In dieser Datei wurde keine einzige auswertbare Messreihe gefunden. Ist es wirklich ein OBD-CSV-Export?');
    setP(0.82, 'Kennzahlen werden berechnet …');
    await new Promise(r => setTimeout(r, 16));
    const ds = buildDataset(parsed, { fuel: store.get('fuel', 'petrol') });
    setP(0.94, 'Diagnose läuft …');
    await new Promise(r => setTimeout(r, 16));
    initDataset(ds);
    setP(1, 'Fertig');
    $('#hero').hidden = true;
    $('#app').hidden = false;
    document.body.classList.remove('no-data');
  } catch (e) {
    $('#prog').hidden = true;
    $('#drop').style.opacity = '';
    const old = $('#load-err'); if (old) old.remove();
    $('#drop').appendChild(el('div', { class: 'note crit', id: 'load-err', style: { marginTop: '18px', textAlign: 'left' } },
      icon('alert', 'n-i'), el('div', {}, el('b', {}, 'Datei konnte nicht gelesen werden'), e.message)));
    console.error(e);
  }
}

function initDataset(ds) {
  App.ds = ds;
  const pid = store.get('profile', null) || autoProfile(ds);
  App.profile = VEHICLE_PROFILES.find(p => p.id === pid) || VEHICLE_PROFILES[0];
  App.gears = computeGears(ds, App.profile.specs.rollCircum || store.get('rollCircum', 2.0));
  App.diag = runDiagnostics(ds, App.profile);
  App.range = [ds.t0, ds.t1];
  App.ts = ['rpm', 'speed_mix', 'boost'].filter(id => ds.G[id]);
  if (!App.ts.length) App.ts = [Array.from(ds.metrics.keys())[0]];
  App.mapMetric = ds.G.speed_mix ? 'speed_mix' : App.ts[0];
  $('#brand-sub').textContent = App.fileName.replace(/\.[^.]+$/, '');
  buildNav();
  go(App.current);
}
function recompute() {
  if (!App.ds) return;
  App.gears = computeGears(App.ds, App.profile.specs.rollCircum || store.get('rollCircum', 2.0));
  App.diag = runDiagnostics(App.ds, App.profile);
  go(App.current, true);
}

/* ---------- Navigation ---------- */
function buildNav() {
  const nav = $('#nav'), tabs = $('#tabbar');
  nav.innerHTML = ''; tabs.innerHTML = '';
  SECTIONS.forEach(s => {
    const bad = s.id === 'diag' && App.diag ? diagBadge() : null;
    nav.appendChild(el('button', { class: 'navitem', type: 'button', 'data-sec': s.id, onclick: () => go(s.id) },
      icon(s.icon), el('span', { class: 'lbl' }, s.label), bad));
    tabs.appendChild(el('button', { class: 'tabbtn', type: 'button', 'data-sec': s.id, onclick: () => go(s.id) },
      icon(s.icon), el('span', {}, s.tab || s.label)));
  });
}
function diagBadge() {
  const t = App.diag.tally;
  if (t.crit) return el('span', { class: 'badge crit' }, String(t.crit));
  if (t.warn) return el('span', { class: 'badge warn' }, String(t.warn));
  return el('span', { class: 'badge ok' }, '✓');
}

function go(id, force) {
  const sec = SECTIONS.find(s => s.id === id) || SECTIONS[0];
  if (App.current === id && !force && $('#page-' + id)) {
    $$('#pages .page').forEach(p => p.hidden = p.id !== 'page-' + id);
  }
  App.current = id;
  $$('.navitem, .tabbtn').forEach(b =>
    b.getAttribute('data-sec') === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $('#page-title').textContent = sec.label;
  $('#page-sub').textContent = sec.sub;
  const pages = $('#pages');
  let page = $('#page-' + id);
  if (page && force) { page.remove(); page = null; }
  if (!page) {
    Chart.all.slice().forEach(c => { if (c.host.closest('#page-' + id)) c.destroy(); });
    page = el('section', { class: 'page', id: 'page-' + id });
    pages.appendChild(page);
    try { BUILDERS[id](page); }
    catch (e) { page.appendChild(noteBox('crit', 'Dieser Bereich konnte nicht aufgebaut werden', e.message)); console.error(e); }
  }
  $$('#pages .page').forEach(p => p.hidden = p !== page);
  window.scrollTo({ top: 0, behavior: 'instant' });
  requestAnimationFrame(() => Chart.all.forEach(c => { c.resize(); c.draw(); }));
}

/* ---------- Hilfsfunktionen für Sektionen ---------- */
function M(id) { return App.ds.metrics.get(id); }
function label(id) { const m = M(id); return m ? m.label : id; }
function short(id) { const m = M(id); return m ? (m.short || m.label) : id; }
function unitOf(id) { const m = M(id); return m ? m.unit : ''; }
function rangeIdx() {
  const ds = App.ds;
  const a = Math.max(0, Math.floor((App.range[0] - ds.t0) / ds.step));
  const b = Math.min(ds.N - 1, Math.ceil((App.range[1] - ds.t0) / ds.step));
  return [a, b];
}
function windowed(id) {
  const [a, b] = rangeIdx();
  const arr = App.ds.G[id];
  return arr ? arr.subarray(a, b + 1) : null;
}
function xFormatter() {
  const ds = App.ds;
  const abs = ds.meta.timeFormat === 'daysec' || ds.meta.epochBased;
  return abs ? (v => fmtClock(v)) : (v => fmtRel(v - ds.t0));
}
function sparkOf(id, n) {
  const a = App.ds.G[id]; if (!a) return null;
  n = n || 60;
  const out = new Float64Array(n), step = App.ds.N / n;
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = Math.floor(i * step); j < Math.floor((i + 1) * step) && j < App.ds.N; j++)
      if (a[j] === a[j]) { s += a[j]; c++; }
    out[i] = c ? s / c : NaN;
  }
  return out;
}

/* ---------- Zeitbereichs-Regler ---------- */
class Brush {
  constructor(host, onChange) {
    this.host = host; this.onChange = onChange;
    this.canvas = el('canvas', { style: { display: 'block', width: '100%', height: '56px', touchAction: 'none', cursor: 'ew-resize' } });
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.drag = null;
    this._bind();
    this._ro = new ResizeObserver(raf(() => { this.resize(); this.draw(); }));
    this._ro.observe(host);
    this.resize();
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = Math.max(80, this.host.clientWidth); this.h = 56;
    this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  _bind() {
    const c = this.canvas;
    const pos = e => { const r = c.getBoundingClientRect(); return clamp((e.clientX - r.left) / this.w, 0, 1); };
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      const ds = App.ds, p = pos(e);
      const t = ds.t0 + p * ds.duration;
      const a = (App.range[0] - ds.t0) / ds.duration, b = (App.range[1] - ds.t0) / ds.duration;
      const near = x => Math.abs(p - x) < 0.03;
      this.drag = near(a) ? 'a' : near(b) ? 'b' : (p > a && p < b) ? 'move' : 'new';
      if (this.drag === 'new') { this.anchor = t; App.range = [t, t]; }
      this.last = p;
      this._apply(e);
    });
    c.addEventListener('pointermove', e => { if (this.drag) this._apply(e); });
    const up = () => { if (this.drag) { this.drag = null; this._norm(); this.onChange(); } };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('dblclick', () => { App.range = [App.ds.t0, App.ds.t1]; this.draw(); this.onChange(); });
  }
  _apply(e) {
    const ds = App.ds, r = this.canvas.getBoundingClientRect();
    const p = clamp((e.clientX - r.left) / this.w, 0, 1);
    const t = ds.t0 + p * ds.duration;
    if (this.drag === 'a') App.range[0] = t;
    else if (this.drag === 'b') App.range[1] = t;
    else if (this.drag === 'new') App.range = [Math.min(this.anchor, t), Math.max(this.anchor, t)];
    else if (this.drag === 'move') {
      const d = (p - this.last) * ds.duration;
      const w = App.range[1] - App.range[0];
      let a = clamp(App.range[0] + d, ds.t0, ds.t1 - w);
      App.range = [a, a + w];
      this.last = p;
    }
    this._norm(); this.draw(); this.onChange(true);
  }
  _norm() {
    const ds = App.ds;
    let [a, b] = App.range;
    if (a > b) { const t = a; a = b; b = t; }
    const minW = ds.duration * 0.005;
    if (b - a < minW) b = Math.min(ds.t1, a + minW);
    App.range = [clamp(a, ds.t0, ds.t1), clamp(b, ds.t0, ds.t1)];
  }
  draw() {
    if (!THEME) readTheme();
    const ctx = this.ctx, ds = App.ds;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = themeVar('--surface-2', '#171d27');
    ctx.fillRect(0, 0, this.w, this.h);
    const src = ds.G.speed_mix || ds.G.rpm || ds.G[App.ts[0]];
    if (src) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < ds.N; i++) { const v = src[i]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
      if (hi > lo) {
        ctx.beginPath(); let pen = false;
        for (let i = 0; i < ds.N; i++) {
          const v = src[i]; if (!(v === v)) { pen = false; continue; }
          const x = i / (ds.N - 1) * this.w, y = 50 - (v - lo) / (hi - lo) * 42;
          if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
    const a = (App.range[0] - ds.t0) / ds.duration * this.w, b = (App.range[1] - ds.t0) / ds.duration * this.w;
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.fillRect(0, 0, a, this.h); ctx.fillRect(b, 0, this.w - b, this.h);
    ctx.strokeStyle = THEME.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a, this.h); ctx.moveTo(b, 0); ctx.lineTo(b, this.h); ctx.stroke();
    ctx.fillStyle = THEME.accent;
    ctx.fillRect(a - 2, this.h / 2 - 9, 4, 18); ctx.fillRect(b - 2, this.h / 2 - 9, 4, 18);
    ctx.font = '10px ' + FONT_MONO; ctx.fillStyle = THEME.text2; ctx.textBaseline = 'bottom';
    const xf = xFormatter();
    ctx.textAlign = 'left';  ctx.fillText(xf(App.range[0]), Math.min(a + 4, this.w - 60), this.h - 3);
    ctx.textAlign = 'right'; ctx.fillText(xf(App.range[1]), Math.max(b - 4, 60), this.h - 3);
  }
}

/* ---------- Phasenbalken ---------- */
function phaseBar(ds) {
  const total = Object.values(ds.phases.time).reduce((a, b) => a + b, 0);
  const unknown = Math.max(0, ds.duration - total);
  const bar = el('div', { class: 'phasebar' });
  const leg = el('div', { class: 'phaselegend' });
  ds.phases.defs.forEach(p => {
    const t = ds.phases.time[p.id];
    if (t <= 0) return;
    bar.appendChild(el('i', { style: { width: (t / ds.duration * 100) + '%', background: p.color }, title: p.label + ' ' + fmtDur(t) }));
    leg.appendChild(el('span', { class: 'li' }, el('i', { class: 'sw', style: { background: p.color } }),
      p.label, ' ', el('b', {}, fmtDur(t))));
  });
  if (unknown > 1) {
    bar.appendChild(el('i', { style: { width: (unknown / ds.duration * 100) + '%',
      background: 'repeating-linear-gradient(45deg,var(--surface-3),var(--surface-3) 5px,var(--border) 5px,var(--border) 10px)' } }));
    leg.appendChild(el('span', { class: 'li' },
      el('i', { class: 'sw', style: { background: 'var(--border-hi)' } }), 'ohne Geschwindigkeitsdaten ', el('b', {}, fmtDur(unknown))));
  }
  return el('div', {}, bar, leg);
}

/* ============================================================
   Sektionen
   ============================================================ */
const BUILDERS = {};

/* --- Überblick --- */
BUILDERS.overview = function (page) {
  const ds = App.ds, T = ds.trip, s = ds.stats;
  ds.notices.forEach(n => page.appendChild(noteBox(n.level, n.title, n.text)));

  const K = el('div', { class: 'grid kpis' });
  const add = (l, v, u, sub, o) => K.appendChild(kpi(l, v, u, sub, o));
  add('Fahrtdauer', fmtDur(ds.duration), '', 'davon ' + fmtDur(T.movingTime) + ' in Bewegung', { accent: true });
  add('Strecke', fmt(T.dist, 2), 'km', 'Quelle: ' + T.distSource + (T.gapDist > 0.05 ? ' · ' + fmt(T.gapDist, 1) + ' km über GPS-Lücken' : ''));
  add('Ø Geschwindigkeit', fmt(T.speedAvgMoving, 1), 'km/h', 'in Bewegung · gesamt ' + fmt(T.speedAvgTotal, 1) + ' km/h',
      { spark: sparkOf('speed_mix'), sparkColor: '#29b6f6' });
  add('Höchstgeschwindigkeit', fmt(T.speedMax, 0), 'km/h', s.speed_mix ? 'bei ' + xFormatter()(s.speed_mix.tMax) : '');
  if (isFinite(T.consAvg)) add('Verbrauch', fmt(T.consAvg, 1), 'L/100km',
      App.profile.specs.consNEDC ? 'Werk NEFZ ' + fmt(App.profile.specs.consNEDC, 1) + ' L' : '');
  if (isFinite(T.fuelUsed)) add('Kraftstoff', fmt(T.fuelUsed, 2), 'L',
      isFinite(T.cost) ? fmt(T.cost, 2) + ' € · ' + fmt(T.pricePerL, 3) + ' €/L' : '');
  if (isFinite(T.co2)) add('CO₂', fmt(T.co2, 2), 'kg', fmt(T.co2PerKm, 0) + ' g/km');
  if (isFinite(T.rpmMax)) add('Höchstdrehzahl', fmt(T.rpmMax, 0), 'min⁻¹',
      App.profile.specs.redline ? fmt(T.rpmMax / App.profile.specs.redline * 100, 0) + ' % des Begrenzers' : '',
      { spark: sparkOf('rpm'), sparkColor: '#ff5c47' });
  if (isFinite(T.rpmAvg)) add('Ø Drehzahl', fmt(T.rpmAvg, 0), 'min⁻¹', 'zeitgewichtet');
  if (isFinite(T.boostMax)) add('Ladedruck max.', fmt(T.boostMax, 2), 'bar',
      fmt(T.boostMax * 14.5038, 1) + ' psi' + (ds.boostDerived ? ' · Rechenwert' : ''));
  if (isFinite(T.loadMax)) add('Motorlast max.', fmt(T.loadMax, 0), '%', 'absolute Last');
  if (isFinite(T.coolantMax)) add('Kühlmittel max.', fmt(T.coolantMax, 0), '°C',
      'Start bei ' + fmt(T.coolantStart, 0) + ' °C', { spark: sparkOf('coolant'), sparkColor: '#ef5350' });
  if (s.cac_mean) add('Ladeluft max.', fmt(s.cac_mean.max, 0), '°C',
      s.ambient ? fmt(s.cac_mean.max - s.ambient.median, 0) + ' K über Außenluft' : '');
  if (isFinite(T.wotShare)) add('Volllastanteil', fmt(T.wotShare * 100, 1), '%', T.wotSignal || '');
  if (isFinite(T.coastShare)) add('Schubbetrieb', fmt(T.coastShare * 100, 1), '%', 'ohne Einspritzung gerollt');
  if (isFinite(T.ascent)) add('Höhenmeter', fmt(T.ascent, 0), 'm', 'bergauf · ' + fmt(T.descent, 0) + ' m bergab');
  add('Stopps', String(ds.events.stops.length), '', 'zusammen ' + fmtDur(T.stoppedTime));
  if (s.accel) add('Beschleunigung', fmt(s.accel.max, 2), 'g', 'max. Verzögerung ' + fmt(s.accel.min, 2) + ' g');
  page.appendChild(K);

  /* Diagnose-Kurzfassung */
  const t = App.diag.tally;
  const worst = App.diag.results.filter(r => r.status === 'crit' || r.status === 'warn');
  page.appendChild(card('Diagnose-Kurzfassung', {
    tools: el('button', { class: 'btn sm', onclick: () => go('diag') }, 'Alle Befunde')
  },
    el('div', { class: 'grid kpis', style: { marginBottom: worst.length ? '12px' : '0' } },
      kpi('Unauffällig', String(t.ok), '', 'Prüfungen im Sollbereich'),
      kpi('Grenzwertig', String(t.warn), '', 'beobachten'),
      kpi('Auffällig', String(t.crit), '', t.crit ? 'Handlungsbedarf' : 'keine'),
      kpi('Nicht bewertbar', String(t.unklar + t.missing), '', 'Daten reichen nicht aus')),
    worst.length
      ? el('div', { class: 'grid', style: { gap: '9px' } }, worst.slice(0, 4).map(findingCard))
      : el('p', { style: { color: 'var(--text-2)', fontSize: '13px', lineHeight: '1.6' } },
          'Keine der ' + (t.ok + t.warn + t.crit) + ' auswertbaren Prüfungen liegt außerhalb ihres Sollbereichs.')));

  /* Überblicksdiagramm */
  const ids = ['speed_mix', 'rpm'].filter(id => ds.G[id]);
  if (ids.length) {
    const cc = chartCard('Fahrtverlauf', { hint: 'Geschwindigkeit und Drehzahl über die gesamte Fahrt', height: 210 },
      { type: 'timeseries', syncHover: true });
    page.appendChild(cc.node);
    drawTimeseries(cc, ids, [ds.t0, ds.t1], true);
  }

  page.appendChild(card('Zeitbudget', { hint: 'Wie sich die Fahrtzeit auf die Betriebszustände verteilt' }, phaseBar(ds)));

  /* Beschleunigungswerte */
  if (ds.events.sprints.length) {
    page.appendChild(card('Gemessene Beschleunigungswerte', {
      hint: 'automatisch aus dem Geschwindigkeitsverlauf erkannt'
    }, el('div', { class: 'tblwrap' }, el('table', { class: 'tbl', style: { minWidth: '420px' } },
      el('thead', {}, el('tr', {}, el('th', {}, 'Messung'), el('th', {}, 'Zeit'), el('th', {}, 'Ø Beschl.'), el('th', {}, 'Zeitpunkt'))),
      el('tbody', {}, ds.events.sprints.map(sp => el('tr', {},
        el('td', {}, sp.from + '–' + sp.to + ' km/h'),
        el('td', { class: 'n' }, fmt(sp.dur, 2) + ' s'),
        el('td', { class: 'n' }, fmt(sp.avgA / 9.80665, 2) + ' g'),
        el('td', { class: 'n' }, xFormatter()(sp.t0)))))),
      App.profile.specs.accel0100
        ? el('p', { class: 'card-f', style: { padding: '10px 0 0', borderTop: 0 } },
            'Werksangabe 0–100 km/h: ' + fmt(App.profile.specs.accel0100, 1) + ' s. Die hier gemessenen Werte stammen aus einer Verkehrssituation, nicht von einer Messstrecke – Steigung, Gangwahl und Untergrund gehen ungefiltert ein.')
        : null)));
  }
};

/* --- Zeitreihen --- */
BUILDERS.series = function (page) {
  const ds = App.ds;
  const metrics = Array.from(ds.metrics.values())
    .filter(m => (!m.def || !m.def.hidden) && !m.aux)
    .sort((a, b) => (GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)) || a.label.localeCompare(b.label));

  const brushHost = el('div');
  const rangeInfo = el('span', { class: 'rv' });
  page.appendChild(card('Zeitbereich', {
    hint: 'Ziehen zum Ausschneiden, Doppelklick setzt zurück',
    tools: [rangeInfo, el('button', { class: 'btn sm', onclick: () => { App.range = [ds.t0, ds.t1]; brush.draw(); update(); } }, 'Ganze Fahrt')]
  }, brushHost));

  const chipHost = el('div', { style: { display: 'grid', gap: '10px' } });
  page.appendChild(card('Messgrößen', {
    hint: 'bis zu vier gleichzeitig · die ersten beiden Einheiten bekommen eine Achse, weitere Reihen werden eigenständig skaliert'
  }, chipHost));

  const cc = chartCard('Verlauf', { readout: true, height: 340, hint: 'Mausrad zoomt, Doppelklick setzt zurück' },
    { type: 'timeseries', onZoom: (f, fx) => zoomRange(f, fx), onReset: () => { App.range = [ds.t0, ds.t1]; brush.draw(); update(); } });
  page.appendChild(cc.node);

  const brush = new Brush(brushHost, () => update());
  GROUP_ORDER.forEach(g => {
    const ms = metrics.filter(m => m.group === g);
    if (!ms.length) return;
    chipHost.appendChild(el('div', {},
      el('div', { style: { fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.08em',
                           color: 'var(--text-3)', fontWeight: '600', marginBottom: '6px' } },
        (GROUPS[g] || { label: g }).label),
      metricChips(ms, App.ts, () => update(), { max: 4 })));
  });

  function zoomRange(factor, fx) {
    const w = App.range[1] - App.range[0];
    const c = App.range[0] + w * fx;
    const nw = clamp(w * factor, ds.duration * 0.005, ds.duration);
    App.range = [clamp(c - nw * fx, ds.t0, ds.t1), clamp(c + nw * (1 - fx), ds.t0, ds.t1)];
    brush.draw(); update();
  }
  function update(light) {
    rangeInfo.textContent = xFormatter()(App.range[0]) + ' – ' + xFormatter()(App.range[1]) +
                            '  (' + fmtDur(App.range[1] - App.range[0]) + ')';
    drawTimeseries(cc, App.ts, App.range, false);
  }
  brush.draw(); update();

  Chart.onHover('series', x => { if (cc.readout.isConnected) updateReadout(cc.readout, x, App.ts); });
};

const GROUP_ORDER = ['motor', 'boost', 'temp', 'fuel', 'cons', 'drive', 'calc', 'misc'];

function drawTimeseries(cc, ids, range, whole) {
  const ds = App.ds;
  const axes = [];
  const series = [];
  ids.forEach((id, i) => {
    const m = ds.metrics.get(id); if (!m) return;
    const arr = ds.G[id] || m.v;
    const xs = ds.G[id] ? ds.grid : m.t;
    let lo = Infinity, hi = -Infinity;
    const a0 = ds.G[id] ? Math.max(0, Math.floor((range[0] - ds.t0) / ds.step)) : 0;
    const a1 = ds.G[id] ? Math.min(ds.N - 1, Math.ceil((range[1] - ds.t0) / ds.step)) : arr.length - 1;
    for (let k = a0; k <= a1; k++) { const v = arr[k]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const pad = (hi - lo) * 0.08 || 1;
    const color = metricColor(m, i);
    let ax = axes.find(a => a.unit === m.unit);
    let axIdx;
    if (!ax && axes.length < 2) { ax = { unit: m.unit, lo: lo - pad, hi: hi + pad, color }; axes.push(ax); axIdx = axes.length - 1; }
    else if (ax) { axIdx = axes.indexOf(ax); }
    else { axIdx = -1; }                       // keine Achse frei -> eigenständig skalieren
    if (ax) { ax.lo = Math.min(ax.lo, lo - pad); ax.hi = Math.max(ax.hi, hi + pad); }
    series.push({ x: xs, y: arr, n: arr.length, color, axis: axIdx, own: axIdx < 0,
                  fill: ids.length <= 2, label: m.short || m.label, unit: m.unit, id });
  });
  const bands = [];
  if (ds.phases) {
    for (const sg of ds.phases.segs) {
      if (sg.id === 'cruise') continue;
      const p = ds.phases.defs.find(d => d.id === sg.id);
      bands.push({ t0: ds.grid[sg.i0], t1: ds.grid[sg.i1], color: p.color + (sg.id === 'stand' ? '22' : '18') });
    }
  }
  cc.chart.axes = axes;
  cc.chart.setData({ series, bands, xRange: range, xFormat: xFormatter() });
  legendItems(cc.legend, series);
}

function updateReadout(node, x, ids) {
  if (!node) return;
  const ds = App.ds;
  if (x === null || x === undefined) { node.textContent = 'Zeiger über das Diagramm bewegen'; return; }
  node.innerHTML = '';
  node.appendChild(el('span', { class: 'r-t' }, xFormatter()(x)));
  ids.forEach((id, i) => {
    const m = ds.metrics.get(id); if (!m) return;
    const arr = ds.G[id] || m.v, xs = ds.G[id] ? ds.grid : m.t;
    const k = bisect(xs, x);
    const v = k >= 0 ? arr[k] : NaN;
    node.appendChild(el('span', { class: 'r-i' },
      el('i', { class: 'dot', style: { background: metricColor(m, i), width: '8px', height: '8px', borderRadius: '3px', display: 'inline-block' } }),
      el('span', { style: { color: 'var(--text-3)' } }, (m.short || m.label) + ':'),
      el('b', {}, isFinite(v) ? fmt(v, m.decimals) + ' ' + m.unit : '–')));
  });
  if (App.map) App.map.setMarkerTime(x);
}

/* --- Strecke / Karte --- */
BUILDERS.map = function (page) {
  const ds = App.ds;
  if (!ds.track || ds.track.n < 3) {
    page.appendChild(card('Keine GPS-Daten', {},
      emptyBox('Diese Aufzeichnung enthält keine verwertbare Position',
        'Die CSV hat keine Spalten für Breiten- und Längengrad, oder alle Werte waren unbrauchbar. In der OBD-App die GPS-Aufzeichnung aktivieren.')));
    return;
  }
  const tr = ds.track;
  const colorable = Array.from(ds.metrics.values()).filter(m => ds.G[m.id]);
  const sel = el('select', { class: 'sel', onchange: e => { App.mapMetric = e.target.value; paint(); } },
    colorable.map(m => el('option', { value: m.id, selected: m.id === App.mapMetric ? true : null }, m.label)));
  const styleSel = el('select', { class: 'sel', onchange: e => { store.set('tiles', e.target.value); map.setServer(e.target.value); } },
    TILE_SERVERS.map(t => el('option', { value: t.id, selected: t.id === store.get('tiles', 'osm') ? true : null }, t.name)));

  const host = el('div', { class: 'chart-host map' });
  const readout = el('div', { class: 'map-readout' },
    el('div', { class: 'mr-hint' }, 'Auf die Route tippen oder mit dem Zeiger darüberfahren – hier stehen dann alle Messwerte dieser Stelle.'));
  host.appendChild(readout);
  const rampRow = el('div', { class: 'ramp-row' });
  const c = card('GPS-Route', {
    hint: 'Ziehen zum Verschieben, Mausrad oder zwei Finger zum Zoomen, Doppelklick passt an',
    tools: [sel, styleSel], flush: false
  }, host, rampRow);
  page.appendChild(c);

  const map = new TrackMap(host);
  App.map = map;
  map.setServer(store.get('tiles', 'osm'));
  /* Welche Größen im Messfenster stehen */
  const READ_IDS = ['speed_mix', 'rpm', 'load_abs', 'boost', 'timing', 'cons_calc',
                    'coolant', 'cac_mean', 'accel', 'alt_smooth']
                   .filter(id => ds.G[id]);
  function showAt(t) {
    readout.innerHTML = '';
    if (t === null || t === undefined) {
      readout.appendChild(el('div', { class: 'mr-hint' },
        'Auf die Route tippen oder mit dem Zeiger darüberfahren – hier stehen dann alle Messwerte dieser Stelle.'));
      return;
    }
    const k = bisect(ds.grid, t);
    const gi = App.gears && k >= 0 ? App.gears.assign[k] : -1;
    const gear = gi >= 0 && App.gears ? App.gears.remap[gi] : null;
    const ti = bisect(tr.t, t);
    readout.appendChild(el('div', { class: 'mr-t' },
      el('span', {}, xFormatter()(t)),
      el('span', {}, ti > 0 ? fmt(tr.dist[ti] / 1000, 2) + ' km' : '')));
    READ_IDS.forEach(id => {
      const m = ds.metrics.get(id), a = ds.G[id];
      const v = k >= 0 ? a[k] : NaN;
      if (!(v === v)) return;
      readout.appendChild(el('div', { class: 'mr-r' },
        el('span', {}, m.short || m.label),
        el('b', { style: { color: m.id === App.mapMetric ? 'var(--accent)' : null } },
          fmt(v, m.decimals) + ' ' + m.unit)));
    });
    if (gear) readout.appendChild(el('div', { class: 'mr-r' }, el('span', {}, 'Gang (erkannt)'), el('b', {}, 'G' + gear)));
  }
  map.onHover = t => { showAt(t); Chart.emitHover(t, null); };
  Chart.onHover('map', t => { if (readout.isConnected) showAt(t); });
  requestAnimationFrame(() => { map.resize(); paint(); map.fit(); });

  function paint() {
    const m = ds.metrics.get(App.mapMetric);
    const arr = ds.G[App.mapMetric];
    if (!arr || !m) { map.setTrack(tr, null); return; }
    const st = ds.stats[App.mapMetric];
    const lo = st ? st.p05 : 0, hi = st ? st.p95 : 1;
    const ramp = /temp|coolant|cac/.test(App.mapMetric) ? 'thermal'
               : /delta|trim|accel|timing/.test(App.mapMetric) ? 'diverge' : 'speed';
    const vals = new Float64Array(tr.n);
    for (let i = 0; i < tr.n; i++) { const k = bisect(ds.grid, tr.t[i]); vals[i] = k >= 0 ? arr[k] : NaN; }
    map.setTrack(tr, i => {
      const v = vals[i];
      if (!(v === v)) return 'rgba(150,160,180,.55)';
      return rampColor(ramp, (v - lo) / (hi - lo || 1));
    });
    rampRow.innerHTML = '';
    rampRow.appendChild(el('span', {}, fmt(lo, m.decimals)));
    rampRow.appendChild(el('div', { class: 'ramp', style: { background: rampCss(ramp) } }));
    rampRow.appendChild(el('span', {}, fmt(hi, m.decimals) + ' ' + m.unit));
  }

  /* Kennzahlen zur Strecke */
  const K = el('div', { class: 'grid kpis' });
  K.appendChild(kpi('Streckenlänge', fmt(tr.totalDist / 1000, 2), 'km',
    tr.gaps.length ? 'darin ' + fmt(tr.gapDist / 1000, 1) + ' km Luftlinie über ' + tr.gaps.length + ' GPS-Lücke(n)' : 'ohne Lücken'));
  K.appendChild(kpi('Positionen', fmt(tr.n, 0), '', tr.rejected ? fmt(tr.rejected, 0) + ' Ausreißer verworfen' : 'keine Ausreißer'));
  if (isFinite(App.ds.trip.ascent))
    K.appendChild(kpi('Anstieg', fmt(App.ds.trip.ascent, 0), 'm', fmt(App.ds.trip.descent, 0) + ' m Gefälle'));
  if (tr.alt) K.appendChild(kpi('Höhe', fmt(App.ds.trip.altMin, 0) + '–' + fmt(App.ds.trip.altMax, 0), 'm', 'niedrigster bis höchster Punkt'));
  K.appendChild(kpi('Bereich', fmt(haversine(tr.bbox.latMin, tr.bbox.lonMin, tr.bbox.latMax, tr.bbox.lonMin) / 1000, 1) + ' × ' +
    fmt(haversine(tr.bbox.latMin, tr.bbox.lonMin, tr.bbox.latMin, tr.bbox.lonMax) / 1000, 1), 'km', 'Nord-Süd × Ost-West'));
  page.appendChild(K);

  if (tr.gaps.length) {
    page.appendChild(noteBox('warn', 'GPS-Lücken in der Aufzeichnung',
      'An ' + tr.gaps.length + ' Stelle(n) ist das Signal ausgefallen; die längste Lücke dauerte ' +
      fmtDur(Math.max.apply(null, tr.gaps.map(g => g.dt))) + ' und überbrückt ' +
      fmt(Math.max.apply(null, tr.gaps.map(g => g.d)) / 1000, 1) + ' km. Diese Abschnitte sind gestrichelt gezeichnet und als Luftlinie gerechnet – die tatsächlich gefahrene Strecke ist also eher länger als die angegebene.'));
  }
  if (ds.meta.gpsSource) {
    page.appendChild(noteBox('info', 'Woher die Positionen stammen',
      'Im Long-Format tragen die Zeilen jeder PID ihren eigenen, teils veralteten GPS-Fix. Beim Mischen entsteht ein Positions-Ping-Pong, das die Streckenlänge um ein Vielfaches aufbläht. Ausgewertet wird deshalb nur die Quelle mit den meisten eigenständigen Punkten: „' +
      ds.meta.gpsSource + '" (' + fmt(ds.meta.gpsPoints, 0) + ' Punkte).'));
  }

  /* Höhenprofil */
  if (tr.alt) {
    const span = App.ds.trip.altMax - App.ds.trip.altMin;
    const cc = chartCard('Höhenprofil', {
      hint: 'geglättet über die zurückgelegte Strecke', height: 190,
      foot: span < 30 ? 'Die Höhenspanne beträgt nur ' + fmt(span, 1) + ' m. In dieser Größenordnung ist das GPS-Signal überwiegend Rauschen – das Profil ist nicht als Topografie zu lesen.' : null
    }, { type: 'timeseries', syncHover: false });
    page.appendChild(cc.node);
    const alt = smooth(tr.alt, 11);
    cc.chart.axes = [{ unit: 'm', lo: Math.min.apply(null, Array.from(alt)) - 1, hi: Math.max.apply(null, Array.from(alt)) + 1, color: '#a5d6a7' }];
    cc.chart.opts.onZoom = null;
    cc.chart.setData({
      series: [{ x: tr.dist, y: alt, n: tr.n, color: '#7cb342', axis: 0, fill: true, label: 'Höhe', unit: 'm' }],
      bands: null, xRange: [0, tr.totalDist], xFormat: v => fmt(v / 1000, 1) + ' km'
    });
    legendItems(cc.legend, [{ color: '#7cb342', label: 'Höhe über Strecke', unit: 'm' }]);
  }
};

/* --- Verteilungen --- */
BUILDERS.dist = function (page) {
  const ds = App.ds;
  const prefer = ['rpm', 'speed_mix', 'load_abs', 'boost', 'timing', 'coolant', 'cac_mean', 'cons_calc',
                  'ltft_b1', 'ltft_b2', 'accel', 'power', 'fuel_rate', 'pedal'];
  const ids = prefer.filter(id => ds.G[id]);
  page.appendChild(sectionHead('Verteilungen', 'Zeitanteil je Wertebereich – wie lange der Motor tatsächlich wo betrieben wurde. Gewichtet nach Zeit, nicht nach Anzahl der Messpunkte.'));

  const grid = el('div', { class: 'grid g3' });
  page.appendChild(grid);
  ids.forEach((id, i) => {
    const m = ds.metrics.get(id), st = ds.stats[id];
    if (!st) return;
    const arr = ds.G[id];
    const h = histogram(arr, 26, st.min, st.max, null, ds.step);
    if (!h) return;
    const cc = chartCard(m.label, {
      hint: fmt(st.min, m.decimals) + ' – ' + fmt(st.max, m.decimals) + ' ' + m.unit, height: 168, legend: false
    }, { type: 'hist' });
    const col = metricColor(m, i);
    cc.chart.xTitle = m.label + (m.unit ? ' (' + m.unit + ')' : '');
    cc.chart.barColor = () => col;
    cc.chart.yFormat = v => fmtDur(v).replace(' min', 'm').replace(' s', 's');
    cc.chart.setData({ histData: h });
    cc.node.appendChild(el('div', { class: 'card-f' },
      'Median ' + fmt(st.median, m.decimals) + ' · Ø ' + fmt(st.meanW, m.decimals) +
      ' · p95 ' + fmt(st.p95, m.decimals) + ' ' + m.unit));
    grid.appendChild(cc.node);
  });

  /* Statistiktabelle */
  const rows = Array.from(ds.metrics.values())
    .filter(m => ds.stats[m.id])
    .sort((a, b) => (GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)) || a.label.localeCompare(b.label));
  page.appendChild(card('Statistik je Messgröße', {
    hint: 'Ø ist zeitgewichtet – Messpausen verzerren den Mittelwert damit nicht',
    tools: el('button', { class: 'btn sm', onclick: exportStatsCsv }, icon('dl'), 'CSV')
  },
    el('div', { class: 'tblwrap' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ['Messgröße', 'Einheit', 'n', 'Min', 'p05', 'Median', 'Ø (zeitgew.)', 'p95', 'Max', 'σ', 'Abdeckung']
        .map(h => el('th', {}, h)))),
      el('tbody', {}, rows.map(m => {
        const s = ds.stats[m.id];
        const cov = ds.coverage[m.id] || 0;
        return el('tr', {},
          el('td', {}, m.label, m.derived ? el('span', { class: 'badge mute', style: { marginLeft: '6px' } }, 'berechnet') : null),
          el('td', { class: 'n' }, m.unit),
          el('td', { class: 'n' }, fmt(s.n, 0)),
          el('td', { class: 'n' }, fmt(s.min, m.decimals)),
          el('td', { class: 'n' }, fmt(s.p05, m.decimals)),
          el('td', { class: 'n' }, fmt(s.median, m.decimals)),
          el('td', { class: 'n' }, fmt(s.meanW, m.decimals)),
          el('td', { class: 'n' }, fmt(s.p95, m.decimals)),
          el('td', { class: 'n' }, fmt(s.max, m.decimals)),
          el('td', { class: 'n' }, fmt(s.std, m.decimals)),
          el('td', {}, el('div', { style: { display: 'flex', alignItems: 'center', gap: '7px' } },
            el('div', { class: 'covbar' }, el('i', { style: { width: (cov * 100) + '%' } })),
            el('span', { class: 'num', style: { fontSize: '11px', color: 'var(--text-3)' } }, fmt(cov * 100, 0) + ' %'))));
      }))))));
};

/* --- Kennfelder --- */
BUILDERS.fields = function (page) {
  const ds = App.ds, G = ds.G;
  page.appendChild(sectionHead('Kennfelder', 'Wo der Motor tatsächlich betrieben wurde und wie er dabei geregelt hat. Die Streubilder zeigen jeden Rasterpunkt der Fahrt.'));

  const load = G.load_abs || G.load_calc;
  const loadId = G.load_abs ? 'load_abs' : 'load_calc';

  /* Betriebspunkt-Dichte Drehzahl × Last */
  if (G.rpm && load) {
    const sr = ds.stats.rpm, sl = ds.stats[loadId];
    const d = density2d(G.rpm, load, 46, 34, Math.max(0, sr.min - 50), sr.max + 50, Math.max(0, sl.min - 3), sl.max + 3, ds.step);
    const cc = chartCard('Betriebspunkte: Drehzahl × Motorlast', {
      hint: 'Farbe = Verweildauer (logarithmisch)', height: 300,
      foot: 'Der helle Kern zeigt, wo der Motor die meiste Zeit lief. Ein aufgeladener Motor erreicht bei Volllast Lastwerte über 100 % – das ist bauartbedingt und kein Messfehler.'
    }, { type: 'heat' });
    cc.chart.xTitle = 'Drehzahl (min⁻¹)';
    cc.chart.yTitle = label(loadId) + ' (%)';
    cc.chart.setData({ heatData: d });
    page.appendChild(cc.node);
  }

  /* Zündwinkel über Last – Klopfbild */
  if (G.timing && load) {
    const sr = ds.stats.rpm, st = ds.stats.timing, sl = ds.stats[loadId];
    const cc = chartCard('Klopfbild: Motorlast × Zündwinkel', {
      hint: 'Punktfarbe = Drehzahl', height: 300,
      foot: 'Gesund ist ein mit der Drehzahl steigender Zündwinkel unter Volllast. Negative Werte bei niedriger Last sind normal (Katalysator-Heizen, Momenteneingriff beim Schalten) und werden in der Diagnose bewusst nicht bewertet – kritisch ist ausschließlich Rücknahme unter hoher Last bei hoher Drehzahl.'
    }, { type: 'scatter' });
    cc.chart.xTitle = label(loadId) + ' (%)';
    cc.chart.yTitle = 'Zündwinkel (°KW vor OT)';
    const rlo = sr ? sr.min : 600, rhi = sr ? sr.max : 6000;
    cc.chart.setData({ scatterData: {
      x: load, y: G.timing, n: ds.N, r: 1.5,
      xlo: Math.max(0, sl.min - 3), xhi: sl.max + 3, ylo: st.min - 2, yhi: st.max + 2,
      color: i => { const r = G.rpm ? G.rpm[i] : NaN;
        return !(r === r) ? 'rgba(140,150,170,.35)' : rampColor('speed', (r - rlo) / (rhi - rlo || 1)) + ''; }
    } });
    cc.node.querySelector('.card-b').appendChild(el('div', { class: 'ramp-row' },
      el('span', {}, fmt(rlo, 0) + ' min⁻¹'), el('div', { class: 'ramp', style: { background: rampCss('speed') } }),
      el('span', {}, fmt(rhi, 0) + ' min⁻¹')));
    page.appendChild(cc.node);
  }

  /* Gangerkennung */
  if (App.gears && App.gears.gears.length > 1) {
    const g = App.gears, sr = ds.stats.rpm, ss = ds.stats.speed_mix;
    const cc = chartCard('Gangerkennung: Geschwindigkeit × Drehzahl', {
      hint: fmt(g.coverage * 100, 0) + ' % der auswertbaren Punkte zugeordnet', height: 300,
      foot: 'Die Geraden sind aus den Daten selbst geschätzt, nicht aus einer Tabelle übernommen. Nummeriert wird nach Übersetzung, nicht nach Gangnummer – ob der kürzeste erkannte Gang wirklich der erste ist, lässt sich aus einer Fahrt ohne Anfahrten nicht sagen.'
    }, { type: 'scatter' });
    cc.chart.xTitle = 'Geschwindigkeit (km/h)';
    cc.chart.yTitle = 'Drehzahl (min⁻¹)';
    cc.chart.setData({ scatterData: {
      x: G.speed_mix, y: G.rpm, n: ds.N, r: 1.4,
      xlo: 0, xhi: ss.max * 1.05, ylo: 0, yhi: sr.max * 1.05,
      color: () => 'rgba(120,140,170,.42)'
    } });
    cc.chart.overlay = null;
    cc.chart.opts.type = 'scatter';
    const oldDraw = cc.chart.drawScatter.bind(cc.chart);
    cc.chart.drawScatter = function () {
      oldDraw();
      const ctx = this.ctx, X = this.xScale, Y = this.yScale, P = this.plot;
      ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
      g.gears.forEach((gr, i) => {
        const col = palette()[i % palette().length];
        ctx.beginPath();
        ctx.moveTo(X(0), Y(0));
        const vEnd = Math.min(X.hi, sr.max / gr.k);
        ctx.lineTo(X(vEnd), Y(gr.k * vEnd));
        ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '11px ' + FONT_MONO; ctx.fillStyle = col;
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        const lx = Math.min(X(vEnd) - 26, P.x + P.w - 30);
        ctx.fillText(gr.label, lx, Y(gr.k * X.inv(lx)) - 3);
      });
      ctx.restore();
    };
    cc.chart.draw();
    page.appendChild(cc.node);

    page.appendChild(card('Erkannte Übersetzungen', {
      hint: 'aus ' + fmt(g.usable, 0) + ' Messpunkten geclustert'
    }, el('div', { class: 'tblwrap' }, el('table', { class: 'tbl', style: { minWidth: '560px' } },
      el('thead', {}, el('tr', {}, ['Stufe', 'km/h je 1000 min⁻¹', 'Gesamtübersetzung', 'genutzt bei', 'max. Drehzahl', 'Zeit'].map(h => el('th', {}, h)))),
      el('tbody', {}, g.gears.map(x => el('tr', {},
        el('td', {}, x.label),
        el('td', { class: 'n' }, fmt(x.kmhPer1000, 1)),
        el('td', { class: 'n' }, x.ratio ? fmt(x.ratio, 2) : '–'),
        el('td', { class: 'n' }, fmt(x.vMin, 0) + '–' + fmt(x.vMax, 0) + ' km/h'),
        el('td', { class: 'n' }, fmt(x.rpmMax, 0)),
        el('td', { class: 'n' }, fmtDur(x.time)))))),
      g.spread.length ? el('p', { class: 'card-f', style: { padding: '10px 0 0', borderTop: 0 } },
        'Stufensprünge: ' + g.spread.map(x => fmt(x, 3)).join(' · ') +
        '. Zugrunde gelegter Abrollumfang: ' + fmt(App.profile.specs.rollCircum || store.get('rollCircum', 2.0), 3) +
        ' m (' + (App.profile.specs.tyre || 'in den Einstellungen änderbar') + ').') : null)));
  }

  /* Geschwindigkeit × Verbrauch */
  if (G.speed_mix && G.fuel_rate) {
    const bins = 28, ss = ds.stats.speed_mix;
    const hi = ss.max, lo = 0, w = (hi - lo) / bins;
    const fuel = new Float64Array(bins), dist = new Float64Array(bins), time = new Float64Array(bins);
    for (let i = 0; i < ds.N; i++) {
      const v = G.speed_mix[i], f = G.fuel_rate[i];
      if (!(v === v) || !(f === f) || v < 1) continue;
      const b = clamp(Math.floor((v - lo) / w), 0, bins - 1);
      fuel[b] += f / 3600 * ds.step; dist[b] += v / 3600 * ds.step; time[b] += ds.step;
    }
    const xs = [], ys = [];
    for (let b = 0; b < bins; b++) if (time[b] > 3 && dist[b] > 0.02) { xs.push(lo + (b + .5) * w); ys.push(fuel[b] / dist[b] * 100); }
    if (xs.length > 3) {
      const cc = chartCard('Verbrauchskurve über der Geschwindigkeit', {
        hint: 'je Geschwindigkeitsklasse: getankte Menge geteilt durch gefahrene Strecke', height: 240,
        foot: 'Anders als der Momentanverbrauch der App ist das eine echte, streckenbezogene Rechnung. Klassen mit unter drei Sekunden Verweildauer sind ausgelassen.'
      }, { type: 'timeseries', syncHover: false });
      const yv = Float64Array.from(ys), xv = Float64Array.from(xs);
      cc.chart.axes = [{ unit: 'L/100km', lo: 0, hi: Math.max.apply(null, ys) * 1.1, color: '#a1887f' }];
      cc.chart.setData({ series: [{ x: xv, y: yv, n: xv.length, color: '#a1887f', axis: 0, fill: true, label: 'Verbrauch', unit: 'L/100km' }],
        bands: null, xRange: [xv[0], xv[xv.length - 1]], xFormat: v => fmt(v, 0) + ' km/h' });
      legendItems(cc.legend, [{ color: '#a1887f', label: 'Verbrauch je Geschwindigkeitsklasse', unit: 'L/100km' }]);
      page.appendChild(cc.node);
    }
  }

  /* Ladelufttemperatur über Last */
  if (G.cac_mean && load) {
    const sc = ds.stats.cac_mean, sl = ds.stats[loadId];
    const cc = chartCard('Ladelufttemperatur × Motorlast', {
      hint: 'Punktfarbe = Zeit seit Fahrtbeginn (dunkel → hell)', height: 260,
      foot: 'Liegen die späten Punkte systematisch höher als die frühen, staut sich Wärme im Ladeluftkreis auf. Bei intakter Zusatzpumpe fallen die Punkte nach jeder Volllastphase wieder zurück.'
    }, { type: 'scatter' });
    cc.chart.xTitle = label(loadId) + ' (%)';
    cc.chart.yTitle = 'Ladelufttemperatur (°C)';
    cc.chart.setData({ scatterData: {
      x: load, y: G.cac_mean, n: ds.N, r: 1.5,
      xlo: Math.max(0, sl.min - 3), xhi: sl.max + 3, ylo: sc.min - 2, yhi: sc.max + 2,
      color: i => rampColor('thermal', i / ds.N)
    } });
    page.appendChild(cc.node);
  }

  /* Korrelationsmatrix */
  const corrIds = ['rpm', 'speed_mix', 'load_abs', 'boost', 'timing', 'fuel_rate', 'coolant', 'cac_mean', 'pedal', 'accel', 'power']
    .filter(id => G[id] && (ds.coverage[id] || 0) > 0.25);
  if (corrIds.length > 2) {
    const tbl = el('table', { class: 'tbl', style: { minWidth: (110 + corrIds.length * 62) + 'px' } });
    tbl.appendChild(el('thead', {}, el('tr', {}, el('th', {}, ''), corrIds.map(id => el('th', {}, short(id))))));
    const body = el('tbody', {});
    corrIds.forEach(a => {
      const tr = el('tr', {}, el('td', {}, short(a)));
      corrIds.forEach(b => {
        const r = a === b ? 1 : pearson(G[a], G[b]);
        const v = isFinite(r) ? r : 0;
        const bg = v > 0 ? 'rgba(52,211,153,' + (Math.abs(v) * .38).toFixed(3) + ')'
                         : 'rgba(248,113,113,' + (Math.abs(v) * .38).toFixed(3) + ')';
        tr.appendChild(el('td', { class: 'n', style: { background: a === b ? 'transparent' : bg } },
          a === b ? '·' : fmt(r, 2)));
      });
      body.appendChild(tr);
    });
    tbl.appendChild(body);
    page.appendChild(card('Korrelationsmatrix', {
      hint: 'Pearson-Koeffizient auf dem gemeinsamen Zeitraster',
      foot: 'Werte nahe ±1 bedeuten einen streng linearen Zusammenhang. Ein Wert von praktisch genau 1 zwischen zwei angeblich unabhängigen Größen verrät, dass eine davon in der App aus der anderen gerechnet wird.'
    }, el('div', { class: 'tblwrap' }, tbl)));
  }
};

/* --- Diagnose --- */
BUILDERS.diag = function (page) {
  const ds = App.ds, P = App.profile, sp = P.specs, t = App.diag.tally;

  page.appendChild(el('div', { class: 'grid kpis' },
    kpi('Unauffällig', String(t.ok), '', 'im Sollbereich', { accent: !t.crit && !t.warn }),
    kpi('Grenzwertig', String(t.warn), '', 'beobachten'),
    kpi('Auffällig', String(t.crit), '', t.crit ? 'Handlungsbedarf' : 'keine'),
    kpi('Nicht bewertbar', String(t.unklar), '', 'Fahrsituation fehlte'),
    kpi('PID fehlt', String(t.missing), '', 'nicht aufgezeichnet')));

  page.appendChild(noteBox(t.crit ? 'crit' : t.warn ? 'warn' : 'info',
    t.crit ? 'Es gibt auffällige Befunde' : t.warn ? 'Alles im Rahmen, einzelne Punkte beobachten' : 'Keine Auffälligkeiten',
    (t.crit
      ? t.crit + ' Prüfung(en) liegen außerhalb des Sollbereichs. '
      : t.warn
        ? 'Keine Prüfung liegt außerhalb des Sollbereichs; ' + t.warn + ' Wert(e) liegen im Grenzbereich. '
        : 'Alle ' + t.ok + ' auswertbaren Prüfungen liegen im Sollbereich. ') +
    (t.unklar + t.missing > 0
      ? t.unklar + t.missing + ' weitere Prüfungen konnten nicht bewertet werden – entweder fehlte die passende Fahrsituation oder die nötige PID. Das ist keine Entwarnung, sondern eine Wissenslücke.'
      : '')));

  const groups = {};
  App.diag.results.forEach(r => { (groups[r.group] = groups[r.group] || []).push(r); });
  Object.keys(groups).forEach(g => {
    page.appendChild(sectionHead(g));
    page.appendChild(el('div', { class: 'grid', style: { gap: '9px' } }, groups[g].map(findingCard)));
  });

  /* Fahrzeug-Steckbrief */
  const S2 = [];
  const add = (k, v) => { if (v !== undefined && v !== null && v !== '') S2.push(el('div', {}, el('span', {}, k), el('b', {}, v))); };
  add('Motor', P.engine);
  if (sp.displacement) add('Hubraum', fmt(sp.displacement, 0) + ' cm³');
  if (sp.bore) add('Bohrung × Hub', fmt(sp.bore, 1) + ' × ' + fmt(sp.stroke, 1) + ' mm');
  if (sp.compression) add('Verdichtung', fmt(sp.compression, 1) + ' : 1');
  if (sp.powerPS) add('Leistung', fmt(sp.powerPS, 0) + ' PS / ' + fmt(sp.powerKW, 0) + ' kW' + (sp.powerRpm ? ' bei ' + sp.powerRpm[0] + '–' + sp.powerRpm[1] + ' min⁻¹' : ''));
  if (sp.torqueNm) add('Drehmoment', fmt(sp.torqueNm, 0) + ' Nm' + (sp.torqueRpm ? ' bei ' + sp.torqueRpm[0] + '–' + sp.torqueRpm[1] + ' min⁻¹' : ''));
  if (sp.boostMaxBar) add('Ladedruck Werk', 'bis ' + fmt(sp.boostMaxBar, 2) + ' bar (' + fmt(sp.boostMaxBar * 14.5038, 1) + ' psi)');
  if (sp.redline) add('Drehzahlbegrenzer', '≈ ' + fmt(sp.redline, 0) + ' min⁻¹');
  if (sp.idleWarm) add('Leerlauf warm', sp.idleWarm[0] + '–' + sp.idleWarm[1] + ' min⁻¹');
  if (sp.coolantGreen) add('Kühlmittel Betrieb', sp.coolantGreen[0] + '–' + sp.coolantGreen[1] + ' °C' + (sp.thermostat ? ' · Thermostat ' + sp.thermostat + ' °C' : ''));
  if (sp.fuelSpec) add('Kraftstoff', sp.fuelSpec);
  if (sp.oilSpec) add('Motoröl', sp.oilSpec);
  if (sp.injection) add('Einspritzung', sp.injection);
  if (sp.ecu) add('Steuergerät', sp.ecu);
  if (sp.gearbox) add('Getriebe', sp.gearbox);
  if (sp.tyre) add('Bereifung', sp.tyre + ' · Abrollumfang ' + fmt(sp.rollCircum, 3) + ' m');
  if (sp.massKg) add('Leergewicht', fmt(sp.massKg, 0) + ' kg');
  if (sp.consNEDC) add('Verbrauch NEFZ', fmt(sp.consNEDC, 1) + ' L/100 km · CO₂ ' + fmt(sp.co2NEDC, 0) + ' g/km');
  if (sp.consReal) add('Verbrauch real', '≈ ' + fmt(sp.consReal, 1) + ' L/100 km (Flottenmittel)');
  if (sp.accel0100) add('0–100 km/h', fmt(sp.accel0100, 1) + ' s · Vmax ' + fmt(sp.vmax, 0) + ' km/h');
  page.appendChild(card('Hinterlegte Werksangaben · ' + P.name, {
    hint: 'Grundlage aller Sollbereiche',
    tools: el('button', { class: 'btn sm', onclick: () => go('settings') }, 'Profil wechseln')
  }, el('div', { class: 'specs' }, S2)));

  if (P.weakSpots && P.weakSpots.length) {
    page.appendChild(card('Bekannte Schwachstellen dieses Motors', {
      hint: 'und woran man sie in genau diesen Messwerten erkennt'
    }, el('ul', { class: 'weak' }, P.weakSpots.map(w =>
      el('li', {}, el('b', {}, w.t), el('span', {}, w.s))))));
  }
  if (P.extraPids && P.extraPids.length) {
    page.appendChild(card('Was der nächsten Aufzeichnung noch fehlt', {
      hint: 'diese PIDs in der OBD-App zusätzlich aktivieren'
    }, el('p', { style: { color: 'var(--text-2)', lineHeight: '1.65', margin: '0 0 10px' } },
        'Mit den folgenden Messgrößen ließen sich mehrere derzeit nicht bewertbare Prüfungen abschließen – insbesondere die Gemischdiagnose bleibt ohne Kurzzeit-Trim halbblind und der Ladedruck ohne echten Saugrohrdruck ein reiner Rechenwert.'),
      el('div', { class: 'chiprow' }, P.extraPids.map(p => el('span', { class: 'chip' }, p)))));
  }

  page.appendChild(noteBox('info', 'Wie diese Befunde zu lesen sind',
    'Jede Regel wertet nur ein klar umrissenes Fenster aus – etwa Volllast über 3000 min⁻¹ oder warmen Leerlauf ab fünf Sekunden. Fehlt dieses Fenster in der Fahrt, steht „nicht bewertbar" statt einer Ampel; das ist ehrlicher als ein Urteil auf dünner Datenbasis. Größen, die die App selbst rechnet statt misst (Ladedruck, Momentanleistung), bekommen bewusst keine Ampel: sie können ein Problem weder belegen noch ausschließen. Und der wichtigste Punkt: eine einzelne Fahrt ist eine Momentaufnahme. Aussagekraft entsteht erst im Vergleich mehrerer Aufzeichnungen desselben Fahrzeugs unter ähnlichen Bedingungen.'));
};

/* --- Datenqualität --- */
BUILDERS.data = function (page) {
  const ds = App.ds, m = ds.meta;
  page.appendChild(sectionHead('Datenqualität', 'Was tatsächlich in der Datei steht – bevor irgendetwas daraus geschlossen wird.'));

  page.appendChild(el('div', { class: 'grid kpis' },
    kpi('Datenzeilen', fmt(m.rows, 0), '', m.skipped ? fmt(m.skipped, 0) + ' übersprungen' : 'alle verwertet'),
    kpi('Messreihen', fmt(m.seriesCount, 0), '',
        Array.from(ds.metrics.values()).filter(x => x.derived).length + ' Größen zusätzlich berechnet'),
    kpi('Format', m.format === 'long' ? 'Long' : 'Wide', '', 'Trenner „' + m.delimiter + '" · Dezimal „' + m.decimal + '"'),
    kpi('Zeitbasis', { daysec: 'Tageszeit', epoch_s: 'Unix-Zeit', epoch_ms: 'Unix-Zeit (ms)', clock: 'Uhrzeit', date: 'Datum', relative: 'relativ' }[m.timeFormat] || m.timeFormat, '',
        fmtClock(ds.t0) + ' – ' + fmtClock(ds.t1)),
    kpi('GPS-Punkte', fmt(m.gpsPoints, 0), '', m.gpsSource ? 'aus „' + m.gpsSource + '"' : 'aus den Datenzeilen'),
    kpi('Auswerteraster', fmt(ds.step * 1000, 0), 'ms', fmt(ds.N, 0) + ' Stützstellen')));

  ds.notices.forEach(n => page.appendChild(noteBox(n.level, n.title, n.text)));

  /* Abdeckung */
  const T = ds.trip;
  if (T.unknownTime > ds.duration * 0.05) {
    page.appendChild(noteBox('warn', 'Nicht alle Messgrößen decken die ganze Fahrt ab',
      'Für ' + fmtDur(T.unknownTime) + ' der ' + fmtDur(ds.duration) + ' liegt keine Geschwindigkeit vor. OBD-Apps erweitern die PID-Auswahl mitunter mitten in der Sitzung, außerdem fällt GPS zeitweise aus. Alle geschwindigkeitsabhängigen Kennzahlen beziehen sich deshalb ausschließlich auf den abgedeckten Zeitraum – sie sind korrekt, aber nicht auf die volle Fahrtdauer hochgerechnet.'));
  }

  const rows = Array.from(ds.metrics.values()).sort((a, b) => (ds.coverage[b.id] || 0) - (ds.coverage[a.id] || 0));
  page.appendChild(card('Abdeckung und Herkunft je Messgröße', {
    hint: 'Anteil der Fahrtdauer mit gültigen Werten'
  }, el('div', { class: 'tblwrap' }, el('table', { class: 'tbl' },
    el('thead', {}, el('tr', {}, ['Messgröße', 'PID in der Datei', 'Einheit', 'Messpunkte', 'Rate', 'Erster Wert', 'Letzter Wert', 'Abdeckung'].map(h => el('th', {}, h)))),
    el('tbody', {}, rows.map(x => {
      const s = ds.stats[x.id];
      const cov = ds.coverage[x.id] || 0;
      return el('tr', {},
        el('td', {}, x.label,
          x.derived ? el('span', { class: 'badge mute', style: { marginLeft: '6px' } }, 'berechnet') : null,
          x.converted ? el('span', { class: 'badge info', style: { marginLeft: '6px' } }, 'umgerechnet') : null),
        el('td', { style: { color: 'var(--text-3)', fontSize: '11.5px' } }, x.rawName || '–'),
        el('td', { class: 'n' }, x.unit + (x.converted ? ' ← ' + x.srcUnit : '')),
        el('td', { class: 'n' }, s ? fmt(s.n, 0) : '–'),
        el('td', { class: 'n' }, s ? fmt(s.hz, 2) + ' Hz' : '–'),
        el('td', { class: 'n' }, s ? xFormatter()(x.t[0]) : '–'),
        el('td', { class: 'n' }, s ? xFormatter()(x.t[x.n - 1]) : '–'),
        el('td', {}, el('div', { style: { display: 'flex', alignItems: 'center', gap: '7px' } },
          el('div', { class: 'covbar' }, el('i', { style: { width: (cov * 100) + '%',
            background: cov > .8 ? 'var(--ok)' : cov > .4 ? 'var(--warn)' : 'var(--crit)' } })),
          el('span', { class: 'num', style: { fontSize: '11px', color: 'var(--text-3)' } }, fmt(cov * 100, 0) + ' %'))));
    }))))));

  if (ds.scoped.length) {
    page.appendChild(card('Kumulierte Zähler der App', {
      hint: 'Tages-, Wochen- und Gesamtwerte',
      foot: 'Diese Reihen sind bewusst ausgeblendet: sie zählen über Fahrten hinweg und lassen sich auf eine einzelne Fahrt nicht sinnvoll beziehen. Die Fahrt-Kennzahlen werden stattdessen aus den Rohgrößen neu gerechnet.'
    }, el('div', { class: 'chiprow' },
      ds.scoped.map(s => el('span', { class: 'chip' }, s.raw + ' · ' + fmt(s.s.n, 0) + ' Punkte')))));
  }

  if (ds.meta.gpsSources && ds.meta.gpsSources.length > 1) {
    page.appendChild(card('GPS-Quellen in der Datei', {
      hint: 'so viele eigenständige Positionen liefert jede PID-Zeile',
      foot: 'Ausgewertet wird nur die stärkste Quelle. Würde man alle mischen, entstünde ein Positions-Ping-Pong zwischen unterschiedlich alten Fixes – bei dieser Datei hätte das die Streckenlänge um ein Vielfaches überschätzt.'
    }, el('div', { class: 'chiprow' }, ds.meta.gpsSources.map((g, i) =>
      el('span', { class: 'chip', 'aria-pressed': i === 0 ? 'true' : 'false' }, g.source + ' · ' + fmt(g.points, 0))))));
  }

  page.appendChild(card('Export', { hint: 'alles lokal erzeugt, nichts wird übertragen' },
    el('div', { class: 'chiprow' },
      el('button', { class: 'btn', onclick: exportStatsCsv }, icon('dl'), 'Statistik als CSV'),
      el('button', { class: 'btn', onclick: exportReport }, icon('dl'), 'Diagnosebericht als Text'),
      el('button', { class: 'btn', onclick: exportJson }, icon('dl'), 'Kennzahlen als JSON'),
      ds.track ? el('button', { class: 'btn', onclick: exportGpx }, icon('dl'), 'Route als GPX') : null)));
};

/* --- Einstellungen --- */
BUILDERS.settings = function (page) {
  const ds = App.ds;
  const profSel = el('select', { class: 'sel', onchange: e => {
    const p = VEHICLE_PROFILES.find(x => x.id === e.target.value);
    if (p) { App.profile = p; store.set('profile', p.id); recompute(); }
  } }, VEHICLE_PROFILES.map(p => el('option', { value: p.id, selected: p.id === App.profile.id ? true : null }, p.name)));

  page.appendChild(card('Fahrzeugprofil', {
    hint: 'bestimmt alle Sollbereiche der Diagnose',
    foot: 'Automatisch vorgeschlagen wurde „' + (VEHICLE_PROFILES.find(p => p.id === autoProfile(ds)) || {}).name +
          '" – erkannt an zwei Zylinderbänken, zwei Ladeluftkühler-Sensoren, Lastwerten über 170 % und einer Höchstdrehzahl über 5800 min⁻¹.'
  }, el('div', { class: 'chiprow' }, profSel)));

  const themeSeg = el('div', { class: 'seg' },
    ['dark', 'light'].map(t => el('button', { type: 'button', 'aria-pressed': (store.get('theme', 'dark') === t) ? 'true' : 'false',
      onclick: e => { applyTheme(t); Array.from(e.target.parentNode.children).forEach(b => b.setAttribute('aria-pressed', b === e.target ? 'true' : 'false')); } },
      t === 'dark' ? 'Dunkel' : 'Hell')));
  const tileSel = el('select', { class: 'sel', onchange: e => { store.set('tiles', e.target.value); if (App.map) App.map.setServer(e.target.value); } },
    TILE_SERVERS.map(t => el('option', { value: t.id, selected: t.id === store.get('tiles', 'osm') ? true : null }, t.name)));
  page.appendChild(card('Darstellung', {},
    el('div', { class: 'chiprow', style: { alignItems: 'center' } },
      el('span', { class: 'dim', style: { fontSize: '12.5px' } }, 'Farbschema'), themeSeg,
      el('span', { class: 'dim', style: { fontSize: '12.5px', marginLeft: '10px' } }, 'Kartenstil'), tileSel)));

  const fuelSel = el('select', { class: 'sel', onchange: e => { store.set('fuel', e.target.value); recompute(); } },
    [['petrol', 'Benzin (2,37 kg CO₂/L)'], ['diesel', 'Diesel (2,65 kg CO₂/L)'], ['lpg', 'Autogas (1,64 kg CO₂/L)']]
      .map(([v, l]) => el('option', { value: v, selected: store.get('fuel', 'petrol') === v ? true : null }, l)));
  const circ = el('input', { class: 'inp', type: 'number', step: '0.001', min: '1.2', max: '3',
    value: String(App.profile.specs.rollCircum || store.get('rollCircum', 2.0)), style: { width: '110px' },
    onchange: e => { const v = parseFloat(e.target.value); if (v > 1.2 && v < 3) { store.set('rollCircum', v); App.profile.specs.rollCircum = v; recompute(); } } });
  page.appendChild(card('Rechenparameter', {
    foot: 'Der Abrollumfang geht ausschließlich in die Übersetzungsberechnung der Gangerkennung ein. Faustformel: Umfang ≈ π · (Zollmaß · 25,4 + 2 · Reifenbreite · Querschnitt / 100) in Millimetern.'
  }, el('div', { class: 'chiprow', style: { alignItems: 'center' } },
      el('span', { class: 'dim', style: { fontSize: '12.5px' } }, 'Kraftstoffart'), fuelSel,
      el('span', { class: 'dim', style: { fontSize: '12.5px', marginLeft: '10px' } }, 'Abrollumfang (m)'), circ)));

  page.appendChild(card('Über dieses Werkzeug', {},
    el('div', { style: { fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.7', display: 'grid', gap: '10px' } },
      el('p', {}, 'Eine einzelne HTML-Datei ohne Server, ohne Framework, ohne Tracking. Die CSV wird im Browser gelesen und verlässt das Gerät nicht. Einzige Netzwerkverbindung sind die Kartenkacheln – wer auch das vermeiden will, stellt den Kartenstil auf „Ohne Karte".'),
      el('p', {}, 'Diagramme, Karte, Statistik und Regelwerk sind eigenimplementiert. Große Dateien werden stückweise verarbeitet, damit die Oberfläche reagierbar bleibt; die Messreihen liegen als typisierte Arrays im Speicher statt als Objektlisten.'),
      el('p', {}, 'Die Diagnose ersetzt keine Werkstatt. Sie ordnet Messwerte in dokumentierte Sollbereiche ein, benennt die wahrscheinlichsten Ursachen und sagt ausdrücklich, wenn die Datenlage für ein Urteil nicht reicht.'))));
};

/* ---------- Exporte ---------- */
function exportStatsCsv() {
  const ds = App.ds;
  const head = ['Messgroesse', 'Einheit', 'PID', 'n', 'Min', 'p05', 'p25', 'Median', 'p75', 'p95', 'Max', 'Mittel_zeitgew', 'Stdabw', 'Abdeckung_%'];
  const lines = [head.join(';')];
  Array.from(ds.metrics.values()).forEach(m => {
    const s = ds.stats[m.id]; if (!s) return;
    lines.push([m.label, m.unit, m.rawName || '', s.n, s.min, s.p05, s.p25, s.median, s.p75, s.p95, s.max, s.meanW, s.std,
      ((ds.coverage[m.id] || 0) * 100).toFixed(1)]
      .map(v => typeof v === 'number' ? String(v).replace('.', ',') : String(v).replace(/;/g, ',')).join(';'));
  });
  download(baseName() + '_statistik.csv', 'text/csv;charset=utf-8', '﻿' + lines.join('\r\n'));
}
function exportJson() {
  const ds = App.ds;
  const out = {
    datei: App.fileName, format: ds.meta, fahrzeugprofil: App.profile.id,
    fahrt: ds.trip, phasen: ds.phases.time,
    ereignisse: { sprints: ds.events.sprints, volllast: ds.events.wot.length, stopps: ds.events.stops.length },
    gaenge: App.gears ? App.gears.gears : null,
    statistik: Object.fromEntries(Array.from(ds.metrics.values()).filter(m => ds.stats[m.id]).map(m => {
      const s = ds.stats[m.id];
      return [m.id, { label: m.label, einheit: m.unit, n: s.n, min: s.min, median: s.median,
                      mittel: s.meanW, p95: s.p95, max: s.max, stdabw: s.std, abdeckung: ds.coverage[m.id] }];
    })),
    diagnose: App.diag.results.map(r => ({ id: r.id, titel: r.title, gruppe: r.group, status: r.status,
      wert: isFinite(r.value) ? r.value : null, einheit: r.unit || null, soll: r.ref || null,
      aussagekraft: r.confidence, herkunft: r.provenance, text: r.text || r.note || null }))
  };
  download(baseName() + '_bericht.json', 'application/json', JSON.stringify(out, null, 2));
}
function exportGpx() {
  const tr = App.ds.track;
  const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const pts = [];
  for (let i = 0; i < tr.n; i++) {
    pts.push('   <trkpt lat="' + tr.lat[i].toFixed(7) + '" lon="' + tr.lon[i].toFixed(7) + '">' +
      (tr.alt ? '<ele>' + tr.alt[i].toFixed(1) + '</ele>' : '') + '</trkpt>');
  }
  const gpx = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="OBD Telemetrie Studio" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    ' <trk><name>' + esc(baseName()) + '</name><trkseg>\n' + pts.join('\n') + '\n </trkseg></trk>\n</gpx>';
  download(baseName() + '.gpx', 'application/gpx+xml', gpx);
}
function exportReport() {
  const ds = App.ds, T = ds.trip, P = App.profile;
  const L = [];
  L.push('DIAGNOSEBERICHT — ' + P.name);
  L.push('Aufzeichnung: ' + App.fileName);
  L.push('Zeitraum: ' + fmtClock(ds.t0) + ' – ' + fmtClock(ds.t1) + '  (' + fmtDur(ds.duration) + ')');
  L.push('');
  L.push('FAHRT');
  L.push('  Strecke              ' + fmt(T.dist, 2) + ' km (' + T.distSource + ')');
  L.push('  In Bewegung          ' + fmtDur(T.movingTime) + ', Stillstand ' + fmtDur(T.stoppedTime));
  L.push('  Ø / max. Tempo       ' + fmt(T.speedAvgMoving, 1) + ' / ' + fmt(T.speedMax, 0) + ' km/h');
  if (isFinite(T.consAvg)) L.push('  Verbrauch            ' + fmt(T.consAvg, 1) + ' L/100 km  (' + fmt(T.fuelUsed, 2) + ' L)');
  if (isFinite(T.rpmMax))  L.push('  Ø / max. Drehzahl    ' + fmt(T.rpmAvg, 0) + ' / ' + fmt(T.rpmMax, 0) + ' min⁻¹');
  L.push('');
  L.push('BEFUNDE');
  const label = { ok: 'UNAUFFAELLIG ', warn: 'GRENZWERTIG  ', crit: 'AUFFAELLIG   ', unklar: 'NICHT BEWERTB', missing: 'PID FEHLT    ' };
  App.diag.results.forEach(r => {
    L.push('');
    L.push('[' + label[r.status] + '] ' + r.title + '  (' + r.group + ')');
    if (isFinite(r.value)) L.push('  Messwert: ' + fmt(r.value, r.dec) + ' ' + (r.unit || '') + (r.ref ? '   Soll: ' + r.ref : ''));
    const txt = r.text || r.note || '';
    txt.replace(/(.{1,96})(\s|$)/g, (_, l) => { L.push('  ' + l.trim()); return ''; });
    if (r.action) r.action.forEach(a => L.push('  -> ' + a));
    L.push('  Aussagekraft: ' + r.confidence + ' · Herkunft: ' + r.provenance);
  });
  L.push('');
  L.push('Erzeugt mit OBD Telemetrie Studio. Ersetzt keine Werkstattdiagnose.');
  download(baseName() + '_diagnose.txt', 'text/plain;charset=utf-8', L.join('\n'));
}
function baseName() {
  return (App.fileName || 'fahrt').replace(/\.[^.]+$/, '').replace(/[^\wäöüÄÖÜß.\- ]+/g, '_');
}

/* ---------- Start ---------- */
(function init() {
  const saved = store.get('theme', null);
  applyTheme(saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  $('#theme').addEventListener('click', () =>
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

  const fileEl = $('#file');
  $('#pick').addEventListener('click', () => fileEl.click());
  $('#new-file').addEventListener('click', () => fileEl.click());
  fileEl.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f && $('#hero').hidden === false) loadFile(f);
  });

  /* Beispieldatei neben der HTML-Datei? */
  fetch('data/demo.csv', { method: 'HEAD' }).then(r => {
    if (!r.ok) return;
    const b = $('#demo'); b.hidden = false;
    b.addEventListener('click', async () => {
      b.disabled = true;
      const res = await fetch('data/demo.csv');
      const blob = await res.blob();
      loadFile(new File([blob], 'Beispielfahrt.csv'));
    });
  }).catch(() => {});

  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (!store.get('theme', null)) applyTheme(matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  });
  window.addEventListener('resize', debounce(() => { Chart.all.forEach(c => { c.resize(); c.draw(); }); if (App.map) { App.map.resize(); App.map.draw(); } }, 140));
})();
