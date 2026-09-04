/* ---------------------------------------------------------------------------
   Fahrzeugakte: mehrere Fahrten desselben Fahrzeugs nebeneinander.

   Jeder Befund endet mit "eine Fahrt ist eine Momentaufnahme" – und das ist
   richtig. Erst über mehrere Fahrten wird aus einer Zahl ein Verlauf: driftet die
   Gemischkorrektur, wird die Rückkühlung schwächer, wandert die Leerlaufdrehzahl.

   Gespeichert werden NICHT die CSV-Dateien, sondern nur die Auswertung – ein paar
   Kilobyte je Fahrt. Ablage im Browser (IndexedDB), ohne Server, ohne Konto. Zwischen
   Geräten wandert die Akte als JSON-Datei; das ist der Ersatz für eine Cloud.
--------------------------------------------------------------------------- */

const AKTE_DB = 'obdstudio', AKTE_STORE = 'fahrten', AKTE_VERSION = 1;

/* Datum aus dem Dateinamen, wie Car Scanner ihn schreibt: "2026-08-30 11-19-42.csv".
   Zuverlässiger als jede Uhrzeit im Inhalt, die ja nur Sekunden seit Mitternacht kennt. */
function dateFromFileName(name) {
  const m = String(name || '').match(/(\d{4})-(\d{2})-(\d{2})[ _T]?(\d{2})?[-:.]?(\d{2})?/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  return isFinite(d.getTime()) ? d.getTime() : null;
}

/* Kennung einer Fahrt: Dateiname + Zeitbasis + Dauer. Dieselbe Datei nochmal
   eingelesen ersetzt ihren Eintrag, statt ihn zu verdoppeln. */
function driveId(ds, fileName) {
  return 'f_' + Math.abs(hashCode(String(fileName || '') + '|' + Math.round(ds.t0) + '|' + Math.round(ds.duration))).toString(36);
}

/* Das, was von einer Fahrt in der Akte bleibt. Bewusst klein und flach. */
function driveSummary(ds, diag, gears, profile, fileName) {
  const T = ds.trip || {}, S = ds.stats || {};
  const num = (v, d) => (isFinite(v) ? +(+v).toFixed(d === undefined ? 2 : d) : null);
  const when = dateFromFileName(fileName) || Date.now();
  const core = ['rpm', 'speed', 'speed_gps', 'coolant', 'load_abs', 'timing', 'ltft_b1', 'ltft_b2', 'cac_b1',
                'pedal', 'boost', 'fuel_rate', 'fuel_used', 'distance', 'oil_temp', 'stft_b1', 'lambda', 'o2_b1s1',
                'maf', 'fuel_press', 'batt', 'trans_temp', 'iat', 'ambient', 'cat_temp_b1', 'dpf_temp', 'egr', 'map'];
  const present = core.filter(id => ds.G && ds.G[id]);
  return {
    v: 1,
    id: driveId(ds, fileName),
    file: fileName || '',
    date: when,
    savedAt: Date.now(),
    profileId: profile ? profile.id : null,
    profileName: profile ? profile.name : null,
    duration: num(ds.duration, 0),
    dist: num(T.dist), distSource: T.distSource || '',
    consAvg: num(T.consAvg, 1), fuelUsed: num(T.fuelUsed, 2),
    vMax: num(T.speedMax, 0), vAvgMoving: num(T.speedAvgMoving, 1),
    rpmMax: num(T.rpmMax, 0),
    coolantStart: num(T.coolantStart, 0), coolantMax: num(T.coolantMax, 0), warmupTime: num(T.warmupTime, 0),
    movingTime: num(T.movingTime, 0), stoppedTime: num(T.stoppedTime, 0),
    stops: ds.events ? ds.events.stops.length : 0,
    knock: ds.events ? ds.events.knock.length : 0,
    wotTime: ds.events ? num(ds.events.wot.reduce((a, w) => a + w.dur, 0), 0) : 0,
    sprints: ds.events ? ds.events.sprints.map(s => ({ from: s.from, to: s.to, s: num(s.dur, 2) })) : [],
    gears: gears && gears.gears ? gears.gears.map(g => ({ label: g.label, gear: g.gear || null, kmh: num(g.kmhPer1000, 1), weak: !!g.weak })) : [],
    gearbox: gears && gears.gearbox && gears.gearbox.label ? gears.gearbox.label : null,
    present,
    diag: diag && diag.results ? diag.results.map(r => ({
      id: r.id, status: r.status,
      value: isFinite(r.value) ? +(+r.value).toFixed(r.dec === undefined ? 2 : Math.max(0, r.dec)) : null,
      unit: r.unit || null, ref: r.ref || null,
      refLo: isFinite(r.refLo) ? r.refLo : null, refHi: isFinite(r.refHi) ? r.refHi : null,
      note: r.status === 'unklar' ? (r.note || '').slice(0, 200) : null,
      missing: r.status === 'missing' ? (r.missing || []) : null
    })) : [],
    tally: diag && diag.tally ? diag.tally : null,
    dtc: (typeof activeDtcCodes === 'function') ? activeDtcCodes() : [],
    notes: '',
    marks: sortNotes(store.get(notesKey(driveId(ds, fileName)), [])).map(n => ({ t: n.t, text: n.text }))
  };
}

/* ---- Ablage: IndexedDB, mit Rückfall auf ein Feld im Speicher -------------- */
const akteMem = { rows: new Map() };
function akteOpen() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(AKTE_DB, AKTE_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(AKTE_STORE)) {
          const st = db.createObjectStore(AKTE_STORE, { keyPath: 'id' });
          st.createIndex('profileId', 'profileId', { unique: false });
          st.createIndex('date', 'date', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}
function akteTx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(AKTE_STORE, mode);
      const st = tx.objectStore(AKTE_STORE);
      const out = fn(st);
      tx.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (e) { reject(e); }
  });
}
async function aktePut(row) {
  const db = await akteOpen();
  if (!db) { akteMem.rows.set(row.id, row); return row.id; }
  await akteTx(db, 'readwrite', st => st.put(row));
  db.close();
  return row.id;
}
async function akteDelete(id) {
  const db = await akteOpen();
  if (!db) { akteMem.rows.delete(id); return; }
  await akteTx(db, 'readwrite', st => st.delete(id));
  db.close();
}
async function akteAll() {
  const db = await akteOpen();
  if (!db) return Array.from(akteMem.rows.values()).sort((a, b) => a.date - b.date);
  const rows = await new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(AKTE_STORE, 'readonly');
      const req = tx.objectStore(AKTE_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
  db.close();
  return rows.sort((a, b) => a.date - b.date);
}
async function akteGet(id) {
  const all = await akteAll();
  return all.find(r => r.id === id) || null;
}

/* ---- Austausch als Datei -------------------------------------------------- */
function akteExportJson(rows) {
  return JSON.stringify({ format: 'obd-telemetrie-studio/akte', version: 1, exported: Date.now(), fahrten: rows }, null, 1);
}
/* Zusammenführen: gleiche Kennung -> der jüngere Stand gewinnt; alles andere kommt dazu. */
function akteMerge(existing, incoming) {
  const by = new Map(existing.map(r => [r.id, r]));
  let added = 0, updated = 0;
  for (const r of incoming) {
    if (!r || !r.id || !Array.isArray(r.diag)) continue;
    const old = by.get(r.id);
    if (!old) { by.set(r.id, r); added++; }
    else if ((r.savedAt || 0) > (old.savedAt || 0)) { by.set(r.id, Object.assign({}, r, { notes: r.notes || old.notes })); updated++; }
  }
  return { rows: Array.from(by.values()).sort((a, b) => a.date - b.date), added, updated };
}
function akteParseImport(text) {
  const j = JSON.parse(text);
  const rows = Array.isArray(j) ? j : (j && Array.isArray(j.fahrten) ? j.fahrten : null);
  if (!rows) throw new Error('Das ist keine Akte dieses Werkzeugs – erwartet wird eine JSON-Datei mit einem Feld „fahrten“.');
  return rows;
}

/* ---- Verlauf je Regel über alle Fahrten ----------------------------------- */
function akteTrend(rows, ruleId) {
  const pts = [];
  for (const r of rows) {
    const d = (r.diag || []).find(x => x.id === ruleId);
    if (!d) continue;
    pts.push({ date: r.date, id: r.id, status: d.status, value: d.value, unit: d.unit, refLo: d.refLo, refHi: d.refHi, ref: d.ref, file: r.file });
  }
  return pts;
}
/* Regeln, die in mindestens zwei Fahrten einen Zahlenwert haben – nur die taugen als Verlauf. */
function akteTrendableRules(rows) {
  const count = new Map();
  for (const r of rows) for (const d of (r.diag || [])) if (d.value !== null && d.value !== undefined) count.set(d.id, (count.get(d.id) || 0) + 1);
  return Array.from(count.entries()).filter(([, n]) => n >= 2).map(([id]) => id);
}

/* ===== Persönliche Baseline =========================================
   Ab genügend Fahrten lernt die Akte den normalen Bereich dieses Wagens.
   Abweichung davon ist ein Befund, auch wenn der Wert im Werksband liegt:
   das Werksband gilt für alle Exemplare, die Baseline nur für dieses.
   ================================================================== */
const BASELINE_MIN_DRIVES = 5;

function baselineFor(rows, ruleId, opts) {
  opts = opts || {};
  const minN = opts.minN || BASELINE_MIN_DRIVES;
  const pts = akteTrend(rows, ruleId).filter(p => p.value !== null && p.value !== undefined && isFinite(p.value));
  if (pts.length < minN) return { ok: false, n: pts.length, need: minN };
  const vals = pts.map(p => p.value).sort((a, b) => a - b);
  const q = f => { const i = (vals.length - 1) * f, lo = Math.floor(i), hi = Math.ceil(i); return vals[lo] + (vals[hi] - vals[lo]) * (i - lo); };
  const med = q(0.5);
  const mad = vals.map(v => Math.abs(v - med)).sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  const sigma = mad * 1.4826;                       // robuste Streuung
  const band = [med - 3 * sigma, med + 3 * sigma];  // eigener Normalbereich
  /* Trend: Steigung der kleinsten Quadrate über die Zeit, in Einheit je 30 Tage */
  const t0 = pts[0].date;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  pts.forEach(p => { const x = (p.date - t0) / 86400000; sx += x; sy += p.value; sxy += x * p.value; sxx += x * x; });
  const n = pts.length, den = n * sxx - sx * sx;
  const slope = Math.abs(den) > 1e-9 ? (n * sxy - sx * sy) / den : 0;
  const spanDays = (pts[n - 1].date - t0) / 86400000;
  return { ok: true, n, median: med, sigma, band, unit: pts[0].unit, ref: pts[0].ref,
           refLo: pts[0].refLo, refHi: pts[0].refHi, slope30: slope * 30, spanDays, points: pts,
           last: pts[n - 1] };
}

/* Bewertet den Wert der aktuellen Fahrt gegen die Baseline der übrigen Fahrten */
function baselineCheck(rows, ruleId, currentValue, currentId) {
  const others = rows.filter(r => r.id !== currentId);
  const b = baselineFor(others, ruleId);
  if (!b.ok || !isFinite(currentValue)) return { ok: false, n: b.n || 0, need: BASELINE_MIN_DRIVES };
  const dev = currentValue - b.median;
  const z = b.sigma > 1e-9 ? dev / b.sigma : 0;
  const outside = b.sigma > 1e-9 && Math.abs(z) > 3;
  const insideSpec = b.refLo === null || b.refLo === undefined || (currentValue >= b.refLo && currentValue <= b.refHi);
  return { ok: true, n: b.n, median: b.median, sigma: b.sigma, band: b.band, z, dev, outside, insideSpec,
           unit: b.unit, slope30: b.slope30, spanDays: b.spanDays,
           kind: outside && insideSpec ? 'eigen' : outside ? 'beides' : 'normal' };
}

/* Alle Regeln, für die genug Fahrten für eine Baseline vorliegen */
function baselineRules(rows, minN) {
  const ids = akteTrendableRules(rows);
  return ids.map(id => ({ id, b: baselineFor(rows, id, { minN: minN || BASELINE_MIN_DRIVES }) })).filter(x => x.b.ok);
}

/* ===== Wartungsstand ================================================
   Der Nutzer trägt Kilometerstand und erledigte Arbeiten ein; daraus
   rechnet die Akte, was fällig ist. Intervalle sind Faustwerte je
   Bauart – das Serviceheft des Herstellers geht immer vor.
   ================================================================== */
const SERVICE_ITEMS = [
  { id: 'oil',        label: 'Motoröl und Filter',   km: 15000, months: 12, note: 'Longlife nur bei passendem Öl und ruhigem Profil; bei Kurzstrecke und Direkteinspritzung eher jährlich.' },
  { id: 'air',        label: 'Luftfilter',           km: 60000, months: 48, note: 'Bei staubiger Umgebung früher.' },
  { id: 'cabin',      label: 'Innenraumfilter',      km: 30000, months: 24, note: '' },
  { id: 'spark',      label: 'Zündkerzen',           km: 60000, months: 72, note: 'Aufgeladene Direkteinspritzer oft 30.000–45.000 km.', fuel: 'petrol' },
  { id: 'brakefluid', label: 'Bremsflüssigkeit',     km: null,  months: 24, note: 'Wasseraufnahme ist zeit-, nicht kilometerabhängig.' },
  { id: 'coolant',    label: 'Kühlmittel',           km: null,  months: 60, note: '' },
  { id: 'trans',      label: 'Getriebeöl',           km: 60000, months: 72, note: 'Doppelkupplung meist 60.000 km, Wandler oft „lebenslang“ – bei hoher Laufleistung trotzdem wechseln.', gearbox: 'auto' },
  { id: 'haldex',     label: 'Haldex-Öl',            km: 60000, months: 72, note: 'Nur bei Allrad mit Lamellenkupplung.' },
  { id: 'timing',     label: 'Zahnriemen',           km: 120000, months: 96, note: 'Nur bei Riementrieb – bei Kette entfällt der Punkt.', timing: 'Zahnriemen' },
  { id: 'dpf',        label: 'Partikelfilter prüfen', km: 100000, months: 96, note: 'Beladung und Aschemasse auslesen.', fuel: 'diesel' },
  { id: 'compressor', label: 'Kompressoröl',         km: 100000, months: 120, note: 'Roots-Kompressor mit eigenem Ölvorrat.', aspiration: 'kompressor' }
];

function serviceApplies(item, profile) {
  if (!profile) return !item.fuel && !item.aspiration && !item.timing;
  if (item.fuel && profile.fuel !== item.fuel) return false;
  if (item.aspiration && profile.aspiration !== item.aspiration) return false;
  if (item.timing && (profile.specs || {}).timingDrive !== item.timing) return false;
  return true;
}

/* state = { km: aktueller Stand, done: { id: { km, date } } } */
function serviceStatus(profile, state, nowMs) {
  state = state || {}; nowMs = nowMs || Date.now();
  const km = isFinite(state.km) ? +state.km : NaN;
  return SERVICE_ITEMS.filter(it => serviceApplies(it, profile)).map(it => {
    const d = (state.done || {})[it.id] || {};
    const dueKm = it.km && isFinite(d.km) ? d.km + it.km : null;
    const dueDate = it.months && d.date ? new Date(d.date) : null;
    if (dueDate) dueDate.setMonth(dueDate.getMonth() + it.months);
    const kmLeft = dueKm !== null && isFinite(km) ? dueKm - km : null;
    const daysLeft = dueDate ? Math.round((dueDate.getTime() - nowMs) / 86400000) : null;
    const known = isFinite(d.km) || !!d.date;
    let status = 'unknown';
    if (known) {
      const overdue = (kmLeft !== null && kmLeft < 0) || (daysLeft !== null && daysLeft < 0);
      const soon = (kmLeft !== null && kmLeft < 2000) || (daysLeft !== null && daysLeft < 60);
      status = overdue ? 'over' : soon ? 'soon' : 'ok';
    }
    return { id: it.id, label: it.label, note: it.note, intervalKm: it.km, intervalMonths: it.months,
             lastKm: isFinite(d.km) ? d.km : null, lastDate: d.date || null, dueKm, dueDate: dueDate ? dueDate.getTime() : null,
             kmLeft, daysLeft, status };
  });
}

/* ===== Zwei Fahrten vergleichen =====================================
   Stellt die gespeicherten Kennzahlen zweier Fahrten nebeneinander und
   nennt die Abweichung. Ohne Rohdaten – die stehen nicht in der Akte.
   ================================================================== */
const COMPARE_FIELDS = [
  { k: 'dist',        label: 'Strecke',                 unit: 'km',       dec: 2, dir: 0 },
  { k: 'duration',    label: 'Dauer',                   unit: 's',        dec: 0, dir: 0, time: true },
  { k: 'vAvgMoving',  label: '⌀ Geschwindigkeit',       unit: 'km/h',     dec: 1, dir: 0 },
  { k: 'vMax',        label: 'Höchstgeschwindigkeit',   unit: 'km/h',     dec: 0, dir: 0 },
  { k: 'consAvg',     label: 'Verbrauch',               unit: 'L/100km',  dec: 1, dir: -1 },
  { k: 'fuelUsed',    label: 'Kraftstoff',              unit: 'L',        dec: 2, dir: -1 },
  { k: 'rpmMax',      label: 'Höchstdrehzahl',          unit: 'min⁻¹',    dec: 0, dir: 0 },
  { k: 'coolantMax',  label: 'Kühlmittel max.',         unit: '°C',       dec: 0, dir: -1 },
  { k: 'warmupTime',  label: 'Warmlaufzeit',            unit: 's',        dec: 0, dir: -1, time: true },
  { k: 'stops',       label: 'Stopps',                  unit: '',         dec: 0, dir: 0 },
  { k: 'knock',       label: 'Klopfereignisse',         unit: '',         dec: 0, dir: -1 },
  { k: 'wotTime',     label: 'Volllastzeit',            unit: 's',        dec: 0, dir: 0, time: true }
];

function compareDrives(a, b) {
  if (!a || !b) return null;
  const rows = COMPARE_FIELDS.map(f => {
    const va = a[f.k] === undefined || a[f.k] === null ? NaN : +a[f.k];
    const vb = b[f.k] === undefined || b[f.k] === null ? NaN : +b[f.k];
    const diff = isFinite(va) && isFinite(vb) ? vb - va : NaN;
    const pct = isFinite(diff) && Math.abs(va) > 1e-9 ? diff / Math.abs(va) * 100 : NaN;
    /* Richtung: -1 = kleiner ist besser, +1 = größer ist besser, 0 = neutral */
    const better = f.dir === 0 || !isFinite(diff) ? null : (f.dir * diff > 0);
    return Object.assign({}, f, { a: va, b: vb, diff, pct, better });
  });
  /* Befunde, deren Status oder Wert sich geändert hat */
  const byId = new Map((a.diag || []).map(d => [d.id, d]));
  const diag = [];
  for (const d of (b.diag || [])) {
    const p = byId.get(d.id);
    if (!p) { diag.push({ id: d.id, from: null, to: d.status, va: null, vb: d.value, unit: d.unit, changed: true }); continue; }
    const vChanged = p.value !== null && d.value !== null && p.value !== undefined && d.value !== undefined &&
                     Math.abs(d.value - p.value) > Math.max(0.05, Math.abs(p.value) * 0.1);
    if (p.status !== d.status || vChanged)
      diag.push({ id: d.id, from: p.status, to: d.status, va: p.value, vb: d.value, unit: d.unit || p.unit,
                  changed: true, statusChanged: p.status !== d.status });
  }
  const order = { crit: 0, warn: 1, unklar: 2, missing: 3, ok: 4 };
  diag.sort((x, y) => (order[x.to] === undefined ? 9 : order[x.to]) - (order[y.to] === undefined ? 9 : order[y.to]));
  /* Gänge nebeneinander */
  const gears = [];
  const gb = new Map((b.gears || []).map(g => [g.label, g]));
  for (const g of (a.gears || [])) {
    const o = gb.get(g.label);
    gears.push({ label: g.label, a: g.kmh, b: o ? o.kmh : null, dev: o && g.kmh ? (o.kmh - g.kmh) / g.kmh * 100 : NaN });
  }
  return { a, b, rows, diag, gears };
}
