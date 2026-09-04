/* ===== Tempolimits aus OpenStreetMap ===============================
   Vergleicht die gefahrene Geschwindigkeit mit den in OpenStreetMap
   hinterlegten Tempolimits (maxspeed) entlang der Route. Die Limits kommen
   über die freie Overpass-API; dafür wird die ausgedünnte Route an den
   Server geschickt – deshalb nur auf ausdrücklichen Klick.

   Bewertung je Trackpunkt:
     ok        unter oder auf dem Limit (oder Limit „none“)
     sign      über einem Limit, das durch Schild oder Ortstafel gilt  → rot
     implicit  über dem impliziten Außerorts-Limit ohne Schild         → gelb
     unsure    Limit unbekannt, oder ein bedingtes Limit (Mo–Fr, Uhrzeit)
               lässt sich ohne Datum/Uhrzeit nicht entscheiden          → blau
     noroad    keine Straße im Umkreis gefunden                         → grau
   ================================================================== */

const LIMIT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const LIMIT_ROAD_EXCLUDE = '^(footway|path|cycleway|steps|track|service|pedestrian|bridleway|platform|corridor|bus_guideway|raceway|construction|proposed|abandoned|razed|elevator|escape)$';
const LIMIT_CAT = { noroad: 0, ok: 1, implicit: 2, sign: 3, unsure: 4 };
const LIMIT_CAT_NAME = ['noroad', 'ok', 'implicit', 'sign', 'unsure'];

/* Landesübliche implizite Limits (km/h); Infinity = unbegrenzt */
const IMPLICIT_LIMITS = {
  de: { urban: 50, rural: 100, motorway: Infinity, trunk: 100, living_street: 7, bicycle_road: 30 },
  at: { urban: 50, rural: 100, motorway: 130, trunk: 100, living_street: 7 },
  ch: { urban: 50, rural: 80, motorway: 120, trunk: 100, living_street: 20 },
  fr: { urban: 50, rural: 80, motorway: 130, trunk: 110, living_street: 20 },
  nl: { urban: 50, rural: 80, motorway: 100, trunk: 100, living_street: 15 },
  be: { urban: 50, rural: 70, motorway: 120, trunk: 120, living_street: 20 },
  it: { urban: 50, rural: 90, motorway: 130, trunk: 110, living_street: 20 },
  dk: { urban: 50, rural: 80, motorway: 130, trunk: 80, living_street: 15 },
  pl: { urban: 50, rural: 90, motorway: 140, trunk: 120, living_street: 20 },
  cz: { urban: 50, rural: 90, motorway: 130, trunk: 110, living_street: 20 },
  lu: { urban: 50, rural: 90, motorway: 130, trunk: 90, living_street: 20 }
};

/* ---------- Route ausdünnen und Abfrage bauen ---------- */
function limitsThinTrack(tr, minM, maxPts) {
  minM = minM || 40; maxPts = maxPts || 650;
  let pts;
  for (let pass = 0; pass < 8; pass++) {
    pts = [];
    let lastLat = NaN, lastLon = NaN;
    for (let i = 0; i < tr.n; i++) {
      const la = tr.lat[i], lo = tr.lon[i];
      if (!(la === la && lo === lo)) continue;
      if (pts.length && haversine(lastLat, lastLon, la, lo) < minM) continue;
      pts.push([la, lo]); lastLat = la; lastLon = lo;
    }
    if (pts.length <= maxPts) break;
    minM *= 1.6;
  }
  return pts;
}

function limitsOverpassQuery(pts, radiusM) {
  const poly = pts.map(p => p[0].toFixed(5) + ',' + p[1].toFixed(5)).join(',');
  return '[out:json][timeout:90];' +
    'way(around:' + (radiusM || 25) + ',' + poly + ')["highway"]["highway"!~"' + LIMIT_ROAD_EXCLUDE + '"];' +
    'out tags geom;';
}

/* Route in zusammenhängende Abschnitte von etwa targetKm Länge teilen – wenige, große
   Abschnitte, weil die öffentlichen Server jede Anfrage einzeln zählen und drosseln. */
