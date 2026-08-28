/* ============================================================
   CSV-Parser — robust, formatunabhängig, streaming-fähig
   Unterstützt:
     • Long-Format  (SECONDS;PID;VALUE;UNITS;LAT;LON)  — Car Scanner / OBD Auto Doctor
     • Wide-Format  (Zeit,Metrik1,Metrik2,…)           — Torque Pro / OBDLink / Dragy
   Erkennt automatisch: Trennzeichen, Dezimalzeichen, BOM, CRLF, Anführungszeichen,
   Spaltenrollen, Zeitformat, Einheiten in Spaltennamen.
   ============================================================ */

const COL_ROLES = [
  ['time',  /^(seconds?|sec|secs|time|timestamp|zeit|zeitstempel|elapsed|elapsed[ _-]?time|device[ _-]?time|gps[ _-]?time|datetime|date[ _-]?time|logtime|t)$/i],
  ['pid',   /^(pid|name|parameter|parametername|sensor|sensorname|signal|kanal|channel|item|metric|messwert(name)?)$/i],
  ['value', /^(value|wert|val|reading|messwert|data)$/i],
  ['unit',  /^(units?|einheit|uom|dimension)$/i],
  ['lat',   /^(lat|latitude|latitud|breite|breitengrad|gps[ _-]?lat(itude)?)$/i],
  ['lon',   /^(lon|lng|long|longitude|longtitude|longitud|laenge|länge|laengengrad|längengrad|gps[ _-]?lon(gitude)?)$/i],
  ['alt',   /^(alt|altitude|höhe|hoehe|elevation|gps[ _-]?alt(itude)?)$/i]
];

const NON_METRIC_COLS = /^(seconds?|sec|time|timestamp|zeit|datetime|device[ _-]?time|gps[ _-]?time|elapsed.*|lat(itude)?|lon(gitude)?|longtitude|lng|breite|länge|laenge|trip|session|id|index|nr|#)$/i;

function stripBOM(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

function detectDelimiter(sample) {
  const cands = [';', ',', '\t', '|'];
  const lines = sample.split(/\r?\n/).filter(l => l.trim().length).slice(0, 25);
  let best = ',', bestScore = -1;
  for (const d of cands) {
    const counts = lines.map(l => countOutsideQuotes(l, d));
    const nonZero = counts.filter(c => c > 0);
    if (nonZero.length < Math.min(2, lines.length)) continue;
    const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
    const varc = nonZero.reduce((a, b) => a + (b - avg) ** 2, 0) / nonZero.length;
    const score = avg * 10 - varc * 5 + (nonZero.length / lines.length) * 5;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}
function countOutsideQuotes(line, d) {
  let n = 0, q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (!q && c === d) n++;
  }
  return n;
}

/* Zerlegt eine Zeile in Felder (RFC-4180-tolerant), schreibt in `out` und liefert die Anzahl. */
function splitLine(line, d, out) {
  let n = 0, i = 0, len = line.length;
  while (i <= len) {
    let field;
    if (line.charCodeAt(i) === 34 /* " */) {
      let j = i + 1, buf = '', start = j;
      for (;;) {
        const k = line.indexOf('"', j);
        if (k < 0) { buf += line.slice(start); j = len; break; }
        if (line.charCodeAt(k + 1) === 34) { buf += line.slice(start, k + 1); j = k + 2; start = j; }
        else { buf += line.slice(start, k); j = k + 1; break; }
      }
      field = buf;
      i = line.indexOf(d, j); if (i < 0) i = len;
      i++;
    } else {
      let k = line.indexOf(d, i);
      if (k < 0) { field = line.slice(i); i = len + 1; }
      else { field = line.slice(i, k); i = k + 1; }
    }
    out[n++] = field;
    if (i > len) break;
  }
  return n;
}

/* Extrahiert Einheit aus Spaltennamen: "Speed (km/h)" -> {name:"Speed", unit:"km/h"} */
function splitUnitFromName(name) {
  const m = name.match(/^(.*?)[\s_]*[\(\[]\s*([^\)\]]{1,14})\s*[\)\]]\s*$/);
  if (m && !/^\d+$/.test(m[2])) return { name: m[1].trim(), unit: m[2].trim() };
  return { name: name.trim(), unit: '' };
}

function detectDecimalComma(samples) {
  let comma = 0, dot = 0;
  for (const s of samples) {
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) return true;
    if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) return false;
    if (/^-?\d+,\d+$/.test(s)) comma++;
    else if (/^-?\d+\.\d+$/.test(s)) dot++;
  }
  return comma > dot * 2 && comma > 3;
}

