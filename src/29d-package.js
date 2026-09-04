/* ===== Auswertung als Paket weitergeben ============================
   Ein Link kann keine 30 MB Rohdaten tragen. Eine Datei kann es: das
   Paket enthält die fertig ausgewertete Fahrt – Zeitraster, alle
   Messgrößen, Statistik, Route, Ereignisse und das Fahrzeugprofil.
   Wer es öffnet, sieht dieselbe Auswertung wie der Absender und kann
   darin genauso arbeiten. Die Rohdatei bleibt beim Absender.
   ================================================================== */

const PKG_MAGIC = 'obd-telemetrie-paket';
const PKG_VERSION = 1;

/* Zahlenreihen kompakt ablegen. Float32 wäre einfach, aber vier Byte je Wert
   ergeben bei 90 Minuten und 40 Kanälen mehrere Megabyte. Deshalb Ganzzahlen
   mit einer Skalierung je Kanal: der Fehler bleibt unter einem Tausendstel der
   Spanne, und die Datei wird viermal kleiner. Fehlende Werte behalten ihre Lücke. */
function pkgBytesToB64(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function pkgB64ToBytes(str) {
  const bin = atob(str);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i) & 255;
  return b;
}
const PKG_GAP = -32768;                     // steht fuer "kein Wert"
function pkgPackSeries(arr) {
  let lo = Infinity, hi = -Infinity, any = false;
  for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (v === v && isFinite(v)) { any = true; if (v < lo) lo = v; if (v > hi) hi = v; } }
  if (!any) return { n: arr.length, lo: 0, scale: 0, d: '' };
  const span = hi - lo;
  const scale = span > 0 ? span / 32700 : 0;
  const out = new Int16Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    out[i] = (v === v && isFinite(v)) ? (scale > 0 ? Math.round((v - lo) / scale) : 0) : PKG_GAP;
  }
  return { n: arr.length, lo, scale, d: pkgBytesToB64(new Uint8Array(out.buffer, out.byteOffset, out.byteLength)) };
}
function pkgUnpackSeries(p) {
  const out = new Float64Array(p.n);
  if (!p.d) { out.fill(NaN); return out; }
  const b = pkgB64ToBytes(p.d);
  const q = new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2);
  for (let i = 0; i < p.n; i++) out[i] = q[i] === PKG_GAP ? NaN : p.lo + q[i] * p.scale;
  return out;
}
/* Positionen brauchen mehr Stellen als Messwerte: sieben Nachkommastellen als Ganzzahl */
function pkgPackCoords(arr, factor) {
  const out = new Int32Array(arr.length);
  for (let i = 0; i < arr.length; i++) { const v = arr[i]; out[i] = (v === v && isFinite(v)) ? Math.round(v * factor) : -2147483648; }
  return pkgBytesToB64(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
}
function pkgUnpackCoords(str, factor, n) {
  const b = pkgB64ToBytes(str);
  const q = new Int32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  const out = new Float64Array(n === undefined ? q.length : n);
  for (let i = 0; i < out.length; i++) out[i] = q[i] === -2147483648 ? NaN : q[i] / factor;
  return out;
}

/* Metrik-Beschreibung ohne die Rohreihen: die Ansichten arbeiten auf dem Raster */
function pkgMetric(m) {
  return { id: m.id, label: m.label, short: m.short || null, unit: m.unit || '', decimals: m.decimals,
           group: m.group || 'misc', c: m.c || null, prio: m.p, pid: m.pid || null,
           derived: !!m.derived, calc: !!m.calc, converted: !!m.converted, srcUnit: m.srcUnit || null,
           renamed: !!m.renamed, raw: m.raw || null, n: m.n || 0 };
}

/* Feineres Raster als eine Messung je Sekunde bringt für die Weitergabe nichts
   und verfünffacht die Datei. Beim Ausdünnen wandern die Ereignis- und
   Phasenindizes mit, damit sie weiter auf dieselben Zeitpunkte zeigen. */
function pkgThinFactor(step, mode) {
  if (mode === 'voll' || !(step > 0)) return 1;
  return Math.max(1, Math.floor(1 / step));
}
function pkgThinSeries(arr, f) {
  if (f <= 1) return arr;
  const n = Math.ceil(arr.length / f), out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = arr[i * f];
  return out;
}
function pkgThinIndices(obj, f) {
  if (f <= 1 || !obj) return obj;
  const map = v => Math.round(v / f);
  const walk = o => {
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === 'object') {
      const c = {};
      for (const k in o) c[k] = (k === 'i0' || k === 'i1' || k === 'i') && typeof o[k] === 'number' ? map(o[k]) : walk(o[k]);
      return c;
    }
    return o;
  };
  return walk(obj);
}

