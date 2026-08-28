/* ============================================================
   OBD Telemetry Studio — Utilities
   ============================================================ */
'use strict';

const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const el = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
  }
  return n;
};

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const lerp  = (a, b, t) => a + (b - a) * t;

/* ---- Zahlenformatierung (deutsches Locale) ---- */
const NF = new Map();
function nf(dec) {
  if (!NF.has(dec)) NF.set(dec, new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: dec, maximumFractionDigits: dec
  }));
  return NF.get(dec);
}
function fmt(v, dec) {
  if (v === null || v === undefined || !isFinite(v)) return '–';
  if (dec === undefined) {
    const a = Math.abs(v);
    dec = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  }
  return nf(dec).format(v);
}
/* Kompakte Achsenbeschriftung */
function fmtTick(v, step) {
  if (!isFinite(v)) return '';
  const a = Math.abs(v);
  if (a >= 1e6) return fmt(v / 1e6, 1) + 'M';
  if (a >= 1e4) return fmt(v / 1e3, a >= 1e5 ? 0 : 1) + 'k';
  let dec;
  if (step === undefined) dec = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  else {
    dec = step >= 100 ? 0 : step >= 10 ? 0 : step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
    // Die Stellenzahl muss die Schrittweite darstellen können. niceTicks erzeugt auch
    // 2,5er-Schritte; mit null Nachkommastellen wird der Tick bei 2,5 als "3" beschriftet –
    // die Gitterlinie sitzt dann richtig und die Zahl daneben ist falsch.
    while (dec < 6 && Math.abs(+step.toFixed(dec) - step) > Math.abs(step) * 1e-9) dec++;
  }
  return nf(dec).format(v);
}

