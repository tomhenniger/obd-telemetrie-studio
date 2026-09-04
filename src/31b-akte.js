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