/* Die Statistik trägt eine sortierte Kopie jeder Messreihe mit sich (für die
   Perzentile). Die gehört nicht ins Paket: sie ist größer als alle Messwerte
   zusammen und lässt sich jederzeit neu bilden. */
function pkgSlimStats(stats) {
  const out = {};
  for (const id in stats) {
    const s = stats[id]; if (!s) continue;
    const c = {};
    for (const k in s) { if (k.charAt(0) === '_') continue; const v = s[k]; if (typeof v === 'number') c[k] = v; }
    out[id] = c;
  }
  return out;
}

function buildPackage(ds, profile, fileName, opts) {
  opts = opts || {};
  const f = pkgThinFactor(ds.step, opts.raster);
  const N = f > 1 ? Math.ceil(ds.N / f) : ds.N;
  const step = ds.step * f;
  const G = {};
  for (const id in ds.G) if (ds.G[id]) G[id] = pkgPackSeries(pkgThinSeries(ds.G[id], f));
  const tr = opts.ohneRoute ? null : ds.track;
  const track = tr ? {
    n: tr.n, lat: pkgPackCoords(tr.lat, 1e7), lon: pkgPackCoords(tr.lon, 1e7),
    alt: tr.alt ? pkgPackCoords(tr.alt, 100) : null,
    t: pkgPackCoords(tr.t, 100), dist: pkgPackCoords(tr.dist, 100),
    segSpeed: tr.segSpeed ? pkgPackCoords(tr.segSpeed, 100) : null,
    gaps: tr.gaps || [], gapDist: tr.gapDist || 0, totalDist: tr.totalDist,
    rejected: tr.rejected || 0, bbox: tr.bbox, center: tr.center
  } : null;
  return {
    [PKG_MAGIC]: PKG_VERSION,
    erzeugt: new Date().toISOString(),
    datei: fileName || '',
    profil: profile ? profile.id : null,
    profilName: profile ? profile.name : null,
    vin: (typeof App !== 'undefined' && App.vin) ? App.vin.vin : null,
    meta: ds.meta, t0: ds.t0, t1: ds.t1, duration: ds.duration, step, N,
    raster: f > 1 ? { ausgeduennt: f, originalStep: ds.step } : null,
    metrics: Array.from(ds.metrics.values()).map(pkgMetric),
    G, stats: pkgSlimStats(ds.stats), coverage: ds.coverage, trip: ds.trip,
    phases: ds.phases ? { time: ds.phases.time, segs: pkgThinIndices(ds.phases.segs, f), defs: ds.phases.defs } : null,
    events: pkgThinIndices(ds.events, f), notices: ds.notices || [],
    /* speedSrc ist eine Reihe je Rasterpunkt: mit ausdünnen, sonst passt sie nicht mehr */
    speedSrc: ds.speedSrc && ds.speedSrc.length ? pkgPackSeries(pkgThinSeries(Float64Array.from(ds.speedSrc), f)) : null,
    cacRefSource: ds.cacRefSource || null, boostDerived: !!ds.boostDerived, boostR2: ds.boostR2,
    track,
    ohneRoute: !!opts.ohneRoute,
    rollCircum: opts.rollCircum || null,
    gearbox: opts.gearbox || null,
    notizen: opts.notes || [],
    dtc: opts.dtc || []
  };
}