function limitsChunks(pts, targetKm, maxChunks) {
  targetKm = targetKm || 15; maxChunks = maxChunks || 6;
  if (pts.length < 2) return [pts];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  const n = Math.max(1, Math.min(maxChunks, Math.round(total / (targetKm * 1000))));
  if (n === 1) return [pts];
  const per = total / n, chunks = [];
  let cur = [pts[0]], acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    cur.push(pts[i]);
    if (acc >= per && chunks.length < n - 1) { chunks.push(cur); cur = [pts[i]]; acc = 0; }   // Randpunkt doppelt: Straßen am Schnitt gehen nicht verloren
  }
  if (cur.length > 1) chunks.push(cur); else if (chunks.length) chunks[chunks.length - 1].push(...cur.slice(1));
  return chunks;
}

const limitsSleep = ms => new Promise(r => setTimeout(r, ms));

/* Alle Abschnitte nacheinander; onStatus(text, frac), onPartial({ways, done, total}) nach jedem Abschnitt */
async function fetchLimitWays(tr, onStatus, onPartial) {
  const pts = limitsThinTrack(tr);
  if (pts.length < 2) throw new Error('Zu wenige Positionen für eine Abfrage');
  const chunks = limitsChunks(pts);
  const byId = new Map();
  let osmDate = null;
  for (let c = 0; c < chunks.length; c++) {
    const label = chunks.length > 1 ? 'Abschnitt ' + (c + 1) + ' von ' + chunks.length + ': ' : '';
    const frac = chunks.length > 1 ? c / chunks.length : null;
    const part = await fetchOverpassChunk(chunks[c], (text) => { if (onStatus) onStatus(label + text, frac); });
    part.ways.forEach(w => byId.set(w.id, w));
    osmDate = part.osmDate || osmDate;
    if (onPartial) onPartial({ ways: Array.from(byId.values()), done: c + 1, total: chunks.length });
    if (c < chunks.length - 1) await limitsSleep(700);          // den Server nicht hetzen
  }
  return { ways: Array.from(byId.values()), fetchedAt: Date.now(), osmDate, points: pts.length, chunks: chunks.length };
}

async function fetchOverpassChunk(pts, onStatus) {
  const q = limitsOverpassQuery(pts, 25);
  let lastErr = null;
  const sleep = limitsSleep;
  /* Zwei Server, zwei Runden: die öffentlichen Overpass-Server drosseln (429) und
     brechen unter Last ab (504); eine kurze Pause und der andere Server helfen meist. */
  const attempts = LIMIT_ENDPOINTS.concat(LIMIT_ENDPOINTS);
  for (let k = 0; k < attempts.length; k++) {
    const url = attempts[k];
    try {
      if (k === LIMIT_ENDPOINTS.length) {
        if (onStatus) onStatus('Beide Server waren ausgelastet – zweiter Versuch in 8 s …');
        await sleep(8000);
      }
      if (onStatus) onStatus('Frage ' + new URL(url).host + ' entlang ' + pts.length + ' Streckenpunkten – Antwort je nach Auslastung in 5 bis 60 s …');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 95000);
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
      clearTimeout(timer);
      if (r.status === 429) throw new Error(new URL(url).host + ' drosselt gerade (429 Too Many Requests)');
      if (r.status === 504 || r.status === 503) throw new Error(new URL(url).host + ' ist überlastet (' + r.status + ')');
      if (!r.ok) throw new Error('HTTP ' + r.status + ' von ' + new URL(url).host);
      /* Antwort stückweise lesen, damit der Fortschritt sichtbar wird (Gesamtgröße ist unbekannt) */
      let j;
      if (r.body && r.body.getReader) {
        const reader = r.body.getReader(); const chunks = []; let got = 0;
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          chunks.push(value); got += value.length;
          if (onStatus) onStatus('Antwort wird geladen: ' + fmt(got / 1024, 0) + ' KB …');
        }
        const all = new Uint8Array(got); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
        j = JSON.parse(new TextDecoder().decode(all));
      } else j = await r.json();
      const ways = (j.elements || []).filter(e => e.type === 'way' && e.geometry && e.geometry.length > 1 && e.tags)
        .map(e => ({ id: e.id, tags: e.tags, geom: e.geometry.map(g => [g.lat, g.lon]) }));
      return { ways, osmDate: (j.osm3s && j.osm3s.timestamp_osm_base) || null };
    } catch (e) { lastErr = e; if (onStatus) onStatus(((e && e.message) || 'Fehler') + ' – nächster Versuch …'); await sleep(1500); }
  }
  throw lastErr || new Error('Overpass nicht erreichbar');
}