/* Sekunden -> hh:mm:ss  (absolute Tageszeit) */
function fmtClock(sec, withMs) {
  if (!isFinite(sec)) return '–';
  let s = ((sec % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);   s -= m * 60;
  const p = n => String(Math.floor(n)).padStart(2, '0');
  return p(h) + ':' + p(m) + ':' + p(s) + (withMs ? ',' + String(Math.floor((s % 1) * 10)) : '');
}
/* Dauer in Sekunden -> "1 h 23 min" / "4:07 min" */
function fmtDur(sec) {
  if (!isFinite(sec) || sec < 0) return '–';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  if (h > 0) return h + ' h ' + String(m).padStart(2, '0') + ' min';
  if (m > 0) return m + ':' + String(s).padStart(2, '0') + ' min';
  return fmt(sec, 1) + ' s';
}
/* Sekunden relativ zum Fahrtstart -> mm:ss */
function fmtRel(sec) {
  if (!isFinite(sec)) return '–';
  const neg = sec < 0; sec = Math.abs(sec);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return (neg ? '-' : '') + m + ':' + String(s).padStart(2, '0');
}

/* ---- Statistik-Helfer ---- */
function quantileSorted(sorted, q) {
  const n = sorted.length;
  if (!n) return NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * q, base = Math.floor(pos), rest = pos - base;
  return base + 1 < n ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

/* Haversine-Distanz in Metern */
const R_EARTH = 6371008.8;
function haversine(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* Binäre Suche: größter Index mit arr[i] <= x  (arr aufsteigend) */
function minOf(a) { let m = Infinity; for (let i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
function maxOf(a) { let m = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
function bisect(arr, x, lo, hi) {
  lo = lo || 0; hi = (hi === undefined ? arr.length : hi) - 1;
  if (hi < 0) return -1;
  if (x < arr[lo]) return -1;
  if (x >= arr[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= x) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/* Gleitender Mittelwert (zentriert), NaN-fest: NaN-Stellen bleiben NaN,
   gehen aber nicht in die Fenstersumme ein. */
function smooth(values, win) {
  const n = values.length, out = new Float64Array(n);
  if (win < 2 || n === 0) { for (let i = 0; i < n; i++) out[i] = values[i]; return out; }
  const half = win >> 1;
  for (let i = 0; i < n; i++) {
    if (!(values[i] === values[i])) { out[i] = NaN; continue; }
    let sum = 0, cnt = 0;
    const a = Math.max(0, i - half), b = Math.min(n - 1, i + half);
    for (let j = a; j <= b; j++) { const v = values[j]; if (v === v) { sum += v; cnt++; } }
    out[i] = cnt ? sum / cnt : NaN;
  }
  return out;
}

/* Nice-Ticks für Achsen */
function niceTicks(min, max, target) {
  target = target || 5;
  if (!isFinite(min) || !isFinite(max)) return { ticks: [], step: 1 };
  if (min === max) { const p = Math.abs(min) || 1; min -= p * 0.1; max += p * 0.1; }
  const raw = (max - min) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { ticks, step };
}

/* Largest-Triangle-Three-Buckets Downsampling (behält Peaks) */
function lttb(xs, ys, threshold) {
  const n = xs.length;
  if (threshold >= n || threshold <= 2) {
    const ix = new Int32Array(n); for (let i = 0; i < n; i++) ix[i] = i; return ix;
  }
  /* Zwei Plätze je Eimer: einer für den kennzeichnenden Messpunkt, einer für einen
     Lückenmarker. Ohne den verschwinden kurze Datenlücken beim Verkleinern und die Linie
     wird über sie hinweg durchgezogen – sie sieht dann nach Messung aus, wo keine war. */
  const out = new Int32Array(threshold * 2);
  const every = (n - 2) / (threshold - 2);
  let a = 0, oi = 0;
  out[oi++] = 0;
  for (let i = 0; i < threshold - 2; i++) {
    let avgX = 0, avgY = 0, avgCnt = 0;
    const avgStart = Math.floor((i + 1) * every) + 1,
          avgEnd = Math.min(Math.floor((i + 2) * every) + 1, n);
    // NaN aus dem Mittelwert heraushalten: sonst ist jede Dreiecksfläche NaN, der
    // Größenvergleich schlägt nie an und es wird stumpf der erste Punkt genommen –
    // eine Spitze direkt vor einer Lücke fällt damit weg.
    for (let j = avgStart; j < avgEnd; j++) if (ys[j] === ys[j]) { avgX += xs[j]; avgY += ys[j]; avgCnt++; }
    if (avgCnt) { avgX /= avgCnt; avgY /= avgCnt; }
    else { avgX = xs[Math.min(avgStart, n - 1)]; avgY = ys[a] === ys[a] ? ys[a] : 0; }
    const rangeStart = Math.floor(i * every) + 1, rangeEnd = Math.min(Math.floor((i + 1) * every) + 1, n);
    const ax = xs[a], ay = ys[a] === ys[a] ? ys[a] : avgY;
    let maxArea = -1, maxIdx = -1, nanIdx = -1;
    for (let j = rangeStart; j < rangeEnd; j++) {
      if (!(ys[j] === ys[j])) { if (nanIdx < 0) nanIdx = j; continue; }
      const area = Math.abs((ax - avgX) * (ys[j] - ay) - (ax - xs[j]) * (avgY - ay));
      if (area > maxArea) { maxArea = area; maxIdx = j; }
    }
    if (maxIdx < 0 && nanIdx < 0) continue;
    if (maxIdx < 0) { out[oi++] = nanIdx; continue; }
    if (nanIdx >= 0 && nanIdx < maxIdx) out[oi++] = nanIdx;
    out[oi++] = maxIdx;
    if (nanIdx > maxIdx) out[oi++] = nanIdx;
    a = maxIdx;
  }
  out[oi++] = n - 1;
  return out.subarray(0, oi);
}

/* Debounce / rAF-Throttle */
function raf(fn) {
  let pending = false, lastArgs;
  return function () {
    lastArgs = arguments;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fn.apply(null, lastArgs); });
  };
}
function debounce(fn, ms) {
  let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms); };
}

const store = {
  get(k, def) { try { const v = localStorage.getItem('obdstudio.' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v)   { try { localStorage.setItem('obdstudio.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k)      { try { localStorage.removeItem('obdstudio.' + k); } catch (e) {} }
};
