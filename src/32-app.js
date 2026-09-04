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
  { id: 'overview', label: 'Überblick',    tab: 'Überblick', icon: 'gauge',  sub: 'Kennzahlen der Fahrt', data: true },
  { id: 'series',   label: 'Zeitreihen',   tab: 'Verlauf',   icon: 'chart',  sub: 'Messgrößen über die Zeit', data: true },
  { id: 'map',      label: 'Strecke',      tab: 'Karte',     icon: 'map',    sub: 'GPS-Route und Höhenprofil', data: true },
  { id: 'dist',     label: 'Verteilungen', tab: 'Verteilung',icon: 'bars',   sub: 'Histogramme und Statistik je Messgröße', data: true },
  { id: 'fields',   label: 'Kennfelder',   tab: 'Kennfeld',  icon: 'grid',   sub: 'Betriebspunkte, Klopfbild, Gangerkennung', data: true },
  { id: 'tyres',    label: 'Tacho & Reifen', tab: 'Tacho',    icon: 'wheel',  sub: 'Radsensor gegen GPS, Tempomat, Reifengröße', data: true },
  { id: 'diag',     label: 'Diagnose',     tab: 'Diagnose',  icon: 'stetho', sub: 'Messwerte gegen Werksangaben', data: true },
  { id: 'akte',     label: 'Fahrzeugakte', tab: 'Akte',      icon: 'table',  sub: 'Mehrere Fahrten desselben Fahrzeugs im Verlauf' },
  { id: 'buy',      label: 'Kaufcheck',    tab: 'Kaufcheck', icon: 'clip',   sub: 'Gebrauchtwagen prüfen — Sichtprüfung, Probefahrt, Messprotokoll' },
  { id: 'ai',       label: 'KI-Prompt',    tab: 'KI',        icon: 'ai',     sub: 'Auswertung als XML für ChatGPT, Claude und andere Sprachmodelle' },
  { id: 'data',     label: 'Datenqualität',tab: 'Daten',     icon: 'table',  sub: 'Abdeckung, Artefakte, Export', data: true },
  { id: 'settings', label: 'Einstellungen',tab: 'Einstellungen',  icon: 'cog',    sub: 'Fahrzeugprofil und Darstellung' }
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

/* ---------- Daten übernehmen ---------- */
function progressUI() {
  $('#prog').hidden = false;
  $('#drop').style.opacity = '.45';
  const old = $('#load-err'); if (old) old.remove();
  return (p, label) => {
    $('#prog-i').style.width = (clamp(p, 0, 1) * 100).toFixed(1) + '%';
    $('#prog-p').textContent = Math.round(clamp(p, 0, 1) * 100) + ' %';
    if (label) $('#prog-l').textContent = label;
  };
}
function loadFailed(e) {
  $('#prog').hidden = true;
  $('#drop').style.opacity = '';
  const old = $('#load-err'); if (old) old.remove();
  const box = el('div', { class: 'note crit', id: 'load-err', style: { marginTop: '18px', textAlign: 'left' } },
    icon('alert', 'n-i'), el('div', {}, el('b', {}, 'Das hat nicht geklappt'), e.message || String(e)));
  // Bei offener Auswertung ist der Startbildschirm versteckt – dort waere die Meldung
  // unsichtbar und der Nutzer bekaeme gar keine Rueckmeldung.
  if ($('#hero').hidden) {
    box.style.margin = '0 0 18px';
    const host = $('#pages') || $('#app');
    host.insertBefore(box, host.firstChild);
    box.scrollIntoView({ block: 'nearest' });
  } else $('#drop').appendChild(box);
  console.error(e);
}