/* ---------- Zwischenspeicher (IndexedDB, je Fahrt) ---------- */
const LIMITS_DB = 'obdstudio-limits', LIMITS_STORE = 'ways';
const limitsMem = new Map();
function limitsDb() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(LIMITS_DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(LIMITS_STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}
async function limitsCacheGet(id) {
  if (limitsMem.has(id)) return limitsMem.get(id);
  const db = await limitsDb(); if (!db) return null;
  return new Promise(resolve => {
    try {
      const rq = db.transaction(LIMITS_STORE).objectStore(LIMITS_STORE).get(id);
      rq.onsuccess = () => resolve(rq.result ? rq.result.data : null);
      rq.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}
async function limitsCachePut(id, data) {
  limitsMem.set(id, data);
  const db = await limitsDb(); if (!db) return;
  try { db.transaction(LIMITS_STORE, 'readwrite').objectStore(LIMITS_STORE).put({ id, data }); } catch (e) { /* voll oder gesperrt – dann eben nur im Speicher */ }
}

/* ---------- maxspeed-Werte lesen ---------- */
/* Rückgabe: { kmh, kind } – kind: 'sign' | 'urban' | 'rural' | 'none' | 'unknown' | null (Herkunft offen) */
function parseMaxspeedValue(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === 'none' || s === 'unlimited') return { kmh: Infinity, kind: 'none' };
  if (s === 'walk') return { kmh: 7, kind: 'sign' };
  if (s === 'signals' || s === 'variable' || s === 'default' || s === 'implicit') return { kmh: null, kind: 'unknown' };
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(mph|knots|km\/h|kmh)?$/);
  if (m) {
    const f = m[2] === 'mph' ? 1.609344 : m[2] === 'knots' ? 1.852 : 1;
    return { kmh: Math.round(parseFloat(m[1]) * f), kind: null };
  }
  m = s.match(/^([a-z]{2}):(.+)$/);
  if (m) {
    const tbl = IMPLICIT_LIMITS[m[1]] || IMPLICIT_LIMITS.de, key = m[2];
    const z = key.match(/^zone:?(\d+)$/);
    if (z) return { kmh: +z[1], kind: 'sign' };
    if (key === 'zone') return { kmh: 30, kind: 'sign' };
    if (key === 'urban' || key === 'living_street' || key === 'bicycle_road')
      return { kmh: tbl[key] !== undefined ? tbl[key] : 50, kind: key === 'urban' ? 'urban' : 'sign' };
    if (key === 'rural' || key === 'trunk') return { kmh: tbl[key] !== undefined ? tbl[key] : 100, kind: 'rural' };
    if (key === 'motorway') return tbl.motorway === Infinity ? { kmh: Infinity, kind: 'none' } : { kmh: tbl.motorway, kind: 'rural' };
    return { kmh: null, kind: 'unknown' };
  }
  return { kmh: null, kind: 'unknown' };
}

/* Herkunft aus maxspeed:type / source:maxspeed / zone:maxspeed ableiten */
function kindFromType(type) {
  const t = String(type || '').toLowerCase();
  if (!t) return null;
  if (/sign|zone|implicit_zone/.test(t)) return 'sign';
  if (/urban|living/.test(t)) return 'urban';
  if (/rural|trunk/.test(t)) return 'rural';
  if (/motorway/.test(t)) return 'none';
  return null;
}

/* Bedingte Limits: "30 @ (Mo-Fr 07:00-17:00); 50 @ (22:00-06:00)" */
const LIMIT_DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
function parseConditional(str) {
  if (!str) return [];
  const out = [];
  String(str).split(/;(?![^()]*\))/).forEach(part => {
    const m = part.match(/^\s*([^@]+?)\s*@\s*\(?\s*(.*?)\s*\)?\s*$/);
    if (!m) return;
    const val = parseMaxspeedValue(m[1]);
    if (!val || val.kmh === null) return;
    out.push({ kmh: val.kmh, cond: parseCondition(m[2]), raw: part.trim() });
  });
  return out;
}
function parseCondition(c) {
  const cond = { days: null, times: [], other: false, holiday: false, raw: c };
  let s = String(c || '').toLowerCase().trim();
  if (!s) return cond;
  /* Uhrzeiten */
  s = s.replace(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g, (_, h1, m1, h2, m2) => {
    cond.times.push([+h1 * 60 + +m1, +h2 * 60 + +m2]); return ' ';
  });
  /* Wochentage: "mo-fr", "sa,su", "mo,we-fr" */
  const dayTokens = s.match(/\b(mo|tu|we|th|fr|sa|su)(?:\s*-\s*(mo|tu|we|th|fr|sa|su))?\b/g);
  if (dayTokens) {
    cond.days = new Set();
    dayTokens.forEach(tok => {
      const mm = tok.match(/(mo|tu|we|th|fr|sa|su)(?:\s*-\s*(mo|tu|we|th|fr|sa|su))?/);
      const a = LIMIT_DAYS.indexOf(mm[1]), b = mm[2] ? LIMIT_DAYS.indexOf(mm[2]) : a;
      for (let d = a; ; d = (d + 1) % 7) { cond.days.add(d); if (d === b) break; }
    });
    s = s.replace(/\b(mo|tu|we|th|fr|sa|su)(?:\s*-\s*(mo|tu|we|th|fr|sa|su))?\b/g, ' ');
  }
  if (/\bph\b|\bsh\b/.test(s)) { cond.holiday = true; s = s.replace(/\b(ph|sh)\b/g, ' '); }
  /* Rest: wet, snow, fog, Gewichte, "sunrise-sunset" … → nicht entscheidbar */
  if (/[a-z]/.test(s.replace(/[,;\s]/g, ''))) cond.other = true;
  return cond;
}
/* true / false / null (nicht entscheidbar). when = { date, dayKnown, timeKnown } */
function condApplies(cond, when) {
  if (!cond) return true;
  if (cond.other) return null;
  if (cond.holiday) return null;                  // Feiertage kennen wir nicht
  if (!when || !when.date) return (cond.days || cond.times.length) ? null : true;
  if (cond.days) {
    if (!when.dayKnown) return null;
    const dow = (when.date.getDay() + 6) % 7;      // JS: So=0 → Mo=0
    if (!cond.days.has(dow)) return false;
  }
  if (cond.times.length) {
    if (!when.timeKnown) return null;
    const mins = when.date.getHours() * 60 + when.date.getMinutes();
    const hit = cond.times.some(([a, b]) => a <= b ? (mins >= a && mins < b) : (mins >= a || mins < b));
    if (!hit) return false;
  }
  return true;
}

/* Limit eines Weges in Fahrtrichtung. forward: true/false/null */
function wayLimit(tags, forward) {
  tags = tags || {};
  let raw = tags.maxspeed;
  if (forward === true && tags['maxspeed:forward']) raw = tags['maxspeed:forward'];
  if (forward === false && tags['maxspeed:backward']) raw = tags['maxspeed:backward'];
  const type = tags['maxspeed:type'] || tags['source:maxspeed'] || tags['zone:maxspeed'] || tags['zone:traffic'] || '';
  let res = parseMaxspeedValue(raw);
  let heuristic = false;
  if (res && res.kind === null) {
    const k = kindFromType(type);
    if (k) res.kind = k;
    else if (/^[a-z]{2}:/.test(String(type).toLowerCase())) {            // z. B. maxspeed=100 + maxspeed:type=DE:rural
      const t = parseMaxspeedValue(type); if (t && t.kind && t.kind !== 'unknown') res.kind = t.kind;
    }
    if (res.kind === null) {
      /* Ohne Herkunft: 100 ist in Deutschland fast immer das implizite Außerorts-Limit,
         50 die Ortstafel, alles andere steht auf einem Schild. */
      res.kind = res.kmh === 100 ? 'rural' : res.kmh === 50 ? 'urban' : 'sign';
      heuristic = true;
    }
  }
  if (!res || res.kmh === null) {
    const t = parseMaxspeedValue(type);
    if (t && t.kmh !== null && t.kind !== 'unknown') res = t;
    else if (res && res.kind === 'unknown') { /* signals/variable */ }
    else {
      const hw = tags.highway;
      if (hw === 'living_street') res = { kmh: 7, kind: 'sign' };
      else if (hw === 'motorway') res = { kmh: Infinity, kind: 'none' };
      else res = null;
    }
  }
  let condRaw = tags['maxspeed:conditional'];
  if (forward === true && tags['maxspeed:forward:conditional']) condRaw = tags['maxspeed:forward:conditional'];
  if (forward === false && tags['maxspeed:backward:conditional']) condRaw = tags['maxspeed:backward:conditional'];
  return { kmh: res ? res.kmh : null, kind: res ? res.kind : null, heuristic, conditional: parseConditional(condRaw),
           name: tags.name || tags.ref || null, highway: tags.highway || null };
}

/* Wirksames Limit zum Zeitpunkt when → { kmh, kind, sure, alt } ; alt = Werte nicht entscheidbarer Bedingungen */
function effectiveLimit(lim, when) {
  if (!lim) return null;
  const alt = [];
  for (const c of lim.conditional) {
    const a = condApplies(c.cond, when);
    if (a === true) return { kmh: c.kmh, kind: 'sign', sure: true, alt: [], conditional: c.raw };
    if (a === null) alt.push(c.kmh);
  }
  return { kmh: lim.kmh, kind: lim.kind, sure: alt.length === 0, alt, conditional: null };
}

/* Bewertung eines Punktes */
function limitVerdict(speedKmh, eff) {
  if (!eff || eff.kmh === null || eff.kind === 'unknown') return { cat: 'unsure', excess: NaN };
  if (!(speedKmh === speedKmh)) return { cat: 'unsure', excess: NaN };
  const v = Math.round(speedKmh);
  if (eff.kmh === Infinity && eff.sure) return { cat: 'ok', excess: NaN };
  const overKind = k => (k === 'rural' ? 'implicit' : 'sign');
  if (!eff.sure) {
    const all = [eff.kmh].concat(eff.alt);
    const lo = Math.min(...all), hi = Math.max(...all);
    if (v <= lo) return { cat: 'ok', excess: NaN };
    if (v > hi) return { cat: overKind(eff.kind), excess: v - hi };
    return { cat: 'unsure', excess: v - lo };
  }
  if (v > eff.kmh) return { cat: overKind(eff.kind), excess: v - eff.kmh };
  return { cat: 'ok', excess: NaN };
}

/* ---------- Route den Straßen zuordnen ---------- */
function limitsBuildIndex(ways) {
  const CELL = 0.002;
  const cells = new Map();
  const segs = [];
  const key = (la, lo) => Math.floor(la / CELL) + ':' + Math.floor(lo / CELL);
  const add = (k, si) => { let a = cells.get(k); if (!a) { a = []; cells.set(k, a); } a.push(si); };
  ways.forEach((w, wi) => {
    const g = w.geom;
    for (let i = 1; i < g.length; i++) {
      const si = segs.length;
      segs.push({ wi, la1: g[i - 1][0], lo1: g[i - 1][1], la2: g[i][0], lo2: g[i][1] });
      /* alle Zellen entlang des Segments */
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(g[i][0] - g[i - 1][0]), Math.abs(g[i][1] - g[i - 1][1])) / CELL));
      const seen = new Set();
      for (let s = 0; s <= steps; s++) {
        const f = s / steps, k = key(g[i - 1][0] + (g[i][0] - g[i - 1][0]) * f, g[i - 1][1] + (g[i][1] - g[i - 1][1]) * f);
        if (!seen.has(k)) { seen.add(k); add(k, si); }
      }
    }
  });
  return { cells, segs, CELL, key };
}

