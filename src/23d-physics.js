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
  for (const s of wot) {
    let best = null;
    for (let i = s.i0 + 1; i <= s.i1 - 1 && i < N - 1; i++) {
      const v0 = v[i - 1], v1 = v[i + 1];
      if (!(v0 === v0) || !(v1 === v1) || v[i] < 40) continue;      // erst ab 40 km/h ist die Rechnung stabil
      const a = (v1 - v0) / 3.6 / (2 * step);
      if (!(a > 0.4)) continue;                                     // nur echtes Beschleunigen
      let slope = 0;
      if (alt && alt[i + 1] === alt[i + 1] && alt[i - 1] === alt[i - 1]) {
        const ds_m = (v[i] / 3.6) * 2 * step;
        if (ds_m > 1) slope = Math.max(-0.12, Math.min(0.12, (alt[i + 1] - alt[i - 1]) / ds_m));
      }
      const kwWheel = tractivePowerKW(v[i], a, slope, p);
      const kw = crankFromWheel(kwWheel, p.driveline);
      if (!(kw > 0)) continue;
      const rec = { t: grid[i], v: v[i], a, slope, kw, rpm: G.rpm ? G.rpm[i] : NaN };
      if (!best || kw > best.kw) best = rec;
    }
    if (best) out.pulls.push(best);
  }
  if (!out.pulls.length) { out.reason = 'Kein Volllastzug mit auswertbarer Beschleunigung über 40 km/h.'; out.params = p; return out; }
  out.pulls.sort((x, y) => y.kw - x.kw);
  out.best = out.pulls[0];
  const kws = out.pulls.map(x => x.kw).sort((x, y) => x - y);
  out.median = kws[Math.floor(kws.length / 2)];
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
  for (let i = 1; i < N - 1; i++) {
    const vv = v[i]; if (!(vv > 50)) continue;
    const v0 = v[i - 1], v1 = v[i + 1];
    if (!(v0 === v0) || !(v1 === v1)) continue;
    const a = (v1 - v0) / 3.6 / (2 * step);
    if (!(a > 0.8)) continue;                                       // kräftige Beschleunigung, sonst dominiert das Rauschen
    const kw = pw[i]; if (!(kw > 20)) continue;
    let slope = 0;
    if (alt && alt[i + 1] === alt[i + 1] && alt[i - 1] === alt[i - 1]) {
      const dm = (vv / 3.6) * 2 * step;
      if (dm > 1) slope = Math.max(-0.12, Math.min(0.12, (alt[i + 1] - alt[i - 1]) / dm));
    }
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