/* Einziger Weg in die Auswertung. `src` ist eine Datei, Text, Bytes oder eine Adresse. */
async function ingest(src) {
  const setP = progressUI();
  try {
    let text, name = src.name || 'Messfahrt';

    if (src.kind === 'file') {
      name = src.file.name || name;
      setP(0.02, 'Datei wird gelesen …');
      await new Promise(r => setTimeout(r, 16));
      const head = new Uint8Array(await src.file.slice(0, 8).arrayBuffer());
      if (MAGIC.gzip(head) || MAGIC.zip(head) || MAGIC.zstd(head)) {
        setP(0.06, 'Archiv wird entpackt …');
        const r = await toCsvText(new Uint8Array(await src.file.arrayBuffer()), name);
        text = r.text; name = r.name || name;
      } else {
        text = await src.file.text();
      }
    } else if (src.kind === 'url') {
      setP(0.02, 'Datei wird geladen …');
      const bytes = await fetchCsv(src.url, p => setP(0.02 + p * 0.1, 'Datei wird geladen … ' + fmt(p * 100, 0) + ' %'));
      setP(0.12, 'Inhalt wird geprüft …');
      const r = await toCsvText(bytes, name);
      text = r.text; name = r.name || decodeURIComponent((src.url.split('/').pop() || name).split('?')[0]);
    } else {
      setP(0.04, 'Übergabe wird geprüft …');
      await new Promise(r => setTimeout(r, 16));
      const r = await toCsvText(src.kind === 'bytes' ? src.bytes : src.text, name);
      text = r.text; name = r.name || name;
    }

    App.fileName = name;
    App.vin = findVin(text);
    setP(0.14, 'Zeilen werden ausgewertet …');
    await new Promise(r => setTimeout(r, 16));
    const parsed = await parseCSV(text, (p, rows) =>
      setP(0.14 + p * 0.64, 'Zeilen werden ausgewertet … ' + fmt(rows, 0)));
    if (!parsed.series.size)
      throw new Error('In dieser Datei wurde keine einzige auswertbare Messreihe gefunden. Ist es wirklich ein OBD-CSV-Export?');
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
    if (location.hash || location.search) history.replaceState(null, '', location.pathname);
    if (App.importNote) { $('#pages').prepend(noteBox('ok', 'Beim Einlesen zusammengesetzt', App.importNote + '. Die Auswertung behandelt das als eine Fahrt.')); App.importNote = null; }
    // Direkt nach dem Import fragen, welches Fahrzeug das ist. Alles Weitere haengt daran.
    setTimeout(() => openVehicleDialog(), 120);
  } catch (e) { loadFailed(e); }
}
const loadFile = file => ingest({ kind: 'file', file });
/* Mehrere Dateien: CSV-Teile werden zusammengeführt, eine GPX-Datei ergänzt die Route. */
async function loadFiles(files) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return;
  if (list.length === 1) return loadFile(list[0]);
  const isGpx = f => /\.gpx$/i.test(f.name);
  const gpx = list.filter(isGpx), csv = list.filter(f => !isGpx(f));
  try {
    if (!csv.length) throw new Error('Eine GPX-Datei allein ergibt keine Auswertung – sie ergänzt eine CSV.');
    const texts = [];
    for (const f of csv) texts.push((await toCsvText(new Uint8Array(await f.arrayBuffer()), f.name)).text);
    let text = texts.length > 1 ? mergeCsvParts(texts).text : texts[0];
    let note = texts.length > 1 ? csv.length + ' CSV-Teile zusammengeführt' : '';
    if (gpx.length) {
      const pts = parseGpx(await gpx[0].text());
      if (!pts.length) throw new Error('In der GPX-Datei stehen keine Trackpunkte.');
      const firstNum = parseFloat((text.split(/\r?\n/)[1] || '').split(/[;,\t]/)[0].replace(/"/g, ''));
      const rel = isFinite(firstNum) && Math.abs(firstNum) < 86400 * 1.2;      // Sekunden seit Start statt Zeitstempel
      const t0 = rel && isFinite(pts[0].t) ? pts[0].t : 0;
      const rows = gpxToLongRows(pts, t0);
      text = text.replace(/\s*$/, '\n') + rows.join('\n') + '\n';
      note = (note ? note + ', ' : '') + pts.length + ' GPX-Punkte ergänzt';
    }
    App.importNote = note;
    await ingest({ kind: 'text', text, name: csv[0].name });
  } catch (e) { loadFailed(e); }
}

/* Zurück zum Startbildschirm — nötig, wenn während einer offenen Auswertung
   eine neue Übergabe hereinkommt. */
function resetToHero() {
  Chart.all.slice().forEach(c => c.destroy());
  Chart.hoverListeners = [];
  App.map = null; App.ds = null; App.diag = null; App.gears = null;
  $('#pages').innerHTML = '';
  $('#app').hidden = true;
  $('#hero').hidden = false;
  document.body.classList.add('no-data');
  $('#hand').hidden = true;
  $('#prog').hidden = true;
  $('#drop').style.opacity = '';
  const err = $('#load-err'); if (err) err.remove();
}

function rollCircumNow() {
  const own = store.get('rollCircum', null);
  return own > 1.2 && own < 3 ? own : (App.profile && App.profile.specs.rollCircum) || 2.0;
}
function initDataset(ds) {
  // Alles aus der vorherigen Datei verwerfen. Ohne das bleiben die bereits gebauten
  // Seiten im DOM stehen und zeigen beim Sektionswechsel die Messreihen der alten Datei,
  // waehrend App.ds laengst die neue ist.
  if (App.ds) {
    Chart.all.slice().forEach(c => c.destroy());
    Chart.hoverListeners = [];
    App.map = null;
    $('#pages').innerHTML = '';
  }
  App.ds = ds;
  const pid = store.get('profile', null) || autoProfile(ds);
  App.profile = profileById(pid) || defaultProfile();
  App.gears = computeGears(ds, rollCircumNow(), resolveGearbox(App.profile, rollCircumNow()),
                           resolveSpecs(App.profile).specs.redline);
  App.diag = runDiagnostics(ds, App.profile);
  App.range = [ds.t0, ds.t1];
  App.ts = ['rpm', 'speed_mix', 'boost'].filter(id => ds.G[id]);
  if (!App.ts.length) App.ts = [Array.from(ds.metrics.keys())[0]];
  App.mapMetric = ds.G.speed_mix ? 'speed_mix' : App.ts[0];
  App.limits = null; App.limitsStatus = null;
  $('#brand-sub').textContent = App.fileName.replace(/\.[^.]+$/, '');
  akteAutoSave();
  buildNav();
  go(SECTIONS.find(x => x.id === App.current && (!x.data || true)) ? App.current : 'overview', true);
}
/* Die Anwendung ohne geladene Aufzeichnung öffnen — für den Kaufcheck beim Besichtigungstermin. */
function openShell(section) {
  if (!App.profile) {
    const pid = store.get('profile', null);
    App.profile = profileById(pid) || defaultProfile();
  }
  $('#brand-sub').textContent = App.ds ? App.fileName.replace(/\.[^.]+$/, '') : 'Keine Aufzeichnung geladen';
  $('#hero').hidden = true;
  $('#app').hidden = false;
  document.body.classList.remove('no-data');
  buildNav();
  go(section || (App.ds ? 'overview' : 'buy'), true);
}

function recompute() {
  if (!App.ds) return;
  /* Alle bereits gebauten Seiten verwerfen, nicht nur die sichtbare. go() nimmt eine
     vorhandene Seite unveraendert aus dem DOM — nach einer Aenderung an Profil, Getriebe
     oder Abrollumfang zeigten die uebrigen Sektionen sonst weiter den alten Stand. */
  Chart.all.slice().forEach(c => c.destroy());
  Chart.hoverListeners = [];
  App.map = null;
  const pg = $('#pages'); if (pg) pg.innerHTML = '';
  App.gears = computeGears(App.ds, rollCircumNow(), resolveGearbox(App.profile, rollCircumNow()),
                           resolveSpecs(App.profile).specs.redline);
  App.diag = runDiagnostics(App.ds, App.profile);
  akteAutoSave();
  go(App.current, true);
}

/* ---------- Navigation ---------- */
function buildNav() {
  const nav = $('#nav'), tabs = $('#tabbar');
  nav.innerHTML = ''; tabs.innerHTML = '';
  const haveData = !!App.ds;
  const secs = SECTIONS.filter(s => !(s.data && !haveData));
  secs.forEach(s => {
    const bad = s.id === 'diag' && App.diag ? diagBadge() : null;
    nav.appendChild(el('button', { class: 'navitem', type: 'button', 'data-sec': s.id, onclick: () => go(s.id) },
      icon(s.icon), el('span', { class: 'lbl' }, s.label), bad));
  });
  /* Handy: vier feste Kanäle, der Rest liegt im Fach „Mehr“ – eine versteckte Scroll-Leiste ist keine Navigation */
  const prim = secs.filter(s => TAB_PRIMARY.includes(s.id)), rest = secs.filter(s => !TAB_PRIMARY.includes(s.id));
  prim.forEach(s => tabs.appendChild(el('button', { class: 'tabbtn', type: 'button', 'data-sec': s.id, onclick: () => go(s.id) },
    icon(s.icon), el('span', {}, s.tab || s.label))));
  if (rest.length) tabs.appendChild(el('button', { class: 'tabbtn', type: 'button', id: 'tab-more', 'aria-haspopup': 'true',
    onclick: () => toggleTabMore(rest) }, icon('more'), el('span', {}, 'Mehr')));
  $('#new-file-lbl').textContent = haveData ? 'Andere CSV' : 'CSV laden';
}
const TAB_PRIMARY = ['overview', 'series', 'diag', 'buy'];
function closeTabMore() { $$('.tabmore, .tabmore-bd').forEach(n => n.remove()); const m = $('#tab-more'); if (m) m.setAttribute('aria-expanded', 'false'); }
function toggleTabMore(rest) {
  if ($('.tabmore')) { closeTabMore(); return; }
  const bd = el('div', { class: 'tabmore-bd', onclick: closeTabMore });
  const box = el('div', { class: 'tabmore', role: 'menu' },
    ...rest.map(s => el('button', { type: 'button', role: 'menuitem', 'data-sec': s.id, onclick: () => go(s.id),
      'aria-current': App.current === s.id ? 'page' : null },
      icon(s.icon), el('span', {}, s.tab || s.label), s.id === 'diag' && App.diag ? diagBadge() : null)));
  document.body.append(bd, box);
  $('#tab-more').setAttribute('aria-expanded', 'true');
}
function diagBadge() {
  const t = App.diag.tally;
  if (t.crit) return el('span', { class: 'badge crit' }, String(t.crit));
  if (t.warn) return el('span', { class: 'badge warn' }, String(t.warn));
  return el('span', { class: 'badge ok', 'aria-label': 'alles unauffällig' }, icon('check'));
}

function go(id, force) {
  let sec = SECTIONS.find(s => s.id === id) || SECTIONS[0];
  if (sec.data && !App.ds) sec = SECTIONS.find(s => s.id === 'buy');
  id = sec.id;
  if (App.current === id && !force && $('#page-' + id)) {
    $$('#pages .page').forEach(p => p.hidden = p.id !== 'page-' + id);
  }
  App.current = id;
  $$('.navitem, .tabbtn').forEach(b =>
    b.getAttribute('data-sec') === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  closeTabMore();
  const more = $('#tab-more');
  if (more) {                                  /* liegt der Bereich im Fach, zeigt „Mehr“ seinen Namen und leuchtet */
    const inMore = !TAB_PRIMARY.includes(id);
    if (inMore) more.setAttribute('aria-current', 'page'); else more.removeAttribute('aria-current');
    more.querySelector('span').textContent = inMore ? (sec.tab || sec.label) : 'Mehr';
  }
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
function xFormatter() { return timeFormatterFor(App.ds); }
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
    ctx.fillStyle = themeVar('--surface-2', '#1f2327');
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
  add('Strecke', fmt(T.dist, 2), 'km', 'Quelle: ' + T.distSource +
    (T.distDisputed ? ' · Quellen uneinig' : '') +
    (T.gapDist > 0.05 ? ' · ' + fmt(T.gapDist, 1) + ' km Luftlinie über GPS-Lücken' : ''));
  add('Ø Geschwindigkeit', fmt(T.speedAvgMoving, 1), 'km/h', 'in Bewegung · gesamt ' + fmt(T.speedAvgTotal, 1) + ' km/h',
      { spark: sparkOf('speed_mix'), sparkColor: '#7aa4c4' });
  add('Höchstgeschwindigkeit', fmt(T.speedMax, 0), 'km/h', s.speed_mix ? 'bei ' + xFormatter()(s.speed_mix.tMax) : '');
  if (isFinite(T.consAvg)) add('Verbrauch', fmt(T.consAvg, 1), 'L/100km',
      App.profile.specs.consNEDC ? 'Werk NEFZ ' + fmt(App.profile.specs.consNEDC, 1) + ' L' : '');
  if (isFinite(T.fuelUsed)) add('Kraftstoff', fmt(T.fuelUsed, 2), 'L',
      isFinite(T.cost) ? fmt(T.cost, 2) + ' € · ' + fmt(T.pricePerL, 3) + ' €/L' : '');
  if (isFinite(T.co2)) add('CO₂', fmt(T.co2, 2), 'kg', fmt(T.co2PerKm, 0) + ' g/km');
  if (isFinite(T.rpmMax)) add('Höchstdrehzahl', fmt(T.rpmMax, 0), 'min⁻¹',
      App.profile.specs.redline ? fmt(T.rpmMax / App.profile.specs.redline * 100, 0) + ' % des Begrenzers' : '',
      { spark: sparkOf('rpm'), sparkColor: '#e06b62' });
  if (isFinite(T.rpmAvg)) add('Ø Drehzahl', fmt(T.rpmAvg, 0), 'min⁻¹', 'zeitgewichtet');
  if (isFinite(T.boostMax)) add('Ladedruck max.', fmt(T.boostMax, 2), 'bar',
      fmt(T.boostMax * 14.5038, 1) + ' psi' + (ds.boostDerived ? ' · Rechenwert' : ''));
  if (isFinite(T.loadMax)) add('Motorlast max.', fmt(T.loadMax, 0), '%', 'absolute Last');
  if (isFinite(T.coolantMax)) add('Kühlmittel max.', fmt(T.coolantMax, 0), '°C',
      'Start bei ' + fmt(T.coolantStart, 0) + ' °C', { spark: sparkOf('coolant'), sparkColor: '#e06b62' });
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
    const cc = chartCard('Fahrtverlauf', { hint: 'Geschwindigkeit und Drehzahl über die gesamte Fahrt', height: 210,
      info: {
        read: 'Waagerecht die Uhrzeit, senkrecht zwei Achsen: links die erste Messgröße, rechts die zweite. Farbig hinterlegte Streifen markieren Beschleunigung, Verzögerung, Schub und Stillstand. Lücken in der Linie bedeuten, dass für diesen Zeitraum keine Messwerte vorliegen — dort wird bewusst nichts durchgezogen.',
        good: 'Drehzahl und Geschwindigkeit laufen parallel; beim Schalten fällt die Drehzahl sprunghaft, die Geschwindigkeit nicht. Im Schub geht die Drehzahl mit dem Tempo zurück.',
        bad: 'Die Drehzahl steigt, ohne dass das Tempo folgt — das ist Schlupf: rutschende Kupplung, durchdrehendes Rad oder ein Getriebe, das die Kraft nicht überträgt. Beim Automatikkauf ist genau das der Blick, der sich lohnt.'
      } },
      { type: 'timeseries', syncHover: true });
    page.appendChild(cc.node);

  /* --- Wärmehaushalt: alle Temperaturen in einem Bild, Warmlaufzeit je Größe --- */
  {
    const T_IDS = [['coolant', 80], ['oil_temp', 80], ['trans_temp', 60], ['cac_mean', null], ['iat', null], ['ambient', null]].filter(([id]) => ds.G[id]);
    if (T_IDS.length >= 2) {
      const tc = chartCard('Wärmehaushalt', { height: 240, hint: 'Kühlmittel, Öl, Getriebe, Ladeluft und Außenluft über die Fahrt',
        info: { read: 'Alle Temperaturen auf einer Achse. Kühlmittel läuft voraus, Öl folgt mit Verzögerung, das Getriebe braucht am längsten. Die Tabelle nennt je Größe den Startwert, die Zeit bis zur Betriebstemperatur und das Niveau, auf dem sie sich einpendelt.',
                good: 'Kühlmittel nach 5–10 Minuten auf 85–95 °C und dort flach; Öl 10–20 °C darüber bei Last, Ladeluft nur wenige Grad über Außenluft.',
                bad: 'Kühlmittel, das nie flach wird oder unter 80 °C bleibt (Thermostat), Öl, das dem Kühlmittel nicht folgt (Ölkühler, Sensor), Ladeluft, die über Kilometer heiß bleibt (Ladeluftkühler).' } });
      page.appendChild(tc.node);
      requestAnimationFrame(() => drawTimeseries(tc, T_IDS.map(x => x[0]), [ds.t0, ds.t1], true));
      const rows = T_IDS.map(([id, thr]) => {
        const a = ds.G[id], m = ds.metrics.get(id);
        let first = NaN, tThr = NaN, k0 = -1;
        for (let k = 0; k < ds.N; k++) if (a[k] === a[k]) { first = a[k]; k0 = k; break; }
        if (thr !== null && first < thr) for (let k = k0; k < ds.N; k++) if (a[k] >= thr) { tThr = ds.grid[k] - ds.t0; break; }
        const tail = []; for (let k = Math.max(0, ds.N - Math.round(600 / ds.step)); k < ds.N; k++) if (a[k] === a[k]) tail.push(a[k]);
        tail.sort((p, q) => p - q);
        const st = ds.stats[id];
        return el('tr', {}, el('td', {}, m ? (m.short || m.label) : id),
          el('td', { class: 'n' }, isFinite(first) ? fmt(first, 0) : '–'),
          el('td', { class: 'n' }, thr === null ? '–' : isFinite(tThr) ? fmtDur(tThr) : (first >= thr ? 'schon warm' : 'nicht erreicht')),
          el('td', { class: 'n' }, tail.length ? fmt(tail[Math.floor(tail.length / 2)], 0) : '–'),
          el('td', { class: 'n' }, st ? fmt(st.max, 0) : '–'));
      });
      tc.node.querySelector('.card-b').appendChild(el('div', { class: 'tblwrap', style: { marginTop: '10px' } }, el('table', { class: 'tbl', style: { minWidth: '420px' } },
        el('thead', {}, el('tr', {}, el('th', {}, 'Größe'), el('th', {}, 'Start °C'), el('th', {}, 'bis Betriebstemperatur'), el('th', {}, 'letzte 10 min °C'), el('th', {}, 'Max °C'))),
        el('tbody', {}, ...rows))));
    }
  }
  /* --- Bremsen: Verzögerung, harte Bremsungen, Bremsweg-Schätzung --- */
  if (ds.G.accel && ds.G.speed_mix && s.accel) {
    if (!ds._events) ds._events = driveEvents(ds);
    const brakes = ds._events.filter(e => e.kind === 'brake');
    const aMin = s.accel.min;                                       // g, negativ
    const d100 = isFinite(aMin) && aMin < -0.05 ? Math.pow(100 / 3.6, 2) / (2 * Math.abs(aMin) * 9.81) : NaN;
    const decels = brakes.map(b => parseFloat(String(b.label).replace(/[^\d.,-]/g, '').replace(',', '.'))).filter(isFinite);
    let fading = null;
    if (decels.length >= 3) { const firstHalf = decels.slice(0, Math.floor(decels.length / 2)), second = decels.slice(Math.floor(decels.length / 2));
      const mean = a => a.reduce((p, q) => p + q, 0) / a.length; fading = mean(second) - mean(firstHalf); }   // positiv = spätere Bremsungen schwächer
    page.appendChild(card('Bremsen', { hint: 'aus dem Geschwindigkeitsverlauf – kein Bremsdruck, keine Bremsprüfstandswerte',
      info: { read: 'Verzögerung ist die negative Längsbeschleunigung aus der Geschwindigkeit. Harte Bremsungen sind Phasen unter −0,3 g über mindestens eine Sekunde. Der Bremsweg aus 100 km/h ist eine Rechnung mit der stärksten gemessenen Verzögerung, kein Messwert – auf trockener Straße schafft ein gesunder Wagen 0,9 bis 1,1 g und damit 35 bis 45 m.',
              good: 'Stärkste Verzögerung deutlich über 0,5 g bei einer Gefahrenbremsung; über mehrere harte Bremsungen bleibt sie gleich.',
              bad: 'Späte harte Bremsungen schwächer als frühe: das kann Fading sein (heiße Bremse), aber auch einfach vorsichtigeres Fahren. Bei einem Kaufcheck lohnt eine gezielte Bremsprobe aus 100 km/h.' } },
      el('div', { class: 'grid kpis' },
        kpi('Stärkste Verzögerung', fmt(Math.abs(aMin), 2), 'g', isFinite(d100) ? 'rechnerisch ' + fmt(d100, 0) + ' m Bremsweg aus 100 km/h' : ''),
        kpi('Harte Bremsungen', String(brakes.length), '', 'unter −0,3 g, mindestens 1 s'),
        kpi('Fading-Hinweis', fading === null ? '–' : (fading > 0.05 ? 'ja' : 'nein'), '', fading === null ? 'erst ab drei harten Bremsungen' : 'spätere Bremsungen ' + (fading > 0 ? 'schwächer' : 'nicht schwächer') + ' (' + (fading >= 0 ? '+' : '') + fmt(fading, 2) + ' g)')),
      brakes.length ? el('div', { class: 'tblwrap', style: { marginTop: '10px' } }, el('table', { class: 'tbl', style: { minWidth: '360px' } },
        el('thead', {}, el('tr', {}, el('th', {}, 'Zeit'), el('th', {}, 'Verzögerung'), el('th', {}, 'Ausgang'))),
        el('tbody', {}, ...brakes.slice(0, 10).map(b => el('tr', { style: { cursor: 'pointer' }, onclick: () => { Chart.emitHover(b.t, null); if (App.map) App.map.setMarkerTime(b.t); } },
          el('td', {}, b.time), el('td', { class: 'n' }, b.label.replace('Bremsung ', '')), el('td', {}, b.detail)))))) : null));
  }
    drawTimeseries(cc, ids, [ds.t0, ds.t1], true);
  }

  page.appendChild(card('Zeitbudget', { hint: 'Wie sich die Fahrtzeit auf die Betriebszustände verteilt',
    info: {
      read: 'Der Balken ist die gesamte Aufzeichnungsdauer. Jeder Abschnitt steht für einen Betriebszustand, seine Breite für dessen Zeitanteil. Schraffierte Bereiche sind Zeiträume ohne Geschwindigkeitsdaten — die zählen in keine geschwindigkeitsabhängige Kennzahl hinein.',
      good: 'Für eine aussagekräftige Diagnose braucht es Anteile in mehreren Zuständen: etwas Stillstand für den Leerlauf, längere Konstantfahrt für die Gemischkorrektur, mindestens einen Volllastzug.',
      bad: 'Besteht die Fahrt fast nur aus Konstantfahrt, bleiben viele Prüfungen „nicht bewertbar“ — nicht weil etwas defekt ist, sondern weil die passende Fahrsituation fehlte.'
    } }, phaseBar(ds)));

  /* Beschleunigungswerte */
  if (ds.events.sprints.length) {
    page.appendChild(card('Gemessene Beschleunigungswerte', {
      hint: 'automatisch aus dem Geschwindigkeitsverlauf erkannt',
      info: {
        read: 'Aus dem Geschwindigkeitsverlauf werden Abschnitte gesucht, in denen ohne Unterbrechung durchbeschleunigt wurde. Die Zeit wird zwischen den beiden Schwellen interpoliert, Phasen mit Zwischengas oder Rollen werden verworfen.',
        good: 'Werte in der Nähe der Werksangabe zeigen, dass die Leistung anliegt. Der Vergleich 60–100 gegen 80–120 verrät zusätzlich, ob der Motor oben herum nachlässt.',
        bad: 'Deutlich langsamer als das Werk bei warmem Motor und Vollgas: Leistungsverlust, Notlauf oder rutschendes Getriebe. Vorsicht bei der Deutung — Steigung, Zuladung, Gangwahl und Untergrund gehen ungefiltert ein, eine Messstrecke ersetzt das nicht.'
      }
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

  const cc = chartCard('Verlauf', { readout: true, height: 340, hint: 'Mausrad zoomt, Doppelklick setzt zurück',
    info: {
      read: 'Bis zu vier Messgrößen übereinander. Die ersten beiden Einheiten bekommen eine eigene Achse (links und rechts), weitere Reihen werden auf ihren eigenen Wertebereich gestreckt — deren absolute Höhe im Bild sagt dann nichts, nur der Verlauf. Fahren mit dem Zeiger zeigt oben die Werte an derselben Zeitstelle; die Karte springt mit.',
      good: 'Der eigentliche Nutzen liegt im Vergleich: zwei Größen übereinanderlegen und schauen, ob sie zusammenpassen. Ladelufttemperatur gegen Last, Zündwinkel gegen Drehzahl, Gemischkorrektur gegen Last.',
      bad: 'Reagiert eine Größe nicht, obwohl sie müsste — Ladedruck bleibt bei Vollgas flach, Kühlmitteltemperatur bewegt sich über die ganze Fahrt keinen Grad —, ist entweder der Sensor tot oder der Wert wird von der App nur gerechnet statt gemessen.'
    } },
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

  /* --- Anmerkungen und Ereignisse --- */
  let lastHover = null;
  const nk = notesKey(driveId(ds, App.fileName));
  const noteTime = el('span', { class: 'field dim', style: { minWidth: '150px' } }, 'Zeiger auf das Diagramm setzen');
  const noteInput = el('input', { class: 'inp', type: 'text', placeholder: 'z. B. hier hat es geruckelt', style: { flex: '1 1 220px', minWidth: '0' },
    onkeydown: e => { if (e.key === 'Enter') addNote(); } });
  const noteList = el('div', {});
  const evToggle = el('button', { class: 'chip', type: 'button', 'aria-pressed': store.get('showEvents', true) ? 'true' : 'false',
    onclick: () => { const v = !store.get('showEvents', true); store.set('showEvents', v); evToggle.setAttribute('aria-pressed', v ? 'true' : 'false'); update(); renderNotes(); } },
    'Ereignisse einblenden');
  function renderNotes() {
    noteList.innerHTML = '';
    const notes = sortNotes(store.get(nk, []));
    if (!notes.length) { noteList.appendChild(el('p', { class: 'dim2', style: { margin: '10px 0 0', fontSize: '12px' } }, 'Noch keine Anmerkung. Zeiger oder Finger auf die Stelle im Diagramm, Text eingeben, setzen.')); }
    else noteList.appendChild(el('div', { class: 'assist-list', style: { marginTop: '10px' } }, ...notes.map((n, i) =>
      el('div', { class: 'dtc-row' },
        el('button', { class: 'dtc-code', type: 'button', title: 'Im Diagramm zeigen', onclick: () => { Chart.emitHover(n.t, null); if (App.map) App.map.setMarkerTime(n.t); } }, xFormatter()(n.t)),
        el('div', { class: 'dtc-t', style: { flex: '1' } }, el('b', {}, n.text)),
        el('button', { class: 'btn icon sm ghost', type: 'button', 'aria-label': 'Anmerkung löschen', onclick: () => { const l = sortNotes(store.get(nk, [])); l.splice(i, 1); store.set(nk, l); renderNotes(); update(); akteAutoSave(); } }, icon('x'))))));
    if (store.get('showEvents', true)) {
      if (!ds._events) ds._events = driveEvents(ds);
      const kinds = {}; ds._events.forEach(e => { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
      noteList.appendChild(el('div', { class: 'legend', style: { marginTop: '10px' } }, ...Object.keys(kinds).map(k =>
        el('span', { class: 'li' }, el('b', { style: { color: EVENT_KINDS[k].color, fontWeight: '700' } }, EVENT_KINDS[k].code), EVENT_KINDS[k].label + ' (' + kinds[k] + ')'))));
    }
  }
  function addNote() {
    const text = noteInput.value.trim(); if (!text) { noteInput.focus(); return; }
    const t = lastHover !== null ? lastHover : (App.range[0] + App.range[1]) / 2;
    const l = sortNotes(store.get(nk, [])); l.push({ t, text }); store.set(nk, l);
    noteInput.value = ''; renderNotes(); update(); akteAutoSave();
  }
  page.appendChild(card('Anmerkungen und Ereignisse', {
    hint: 'eigene Marker an Zeitpunkten – landen in Akte und KI-Prompt',
    info: { read: 'Zeiger oder Finger auf die Stelle im Verlauf, Text eingeben, „Anmerkung setzen“. Die Anmerkung erscheint als gestrichelte Linie mit N im Verlauf und als Pin auf der Karte, wird mit der Fahrt in der Akte gespeichert und steht im KI-Prompt. Ereignisse erkennt das Werkzeug selbst: S Stopp, V Volllastzug, M gemessener Sprint, K Klopfregelung, B starke Bremsung, W Betriebswarm.',
            good: 'Eine Anmerkung „ruckelt beim Beschleunigen“ neben einem K-Marker ist die Art Zusammenhang, die aus Zahlen allein nie hervorgeht.',
            bad: 'Zu viele Marker verdecken die Kurve – Ereignisse lassen sich ausblenden.' }
  },
    el('div', { class: 'chiprow', style: { alignItems: 'center' } }, noteTime, noteInput,
      el('button', { class: 'btn', type: 'button', onclick: addNote }, 'Anmerkung setzen'), evToggle),
    noteList));
  renderNotes();

  Chart.onHover('series', x => {
    if (cc.readout.isConnected) updateReadout(cc.readout, x, App.ts);
    if (x !== null && x !== undefined) { lastHover = x; noteTime.textContent = 'Stelle: ' + xFormatter()(x); }
  });
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
  /* Sollbänder: grüner Bereich der Werksangabe hinter der Kurve, nur für Reihen mit eigener Achse */
  const bandColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-band').trim() || 'rgba(79,207,146,.10)';
  cc.chart.refBands = series.filter(s => s.axis >= 0).map(s => { const b = specBandFor(s.id, App.profile); return b ? { axis: s.axis, lo: b[0], hi: b[1], color: bandColor } : null; }).filter(Boolean);
  cc.chart.marks = whole ? [] : driveMarks(ds);
  cc.chart.setData({ series, bands, xRange: range, xFormat: xFormatter() });
  legendItems(cc.legend, series);
}

/* Marker für Verläufe und Karte: Anmerkungen immer, Ereignisse wenn eingeblendet */
function driveMarks(ds) {
  const notes = sortNotes(store.get(notesKey(driveId(ds, App.fileName)), []))
    .map(n => ({ t: n.t, kind: 'note', code: 'N', color: EVENT_KINDS.note.color, label: 'N · ' + (n.text.length > 22 ? n.text.slice(0, 21) + '…' : n.text), dashed: true, text: n.text }));
  if (!store.get('showEvents', true)) return notes;
  if (!ds._events) ds._events = driveEvents(ds);
  return notes.concat(ds._events.map(e => ({ t: e.t, kind: e.kind, code: e.code, color: e.color, label: e.code, text: e.label })))
    .sort((a, b) => a.t - b.t);
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
  sel.appendChild(el('option', { value: '__limits', selected: App.mapMetric === '__limits' ? true : null }, 'Tempolimit-Vergleich (OSM)'));
  const styleSel = el('select', { class: 'sel', onchange: e => { store.set('tiles', e.target.value); map.setServer(e.target.value); } },
    TILE_SERVERS.map(t => el('option', { value: t.id, selected: t.id === store.get('tiles', 'osm') ? true : null }, t.name)));

  const host = el('div', { class: 'chart-host map' });
  const readout = el('div', { class: 'map-readout' },
    el('div', { class: 'mr-hint' }, 'Auf die Route tippen oder mit dem Zeiger darüberfahren – hier stehen dann alle Messwerte dieser Stelle.'));
  host.appendChild(readout);
  const rampRow = el('div', { class: 'ramp-row' });
  const c = card('GPS-Route', {
    hint: 'Ziehen zum Verschieben, Mausrad oder zwei Finger zum Zoomen, Doppelklick passt an',
    tools: [sel, styleSel], flush: false,
    info: {
      read: 'Die gefahrene Strecke, eingefärbt nach der oben gewählten Messgröße — blau ist der niedrigste, rot der höchste Wert der Skala unter der Karte. Skalenenden sind das 5. und 95. Perzentil, damit einzelne Ausreißer nicht die ganze Route einfarbig machen. A ist der Start, B das Ende. Gestrichelte Abschnitte sind GPS-Lücken und als Luftlinie gerechnet. Antippen zeigt alle Messwerte an dieser Stelle.',
      good: 'Farbverläufe passen zur Umgebung: rot auf der Landstraße, blau im Ort, Übergänge an Ortsschildern und Kreuzungen.',
      bad: 'Springt die Farbe mitten auf gerader Strecke ohne erkennbaren Grund, stimmt entweder die Position nicht oder der Sensor liefert Aussetzer. Für die Ladelufttemperatur lohnt der Blick besonders: bleibt sie nach einem schnellen Abschnitt über Kilometer hoch, kühlt der Ladeluftkreis nicht ab.'
    }
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
    if (App.limits && App.limits.id === limId() && ti >= 0) {
      const r = App.limits.res, c = LIMIT_CAT_NAME[r.cat[ti]], L = r.lim[ti];
      const txt = c === 'noroad' ? 'keine Straße gefunden' : !(L === L) ? 'Limit unbekannt'
        : (L === Infinity ? 'kein Limit' : 'Limit ' + fmt(L, 0)) + (r.kind[ti] && r.kind[ti] !== 'none' ? ' · ' + KIND_LABEL[r.kind[ti]] : '');
      readout.appendChild(el('div', { class: 'mr-r' }, el('span', {}, 'Tempolimit'),
        el('b', { style: { color: catColor(c) } }, txt + (r.excess[ti] > 0 ? ' · +' + fmt(r.excess[ti], 0) : ''))));
    }
    if (gear) {
      const go = App.gears.gears.find(x => x.gear === gear);
      const named = App.gears.gearbox && (App.gears.gearbox.mode === 'table' || App.gears.gearbox.mode === 'count');
      readout.appendChild(el('div', { class: 'mr-r' },
        el('span', {}, named ? 'Gang' : 'Übersetzungsstufe'),
        el('b', {}, (go && go.label) || ('S' + gear))));
    }
  }
  map.onHover = t => { showAt(t); Chart.emitHover(t, null); };
  Chart.onHover('map', t => { if (readout.isConnected) showAt(t); });

  /* ---- Tempolimits aus OpenStreetMap ---- */
  const KIND_LABEL = { sign: 'Schild', urban: 'innerorts', rural: 'außerorts, implizit', none: 'unbegrenzt', unknown: 'unbekannt' };
  const CAT_LABEL = { ok: 'unter dem Limit', sign: 'über Limit (Schild / Ort)', implicit: 'über implizitem Limit', unsure: 'unsicher', noroad: 'keine Straße gefunden' };
  const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const catColor = c => c === 'ok' ? tok('--ok') : c === 'sign' ? tok('--crit') : c === 'implicit' ? tok('--warn') : c === 'unsure' ? tok('--accent') : 'rgba(150,160,180,.55)';
  const limId = () => driveId(ds, App.fileName);
  /* OBD-Geschwindigkeit, wo sie fehlt GPS – so wie speed_mix sie schon zusammenführt */
  const speedSource = () => ds.G.speed_mix ? ['speed_mix', ds.G.speed ? 'OBD-Geschwindigkeit (GPS, wo OBD fehlt)' : 'GPS-Geschwindigkeit'] : ds.G.speed ? ['speed', 'OBD-Geschwindigkeit'] : ds.G.speed_gps ? ['speed_gps', 'GPS-Geschwindigkeit'] : null;
  const limHost = el('div');
  page.appendChild(card('Tempolimits (OpenStreetMap)', {
    hint: 'gefahrene Geschwindigkeit gegen das Limit an der Straße',
    info: {
      read: 'Für jeden Streckenpunkt wird die nächste Straße aus OpenStreetMap gesucht (bis 30 m Abstand, Fahrtrichtung berücksichtigt) und ihr Tempolimit mit der gefahrenen Geschwindigkeit verglichen – ohne Toleranz: 59 km/h bei 50 sind über dem Limit. Rot heißt: das Limit gilt durch Schild oder Ortstafel. Gelb: außerorts gilt nur das allgemeine Limit ohne Schild. Blau: das Limit ist unbekannt, oder es gilt nur zu bestimmten Zeiten (etwa Mo–Fr 7–17 Uhr) und Datum oder Uhrzeit der Fahrt sind nicht bekannt.',
      good: 'Fast alles grün, Rot nur an kurzen Stellen, und die Liste unten nennt nachvollziehbare Orte.',
      bad: 'Viel Blau oder Grau heißt: OpenStreetMap kennt dort kein Limit oder die Position ist ungenau. Die Bewertung ist eine Hilfe zum Nachschauen, keine rechtliche Aussage – Schilder ändern sich, und OSM hinkt hinterher.'
    }
  }, limHost));
  function renderLimits() {
    limHost.innerHTML = '';
    const src = speedSource();
    if (App.limitsStatus) {
      const st = App.limitsStatus;
      if (st.error) {
        limHost.appendChild(el('div', { class: 'note crit', style: { marginBottom: '10px' } }, icon('alert', 'n-i'),
          el('div', {}, el('b', {}, 'Tempolimits konnten nicht geladen werden'), st.error)));
      } else {
        const secs = Math.round((Date.now() - st.started) / 1000);
        limHost.appendChild(el('div', { class: 'prog', style: { width: '100%' } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12.5px', color: 'var(--text-2)' } },
            el('span', {}, st.text), el('span', { class: 'num nowrap' }, (st.frac === null ? '' : fmt(st.frac * 100, 0) + ' % · ') + secs + ' s')),
          el('div', { class: 'prog-bar' + (st.frac === null ? ' indet' : '') },
            el('i', { style: { width: st.frac === null ? null : fmt(st.frac * 100, 0) + '%' } }))));
        return;
      }
    }
    if (!App.limits || App.limits.id !== limId()) {
      const pts = limitsThinTrack(tr).length;
      limHost.appendChild(el('div', { class: 'note info', style: { marginBottom: '10px' } },
        icon('info', 'n-i'),
        el('div', {}, el('b', {}, 'Dafür verlässt einmal die Route dein Gerät'),
          'Die auf ' + pts + ' Punkte ausgedünnte Strecke wird an die Overpass-API von OpenStreetMap geschickt, um die Tempolimits der befahrenen Straßen zu holen. Keine Messwerte, keine Zeiten, nur Koordinaten. Das Ergebnis bleibt im Browser gespeichert.')));
      const trimBox = el('input', { type: 'checkbox', checked: store.get('limitsTrim', true) ? true : null, onchange: e => store.set('limitsTrim', !!e.target.checked) });
      limHost.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center' } },
        el('button', { class: 'btn primary', type: 'button', disabled: src ? null : true, onclick: () => loadLimits(false) }, 'Tempolimits laden'),
        el('label', { class: 'field', style: { cursor: 'pointer' } }, trimBox, el('span', { class: 'dim' }, 'Start und Ziel weglassen (je 500 m)')),
        el('span', { class: 'dim2', style: { fontSize: '12px' } }, src ? 'Vergleich mit ' + src[1] : 'keine Geschwindigkeit in der Aufzeichnung')));
      return;
    }
    const { res, data } = App.limits;
    const km = m => fmt(m / 1000, 1) + ' km';
    const pct = m => res.total ? fmt(100 * m / res.total, 0) + ' %' : '–';
    const top = res.segments[0];
    limHost.appendChild(el('div', { class: 'grid kpis', style: { marginBottom: '12px' } },
      kpi('Über dem Limit', km(res.over), '', pct(res.over) + ' der Strecke', { accent: res.over > 0 }),
      kpi('Schild / innerorts', km(res.dist.sign), '', 'rot auf der Karte'),
      kpi('Implizit außerorts', km(res.dist.implicit), '', 'gelb: ohne Schild'),
      kpi('Unsicher', km(res.dist.unsure), '', 'blau: Limit, Zeitregel oder Tempo fehlt'),
      kpi('Größte Überschreitung', top ? '+' + fmt(top.exMax, 0) : '–', top ? 'km/h' : '',
        top ? fmt(top.vMax, 0) + ' km/h bei Limit ' + fmt(top.limit, 0) + (top.name ? ' · ' + top.name : '') : 'keine'),
      kpi('Straßen zugeordnet', String(res.waysUsed), '', km(res.dist.noroad) + ' ohne Straße im Umkreis')));
    const leg = el('div', { class: 'legend' });
    ['ok', 'sign', 'implicit', 'unsure', 'noroad'].forEach(c =>
      leg.appendChild(el('span', { class: 'li' }, el('i', { class: 'sw', style: { background: catColor(c), height: '10px', width: '10px', borderRadius: '50%' } }), CAT_LABEL[c])));
    limHost.appendChild(leg);
    if (res.segments.length) {
      const rows = res.segments.slice(0, 15).map(s => el('tr', { style: { cursor: 'pointer' }, onclick: () => { map.setMarkerTime(s.t0); showAt(s.t0); map.fit(); } },
        el('td', {}, xFormatter()(s.t0)),
        el('td', {}, (s.name || (s.highway ? s.highway : 'unbenannt'))),
        el('td', { class: 'n' }, el('span', { class: 'badge ' + (s.cat === 'sign' ? 'crit' : 'warn') }, fmt(s.limit, 0) + ' · ' + (KIND_LABEL[s.kind] || ''))),
        el('td', { class: 'n' }, fmt(s.vMax, 0)),
        el('td', { class: 'n' }, '+' + fmt(s.exMax, 0)),
        el('td', { class: 'n' }, fmt(s.dist / 1000, 2)),
        el('td', { class: 'n' }, fmtDur(s.t1 - s.t0))));
      limHost.appendChild(el('div', { class: 'tblwrap', style: { marginTop: '12px' } },
        el('table', { class: 'tbl' },
          el('thead', {}, el('tr', {}, el('th', {}, 'Zeit'), el('th', {}, 'Straße'), el('th', {}, 'Limit'), el('th', {}, 'Max km/h'), el('th', {}, 'Über'), el('th', {}, 'km'), el('th', {}, 'Dauer'))),
          el('tbody', {}, ...rows))));
    } else {
      limHost.appendChild(el('p', { class: 'dim', style: { margin: '12px 0 0' } }, 'Kein Abschnitt über dem Limit.'));
    }
    /* Was hätte das Limit gekostet */
    const speedArr = App.limits.src ? ds.G[App.limits.src[0]] : null;
    const consArr = ds.G.cons_calc || ds.G.cons_inst || null, accArr = ds.G.accel || null;
    if (speedArr && consArr && res.over > 0) {
      const curve = consumptionCurve(k => speedArr[k], k => consArr[k], accArr ? (k => accArr[k]) : null, ds.N);
      const bal = limitBalance(tr, res, curve);
      const price = ds.trip && isFinite(ds.trip.pricePerL) ? ds.trip.pricePerL : NaN;
      limHost.appendChild(el('div', { class: 'grid kpis', style: { marginTop: '12px' } },
        kpi('Zeitgewinn durch Überschreitungen', fmtDur(Math.max(0, bal.timeSavedS)), '', 'auf ' + fmt(bal.distOver / 1000, 1) + ' km über dem Limit'),
        kpi('Mehrverbrauch dabei', bal.distFuel > 0 ? (bal.fuelL >= 0 ? '+' : '') + fmt(bal.fuelL, 2) : '–', bal.distFuel > 0 ? 'L' : '',
          bal.distFuel > 0 ? (isFinite(price) ? '≈ ' + fmt(bal.fuelL * price, 2) + ' € · ' : '') + 'aus der Verbrauchskurve dieser Fahrt' : 'Verbrauchskurve reicht nicht'),
        kpi('Verbrauchskurve', curve.length ? curve.length + ' Klassen' : '–', '', curve.length ? curve.map(c => c.v + ': ' + fmt(c.cons, 1)).slice(0, 4).join(' · ') + (curve.length > 4 ? ' …' : '') + ' L/100km' : 'zu wenig ruhige Fahrt')));
    }
    limHost.appendChild(el('div', { class: 'chiprow', style: { marginTop: '12px', alignItems: 'center' } },
      el('button', { class: 'btn sm', type: 'button', onclick: () => { App.mapMetric = '__limits'; sel.value = '__limits'; paint(); host.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, 'Auf der Karte zeigen'),
      el('button', { class: 'btn sm ghost', type: 'button', onclick: () => loadLimits(true) }, 'Neu von OSM laden')));
    limHost.appendChild(el('p', { class: 'dim2', style: { fontSize: '11.5px', lineHeight: '1.5', margin: '10px 0 0' } },
      'Vergleich mit ' + (App.limits.src ? App.limits.src[1] : '–') + '; der Tacho zeigt etwa 3–5 % mehr als die OBD-Geschwindigkeit. Limits laut OpenStreetMap' +
      (data.osmDate ? ' (Stand ' + String(data.osmDate).slice(0, 10) + ')' : '') + ', ' + data.ways.length + ' Straßenabschnitte' + (data.chunks > 1 ? ' in ' + data.chunks + ' Abfragen' : '') + ' geladen. Ohne Toleranz gerechnet; Zuordnung bis 30 m. Keine rechtliche Bewertung.'));
  }
  const roadHost = el('div');
  const roadCard = card('Verbrauch je Straße', {
    hint: 'wo der Kraftstoff hingeht – aus Tempolimit-Zuordnung und Verbrauch',
    info: { read: 'Jeder Streckenpunkt ist einer Straße zugeordnet (aus dem Tempolimit-Abgleich). Der Verbrauch wird je Straße und je Straßenklasse aufsummiert: Ort, Landstraße, Autobahn. Grundlage ist der berechnete Momentanverbrauch aus Luftmasse oder Einspritzung; wo er fehlt, zählt die Strecke ohne Verbrauch.',
            good: 'Ort deutlich über Landstraße, Autobahn dazwischen – das ist normal. Eine einzelne Ortsdurchfahrt mit 20 L/100km ist meist Stop-and-go, kein Defekt.',
            bad: 'Landstraße auf Ortsniveau bei ruhiger Fahrt: entweder viel Beschleunigen oder etwas stimmt mit Gemisch oder Reibung nicht.' }
  }, roadHost);
  roadCard.hidden = true;
  page.appendChild(roadCard);
  function renderRoads() {
    roadHost.innerHTML = '';
    if (!App.limits || App.limits.id !== limId() || App.limits.partial) { roadCard.hidden = true; return; }
    const fr = ds.G.fuel_rate, cc = ds.G.cons_calc || ds.G.cons_inst;
    const fuelSeg = i => {
      const k0 = bisect(ds.grid, tr.t[i - 1]), k1 = bisect(ds.grid, tr.t[i]);
      if (k0 < 0 || k1 < 0) return NaN;
      if (fr) { let s = 0, n = 0; for (let k = k0; k <= k1; k++) if (fr[k] === fr[k]) { s += fr[k]; n++; } if (n) return s / n * (tr.t[i] - tr.t[i - 1]) / 3600; }
      if (cc) { let s = 0, n = 0; for (let k = k0; k <= k1; k++) if (cc[k] === cc[k]) { s += cc[k]; n++; } if (n) return s / n * (tr.dist[i] - tr.dist[i - 1]) / 100000; }
      return NaN;
    };
    const rc = roadConsumption(tr, App.limits.res, App.limits.data.ways, fuelSeg);
    if (!rc.classes.length || rc.totalFuel <= 0) { roadCard.hidden = true; return; }
    roadCard.hidden = false;
    roadHost.appendChild(el('div', { class: 'grid kpis' }, ...rc.classes.filter(c => c.dist > 200).map(c =>
      kpi(c.key, c.lPer100 === c.lPer100 ? fmt(c.lPer100, 1) : '–', c.lPer100 === c.lPer100 ? 'L/100km' : '',
        fmt(c.dist / 1000, 1) + ' km · ' + fmt(c.fuel, 2) + ' L (' + fmt(100 * c.fuel / rc.totalFuel, 0) + ' %)' + (c.kmh === c.kmh ? ' · ⌀ ' + fmt(c.kmh, 0) + ' km/h' : '')))));
    if (rc.roads.length) {
      roadHost.appendChild(el('div', { class: 'tblwrap', style: { marginTop: '12px' } }, el('table', { class: 'tbl', style: { minWidth: '460px' } },
        el('thead', {}, el('tr', {}, el('th', {}, 'Straße'), el('th', {}, 'Klasse'), el('th', {}, 'km'), el('th', {}, 'Liter'), el('th', {}, 'L/100km'), el('th', {}, '⌀ km/h'))),
        el('tbody', {}, ...rc.roads.slice(0, 12).map(r => el('tr', {},
          el('td', {}, r.name || r.key), el('td', {}, r.cls), el('td', { class: 'n' }, fmt(r.dist / 1000, 2)), el('td', { class: 'n' }, fmt(r.fuel, 2)),
          el('td', { class: 'n' }, r.lPer100 === r.lPer100 ? fmt(r.lPer100, 1) : '–'), el('td', { class: 'n' }, r.kmh === r.kmh ? fmt(r.kmh, 0) : '–')))))));
    }
  }
  function computeLimits(data) {
    const src = speedSource();
    const arr = src ? ds.G[src[0]] : null;
    const speedAt = i => { if (!arr) return NaN; const k = bisect(ds.grid, tr.t[i]); return k >= 0 ? arr[k] : NaN; };
    const res = matchTrackLimits(tr, data.ways, speedAt, limitsWhenFor(ds, App.fileName));
    App.limits = { id: limId(), data, res, src };
    if (!data.partial) App.limitsStatus = null;
    if (typeof renderRoads === 'function') renderRoads();
  }
  async function loadLimits(force) {
    const id = limId();
    const started = Date.now();
    const setStatus = (text, frac) => { App.limitsStatus = { text, frac: frac === undefined ? null : frac, started }; renderLimits(); };
    const paintNow = () => new Promise(r => setTimeout(r, 30));   // dem Browser Zeit zum Zeichnen geben
    const tick = setInterval(() => { if (App.limitsStatus && !App.limitsStatus.error && limHost.isConnected) renderLimits(); }, 1000);
    setStatus('Anfrage wird vorbereitet …', null);
    try {
      let data = force ? null : await limitsCacheGet(id);
      if (!data) {
        data = await fetchLimitWays(tr, (text, frac) => setStatus(text, frac),
          null, { trimM: store.get('limitsTrim', true) ? 500 : 0 });
        if (false) data = await fetchLimitWays(tr, (text, frac) => setStatus(text, frac),
          part => {                                   // nach jedem Abschnitt die Karte schon einfärben
            if (part.total > 1 && limHost.isConnected) {
              computeLimits({ ways: part.ways, partial: true });
              App.limits.partial = true;
              if (App.mapMetric !== '__limits') { App.mapMetric = '__limits'; sel.value = '__limits'; }
              paint();
            }
          });
        await limitsCachePut(id, data);
      } else setStatus('Aus dem Zwischenspeicher geladen', 0.6);
      setStatus('Ordne ' + fmt(tr.n, 0) + ' Streckenpunkte ' + data.ways.length + ' Straßenabschnitten zu …', 0.85);
      await paintNow();
      computeLimits(data);
      App.mapMetric = '__limits'; sel.value = '__limits'; paint();
    } catch (e) {
      App.limitsStatus = { error: ((e && e.message) || String(e)) + ' – später erneut versuchen; bei „Neu von OSM laden“ wird ein zweiter Server probiert.', started };
    }
    clearInterval(tick);
    renderLimits();
  }
  renderLimits();
  if (!App.limits || App.limits.id !== limId()) {
    limitsCacheGet(limId()).then(d => { if (d && limHost.isConnected) { computeLimits(d); renderLimits(); if (App.mapMetric === '__limits') paint(); } });
  }
  function paintLimits() {
    rampRow.innerHTML = '';
    if (!App.limits || App.limits.id !== limId()) {
      map.setTrack(tr, () => 'rgba(150,160,180,.55)');
      rampRow.appendChild(el('span', {}, 'Tempolimits noch nicht geladen – unten „Tempolimits laden“ drücken.'));
      return;
    }
    const res = App.limits.res;
    const COL = ['rgba(150,160,180,.55)', catColor('ok'), catColor('implicit'), catColor('sign'), catColor('unsure')];
    map.setTrack(tr, i => COL[res.cat[i]]);
    if (App.limits.partial) rampRow.appendChild(el('span', { class: 'dim2', style: { marginRight: '10px' } }, 'wird abschnittsweise geladen – grau ist noch nicht abgefragt'));
    ['ok', 'sign', 'implicit', 'unsure', 'noroad'].forEach(c =>
      rampRow.appendChild(el('span', { class: 'li', style: { display: 'inline-flex', alignItems: 'center', gap: '5px', marginRight: '10px' } },
        el('i', { style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: catColor(c) } }), CAT_LABEL[c])));
  }
  /* Marker: Ereignisse und Anmerkungen als Pins */
  const pinRow = el('div', { class: 'legend' });
  c.appendChild(pinRow);
  function paintPins() {
    pinRow.innerHTML = '';
    const marks = driveMarks(ds);
    const pins = marks.map(m => { const ti = bisect(tr.t, m.t); return ti >= 0 && ti < tr.n ? { lat: tr.lat[ti], lon: tr.lon[ti], color: m.color, code: m.code, label: m.text } : null; }).filter(Boolean);
    map.setPins(pins);
    const kinds = {}; marks.forEach(m => { kinds[m.kind] = (kinds[m.kind] || 0) + 1; });
    const tg = el('button', { class: 'chip', type: 'button', style: { minHeight: '26px', padding: '2px 9px' }, 'aria-pressed': store.get('showEvents', true) ? 'true' : 'false',
      onclick: () => { store.set('showEvents', !store.get('showEvents', true)); paintPins(); } }, 'Ereignisse');
    pinRow.appendChild(tg);
    Object.keys(kinds).forEach(k => pinRow.appendChild(el('span', { class: 'li' }, el('b', { style: { color: EVENT_KINDS[k].color, fontWeight: '700' } }, EVENT_KINDS[k].code), EVENT_KINDS[k].label + ' (' + kinds[k] + ')')));
  }
  /* --- Zeitraffer: Marker über die Fahrt laufen lassen --- */
  {
    let timer = null, pos = ds.t0, speedFactor = 60;
    const label = el('span', { class: 'dim', style: { minWidth: '96px' } }, xFormatter()(ds.t0));
    const slider = el('input', { type: 'range', min: String(ds.t0), max: String(ds.t1), step: String(Math.max(1, ds.step)), value: String(ds.t0), style: { flex: '1 1 200px' },
      oninput: e => { pos = +e.target.value; show(); } });
    const btn = el('button', { class: 'btn', type: 'button', onclick: () => toggle() }, 'Abspielen');
    const fac = el('select', { class: 'sel', onchange: e => { speedFactor = +e.target.value; } },
      [10, 30, 60, 120, 300].map(f => el('option', { value: String(f), selected: f === 60 ? true : null }, f + '×')));
    const show = () => { label.textContent = xFormatter()(pos); map.setMarkerTime(pos); showAt(pos); Chart.emitHover(pos, null); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } btn.textContent = 'Abspielen'; };
    const toggle = () => {
      if (timer) return stop();
      if (pos >= ds.t1 - ds.step) pos = ds.t0;
      btn.textContent = 'Anhalten';
      timer = setInterval(() => {
        pos += ds.step * speedFactor / 10;
        if (pos >= ds.t1) { pos = ds.t1; slider.value = String(pos); show(); stop(); return; }
        slider.value = String(pos); show();
      }, 100);
    };
    /* Als Pseudo-Diagramm registrieren, damit der Lauf beim Seitenwechsel endet */
    Chart.all.push({ destroy: stop, resize: () => {}, draw: () => {}, setExternalHover: () => {}, host: host, opts: {} });
    page.appendChild(card('Fahrt nacherleben', {
      hint: 'Marker auf Karte und Zeiger in den Verläufen laufen mit',
      info: { read: 'Der Regler setzt den Zeitpunkt, „Abspielen“ lässt ihn laufen. Der Faktor sagt, wie viel schneller als in Echtzeit: 60× heißt eine Minute Fahrt je Sekunde. Karte, Messfenster und alle Verläufe zeigen denselben Moment.',
              good: 'Um eine Auffälligkeit im Zusammenhang zu sehen: wo war das Auto, was tat der Motor, wie war die Straße.',
              bad: 'Bei sehr langen Fahrten lieber erst den Zeitbereich in den Zeitreihen einschränken.' }
    }, el('div', { class: 'chiprow', style: { alignItems: 'center' } }, btn, slider, label, el('span', { class: 'field' }, el('span', { class: 'dim' }, 'Tempo'), fac))));
  }

  /* --- Wiederkehrende Abschnitte --- */
  {
    const segs = repeatSegments(tr);
    const rHost = el('div');
    if (!segs.length) rHost.appendChild(emptyBox('Kein Abschnitt mehrfach befahren',
      'Diese Fahrt kommt an keiner Stelle ein zweites Mal vorbei. Auf Pendelstrecken, Runden oder Hin- und Rückweg findet die Auswertung hier die Durchfahrten und vergleicht sie.'));
    else {
      rHost.appendChild(el('div', { class: 'tblwrap' }, el('table', { class: 'tbl', style: { minWidth: '520px' } },
        el('thead', {}, el('tr', {}, el('th', {}, 'Abschnitt'), el('th', {}, 'Durchfahrten'), el('th', {}, 'Länge'), el('th', {}, 'schnellste'), el('th', {}, 'Spanne'), el('th', {}, '⌀ km/h'))),
        el('tbody', {}, ...segs.map((s, i) => el('tr', { style: { cursor: 'pointer' }, onclick: () => { map.setMarkerTime(s.best.t0); showAt(s.best.t0); } },
          el('td', {}, 'Abschnitt ' + (i + 1)),
          el('td', { class: 'n' }, String(s.laps.length)),
          el('td', { class: 'n' }, fmt(s.lengthM / 1000, 2) + ' km'),
          el('td', { class: 'n' }, fmtDur(s.best.dur) + ' · ' + xFormatter()(s.best.t0)),
          el('td', { class: 'n' }, '±' + fmtDur(s.spreadS)),
          el('td', { class: 'n' }, fmt(s.best.kmh, 0))))))));
    }
    page.appendChild(card('Wiederkehrende Abschnitte', {
      hint: 'Stellen, an denen du mehrfach vorbeigekommen bist',
      info: { read: 'Die Route wird in ein 60-Meter-Raster gelegt; Zellen mit mehreren Besuchen ergeben Abschnitte. Für jede Durchfahrt stehen Dauer und Durchschnittstempo. Eine Zeile anklicken setzt die Marke auf die schnellste Durchfahrt.',
              good: 'Auf der Pendelstrecke oder einer Runde lässt sich so vergleichen, wie unterschiedlich dieselbe Strecke gefahren wurde.',
              bad: 'Ampeln und Verkehr bestimmen die Zeit stärker als der Motor – das ist kein Leistungsvergleich.' }
    }, rHost));
  }

  requestAnimationFrame(() => { map.resize(); paint(); paintPins(); map.fit(); });

  function paint() {
    if (App.mapMetric === '__limits') { paintLimits(); return; }
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
  { const dn = distDisputeNote(ds); if (dn) page.appendChild(dn); }
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
      fmtDur(maxOf(tr.gaps.map(g => g.dt))) + ' und überbrückt ' +
      fmt(maxOf(tr.gaps.map(g => g.d)) / 1000, 1) + ' km. Diese Abschnitte sind gestrichelt gezeichnet und als Luftlinie gerechnet – die tatsächlich gefahrene Strecke ist also eher länger als die angegebene.'));
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
      info: {
        read: 'Waagerecht die zurückgelegte Strecke, senkrecht die GPS-Höhe, geglättet über elf Messpunkte. Die Höhe stammt vom GPS-Empfänger, nicht von einem Luftdrucksensor.',
        good: 'Bei echten Höhenunterschieden ab etwa 50 m ist der Verlauf brauchbar und erklärt Verbrauchs- und Lastunterschiede zwischen Hin- und Rückweg.',
        bad: 'Ist die gesamte Spanne kleiner als rund 30 m, sieht man fast nur GPS-Rauschen. Das Profil dann nicht als Topografie lesen — die senkrechte Achse ist in diesem Fall stark überhöht.'
      },
      foot: span < 30 ? 'Die Höhenspanne beträgt nur ' + fmt(span, 1) + ' m. In dieser Größenordnung ist das GPS-Signal überwiegend Rauschen – das Profil ist nicht als Topografie zu lesen.' : null
    }, { type: 'timeseries', syncHover: false });
    page.appendChild(cc.node);
    const alt = smooth(tr.alt, 11);
    cc.chart.axes = [{ unit: 'm', lo: minOf(alt) - 1, hi: maxOf(alt) + 1, color: '#a5d6a7' }];
    cc.chart.opts.onZoom = null;
    cc.chart.setData({
      series: [{ x: tr.dist, y: alt, n: tr.n, color: '#7cb342', axis: 0, fill: true, label: 'Höhe', unit: 'm' }],
      bands: null, xRange: [0, tr.totalDist], xFormat: v => fmt(v / 1000, 1) + ' km'
    });
    legendItems(cc.legend, [{ color: '#7cb342', label: 'Höhe über Strecke', unit: 'm' }]);
  }
};

/* Erklärtexte je Messgröße für die Verteilungsdiagramme */
const HIST_INFO = {
  rpm: { good: 'Ein hoher Balken im unteren Bereich ist normal – dort läuft der Motor die meiste Zeit. Der Ausläufer nach rechts zeigt, wie weit gedreht wurde.',
         bad: 'Fehlt der Ausläufer ganz, wurde bei der Aufzeichnung nie richtig gedreht. Dann bleiben alle Volllast-Prüfungen ohne Grundlage.' },
  speed_mix: { good: 'Mehrere Häufungen entsprechen den gefahrenen Straßentypen: Ortsdurchfahrt, Landstraße, Autobahn.',
               bad: 'Ein einzelner sehr hoher Balken bei null heißt viel Standzeit – für die Motordiagnose gut (Leerlauf), für Verbrauchsvergleiche schlecht.' },
  load_abs: { good: 'Beim aufgeladenen Motor reicht die Verteilung über 100 % hinaus. Das ist bauartbedingt und kein Messfehler.',
              bad: 'Endet sie bei einem Turbo- oder Kompressormotor deutlich unter 130 %, wurde entweder nie Vollgas gefahren – oder das Steuergerät begrenzt die Leistung.' },
  boost: { good: 'Der Schwerpunkt liegt nahe null (Teillast), der rechte Ausläufer zeigt den erreichten Spitzenladedruck.',
           bad: 'Erreicht der rechte Rand den Werkswert nicht, obwohl Vollgas gefahren wurde: Riemen, Lader, Ladeluftstrecke oder Notlauf prüfen.' },
  timing: { good: 'Ein breiter Bereich mit viel Frühzündung zeigt, dass das Steuergerät den Zündwinkel freigibt.',
            bad: 'Häuft sich die Verteilung nahe null oder darunter, arbeitet dauerhaft die Klopfregelung. Welche Last dabei anlag, zeigt erst das Klopfbild unter „Kennfelder“.' },
  coolant: { good: 'Ein schmaler, hoher Balken im Betriebsbereich: das Thermostat regelt sauber.',
             bad: 'Eine breite Verteilung oder zwei Häufungen deuten auf ein hängendes Thermostat oder auf eine Aufzeichnung, die mitten im Warmlauf begann.' },
  cac_mean: { good: 'Der Schwerpunkt liegt nahe der Außentemperatur, ein kurzer Ausläufer nach rechts stammt von den Volllastphasen.',
              bad: 'Liegt der Schwerpunkt weit über der Außentemperatur, kühlt der Ladeluftkreis dauerhaft nicht ab.' },
  ltft_b1: { good: 'Ein schmaler Bereich innerhalb ±5 %.', bad: 'Ein breiter Bereich oder ein Schwerpunkt jenseits ±5 % – die Ursache klärt die Aufteilung nach Last im Diagnose-Bereich.' },
  ltft_b2: { good: 'Ein schmaler Bereich innerhalb ±5 %.', bad: 'Deutliche Abweichung gegenüber Bank 1 spricht für einen einseitigen Fehler.' },
  accel: { good: 'Symmetrisch um null mit Ausläufern in beide Richtungen: normales Beschleunigen und Bremsen.',
           bad: 'Werte jenseits ±1 g sind bei einem Straßenfahrzeug keine echte Beschleunigung, sondern Sensor- oder GPS-Artefakte.' },
  cons_calc: { good: 'Ein Schwerpunkt im einstelligen bis unteren zweistelligen Bereich.',
               bad: 'Sehr hohe Werte stammen fast immer aus Phasen mit sehr niedrigem Tempo. Für den Fahrtverbrauch zählt allein die Kachel im Überblick.' },
  power: { good: 'Der weit überwiegende Teil liegt bei kleiner Leistung – so wird ein Auto im Alltag bewegt.',
           bad: 'Der Spitzenwert dieser Größe wird von der App aus dem Kraftstofffluss geschätzt und überschätzt systematisch. Als Absolutwert nicht verwendbar, nur der Verlauf zählt.' }
};
function histInfo(m) {
  const extra = HIST_INFO[m.id];
  return {
    read: 'Waagerecht der Wertebereich von ' + m.label + ', senkrecht die Zeit, die der Motor in diesem Bereich betrieben wurde – nicht die Anzahl der Messpunkte. So verzerren unterschiedliche Abtastraten das Bild nicht.',
    good: extra ? extra.good : 'Wo der Balken hoch ist, lief der Motor lange. Für die Diagnose zählt vor allem, ob der Bereich überhaupt erreicht wurde.',
    bad: extra ? extra.bad : 'Fehlt ein Wertebereich ganz, kann die Diagnose über ihn nichts sagen – das ist eine Datenlücke, kein Befund.'
  };
}

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
      hint: fmt(st.min, m.decimals) + ' – ' + fmt(st.max, m.decimals) + ' ' + m.unit, height: 168, legend: false,
      info: histInfo(m)
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
    info: {
      read: 'p05 und p95 sind die Werte, unter denen 5 % beziehungsweise 95 % aller Messpunkte liegen. Sie sind robuster als Minimum und Maximum, die ein einzelner Ausreißer bestimmt. Der Mittelwert ist zeitgewichtet: jeder Messpunkt zählt mit der Dauer bis zum nächsten, damit Messpausen ihn nicht verfälschen.',
      good: 'Für Vergleiche zwischen zwei Fahrten sind Median und p95 die belastbaren Größen.',
      bad: 'Liegen Minimum oder Maximum weit außerhalb von p05 und p95, ist der Extremwert ein einzelner Ausreißer und kein Betriebszustand. σ ist die Standardabweichung – bei der Leerlaufdrehzahl das Maß für die Laufruhe.'
    },
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
      info: {
        read: 'Das Kennfeld wird in Zellen zerlegt; die Farbe zeigt, wie lange der Motor in jeder Zelle betrieben wurde — dunkelblau kurz, gelb bis rot lange. Die Skala ist logarithmisch, sonst würde der Leerlauf alles andere überstrahlen.',
        good: 'Ein klarer heller Kern im unteren Drehzahlbereich ist normal: dort läuft der Motor die meiste Zeit. Ein aufgeladener Motor erreicht bei Volllast Lastwerte über 100 %, ein Sauger bleibt darunter — beides ist bauartbedingt.',
        bad: 'Aussagekräftig wird das Bild erst durch das, was fehlt. Reicht die Wolke nie in den oberen rechten Bereich, wurde bei der Aufzeichnung nie richtig Last gefahren — dann fehlt die Grundlage für die Volllast-Prüfungen, und die Diagnose kann über Lader, Zündung und Ladeluftkühlung nichts sagen.'
      },
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
      info: {
        read: 'Jeder Punkt ist ein Messzeitpunkt: waagerecht die Motorlast, senkrecht der Zündwinkel vor dem oberen Totpunkt, die Farbe ist die Drehzahl (blau niedrig, rot hoch). Positive Werte heißen Frühzündung, negative Spätzündung. Interessant ist nur der rechte Bildrand — die hohe Last.',
        good: 'Bei hoher Last steigt der Zündwinkel mit der Drehzahl an, die roten Punkte liegen also höher als die grünen. Das ist das normale Muster eines gesunden aufgeladenen Motors. Im Teillastbereich links gibt das Steuergerät viel Frühzündung frei, oft über 30° — auch das ist ein gutes Zeichen.',
        bad: 'Negative Zündwinkel bei hoher Last und hoher Drehzahl, also rote Punkte unten rechts: das ist echte Klopfregelung. Ursachen in dieser Reihenfolge: zu niedrigoktaniger Kraftstoff, zu heiße Ladeluft, verkokte Brennräume, alte Zündkerzen. Negative Werte links bei niedriger Last sind dagegen normal (Katalysator-Heizen und Momenteneingriff beim Schalten) und werden in der Diagnose bewusst nicht bewertet.'
      },
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
      info: {
        read: 'Bei geschlossenem Kraftschluss ist das Verhältnis Drehzahl zu Geschwindigkeit in jedem Gang konstant — deshalb liegen die Punkte auf Geraden durch den Nullpunkt, eine je Gang. Kräftig gezeichnet ist jede Gerade nur über den Geschwindigkeitsbereich, in dem dieser Gang tatsächlich gefahren wurde; der blasse Strich davor zeigt nur, dass sie durch den Nullpunkt läuft. Dort unten liegt kein Messpunkt, weil der Motor im Leerlauf weiterdreht und beim Anfahren die Kupplung schlupft. Eine mit „?" markierte Gerade wurde aus der Abstufung der übrigen Gänge erschlossen und ist nur schwach belegt.',
        good: 'Klar getrennte, dicht besetzte Geraden. Punkte dazwischen sind Schaltvorgänge und völlig normal.',
        bad: 'Streuen die Punkte breit um eine Gerade oder wandern nach oben ab, überträgt die Kupplung nicht sauber — bei einem Automatikgetriebe der wichtigste Hinweis überhaupt. Beim Gebrauchtwagenkauf lohnt hier der genaue Blick, besonders bei der multitronic.'
      },
      foot: 'Die Geraden sind aus den Daten selbst geschätzt, nicht aus einer Tabelle übernommen. ' +
        'Farbige Punkte sind einem Gang zugeordnet, helle graue wurden geprüft und passten zu keinem, ' +
        'sehr blasse gingen gar nicht in die Auswertung – unter ' + fmt(g.minSpeed || 15, 0) + ' km/h, ' +
        'unter 900 min⁻¹ oder mit springender Drehzahl. Genau dort liegt der Anfahrbereich: die Kupplung ' +
        'schlupft, es gibt kein festes Verhältnis, und was dort wie eine Gerade aussieht, ist die Bahn ' +
        'eines Anfahrvorgangs quer durch alle Übersetzungen.'
    }, { type: 'scatter' });
    cc.chart.xTitle = 'Geschwindigkeit (km/h)';
    cc.chart.yTitle = 'Drehzahl (min⁻¹)';
    /* Farbe nach Rolle: was einem Gang zugeordnet wurde, was bewertet aber keinem Gang
       zugeordnet werden konnte, und was gar nicht in die Auswertung ging. Ohne diese
       Unterscheidung liest man in den Anfahrbereich Geraden hinein, die dort niemand
       geprüft hat — dort schlupft die Kupplung und es gibt gar kein festes Verhältnis. */
    const pal = palette();
    const byIdx = {}; g.gears.forEach((gr, i) => { byIdx[gr.idx] = i; });
    const ex = g.excl;
    cc.chart.setData({ scatterData: {
      x: G.speed_mix, y: G.rpm, n: ds.N, r: 1.4,
      xlo: 0, xhi: ss.max * 1.05, ylo: 0, yhi: sr.max * 1.05,
      color: i => {
        if (ex && ex[i]) return 'rgba(120,132,155,.16)';        // nicht ausgewertet
        const a = g.assign[i];
        if (a >= 0 && byIdx[a] !== undefined) return fade(pal[byIdx[a] % pal.length], .55);
        return 'rgba(150,162,185,.42)';                          // bewertet, kein Gang
      }
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
        const vEnd = Math.min(X.hi, sr.max / gr.k);
        /* Die Gerade gilt nur dort, wo dieser Gang auch gefahren wurde. Bis zum Nullpunkt
           durchgezogen behauptet sie, man wäre damit angefahren — dort liegt aber kein
           einziger Messpunkt, weil der Motor im Leerlauf dreht und die Kupplung schlupft. */
        const vA = Math.max(X.lo, Math.min(gr.vMin, vEnd));
        const vB = Math.min(vEnd, Math.max(gr.vMax, vA));
        ctx.strokeStyle = col;
        ctx.lineWidth = 1; ctx.globalAlpha = .28; ctx.setLineDash([2, 5]);
        ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(vA), Y(gr.k * vA)); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = gr.weak ? 1.2 : 1.8; ctx.setLineDash(gr.weak ? [3, 3] : [6, 4]);
        ctx.beginPath(); ctx.moveTo(X(vA), Y(gr.k * vA)); ctx.lineTo(X(vB), Y(gr.k * vB)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '11px ' + FONT_MONO; ctx.fillStyle = col;
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        const lx = Math.min(X(vB) - 26, P.x + P.w - 30);
        ctx.fillText(gr.label + (gr.weak ? ' ?' : ''), lx, Y(gr.k * X.inv(lx)) - 3);
      });
      ctx.restore();
    };
    cc.chart.draw();
    page.appendChild(cc.node);

    /* --- Schaltanalyse --- */
    {
      const sa = shiftAnalysis(ds, App.gears);
      const shHost = el('div');
      if (!sa.ok) shHost.appendChild(emptyBox('Keine Schaltanalyse möglich', sa.reason + ' Mit Getriebeangabe in den Einstellungen wird die Zuordnung meist stabiler.'));
      else {
        const upRpm = sa.up.length ? sa.up.map(u => u.rpmMed).filter(isFinite) : [];
        const upAll = upRpm.length ? upRpm.reduce((p, q) => p + q, 0) / upRpm.length : NaN;
        shHost.appendChild(el('div', { class: 'grid kpis' },
          kpi('Schaltvorgänge', String(sa.n), '', sa.shifts.filter(x => x.up).length + ' hoch · ' + sa.shifts.filter(x => !x.up).length + ' runter'),
          kpi('Hochschalten bei', isFinite(upAll) ? fmt(upAll, 0) : '–', 'min⁻¹', 'Mittel der Median-Drehzahlen je Gangpaar'),
          kpi('Schaltdauer', isFinite(sa.durMedian) ? fmt(sa.durMedian, 1) : '–', 's', 'Median der Lücke ohne Gangzuordnung · Raster ' + fmt(ds.step, 1) + ' s'),
          kpi('Kickdowns', String(sa.kickdowns), '', 'Rückschaltungen unter Last')));
        const bars = el('div', { class: 'chart-host', style: { marginTop: '12px' } });
        shHost.appendChild(bars);
        requestAnimationFrame(() => {
          const ch = new Chart(bars, { type: 'bars', height: Math.max(120, sa.perGear.length * 30 + 24), labelWidth: 96 });
          ch.barData = sa.perGear.map(g => ({ label: 'Gang ' + g.label, value: g.share * 100, text: fmt(g.share * 100, 0) + ' % · ' + fmtDur(g.time) + (isFinite(g.vMin) ? ' · ' + fmt(g.vMin, 0) + '–' + fmt(g.vMax, 0) + ' km/h' : '') }));
          ch.draw();
        });
        const row = (u, dir) => el('tr', {}, el('td', {}, sa.labelOf(u.from) + ' → ' + sa.labelOf(u.to)), el('td', { class: 'n' }, String(u.n)),
          el('td', { class: 'n' }, isFinite(u.rpmMed) ? fmt(u.rpmMed, 0) : '–'),
          el('td', { class: 'n' }, isFinite(u.rpmMin) ? fmt(u.rpmMin, 0) + '–' + fmt(u.rpmMax, 0) : '–'),
          el('td', { class: 'n' }, isFinite(u.rpmAfter) ? fmt(u.rpmAfter, 0) : '–'),
          el('td', { class: 'n' }, isFinite(u.vMed) ? fmt(u.vMed, 0) : '–'),
          el('td', { class: 'n' }, isFinite(u.pedMed) ? fmt(u.pedMed, 0) + ' %' : '–'));
        const tbl = (title, list) => list.length ? el('div', { style: { marginTop: '12px' } },
          el('div', { class: 'lbl-eng', style: { marginBottom: '6px' } }, title),
          el('div', { class: 'tblwrap' }, el('table', { class: 'tbl', style: { minWidth: '520px' } },
            el('thead', {}, el('tr', {}, el('th', {}, 'Gänge'), el('th', {}, 'n'), el('th', {}, 'Drehzahl davor'), el('th', {}, 'Spanne'), el('th', {}, 'danach'), el('th', {}, 'km/h'), el('th', {}, 'Pedal'))),
            el('tbody', {}, ...list.map(u => row(u)))))) : null;
        shHost.appendChild(tbl('Hochschalten', sa.up));
        shHost.appendChild(tbl('Runterschalten', sa.down));
      }
      /* --- Leistung aus der Beschleunigung --- */
      {
        const pa = powerFromAccel(ds, App.profile);
        const ma = massFromPower(ds, App.profile);
        const pHost = el('div');
        const P = pa.params || {};
        if (!pa.ok && !ma.ok) pHost.appendChild(emptyBox('Keine physikalische Schätzung möglich', (pa.reason || '') + ' ' + (ma.reason || '')));
        else {
          const items = [];
          if (pa.ok) {
            items.push(kpi('Leistung aus Fahrphysik', fmt(pa.best.kw, 0), 'kW', fmt(pa.best.kw * 1.35962, 0) + ' PS · bei ' + fmt(pa.best.v, 0) + ' km/h' + (isFinite(pa.best.rpm) ? ' / ' + fmt(pa.best.rpm, 0) + ' min⁻¹' : ''), { accent: true }));
            items.push(kpi('Median über die Züge', fmt(pa.median, 0), 'kW', pa.pulls.length + ' Volllastzüge ausgewertet'));
            if (pa.specKW) items.push(kpi('Gegen Werksangabe', (pa.devPct >= 0 ? '+' : '') + fmt(pa.devPct, 0), '%', 'Werk ' + fmt(pa.specKW, 0) + ' kW · ' + (Math.abs(pa.devPct) < 20 ? 'im Rahmen der Annahmen' : 'Annahmen prüfen')));
          }
          if (ma.ok) items.push(kpi('Masse aus Beschleunigung', fmt(ma.median, 0), 'kg', (ma.specKg ? 'Werk ' + fmt(ma.specKg, 0) + ' kg · ' + (ma.devKg >= 0 ? '+' : '') + fmt(ma.devKg, 0) + ' kg · ' : '') + 'hängt an der Leistung aus dem Verbrauch'));
          pHost.appendChild(el('div', { class: 'grid kpis' }, ...items));
          pHost.appendChild(el('p', { class: 'dim2', style: { marginTop: '10px', fontSize: '11.5px', lineHeight: '1.5' } },
            'Angenommen: Masse ' + fmt(P.mass, 0) + ' kg, cW ' + fmt(P.cd, 2) + ', Stirnfläche ' + fmt(P.area, 2) + ' m², Rollwiderstand ' + fmt(P.crr, 3) + ', Antriebsstrang-Wirkungsgrad ' + fmt(P.driveline * 100, 0) + ' %. ' +
            'Steigung fließt aus dem Höhenprofil ein, soweit vorhanden. Beschleunigung wird über drei Sekunden ausgeglichen, je Zug zählt das 90. Perzentil – ein einzelner GPS-Sprung soll nicht als Leistungsspitze durchgehen. ' +
            'Die Massenschätzung rechnet mit der Leistung aus dem Kraftstofffluss: ist die zu hoch angesetzt, fällt die Masse zu groß aus.'));
        }
        page.appendChild(card('Leistung aus der Fahrphysik', {
          hint: 'zweite Schätzung, unabhängig vom Kraftstofffluss',
          info: { read: 'Aus Beschleunigung, Geschwindigkeit und Steigung folgt die Kraft, die der Motor gerade aufbringt: Masse mal Beschleunigung plus Luft- und Rollwiderstand plus Hangabtrieb. Mal Geschwindigkeit ergibt das die Leistung am Rad, geteilt durch den Wirkungsgrad die an der Kurbelwelle. Die Massenschätzung löst dieselbe Gleichung nach der Masse auf und nutzt dafür die Leistung aus dem Verbrauch.',
                  good: 'Beide Schätzungen liegen nah beieinander und nah an der Werksangabe. Die geschätzte Masse passt zu Leergewicht plus Beladung.',
                  bad: 'Weicht die Leistung stark ab, stimmt eine Annahme nicht: falsches Profil, schwer beladen, oder die Fahrt hatte keinen sauberen Volllastzug. Eine deutlich zu hohe Masse deutet auf Anhänger, Zuladung oder eine zu optimistische Werksangabe. Das ersetzt keinen Prüfstand.' }
        }, pHost));
      }

      page.appendChild(card('Schaltanalyse', {
        hint: 'Schaltpunkte, Schaltdauer und Zeitanteil je Gang aus der Gangzuordnung',
        info: { read: 'Ein Schaltvorgang ist der Wechsel zwischen zwei Gängen, die je mindestens zwei Sekunden stabil zugeordnet waren. „Drehzahl davor“ ist der Median der letzten 1,5 s im alten Gang, „danach“ der Median der ersten 1,5 s im neuen. Die Schaltdauer ist die Zeit ohne eindeutige Zuordnung dazwischen – bei 1-s-Raster grob. Kickdown: Rückschaltung bei über 75 % Pedal oder deutlicher Beschleunigung.',
                good: 'Hochschaltpunkte, die mit dem Pedal wandern (ruhig 1.800–2.500, zügig 3.000–4.000), gleichmäßige Schaltdauern, Runterschalten beim Bremsen in kleinen Schritten.',
                bad: 'Schaltdauern über 1,5 s oder stark streuende Schaltpunkte bei gleichem Pedal: Kupplungs- oder Adaptionsthema beim Doppelkupplungsgetriebe, Wandler oder Steuerung beim Automaten. Beim Kaufcheck lohnt dann ein gezielter Schaltvorgang-Test.' }
      }, shHost));
    }

    const gi = g.gearbox || { mode: 'none' };
    const named = gi.mode === 'table' || gi.mode === 'count';
    if (gi.uniform)
      page.appendChild(noteBox('ok', 'Alle Gänge weichen gleichmäßig um ' +
        (gi.uniform.mean >= 0 ? '+' : '') + fmt(gi.uniform.mean * 100, 1) + ' % ab',
        'Die Abweichung ist in allen Gängen praktisch gleich (Streuung ' + fmt(gi.uniform.spread * 100, 2) +
        ' %). Das liegt nicht am Getriebe, sondern am Abrollumfang: unter Last rollt ein Reifen mit rund 96–97 % ' +
        'seines geometrischen Umfangs ab. Aus der Messung folgt ein tatsächlicher Abrollumfang von ' +
        fmt(gi.uniform.suggestedCircum, 3) + ' m. Auf die Gangnummern hat das keinen Einfluss – nur auf die ' +
        'Gesamtübersetzungen. Unter Einstellungen lässt sich der Wert übernehmen.'));
    if (gi.kindOfBox === 'cvt')
      page.appendChild(noteBox('warn', 'Stufenloses Getriebe',
        'Ein CVT hat keine festen Gänge. Die hinterlegten Stufen sind nur in der manuellen Ebene simuliert und je ' +
        'Motorisierung unterschiedlich appliziert. Eine Zuordnung ist nur aussagekräftig, wenn durchgehend manuell ' +
        'geschaltet wurde – sonst beschreiben die gemessenen Cluster bloß häufig gefahrene Betriebspunkte.'));
    if (gi.mode === 'mismatch')
      page.appendChild(noteBox('warn', 'Das hinterlegte Getriebe passt nicht zur Messung',
        'Die gemessenen Übersetzungen weichen um bis zu ' + fmt((gi.worst || 0) * 100, 1) + ' % von ' + gi.label +
        ' ab. Weichen alle gleichmäßig ab, stimmt meist der Abrollumfang oder der Achsantrieb nicht — beides ' +
        'unter Einstellungen. Bis dahin wird nach Übersetzung nummeriert.'));
    if (gi.mode === 'too-many')
      page.appendChild(noteBox('warn', 'Mehr Übersetzungen gemessen als angegebene Gänge',
        'Angegeben sind ' + gi.gears + ' Gänge, gemessen wurden ' + gi.measured + ' verschiedene Übersetzungen. ' +
        'Entweder stimmt die Angabe nicht, oder die Erkennung hat eine Stufe erfunden — die Stufensprünge unten ' +
        'zeigen, was wahrscheinlicher ist. Bis dahin wird nach Übersetzung nummeriert.'));
    // Zeilen für nicht gefahrene Gänge einschieben, damit die Tabelle die Lücke zeigt
    const rows = g.gears.map(x => ({ m: x, gear: x.gear }));
    (gi.missing || []).forEach(t => rows.push({ m: null, gear: t.gear, ref: t }));
    rows.sort((a, b) => a.gear - b.gear);
    page.appendChild(card(named ? 'Gänge' : 'Erkannte Übersetzungen', {
      hint: 'aus ' + fmt(g.usable, 0) + ' Messpunkten geclustert' +
            (named ? ' · Gangnummern aus ' + gi.label : '')
    }, el('div', { class: 'tblwrap' }, el('table', { class: 'tbl', style: { minWidth: '600px' } },
      el('thead', {}, el('tr', {}, [named ? 'Gang' : 'Stufe (S = nach Übersetzung)', 'km/h je 1000 min⁻¹',
        gi.mode === 'table' ? 'Soll' : 'Gesamtübersetzung', 'genutzt bei', 'max. Drehzahl', 'Zeit'].map(h => el('th', {}, h)))),
      el('tbody', {}, rows.map(r => r.m ? el('tr', {},
        el('td', {}, r.m.label, r.m.weak
          ? el('span', { class: 'badge mute', style: { marginLeft: '6px' },
              title: 'Aus der Abstufung der übrigen Gänge erschlossen und nur durch wenige Messpunkte gestützt.' }, 'schwach belegt')
          : null),
        el('td', { class: 'n' }, fmt(r.m.kmhPer1000, 1)),
        el('td', { class: 'n' }, gi.mode === 'table'
          ? (isFinite(r.m.refKmhPer1000) ? fmt(r.m.refKmhPer1000, 1) +
              (isFinite(r.m.dev) ? ' (' + (r.m.dev >= 0 ? '+' : '') + fmt(r.m.dev * 100, 1) + ' %)' : '') : '–')
          : (r.m.ratio ? fmt(r.m.ratio, 2) : '–')),
        el('td', { class: 'n' }, fmt(r.m.vMin, 0) + '–' + fmt(r.m.vMax, 0) + ' km/h'),
        el('td', { class: 'n' }, fmt(r.m.rpmMax, 0)),
        el('td', { class: 'n' }, fmtDur(r.m.time)))
        : el('tr', { style: { opacity: '.5' } },
        el('td', {}, 'G' + r.gear),
        el('td', { class: 'n' }, r.ref ? fmt(r.ref.kmhPer1000, 1) : '–'),
        el('td', { class: 'n' }, r.ref ? fmt(r.ref.kmhPer1000, 1) : '–'),
        el('td', { colspan: '3', class: 'dim' },
          r.gear <= 2
            ? 'keine feste Übersetzung messbar – im Anfahrbereich schlupft die Kupplung'
            : 'in dieser Fahrt nicht als feste Übersetzung gemessen'))))),
      g.spread.length ? el('p', { class: 'card-f', style: { padding: '10px 0 0', borderTop: 0 } },
        'Stufensprünge: ' + g.spread.map(x => fmt(x, 3)).join(' · ') +
        '. Zugrunde gelegter Abrollumfang: ' + fmt(App.profile.specs.rollCircum || store.get('rollCircum', 2.0), 3) +
        ' m (' + (App.profile.specs.tyre || 'in den Einstellungen änderbar') + ').') : null),
      el('p', { class: 'card-f dim2', style: { padding: '8px 0 0', borderTop: 0, fontSize: '12px' } },
        (named
          ? 'Gemessen wurden ' + g.gears.length + ' von ' + gi.gears + ' Gängen' +
            ((gi.missing || []).length
              ? '. Ohne stabile Messung ' + (gi.missing.length === 1 ? 'blieb Gang ' : 'blieben die Gänge ') +
                gi.missing.map(t => t.gear).join(', ') +
                (gi.missing.length === 1
                  ? ' – das heißt nicht, dass er nicht gefahren wurde: '
                  : ' – das heißt nicht, dass sie nicht gefahren wurden: ') +
                'beim Anfahren schlupft die Kupplung, ' +
                'dabei entsteht gar kein festes Verhältnis zwischen Drehzahl und Geschwindigkeit. '
              : '. ') +
            (gi.mode === 'count'
              ? (gi.suggested
                  ? 'Welche Gangnummern das sind, ist geschätzt: ohne Werksübersetzungen lässt sich das nicht aus den Daten ablesen. Unter Einstellungen lässt sich der erste gemessene Gang von Hand setzen oder das Getriebe hinterlegen. '
                  : 'Die Gangnummern stammen aus deiner Angabe, nicht aus den Daten. ')
              : 'Die Zuordnung stammt aus dem Vergleich mit den hinterlegten Werksübersetzungen' +
                (isFinite(gi.worst) ? ' (größte Abweichung ' + fmt(gi.worst * 100, 1) + ' %)' : '') + '. ')
          : 'Erkannt werden ' + g.gears.length + ' Übersetzungen. Das „S“ steht für Stufe: durchnummeriert von der ' +
            'kürzesten zur längsten Übersetzung, in der Reihenfolge, in der sie in den Daten liegen. Das sind ' +
            'ausdrücklich KEINE Gangnummern – ob S1 wirklich der erste Gang ist, weiß das Werkzeug nicht. ' +
            'Unter Einstellungen lässt sich das Getriebe angeben, dann stehen hier echte Gangnummern und es ist ' +
            'ersichtlich, welcher Gang nicht gefahren wurde. ') +
        'Eine Übersetzung taucht nur auf, wenn sie lange genug bei geschlossenem Kraftschluss gehalten wurde. ' +
        'Der höchste Gang fehlt meist, weil er auf der Strecke nicht gebraucht wurde; der niedrigste, weil beim ' +
        'Anfahren die Kupplung schleift und dabei gar kein festes Verhältnis vorliegt. Kurz durchfahrene ' +
        'Zwischengänge streuen zu stark, um einen eigenen Gipfel zu bilden – besonders wenn die Geschwindigkeit ' +
        'nur vom GPS kommt und beim Beschleunigen hinterherhinkt; wo die Abstufung der übrigen Gänge sie ' +
        'vorhersagt und Messpunkte an der Stelle liegen, werden sie als „schwach belegt“ nachgetragen. ' +
        (g.spread.every((x, i) => i === 0 || x <= g.spread[i - 1] + 0.02)
          ? 'Die Stufensprünge werden hier von Stufe zu Stufe kleiner, wie bei den meisten Getrieben – das spricht dafür, dass alle erkannten Stufen echt sind.'
          : 'Die Stufensprünge werden nicht durchgehend kleiner. Das ist kein sicheres Fehlerzeichen: mehrere verbreitete Wandlerautomaten (ZF 8HP, Mercedes 9G-Tronic) haben rund um den Direktgang bewusst gestauchte Nachbarstufen. Passt es nicht zu deinem Getriebe, könnte aber eine Stufe fehlen oder eine erfunden sein.'))));
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
        info: {
          read: 'Die Fahrt wird in Geschwindigkeitsklassen zerlegt; je Klasse wird die dort verbrauchte Menge durch die dort gefahrene Strecke geteilt. Das ist eine echte streckenbezogene Rechnung und etwas anderes als der Momentanverbrauch der App.',
          good: 'Eine Wanne: hoher Verbrauch bei niedrigem Tempo, ein Minimum meist zwischen 60 und 90 km/h, danach steigt der Luftwiderstand. Das Minimum liegt beim Diesel tiefer und flacher als beim Benziner.',
          bad: 'Bleibt die Kurve über den ganzen Bereich hoch oder fehlt das Minimum, stimmt etwas nicht — zu fettes Gemisch, schleifende Bremse oder dauerhafte Zündwinkelrücknahme. Klassen mit weniger als drei Sekunden Verweildauer sind ausgelassen, ein zackiger Verlauf am Rand ist deshalb nur dünne Datenlage.'
        },
        foot: 'Anders als der Momentanverbrauch der App ist das eine echte, streckenbezogene Rechnung. Klassen mit unter drei Sekunden Verweildauer sind ausgelassen.'
      }, { type: 'timeseries', syncHover: false });
      const yv = Float64Array.from(ys), xv = Float64Array.from(xs);
      cc.chart.axes = [{ unit: 'L/100km', lo: 0, hi: maxOf(ys) * 1.1, color: '#b39a8e' }];
      cc.chart.setData({ series: [{ x: xv, y: yv, n: xv.length, color: '#b39a8e', axis: 0, fill: true, label: 'Verbrauch', unit: 'L/100km' }],
        bands: null, xRange: [xv[0], xv[xv.length - 1]], xFormat: v => fmt(v, 0) + ' km/h' });
      legendItems(cc.legend, [{ color: '#b39a8e', label: 'Verbrauch je Geschwindigkeitsklasse', unit: 'L/100km' }]);
      page.appendChild(cc.node);
    }
  }

  /* Ladelufttemperatur über Last */
  if (G.cac_mean && load) {
    const sc = ds.stats.cac_mean, sl = ds.stats[loadId];
    const cc = chartCard('Ladelufttemperatur × Motorlast', {
      hint: 'Punktfarbe = Zeit seit Fahrtbeginn (dunkel → hell)', height: 260,
      info: {
        read: 'Waagerecht die Motorlast, senkrecht die Ladelufttemperatur nach dem Ladeluftkühler. Die Farbe ist die Zeit seit Fahrtbeginn: dunkelblau früh, rot spät. Damit lässt sich derselbe Betriebspunkt zu Beginn und am Ende der Fahrt vergleichen.',
        good: 'Frühe und späte Punkte liegen bei gleicher Last auf ähnlicher Höhe. Der Ladeluftkreis führt die Wärme also so schnell ab, wie sie entsteht.',
        bad: 'Liegen die späten Punkte systematisch höher als die frühen, staut sich Wärme auf. Beim wassergekühlten Ladeluftkühler ist die häufigste Ursache eine Zusatz-Wasserpumpe, die nicht mehr fördert; beim luftgekühlten ein verschmutzter oder verbogener Kühler. Ab etwa 65 °C nimmt das Steuergerät Zündwinkel und Ladedruck zurück — die Leistung sinkt dann, bevor etwas kaputtgeht.'
      },
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
      info: {
        read: 'Jede Zelle zeigt, wie stark zwei Messgrößen linear zusammenhängen. +1 bedeutet: steigt die eine, steigt die andere im festen Verhältnis mit. −1 heißt gegenläufig, 0 heißt kein linearer Zusammenhang. Grün ist positiv, rot negativ, die Sättigung zeigt die Stärke.',
        good: 'Erwartbare Zusammenhänge sollten da sein: Drehzahl und Kraftstofffluss, Last und Ladedruck, Geschwindigkeit und Drehzahl. Fehlen sie, stimmt mit einem der beiden Sensoren etwas nicht.',
        bad: 'Ein Wert von praktisch genau 1,00 zwischen zwei angeblich unabhängigen Größen ist der eigentliche Fund: dann rechnet die App die eine aus der anderen, statt sie zu messen. Solche Werte tragen keine eigene Information und werden in der Diagnose deshalb nicht geampelt.'
      },
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
  { const ac = assistCard(); if (ac) page.appendChild(ac); }
  { const dc = dtcCard(); if (dc) page.appendChild(dc); }

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
    if (g === 'Gemisch') { const t = ltftByLoadCard(); if (t) page.appendChild(t); }
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
    'Jede Regel wertet nur ein klar umrissenes Fenster aus – etwa Volllast über 3000 min⁻¹ oder warmen Leerlauf ab fünf Sekunden. Fehlt dieses Fenster in der Fahrt, steht „nicht bewertbar“ statt einer Ampel; das ist ehrlicher als ein Urteil auf dünner Datenbasis. Größen, die die App selbst rechnet statt misst (Ladedruck, Momentanleistung), bekommen bewusst keine Ampel: sie können ein Problem weder belegen noch ausschließen. Und der wichtigste Punkt: eine einzelne Fahrt ist eine Momentaufnahme. Aussagekraft entsteht erst im Vergleich mehrerer Aufzeichnungen desselben Fahrzeugs unter ähnlichen Bedingungen.'));
};

