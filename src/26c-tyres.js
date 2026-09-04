/* ===== Tacho & Reifen ==============================================
   Das Steuergerät rechnet die Raddrehzahl mit einem fest hinterlegten
   Abrollumfang in km/h um (das ist die OBD-Geschwindigkeit, auf ihr fußen
   Tacho und Tempomat). GPS misst die echte Geschwindigkeit. Das Verhältnis
   k = v_GPS / v_OBD ist der Reifenfaktor: k < 1 heißt, das Auto ist
   langsamer als das Steuergerät glaubt (kleinerer Reifen, abgefahren);
   k > 1 heißt größerer Reifen. Der Tacho zeigt zusätzlich gesetzlich
   voreilend an (nie weniger, höchstens +10 % + 4 km/h).
   ================================================================== */

/* "255/35 R19", "255/35ZR19", "225/50 R 17", "255/35-19" */
function parseTyre(str) {
  const m = String(str || '').toUpperCase().replace(/\s+/g, '').match(/^(\d{3})\/(\d{2})(?:Z?R|-)?(\d{2})(?:[A-Z].*)?$/);
  if (!m) return null;
  const width = +m[1], aspect = +m[2], rim = +m[3];
  if (width < 125 || width > 355 || aspect < 20 || aspect > 85 || rim < 12 || rim > 24) return null;
  const diameterMm = rim * 25.4 + 2 * width * aspect / 100;
  const staticCircum = Math.PI * diameterMm / 1000;
  return { width, aspect, rim, diameterMm, staticCircum,
           rollCircum: staticCircum,                         // entspricht den Herstellertabellen auf ±0,5 % (255/35 R19 → 2,077 m)
           label: width + '/' + aspect + ' R' + rim };
}

/* Gängige Größen, deren Abrollumfang innerhalb tolPct am Ziel liegt */
function tyreCandidates(targetRollM, tolPct, limit) {
  tolPct = tolPct || 1.5; limit = limit || 12;
  const out = [];
  for (let rim = 15; rim <= 22; rim++)
    for (let width = 185; width <= 305; width += 10)
      for (let aspect = 25; aspect <= 65; aspect += 5) {
        const t = parseTyre(width + '/' + aspect + ' R' + rim);
        if (!t) continue;
        const dev = (t.rollCircum / targetRollM - 1) * 100;
        if (Math.abs(dev) <= tolPct) out.push({ label: t.label, rollCircum: t.rollCircum, dev });
      }
  out.sort((a, b) => Math.abs(a.dev) - Math.abs(b.dev));
  return out.slice(0, limit);
}

/* Reifenfaktor aus OBD- und GPS-Geschwindigkeit auf dem Zeitraster.
   Nur ruhige Punkte: beide Werte da, v_GPS ≥ vMin, kaum Beschleunigung. */
function speedRatioAnalysis(G, grid, opts) {
  opts = opts || {};
  const obd = G.speed, gps = G.speed_gps, acc = G.accel;
  const vMin = opts.vMin || 45, aMax = opts.aMax || 0.35;
  if (!obd || !gps) return { ok: false, reason: 'OBD- und GPS-Geschwindigkeit werden beide gebraucht' };
  const xs = [], ys = [], ratios = [], idx = [];
  const step = grid.length > 1 ? grid[1] - grid[0] : 1;
  for (let i = 1; i < grid.length - 1; i++) {
    const a = obd[i], g = gps[i];
    if (!(a === a) || !(g === g) || g < vMin || a < vMin) continue;
    let ax = acc && acc[i] === acc[i] ? Math.abs(acc[i]) * 9.81 : Math.abs((a - obd[i - 1]) / 3.6 / step);   // accel liegt in g vor
    if (!(ax === ax) || ax > aMax) continue;
    if (Math.abs(g / a - 1) > 0.25) continue;                 // GPS-Ausreißer
    xs.push(a); ys.push(g); ratios.push(g / a); idx.push(i);
  }
  const n = ratios.length;
  if (n < 40) return { ok: false, reason: 'zu wenige ruhige Abschnitte ab ' + vMin + ' km/h mit beiden Geschwindigkeiten (' + n + ' Punkte, mindestens 40)', n };
  const sorted = ratios.slice().sort((p, q) => p - q);
  const med = sorted[Math.floor(n / 2)];
  const mad = sorted.map(r => Math.abs(r - med)).sort((p, q) => p - q)[Math.floor(n / 2)];
  /* Ursprungsgerade nach kleinsten Quadraten: k = Σxy / Σx² */
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; }
  const slope = sxy / sxx;
  /* nach Geschwindigkeitsklassen: bleibt der Faktor konstant, ist es der Reifen; steigt er, ist es etwas anderes */
  const bins = [[45, 70], [70, 100], [100, 130], [130, 260]].map(([lo, hi]) => {
    const r = ratios.filter((_, i) => xs[i] >= lo && xs[i] < hi);
    if (r.length < 8) return { lo, hi, n: r.length, k: NaN };
    const s = r.slice().sort((p, q) => p - q);
    return { lo, hi, n: r.length, k: s[Math.floor(s.length / 2)] };
  });
  const valid = bins.filter(b => b.k === b.k);
  const spreadBins = valid.length > 1 ? Math.max(...valid.map(b => b.k)) - Math.min(...valid.map(b => b.k)) : 0;
  return { ok: true, n, k: med, slope, mad, bins, spreadBins, xs, ys, idx,
           consistent: mad < 0.015 && spreadBins < 0.012,
           quality: mad < 0.01 ? 'gut' : mad < 0.02 ? 'brauchbar' : 'unruhig' };
}

/* Was der Reifenfaktor bedeutet, wenn Steuergerät-Umfang und montierte Größe bekannt sind */
function tyreInterpretation(k, ecuCircum, mounted) {
  const out = { k, effectiveCircum: ecuCircum ? k * ecuCircum : null, mounted: mounted || null };
  if (out.effectiveCircum && mounted) {
    out.devMountedPct = (out.effectiveCircum / mounted.rollCircum - 1) * 100;
    /* 1 mm weniger Profil = 2 mm weniger Durchmesser; Umfang skaliert mit dem Durchmesser */
    out.treadMm = -out.devMountedPct / 100 * mounted.diameterMm / 2;
  }
  return out;
}

/* Tempomat-Tabelle: Sollwert (Steuergerät) → tatsächliche Geschwindigkeit */
function cruiseTable(k, overreadPct, overreadKmh, setSpeeds) {
  setSpeeds = setSpeeds || [50, 70, 80, 100, 120, 130, 140, 160, 180, 200];
  return setSpeeds.map(set => {
    const obd = (set - (overreadKmh || 0)) / (1 + (overreadPct || 0) / 100);   // was der Radsensor bei dieser Anzeige liefert
    return { set, obd, real: obd * k };
  });
}