function limitsNearest(index, lat, lon, bearing, maxM) {
  const cosLat = Math.cos(lat * Math.PI / 180);
  const mx = 111320 * cosLat, my = 110540;
  const cx = Math.floor(lat / index.CELL), cy = Math.floor(lon / index.CELL);
  let best = null, bestScore = Infinity;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const a = index.cells.get((cx + dx) + ':' + (cy + dy)); if (!a) continue;
    for (const si of a) {
      const s = index.segs[si];
      const x1 = (s.lo1 - lon) * mx, y1 = (s.la1 - lat) * my, x2 = (s.lo2 - lon) * mx, y2 = (s.la2 - lat) * my;
      const vx = x2 - x1, vy = y2 - y1, len2 = vx * vx + vy * vy;
      let t = len2 > 0 ? -(x1 * vx + y1 * vy) / len2 : 0; t = Math.max(0, Math.min(1, t));
      const px = x1 + vx * t, py = y1 + vy * t;
      const d = Math.sqrt(px * px + py * py);
      if (d > maxM) continue;
      let score = d, forward = null;
      /* Am Ende eines Segments (Knoten) ist das folgende Segment gleich nah: das in
         Fahrtrichtung weiterführende bekommt den Vorzug. */
      if (bearing === bearing && len2 > 0) {
        const segB = (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360;   // vx = Ost, vy = Nord
        let diff = Math.abs(((bearing - segB) % 360 + 540) % 360 - 180); // 0 … 180
        forward = diff < 90;
        const dev = Math.min(diff, 180 - diff);                            // Abweichung von der Straßenachse
        if (dev > 60) score += 20; else score += dev * 0.1;
        if ((forward && t >= 1) || (!forward && t <= 0)) score += 2.5;     // Segment liegt hinter uns
      }
      if (score < bestScore) { bestScore = score; best = { wi: s.wi, d, forward }; }
    }
  }
  return best;
}