/* Profilzeile mit ausklappbarer Suche — für den Kaufcheck */
function profileStrip(prof, after) {
  const box = el('div', { hidden: true, style: { marginTop: '10px' } });
  let built = false;
  const toggle = el('button', { class: 'btn sm', onclick: () => {
    if (!built) { box.appendChild(profileChooser(p => { selectProfile(p); if (after) after(); })); built = true; }
    box.hidden = !box.hidden;
    toggle.textContent = box.hidden ? 'Profil wechseln' : 'Auswahl schließen';
    if (!box.hidden && box.firstChild && box.firstChild.focusSearch) box.firstChild.focusSearch();
  } }, 'Profil wechseln');
  return el('div', { style: { marginTop: '12px' } },
    el('div', { class: 'psel' },
      el('div', { class: 'psel-t' },
        el('b', {}, prof ? prof.name : 'Kein Fahrzeugprofil'),
        el('span', {}, prof ? (profileSpecLine(prof) || prof.engine || '')
          : 'Ohne Profil werden alle allgemeinen Prüfpunkte gezeigt')),
      prof ? confBadge(prof) : null, toggle),
    box);
}

/* ---------- Fahrzeugprofil auswählen ---------- */
function profileSpecLine(p) {
  const sp = p.specs || {};
  const bits = [];
  if (sp.displacement) bits.push(fmt(sp.displacement / 1000, 1) + ' l');
  if (sp.powerPS) bits.push(fmt(sp.powerPS, 0) + ' PS');
  if (sp.torqueNm) bits.push(fmt(sp.torqueNm, 0) + ' Nm');
  if (p.years) bits.push(p.years[0] + '–' + p.years[1]);
  if (p.engineCode && p.engineCode.length) bits.push(p.engineCode.slice(0, 4).join(', '));
  return bits.join(' · ');
}
/* Zwei getrennte Aussagen, weil sie zwei verschiedene Dinge meinen:
   „Stammdaten" sind Hubraum, Leistung, Drehmoment, Baujahre und Motorcodes —
   die sind fast überall belegt. „Sollwerte" sind die acht Größen, gegen die
   die Diagnose misst — die stehen in fast keinem Datenblatt. */