/* Aus dem Paket wieder einen Datensatz bauen, mit dem alle Ansichten arbeiten */
function datasetFromPackage(p) {
  if (!p || p[PKG_MAGIC] !== PKG_VERSION) throw new Error('Das ist kein Auswertungspaket dieser Fassung.');
  const N = p.N, step = p.step, t0 = p.t0;
  const grid = new Float64Array(N);
  for (let i = 0; i < N; i++) grid[i] = t0 + i * step;
  const G = {};
  for (const id in p.G) G[id] = pkgUnpackSeries(p.G[id]);
  const metrics = new Map();
  for (const m of p.metrics) {
    metrics.set(m.id, { id: m.id, label: m.label, short: m.short || undefined, unit: m.unit, decimals: m.decimals,
      group: m.group, c: m.c, p: m.prio, pid: m.pid || undefined, derived: m.derived, calc: m.calc,
      converted: m.converted, srcUnit: m.srcUnit || undefined, renamed: m.renamed, raw: m.raw || undefined,
      n: m.n, v: G[m.id] || new Float64Array(0), t: grid });
  }
  const tr = p.track ? {
    n: p.track.n, lat: pkgUnpackCoords(p.track.lat, 1e7, p.track.n), lon: pkgUnpackCoords(p.track.lon, 1e7, p.track.n),
    alt: p.track.alt ? pkgUnpackCoords(p.track.alt, 100, p.track.n) : null,
    t: pkgUnpackCoords(p.track.t, 100, p.track.n), dist: pkgUnpackCoords(p.track.dist, 100, p.track.n),
    segSpeed: p.track.segSpeed ? pkgUnpackCoords(p.track.segSpeed, 100, p.track.n) : null,
    gaps: p.track.gaps || [], gapDist: p.track.gapDist || 0, totalDist: p.track.totalDist,
    rejected: p.track.rejected || 0, bbox: p.track.bbox, center: p.track.center
  } : null;
  return {
    parsed: { meta: p.meta, series: new Map() },
    meta: p.meta, metrics, stats: p.stats, grid, G, N, step, t0, t1: p.t1, duration: p.duration,
    track: tr, coverage: p.coverage, speedSrc: p.speedSrc ? pkgUnpackSeries(p.speedSrc) : null, notices: p.notices || [],
    scoped: [], profile: null, cacRefSource: p.cacRefSource,
    boostDerived: p.boostDerived, boostR2: p.boostR2,
    trip: p.trip, phases: p.phases, events: p.events,
    fromPackage: true
  };
}

/* JSON kennt kein NaN: es würde als null geschrieben und beim Lesen zu 0.
   Genau daran hing sonst der Unterschied zwischen "nicht bewertbar" und einem
   erfundenen Messwert. Deshalb eigene Kennzeichen für die Sonderfälle. */
const PKG_NAN = '\u0000NaN', PKG_INF = '\u0000Inf', PKG_NINF = '\u0000-Inf';
function pkgStringify(obj) {
  return JSON.stringify(obj, function (k, v) {
    const raw = this[k];
    if (typeof raw === 'number' && !isFinite(raw)) return Number.isNaN(raw) ? PKG_NAN : (raw > 0 ? PKG_INF : PKG_NINF);
    return v;
  });
}
function pkgParse(text) {
  return JSON.parse(text, (k, v) => v === PKG_NAN ? NaN : v === PKG_INF ? Infinity : v === PKG_NINF ? -Infinity : v);
}

/* Text erkennen: ein Paket ist JSON mit dem Kennzeichen ganz vorn */
function looksLikePackage(text) {
  const head = String(text || '').slice(0, 200);
  return /^\s*\{\s*"obd-telemetrie-paket"\s*:/.test(head);
}

/* Datei schreiben und lesen: JSON, wenn möglich gzip-gepackt */
async function packageToBytes(pkg) {
  const json = pkgStringify(pkg);
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'function') return { bytes, gz: false };
  try {
    const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return { bytes: new Uint8Array(await new Response(cs).arrayBuffer()), gz: true };
  } catch (e) { return { bytes, gz: false }; }
}
function packageFileName(fileName, profileName) {
  const base = String(fileName || 'auswertung').replace(/\.[^.]+$/, '').replace(/[^\wäöüÄÖÜß -]+/g, '_').slice(0, 60);
  return base + (profileName ? ' · ' + profileName.split('·')[0].trim() : '') + '.obdpaket.json.gz';
}