function limitsBearing(tr, i) {
  const a = Math.max(0, i - 2), b = Math.min(tr.n - 1, i + 2);
  if (b <= a) return NaN;
  const dLat = tr.lat[b] - tr.lat[a], dLon = (tr.lon[b] - tr.lon[a]) * Math.cos(tr.lat[i] * Math.PI / 180);
  if (Math.abs(dLat) < 1e-6 && Math.abs(dLon) < 1e-6) return NaN;
  return (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
}

/* Aufzeichnungszeitpunkt eines Trackpunkts als Datum – so gut die Datei es hergibt */
function limitsWhenFor(ds, fileName) {
  const meta = ds.meta || {};
  if (meta.epochBased) return t => ({ date: new Date(t * 1000), dayKnown: true, timeKnown: true });
  const base = typeof dateFromFileName === 'function' ? dateFromFileName(fileName) : null;
  if (base === null || base === undefined) return () => ({ date: null, dayKnown: false, timeKnown: false });
  const hasClock = /\d{4}-\d{2}-\d{2}[ _T]?\d{2}[-:.]?\d{2}/.test(String(fileName || ''));
  if (meta.timeFormat === 'daysec') {
    const d0 = new Date(base); d0.setHours(0, 0, 0, 0);
    return t => ({ date: new Date(d0.getTime() + t * 1000), dayKnown: true, timeKnown: true });
  }
  return t => ({ date: new Date(base + (t - ds.t0) * 1000), dayKnown: true, timeKnown: hasClock });
}

/* Hauptfunktion: tr = ds.track, speedAt(i) = km/h am Trackpunkt, whenAt(t) → when */
function matchTrackLimits(tr, ways, speedAt, whenAt, opts) {
  opts = opts || {};
  const maxM = opts.maxM || 30;
  const index = limitsBuildIndex(ways);
  const lims = ways.map(w => ({ fwd: wayLimit(w.tags, true), bwd: wayLimit(w.tags, false), both: wayLimit(w.tags, null) }));
  const n = tr.n;
  const cat = new Uint8Array(n), lim = new Float32Array(n).fill(NaN), excess = new Float32Array(n).fill(NaN),
        way = new Int32Array(n).fill(-1), kindArr = new Array(n).fill(null), spd = new Float32Array(n).fill(NaN);
  const gapSet = new Set((tr.gaps || []).map(g => g.i));
  const dist = { noroad: 0, ok: 0, implicit: 0, sign: 0, unsure: 0 }, time = { noroad: 0, ok: 0, implicit: 0, sign: 0, unsure: 0 };
  const hasSpeed = { moving: 0 };
  for (let i = 0; i < n; i++) {
    const v = speedAt(i); spd[i] = v;
    const bearing = v > 5 ? limitsBearing(tr, i) : NaN;
    const hit = limitsNearest(index, tr.lat[i], tr.lon[i], bearing, maxM);
    let c = 'noroad';
    if (hit) {
      way[i] = hit.wi;
      const L = hit.forward === null ? lims[hit.wi].both : hit.forward ? lims[hit.wi].fwd : lims[hit.wi].bwd;
      const eff = effectiveLimit(L, whenAt ? whenAt(tr.t[i]) : null);
      if (eff) { lim[i] = eff.kmh === Infinity ? Infinity : (eff.kmh === null ? NaN : eff.kmh); kindArr[i] = eff.kind; }
      const vd = limitVerdict(v, eff);
      c = vd.cat; excess[i] = vd.excess;
      if (!(v === v) && c === 'unsure') c = 'noroad' === c ? c : 'unsure';
    }
    cat[i] = LIMIT_CAT[c];
    if (i > 0 && !gapSet.has(i)) {
      const dd = tr.dist[i] - tr.dist[i - 1], dt = tr.t[i] - tr.t[i - 1];
      if (dd > 0 && dt >= 0 && dt < 60) { dist[c] += dd; time[c] += dt; }
      if (v > 3) hasSpeed.moving += dd;
    }
  }
  /* Verstoß-Abschnitte: zusammenhängende Punkte über dem Limit, kleine Lücken überbrückt */
  const segments = [];
  let cur = null;
  const flush = () => { if (cur && cur.n >= 2) segments.push(cur); cur = null; };
  for (let i = 0; i < n; i++) {
    const over = cat[i] === LIMIT_CAT.sign || cat[i] === LIMIT_CAT.implicit;
    if (over) {
      const sameLim = cur && cur.limit === lim[i] && cur.cat === LIMIT_CAT_NAME[cat[i]] && i - cur.i1 <= 3 && !gapSet.has(i);
      if (!sameLim) { flush(); cur = { i0: i, i1: i, n: 0, t0: tr.t[i], t1: tr.t[i], limit: lim[i], kind: kindArr[i], cat: LIMIT_CAT_NAME[cat[i]],
        vMax: -Infinity, exMax: 0, dist: 0, lat: tr.lat[i], lon: tr.lon[i], way: way[i], name: null }; }
      cur.i1 = i; cur.t1 = tr.t[i]; cur.n++;
      if (i > cur.i0 && !gapSet.has(i)) cur.dist += Math.max(0, tr.dist[i] - tr.dist[i - 1]);
      if (spd[i] > cur.vMax) { cur.vMax = spd[i]; cur.exMax = excess[i]; cur.lat = tr.lat[i]; cur.lon = tr.lon[i]; }
    } else if (cur && i - cur.i1 > 3) flush();
  }
  flush();
  segments.forEach(s => { const w = ways[s.way]; s.name = w ? (w.tags.name || w.tags.ref || null) : null; s.highway = w ? w.tags.highway : null; });
  segments.sort((a, b) => b.exMax - a.exMax);
  const total = dist.ok + dist.implicit + dist.sign + dist.unsure + dist.noroad;
  return { cat, lim, excess, way, kind: kindArr, speed: spd, dist, time, total, segments,
           over: dist.sign + dist.implicit, waysUsed: new Set(Array.from(way).filter(x => x >= 0)).size };
}