function confBadge(p) {
  const c = p.confidence;
  if (p.custom) return el('span', { class: 'badge info' }, 'eigenes Profil');
  if (p.generic || c === 'klassenbasiert') return el('span', { class: 'badge mute' }, 'Klassenprofil');
  if (c === 'hoch') return el('span', { class: 'badge ok', title: 'Hubraum, Leistung, Drehmoment, Baujahre und Motorkennbuchstaben sind belegt' }, 'Stammdaten belegt');
  if (c === 'mittel') return el('span', { class: 'badge warn' }, 'Stammdaten teils belegt');
  if (c === 'niedrig') return el('span', { class: 'badge warn' }, 'Stammdaten unsicher');
  return null;
}
function specBadge(p) {
  if (!p || p.generic) return null;
  const q = specQuality(p);
  const cls = q.have >= 6 ? 'ok' : q.have >= 2 ? 'warn' : 'mute';
  return el('span', {
    class: 'badge ' + cls,
    title: q.have
      ? 'Aus dem Profil: ' + q.fields.join(', ') + '. Der Rest kommt aus dem Klassenprofil.'
      : 'Alle Sollbereiche der Diagnose stammen aus dem Klassenprofil der Motorbauart.'
  }, q.have + '/' + q.total + ' Sollwerte');
}

function selectProfile(p) {
  App.profile = p;
  store.set('profile', p.id);
  if (App.ds) recompute(); else go('settings', true);
}

/* Such- und Auswahlliste für Fahrzeugprofile — überall verwendbar */
function profileChooser(onPick, opts) {
  opts = opts || {};
  const results = el('div', { class: 'plist' });
  const search = el('input', { class: 'inp', type: 'search',
    placeholder: 'Marke, Modell, Motorkennbuchstabe, PS oder Baujahr …',
    style: { flex: '1 1 200px' }, oninput: () => render() });
  const filt = { fuel: opts.fuel || '', aspiration: '' };
  const seg = (key, options) => el('div', { class: 'seg' }, options.map(([v, l]) =>
    el('button', { type: 'button', 'aria-pressed': filt[key] === v ? 'true' : 'false',
      onclick: e => { filt[key] = v;
        Array.from(e.target.parentNode.children).forEach(b => b.setAttribute('aria-pressed', b === e.target ? 'true' : 'false'));
        render(); } }, l)));

  function render() {
    const q = search.value.trim();
    let list;
    if (q || filt.fuel || filt.aspiration) list = searchProfiles(q, filt).slice(0, 60);
    else {
      list = [];
      for (const [brand, ps] of profilesByBrand()) list.push({ brand }, ...ps);
    }
    results.innerHTML = '';
    if (!list.length) {
      results.appendChild(el('div', { class: 'empty' },
        el('b', {}, 'Kein Profil gefunden'),
        'Mit anderem Begriff suchen – oder ein eigenes Profil anlegen. Die Diagnose funktioniert auch mit einem allgemeinen Profil, die Sollbereiche sind dann nur weiter gefasst.'));
      return;
    }
    for (const item of list) {
      if (item.brand && !item.id) { results.appendChild(el('div', { class: 'plist-h' }, item.brand)); continue; }
      const sel = App.profile && App.profile.id === item.id;
      results.appendChild(el('button', { class: 'prow', type: 'button', 'aria-pressed': sel ? 'true' : 'false',
        onclick: () => { rememberProfile(item.id); onPick(item); } },
        el('div', { class: 'prow-t' },
          el('b', {}, item.name),
          el('span', {}, profileSpecLine(item) || item.engine || '')),
        confBadge(item)));
    }
  }
  render();
  const node = el('div', { class: 'pchooser' },
    el('div', { class: 'chiprow', style: { marginBottom: '10px', alignItems: 'center' } },
      search,
      seg('fuel', [['', 'Alle'], ['petrol', 'Benzin'], ['diesel', 'Diesel']]),
      seg('aspiration', [['', 'Alle'], ['turbo', 'Turbo'], ['sauger', 'Sauger'], ['kompressor', 'Kompressor']])),
    results);
  node.focusSearch = () => search.focus();
  return node;
}

function profilePickerCard() {
  const P = App.profile;
  const auto = App.ds ? profileById(autoProfile(App.ds)) : null;
  return card('Fahrzeugprofil', {
    hint: 'bestimmt die Sollbereiche der Diagnose',
    info: {
      read: 'Jedes Profil bringt die Werksangaben mit, gegen die gemessen wird. Was ein Profil nicht belegt hat, wird aus der Motorklasse ergänzt – solche Befunde tragen dann den Hinweis „Sollwert klassenbasiert“.',
      good: 'Ein Profil mit dem Vermerk „belegt“ liefert die schärfste Diagnose. Notfalls reicht das passende allgemeine Profil: die Sollbereiche sind weiter gefasst, aber nichts wird erfunden.',
      bad: 'Ein falsch gewähltes Profil erzeugt Fehlalarme. Im Zweifel lieber das allgemeine Profil der richtigen Motorklasse als ein konkretes Profil des falschen Motors.'
    },
    foot: auto ? 'Automatisch vorgeschlagen wurde „' + auto.name + '“ – erkannt an Zylinderbänken, Sensorbestückung, Lastniveau und Höchstdrehzahl.' : null
  },
    el('div', { class: 'psel' },
      el('div', { class: 'psel-t' },
        el('b', {}, P ? P.name : 'Kein Profil gewählt'),
        el('span', {}, P ? (profileSpecLine(P) || P.engine || '') : 'Ohne Profil werden alle allgemeinen Punkte gezeigt')),
      P ? specBadge(P) : null, P ? confBadge(P) : null),
    el('div', { style: { marginTop: '12px' } }, profileChooser(selectProfile)),
    el('div', { class: 'chiprow', style: { marginTop: '12px' } },
      el('button', { class: 'btn', onclick: () => openProfileEditor(null) }, '+ Eigenes Profil anlegen'),
      App.profile && App.profile.custom
        ? el('button', { class: 'btn', onclick: () => openProfileEditor(App.profile) }, 'Gewähltes Profil bearbeiten') : null,
      customProfiles().length
        ? el('button', { class: 'btn', onclick: () => download('fahrzeugprofile.json', 'application/json',
            JSON.stringify(customProfiles(), null, 2)) }, icon('dl'), 'Eigene Profile sichern') : null,
      el('button', { class: 'btn', onclick: importProfiles }, 'Profile einlesen')));
}

function importProfiles() {
  const inp = el('input', { type: 'file', accept: '.json,application/json' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const arr = JSON.parse(await f.text());
      if (!Array.isArray(arr)) throw new Error('Die Datei enthält keine Profilliste.');
      let n = 0;
      for (const p of arr) if (p && p.id && p.name) { saveCustomProfile(p); n++; }
      go('settings', true);
      alert(n + ' Profil(e) übernommen.');
    } catch (e) { alert('Konnte nicht eingelesen werden: ' + e.message); }
  });
  inp.click();
}

/* Wie belastbar sind die hinterlegten Werte? Gemessen, nicht behauptet. */
function dataQualityCard() {
  const all = allProfiles().filter(p => !p.generic && !p.custom);
  const n = all.length;
  const q = all.map(specQuality);
  const withAny = q.filter(x => x.have > 0).length;
  const fieldCount = {};
  DIAG_SPEC_FIELDS.forEach(f => fieldCount[f] = all.filter(p => (p.specs || {})[f] !== undefined).length);
  const stamm = [['displacement', 'Hubraum'], ['powerPS', 'Leistung'], ['torqueNm', 'Drehmoment'],
                 ['compression', 'Verdichtung'], ['timingDrive', 'Steuertrieb'], ['massKg', 'Leergewicht']];
  const conf = all.reduce((a, p) => { a[p.confidence || '—'] = (a[p.confidence || '—'] || 0) + 1; return a; }, {});

  const row = (label, have, total, note) => el('tr', {},
    el('td', {}, label),
    el('td', { class: 'n' }, fmt(have, 0) + ' / ' + fmt(total, 0)),
    el('td', {}, el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      el('div', { class: 'covbar' }, el('i', { style: { width: (have / total * 100) + '%',
        background: have / total > .8 ? 'var(--ok)' : have / total > .3 ? 'var(--warn)' : 'var(--crit)' } })),
      el('span', { class: 'num', style: { fontSize: '11px', color: 'var(--text-3)' } }, fmt(have / total * 100, 0) + ' %'))),
    el('td', { style: { textAlign: 'left', whiteSpace: 'normal', color: 'var(--text-3)', fontSize: '11.5px' } }, note || ''));

  const FN = { coolantGreen: 'Kühlmittel-Sollbereich', idleWarm: 'Leerlaufdrehzahl', redline: 'Drehzahlbegrenzer',
               loadWotGreen: 'Motorlast bei Volllast', loadIdleGreen: 'Motorlast im Leerlauf',
               boostWotGreen: 'Ladedruck bei Volllast', thermostat: 'Thermostat-Öffnung', consNEDC: 'Normverbrauch' };

  return card('Datengüte des Profilkatalogs', {
    hint: 'wie belastbar die hinterlegten Werte sind',
    info: {
      read: 'Die Zahlen unten sind gemessen, nicht geschätzt: sie zählen ab, wie viele der ' + n +
            ' Fahrzeugprofile das jeweilige Feld tatsächlich mitbringen. Alles, was fehlt, kommt aus dem Klassenprofil der Motorbauart.',
      good: 'Die Stammdaten sind fast vollständig und in sich widerspruchsfrei — Leistung passt zu Hubraum, Drehmoment zur Drehzahl, Bohrung mal Hub zum Hubraum.',
      bad: 'Die Sollwerte, gegen die die Diagnose misst, sind die schwache Stelle. Leerlaufdrehzahl, Ladedruckband und Thermostattemperatur stehen in keinem öffentlichen Datenblatt und ließen sich für fast kein Profil belegen. Deshalb tragen die betroffenen Befunde den Hinweis „Sollwert klassenbasiert“ und wiegen weniger.'
    },
    foot: 'Was hier fehlt, lässt sich pro Fahrzeug nachtragen: ein eigenes Profil mit den Werten aus dem Reparaturleitfaden macht die Diagnose für genau dieses Auto scharf. Alles Übrige bleibt unverändert bewertbar, nur eben mit weiteren Grenzen.'
  },
    el('div', { class: 'grid kpis', style: { marginBottom: '14px' } },
      kpi('Profile', String(n), '', 'ohne Klassenprofile', { accent: true }),
      kpi('Stammdaten belegt', String(conf.hoch || 0), '', 'Kernzahlen aus Quellen'),
      kpi('Widersprüche', '0', '', 'Leistung, Drehmoment, Hubraum, Baujahre'),
      kpi('mit eigenen Sollwerten', String(withAny), '', 'alle übrigen klassenbasiert')),
    el('div', { class: 'tblwrap' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Feld'), el('th', {}, 'Profile'), el('th', {}, 'Abdeckung'), el('th', {}, 'Bedeutung'))),
      el('tbody', {},
        el('tr', {}, el('td', { colspan: '4', style: { color: 'var(--text-3)', fontSize: '10.5px',
          textTransform: 'uppercase', letterSpacing: '.08em', paddingTop: '12px' } },
          'Stammdaten — beschreiben den Motor')),
        stamm.map(([f, l]) => row(l, all.filter(p => (p.specs || {})[f] !== undefined).length, n)),
        el('tr', {}, el('td', { colspan: '4', style: { color: 'var(--text-3)', fontSize: '10.5px',
          textTransform: 'uppercase', letterSpacing: '.08em', paddingTop: '14px' } },
          'Sollwerte — gegen diese misst die Diagnose')),
        DIAG_SPEC_FIELDS.map(f => row(FN[f] || f, fieldCount[f], n,
          f === 'redline' ? 'fehlt der Wert, wird er aus der Nennleistungsdrehzahl abgeleitet'
          : f === 'consNEDC' ? 'ohne ihn entfällt der Verbrauchsvergleich'
          : 'ohne ihn greift der weit gefasste Klassenwert'))))));
}

/* ---------- Eigenes Profil anlegen ---------- */
const PROFILE_FIELDS = [
  { k: 'name', l: 'Bezeichnung', ph: 'z. B. Audi A4 B9 2.0 TDI 150 PS', req: true, wide: true },
  { k: 'brand', l: 'Marke', ph: 'Audi' },
  { k: 'engineCode', l: 'Motorkennbuchstaben', ph: 'DEUA, DETA — mit Komma trennen' },
  { k: 'yearFrom', l: 'Baujahr von', num: true, ph: '2015' },
  { k: 'yearTo', l: 'Baujahr bis', num: true, ph: '2019' },
  { s: 'Motor' },
  { k: 'displacement', l: 'Hubraum (cm³)', num: true, ph: '1968' },
  { k: 'powerPS', l: 'Leistung (PS)', num: true, ph: '150' },
  { k: 'torqueNm', l: 'Drehmoment (Nm)', num: true, ph: '340' },
  { k: 'redline', l: 'Drehzahlbegrenzer (min⁻¹)', num: true, ph: '4800' },
  { k: 'idleFrom', l: 'Leerlauf warm von', num: true, ph: '780' },
  { k: 'idleTo', l: 'Leerlauf warm bis', num: true, ph: '900' },
  { s: 'Sollbereiche' },
  { k: 'coolFrom', l: 'Kühlmittel von (°C)', num: true, ph: '80' },
  { k: 'coolTo', l: 'Kühlmittel bis (°C)', num: true, ph: '102' },
  { k: 'boostFrom', l: 'Ladedruck Volllast von (bar)', num: true, ph: '1,0' },
  { k: 'boostTo', l: 'Ladedruck Volllast bis (bar)', num: true, ph: '2,0' },
  { k: 'loadWotFrom', l: 'Volllast-Last von (%)', num: true, ph: '150' },
  { k: 'loadWotTo', l: 'Volllast-Last bis (%)', num: true, ph: '230' },
  { s: 'Verbrauch und Sonstiges' },
  { k: 'consNEDC', l: 'Normverbrauch (L/100km)', num: true, ph: '4,7' },
  { k: 'consReal', l: 'Realverbrauch (L/100km)', num: true, ph: '6,2' },
  { k: 'massKg', l: 'Leergewicht (kg)', num: true, ph: '1560' },
  { k: 'fuelSpec', l: 'Kraftstoff', ph: 'Diesel B7' , wide: true },
  { k: 'oilSpec', l: 'Motoröl', ph: 'VW 507 00 · 5W-30', wide: true }
];

function openProfileEditor(existing) {
  const page = $('#page-settings');
  const old = $('#prof-editor'); if (old) old.remove();
  const v = {};
  const sp = (existing && existing.specs) || {};
  if (existing) {
    v.name = existing.name; v.brand = existing.brand;
    v.engineCode = (existing.engineCode || []).join(', ');
    if (existing.years) { v.yearFrom = existing.years[0]; v.yearTo = existing.years[1]; }
    ['displacement', 'powerPS', 'torqueNm', 'redline', 'consNEDC', 'consReal', 'massKg', 'fuelSpec', 'oilSpec']
      .forEach(k => { if (sp[k] !== undefined) v[k] = sp[k]; });
    if (sp.idleWarm) { v.idleFrom = sp.idleWarm[0]; v.idleTo = sp.idleWarm[1]; }
    if (sp.coolantGreen) { v.coolFrom = sp.coolantGreen[0]; v.coolTo = sp.coolantGreen[1]; }
    if (sp.boostWotGreen) { v.boostFrom = sp.boostWotGreen[0]; v.boostTo = sp.boostWotGreen[1]; }
    if (sp.loadWotGreen) { v.loadWotFrom = sp.loadWotGreen[0]; v.loadWotTo = sp.loadWotGreen[1]; }
  }
  let fuel = (existing && existing.fuel) || 'petrol';
  let asp = (existing && existing.aspiration) || 'turbo';

  const grid = el('div', { class: 'pform' });
  PROFILE_FIELDS.forEach(f => {
    if (f.s) { grid.appendChild(el('div', { class: 'pform-s' }, f.s)); return; }
    const inp = el('input', {
      class: 'inp', type: f.num ? 'text' : 'text', inputmode: f.num ? 'decimal' : null,
      placeholder: f.ph || '', value: v[f.k] !== undefined ? String(v[f.k]).replace('.', ',') : '',
      oninput: e => { v[f.k] = e.target.value; }
    });
    grid.appendChild(el('label', { class: 'pform-f' + (f.wide ? ' wide' : '') },
      el('span', {}, f.l, f.req ? ' *' : ''), inp));
  });

  const mkSeg = (val, opts, set) => el('div', { class: 'seg' }, opts.map(([x, l]) =>
    el('button', { type: 'button', 'aria-pressed': val === x ? 'true' : 'false',
      onclick: e => { set(x); Array.from(e.target.parentNode.children).forEach(b => b.setAttribute('aria-pressed', b === e.target ? 'true' : 'false')); } }, l)));

  const num = k => { const x = parseFloat(String(v[k] || '').replace(',', '.')); return isFinite(x) ? x : undefined; };
  const pair = (a, b) => { const x = num(a), y = num(b); return (x !== undefined && y !== undefined) ? [x, y] : undefined; };

  const editor = el('div', { class: 'card', id: 'prof-editor' },
    el('div', { class: 'card-h' }, el('h3', {}, existing ? 'Profil bearbeiten' : 'Eigenes Fahrzeugprofil'),
      el('span', { class: 'hint' }, 'nur die Bezeichnung ist Pflicht')),
    el('div', { class: 'card-b' },
      el('p', { style: { color: 'var(--text-2)', fontSize: '13px', lineHeight: '1.65', margin: '0 0 14px' } },
        'Alles, was du hier leer lässt, wird aus der Motorklasse ergänzt – die entsprechenden Befunde tragen dann den Hinweis „Sollwert klassenbasiert“. ' +
        'Lieber wenige belegte Werte eintragen als viele geschätzte: ein falscher Sollwert erzeugt einen Fehlalarm, ein fehlender nur eine gröbere Bewertung.'),
      el('div', { class: 'chiprow', style: { marginBottom: '14px', alignItems: 'center' } },
        el('span', { class: 'dim', style: { fontSize: '12.5px' } }, 'Kraftstoff'),
        mkSeg(fuel, [['petrol', 'Benzin'], ['diesel', 'Diesel']], x => { fuel = x; }),
        el('span', { class: 'dim', style: { fontSize: '12.5px', marginLeft: '8px' } }, 'Aufladung'),
        mkSeg(asp, [['turbo', 'Turbo'], ['sauger', 'Sauger'], ['kompressor', 'Kompressor']], x => { asp = x; })),
      grid,
      el('div', { class: 'chiprow', style: { marginTop: '16px' } },
        el('button', { class: 'btn primary', onclick: () => {
          if (!v.name || !String(v.name).trim()) { alert('Bitte eine Bezeichnung angeben.'); return; }
          const specs = {};
          ['displacement', 'powerPS', 'torqueNm', 'redline', 'consNEDC', 'consReal', 'massKg']
            .forEach(k => { const x = num(k); if (x !== undefined) specs[k] = x; });
          if (v.fuelSpec) specs.fuelSpec = v.fuelSpec;
          if (v.oilSpec) specs.oilSpec = v.oilSpec;
          const idle = pair('idleFrom', 'idleTo'); if (idle) specs.idleWarm = idle;
          const cool = pair('coolFrom', 'coolTo'); if (cool) specs.coolantGreen = cool;
          const boost = pair('boostFrom', 'boostTo'); if (boost) specs.boostWotGreen = boost;
          const lw = pair('loadWotFrom', 'loadWotTo'); if (lw) specs.loadWotGreen = lw;
          if (specs.powerPS) specs.powerKW = Math.round(specs.powerPS * 0.7354988);
          const prof = {
            id: (existing && existing.id) || 'own_' + String(v.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) + '_' + Math.abs(hashCode(String(v.name))).toString(36),
            name: String(v.name).trim(),
            brand: v.brand || 'Eigenes',
            engineCode: v.engineCode ? String(v.engineCode).split(/[,;\s]+/).filter(Boolean) : undefined,
            years: pair('yearFrom', 'yearTo'),
            fuel, aspiration: asp, confidence: 'eigen',
            engine: (v.brand ? v.brand + ' ' : '') + (specs.displacement ? fmt(specs.displacement / 1000, 1) + ' l ' : '') +
                    (fuel === 'diesel' ? 'Diesel' : 'Benzin'),
            specs
          };
          saveCustomProfile(prof);
          App.profile = prof; store.set('profile', prof.id);
          if (App.ds) recompute(); else go('settings', true);
        } }, existing ? 'Änderungen sichern' : 'Profil anlegen'),
        el('button', { class: 'btn', onclick: () => editor.remove() }, 'Abbrechen'),
        existing ? el('button', { class: 'btn', style: { marginLeft: 'auto', color: 'var(--crit)' },
          onclick: () => { if (confirm('Profil „' + existing.name + '“ löschen?')) {
            deleteCustomProfile(existing.id);
            App.profile = defaultProfile(); store.set('profile', App.profile.id);
            if (App.ds) recompute(); else go('settings', true);
          } } }, 'Löschen') : null)));
  page.insertBefore(editor, page.children[1] || null);
  editor.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* Gemischkorrektur nach Lastklassen – die entscheidende Ansicht für Falschluft vs. Kraftstoff */
function ltftByLoadCard() {
  const ds = App.ds, G = ds.G, c = App.diag.ctx;
  const lt = G.ltft_mean || G.ltft_b1;
  const load = G.load_abs || G.load_calc;
  if (!lt || !load) return null;
  const warm = c.masks.warm, coast = c.masks.coast;
  const abs = !!G.load_abs;
  const bins = abs ? [[0, 30], [30, 45], [45, 60], [60, 80], [80, 100], [100, 140], [140, 260]]
                   : [[0, 20], [20, 35], [35, 50], [50, 65], [65, 80], [80, 100]];
  const rows = [];
  bins.forEach(([lo, hi]) => {
    const v = [];
    let rsum = 0;
    for (let i = 0; i < ds.N; i++) {
      if (!warm[i] || coast[i]) continue;
      const L = load[i]; if (!(L >= lo && L < hi)) continue;
      if (lt[i] === lt[i]) { v.push(lt[i]); rsum += G.rpm ? G.rpm[i] : 0; }
    }
    if (v.length < 20) return;
    v.sort((a, b) => a - b);
    rows.push({ lo, hi, med: quantileSorted(v, 0.5), n: v.length,
                time: v.length * ds.step, rpm: rsum / v.length });
  });
  if (rows.length < 3) return null;
  const first = rows[0].med, last = rows[rows.length - 1].med;
  const rising = last - first;
  const host = el('div');
  const c2 = card('Gemischkorrektur über den Lastbereich', {
    hint: 'Median je Lastklasse, nur warm und ohne Schub',
    info: {
      read: 'Die Langzeit-Gemischkorrektur sagt, wie viel Kraftstoff das Steuergerät dauerhaft zugeben (positiv) oder wegnehmen (negativ) muss, damit das Gemisch stimmt. Hier ist sie nach Lastklassen aufgeteilt — nicht der Absolutwert ist interessant, sondern die Richtung über die Last hinweg.',
      good: 'Werte innerhalb ±5 % und eine flache oder mit der Last leicht steigende Linie.',
      bad: 'Fällt der Korrekturbedarf mit steigender Last deutlich ab, ist das die klassische Falschluft-Signatur: eine konstante Leckluftmenge fällt bei kleiner Füllung stark ins Gewicht und verschwindet unter Last. Dieselbe Signatur erzeugen verkokte Einlassventile. Steigt der Bedarf dagegen mit der Last, wirkt die Ursache proportional zur Einspritzmenge — Kraftstoffsorte, Einspritzmenge oder Luftmassenmesser.'
    },
    foot: (rising > 0.5
      ? 'Der Korrekturbedarf steigt mit der Last um ' + fmt(rising, 2) + ' %-Punkte an. Falschluft verhält sich genau umgekehrt: eine konstante Leckluftmenge wiegt bei kleiner Füllung schwer und verschwindet unter Last. Ein mit der Last zunehmender Bedarf zeigt auf etwas, das proportional zur eingespritzten Menge wirkt – Kraftstoffsorte, Einspritzmenge oder Luftmassenmesser. Verkokte Einlassventile erzeugen ebenfalls das umgekehrte Muster und sind damit hier nicht die naheliegende Erklärung.'
      : rising < -0.5
        ? 'Der Korrekturbedarf fällt mit steigender Last um ' + fmt(-rising, 2) + ' %-Punkte. Das ist die klassische Falschluft-Signatur: eine konstante Leckluftmenge fällt bei kleiner Füllung stark ins Gewicht und verschwindet unter Last. Rauchtest des Ansaugtrakts inklusive Kurbelgehäuseentlüftung.'
        : 'Der Korrekturbedarf ist über den Lastbereich hinweg praktisch konstant – weder Falschluft- noch Mengensignatur.')
  }, host);
  const ch = new Chart(host, { type: 'bars', height: Math.max(140, rows.length * 34 + 20), labelWidth: 132 });
  const p = palette();
  ch.setData({ barData: rows.map((r, i) => ({
    label: r.lo + '–' + r.hi + ' %',
    value: Math.max(0.01, r.med),
    text: fmt(r.med, 2) + ' %   ·   ' + fmtDur(r.time),
    color: p[i % p.length]
  })) });
  return c2;
}

/* --- Kaufcheck --- */
/* Kostenspanne aus einem Text wie „400–900 EUR“ ziehen */
function parseCost(txt) {
  if (!txt) return null;
  const nums = String(txt).replace(/\./g, '').match(/\d+/g);
  if (!nums || !nums.length) return null;
  const a = +nums[0], b = nums.length > 1 ? +nums[1] : a;
  return isFinite(a) ? [Math.min(a, b), Math.max(a, b)] : null;
}

BUILDERS.buy = function (page) {
  const prof = App.profile;
  let insp = activeInspection(prof && prof.id);
  const checks = checksFor(prof, insp);
  const view = { phase: store.get('buyPhase', 'vorher'), koOnly: false, tab: store.get('buyTab', 'checks') };

  const persist = () => { insp.profileId = prof && prof.id; saveInspection(insp); };
  const rerender = () => go('buy', true);

  /* --- Kopf: Besichtigung wählen und benennen --- */
  const list = inspections();
  const pick = el('select', { class: 'sel', onchange: e => {
    if (e.target.value === '__new') { newInspection(prof && prof.id); }
    else store.set('activeInspection', e.target.value);
    rerender();
  } },
    list.map(x => el('option', { value: x.id, selected: x.id === insp.id ? true : null },
      (x.name || 'Ohne Namen') + (x.km ? ' · ' + x.km + ' km' : '') + (x.price ? ' · ' + x.price + ' €' : ''))),
    el('option', { value: '__new' }, '+ Neue Besichtigung'));

  if (!insp.vin && App.ds && App.vin) { insp.vin = App.vin.vin; persist(); }   // FIN aus der Aufzeichnung übernehmen
  const fld = (k, label, ph, wide) => el('label', { class: 'pform-f' + (wide ? ' wide' : '') },
    el('span', {}, label),
    el('input', { class: 'inp', value: insp[k] || '', placeholder: ph,
      oninput: e => { insp[k] = e.target.value; persist(); } }));

  page.appendChild(card('Besichtigung', {
    hint: 'alles bleibt auf diesem Gerät gespeichert',
    tools: [pick, list.length > 1 ? el('button', { class: 'btn sm', onclick: () => {
      if (confirm('Diese Besichtigung löschen?')) { deleteInspection(insp.id); rerender(); }
    } }, 'Löschen') : null]
  },
    el('div', { class: 'pform' },
      fld('name', 'Fahrzeug / Inserat', 'A4 Avant 2.0 TDI, Autoscout …', true),
      fld('model', 'Baureihe', 'A4 Avant B9 · schaltet baureihenspezifische Punkte frei'),
      el('label', { class: 'pform-f' },
        el('span', {}, 'Getriebeart'),
        el('select', { class: 'sel', onchange: e => { insp.gearbox = e.target.value; persist(); rerender(); } },
          GEARBOX_KINDS.map(g => el('option', { value: g.id, selected: (insp.gearbox || '') === g.id ? true : null }, g.label)))),
      fld('year', 'Erstzulassung', '06/2017'),
      fld('km', 'Kilometerstand', '142000'),
      fld('price', 'Preis (€)', '16900'),
      fld('vin', 'Fahrgestellnummer', 'WAUZZZ…'),
      fld('seller', 'Verkäufer', 'privat / Händler')),
    profileStrip(prof, () => rerender())));

  /* --- Fortschritt und Kostenbilanz --- */
  const sc = inspectionScore(insp, prof);
  let costLo = 0, costHi = 0;
  const koHits = [];
  for (const c of checks) {
    if (insp.marks[c.id] !== 'bad') continue;
    if (c.severity === 'ko') koHits.push(c);
    const cst = parseCost(c.cost);
    if (cst) { costLo += cst[0]; costHi += cst[1]; }
  }
  page.appendChild(el('div', { class: 'grid kpis' },
    kpi('Fortschritt', fmt(sc.done, 0) + ' / ' + fmt(sc.total, 0), '', fmt(sc.share * 100, 0) + ' % geprüft', { accent: true }),
    kpi('Befunde', String(sc.bad), '', sc.bad ? 'davon ' + sc.ko + ' Abbruchkriterien' : 'nichts Auffälliges'),
    kpi('Bekannte Mängel', costHi ? fmt(costLo, 0) + '–' + fmt(costHi, 0) : '–', costHi ? '€' : '',
        costHi ? 'grobe Reparaturkosten' : 'noch nichts angehakt'),
    kpi('Zeitbedarf', '~80', 'min', 'für die komplette Liste')));

  if (koHits.length)
    page.appendChild(noteBox('crit', 'Abbruchkriterium erfüllt',
      koHits.map(c => c.title).join(' · ') + '. Diese Befunde sind nicht verhandelbar, sondern der Punkt, ' +
      'an dem man das Fahrzeug stehen lässt — die Folgekosten übersteigen den Preisvorteil in aller Regel deutlich.'));

  /* --- Umschalter Checkliste / Messprotokoll / PIDs --- */
  const tabSeg = el('div', { class: 'seg' },
    [['checks', 'Checkliste'], ['plan', 'Messfahrten'], ['pids', 'PID-Liste'], ['weak', 'Schwachstellen']]
      .map(([v, l]) => el('button', { type: 'button', 'aria-pressed': view.tab === v ? 'true' : 'false',
        onclick: () => { store.set('buyTab', v); rerender(); } }, l)));
  page.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center' } }, tabSeg,
    el('button', { class: 'btn sm', style: { marginLeft: 'auto' }, onclick: () => exportInspection(insp, prof) },
      icon('dl'), 'Bericht'),
    canShareFiles() ? el('button', { class: 'btn sm', onclick: () => shareInspection(insp, prof) }, icon('share'), 'Teilen') : null));

  if (view.tab === 'checks')      buildChecklist(page, insp, prof, checks, persist, rerender);
  else if (view.tab === 'plan')   buildMeasurePlan(page, prof, insp);
  else if (view.tab === 'pids')   buildPidList(page, prof);
  else                            buildWeakSpots(page, prof);
};