function makeNumParser(decimalComma) {
  const fin = v => (v === v && v > -Infinity && v < Infinity) ? v : NaN;
  if (!decimalComma) {
    return function (s) {
      if (!s) return NaN;
      const v = +s;
      if (v === v) return fin(v);                  // schnellster Pfad
      // Ein einzelnes Komma ist auch im Punkt-Modus ein Dezimalkomma. Es einfach zu
      // entfernen macht aus 14,7 die Zahl 147 – ein stiller Faktor 10 quer durch die Datei.
      if (/^\s*-?\d+,\d+\s*$/.test(s)) return fin(+s.trim().replace(',', '.'));
      const m = s.replace(/[^\d.eE+-]/g, '');
      return m ? fin(+m) : NaN;
    };
  }
  return function (s) {
    if (!s) return NaN;
    const t = s.replace(/\./g, '').replace(',', '.');
    const v = +t;
    if (v === v) return fin(v);
    const m = t.replace(/[^\d.eE+-]/g, '');
    return m ? fin(+m) : NaN;
  };
}

/* Zeit -> Sekunden (float). Erkennt Epoch(ms/s), Sekunden seit Mitternacht,
   hh:mm:ss[.ms], ISO-8601, dd.mm.yyyy hh:mm:ss                                */
function makeTimeParser(samples, num) {
  const s0 = (samples.find(s => s && s.trim()) || '').trim();
  // Zeitstempel tragen praktisch immer einen Punkt als Dezimaltrenner, auch in Dateien
  // mit Dezimalkomma bei den Messwerten. Enthält die Probe keine Kommas, punktweise lesen.
  const anyComma = samples.some(x => typeof x === 'string' && x.indexOf(',') >= 0);
  if (!anyComma) num = makeNumParser(false);
  const asNum = num(s0);

  if (asNum === asNum && !/[:T\/]/.test(s0)) {
    if (asNum > 1e12) return { kind: 'epoch_ms', parse: s => num(s) / 1000, epoch: true };
    if (asNum > 1e9)  return { kind: 'epoch_s',  parse: s => num(s),        epoch: true };
    return { kind: asNum >= 0 && asNum < 86400 * 1.2 ? 'daysec' : 'relative', parse: num, epoch: false,
             wrap: asNum >= 0 && asNum < 86400 * 1.2 };
  }
  if (/^\d{1,2}:\d{2}(:\d{2})?([.,]\d+)?$/.test(s0)) {
    return { kind: 'clock', epoch: false, wrap: true, parse: s => {
      const p = String(s).trim().split(':');
      if (p.length < 2) return NaN;
      return (+p[0]) * 3600 + (+p[1]) * 60 + (p[2] ? +String(p[2]).replace(',', '.') : 0);
    } };
  }
  return { kind: 'date', epoch: true, parse: s => {
    s = String(s).trim();
    // Erst das deutsche Format prüfen: Date.parse liest "03.04.2026" bei Tag <= 12
    // als 4. März, bei Tag > 12 greift der Fallback – in einer Datei zwei Kalender.
    const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2})([.,]\d+)?)?/);
    if (de) {
      let y = +de[3]; if (y < 100) y += 2000;
      return Date.UTC(y, +de[2] - 1, +de[1], +de[4], +de[5], +(de[6] || 0)) / 1000 +
             (de[7] ? +de[7].replace(',', '.') : 0);
    }
    let d = Date.parse(s);
    if (d === d) return d / 1000;
    const m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2})([.,]\d+)?)?/);
    if (m) {
      let y = +m[3]; if (y < 100) y += 2000;
      return Date.UTC(y, +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)) / 1000 +
             (m[7] ? +m[7].replace(',', '.') : 0);
    }
    return NaN;
  } };
}

/* ---------------------------------------------------------- */

