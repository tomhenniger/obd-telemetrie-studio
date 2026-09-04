/* ===== Leistung aus der Beschleunigung =============================
   Zweite, unabhängige Leistungsschätzung: statt aus dem Kraftstofffluss
   wird sie aus der Fahrphysik gerechnet. Nötige Kraft = Beschleunigung
   der Masse + Luftwiderstand + Rollwiderstand + Steigung.
   Weicht sie stark von der Verbrauchsschätzung ab, stimmt eine der
   beiden Annahmen nicht – das ist selbst ein Befund.
   ================================================================== */

const RHO_AIR = 1.204;          // kg/m³ bei 20 °C
const G0 = 9.80665;
const ROT_INERTIA = 1.06;       // Zuschlag für drehende Massen im höheren Gang

/* Fahrwiderstandsleistung in kW bei v (km/h), a (m/s²), Steigung (m/m) */
function tractivePowerKW(v, a, slope, p) {
  const vms = v / 3.6;
  if (!(vms > 0)) return NaN;
  const F = p.mass * ROT_INERTIA * a
          + 0.5 * RHO_AIR * p.cd * p.area * vms * vms
          + p.mass * G0 * p.crr
          + p.mass * G0 * (slope || 0);
  return F * vms / 1000;
}

/* Leistung am Rad → an der Kurbelwelle (Antriebsstrangverluste) */
function crankFromWheel(kw, driveline) { return kw / (driveline || 0.86); }

/* Beste Volllastzüge auswerten: für jeden Zug die Spitzenleistung schätzen. */
function powerFromAccel(ds, profile, opts) {
  opts = opts || {};
  const G = ds.G, grid = ds.grid, N = grid.length;
  const step = N > 1 ? grid[1] - grid[0] : 1;
  const v = G.speed_mix || G.speed || G.speed_gps;
  const out = { ok: false, pulls: [], best: null };
  if (!v) { out.reason = 'Ohne Geschwindigkeit ist keine Leistungsschätzung möglich.'; return out; }
  const specs = (profile && profile.specs) || {};
  const p = {
    mass: opts.mass || (specs.massKg ? specs.massKg + 80 : 1700),   // Leergewicht plus Fahrer
    cd: opts.cd || specs.cd || 0.32,
    area: opts.area || specs.frontArea || 2.2,
    crr: opts.crr || 0.011,
    driveline: opts.driveline || ((profile && /quattro|allrad|awd/i.test(profile.models || '')) ? 0.83 : 0.86)
  };
  const wot = (ds.events && ds.events.wot) || [];
  const alt = G.alt_smooth || G.alt || null;
  /* Beschleunigung über ein Fenster von rund drei Sekunden aus der Ausgleichsgeraden.
     Aus zwei benachbarten Punkten gerechnet macht ein einzelner GPS-Sprung aus 240 kW
     schnell 400 – die Rechnung ist nur so gut wie die Glättung davor. */
  const win = Math.max(1, Math.round(1.5 / step));
  const slopeFit = (arr, i) => {
    let n = 0, sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let k = i - win; k <= i + win; k++) {
      if (k < 0 || k >= N) continue;
      const y = arr[k]; if (!(y === y)) continue;
      const x = (k - i) * step; n++; sx += x; sy += y; sxy += x * y; sxx += x * x;
    }
    const den = n * sxx - sx * sx;
    return n >= 3 && Math.abs(den) > 1e-9 ? (n * sxy - sx * sy) / den : NaN;
  };
  for (const s of wot) {
    const cand = [];
    for (let i = s.i0 + win; i <= s.i1 - win && i < N - 1; i++) {
      if (!(v[i] >= 40)) continue;                                  // erst ab 40 km/h ist die Rechnung stabil
      const a = slopeFit(v, i) / 3.6;                               // km/h je s → m/s²
      if (!(a > 0.5)) continue;                                     // nur zügiges Beschleunigen
      let slope = 0;
      if (alt) { const g = slopeFit(alt, i); const vms = v[i] / 3.6; if (g === g && vms > 1) slope = Math.max(-0.12, Math.min(0.12, g / vms)); }
      const kw = crankFromWheel(tractivePowerKW(v[i], a, slope, p), p.driveline);
      if (!(kw > 0)) continue;
      cand.push({ t: grid[i], v: v[i], a, slope, kw, rpm: G.rpm ? G.rpm[i] : NaN });
    }
    if (cand.length < 3) continue;                                  // ein einzelner Punkt ist kein Zug
    /* Statt des Maximums das 90. Perzentil des Zugs: robust gegen einen Ausreißer */
    const sorted = cand.slice().sort((x, y) => x.kw - y.kw);
    out.pulls.push(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]);
  }
  if (!out.pulls.length) { out.reason = 'Kein Volllastzug mit auswertbarer Beschleunigung über 40 km/h.'; out.params = p; return out; }
  out.pulls.sort((x, y) => y.kw - x.kw);
  const kws = out.pulls.map(x => x.kw).sort((x, y) => x - y);
  out.median = kws[Math.floor(kws.length / 2)];
  /* Als Kennwert der beste Zug, aber nie mehr als das Doppelte des Medians –
     alles darüber ist Rauschen, nicht Leistung. */
  out.best = out.pulls.find(x => x.kw <= out.median * 2) || out.pulls[out.pulls.length - 1];
  out.params = p;
  out.ok = true;
  if (specs.powerKW) {
    out.specKW = specs.powerKW;
    out.devPct = (out.best.kw - specs.powerKW) / specs.powerKW * 100;
  }
  return out;
}