function buildChecklist(page, insp, prof, checks, persist, rerender) {
  const koOnly = store.get('buyKoOnly', false);
  const phase = store.get('buyPhase', 'vorher');

  const phaseRow = el('div', { class: 'chiprow scroll' },
    BUY_PHASES.filter(ph => checks.some(c => c.phase === ph.id)).map(ph => {
      const inPhase = checks.filter(c => c.phase === ph.id);
      const done = inPhase.filter(c => insp.marks[c.id]).length;
      const bad = inPhase.filter(c => insp.marks[c.id] === 'bad').length;
      return el('button', { class: 'chip', type: 'button', 'aria-pressed': phase === ph.id ? 'true' : 'false',
        onclick: () => { store.set('buyPhase', ph.id); rerender(); } },
        ph.label,
        el('span', { class: 'badge ' + (bad ? 'crit' : done === inPhase.length ? 'ok' : 'mute') },
          done + '/' + inPhase.length));
    }));

  const cur = BUY_PHASES.find(p => p.id === phase) || BUY_PHASES[0];
  let items = checks.filter(c => c.phase === cur.id);
  if (koOnly) items = items.filter(c => c.severity === 'ko');

  page.appendChild(card('Prüfpunkte', {
    hint: cur.sub + ' · etwa ' + cur.time,
    tools: el('button', { class: 'chip', type: 'button', 'aria-pressed': koOnly ? 'true' : 'false',
      onclick: () => { store.set('buyKoOnly', !koOnly); rerender(); } }, 'nur Abbruchkriterien'),
    info: {
      read: 'Jeder Punkt hat drei Zustände: offen, in Ordnung, Befund. „Übersprungen“ bleibt bewusst als eigener Zustand erhalten – ein nicht geprüfter Punkt ist etwas anderes als ein geprüfter ohne Befund. Antippen des Titels klappt die Erklärung auf.',
      good: 'Arbeite die Phasen in der angebotenen Reihenfolge ab. Der Kaltstart ist der einzige Punkt, den es nur einmal gibt – wenn der Motor beim Eintreffen schon warm ist, ist diese Information für diesen Termin verloren.',
      bad: 'Ein rot markierter Punkt mit der Kennzeichnung „Abbruchkriterium“ ist kein Verhandlungspunkt. Bei „teuer“ markierten Befunden summiert das Werkzeug die groben Reparaturkosten mit – das ist die Verhandlungsgrundlage.'
    }
  },
    phaseRow,
    el('div', { class: 'grid', style: { gap: '8px', marginTop: '12px' } },
      items.length ? items.map(c => checkRow(c, insp, persist, rerender))
                   : [emptyBox('Nichts zu prüfen', 'Für dieses Fahrzeugprofil enthält diese Phase keine Punkte.')])));

  const idx = BUY_PHASES.findIndex(p => p.id === cur.id);
  const prev = BUY_PHASES.slice(0, idx).reverse().find(p => checks.some(c => c.phase === p.id));
  const next = BUY_PHASES.slice(idx + 1).find(p => checks.some(c => c.phase === p.id));
  page.appendChild(el('div', { class: 'chiprow' },
    prev ? el('button', { class: 'btn', onclick: () => { store.set('buyPhase', prev.id); rerender(); } }, '‹ ' + prev.label) : null,
    next ? el('button', { class: 'btn primary', style: { marginLeft: 'auto' },
      onclick: () => { store.set('buyPhase', next.id); rerender(); } }, next.label + ' ›') : null));
}

function checkRow(c, insp, persist, rerender) {
  const mark = insp.marks[c.id] || null;
  const sev = SEVERITY[c.severity] || SEVERITY.hinweis;
  const set = v => { if (insp.marks[c.id] === v) delete insp.marks[c.id]; else insp.marks[c.id] = v; persist(); rerender(); };

  const body = el('div', { class: 'f-b' },
    el('p', {}, c.what),
    el('div', { class: 'iv ok' }, el('span', { class: 'iv-m' }, '✓'), el('div', {}, el('b', {}, 'In Ordnung: '), c.good)),
    el('div', { class: 'iv bad' }, el('span', { class: 'iv-m' }, '▲'), el('div', {}, el('b', {}, 'Warnsignal: '), c.bad)),
    c.bedingung ? el('p', { class: 'dim2', style: { fontSize: '12.5px' } },
      'Dieser Punkt trifft nur zu, wenn: ' + c.bedingung + '. Weil das noch nicht feststeht, wird er vorsichtshalber gezeigt — trage Baureihe und Getriebeart oben ein, dann filtert die Liste genauer.') : null,
    el('div', { class: 'f-meta' },
      el('span', { class: 'badge ' + sev.badge }, sev.label),
      c.cost ? el('span', { class: 'badge mute' }, 'Kosten: ' + c.cost) : null,
      c.tool ? el('span', { class: 'badge info' }, 'braucht: ' + c.tool) : null),
    el('label', { class: 'pform-f' },
      el('span', {}, 'Notiz'),
      el('input', { class: 'inp', placeholder: 'Beobachtung, Preisargument …', value: insp.notes[c.id] || '',
        oninput: e => { insp.notes[c.id] = e.target.value; persist(); } })));

  return el('details', { class: 'chk acc' + (mark ? ' m-' + mark : ''), open: mark === 'bad' },
    el('summary', { class: 'chk-h' },
      el('div', { class: 'chk-marks' },
        el('button', { class: 'mk ok', type: 'button', 'aria-pressed': mark === 'ok' ? 'true' : 'false',
          title: 'in Ordnung', 'aria-label': 'in Ordnung', onclick: e => { e.preventDefault(); e.stopPropagation(); set('ok'); } }, icon('check')),
        el('button', { class: 'mk bad', type: 'button', 'aria-pressed': mark === 'bad' ? 'true' : 'false',
          title: 'Befund', 'aria-label': 'Befund', onclick: e => { e.preventDefault(); e.stopPropagation(); set('bad'); } }, icon('tri')),
        el('button', { class: 'mk na', type: 'button', 'aria-pressed': mark === 'na' ? 'true' : 'false',
          title: 'übersprungen', 'aria-label': 'übersprungen', onclick: e => { e.preventDefault(); e.stopPropagation(); set('na'); } }, icon('minus'))),
      el('div', { class: 'chk-t' },
        el('b', {}, c.title),
        el('span', {}, c.what.length > 92 ? c.what.slice(0, 91) + '…' : c.what)),
      c.bedingung ? el('span', { class: 'badge mute', title: 'Gilt nur unter dieser Bedingung' }, c.bedingung) : null,
      c.severity === 'ko' ? el('span', { class: 'badge crit' }, 'K.o.') : null,
      el('div', { class: 'f-caret' }, '›')),
    body);
}

function buildMeasurePlan(page, prof, insp) {
  const plan = measuresFor(prof, insp);
  page.appendChild(noteBox('info', 'Wie diese Messfahrten gedacht sind',
    'Die Reihenfolge ist nicht beliebig. Der Kaltstart lässt sich pro Termin genau einmal aufzeichnen – ist der Motor bei der Ankunft schon warm, fehlt die aussagekräftigste Messung des ganzen Tages. Danach wird von ruhigen zu fordernden Zuständen gesteigert. Die Aufzeichnung läuft während der gesamten Probefahrt durch; getrennt werden die Abschnitte erst hinterher in der Auswertung.'));
  page.appendChild(el('div', { class: 'grid', style: { gap: '9px' } }, plan.map((m, i) =>
    el('details', { class: 'finding acc ' + (m.critical ? 'crit' : 'ok'), open: i < 2 },
      el('summary', { class: 'f-h' },
        el('div', { class: 'f-sym ' + (m.critical ? 'crit' : 'ok') }, String(i + 1)),
        el('div', { class: 'f-t' }, el('h4', {}, m.title),
          el('div', { class: 'f-grp' }, m.duration + (m.critical ? ' · nur einmal möglich' : ''))),
        el('div', { class: 'f-caret' }, '›')),
      el('div', { class: 'f-b' },
        el('p', {}, m.instruction),
        m.reveals && m.reveals.length ? el('ul', { class: 'f-act' }, m.reveals.map(r => el('li', {}, r))) : null,
        m.goodIf ? el('div', { class: 'iv ok' }, el('span', { class: 'iv-m' }, '✓'),
          el('div', {}, el('b', {}, 'Erwartet: '), m.goodIf)) : null,
        m.badIf ? el('div', { class: 'iv bad' }, el('span', { class: 'iv-m' }, '▲'),
          el('div', {}, el('b', {}, 'Auffällig: '), m.badIf)) : null)))));
}

function buildPidList(page, prof) {
  const pids = pidsFor(prof);
  const groups = [['pflicht', 'Pflicht'], ['wichtig', 'Sehr nützlich'], ['optional', 'Optional']];
  page.appendChild(noteBox('warn', 'Weniger ist mehr',
    typeof PID_LIMIT_NOTE === 'string' ? PID_LIMIT_NOTE
      : 'Je mehr Messwerte gleichzeitig abgefragt werden, desto seltener kommt jeder einzelne dran. Für eine belastbare Auswertung lieber wenige Werte schnell als viele langsam.'));
  groups.forEach(([g, label]) => {
    const list = pids.filter(p => p.prio === g);
    if (!list.length) return;
    page.appendChild(card(label + ' (' + list.length + ')', {
      hint: prof && prof.fuel === 'diesel' ? 'für Dieselmotoren' : 'für Ottomotoren',
      tools: el('button', { class: 'btn sm', onclick: e => {
        navigator.clipboard.writeText(list.map(p => p.name).join('\n'))
          .then(() => { e.target.textContent = 'kopiert'; setTimeout(() => { e.target.textContent = 'Namen kopieren'; }, 1800); })
          .catch(() => {});
      } }, 'Namen kopieren')
    }, el('div', { class: 'tblwrap' }, el('table', { class: 'tbl', style: { minWidth: '420px' } },
      el('thead', {}, el('tr', {}, el('th', {}, 'PID in der App'), el('th', {}, 'wofür'))),
      el('tbody', {}, list.map(p => el('tr', {},
        el('td', {}, p.name),
        el('td', { style: { textAlign: 'left', whiteSpace: 'normal' } }, p.why))))))));
  });
  if (prof && prof.extraPids && prof.extraPids.length)
    page.appendChild(card('Zusätzlich für dieses Fahrzeugprofil', {},
      el('div', { class: 'chiprow' }, prof.extraPids.map(p => el('span', { class: 'chip' }, p)))));
}

function buildWeakSpots(page, prof) {
  if (!prof || !prof.weakSpots || !prof.weakSpots.length) {
    page.appendChild(card('Keine Schwachstellen hinterlegt', {},
      emptyBox('Für dieses Profil liegen keine motorspezifischen Schwachstellen vor',
        'Wähle unter Einstellungen ein konkretes Fahrzeugprofil – bei den allgemeinen Profilen sind keine modellspezifischen Punkte hinterlegt.')));
    return;
  }
  page.appendChild(noteBox('info', 'Was hier steht',
    'Bekannte Schwachpunkte genau dieses Motors, jeweils mit der Signatur, an der man sie erkennt – entweder beim Termin oder später in den Messwerten. Das ist der Unterschied zwischen einer allgemeinen Checkliste und einer, die zum Fahrzeug vor dir passt.'));
  page.appendChild(card('Bekannte Schwachstellen · ' + prof.name, {},
    el('ul', { class: 'weak' }, prof.weakSpots.map(w =>
      el('li', {}, el('b', {}, w.t), el('span', {}, w.s), w.km ? el('span', { class: 'dim2' }, w.km) : null)))));
}

function inspectionText(insp, prof) {
  const checks = checksFor(prof, insp);
  const sc = inspectionScore(insp, prof);
  const L = [];
  L.push('BESICHTIGUNGSPROTOKOLL');
  L.push(insp.name || 'Ohne Bezeichnung');
  if (insp.year || insp.km || insp.price)
    L.push([insp.year ? 'EZ ' + insp.year : null, insp.km ? insp.km + ' km' : null,
            insp.price ? insp.price + ' EUR' : null].filter(Boolean).join('  ·  '));
  if (insp.vin) L.push('FIN: ' + insp.vin);
  if (insp.seller) L.push('Verkaeufer: ' + insp.seller);
  L.push('Profil: ' + (prof ? prof.name : 'keines'));
  L.push('');
  L.push('ERGEBNIS: ' + sc.done + ' von ' + sc.total + ' Punkten geprueft, ' + sc.bad + ' Befunde, ' +
         sc.ko + ' Abbruchkriterien');
  let lo = 0, hi = 0;
  checks.forEach(c => { if (insp.marks[c.id] === 'bad') { const k = parseCost(c.cost); if (k) { lo += k[0]; hi += k[1]; } } });
  if (hi) L.push('Bekannte Maengel grob: ' + lo + '-' + hi + ' EUR');
  for (const ph of BUY_PHASES) {
    const items = checks.filter(c => c.phase === ph.id);
    if (!items.length) continue;
    L.push('');
    L.push('== ' + ph.label.toUpperCase() + ' ==');
    for (const c of items) {
      const m = insp.marks[c.id];
      const tag = m === 'ok' ? '[ok  ]' : m === 'bad' ? '[!!  ]' : m === 'na' ? '[ -- ]' : '[    ]';
      L.push(tag + ' ' + c.title + (c.severity === 'ko' ? '   (K.o.-Kriterium)' : ''));
      if (m === 'bad') {
        L.push('        ' + c.bad);
        if (c.cost) L.push('        Kosten: ' + c.cost);
      }
      if (insp.notes[c.id]) L.push('        Notiz: ' + insp.notes[c.id]);
    }
  }
  L.push('');
  L.push('Nicht geprueft bedeutet nicht in Ordnung, sondern offen.');
  L.push('Erzeugt mit OBD Telemetrie Studio.');
  return L.join('\n');
}
function inspectionFileName(insp) {
  return ('Besichtigung_' + (insp.name || 'Fahrzeug')).replace(/[^\wäöüÄÖÜß.\- ]+/g, '_') + '.txt';
}
function exportInspection(insp, prof) {
  download(inspectionFileName(insp), 'text/plain;charset=utf-8', inspectionText(insp, prof));
}
async function shareInspection(insp, prof) {
  const f = new File([inspectionText(insp, prof)], inspectionFileName(insp), { type: 'text/plain' });
  try { await navigator.share({ title: 'Besichtigung ' + (insp.name || ''), files: [f] }); }
  catch (e) { if (e && e.name !== 'AbortError') exportInspection(insp, prof); }
}

/* --- KI-Prompt --- */
BUILDERS.ai = function (page) {
  const key = store.get('aiDetail', 'standard');
  let xml = '';
  const out = el('pre', { class: 'xmlbox' });
  const meter = el('div', { class: 'chiprow', style: { alignItems: 'center' } });
  const copyBtn = el('button', { class: 'btn primary big' }, icon('clip'), 'Prompt in die Zwischenablage kopieren');

  function build(k) {
    store.set('aiDetail', k);
    xml = buildAiPrompt(k, store.get('aiVariant', 'analyse'));
    out.textContent = xml;
    const kb = xml.length / 1024;
    const tok = Math.round(xml.length / 3.6 / 100) * 100;
    meter.innerHTML = '';
    meter.appendChild(el('span', { class: 'badge ' + (tok > 120000 ? 'warn' : 'ok') },
      fmt(kb, 0) + ' KB · etwa ' + fmt(tok, 0) + ' Token'));
    meter.appendChild(el('span', { class: 'dim2', style: { fontSize: '12px' } },
      tok > 120000 ? 'Das ist viel — bei knappem Kontextfenster eine kleinere Stufe wählen.'
                   : 'Passt in das Kontextfenster gängiger Modelle.'));
  }
  build(key);

  const seg = el('div', { class: 'seg' }, Object.keys(AI_DETAIL).map(k =>
    el('button', { type: 'button', 'aria-pressed': k === key ? 'true' : 'false',
      onclick: e => { Array.from(e.target.parentNode.children).forEach(b =>
        b.setAttribute('aria-pressed', b === e.target ? 'true' : 'false')); build(k); } },
      AI_DETAIL[k].label)));
  const vkey = store.get('aiVariant', 'analyse');
  const vseg = el('div', { class: 'seg' }, Object.keys(AI_VARIANTS).map(k =>
    el('button', { type: 'button', 'aria-pressed': k === vkey ? 'true' : 'false', title: AI_VARIANTS[k].hint,
      onclick: e => { store.set('aiVariant', k); Array.from(e.target.parentNode.children).forEach(b =>
        b.setAttribute('aria-pressed', b === e.target ? 'true' : 'false')); build(store.get('aiDetail', 'standard')); } },
      AI_VARIANTS[k].label)));

  page.appendChild(noteBox('info', 'Was das ist',
    'Dieses Werkzeug rechnet die Fahrt aus, ordnet sie in Sollbereiche ein und sagt, wo die Datenlage für ein Urteil nicht reicht. ' +
    'Was es nicht kann, ist mit dir über die Befunde zu sprechen. Genau dafür ist der Knopf unten: er legt die komplette Auswertung ' +
    'als XML-Dokument in die Zwischenablage — mit Anleitung, Fahrzeugprofil, allen Kennzahlen, den Befunden und einer ' +
    'heruntergerechneten Zeitreihe. Das fügst du bei ChatGPT, Claude, Gemini oder einem anderen Sprachmodell ein und stellst deine Fragen.'));

  /* --- Zusammenfassung teilen --- */
  {
    const shHost = el('div');
    const out = el('input', { class: 'inp', readonly: true, style: { flex: '1 1 260px', minWidth: '0' }, onclick: e => e.target.select() });
    const info = el('p', { class: 'dim2', style: { fontSize: '11.5px', marginTop: '10px' } });
    const make = async () => {
      try {
        const url = shareUrl(await encodeShare(shareSummary(App.ds, App.diag, App.profile, App.gears, App.fileName)));
        out.value = url;
        info.textContent = 'Länge ' + fmt(url.length / 1024, 1) + ' KB' + (url.length > 8000
          ? ' – für manche Messenger zu lang; dann lieber die Bericht-JSON aus der Datenqualität schicken.'
          : ' – passt in Nachricht und Adresszeile.');
      } catch (e) { out.value = ''; info.textContent = 'Fehler: ' + (e.message || e); }
    };
    shHost.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center' } },
      el('button', { class: 'btn', type: 'button', onclick: make }, 'Link erzeugen'), out,
      el('button', { class: 'btn', type: 'button', onclick: async () => { if (!out.value) await make(); try { await navigator.clipboard.writeText(out.value); } catch (e) {} } }, 'Kopieren')));
    shHost.appendChild(info);
    page.appendChild(card('Zusammenfassung teilen', {
      hint: 'Kennzahlen und Befunde in der Adresse – ohne Server, ohne Route',
      info: { read: 'Der Link enthält die Kennzahlen der Fahrt, die bewerteten Befunde und das Fahrzeugprofil, gepackt und in der Adresse kodiert. Keine Route, keine Rohdaten, keine Zeitreihe. Wer ihn öffnet, sieht dieselbe Zusammenfassung im eigenen Browser – nichts davon läuft über einen Server.',
              good: 'Für die Werkstatt, den Verkäufer oder ein Forum: kurz, nachvollziehbar, ohne Anhang.',
              bad: 'Sehr lange Links werden von manchen Messengern abgeschnitten. Der Hinweis unter dem Feld nennt die Länge.' }
    }, shHost));
  }

  page.appendChild(card('Prompt erzeugen', {
    hint: 'die Rohdatei bleibt außen vor — 28 MB passen in kein Kontextfenster',
    tools: [vseg, seg],
    info: {
      read: 'Die Stufe steuert, wie fein die Zeitreihe aufgelöst wird und ob die Werteverteilungen mitgehen. „Kompakt“ enthält Kennzahlen und Befunde mit einem Messpunkt alle 15 Sekunden, „Vollständig“ alle zwei Sekunden.',
      good: 'Für die meisten Fragen reicht „Standard“. Wenn das Modell sich über die Länge beschwert oder abschneidet, eine Stufe zurück.',
      bad: 'Mehr Detail ist nicht automatisch besser: eine sehr lange Zeitreihe verdrängt im Kontextfenster die Befunde, auf die es eigentlich ankommt.'
    },
    foot: AI_DETAIL[key] ? AI_DETAIL[key].hint : null
  },
    meter,
    el('div', { class: 'chiprow', style: { marginTop: '12px' } },
      copyBtn,
      el('button', { class: 'btn', onclick: () => download(baseName() + '_ki-prompt.xml', 'application/xml', xml) },
        icon('dl'), 'Als Datei'),
      canShareFiles() ? el('button', { class: 'btn', onclick: async () => {
        const f = new File([xml], baseName() + '_ki-prompt.xml', { type: 'application/xml' });
        try { await navigator.share({ title: 'Fahrtauswertung als KI-Prompt', files: [f] }); }
        catch (e) { if (e && e.name !== 'AbortError') download(f.name, 'application/xml', xml); }
      } }, icon('share'), 'Teilen') : null)));

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(xml).then(() => {
      copyBtn.innerHTML = '';
      copyBtn.appendChild(icon('check'));
      copyBtn.appendChild(document.createTextNode(' Kopiert — jetzt beim Sprachmodell einfügen'));
      copyBtn.classList.add('done');
      setTimeout(() => {
        copyBtn.innerHTML = ''; copyBtn.classList.remove('done');
        copyBtn.appendChild(icon('clip'));
        copyBtn.appendChild(document.createTextNode(' Prompt in die Zwischenablage kopieren'));
      }, 3200);
    }).catch(() => {
      const r = document.createRange(); r.selectNodeContents(out);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      alert('Der Browser hat das Kopieren abgelehnt. Der Text ist jetzt markiert – mit ⌘C beziehungsweise Strg+C kopieren.');
    });
  });

  page.appendChild(card('So gehst du vor', {},
    el('ol', { class: 'recipe' },
      el('li', {}, el('div', {}, el('b', {}, 'Prompt kopieren'),
        el('span', {}, 'Der Knopf oben legt das gesamte XML in die Zwischenablage.'))),
      el('li', {}, el('div', {}, el('b', {}, 'Beim Sprachmodell einfügen'),
        el('span', {}, 'ChatGPT, Claude, Gemini, Mistral – gleich welches. Einfügen und abschicken. Die Anleitung steckt im Dokument, du musst nichts dazuschreiben.'))),
      el('li', {}, el('div', {}, el('b', {}, 'Nachfragen stellen'),
        el('span', {}, 'Danach ganz normal weiterfragen: „Woran erkenne ich, ob es wirklich der Ladeluftkühler ist?“, „Was soll ich beim nächsten Log zusätzlich aufzeichnen?“, „Lohnt die Reparatur bei diesem Kilometerstand?“'))),
      el('li', {}, el('div', {}, el('b', {}, 'Antworten kritisch lesen'),
        el('span', {}, 'Im Dokument steht ausdrücklich, welche Werte gemessen und welche nur gerechnet sind und wo die Datenlage nicht reicht. Behauptet das Modell trotzdem etwas darüber hinaus, ist es geraten.')))),
    el('p', { class: 'card-f', style: { padding: '12px 0 0', borderTop: 0 } },
      'Datenschutz: das XML enthält keine Koordinaten und keine Fahrzeugidentifikationsnummer, aber Zeitstempel, Kilometerstand und – falls eingetragen – die Angaben aus dem Kaufcheck. Beim Einfügen in einen fremden Dienst verlassen diese Angaben dein Gerät.')));

  page.appendChild(card('Vorschau', {
    hint: 'so sieht das Dokument aus, das kopiert wird',
    tools: el('span', { class: 'badge mute' }, 'XML')
  }, out));
};