async function parseCSV(text, onProgress) {
  text = stripBOM(text);
  const head = text.slice(0, 64 * 1024);
  const delim = detectDelimiter(head);

  // --- Header ---
  let nl = text.indexOf('\n');
  if (nl < 0) nl = text.length;
  let headerLine = text.slice(0, nl).replace(/\r$/, '');
  const fields = [];
  let nCols = splitLine(headerLine, delim, fields);
  while (nCols > 1 && !String(fields[nCols - 1]).trim()) nCols--;   // trailing delimiter
  const rawCols = fields.slice(0, nCols).map(s => String(s).trim());

  // --- Spaltenrollen ---
  const role = new Array(nCols).fill(null);
  const colInfo = rawCols.map(splitUnitFromName);
  for (let i = 0; i < nCols; i++) {
    const key = colInfo[i].name.replace(/\s+/g, ' ').trim();
    for (const [r, re] of COL_ROLES) {
      if (re.test(key)) { if (role.indexOf(r) < 0) role[i] = r; break; }
    }
  }
  const idx = {};
  role.forEach((r, i) => { if (r && idx[r] === undefined) idx[r] = i; });
  if (idx.time === undefined) idx.time = 0;                          // Fallback: erste Spalte

  const isLong = idx.pid !== undefined && idx.value !== undefined;

  // --- Samples für Dezimal-/Zeitformat ---
  const probe = [];
  const timeProbe = [];
  {
    let p = nl + 1, lines = 0;
    while (p < text.length && lines < 400) {
      let e = text.indexOf('\n', p); if (e < 0) e = text.length;
      const ln = text.slice(p, e).replace(/\r$/, '');
      if (ln.trim()) {
        const f = []; const n = splitLine(ln, delim, f);
        if (isLong) { if (f[idx.value] !== undefined) probe.push(String(f[idx.value]).trim()); }
        else for (let i = 0; i < n; i++) if (i !== idx.time) probe.push(String(f[i]).trim());
        if (f[idx.time] !== undefined) timeProbe.push(String(f[idx.time]).trim());
        lines++;
      }
      p = e + 1;
    }
  }
  const decimalComma = detectDecimalComma(probe);
  const num = makeNumParser(decimalComma);
  const timeFmt = makeTimeParser(timeProbe, num);

  // --- Zielstrukturen ---
  const series = new Map();          // name -> {t:[], v:[], unit}
  /* GPS wird PRO QUELL-PID gesammelt: im Long-Format tragen Zeilen unterschiedlicher
     PIDs teils unterschiedlich alte Fixes, was beim Mischen zu Positions-Ping-Pong führt.
     Wir wählen später die Quelle mit den meisten eigenständigen Punkten. */
  const gpsBySrc = new Map();
  let rows = 0, skipped = 0;
  let tMin = Infinity, tMax = -Infinity;

  const getSeries = (name, unit) => {
    let s = series.get(name);
    if (!s) { s = { name, unit: unit || '', t: [], v: [] }; series.set(name, s); }
    // Zwei Spalten "Speed (km/h)" und "Speed (mph)" tragen denselben Basisnamen. Ohne
    // Trennung entstuende eine einzige Serie, die zwischen beiden Einheiten hin- und herspringt.
    else if (!s.unit && unit) s.unit = unit;
    else if (unit && s.unit && s.unit !== unit) {
      const key = name + ' [' + unit + ']';
      s = series.get(key);
      if (!s) { s = { name: key, unit, t: [], v: [] }; series.set(key, s); }
    }
    return s;
  };

  // Wide-Format: Metrik-Spalten vorbereiten
  let wideCols = null;
  if (!isLong) {
    wideCols = [];
    for (let i = 0; i < nCols; i++) {
      if (i === idx.time || role[i]) continue;
      const ci = colInfo[i];
      if (!ci.name || NON_METRIC_COLS.test(ci.name)) continue;
      wideCols.push({ i, name: ci.name, unit: ci.unit });
    }
  }

  // --- Hauptschleife (chunked, damit die UI atmet) ---
  const total = text.length;
  let pos = nl + 1;
  const f = new Array(64);
  let prevN = 0;
  /* Sekunden seit Mitternacht und Uhrzeiten springen um 0 Uhr auf null zurück. Ohne
     Entfaltung sortiert die Nachbearbeitung die Zeit nach Mitternacht VOR die davor und
     macht aus einer Zehn-Minuten-Fahrt eine von 24 Stunden. */
  let tPrev = NaN, tOff = 0;
  let chunkStart = pos, lastYield = performance.now();

  while (pos < total) {
    let end = text.indexOf('\n', pos);
    const last = end < 0;
    if (last) end = total;
    const lineEnd = (end > pos && text.charCodeAt(end - 1) === 13) ? end - 1 : end;

    if (lineEnd > pos) {
      const line = text.slice(pos, lineEnd);
      const n = splitLine(line, delim, f);
      // splitLine beschreibt nur die ersten n Felder. Ohne Leeren traegt eine kurze Zeile
      // die Werte der Vorzeile weiter und erfindet Messwerte und GPS-Punkte.
      for (let c = n; c < prevN; c++) f[c] = undefined;
      prevN = n;
      let t = timeFmt.parse(f[idx.time]);
      if (t === t && timeFmt.wrap) {
        if (tPrev === tPrev && t + tOff < tPrev - 43200) tOff += 86400;
        t += tOff;
        if (!(tPrev === tPrev) || t > tPrev) tPrev = t;
      }
      if (t === t) {
        if (t < tMin) tMin = t;
        if (t > tMax) tMax = t;
        if (isLong) {
          const rawName = String(f[idx.pid] || '').trim();
          if (rawName) {
            const v = num(String(f[idx.value]).trim());
            if (v === v) {
              const s = getSeries(rawName, idx.unit !== undefined ? String(f[idx.unit] || '').trim() : '');
              s.t.push(t); s.v.push(v);
            } else skipped++;
          }
        } else {
          for (let c = 0; c < wideCols.length; c++) {
            const wc = wideCols[c];
            const raw = f[wc.i];
            if (raw === undefined || raw === '') continue;
            const v = num(String(raw).trim());
            if (v === v) { const s = getSeries(wc.name, wc.unit); s.t.push(t); s.v.push(v); }
          }
        }
        // GPS (pro Quelle getrennt)
        if (idx.lat !== undefined && idx.lon !== undefined) {
          const la = num(String(f[idx.lat] || '').trim()), lo = num(String(f[idx.lon] || '').trim());
          if (la === la && lo === lo && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0)) {
            const src = isLong ? String(f[idx.pid] || '').trim() : '\u0000row';
            let G = gpsBySrc.get(src);
            if (!G) { G = { t: [], lat: [], lon: [], alt: [], _la: NaN, _lo: NaN }; gpsBySrc.set(src, G); }
            if (la !== G._la || lo !== G._lo) {
              G.t.push(t); G.lat.push(la); G.lon.push(lo);
              if (idx.alt !== undefined) G.alt.push(num(String(f[idx.alt] || '').trim()));
              G._la = la; G._lo = lo;
            }
          }
        }
        rows++;
      } else skipped++;
    }

    pos = end + 1;
    if (last) break;

    if (pos - chunkStart > 4 * 1024 * 1024) {
      chunkStart = pos;
      const now = performance.now();
      if (now - lastYield > 40) {
        lastYield = now;
        if (onProgress) onProgress(pos / total, rows);
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }
  if (onProgress) onProgress(1, rows);

  // --- In typisierte Arrays gießen + sortieren falls nötig ---
  const out = new Map();
  for (const [name, s] of series) {
    const n = s.t.length;
    if (!n) continue;
    let sorted = true;
    for (let i = 1; i < n; i++) if (s.t[i] < s.t[i - 1]) { sorted = false; break; }
    let ta, va;
    if (sorted) { ta = Float64Array.from(s.t); va = Float64Array.from(s.v); }
    else {
      const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => s.t[a] - s.t[b]);
      ta = new Float64Array(n); va = new Float64Array(n);
      for (let i = 0; i < n; i++) { ta[i] = s.t[ord[i]]; va[i] = s.v[ord[i]]; }
    }
    out.set(name, { name, unit: s.unit, t: ta, v: va, n });
  }

  // --- GPS-Quelle wählen: die mit den meisten eigenständigen Punkten ---
  let bestSrc = null, bestN = 0;
  const gpsSources = [];
  for (const [src, G] of gpsBySrc) {
    gpsSources.push({ source: src === '\u0000row' ? '(Zeile)' : src, points: G.t.length });
    if (G.t.length > bestN) { bestN = G.t.length; bestSrc = src; }
  }
  gpsSources.sort((a, b) => b.points - a.points);
  const G = bestSrc !== null ? gpsBySrc.get(bestSrc) : null;
  let gpsOut = null;
  if (G && G.t.length) {
    const gn = G.t.length;
    let gSorted = true;
    for (let i = 1; i < gn; i++) if (G.t[i] < G.t[i - 1]) { gSorted = false; break; }
    // bisect und alle dt-Rechnungen setzen eine aufsteigende Zeitachse voraus
    const ord = gSorted ? null : Array.from({ length: gn }, (_, i) => i).sort((a, b) => G.t[a] - G.t[b]);
    const pick = arr => {
      if (!arr || arr.length !== gn) return null;
      if (!ord) return Float64Array.from(arr);
      const o = new Float64Array(gn);
      for (let i = 0; i < gn; i++) o[i] = arr[ord[i]];
      return o;
    };
    gpsOut = { t: pick(G.t), lat: pick(G.lat), lon: pick(G.lon), alt: pick(G.alt),
               n: gn, source: bestSrc === '\u0000row' ? null : bestSrc };
  }

  return {
    series: out, gps: gpsOut,
    meta: {
      format: isLong ? 'long' : 'wide',
      delimiter: delim === '\t' ? 'TAB' : delim,
      decimal: decimalComma ? ',' : '.',
      timeFormat: timeFmt.kind,
      epochBased: timeFmt.epoch,
      columns: rawCols, rows, skipped,
      tMin, tMax,
      duration: isFinite(tMax - tMin) ? tMax - tMin : 0,
      seriesCount: out.size,
      gpsPoints: gpsOut ? gpsOut.n : 0,
      gpsSource: gpsOut ? gpsOut.source : null,
      gpsSources: gpsSources.slice(0, 8)
    }
  };
}