/* Masse aus Leistung und Beschleunigung: dieselbe Gleichung nach m aufgelöst.
   Nutzt die Leistung aus dem Verbrauch (G.power) als bekannte Größe. */
function massFromPower(ds, profile, opts) {
  opts = opts || {};
  const G = ds.G, grid = ds.grid, N = grid.length;
  const step = N > 1 ? grid[1] - grid[0] : 1;
  const v = G.speed_mix || G.speed || G.speed_gps;
  const pw = G.power_kw || G.power || null;
  const out = { ok: false, n: 0 };
  if (!v || !pw) { out.reason = 'Dafür braucht es Geschwindigkeit und eine Leistungsgröße (aus Verbrauch oder App).'; return out; }
  const specs = (profile && profile.specs) || {};
  const cd = opts.cd || specs.cd || 0.32, area = opts.area || specs.frontArea || 2.2, crr = opts.crr || 0.011;
  const driveline = opts.driveline || 0.86;
  const alt = G.alt_smooth || G.alt || null;
  const est = [];
  const win = Math.max(1, Math.round(1.5 / step));
  const fit = (arr, i) => {
    let n = 0, sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let k = i - win; k <= i + win; k++) { if (k < 0 || k >= N) continue; const y = arr[k]; if (!(y === y)) continue;
      const x = (k - i) * step; n++; sx += x; sy += y; sxy += x * y; sxx += x * x; }
    const den = n * sxx - sx * sx;
    return n >= 3 && Math.abs(den) > 1e-9 ? (n * sxy - sx * sy) / den : NaN;
  };
  for (let i = win; i < N - win; i++) {
    const vv = v[i]; if (!(vv > 50)) continue;
    const a = fit(v, i) / 3.6;
    if (!(a > 0.8)) continue;                                       // kräftige Beschleunigung, sonst dominiert das Rauschen
    const kw = pw[i]; if (!(kw > 20)) continue;
    let slope = 0;
    if (alt) { const gme = fit(alt, i), vms0 = vv / 3.6; if (gme === gme && vms0 > 1) slope = Math.max(-0.12, Math.min(0.12, gme / vms0)); }
    const vms = vv / 3.6;
    const F = kw * 1000 * driveline / vms;                          // Kraft am Rad
    const drag = 0.5 * RHO_AIR * cd * area * vms * vms;
    const m = (F - drag) / (ROT_INERTIA * a + G0 * crr + G0 * slope);
    if (m > 700 && m < 4000) est.push(m);
  }
  if (est.length < 20) { out.reason = 'Zu wenige kräftige Beschleunigungen über 50 km/h (' + est.length + ', mindestens 20).'; return out; }
  est.sort((a, b) => a - b);
  const q = f => est[Math.floor((est.length - 1) * f)];
  out.ok = true; out.n = est.length; out.median = q(0.5); out.p25 = q(0.25); out.p75 = q(0.75);
  out.specKg = specs.massKg || null;
  if (out.specKg) out.devKg = out.median - out.specKg;
  return out;
}