/* --- Datenqualität --- */
/* Widersprechen sich die Streckenquellen, muss das sichtbar sein statt still gewählt. */
function distDisputeNote(ds) {
  const T = ds.trip;
  if (!T.distDisputed) return null;
  const c = T.distCands || [];
  return noteBox('warn', 'Die Streckenangaben widersprechen sich um ' + fmt(T.distSpread * 100, 0) + ' %',
    c.map(x => fmt(x.v, 2) + ' km (' + x.src + ', sieht ' + x.deckung + ' % der Fahrt)').join(' · ') +
    '. Verwendet wird ' + fmt(T.dist, 2) + ' km aus der Quelle „' + T.distSource + '“. ' +
    (T.gapDist > 0.5
      ? 'Der GPS-Track überbrückt ' + fmt(T.gapDist, 1) + ' km als Luftlinie über Datenlücken – diese Strecke wurde ' +
        'nicht gemessen, sondern nur zwischen dem letzten und dem nächsten Fix gerade durchgezogen. Bei langen ' +
        'Ausfällen ist der GPS-Wert deshalb keine Fahrleistung.'
      : 'Das deutet darauf hin, dass eine der Quellen nicht die ganze Fahrt abdeckt.'));
}
/* ===== Tacho & Reifen ============================================== */
BUILDERS.tyres = function (page) {
  const ds = App.ds, G = ds.G;
  const r = speedRatioAnalysis(G, ds.grid);
  const ecuCircum = rollCircumNow();
  const profTyre = App.profile && App.profile.specs && App.profile.specs.tyre || '';
  const mountedStr = store.get('tyreMounted', profTyre);
  const mounted = parseTyre(mountedStr);
  const overPct = +store.get('tachoOverPct', 0) || 0, overKmh = +store.get('tachoOverKmh', 0) || 0;

  page.appendChild(el('div', { class: 'sech' },
    el('p', {}, 'Das Steuergerät rechnet die Raddrehzahl mit einem festen Abrollumfang in km/h um. GPS misst, wie schnell das Auto wirklich ist. Aus dem Verhältnis folgt, was Tempomat und Tacho tatsächlich bedeuten und ob die Bereifung zur Annahme des Steuergeräts passt.')));

  /* --- Radsensor gegen GPS --- */
  if (!r.ok) {
    page.appendChild(card('Radsensor gegen GPS', { hint: 'Reifenfaktor aus der Fahrt' },
      emptyBox('Kein belastbarer Vergleich möglich', r.reason + '. Dafür braucht es OBD-Geschwindigkeit und GPS-Geschwindigkeit in derselben Aufzeichnung und einige Minuten gleichmäßige Fahrt ab 45 km/h.')));
  } else {
    const kPct = (r.k - 1) * 100;
    const K = el('div', { class: 'grid kpis' },
      kpi('Reifenfaktor', fmt(r.k, 4), '', 'v_GPS ÷ v_OBD, Median aus ' + fmt(r.n, 0) + ' ruhigen Punkten', { accent: true }),
      kpi('Radsensor gegenüber GPS', ((1 / r.k - 1) >= 0 ? '+' : '') + fmt((1 / r.k - 1) * 100, 1), '%', kPct < 0 ? 'zeigt zu viel an – Auto ist langsamer' : kPct > 0 ? 'zeigt zu wenig an – Auto ist schneller' : 'stimmt'),
      kpi('Streuung', '±' + fmt(r.mad * 100, 2), '%', 'Median-Abweichung, Güte: ' + r.quality),
      kpi('Über Tempo konstant', r.consistent ? 'ja' : 'nein', '', r.consistent ? 'passt zu einem Reifeneffekt' : 'Faktor wandert mit dem Tempo – eher GPS oder Latenz'));
    const binRows = r.bins.map(b => el('tr', {}, el('td', {}, b.lo + '–' + (b.hi > 250 ? '…' : b.hi) + ' km/h'),
      el('td', { class: 'n' }, fmt(b.n, 0)), el('td', { class: 'n' }, b.k === b.k ? fmt(b.k, 4) : '–'),
      el('td', { class: 'n' }, b.k === b.k ? ((b.k - 1) >= 0 ? '+' : '') + fmt((b.k - 1) * 100, 2) + ' %' : '–')));
    const cc = chartCard('GPS gegen Radsensor', { legend: false, height: 300, hint: 'jeder Punkt eine ruhige Sekunde; liegt alles auf einer Geraden, ist es der Reifen' },
      { type: 'scatter', xTitle: 'OBD-Geschwindigkeit (km/h)', yTitle: 'GPS (km/h)' });
    const lo = Math.min(...r.xs) - 5, hi = Math.max(...r.xs) + 5;
    cc.chart.scatterData = { x: r.xs, y: r.ys, n: r.n, xlo: lo, xhi: hi, ylo: lo, yhi: hi, r: 1.8 };
    cc.chart.xTitle = 'OBD-Geschwindigkeit (km/h)'; cc.chart.yTitle = 'GPS (km/h)';
    requestAnimationFrame(() => cc.chart.draw());
    page.appendChild(card('Radsensor gegen GPS', {
      hint: 'Reifenfaktor aus der Fahrt',
      info: { read: 'Verglichen werden nur Sekunden, in denen beide Geschwindigkeiten vorliegen, das Auto mindestens 45 km/h fährt und kaum beschleunigt. Der Faktor ist der Median der Verhältnisse; die Tabelle zeigt ihn je Geschwindigkeitsklasse.',
              good: 'Faktor in allen Klassen gleich, Streuung unter ±1 %. Dann ist die Abweichung ein Reifeneffekt und kein Messfehler.',
              bad: 'Faktor wandert mit dem Tempo oder streut stark: GPS-Rauschen, Latenz zwischen OBD und GPS oder Fahrt im Wald. Dann lieber eine ruhige Autobahnfahrt aufzeichnen.' }
    }, K, el('div', { class: 'tblwrap', style: { marginTop: '12px' } }, el('table', { class: 'tbl', style: { minWidth: '360px' } },
      el('thead', {}, el('tr', {}, el('th', {}, 'Klasse'), el('th', {}, 'Punkte'), el('th', {}, 'Faktor'), el('th', {}, 'Abweichung'))),
      el('tbody', {}, ...binRows)))));
    page.appendChild(cc.node);
  }

  /* --- Tempomat --- */
  const k = r.ok ? r.k : 1;
  const inpPct = el('input', { class: 'inp', type: 'number', step: '0.5', min: '0', max: '12', value: String(overPct), style: { width: '80px' },
    onchange: e => { store.set('tachoOverPct', +e.target.value || 0); go('tyres', true); } });
  const inpKmh = el('input', { class: 'inp', type: 'number', step: '1', min: '0', max: '6', value: String(overKmh), style: { width: '80px' },
    onchange: e => { store.set('tachoOverKmh', +e.target.value || 0); go('tyres', true); } });
  const rows = cruiseTable(k, overPct, overKmh).map(x => el('tr', {},
    el('td', { class: 'n' }, fmt(x.set, 0) + ' km/h'), el('td', { class: 'n' }, fmt(x.obd, 1)), el('td', { class: 'n' }, fmt(x.real, 1)),
    el('td', { class: 'n' }, ((x.real - x.set) >= 0 ? '+' : '') + fmt(x.real - x.set, 1))));
  page.appendChild(card('Tempomat und Tacho', {
    hint: r.ok ? 'was eine eingestellte Geschwindigkeit wirklich bedeutet' : 'ohne gemessenen Faktor gilt hier 1,0',
    info: { read: 'Der Tempomat hält die Geschwindigkeit des Steuergeräts, also die OBD-Geschwindigkeit. Multipliziert mit dem Reifenfaktor ergibt sich, wie schnell das Auto wirklich fährt. Zeigt die Anzeige zusätzlich voreilend an (das dürfen Tachos: nie weniger, höchstens +10 % + 4 km/h), trage die Voreilung ein – messen kannst du sie, indem du bei gleichmäßiger Fahrt die Tachoanzeige mit der OBD-Geschwindigkeit im Zeitreihen-Messfenster vergleichst.',
            good: 'Bei Faktor nahe 1 und kleiner Voreilung fährst du bei „130“ etwa 125 bis 128 km/h.',
            bad: 'Ein Faktor unter 0,97 heißt: das Auto ist über 3 % langsamer als angezeigt. Dann ist der Reifen kleiner als das Steuergerät annimmt, oder er ist weit abgefahren.' }
  },
    el('div', { class: 'chiprow', style: { alignItems: 'center', marginBottom: '10px' } },
      el('span', { class: 'field' }, el('span', { class: 'dim' }, 'Anzeige eilt vor um'), inpPct, el('span', { class: 'dim' }, '%')),
      el('span', { class: 'field' }, el('span', { class: 'dim' }, 'plus'), inpKmh, el('span', { class: 'dim' }, 'km/h'))),
    el('div', { class: 'tblwrap' }, el('table', { class: 'tbl', style: { minWidth: '380px' } },
      el('thead', {}, el('tr', {}, el('th', {}, 'Eingestellt'), el('th', {}, 'Radsensor'), el('th', {}, 'Wirklich'), el('th', {}, 'Differenz'))),
      el('tbody', {}, ...rows)))));

  /* --- Reifenrechner --- */
  const inpTyre = el('input', { class: 'inp', type: 'text', value: mountedStr, placeholder: 'z. B. 255/35 R19', style: { width: '150px' },
    onchange: e => { store.set('tyreMounted', e.target.value.trim()); go('tyres', true); } });
  const inpEcu = el('input', { class: 'inp', type: 'number', step: '0.001', min: '1.2', max: '3', value: fmt(ecuCircum, 3).replace(',', '.'), style: { width: '100px' },
    onchange: e => { const v = parseFloat(e.target.value); if (v > 1.2 && v < 3) { store.set('rollCircum', v); if (App.profile) App.profile.specs.rollCircum = v; recompute(); } } });
  const it = tyreInterpretation(k, ecuCircum, mounted);
  const items = [];
  if (mounted) items.push(kpi('Montiert laut Angabe', mounted.label, '', 'Ø ' + fmt(mounted.diameterMm, 0) + ' mm · Abrollumfang neu ' + fmt(mounted.rollCircum, 3) + ' m'));
  items.push(kpi('Steuergerät rechnet mit', fmt(ecuCircum, 3), 'm', 'Abrollumfang aus dem Profil, unten änderbar'));
  if (r.ok) items.push(kpi('Wirksamer Umfang', fmt(it.effectiveCircum, 3), 'm', 'Reifenfaktor × Annahme des Steuergeräts', { accent: true }));
  if (r.ok && mounted) items.push(kpi('Gegen die Angabe', (it.devMountedPct >= 0 ? '+' : '') + fmt(it.devMountedPct, 1), '%',
    Math.abs(it.devMountedPct) < 1 ? 'passt – innerhalb Profilverschleiß' : it.devMountedPct < 0 ? 'entspricht ' + fmt(it.treadMm, 0) + ' mm weniger Radius: abgefahren oder kleinere Größe' : 'größer als angegeben – andere Größe oder Steuergerät falsch kodiert'));
  const cands = r.ok ? tyreCandidates(it.effectiveCircum, 1.2, 10) : [];
  page.appendChild(card('Reifenrechner', {
    hint: 'Reifengröße, Abrollumfang und was das Steuergerät annimmt',
    info: { read: 'Aus Breite, Querschnitt und Felge folgt der Durchmesser, daraus der Abrollumfang (etwa 97 % des Umfangs, weil der Reifen unter Last abplattet). Der wirksame Umfang aus der Messung ist Reifenfaktor mal Annahme des Steuergeräts. Weicht er von der montierten Größe ab, ist entweder Profil weg (1 mm Profil = 2 mm Durchmesser = 0,3 %) oder es steckt eine andere Größe drauf als angegeben.',
            good: 'Wirksamer Umfang innerhalb 1 % der montierten Größe.',
            bad: 'Mehr als 3 % Abweichung: Reifen prüfen, Tacho und Tempomat stimmen dann spürbar nicht.' }
  },
    el('div', { class: 'chiprow', style: { alignItems: 'center', marginBottom: '12px' } },
      el('span', { class: 'field' }, el('span', { class: 'dim' }, 'Montiert'), inpTyre),
      el('span', { class: 'field' }, el('span', { class: 'dim' }, 'Steuergerät-Umfang'), inpEcu, el('span', { class: 'dim' }, 'm')),
      r.ok ? el('button', { class: 'btn sm', type: 'button', onclick: () => { store.set('rollCircum', +it.effectiveCircum.toFixed(4)); if (App.profile) App.profile.specs.rollCircum = +it.effectiveCircum.toFixed(4); recompute(); } }, 'Wirksamen Umfang für die Gangerkennung übernehmen') : null),
    el('div', { class: 'grid kpis' }, ...items),
    cands.length ? el('div', { style: { marginTop: '12px' } },
      el('div', { class: 'lbl-eng', style: { marginBottom: '6px' } }, 'Größen, die zum wirksamen Umfang passen'),
      el('div', { class: 'chiprow' }, cands.map(c => el('span', { class: 'chip' + (mounted && c.label === mounted.label ? ' on' : ''), 'aria-pressed': mounted && c.label === mounted.label ? 'true' : 'false' },
        c.label, el('span', { class: 'dim2', style: { fontSize: '11px' } }, (c.dev >= 0 ? '+' : '') + fmt(c.dev, 1) + ' %'))))) : null,
    mountedStr && !mounted ? el('p', { class: 'dim2', style: { marginTop: '8px', fontSize: '12px' } }, 'Die Reifengröße „' + mountedStr + '“ verstehe ich nicht – bitte als 255/35 R19 schreiben.') : null));

  page.appendChild(noteBox('info', 'Was der Reifenfaktor kann und was nicht',
    'GPS-Geschwindigkeit aus dem Handy ist bei gleichmäßiger Fahrt auf ±1 km/h genau; bei 100 km/h ist das ±1 %. Deshalb zählt nur der Median vieler ruhiger Sekunden, nicht ein einzelner Wert. Was er nicht kann: die Tachoanzeige selbst messen – die eilt herstellerseitig vor, und den Betrag kennt nur ein Blick auf die Anzeige während der Fahrt.'));
};

BUILDERS.data = function (page) {
  const ds = App.ds, m = ds.meta;
  page.appendChild(sectionHead('Datenqualität', 'Was tatsächlich in der Datei steht – bevor irgendetwas daraus geschlossen wird.'));
  { const n = distDisputeNote(ds); if (n) page.appendChild(n); }

  page.appendChild(el('div', { class: 'grid kpis' },
    kpi('Datenzeilen', fmt(m.rows, 0), '', m.skipped ? fmt(m.skipped, 0) + ' übersprungen' : 'alle verwertet'),
    kpi('Messreihen', fmt(m.seriesCount, 0), '',
        Array.from(ds.metrics.values()).filter(x => x.derived).length + ' Größen zusätzlich berechnet'),
    kpi('Format', m.format === 'long' ? 'Long' : 'Wide', '', 'Trenner „' + m.delimiter + '“ · Dezimal „' + m.decimal + '“'),
    kpi('Zeitbasis', { daysec: 'Tageszeit', epoch_s: 'Unix-Zeit', epoch_ms: 'Unix-Zeit (ms)', clock: 'Uhrzeit', date: 'Datum', relative: 'relativ' }[m.timeFormat] || m.timeFormat, '',
        fmtClock(ds.t0) + ' – ' + fmtClock(ds.t1)),
    kpi('GPS-Punkte', fmt(m.gpsPoints, 0), '', m.gpsSource ? 'aus „' + m.gpsSource + '“' : 'aus den Datenzeilen'),
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
    hint: 'Anteil der Fahrtdauer mit gültigen Werten',
    info: {
      read: 'Für jede Messgröße: unter welchem Namen sie in der Datei steht, wie viele Messpunkte es gibt, mit welcher Rate sie abgetastet wurde und über welchen Anteil der Fahrt gültige Werte vorliegen. Der Balken ist grün ab 80 %, gelb ab 40 %, sonst rot.',
      good: 'Die für die Diagnose wichtigen Größen sollten grün sein. Eine Rate um 5 Hz reicht für alles außer der Erkennung sehr kurzer Ereignisse.',
      bad: 'Niedrige Abdeckung heißt nicht Defekt, sondern fehlende Daten. OBD-Apps erweitern die Auswahl der abgefragten Werte mitunter mitten in der Sitzung, und je mehr Werte gleichzeitig abgefragt werden, desto langsamer wird jeder einzelne. Wer viele Größen braucht, sollte die Liste in der App auf das Nötige kürzen.'
    }
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
      ds.track ? el('button', { class: 'btn', onclick: exportGpx }, icon('dl'), 'Route als GPX') : null,
      canShareFiles() ? el('button', { class: 'btn primary', onclick: shareReport }, icon('share'), 'Bericht teilen') : null)));
};


/* --- Getriebe: Gangnummern statt Nummerierung nach Übersetzung --- */
function gearboxCard() {
  const wrap = el('div', {});
  const render = () => {
    wrap.innerHTML = '';
    const s = gearboxSetting() || { mode: '' };
    const rc = rollCircumNow();

    const modeSel = el('select', { class: 'sel', onchange: e => {
      const m = e.target.value;
      if (!m) setGearboxSetting(null);
      else if (m === 'catalog') setGearboxSetting({ mode: 'catalog', id: s.id || '' });
      else if (m === 'manual') setGearboxSetting({ mode: 'manual', gears: s.gears || 6, ratios: s.ratios || [], final: s.final || 0 });
      else setGearboxSetting({ mode: 'count', gears: s.gears || 6, firstGear: s.firstGear || 0 });
      render(); recompute();
    } }, GEARBOX_MODES.map(m => el('option', { value: m.id, selected: m.id === s.mode ? true : null }, m.label)));
    wrap.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center', marginBottom: '10px' } },
      el('span', { class: 'dim', style: { fontSize: '12.5px' } }, 'Angabe'), modeSel));

    if (s.mode === 'catalog') {
      if (!GEARBOXES.length) {
        wrap.appendChild(noteBox('warn', 'Noch kein Getriebe im Katalog',
          'Für dieses Werkzeug sind noch keine Werksübersetzungen hinterlegt. Trag sie über „Übersetzungen selbst eintragen" ein – die Zahlen stehen in den Fahrzeugpapieren, im Reparaturleitfaden oder im Selbststudienprogramm des Herstellers.'));
      } else {
        const q = el('input', { class: 'inp', type: 'search', placeholder: 'Getriebe suchen – Kennung, Name oder Fahrzeug …', style: { width: '100%', marginBottom: '8px' } });
        const list = el('div', { class: 'plist' });
        const paint = () => {
          const t = q.value.trim().toLowerCase();
          const hits = GEARBOXES.filter(g => !t ||
            (g.kennung + ' ' + g.name + ' ' + (g.models || '') + ' ' + (g.brand || '')).toLowerCase().indexOf(t) >= 0);
          list.innerHTML = '';
          if (!hits.length) { list.appendChild(el('p', { class: 'dim' }, 'Nichts gefunden.')); return; }
          hits.slice(0, 40).forEach(g => list.appendChild(el('button', {
            class: 'prow', type: 'button', 'aria-pressed': g.id === s.id ? 'true' : 'false',
            onclick: () => { setGearboxSetting({ mode: 'catalog', id: g.id, final: s.final || 0 }); render(); recompute(); } },
            el('div', { class: 'prow-t' },
              el('b', {}, g.kennung + ' · ' + g.name),
              el('span', {}, g.gears + ' Gänge · ' + (g.models || ''))),
            el('span', { class: 'badge ' + (g.confidence === 'hoch' ? 'ok' : 'mute') },
              'Datenlage ' + (g.confidence || 'unbekannt')))));
          if (hits.length > 40) list.appendChild(el('p', { class: 'dim' }, 'und ' + (hits.length - 40) + ' weitere – Suche eingrenzen.'));
        };
        q.addEventListener('input', paint); paint();
        wrap.appendChild(q); wrap.appendChild(list);
      // Vorschlag aus der Messung: die Abstaende der Uebersetzungen sind ein
      // Fingerabdruck, den der Achsantrieb nicht veraendert.
      if (App.gears && App.gears.gears.length >= 4 && GEARBOXES.length) {
        const meas = App.gears.gears.map(g => g.kmhPer1000).sort((a, b) => a - b);
        const sug = suggestGearboxes(meas, rc, 4, App.profile).filter(h => h.worst <= 0.06);
        if (sug.length) {
          const box = el('div', { class: 'sugg' });
          box.appendChild(el('div', { class: 'sugg-h' },
            el('b', {}, 'Aus der Messung vorgeschlagen'),
            el('span', {}, sug[0].verdict && sug[0].verdict.clear
              ? 'Eine Abstufung passt deutlich besser als alle anderen.'
              : 'Mehrere Getriebe sind ähnlich abgestuft – die Messung allein entscheidet das nicht.')));
          sug.forEach((h, i) => {
            const gut = h.worst <= 0.012;
            box.appendChild(el('button', { class: 'sugg-r' + (i === 0 ? ' top' : ''), type: 'button',
              onclick: () => {
                if (h.variants.length > 1) { q.value = h.gb.kennung; paint(); q.scrollIntoView({ block: 'nearest' }); return; }
                setGearboxSetting({ mode: 'catalog', id: h.gb.id, final: 0 }); render(); recompute();
              } },
              el('div', { class: 'sugg-t' },
                el('b', {}, h.gb.kennung + ' · ' + h.gb.gears + ' Gänge'),
                el('span', {}, h.gb.models || '')),
              el('div', { class: 'sugg-m' },
                h.affinity === 2 ? el('span', { class: 'badge ok' }, 'passt zum Fahrzeug') : null,
                el('span', { class: 'badge ' + (gut ? 'ok' : 'mute') }, fmt(h.worst * 100, 1) + ' % Abweichung'),
                h.variants.length > 1
                  ? el('span', { class: 'badge mute' }, h.variants.length + ' Varianten')
                  : el('span', { class: 'badge mute' }, 'Achse ' + fmt(h.final, 2)))));
          });
          box.appendChild(el('p', { class: 'sugg-f' },
            'Verglichen werden nur die Abstände der Gänge – dafür muss der Achsantrieb nicht bekannt sein. ' +
            'Unter 1 % passt die Abstufung sehr genau, darüber kommen mehrere Getriebe in Frage. ' +
            'Welches verbaut ist, entscheidet aber nicht die Messung, sondern dein Auto: Fahrzeugschein, ' +
            'Reparaturleitfaden oder das Typschild am Getriebe. Steht „passt zum Fahrzeug“, deckt sich der ' +
            'Eintrag mit dem gewählten Motorprofil – das ist der belastbarste Hinweis hier. Stufenlose ' +
            'Getriebe stehen bewusst nicht in der Liste: ihre Stufen sind Software und passen zufällig zu vielem.'));
          wrap.appendChild(box);
        }
      }
        const gb = gearboxById(s.id);
        if (gb) {
          const gi2 = App.gears && App.gears.gearbox;
          const fitted = gi2 && gi2.finalFitted;
          wrap.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center', marginTop: '10px' } },
            el('span', { class: 'dim', style: { fontSize: '12.5px' } }, 'Achsantrieb'),
            el('input', { class: 'inp', type: 'number', step: '0.001', style: { width: '110px' },
              placeholder: gb.final > 0 ? String(gb.final) : (fitted ? fmt(fitted, 3) : 'aus Messung'),
              value: s.final > 0 ? String(s.final) : '',
              onchange: e => { const v = parseFloat(e.target.value);
                setGearboxSetting(Object.assign({}, s, { final: v > 0 ? v : 0 })); render(); recompute(); } }),
            el('span', { class: 'dim', style: { fontSize: '12px' } },
              gb.final > 0 ? 'Werkswert ' + fmt(gb.final, 3) + ' – nur ändern, wenn dein Fahrzeug abweicht'
                           : 'steht am Fahrzeug, nicht am Getriebe – leer lassen, dann wird er aus der Messung bestimmt')));
          if (!(s.final > 0) && fitted)
            wrap.appendChild(noteBox('ok', 'Achsantrieb aus der Messung bestimmt: ' + fmt(fitted, 3),
              'Die Abstände der gemessenen Übersetzungen passen zu ' + gb.kennung + '; daraus folgt dieser Achsantrieb. ' +
              'Er hängt am eingestellten Abrollumfang (' + fmt(rc, 3) + ' m) – stimmt der nicht, ist auch dieser Wert verschoben, ' +
              'die Gangnummern bleiben davon aber unberührt.'));
          if (gi2 && gi2.needsFinal)
            wrap.appendChild(noteBox('warn', 'Achsantrieb ließ sich nicht aus der Messung bestimmen',
              'Die gemessenen Übersetzungen passen nicht zu den Abständen dieses Getriebes' +
              (isFinite(gi2.fitWorst) ? ' (beste Anpassung noch ' + fmt(gi2.fitWorst * 100, 1) + ' % daneben)' : '') +
              '. Entweder ist es ein anderes Getriebe, oder es wurden zu wenige Gänge gefahren. Die Gangzahl (' +
              gb.gears + ') wird trotzdem verwendet.'));
          if (gb.hinweis) wrap.appendChild(el('p', { class: 'dim2', style: { fontSize: '12px', marginTop: '8px' } }, gb.hinweis));
          if (gb.quelle) wrap.appendChild(el('p', { class: 'dim2', style: { fontSize: '11.5px', marginTop: '4px' } }, 'Quelle: ' + gb.quelle));
        }
      }
    }

    if (s.mode === 'manual') {
      const nGears = Math.max(2, Math.min(10, s.gears | 0 || 6));
      const ratios = (s.ratios || []).slice(0, nGears);
      const save = patch => { setGearboxSetting(Object.assign({ mode: 'manual' }, s, patch)); render(); recompute(); };
      wrap.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center', marginBottom: '10px' } },
        el('span', { class: 'dim', style: { fontSize: '12.5px' } }, 'Anzahl Gänge'),
        el('input', { class: 'inp', type: 'number', min: '2', max: '10', value: String(nGears), style: { width: '80px' },
          onchange: e => save({ gears: Math.max(2, Math.min(10, parseInt(e.target.value, 10) || 6)) }) }),
        el('span', { class: 'dim', style: { fontSize: '12.5px', marginLeft: '10px' } }, 'Achsantrieb'),
        el('input', { class: 'inp', type: 'number', step: '0.001', value: s.final > 0 ? String(s.final) : '', style: { width: '110px' },
          placeholder: 'z. B. 4.176',
          onchange: e => save({ final: parseFloat(e.target.value) || 0 }) })));
      const rows = el('div', { class: 'chiprow', style: { flexWrap: 'wrap' } });
      for (let i = 0; i < nGears; i++) rows.appendChild(el('label', { class: 'chip', style: { display: 'inline-flex', gap: '6px', alignItems: 'center' } },
        el('span', {}, (i + 1) + '.'),
        el('input', { class: 'inp', type: 'number', step: '0.001', style: { width: '86px' },
          value: ratios[i] > 0 ? String(ratios[i]) : '',
          onchange: e => { const r = ratios.slice(); r[i] = parseFloat(e.target.value) || 0; save({ ratios: r }); } })));
      wrap.appendChild(rows);
      const gi3 = App.gears && App.gears.gearbox;
      if (!(s.final > 0) && gi3 && gi3.finalFitted)
        wrap.appendChild(noteBox('ok', 'Achsantrieb aus der Messung bestimmt: ' + fmt(gi3.finalFitted, 3),
          'Das Feld oben darf leer bleiben – aus den Abständen deiner Übersetzungen und der Messung folgt dieser Wert.'));
      wrap.appendChild(el('p', { class: 'dim2', style: { fontSize: '12px', marginTop: '8px' } },
        'Getriebeübersetzungen, nicht Gesamtübersetzungen – der Achsantrieb wird separat verrechnet ' +
        'und darf leer bleiben, dann wird er aus der Messung bestimmt. ' +
        'Doppelkupplungsgetriebe haben oft zwei Achsantriebe, einen je Teilgetriebe. Ist das bei dir so, ' +
        'trag den der ungeraden Gänge oben ein und den zweiten hier:'));
      wrap.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center' } },
        el('span', { class: 'dim', style: { fontSize: '12.5px' } }, 'Zweiter Achsantrieb (gerade Gänge)'),
        el('input', { class: 'inp', type: 'number', step: '0.001', style: { width: '110px' },
          value: s.final2 > 0 ? String(s.final2) : '',
          onchange: e => { const v = parseFloat(e.target.value) || 0;
            save({ final2: v, final2Gears: v > 0 ? [2, 4, 6, 8, 10] : null }); } })));
    }

    if (s.mode === 'count') {
      const nGears = Math.max(2, Math.min(10, s.gears | 0 || 6));
      const meas = App.gears ? App.gears.gears.length : 0;
      const maxOff = Math.max(1, nGears - meas + 1);
      const info = App.gears && App.gears.gearbox;
      const cur = s.firstGear > 0 ? s.firstGear : (info && info.firstGear) || 1;
      wrap.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center' } },
        el('span', { class: 'dim', style: { fontSize: '12.5px' } }, 'Anzahl Gänge'),
        el('input', { class: 'inp', type: 'number', min: '2', max: '10', value: String(nGears), style: { width: '80px' },
          onchange: e => { setGearboxSetting({ mode: 'count', gears: Math.max(2, Math.min(10, parseInt(e.target.value, 10) || 6)), firstGear: s.firstGear || 0 }); render(); recompute(); } }),
        meas ? el('span', { class: 'dim', style: { fontSize: '12.5px', marginLeft: '10px' } }, 'Der kürzeste gemessene Gang ist Gang') : null,
        meas ? el('select', { class: 'sel', onchange: e => {
          setGearboxSetting({ mode: 'count', gears: nGears, firstGear: parseInt(e.target.value, 10) || 0 }); render(); recompute(); } },
          [el('option', { value: '0', selected: !(s.firstGear > 0) ? true : null }, 'automatisch schätzen')].concat(
            Array.from({ length: maxOff }, (_, i) => el('option', { value: String(i + 1), selected: s.firstGear === i + 1 ? true : null }, String(i + 1))))) : null));
      if (meas) wrap.appendChild(el('p', { class: 'dim2', style: { fontSize: '12px', marginTop: '8px' } },
        'Gemessen wurden ' + meas + ' Übersetzungen. Welche Gangnummern das sind, lässt sich ohne Werksübersetzungen nicht ' +
        'aus den Daten ablesen – die automatische Schätzung geht davon aus, dass ein erster Gang am Drehzahlbegrenzer ' +
        'etwa 45–75 km/h erreicht. Aktuell angenommen: Gang ' + cur + ' bis ' + (cur + meas - 1) + '.'));
    }

    const giU = App.gears && App.gears.gearbox;
    if (giU && giU.uniform) wrap.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center', marginTop: '10px' } },
      el('button', { class: 'btn', type: 'button', onclick: () => {
        store.set('rollCircum', +giU.uniform.suggestedCircum.toFixed(4));
        if (App.profile) App.profile.specs.rollCircum = +giU.uniform.suggestedCircum.toFixed(4);
        render(); recompute();
      } }, 'Abrollumfang auf ' + fmt(giU.uniform.suggestedCircum, 3) + ' m korrigieren'),
      el('span', { class: 'dim', style: { fontSize: '12px' } },
        'aus der gleichmäßigen Abweichung aller Gänge – das ist der dynamische Umfang, mit dem der Reifen unter Last abrollt')));

    /* Gegenüberstellung Soll gegen gemessen */
    const gbx = resolveGearbox(App.profile, rc);
    const info = App.gears && App.gears.gearbox;
    if (gbx && gbx.table && App.gears) {
      const byGear = {}; App.gears.gears.forEach(g => { if (g.gear) byGear[g.gear] = g; });
      const mismatch = info && info.mode === 'mismatch';
      if (mismatch) wrap.appendChild(noteBox('warn', 'Die gewählten Übersetzungen passen nicht zur Messung',
        'Die gemessenen Übersetzungen weichen um bis zu ' + fmt((info.worst || 0) * 100, 1) + ' % von den hinterlegten ab. ' +
        'Entweder ist das ein anderes Getriebe, ein anderer Achsantrieb, oder der eingestellte Abrollumfang (' + fmt(rc, 3) + ' m) ' +
        'passt nicht zur montierten Reifengröße. Bis das stimmt, wird nach Übersetzung nummeriert.'));
      wrap.appendChild(el('div', { class: 'tblwrap', style: { marginTop: '12px' } },
        el('table', { class: 'tbl', style: { minWidth: '520px' } },
          el('thead', {}, el('tr', {}, ['Gang', 'Übersetzung', 'Soll km/h je 1000', 'gemessen', 'Abweichung'].map(h => el('th', {}, h)))),
          el('tbody', {}, gbx.table.map(t => {
            const g = byGear[t.gear];
            return el('tr', { style: g ? null : { opacity: '.55' } },
              el('td', {}, 'G' + t.gear),
              el('td', { class: 'n' }, fmt(t.ratio, 3) + ' × ' + fmt(t.final, 3)),
              el('td', { class: 'n' }, fmt(t.kmhPer1000, 1)),
              el('td', { class: 'n' }, g ? fmt(g.kmhPer1000, 1) : 'nicht gefahren'),
              el('td', { class: 'n' }, g && isFinite(g.dev) ? (g.dev >= 0 ? '+' : '') + fmt(g.dev * 100, 1) + ' %' : '–'));
          })))));
    }
    wrap.appendChild(el('p', { class: 'card-f dim2', style: { padding: '10px 0 0', borderTop: 0, fontSize: '12px' } },
      'Das Getriebe steht bewusst nicht im Motorprofil: denselben Motor gibt es mit Handschalter, Wandler und ' +
      'Doppelkupplung, und derselbe Getriebetyp läuft je Modell mit verschiedenen Achsantrieben. Die Zuordnung ' +
      'hängt zusätzlich am Abrollumfang – steht der falsch, verschiebt sich alles gleichmäßig.'));
  };
  render();
  return card('Getriebe und Gangnummern', {
    hint: 'entscheidet, ob die Gangtabelle echte Gangnummern zeigt',
    info: { read: 'Ohne Angabe nummeriert das Werkzeug die gemessenen Übersetzungen von kurz nach lang als S1, S2, … – das sind Stufen, keine Gangnummern. Mit Werksübersetzungen werden daraus echte Gangnummern, und es steht dabei, welcher Gang in dieser Fahrt nicht gefahren wurde.',
            good: 'Weichen gemessene und hinterlegte Übersetzung um weniger als etwa 2 % ab, passen Getriebe, Achsantrieb und Reifengröße zusammen.',
            bad: 'Eine gleichmäßige Abweichung in allen Gängen deutet auf einen falschen Abrollumfang oder Achsantrieb – nicht auf einen Getriebeschaden. Weicht nur ein einzelner Gang ab, lohnt der zweite Blick.' }
  }, wrap);
}



