/* ===== Zusammenfassung teilen und Fahrten zusammenführen ===========
   Teilen: die Kernaussagen einer Auswertung, gepackt und base64-kodiert
   in der Adresse. Kein Server, keine Route, keine Rohdaten – wer den
   Link bekommt, sieht dieselbe Zusammenfassung im eigenen Browser.
   Zusammenführen: zwei CSV-Teile derselben Fahrt zu einer Datei.
   ================================================================== */

/* ---------- Teilen ---------- */
function shareSummary(ds, diag, profile, gears, fileName) {
  const T = ds.trip || {}, n = (v, d) => (isFinite(v) ? +(+v).toFixed(d === undefined ? 2 : d) : null);
  return {
    v: 1,
    d: fileName || '',
    p: profile ? profile.id : null,
    pn: profile ? profile.name : null,
    t: [n(ds.t0, 0), n(ds.duration, 0)],
    k: { dist: n(T.dist, 2), moving: n(T.movingTime, 0), vAvg: n(T.speedAvgMoving, 1), vMax: n(T.speedMax, 0),
         rpmMax: n(ds.stats && ds.stats.rpm ? ds.stats.rpm.max : NaN, 0), cons: n(T.consAvg, 2), fuel: n(T.fuelUsed, 2), co2: n(T.co2, 2),
         coolMax: n(ds.stats && ds.stats.coolant ? ds.stats.coolant.max : NaN, 0),
         stops: ds.events && ds.events.stops ? ds.events.stops.length : null },
    g: gears && gears.gears ? gears.gears.map(g => [g.label, n(g.kmhPer1000, 1)]) : [],
    f: diag && diag.results ? diag.results.filter(r => r.status === 'ok' || r.status === 'warn' || r.status === 'crit')
        .map(r => [r.id, r.status[0], n(r.value, 2), r.unit || '']) : [],
    ta: diag && diag.tally ? [diag.tally.ok || 0, diag.tally.warn || 0, diag.tally.crit || 0] : null
  };
}

/* Kompakt kodieren: JSON → gzip (wenn möglich) → base64url */
async function encodeShare(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let payload = bytes, tag = 'r';
  if (typeof CompressionStream === 'function') {
    try {
      const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
      payload = new Uint8Array(await new Response(cs).arrayBuffer()); tag = 'z';
    } catch (e) { payload = bytes; tag = 'r'; }
  }
  let bin = '';
  for (let i = 0; i < payload.length; i += 0x8000) bin += String.fromCharCode.apply(null, payload.subarray(i, i + 0x8000));
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return tag + b64;
}
async function decodeShare(str) {
  if (!str || str.length < 2) return null;
  const tag = str[0], b64 = str.slice(1).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
  let out = bytes;
  if (tag === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('Dieser Browser kann den Link nicht entpacken.');
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    out = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  const obj = JSON.parse(new TextDecoder().decode(out));
  if (!obj || obj.v !== 1) throw new Error('Unbekanntes Format in diesem Link.');
  return obj;
}
function shareUrl(code, base) {
  const b = base || (location.origin + location.pathname);
  return b + '#s=' + code;
}
function shareFromUrl() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  return h.get('s');
}

/* ---------- CSV-Teile zusammenführen ---------- */
/* Zwei Aufzeichnungen derselben Fahrt: gleiche Kopfzeile vorausgesetzt, Zeilen
   aneinanderhängen. Ist die zweite Datei zeitlich früher, wird getauscht. */
function mergeCsvParts(texts) {
  const parts = texts.map(t => String(t || '').replace(/^﻿/, '')).filter(t => t.trim());
  if (parts.length < 2) throw new Error('Zum Zusammenführen braucht es mindestens zwei Dateien.');
  const headOf = t => t.slice(0, t.indexOf('\n') < 0 ? t.length : t.indexOf('\n')).replace(/\r$/, '');
  const head = headOf(parts[0]);
  const norm = h => h.replace(/["\s]/g, '').toLowerCase();
  for (const p of parts) if (norm(headOf(p)) !== norm(head))
    throw new Error('Die Dateien haben verschiedene Spalten – sie stammen nicht aus derselben Aufzeichnungseinstellung.');
  /* erste Zeitspalte je Teil, um die Reihenfolge zu bestimmen */
  const firstTime = t => {
    const lines = t.split(/\r?\n/);
    for (let i = 1; i < Math.min(lines.length, 40); i++) {
      const cell = lines[i].split(/[;,\t]/)[0].replace(/"/g, '').trim();
      const v = parseFloat(cell.replace(',', '.'));
      if (isFinite(v)) return v;
      const d = Date.parse(cell);
      if (isFinite(d)) return d / 1000;
    }
    return NaN;
  };
  const ordered = parts.map(t => ({ t, k: firstTime(t) }))
    .sort((a, b) => (isFinite(a.k) && isFinite(b.k) ? a.k - b.k : 0));
  const body = ordered.map((p, i) => {
    const nl = p.t.indexOf('\n');
    const rest = nl < 0 ? '' : p.t.slice(nl + 1);
    return i === 0 ? p.t.replace(/\s+$/, '') : rest.replace(/\s+$/, '');
  }).filter(x => x);
  const rows = body.reduce((n, b) => n + b.split('\n').length, 0) - (body.length - 1);
  return { text: body.join('\n') + '\n', parts: parts.length, rows };
}

/* ---------- GPX ergänzen ---------- */
/* Liest <trkpt lat lon><time>; liefert Punkte für den Track, wenn die CSV kein GPS hatte. */
function parseGpx(text) {
  const pts = [];
  const re = /<trkpt[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"[^>]*>([\s\S]*?)<\/trkpt>|<trkpt[^>]*\blon="([-\d.]+)"[^>]*\blat="([-\d.]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  let m;
  while ((m = re.exec(text))) {
    const lat = parseFloat(m[1] !== undefined ? m[1] : m[5]);
    const lon = parseFloat(m[2] !== undefined ? m[2] : m[4]);
    const inner = m[3] !== undefined ? m[3] : m[6] || '';
    const tm = /<time>([^<]+)<\/time>/.exec(inner);
    const ele = /<ele>([-\d.]+)<\/ele>/.exec(inner);
    const t = tm ? Date.parse(tm[1]) / 1000 : NaN;
    if (isFinite(lat) && isFinite(lon)) pts.push({ lat, lon, t, alt: ele ? parseFloat(ele[1]) : NaN });
  }
  return pts;
}
/* GPX-Punkte als zusätzliche Zeilen im Long-Format anhängen (SECONDS;PID;VALUE;UNITS;LATITUDE;LONGTITUDE) */
function gpxToLongRows(pts, t0) {
  const rows = [];
  for (const p of pts) {
    const t = isFinite(p.t) ? (isFinite(t0) ? p.t - t0 : p.t) : NaN;
    if (!isFinite(t)) continue;
    rows.push('"' + t.toFixed(2) + '";"Altitude (GPS)";"' + (isFinite(p.alt) ? p.alt.toFixed(1) : '0') + '";"m";"' + p.lat.toFixed(7) + '";"' + p.lon.toFixed(7) + '";');
  }
  return rows;
}