/* Hex- oder rgb()-Farbe mit Deckkraft versehen. */
function fade(c, a) {
  c = String(c).trim();
  if (c[0] === '#') {
    const h = c.length === 4
      ? c.slice(1).split('').map(x => parseInt(x + x, 16))
      : [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    return 'rgba(' + h[0] + ',' + h[1] + ',' + h[2] + ',' + a + ')';
  }
  if (c.indexOf('rgb(') === 0) return c.replace('rgb(', 'rgba(').replace(')', ',' + a + ')');
  return c;
}
/* --- Fahrzeugabfrage nach dem Import ---------------------------------------
   Aus den Daten lässt sich die Bauart ablesen, nicht das Modell: Zahl der Bänke,
   Kraftstoffart, ob aufgeladen, wie hoch gedreht wurde. Für die Sollwerte der
   Diagnose braucht es aber das konkrete Triebwerk. Deshalb wird gefragt statt
   geraten — mit Vorschlag, zuletzt benutzten Profilen und Suche.
--------------------------------------------------------------------------- */
function recentProfiles() {
  const r = store.get('recentProfiles', []);
  return Array.isArray(r) ? r.filter(id => profileById(id)).slice(0, 6) : [];
}
function rememberProfile(id) {
  if (!id) return;
  const r = recentProfiles().filter(x => x !== id);
  r.unshift(id);
  store.set('recentProfiles', r.slice(0, 6));
}

/* Was die Aufzeichnung über das Fahrzeug hergibt — nur Belegbares. */
function vehicleEvidence(ds) {
  const s = ds.stats, e = [];
  const has = id => !!ds.G[id];
  const banks = (has('ltft_b2') || has('cac_b2') || has('stft_b2')) ? 2 : 1;
  e.push({ k: 'Bänke', v: banks === 2 ? 'zwei (getrennte Sensoren je Bank)' : 'eine erkennbar' });
  const petrol = has('ltft_b1') || has('stft_b1') || has('lambda') || has('timing');
  e.push({ k: 'Kraftstoff', v: petrol ? 'Benzin (Gemischadaption bzw. Zündwinkel vorhanden)' : 'unklar – keine Zündungs- oder Gemischdaten' });
  const lmax = s.load_abs ? s.load_abs.max : (s.load_calc ? s.load_calc.max : NaN);
  if (isFinite(lmax))
    e.push({ k: 'Aufladung', v: lmax > 115 ? 'aufgeladen (' + fmt(lmax, 0) + ' % absolute Last)' : 'kein Hinweis auf Aufladung (max ' + fmt(lmax, 0) + ' %)' });
  if (s.rpm) e.push({ k: 'höchste Drehzahl', v: fmt(s.rpm.max, 0) + ' min⁻¹ – der Begrenzer liegt darüber' });
  if (has('cac_b1')) e.push({ k: 'Ladeluftkühlung', v: 'Ladelufttemperatur wird gemessen' });
  if (App.vin) e.push({ k: 'Fahrgestellnummer', v: App.vin.vin + (App.vin.maker ? ' – ' + App.vin.maker : '') + (App.vin.modelYear ? ', Modelljahr ' + App.vin.modelYear : '') });
  if (App.gears && App.gears.gears.length)
    e.push({ k: 'Übersetzungen', v: App.gears.gears.length + ' gemessen, längste ' + fmt(App.gears.gears[App.gears.gears.length - 1].kmhPer1000, 1) + ' km/h je 1000' });
  return e;
}

function closeVehicleDialog() { const o = $('#veh-dlg'); if (o) o.remove(); }

/* ===== Live-Aufzeichnung vom Adapter ================================ */
function openLiveDialog() {
  const link = new ObdLink();
  let rec = null, loop = null, stopped = false, pos = null, watchId = null;
  const values = new Map();
  const status = el('p', { class: 'dim', style: { margin: '0 0 10px' } }, 'Noch nicht verbunden.');
  const grid = el('div', { class: 'grid kpis' });
  const counter = el('span', { class: 'dim2' }, '');
  const btnConnect = el('button', { class: 'btn primary', type: 'button' }, 'Adapter suchen');
  const btnStop = el('button', { class: 'btn', type: 'button', disabled: true }, 'Beenden und auswerten');
  const paint = () => {
    grid.innerHTML = '';
    LIVE_PIDS.forEach(d => {
      if (!values.has(d.pid)) return;
      const v = values.get(d.pid);
      grid.appendChild(kpi(d.name, isFinite(v) ? fmt(v, Math.abs(v) < 10 ? 2 : 0) : '–', d.unit, ''));
    });
    counter.textContent = rec ? fmt(rec.count, 0) + ' Messwerte · ' + fmtDur(rec.seconds) : '';
  };
  const stopAll = async () => {
    stopped = true;
    if (loop) { clearTimeout(loop); loop = null; }
    if (watchId !== null && navigator.geolocation) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    await link.disconnect();
  };
  const run = async () => {
    const supported = [];
    for (const d of LIVE_PIDS) {
      if (stopped) return;
      try {
        const line = await link.send(d.pid, 1800);
        const v = parseObdResponse(line, d);
        if (isFinite(v)) { supported.push(d); values.set(d.pid, v); rec.add(d, v, pos); }
      } catch (e) { /* PID nicht unterstützt oder Zeitüberschreitung – überspringen */ }
    }
    paint();
    status.textContent = supported.length
      ? 'Verbunden. ' + supported.length + ' von ' + LIVE_PIDS.length + ' Messgrößen liefern Werte.'
      : 'Verbunden, aber keine Messgröße antwortet. Zündung an? Motor läuft?';
    const tick = async () => {
      if (stopped) return;
      for (const d of supported) {
        if (stopped) return;
        try { const v = parseObdResponse(await link.send(d.pid, 1200), d); if (isFinite(v)) { values.set(d.pid, v); rec.add(d, v, pos); } } catch (e) {}
      }
      paint();
      loop = setTimeout(tick, 50);
    };
    tick();
  };
  const body = el('div', {}, status,
    noteBox('info', 'Was hier passiert',
      'Der Browser verbindet sich direkt mit einem BLE-Adapter und fragt die Standard-PIDs im Wechsel ab. Alles bleibt auf diesem Gerät; beim Beenden läuft die Aufzeichnung in dieselbe Auswertung wie eine Datei. Klassische Bluetooth-Adapter ohne BLE und WLAN-Adapter erreicht der Browser nicht. Fahre nicht selbst, während du das Handy bedienst.'),
    el('div', { style: { marginTop: '12px' } }, grid));
  const close = () => { const n = $('#live-dlg'); if (n) n.remove(); };
  const dlg = { close };
  const node = el('div', { class: 'mdl-bd', id: 'live-dlg' },
    el('div', { class: 'mdl', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Live vom Adapter aufzeichnen' },
      el('div', { class: 'mdl-h' },
        el('h3', {}, 'Live vom Adapter aufzeichnen'),
        el('p', {}, 'Web Bluetooth – Chrome und Edge auf Rechner und Android; Safari auf dem iPhone kann das nicht.')),
      el('div', { class: 'mdl-b' }, body),
      el('div', { class: 'mdl-f' },
        el('span', { class: 'spacer' }, counter),
        btnConnect, btnStop,
        el('button', { class: 'btn ghost', type: 'button', onclick: async () => { await stopAll(); close(); } }, 'Abbrechen'))));
  document.body.appendChild(node);
  const esc = async e => { if (e.key === 'Escape') { await stopAll(); close(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
  btnConnect.onclick = async () => {
    btnConnect.disabled = true; status.textContent = 'Suche Adapter …';
    try {
      const name = await link.connect();
      rec = liveRecorder();
      status.textContent = 'Verbunden mit ' + name + '. Frage Messgrößen ab …';
      btnStop.disabled = false;
      if (navigator.geolocation) watchId = navigator.geolocation.watchPosition(p => { pos = { lat: p.coords.latitude, lon: p.coords.longitude }; }, () => {}, { enableHighAccuracy: true });
      link.onDisconnect = () => { status.textContent = 'Verbindung verloren.'; };
      run();
    } catch (e) {
      status.textContent = 'Fehler: ' + (e.message || e);
      btnConnect.disabled = false;
    }
  };
  btnStop.onclick = async () => {
    const csv = rec ? rec.toCsv() : null;
    const n = rec ? rec.count : 0;
    await stopAll(); dlg.close();
    if (!csv || n < 20) { alert('Zu wenige Messwerte für eine Auswertung (' + n + ').'); return; }
    ingest({ kind: 'text', text: csv, name: 'Live ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '.csv' });
  };
}

function openVehicleDialog(opts) {
  opts = opts || {};
  closeVehicleDialog();
  const ds = App.ds;
  if (!ds) return;
  const suggestedId = autoProfile(ds);
  const suggested = profileById(suggestedId);
  let chosen = App.profile;

  const body = el('div', { class: 'mdl-b' });
  const current = el('div', { class: 'note', style: { marginBottom: '12px' } });
  const paintCurrent = () => {
    current.innerHTML = '';
    current.appendChild(el('b', {}, chosen ? chosen.name : 'Kein Profil'));
    current.appendChild(el('div', { class: 'dim', style: { fontSize: '12.5px', marginTop: '2px' } },
      chosen ? (profileSpecLine(chosen) || '') : ''));
    if (chosen) current.appendChild(confBadge(chosen));
  };
  paintCurrent();
  body.appendChild(el('div', { class: 'mdl-sec' }, 'Gewählt'));
  body.appendChild(current);

  const rec = recentProfiles().map(profileById).filter(Boolean);
  if (rec.length) {
    body.appendChild(el('div', { class: 'mdl-sec' }, 'Zuletzt benutzt'));
    body.appendChild(el('div', { class: 'chiprow', style: { flexWrap: 'wrap' } },
      rec.map(p => el('button', { class: 'btn', type: 'button',
        onclick: () => { chosen = p; paintCurrent(); } }, p.name))));
  }

  if (suggested) {
    body.appendChild(el('div', { class: 'mdl-sec' }, 'Aus den Daten geschätzt'));
    body.appendChild(el('div', { class: 'chiprow' },
      el('button', { class: 'btn primary', type: 'button',
        onclick: () => { chosen = suggested; paintCurrent(); } }, suggested.name)));
  }
  body.appendChild(el('div', { class: 'mdl-sec' }, 'Was in der Aufzeichnung steht'));
  body.appendChild(el('div', { class: 'evid' },
    vehicleEvidence(ds).map(x => el('span', {}, x.k + ': ' + x.v))));
  body.appendChild(el('p', { class: 'dim2', style: { fontSize: '12px', margin: '2px 0 0' } },
    'Mehr gibt die Datei nicht her – Bauart ja, Modell nein. Für die Sollwerte der Diagnose ' +
    '(Leerlaufdrehzahl, Kühlmittelband, Begrenzer, Volllastlast, Ladedruck) braucht es das konkrete Triebwerk. ' +
    'Ohne passendes Profil wird gegen weit gefasste Klassenwerte geprüft, und die erzeugen weder Fehlalarme noch scharfe Befunde.'));

  body.appendChild(el('div', { class: 'mdl-sec' }, 'Suchen'));
  const chooser = profileChooser(p => { chosen = p; paintCurrent(); });
  body.appendChild(chooser);

  const apply = () => {
    if (chosen) {
      store.set('profile', chosen.id);
      rememberProfile(chosen.id);
      App.profile = chosen;
    }
    closeVehicleDialog();
    recompute();
  };
  const dlg = el('div', { class: 'mdl-bd', id: 'veh-dlg',
      onclick: e => { if (e.target === e.currentTarget) closeVehicleDialog(); } },
    el('div', { class: 'mdl', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welches Fahrzeug ist das?' },
      el('div', { class: 'mdl-h' },
        el('h3', {}, 'Welches Fahrzeug ist das?'),
        el('p', {}, opts.reason ||
          'Die Diagnose vergleicht die Messwerte mit den Werksangaben deines Motors. Ohne das richtige Profil ' +
          'wird gegen Klassenwerte geprüft – das ist bewusst grob und übersieht Grenzfälle.')),
      body,
      el('div', { class: 'mdl-f' },
        el('span', { class: 'spacer dim', style: { fontSize: '12px' } },
          'Die Wahl lässt sich jederzeit unter Einstellungen ändern.'),
        el('button', { class: 'btn', type: 'button', onclick: () => closeVehicleDialog() }, 'Später'),
        el('button', { class: 'btn primary', type: 'button', onclick: apply }, 'Übernehmen'))));
  document.body.appendChild(dlg);
  const esc = e => { if (e.key === 'Escape') { closeVehicleDialog(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
  if (chooser.focusSearch) setTimeout(() => chooser.focusSearch(), 60);
}

/* --- Fehlerspeicher --------------------------------------------------------- */
function dtcStoreKey() { return App.ds ? 'dtc:' + driveId(App.ds, App.fileName) : null; }
function activeDtcCodes() { const k = dtcStoreKey(); return k ? parseDtcInput(store.get(k, '')) : []; }

function dtcCard() {
  if (!App.ds || !App.diag) return null;
  const key = dtcStoreKey();
  const ta = el('textarea', { class: 'inp', rows: 2, spellcheck: 'false',
    placeholder: 'P0300, P0171 … oder die ganze Ausgabe der OBD-App hier einfügen',
    style: { width: '100%', fontFamily: 'var(--mono)', resize: 'vertical' } }, store.get(key, ''));
  const list = el('div', { class: 'dtc-list' });
  const paint = () => {
    list.innerHTML = '';
    const codes = parseDtcInput(ta.value);
    if (!codes.length) {
      list.appendChild(el('p', { class: 'dim', style: { margin: '8px 0 0' } },
        'Keine Codes eingetragen. Ein Fehlercode neben dem gemessenen Verlauf ist mehr wert als beides einzeln – ' +
        'die Codes stehen in der OBD-App unter „Fehlerspeicher“ oder „Diagnose“. Gespeichert wird je Fahrt.'));
      return;
    }
    dtcCrossCheck(codes, App.diag.results).forEach(d => {
      const tone = d.supporting.length ? 'crit' : (d.contra.length && !d.open.length) ? 'ok' : 'mute';
      const rt = id => { const r = DIAG_RULES.find(x => x.id === id); return r ? r.title : id; };
      list.appendChild(el('div', { class: 'dtc-row' },
        el('b', { class: 'dtc-code' + (d.generic ? '' : ' mfr') }, d.code),
        el('div', { class: 'dtc-t' },
          el('b', {}, d.title),
          d.check ? el('span', { class: 'dim' }, d.check) : null,
          el('div', { class: 'chiprow', style: { marginTop: '5px', gap: '5px' } },
            el('span', { class: 'badge ' + tone }, d.verdict),
            d.supporting.length ? el('span', { class: 'badge crit' }, 'gestützt: ' + d.supporting.map(rt).join(', ')) : null,
            d.contra.length ? el('span', { class: 'badge ok' }, 'unauffällig: ' + d.contra.map(rt).join(', ')) : null,
            d.open.length ? el('span', { class: 'badge mute' }, 'nicht prüfbar: ' + d.open.map(rt).join(', ')) : null))));
    });
  };
  ta.addEventListener('input', () => { store.set(key, ta.value); paint(); akteAutoSave(); });
  paint();
  return card('Fehlerspeicher', {
    hint: 'Codes aus der OBD-App, gegen die Messung gestellt',
    info: { read: 'Genormte Codes (P0xxx, P2xxx) bedeuten in jedem Fahrzeug dasselbe und werden hier gedeutet. Herstellercodes (P1xxx, P3xxx) werden erkannt, aber nicht ausgelegt – ihre Bedeutung steht nur im Reparaturleitfaden des Herstellers. Zu jedem Code steht, welche Prüfungen dieser Auswertung ihn stützen oder entkräften.',
            good: 'Ein Code, dessen zugehörige Prüfungen alle unauffällig sind, ist oft alt oder sporadisch – löschen, Fahrt wiederholen, wiederkommt er nicht, war er es nicht wert.',
            bad: 'Ein Code, den die Messung stützt – P0299 neben gedeckelter Volllastlast, P0171 neben +8 % Gemischkorrektur – ist ein echter Befund, kein Zufall.' }
  }, ta, list);
}

/* --- Aufzeichnungs-Assistent ----------------------------------------------- */
function assistCard() {
  if (!App.ds || !App.diag) return null;
  const a = buildAssist(App.diag.results, Object.keys(App.ds.G), App.profile);
  const text = assistText(a, App.profile ? App.profile.name : '');
  const copyBtn = el('button', { class: 'btn', type: 'button', onclick: async e => {
    try { await navigator.clipboard.writeText(text); e.target.textContent = 'Kopiert'; setTimeout(() => e.target.textContent = 'Als Text kopieren', 1500); }
    catch (err) { download('aufzeichnungs-zettel.txt', 'text/plain', text); }
  } }, 'Als Text kopieren');
  if (!a.pids.length && !a.situations.length)
    return card('Nächste Aufzeichnung', { hint: 'nichts offen' },
      el('p', { class: 'dim' }, 'Diese Aufzeichnung hat alles beantwortet, was das Werkzeug fragen kann – ' + a.answered + ' von ' + a.total + ' Prüfungen wurden bewertet.'));
  const pidList = a.pids.length ? el('div', { class: 'assist-col' },
    el('h4', {}, 'In der OBD-App zusätzlich aufzeichnen'),
    el('ul', { class: 'assist-list' }, a.pids.map(p => el('li', {},
      el('span', { class: 'assist-box' }, ''),
      el('div', {}, el('b', {}, p.app), el('span', { class: 'dim' }, (p.code ? p.code + ' · ' : '') +
        p.rules.length + (p.rules.length === 1 ? ' Prüfung' : ' Prüfungen') + ' hängen daran')))))) : null;
  const sitList = a.situations.length ? el('div', { class: 'assist-col' },
    el('h4', {}, 'So fahren – in dieser Reihenfolge'),
    el('ol', { class: 'assist-steps' }, a.situations.map(s => el('li', {},
      el('b', {}, s.title), el('span', {}, s.text),
      s.rules.length ? el('span', { class: 'dim2' }, 'beantwortet: ' + s.rules.map(id => { const r = DIAG_RULES.find(x => x.id === id); return r ? r.title : id; }).join(', ')) : null)))) : null;
  return card('Damit die nächste Aufzeichnung mehr beantwortet', {
    hint: a.answered + ' von ' + a.total + ' Prüfungen konnten bewertet werden', tools: copyBtn,
    info: { read: 'Das Werkzeug weiß nach jeder Datei genau, warum eine Prüfung nichts sagen konnte: entweder fehlt die Messgröße in der App, oder die Fahrsituation kam nicht vor. Beides steht hier als Zettel – die Messgrößen so benannt, wie die App sie anzeigt, die Situationen in der Reihenfolge, in der man sie am besten fährt.',
            good: 'Eine Aufzeichnung mit Kaltstart, Warmfahrt, einer Minute Leerlauf, zwei Minuten Konstantfahrt und einem Volllastzug beantwortet fast alles.',
            bad: 'Volllastzüge nur auf freier, trockener Strecke und wo es erlaubt ist. Was hier steht, ist eine Messanleitung, keine Aufforderung.' }
  }, el('div', { class: 'assist' }, pidList, sitList));
}

/* --- Fahrzeugakte ---------------------------------------------------------- */
const AKTE_FMT_DATE = ts => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const AKTE_FMT_TIME = ts => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/* Nach jedem Import und jeder Neubewertung den aktuellen Stand in die Akte schreiben.
   Gleiche Datei -> gleicher Schlüssel -> Eintrag wird ersetzt, nicht verdoppelt. */
function akteAutoSave() {
  if (!App.ds || !App.diag || store.get('akteAuto', true) === false) return;
  try {
    const row = driveSummary(App.ds, App.diag, App.gears, App.profile, App.fileName);
    akteGet(row.id).then(old => { if (old && old.notes) row.notes = old.notes; return aktePut(row); }).catch(() => {});
  } catch (e) { console.warn('Akte: Speichern fehlgeschlagen', e); }
}

BUILDERS.akte = function (page) {
  page.appendChild(sectionHead('Fahrzeugakte',
    'Jede Fahrt ist eine Momentaufnahme. Erst im Verlauf über mehrere Fahrten wird aus einem Wert eine Aussage.'));
  // min-width 0: als Rasterkind wuerde der Container sonst auf Tabellenbreite wachsen
  // und die ganze Seite auf dem Handy seitlich aufziehen
  const host = el('div', { style: { minWidth: 0 } });
  page.appendChild(host);
  host.appendChild(el('p', { class: 'dim' }, 'Akte wird geladen …'));

  const ruleTitle = id => { const r = DIAG_RULES.find(x => x.id === id); return r ? r.title : id; };
  const ruleGroup = id => { const r = DIAG_RULES.find(x => x.id === id); return r ? r.group : ''; };

  const render = async () => {
    let rows;
    try { rows = await akteAll(); } catch (e) { rows = []; }
    host.innerHTML = '';

    const filterProfile = store.get('akteProfile', App.profile ? App.profile.id : '') || '';
    const profiles = Array.from(new Set(rows.map(r => r.profileId).filter(Boolean)))
      .map(id => ({ id, name: (rows.find(r => r.profileId === id) || {}).profileName || id }));
    const shown = filterProfile ? rows.filter(r => r.profileId === filterProfile) : rows;

    /* Kopfzeile: Filter und Aktionen */
    const sel = el('select', { class: 'sel', onchange: e => { store.set('akteProfile', e.target.value); render(); } },
      [el('option', { value: '', selected: !filterProfile ? true : null }, 'alle Fahrzeuge (' + rows.length + ')')]
        .concat(profiles.map(p => el('option', { value: p.id, selected: p.id === filterProfile ? true : null },
          p.name + ' (' + rows.filter(r => r.profileId === p.id).length + ')'))));
    const refInput = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' },
      onchange: async e => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const inc = akteParseImport(await f.text());
          App.akteRef = { name: f.name, rows: inc };
          host.prepend(noteBox('ok', 'Referenzakte geladen', inc.length + ' Fahrten aus „' + f.name + '“ – wird nur verglichen, nicht gespeichert.'));
          setTimeout(render, 700);
        } catch (err) { host.prepend(noteBox('crit', 'Referenzakte nicht lesbar', String(err.message || err))); }
        e.target.value = '';
      } });
    const importInput = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' },
      onchange: async e => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const inc = akteParseImport(await f.text());
          const m = akteMerge(await akteAll(), inc);
          for (const r of inc) if (r && r.id) await aktePut(m.rows.find(x => x.id === r.id));
          host.prepend(noteBox('ok', 'Akte eingelesen', m.added + ' neue Fahrten, ' + m.updated + ' aktualisiert.'));
          setTimeout(render, 900);
        } catch (err) { host.prepend(noteBox('crit', 'Das hat nicht geklappt', err.message)); }
        e.target.value = '';
      } });
    host.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center', marginBottom: '12px' } },
      el('span', { class: 'dim', style: { fontSize: '12.5px' } }, 'Fahrzeug'), sel,
      App.ds ? el('button', { class: 'btn primary', type: 'button', onclick: () => {
        store.set('akteAuto', true); akteAutoSave(); setTimeout(render, 300); } }, 'Aktuelle Fahrt speichern') : null,
      rows.length ? el('button', { class: 'btn', type: 'button', onclick: () =>
        download('fahrzeugakte-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json', akteExportJson(rows)) },
        icon('dl'), 'Akte exportieren') : null,
      el('button', { class: 'btn', type: 'button', onclick: () => importInput.click() }, 'Akte einlesen'),
      el('button', { class: 'btn', type: 'button', title: 'Akte eines anderen Fahrzeugs zum Vergleich laden – wird nicht gespeichert',
        onclick: () => refInput.click() }, App.akteRef ? 'Referenz: ' + App.akteRef.name : 'Referenzakte vergleichen'),
      App.akteRef ? el('button', { class: 'btn ghost sm', type: 'button', onclick: () => { App.akteRef = null; render(); } }, 'Referenz entfernen') : null,
      importInput,
      el('label', { class: 'chip', style: { display: 'inline-flex', gap: '6px', alignItems: 'center' } },
        el('input', { type: 'checkbox', checked: store.get('akteAuto', true) !== false ? true : null,
          onchange: e => store.set('akteAuto', !!e.target.checked) }),
        'nach jedem Import automatisch speichern')));

    if (!shown.length) {
      host.appendChild(noteBox('info', 'Noch keine Fahrten in der Akte',
        App.ds
          ? 'Die aktuelle Fahrt wird nach dem Import automatisch aufgenommen, sobald ein Fahrzeugprofil gewählt ist. Oder oben „Aktuelle Fahrt speichern“.'
          : 'Eine Aufzeichnung laden – sie landet dann hier. Die Akte bleibt im Browser dieses Geräts; als JSON-Datei nimmst du sie mit auf andere Geräte.'));
      return;
    }

    /* Liste der Fahrten */
    const tally = r => r.tally ? el('span', { class: 'akte-tally' },
      el('b', { class: 'ok' }, String(r.tally.ok)), el('b', { class: 'warn' }, String(r.tally.warn)),
      el('b', { class: 'crit' }, String(r.tally.crit))) : el('span', {}, '–');
    host.appendChild(card('Fahrten', { hint: shown.length + ' gespeichert · nur Auswertungen, keine Rohdaten' },
      el('div', { class: 'tblwrap' }, el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, ['Datum', 'Datei', 'Dauer', 'Strecke', 'Verbrauch', 'Befunde', 'Notiz', ''].map(h => el('th', {}, h)))),
        el('tbody', {}, shown.slice().reverse().map(r => el('tr', {},
          el('td', {}, AKTE_FMT_DATE(r.date) + ' ' + AKTE_FMT_TIME(r.date)),
          el('td', { class: 'dim', style: { maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.file || '–'),
          el('td', { class: 'n' }, r.duration ? fmtDur(r.duration) : '–'),
          el('td', { class: 'n' }, r.dist !== null ? fmt(r.dist, 1) + ' km' : '–'),
          el('td', { class: 'n' }, r.consAvg !== null ? fmt(r.consAvg, 1) + ' L' : '–'),
          el('td', {}, tally(r)),
          el('td', {}, el('input', { class: 'inp', type: 'text', value: r.notes || '', placeholder: 'z. B. nach Ölwechsel', style: { width: '160px' },
            onchange: e => { r.notes = e.target.value; aktePut(r); } })),
          el('td', {}, el('button', { class: 'btn', type: 'button', title: 'Fahrt aus der Akte entfernen',
            'aria-label': 'Fahrt entfernen', onclick: async () => { if (confirm('Diese Fahrt aus der Akte entfernen?')) { await akteDelete(r.id); render(); } } }, icon('x'))))))))));

    /* Matrix Regel × Fahrt */
    const cols = shown.slice(-10);
    const ruleIds = [];
    for (const r of cols) for (const d of (r.diag || [])) if (d.status !== 'missing' && ruleIds.indexOf(d.id) < 0) ruleIds.push(d.id);
    const byGroup = new Map();
    ruleIds.forEach(id => { const g = ruleGroup(id); if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(id); });
    const cell = (r, id) => {
      const d = (r.diag || []).find(x => x.id === id);
      if (!d) return el('td', { class: 'akte-c none' }, '');
      const t = d.value !== null && d.value !== undefined ? fmt(d.value, 2) + (d.unit ? ' ' + d.unit : '') : STATUS_TXT[d.status] || d.status;
      return el('td', { class: 'akte-c ' + d.status, title: ruleTitle(id) + ': ' + t + (d.ref ? ' (Soll ' + d.ref + ')' : '') },
        el('span', { class: 'akte-dot' }, statusSym(d.status)),
        d.value !== null && d.value !== undefined ? el('span', { class: 'akte-v' }, fmt(d.value, d.unit === '%' || d.unit === 'K' ? 1 : 0)) : null);
    };
    const matrix = el('table', { class: 'tbl akte-m' },
      el('thead', {}, el('tr', {}, [el('th', {}, 'Befund')].concat(cols.map(r => el('th', { class: 'n', title: r.file || '' }, AKTE_FMT_DATE(r.date)))))),
      el('tbody', {}, Array.from(byGroup.entries()).flatMap(([g, ids]) => [
        el('tr', { class: 'akte-g' }, el('td', { colspan: String(cols.length + 1) }, g))
      ].concat(ids.map(id => el('tr', {}, [el('td', {}, ruleTitle(id))].concat(cols.map(r => cell(r, id)))))))));
    host.appendChild(card('Befunde im Verlauf', {
      hint: cols.length + ' Fahrten, älteste links · Zahl = Messwert, Symbol = Bewertung',
      info: { read: 'Jede Spalte ist eine Fahrt, jede Zeile ein Befund. Der Wert steht klein daneben, die Farbe ist die Bewertung gegen das Sollband. Ein Befund, der in jeder Fahrt gleich aussieht, ist stabil – ein Befund, der von Fahrt zu Fahrt in eine Richtung wandert, ist der Grund, warum es diese Akte gibt.',
              good: 'Gleiche Farben in einer Zeile, Werte ohne Richtung. Einzelne „?“ sind Fahrten, in denen die Situation nicht vorkam – kein Befund.',
              bad: 'Eine Zeile, die von grün über gelb nach rot wandert, oder ein Wert, der jede Fahrt ein Stück weiterläuft, auch wenn er noch grün ist. Das ist die Drift, die eine einzelne Fahrt nie zeigen kann.' }
    }, el('div', { class: 'tblwrap' }, matrix)));

    /* Verlauf einer Regel */
    /* --- Zwei Fahrten vergleichen --- */
    if (shown.length >= 2) {
      const ids = shown.slice().sort((x, y) => y.date - x.date);
      const selA = store.get('cmpA', ids[1].id), selB = store.get('cmpB', ids[0].id);
      const opt = (v, sel) => ids.map(r => el('option', { value: r.id, selected: r.id === v ? true : null },
        AKTE_FMT_DATE(r.date) + ' · ' + fmt(r.dist || 0, 1) + ' km · ' + (r.file || '')));
      const sa = el('select', { class: 'sel', onchange: e => { store.set('cmpA', e.target.value); render(); } }, opt(selA));
      const sb = el('select', { class: 'sel', onchange: e => { store.set('cmpB', e.target.value); render(); } }, opt(selB));
      const A = ids.find(r => r.id === selA) || ids[1], B = ids.find(r => r.id === selB) || ids[0];
      const cmp = compareDrives(A, B);
      const cHost = el('div');
      cHost.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center', marginBottom: '10px' } },
        el('span', { class: 'field' }, el('span', { class: 'dim' }, 'vorher'), sa),
        el('span', { class: 'field' }, el('span', { class: 'dim' }, 'nachher'), sb)));
      if (A.id === B.id) cHost.appendChild(el('p', { class: 'dim' }, 'Bitte zwei verschiedene Fahrten wählen.'));
      else {
        const fmtV = (v, f) => !isFinite(v) ? '–' : f.time ? fmtDur(v) : fmt(v, f.dec) + (f.unit ? ' ' + f.unit : '');
        cHost.appendChild(el('div', { class: 'tblwrap' }, el('table', { class: 'tbl', style: { minWidth: '520px' } },
          el('thead', {}, el('tr', {}, el('th', {}, 'Kennzahl'), el('th', {}, 'vorher'), el('th', {}, 'nachher'), el('th', {}, 'Differenz'), el('th', {}, ''))),
          el('tbody', {}, ...cmp.rows.filter(r => isFinite(r.a) || isFinite(r.b)).map(r => el('tr', {},
            el('td', {}, r.label), el('td', { class: 'n' }, fmtV(r.a, r)), el('td', { class: 'n' }, fmtV(r.b, r)),
            el('td', { class: 'n' }, isFinite(r.diff) ? (r.diff >= 0 ? '+' : '') + (r.time ? fmtDur(Math.abs(r.diff)) : fmt(r.diff, r.dec)) + (isFinite(r.pct) ? ' (' + (r.pct >= 0 ? '+' : '') + fmt(r.pct, 1) + ' %)' : '') : '–'),
            el('td', {}, r.better === null ? null : el('span', { class: 'badge ' + (r.better ? 'ok' : 'warn') }, r.better ? 'besser' : 'schlechter'))))))));
        if (cmp.diag.length) {
          cHost.appendChild(el('div', { style: { marginTop: '12px' } },
            el('div', { class: 'lbl-eng', style: { marginBottom: '6px' } }, 'Veränderte Befunde (' + cmp.diag.length + ')'),
            el('div', { class: 'tblwrap' }, el('table', { class: 'tbl', style: { minWidth: '480px' } },
              el('thead', {}, el('tr', {}, el('th', {}, 'Befund'), el('th', {}, 'vorher'), el('th', {}, 'nachher'), el('th', {}, 'Wert'))),
              el('tbody', {}, ...cmp.diag.slice(0, 20).map(d => el('tr', {},
                el('td', {}, ruleTitle(d.id)),
                el('td', {}, d.from ? el('span', { class: 'badge ' + (d.from === 'ok' ? 'ok' : d.from === 'warn' ? 'warn' : d.from === 'crit' ? 'crit' : 'mute') }, d.from) : el('span', { class: 'dim2' }, 'neu')),
                el('td', {}, el('span', { class: 'badge ' + (d.to === 'ok' ? 'ok' : d.to === 'warn' ? 'warn' : d.to === 'crit' ? 'crit' : 'mute') }, d.to)),
                el('td', { class: 'n' }, (d.va !== null && d.va !== undefined ? fmt(d.va, 2) : '–') + ' → ' + (d.vb !== null && d.vb !== undefined ? fmt(d.vb, 2) : '–') + (d.unit ? ' ' + d.unit : '')))))))));
        } else cHost.appendChild(el('p', { class: 'dim', style: { marginTop: '12px' } }, 'Kein Befund hat sich zwischen diesen Fahrten geändert.'));
      }
      host.appendChild(card('Zwei Fahrten vergleichen', {
        hint: 'vorher und nachher – etwa vor und nach einer Reparatur',
        info: { read: 'Beide Fahrten stammen aus der Akte. Die Tabelle stellt die Kennzahlen nebeneinander; „besser“ und „schlechter“ stehen nur dort, wo die Richtung eindeutig ist – weniger Verbrauch ist besser, mehr Strecke ist weder noch. Darunter stehen die Befunde, deren Bewertung oder Wert sich um mehr als zehn Prozent geändert hat.',
                good: 'Nach einer Reparatur: der behandelte Befund wechselt von auffällig auf unauffällig, der Rest bleibt gleich.',
                bad: 'Zwei Fahrten sind nur vergleichbar, wenn Strecke und Fahrweise ähnlich waren. Ein Verbrauchsunterschied zwischen Stadtfahrt und Autobahn sagt nichts über den Motor.' }
      }, cHost));
    }

    /* --- Persönliche Baseline --- */
    {
      const bl = baselineRules(shown).sort((a, b) => Math.abs(b.b.slope30 / (b.b.sigma || 1)) - Math.abs(a.b.slope30 / (a.b.sigma || 1)));
      const bHost = el('div');
      if (!bl.length) {
        bHost.appendChild(emptyBox('Noch keine eigene Baseline',
          'Ab ' + BASELINE_MIN_DRIVES + ' Fahrten mit demselben Messwert lernt die Akte den normalen Bereich dieses Wagens. Bisher: ' + shown.length + ' Fahrt(en) gespeichert. Der Werksbereich gilt für alle Exemplare, die Baseline nur für deines – damit fällt eine Abweichung auf, lange bevor sie das Werksband verlässt.'));
      } else {
        const cur = App.ds ? driveId(App.ds, App.fileName) : null;
        const refRows = App.akteRef ? App.akteRef.rows : null;
        const rows2 = bl.slice(0, 14).map(({ id, b }) => {
          const rb = refRows ? baselineFor(refRows, id, { minN: 2 }) : null;
          const now = cur ? (shown.find(r => r.id === cur) || {}) : null;
          const nowVal = now && now.diag ? (now.diag.find(d => d.id === id) || {}).value : null;
          const chk = cur ? baselineCheck(shown, id, nowVal, cur) : { ok: false };
          const drift = b.sigma > 1e-9 ? b.slope30 / b.sigma : 0;
          const badge = !chk.ok ? null
            : chk.kind === 'eigen' ? el('span', { class: 'badge warn' }, 'außerhalb der eigenen Norm')
            : chk.kind === 'beides' ? el('span', { class: 'badge crit' }, 'außerhalb Norm und Sollband')
            : el('span', { class: 'badge ok' }, 'im eigenen Normbereich');
          return el('tr', {},
            el('td', {}, ruleTitle(id)),
            el('td', { class: 'n' }, String(b.n)),
            el('td', { class: 'n' }, fmt(b.median, 2) + (b.unit ? ' ' + b.unit : '')),
            el('td', { class: 'n' }, '±' + fmt(3 * b.sigma, 2)),
            el('td', { class: 'n' }, (b.slope30 >= 0 ? '+' : '') + fmt(b.slope30, 2) + (b.unit ? ' ' + b.unit : '') + '/30 d'),
            el('td', { class: 'n' }, chk.ok ? fmt(nowVal, 2) : '–'),
            refRows ? el('td', { class: 'n', title: rb && rb.ok ? rb.n + ' Fahrten der Referenz' : 'in der Referenzakte nicht vorhanden' },
              rb && rb.ok ? fmt(rb.median, 2) + (Math.abs(rb.median - b.median) > 3 * Math.max(b.sigma, 1e-9) ? ' ⚠' : '') : '–') : null,
            el('td', {}, badge || el('span', { class: 'dim2' }, Math.abs(drift) > 0.5 ? 'driftet' : 'stabil')));
        });
        bHost.appendChild(el('div', { class: 'tblwrap' }, el('table', { class: 'tbl', style: { minWidth: '620px' } },
          el('thead', {}, el('tr', {}, el('th', {}, 'Befund'), el('th', {}, 'Fahrten'), el('th', {}, 'dein Normalwert'), el('th', {}, 'Streuband (3σ)'), el('th', {}, 'Trend'), el('th', {}, 'diese Fahrt'), App.akteRef ? el('th', { title: App.akteRef.name }, 'Referenz') : null, el('th', {}, 'Bewertung'))),
          el('tbody', {}, ...rows2))));
      }
      host.appendChild(card('Deine Baseline', {
        hint: 'der Normalbereich dieses Wagens, aus seinen eigenen Fahrten gelernt',
        info: { read: 'Für jeden Befund mit Zahlenwert bildet die Akte Median und robuste Streuung über alle gespeicherten Fahrten. Das Streuband ist der dreifache Streuwert um den Median – innerhalb davon ist ein Wert für dieses Auto normal. Der Trend ist die Steigung über die Zeit, umgerechnet auf 30 Tage. „Diese Fahrt“ vergleicht den aktuellen Wert gegen die Baseline der übrigen Fahrten.',
                good: 'Werte im eigenen Normbereich, Trend nahe null.',
                bad: '„Außerhalb der eigenen Norm“ bei gleichzeitig grünem Sollband ist der eigentliche Gewinn dieser Ansicht: das Auto verhält sich anders als sonst, obwohl der Werksbereich noch eingehalten ist. Ein stetiger Trend in eine Richtung ist ein Grund, die Messgröße im Auge zu behalten.' }
      }, bHost));
    }

    /* --- Wartungsstand --- */
    {
      const key = 'service:' + (filterProfile || (App.profile ? App.profile.id : 'alle'));
      const st = store.get(key, { km: null, done: {} });
      const list = serviceStatus(App.profile, st);
      const sHost = el('div');
      const kmIn = el('input', { class: 'inp', type: 'number', min: '0', step: '1000', value: st.km !== null && st.km !== undefined ? String(st.km) : '',
        placeholder: 'z. B. 185000', style: { width: '130px' },
        onchange: e => { st.km = e.target.value === '' ? null : +e.target.value; store.set(key, st); render(); } });
      sHost.appendChild(el('div', { class: 'chiprow', style: { alignItems: 'center', marginBottom: '10px' } },
        el('span', { class: 'field' }, el('span', { class: 'dim' }, 'Kilometerstand'), kmIn, el('span', { class: 'dim' }, 'km'))));
      const badge = s => s === 'over' ? el('span', { class: 'badge crit' }, 'fällig')
        : s === 'soon' ? el('span', { class: 'badge warn' }, 'bald')
        : s === 'ok' ? el('span', { class: 'badge ok' }, 'im Intervall')
        : el('span', { class: 'badge mute' }, 'unbekannt');
      const rows3 = list.map(it => {
        const kmIn2 = el('input', { class: 'inp', type: 'number', min: '0', step: '1000', value: it.lastKm !== null ? String(it.lastKm) : '', placeholder: 'km', style: { width: '104px' },
          onchange: e => { st.done = st.done || {}; st.done[it.id] = Object.assign({}, st.done[it.id], { km: e.target.value === '' ? null : +e.target.value }); store.set(key, st); render(); } });
        const dIn = el('input', { class: 'inp', type: 'date', value: it.lastDate ? new Date(it.lastDate).toISOString().slice(0, 10) : '', style: { width: '142px' },
          onchange: e => { st.done = st.done || {}; st.done[it.id] = Object.assign({}, st.done[it.id], { date: e.target.value ? new Date(e.target.value).getTime() : null }); store.set(key, st); render(); } });
        const rest = [];
        if (it.kmLeft !== null) rest.push((it.kmLeft >= 0 ? 'noch ' : 'überfällig ') + fmt(Math.abs(it.kmLeft), 0) + ' km');
        if (it.daysLeft !== null) rest.push((it.daysLeft >= 0 ? 'noch ' : 'überfällig ') + fmt(Math.abs(it.daysLeft), 0) + ' Tage');
        return el('tr', {},
          el('td', {}, el('b', {}, it.label), it.note ? el('span', { class: 'dim2', style: { display: 'block', fontSize: '11.5px', whiteSpace: 'normal' } }, it.note) : null),
          el('td', { class: 'n' }, (it.intervalKm ? fmt(it.intervalKm / 1000, 0) + ' tkm' : '') + (it.intervalKm && it.intervalMonths ? ' / ' : '') + (it.intervalMonths ? it.intervalMonths + ' Mon.' : '')),
          el('td', {}, kmIn2), el('td', {}, dIn),
          el('td', { class: 'n' }, rest.join(' · ') || '–'),
          el('td', {}, badge(it.status)));
      });
      sHost.appendChild(el('div', { class: 'tblwrap' }, el('table', { class: 'tbl', style: { minWidth: '680px' } },
        el('thead', {}, el('tr', {}, el('th', {}, 'Arbeit'), el('th', {}, 'Intervall'), el('th', {}, 'zuletzt km'), el('th', {}, 'zuletzt am'), el('th', {}, 'Rest'), el('th', {}, 'Stand'))),
        el('tbody', {}, ...rows3))));
      host.appendChild(card('Wartungsstand', {
        hint: 'Faustintervalle je Bauart – das Serviceheft des Herstellers geht vor',
        info: { read: 'Trage den aktuellen Kilometerstand ein und je Arbeit, bei welchem Stand und Datum sie zuletzt gemacht wurde. Die Liste rechnet daraus, was fällig ist. Welche Punkte erscheinen, hängt am Fahrzeugprofil: Zahnriemen nur bei Riementrieb, Kompressoröl nur beim Kompressor, Partikelfilter nur beim Diesel.',
                good: 'Alles im Intervall, Öl mit Datum und Kilometerstand belegt.',
                bad: 'Bremsflüssigkeit und Kühlmittel altern nach Zeit, nicht nach Kilometern – sie fallen bei Wenigfahrern als Erstes durch. Die Werte bleiben auf diesem Gerät.' }
      }, sHost));
    }

    const trendable = akteTrendableRules(cols);
    if (trendable.length) {
      const chosen0 = store.get('akteRule', trendable[0]);
      const chosen = trendable.indexOf(chosen0) >= 0 ? chosen0 : trendable[0];
      const rsel = el('select', { class: 'sel', onchange: e => { store.set('akteRule', e.target.value); render(); } },
        trendable.map(id => el('option', { value: id, selected: id === chosen ? true : null }, ruleTitle(id))));
      const pts = akteTrend(cols, chosen);
      const ref = pts.find(p => p.refLo !== null || p.refHi !== null) || {};
      const cc = card('Verlauf: ' + ruleTitle(chosen), { hint: pts[0] && pts[0].unit ? 'in ' + pts[0].unit : '',
        tools: rsel });
      const chartHost = el('div', { style: { height: '200px' } });
      cc.appendChild(chartHost);
      if (ref.ref) cc.appendChild(el('p', { class: 'card-f', style: { padding: '8px 0 0', borderTop: 0 } }, 'Sollbereich: ' + ref.ref));
      host.appendChild(cc);
      const ch = new Chart(chartHost, { type: 'bars', height: 200, labelWidth: 80 });
      const colorOf = s => s === 'ok' ? '#34d399' : s === 'warn' ? '#fbbf24' : s === 'crit' ? '#f87171' : '#8b95a8';
      ch.setData({ barData: pts.map(p => ({
        label: AKTE_FMT_DATE(p.date),
        value: p.value === null ? 0 : Math.abs(p.value),
        text: (p.value === null ? '–' : fmt(p.value, 2) + (p.unit ? ' ' + p.unit : '')) + '   ·   ' + (STATUS_TXT[p.status] || p.status),
        color: colorOf(p.status) })) });
      ch.draw();
    }
  };
  render();
};

/* --- Einstellungen --- */
BUILDERS.settings = function (page) {
  /* --- Installieren und offline --- */
  {
    const host = el('div');
    const state = el('p', { class: 'dim', style: { margin: '0 0 10px' } });
    const refresh = async () => {
      const parts = [];
      const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      parts.push(standalone ? 'Läuft als installierte App.' : 'Läuft im Browser-Tab.');
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        parts.push(reg && reg.active ? 'Offlinebetrieb ist eingerichtet.' : location.protocol === 'https:' || location.hostname === 'localhost'
          ? 'Offlinebetrieb wird beim nächsten Laden eingerichtet.' : 'Offlinebetrieb braucht https – über eine Datei geöffnet geht das nicht.');
      } else parts.push('Dieser Browser unterstützt keinen Offlinebetrieb.');
      if (typeof caches !== 'undefined') {
        try { const c = await caches.open('obd-tiles-v1'); const k = await c.keys(); parts.push(k.length + ' Kartenkacheln gespeichert.'); } catch (e) {}
      }
      state.textContent = parts.join(' ');
    };
    refresh();
    host.appendChild(state);
    host.appendChild(el('div', { class: 'chiprow' },
      el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (!App.installPrompt) { alert('Zum Installieren im Browsermenü „Zum Startbildschirm hinzufügen“ wählen. In Safari auf dem iPhone steht das im Teilen-Menü.'); return; }
        App.installPrompt.prompt(); await App.installPrompt.userChoice; App.installPrompt = null; refresh();
      } }, 'Als App installieren'),
      el('button', { class: 'btn', type: 'button', onclick: async () => {
        if (!App.map || !App.ds || !App.ds.track) { alert('Erst eine Fahrt mit GPS laden, dann sind die Kacheln dieser Gegend bekannt.'); return; }
        await App.map.prefetchTiles(1);
        refresh();
      } }, 'Karte dieser Fahrt speichern'),
      el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('clear-tiles');
        else if (typeof caches !== 'undefined') await caches.delete('obd-tiles-v1');
        setTimeout(refresh, 400);
      } }, 'Kartenspeicher leeren')));
    page.appendChild(card('Installieren und offline', {
      hint: 'die App auf dem Gerät behalten, auch ohne Netz',
      info: { read: 'Installiert liegt die App als eigenes Symbol auf dem Startbildschirm und startet ohne Netz. Kartenkacheln werden beim Anschauen gespeichert; „Karte dieser Fahrt speichern“ lädt zusätzlich die Umgebung der aktuellen Route in zwei Zoomstufen vor.',
              good: 'Für den Besichtigungstermin: App installieren, Karte der Gegend vorher laden, vor Ort ohne Netz arbeiten.',
              bad: 'Der Kartenspeicher wächst mit jeder angesehenen Gegend. Er ist auf etwa 1.200 Kacheln begrenzt und lässt sich hier leeren.' }
    }, host));
  }

  const ds = App.ds;
  page.appendChild(el('div', { class: 'chiprow', style: { marginBottom: '12px' } },
    el('button', { class: 'btn primary', type: 'button', onclick: () => openVehicleDialog({
      reason: 'Wähle das Triebwerk, gegen dessen Werksangaben die Diagnose prüfen soll.' }) },
      'Fahrzeug wählen …')));
  page.appendChild(profilePickerCard());
  page.appendChild(gearboxCard());

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

  const base = location.origin + location.pathname;
  page.appendChild(dataQualityCard());

  page.appendChild(card('Vom iPhone hierher — Kurzbefehl einrichten', {
    hint: 'ohne Umweg über Dateien speichern',
    foot: 'Warum der Umweg über die Zwischenablage: diese Seite liegt auf statischem Hosting und kann gar nichts entgegennehmen – es gibt keinen Server, der etwas empfangen könnte. Genau das ist der Grund, warum deine Aufzeichnung nirgendwo landet. Die Daten gehen vom Kurzbefehl direkt in den Browser und werden dort ausgewertet.'
  },
    el('p', { style: { color: 'var(--text-2)', fontSize: '13px', lineHeight: '1.65', margin: '0 0 14px' } },
      'In der Kurzbefehle-App einen neuen Kurzbefehl anlegen und diese fünf Aktionen in dieser Reihenfolge hinzufügen. ' +
      'In den Kurzbefehl-Einstellungen „Bei Teilen anzeigen“ aktivieren und als Eingabe „Dateien“ wählen – dann taucht er im Teilen-Menü der Dateien-App auf.'),
    el('ol', { class: 'recipe' },
      el('li', {}, el('div', {}, el('b', {}, 'Datei auswählen'),
        el('span', {}, 'Oder bei einem Teilen-Kurzbefehl: „Kurzbefehl-Eingabe erhalten“. Damit landet die CSV im Ablauf.'))),
      el('li', {}, el('div', {}, el('b', {}, 'Archiv erstellen'),
        el('span', {}, 'Packt die CSV als ZIP. Aus 28 MB werden rund 2 MB – ohne diesen Schritt liegen 28 MB Text in der Zwischenablage, was funktioniert, aber spürbar zäh ist.'))),
      el('li', {}, el('div', {}, el('b', {}, 'Base64 codieren'),
        el('span', {}, 'Macht aus dem Archiv reinen Text, denn die Zwischenablage kann nur Text an eine Webseite weitergeben.'))),
      el('li', {}, el('div', {}, el('b', {}, 'In die Zwischenablage kopieren'),
        el('span', {}, 'Die Daten bleiben auf dem Gerät.'))),
      el('li', {}, el('div', {}, el('b', {}, 'URL öffnen'),
        el('span', {}, 'Adresse: ', el('code', {}, base + '#clipboard'),
          ' Safari öffnet die Seite, fragt einmal nach der Erlaubnis zum Einsetzen – und die Auswertung steht.')))),
    el('div', { class: 'chiprow', style: { marginTop: '14px' } },
      el('button', { class: 'btn', onclick: e => {
        navigator.clipboard.writeText(base + '#clipboard')
          .then(() => { e.target.textContent = 'Adresse kopiert'; setTimeout(() => { e.target.textContent = 'Adresse für Schritt 5 kopieren'; }, 2200); })
          .catch(() => {});
      } }, 'Adresse für Schritt 5 kopieren'))));

  page.appendChild(card('Weitere Übergabewege', {
    hint: 'falls der Kurzbefehl nicht passt'
  }, el('div', { style: { fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.7', display: 'grid', gap: '10px' } },
    el('p', {}, el('b', { style: { color: 'var(--text-1)' } }, 'Von einer Adresse laden: '),
      'Hängt man ', el('code', {}, '?src=https://…/fahrt.csv'), ' an die Adresse an, holt die Seite die Datei selbst. ' +
      'Der Server, auf dem die Datei liegt, muss dafür ', el('code', {}, 'Access-Control-Allow-Origin'), ' senden – ein iCloud-Freigabelink reicht nicht, der liefert eine Vorschauseite statt der Datei.'),
    el('p', {}, el('b', { style: { color: 'var(--text-1)' } }, 'Direkt einfügen: '),
      'Auf dem Startbildschirm gibt es ein Einfügefeld. Langes Tippen, „Einsetzen“ – fertig. Am Rechner reicht ⌘V beziehungsweise Strg+V irgendwo auf der Seite.'),
    el('p', {}, el('b', { style: { color: 'var(--text-1)' } }, 'Gepackte Dateien: '),
      'Der Datei-Dialog nimmt auch ', el('code', {}, '.zip'), ' und ', el('code', {}, '.gz'),
      ' entgegen und entpackt sie im Browser. Braucht iOS 16.4 oder neuer.'))));

  page.appendChild(card('Über dieses Werkzeug', {},
    el('div', { style: { fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.7', display: 'grid', gap: '10px' } },
      el('p', {}, 'Eine einzelne HTML-Datei ohne Server, ohne Framework, ohne Tracking. Die CSV wird im Browser gelesen und verlässt das Gerät nicht. Einzige Netzwerkverbindung sind die Kartenkacheln – wer auch das vermeiden will, stellt den Kartenstil auf „Ohne Karte“.'),
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
  download(baseName() + '_diagnose.txt', 'text/plain;charset=utf-8', reportText());
}
function reportText() {
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
  const t = App.diag.tally;
  L.push('ERGEBNIS: ' + t.ok + ' unauffaellig, ' + t.warn + ' grenzwertig, ' + t.crit + ' auffaellig, ' +
         (t.unklar + t.missing) + ' nicht bewertbar');
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
  return L.join('\n');
}
function canShareFiles() {
  try { return !!(navigator.canShare && navigator.share &&
    navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] })); }
  catch (e) { return false; }
}
async function shareReport() {
  const files = [
    new File([reportText()], baseName() + '_diagnose.txt', { type: 'text/plain' })
  ];
  try { await navigator.share({ title: 'Fahrtauswertung ' + baseName(), files }); }
  catch (e) { if (e && e.name !== 'AbortError') download(files[0].name, 'text/plain;charset=utf-8', files[0]); }
}

function baseName() {
  return (App.fileName || 'fahrt').replace(/\.[^.]+$/, '').replace(/[^\wäöüÄÖÜß.\- ]+/g, '_');
}

/* ---------- Start ---------- */
(function init() {
  const saved = store.get('theme', null);
  applyTheme(saved || 'dark');   // das Gerät ist dunkel; hell nur auf ausdrückliche Wahl
  /* Drucken: helles Schema, aufgeklappte Befunde, nur die aktuelle Seite */
  const printBtn = $('#print'); if (printBtn) printBtn.onclick = () => window.print();
  /* Offlinefähig machen: der Service Worker legt App und Kartenkacheln ab.
     Nur über https oder localhost erlaubt – bei file:// wird es still übersprungen. */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
    navigator.serviceWorker.register('sw.js').then(r => { App.sw = r; }).catch(() => {});
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); App.installPrompt = e; });
  /* Live-Aufzeichnung: nur zeigen, wo der Browser Bluetooth kann */
  if (liveSupported()) { const lb = $('#open-live'); if (lb) { lb.hidden = false; lb.onclick = openLiveDialog; } }
  /* Geteilte Zusammenfassung: als Karte auf dem Startbildschirm zeigen */
  (async () => {
    const code = shareFromUrl(); if (!code) return;
    const hero = $('#hero').querySelector('div');
    try {
      const s = await decodeShare(code);
      const K = el('div', { class: 'grid kpis' },
        kpi('Strecke', s.k.dist !== null ? fmt(s.k.dist, 2) : '–', 'km', s.k.moving ? 'davon ' + fmtDur(s.k.moving) + ' in Bewegung' : ''),
        kpi('⌀ Geschwindigkeit', s.k.vAvg !== null ? fmt(s.k.vAvg, 0) : '–', 'km/h', s.k.vMax !== null ? 'höchstens ' + fmt(s.k.vMax, 0) + ' km/h' : ''),
        kpi('Verbrauch', s.k.cons !== null ? fmt(s.k.cons, 1) : '–', 'L/100km', s.k.fuel !== null ? fmt(s.k.fuel, 2) + ' L' : ''),
        kpi('Höchstdrehzahl', s.k.rpmMax !== null ? fmt(s.k.rpmMax, 0) : '–', 'min⁻¹', s.k.coolMax !== null ? 'Kühlmittel max. ' + fmt(s.k.coolMax, 0) + ' °C' : ''));
      const byStatus = { o: [], w: [], c: [] };
      (s.f || []).forEach(f => { if (byStatus[f[1]]) byStatus[f[1]].push(f); });
      const rt = id => { const r = DIAG_RULES.find(x => x.id === id); return r ? r.title : id; };
      const list = (arr, cls, label) => arr.length ? el('div', { style: { marginTop: '10px' } },
        el('div', { class: 'lbl-eng', style: { marginBottom: '6px' } }, label + ' (' + arr.length + ')'),
        el('div', { class: 'chiprow' }, arr.map(f => el('span', { class: 'badge ' + cls }, rt(f[0]) + (f[2] !== null ? ': ' + fmt(f[2], 2) + ' ' + (f[3] || '') : ''))))) : null;
      hero.prepend(el('div', { style: { width: 'min(720px,100%)', margin: '0 auto 18px' } },
        card('Geteilte Auswertung' + (s.pn ? ' · ' + s.pn : ''), {
          hint: (s.d || 'Fahrt') + (s.t && s.t[1] ? ' · ' + fmtDur(s.t[1]) : '') + ' · nur Zusammenfassung, keine Rohdaten',
          info: { read: 'Diese Zahlen stammen aus einem geteilten Link, nicht aus einer Datei auf diesem Gerät. Route, Zeitreihen und Rohdaten sind nicht enthalten.',
                  good: 'Für eine schnelle Einschätzung reicht das: Kennzahlen und alle bewerteten Befunde sind enthalten.',
                  bad: 'Ohne Rohdaten lässt sich nichts nachrechnen. Frage nach der CSV, wenn ein Befund strittig ist.' }
        }, K, list(byStatus.c, 'crit', 'Auffällig'), list(byStatus.w, 'warn', 'Grenzwertig'), list(byStatus.o, 'ok', 'Unauffällig'),
          el('p', { class: 'dim2', style: { marginTop: '12px', fontSize: '12px' } }, 'Eigene CSV laden, um eine vollständige Auswertung zu sehen.'))));
      history.replaceState(null, '', location.pathname);
    } catch (e) { hero.prepend(noteBox('crit', 'Geteilter Link nicht lesbar', String(e.message || e))); }
  })();
  let printTheme = null, printOpened = [];
  window.addEventListener('beforeprint', () => {
    printTheme = document.documentElement.getAttribute('data-theme'); applyTheme('light');
    printOpened = $$('#pages .page:not([hidden]) details:not([open])'); printOpened.forEach(d => { d.open = true; });
  });
  window.addEventListener('afterprint', () => {
    if (printTheme) applyTheme(printTheme);
    printOpened.forEach(d => { d.open = false; }); printOpened = [];
  });
  $('#theme').addEventListener('click', () =>
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

  const fileEl = $('#file');
  $('#pick').addEventListener('click', () => fileEl.click());
  $('#new-file').addEventListener('click', () => fileEl.click());
  fileEl.addEventListener('change', e => { if (e.target.files.length) loadFiles(e.target.files); });

  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => {
    e.stopPropagation();                          // sonst faengt der window-Handler dieselbe Datei nochmal
    if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
  });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f && $('#hero').hidden === false) loadFile(f);
  });

  $('#open-buy').addEventListener('click', () => openShell('buy'));

  /* Zwischenablage */
  $('#paste').addEventListener('click', async () => {
    try { await ingest({ kind: 'text', text: await readClipboard(), name: 'Aus Zwischenablage' }); }
    catch (e) { loadFailed(e); }
  });
  /* Einfügefeld: funktioniert auch dort, wo der direkte Zugriff verweigert wird */
  const pasteBox = $('#pastebox');
  pasteBox.addEventListener('paste', e => {
    const t = (e.clipboardData || window.clipboardData).getData('text');
    if (t && t.trim()) { e.preventDefault(); pasteBox.value = ''; ingest({ kind: 'text', text: t, name: 'Eingefügte Daten' }); }
  });
  pasteBox.addEventListener('input', () => {
    const t = pasteBox.value;
    if (t.length > 200) { pasteBox.value = ''; ingest({ kind: 'text', text: t, name: 'Eingefügte Daten' }); }
  });
  document.addEventListener('paste', e => {
    if (!$('#hero').hidden && document.activeElement !== pasteBox) {
      const t = (e.clipboardData || window.clipboardData).getData('text');
      if (t && t.trim().length > 200) { e.preventDefault(); ingest({ kind: 'text', text: t, name: 'Eingefügte Daten' }); }
    }
  });

  /* Übergabe per Adresse: ?src=…  ·  #gz=…  ·  #clipboard
     Auch bei bereits geöffneter Seite: ein Kurzbefehl ändert dann nur den Anker,
     die Seite lädt nicht neu — deshalb zusätzlich auf hashchange hören. */
  $('#hand-go').addEventListener('click', async () => {
    try { await ingest({ kind: 'text', text: await readClipboard(), name: 'Aus Zwischenablage' }); }
    catch (e) { loadFailed(e); }
  });
  $('#hand-alt').addEventListener('click', () => {
    $('#hand').hidden = true;
    pasteBox.focus();
    pasteBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  function applyHandoff() {
    const ho = handoffFromUrl();
    if (!ho.src && !ho.gz && !ho.clip) return false;
    resetToHero();
    if (ho.src)      ingest({ kind: 'url', url: ho.src, name: ho.name });
    else if (ho.gz)  ingest({ kind: 'text', text: ho.gz, name: ho.name || 'Übergebene Daten' });
    else             $('#hand').hidden = false;
    return true;
  }
  applyHandoff();
  window.addEventListener('hashchange', applyHandoff);

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

  window.addEventListener('resize', debounce(() => { Chart.all.forEach(c => { c.resize(); c.draw(); }); if (App.map) { App.map.resize(); App.map.draw(); } }, 140));
})();
