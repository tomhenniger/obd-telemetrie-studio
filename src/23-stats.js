/* ============================================================
   Datensatz-Aufbereitung, abgeleitete Größen, Statistik, Events
   ============================================================ */

const CO2_PER_L = { petrol: 2.37, diesel: 2.65, lpg: 1.64 };   // kg CO2 je Liter

/* ---------- Sample-Zugriff mit Vorwärts-Füllung ---------- */
function sampleAt(m, t, maxAge) {
  const i = bisect(m.t, t);
  if (i < 0) return NaN;
  if (t - m.t[i] > maxAge) return NaN;
  return m.v[i];
}

/* Zeitgewichtete Statistik einer Serie */
function seriesStats(t, v, n) {
  if (!n) return null;
  let min = Infinity, max = -Infinity, sum = 0, wsum = 0, wtot = 0;
  let iMin = 0, iMax = 0;
  const dtMed = medianDt(t, n);
  const capDt = Math.max(dtMed * 4, 0.5);
  for (let i = 0; i < n; i++) {
    const x = v[i];
    if (x < min) { min = x; iMin = i; }
    if (x > max) { max = x; iMax = i; }
    sum += x;
    const dt = i < n - 1 ? Math.min(t[i + 1] - t[i], capDt) : dtMed;
    wsum += x * dt; wtot += dt;
  }
  const sorted = Float64Array.from(v.subarray ? v.subarray(0, n) : v.slice(0, n)).sort();
  const mean = sum / n;
  let varsum = 0;
  for (let i = 0; i < n; i++) varsum += (v[i] - mean) ** 2;
  return {
    n, min, max, tMin: t[iMin], tMax: t[iMax],
    mean, meanW: wtot > 0 ? wsum / wtot : mean,
    std: Math.sqrt(varsum / Math.max(1, n - 1)),
    p05: quantileSorted(sorted, 0.05), p25: quantileSorted(sorted, 0.25),
    median: quantileSorted(sorted, 0.5),
    p75: quantileSorted(sorted, 0.75), p95: quantileSorted(sorted, 0.95),
    p99: quantileSorted(sorted, 0.99),
    range: max - min, duration: t[n - 1] - t[0], hz: n / Math.max(1e-6, t[n - 1] - t[0]),
    _sorted: sorted
  };
}
function medianDt(t, n) {
  if (n < 3) return 1;
  const step = Math.max(1, Math.floor(n / 500));
  const ds = [];
  for (let i = step; i < n; i += step) { const d = (t[i] - t[i - step]) / step; if (d > 0) ds.push(d); }
  if (!ds.length) return 1;
  ds.sort((a, b) => a - b);
  return ds[ds.length >> 1] || 1;
}

/* ---------- GPS-Track säubern ---------- */
function cleanTrack(gps, vMaxKmh) {
  vMaxKmh = vMaxKmh || 260;
  const n = gps.n;
  const keep = [];
  let rejected = 0;
  keep.push(0);
  for (let i = 1; i < n; i++) {
    const j = keep[keep.length - 1];
    const d = haversine(gps.lat[j], gps.lon[j], gps.lat[i], gps.lon[i]);
    const dt = gps.t[i] - gps.t[j];
    const lim = dt > 0.05 ? (dt * vMaxKmh / 3.6) + 25 : 35;
    if (d > lim) {
      let confirm = 0;
      for (let k = i + 1; k < Math.min(i + 5, n); k++)
        if (haversine(gps.lat[i], gps.lon[i], gps.lat[k], gps.lon[k]) < 250) confirm++;
      if (confirm < 2) { rejected++; continue; }
    }
    keep.push(i);
  }
  const m = keep.length;
  const t = new Float64Array(m), lat = new Float64Array(m), lon = new Float64Array(m);
  const alt = gps.alt ? new Float64Array(m) : null;
  for (let i = 0; i < m; i++) { const k = keep[i]; t[i] = gps.t[k]; lat[i] = gps.lat[k]; lon[i] = gps.lon[k]; if (alt) alt[i] = gps.alt[k]; }

  // kumulierte Strecke + Lücken
  const dist = new Float64Array(m);
  const segSpeed = new Float64Array(m);
  const gaps = [];
  let total = 0, gapDist = 0;
  for (let i = 1; i < m; i++) {
    const d = haversine(lat[i - 1], lon[i - 1], lat[i], lon[i]);
    const dt = t[i] - t[i - 1];
    if (d > 400 || dt > 20) { gaps.push({ i, d, dt, from: i - 1, to: i }); gapDist += d; }
    total += d;
    dist[i] = total;
    segSpeed[i] = dt > 0.1 ? (d / dt) * 3.6 : segSpeed[i - 1];
  }
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (let i = 0; i < m; i++) {
    if (lat[i] < latMin) latMin = lat[i]; if (lat[i] > latMax) latMax = lat[i];
    if (lon[i] < lonMin) lonMin = lon[i]; if (lon[i] > lonMax) lonMax = lon[i];
  }
  return { n: m, t, lat, lon, alt, dist, segSpeed, gaps, gapDist,
           totalDist: total, rejected, bbox: { latMin, latMax, lonMin, lonMax },
           center: [(latMin + latMax) / 2, (lonMin + lonMax) / 2] };
}

/* ---------- Hauptaufbau ---------- */
function buildDataset(parsed, profile) {
  const map = mapSeries(parsed.series);
  const metrics = new Map();
  for (const [id, m] of map.assigned) metrics.set(id, m);
  map.extras.forEach((e, i) => { const m = buildFreeMetric(e.raw, e.s, i); metrics.set(m.id, m); });

  const t0 = parsed.meta.tMin, t1 = parsed.meta.tMax;
  const duration = t1 - t0;

  /* --- Ladedruck-Einheit prüfen (Apps labeln psi gerne als bar) --- */
  const notices = [];
  let boostR2 = 0;
  const boost = metrics.get('boost');
  let boostFix = null;
  if (boost) {
    const bs = seriesStats(boost.t, boost.v, boost.n);
    if (bs.max > 3.5 && bs.max < 45) {
      const v = new Float64Array(boost.n);
      for (let i = 0; i < boost.n; i++) v[i] = boost.v[i] / 14.503774;
      boostFix = { from: 'psi', max: bs.max };
      boost.v = v; boost.converted = true; boost.srcUnit = 'psi (erkannt)';
      boost.label = 'Ladedruck (relativ)'; boost.short = 'Ladedruck';
      notices.push({
        kind: 'unit', level: 'info',
        title: 'Ladedruck-Einheit korrigiert',
        text: 'Der Ladedruck war als „bar“ ausgezeichnet, erreicht aber ' + fmt(bs.max, 2) +
              ' – physikalisch unmöglich. Die Werte sind offensichtlich psi und wurden nach bar umgerechnet (Spitze jetzt ' +
              fmt(bs.max / 14.503774, 2) + ' bar).'
      });
    }
  }

  /* --- Ist der „Ladedruck“ nur eine Linearabbildung der Motorlast? --- */
  {
    const b = metrics.get('boost'), l = metrics.get('load_abs') || metrics.get('load_calc');
    if (b && l && b.n > 100 && Math.abs(b.n - l.n) < b.n * 0.05) {
      const n = Math.min(b.n, l.n);
      let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0, k = 0;
      for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 3000))) {
        const x = l.v[i], y = b.v[i];
        if (!(x === x) || !(y === y)) continue;
        sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y; k++;
      }
      if (k > 50) {
        const num = k * sxy - sx * sy;
        const den = Math.sqrt((k * sxx - sx * sx) * (k * syy - sy * sy));
        const r = den > 0 ? num / den : 0;
        if (Math.abs(r) > 0.999) {
          boostR2 = r * r;
          notices.push({ kind: 'derived', level: 'warn',
            title: 'Ladedruck ist ein Rechenwert, keine Messung',
            text: 'Der Ladedruck folgt der Motorlast mit R² = ' + fmt(r * r, 4) + ' exakt linear – die App leitet ihn aus der Last ab, statt den Saugrohrdruck zu messen. Er trägt damit keine eigenständige Information und ist im Absolutbetrag nicht kalibriert. Für eine belastbare Ladedruckdiagnose die PID „Intake Manifold Absolute Pressure“ (0x0B) mitloggen.' });
        }
      }
    }
  }

  /* --- GPS-Track --- */
  const track = parsed.gps && parsed.gps.n > 2 ? cleanTrack(parsed.gps) : null;

  /* --- gemeinsames Zeitraster --- */
  const targetPts = 12000;
  const step = clamp(duration / targetPts, 0.1, 2);
  const N = Math.max(2, Math.floor(duration / step) + 1);
  const grid = new Float64Array(N);
  for (let i = 0; i < N; i++) grid[i] = t0 + i * step;

  const G = {};   // id -> Float64Array auf dem Raster (NaN = keine Daten)
  const coverage = {};
  for (const [id, m] of metrics) {
    const dtMed = medianDt(m.t, m.n);
    const maxAge = Math.max(dtMed * 3, 3);
    const arr = new Float64Array(N);
    let have = 0, j = 0;
    for (let i = 0; i < N; i++) {
      const t = grid[i];
      while (j + 1 < m.n && m.t[j + 1] <= t) j++;
      if (m.t[j] > t || t - m.t[j] > maxAge) arr[i] = NaN;
      else { arr[i] = m.v[j]; have++; }
    }
    G[id] = arr;
    coverage[id] = have / N;
  }

  /* --- Geschwindigkeit: OBD > GPS-PID > aus Track abgeleitet --- */
  const speedMix = new Float64Array(N);
  const speedSrc = new Uint8Array(N);   // 0=keine 1=OBD 2=GPS-PID 3=Track
  let trackSpeed = null;
  if (track) {
    trackSpeed = new Float64Array(N);
    const sm = smooth(track.segSpeed, 5);
    for (let i = 0; i < N; i++) {
      const k = bisect(track.t, grid[i]);
      trackSpeed[i] = (k >= 0 && grid[i] - track.t[k] < 8) ? sm[Math.min(k + 1, track.n - 1)] : NaN;
    }
  }
  for (let i = 0; i < N; i++) {
    const a = G.speed ? G.speed[i] : NaN, b = G.speed_gps ? G.speed_gps[i] : NaN,
          c = trackSpeed ? trackSpeed[i] : NaN;
    if (a === a) { speedMix[i] = a; speedSrc[i] = 1; }
    else if (b === b) { speedMix[i] = b; speedSrc[i] = 2; }
    else if (c === c) { speedMix[i] = c; speedSrc[i] = 3; }
    else { speedMix[i] = NaN; speedSrc[i] = 0; }
  }
  G.speed_mix = speedMix;

  /* --- abgeleitete Metriken auf dem Raster --- */
  const derived = [];
  const addDerived = (id, label, short, unit, dec, group, color, arr, desc) => {
    if (!arr) return;
    let any = false; for (let i = 0; i < N; i++) if (arr[i] === arr[i]) { any = true; break; }
    if (!any) return;
    G[id] = arr;
    const dm = { id, label, short: short || label, unit, decimals: dec, group: group || 'calc',
                 color, derived: true, desc, t: grid, v: arr, n: N, agg: 'inst' };
    metrics.set(id, dm); derived.push(dm);
    coverage[id] = arr.reduce((a, x) => a + (x === x ? 1 : 0), 0) / N;
  };
  const mk = fn => { const a = new Float64Array(N); for (let i = 0; i < N; i++) a[i] = fn(i); return a; };

  if (G.speed || G.speed_gps || trackSpeed)
    addDerived('speed_mix', 'Geschwindigkeit (kombiniert)', 'Tempo', 'km/h', 0, 'drive', '#29b6f6', speedMix,
      'OBD-Geschwindigkeit, ergänzt durch GPS wo die OBD-Daten fehlen.');
  if (G.cac_b1 && G.cac_b2) {
    addDerived('cac_delta', 'Ladelufttemperatur Δ Bank 1↔2', 'ΔLLK B1/B2', 'K', 1, 'calc', '#f06292',
      mk(i => G.cac_b1[i] - G.cac_b2[i]),
      'Differenz zwischen beiden Ladeluftkühler-Sensoren. Große Abweichungen deuten auf ungleiche Kühlung oder einen driftenden Sensor.');
    addDerived('cac_mean', 'Ladelufttemperatur ⌀ beider Bänke', '⌀ LLK', '°C', 0, 'calc', '#4db6ac',
      mk(i => (G.cac_b1[i] + G.cac_b2[i]) / 2));
  }
  const iatRef = G.ambient || G.iat;
  if (G.cac_mean && iatRef)
    addDerived('cac_over_amb', 'Ladeluft über Außentemperatur', 'ΔLLK/Außen', 'K', 1, 'calc', '#ff8a65',
      mk(i => G.cac_mean[i] - iatRef[i]),
      'Wie weit die Ladeluft nach dem Ladeluftkühler über der Außentemperatur liegt – das Maß für die Kühlerleistung.');
  if (G.ltft_b1 && G.ltft_b2) {
    addDerived('ltft_delta', 'Gemischkorrektur Δ Bank 1↔2', 'ΔLTFT', '%', 2, 'calc', '#ba68c8',
      mk(i => G.ltft_b1[i] - G.ltft_b2[i]),
      'Unterschied der Langzeit-Gemischkorrektur beider Bänke. Ein einseitiger Fehler (Falschluft, Injektor, Sonde) zeigt sich hier.');
    addDerived('ltft_mean', 'Gemischkorrektur ⌀', '⌀ LTFT', '%', 2, 'calc', '#ce93d8',
      mk(i => (G.ltft_b1[i] + G.ltft_b2[i]) / 2));
  }
  if (G.stft_b1 && G.ltft_b1)
    addDerived('trim_total_b1', 'Gesamtkorrektur Bank 1', 'Σ Trim B1', '%', 2, 'calc', '#ffd54f',
      mk(i => G.stft_b1[i] + G.ltft_b1[i]));
  if (G.power) {
    addDerived('power_kw', 'Motorleistung in kW', 'Leistung (kW)', 'kW', 0, 'calc', '#ec407a',
      mk(i => G.power[i] * 0.7354988));
    const pk = metrics.get('power_kw'); if (pk) pk.aux = true;   // im Auswahlmenü ausgeblendet
  }
  if (G.power && G.rpm)
    addDerived('torque_est', 'Drehmoment (geschätzt)', 'Drehmoment', 'Nm', 0, 'calc', '#ab47bc',
      mk(i => { const r = G.rpm[i]; return r > 500 ? (G.power[i] * 0.7354988) * 9549 / r : NaN; }),
      'Aus Leistung und Drehzahl gerechnet: M = P[kW] · 9549 / n. Nur so genau wie die Leistungsschätzung der App.');
  if (G.fuel_rate && G.speed_mix)
    addDerived('cons_calc', 'Verbrauch (berechnet)', 'Verbrauch', 'L/100km', 1, 'calc', '#a1887f',
      mk(i => { const s = speedMix[i]; return s > 5 ? G.fuel_rate[i] / s * 100 : NaN; }),
      'Kraftstofffluss geteilt durch Geschwindigkeit. Unter 5 km/h nicht definiert – deshalb keine absurden Spitzenwerte.');
  if (G.rpm && G.speed_mix)
    addDerived('gear_ratio', 'Drehzahl je km/h', 'n/v', 'rpm/(km/h)', 1, 'calc', '#90a4ae',
      mk(i => { const s = speedMix[i]; return s > 15 && G.rpm[i] > 700 ? G.rpm[i] / s : NaN; }),
      'Verhältnis Drehzahl zu Geschwindigkeit – daraus lässt sich der eingelegte Gang ableiten.');
  if (track && track.alt) {
    const altG = new Float64Array(N);
    const altS = smooth(track.alt, 9);
    for (let i = 0; i < N; i++) { const k = bisect(track.t, grid[i]); altG[i] = k >= 0 ? altS[k] : NaN; }
    addDerived('alt_smooth', 'Höhe (geglättet)', 'Höhe', 'm', 1, 'calc', '#a5d6a7', altG);
  }
  if (G.accel === undefined && G.speed_mix) {
    const acc = new Float64Array(N);
    const sp = smooth(speedMix, 5);
    for (let i = 0; i < N; i++) {
      if (i === 0 || i === N - 1) { acc[i] = NaN; continue; }
      const dv = (sp[i + 1] - sp[i - 1]) / 3.6, dt = grid[i + 1] - grid[i - 1];
      acc[i] = dt > 0 ? dv / dt / 9.80665 : NaN;
    }
    addDerived('accel', 'Längsbeschleunigung (aus v)', 'Beschl.', 'g', 3, 'drive', '#9ccc65', acc);
  }

  /* --- Statistik je Metrik --- */
  const stats = {};
  for (const [id, m] of metrics) {
    if (m.derived) {
      const t = [], v = [];
      for (let i = 0; i < N; i++) if (m.v[i] === m.v[i]) { t.push(grid[i]); v.push(m.v[i]); }
      stats[id] = v.length ? seriesStats(Float64Array.from(t), Float64Array.from(v), v.length) : null;
    } else stats[id] = seriesStats(m.t, m.v, m.n);
  }

  const ds = {
    parsed, meta: parsed.meta, metrics, stats, grid, G, N, step, t0, t1, duration,
    track, coverage, speedSrc, notices, scoped: map.scoped, profile,
    boostDerived: boostR2 > 0.998, boostR2
  };
  computeTrip(ds);
  computePhases(ds);
  computeEvents(ds);
  return ds;
}

/* ---------- Fahrt-Kennzahlen ---------- */
function computeTrip(ds) {
  const { G, grid, N, step, stats, track, metrics } = ds;
  const sp = G.speed_mix;
  const T = {};
  T.duration = ds.duration;

  let moving = 0, idle = 0, stopped = 0, distInt = 0, known = 0, engineOn = 0;
  for (let i = 0; i < N; i++) {
    const s = sp ? sp[i] : NaN;
    if (s === s) {
      known += step;
      if (s > 1.5) { moving += step; distInt += s / 3.6 * step; }
      else { stopped += step; if (G.rpm && G.rpm[i] > 300) idle += step; }
    }
    if (G.rpm && G.rpm[i] > 300) engineOn += step;
  }
  T.movingTime = moving; T.stoppedTime = stopped; T.idleTime = idle;
  T.knownTime = known; T.unknownTime = ds.duration - known; T.engineOnTime = engineOn;
  T.movingShare = known > 0 ? moving / known : 0;

  /* Strecke: bevorzugt GPS-Track, sonst Integration, sonst OBD-Zähler */
  const obdDist = stats.distance ? stats.distance.max - stats.distance.min : NaN;
  T.distGps = track ? track.totalDist / 1000 : NaN;
  T.distInt = distInt / 1000;
  T.distObd = obdDist;
  T.dist = isFinite(T.distGps) && T.distGps > 0.2 ? T.distGps
         : isFinite(T.distInt) && T.distInt > 0.2 ? T.distInt : obdDist;
  T.distSource = T.dist === T.distGps ? 'GPS' : T.dist === T.distInt ? 'integriert' : 'OBD';
  T.gapDist = track ? track.gapDist / 1000 : 0;

  T.speedMax = stats.speed_mix ? stats.speed_mix.max : NaN;
  T.speedAvgMoving = moving > 0 ? (distInt / moving) * 3.6 : NaN;
  T.speedAvgTotal = ds.duration > 0 ? (T.dist * 1000 / ds.duration) * 3.6 : NaN;
  if (!isFinite(T.speedAvgMoving) && isFinite(T.dist)) T.speedAvgMoving = T.speedAvgTotal;

  /* Verbrauch */
  const fu = stats.fuel_used;
  T.fuelUsed = fu ? fu.max - fu.min : NaN;
  if (!isFinite(T.fuelUsed) && G.fuel_rate) {
    let l = 0; for (let i = 0; i < N; i++) if (G.fuel_rate[i] === G.fuel_rate[i]) l += G.fuel_rate[i] / 3600 * step;
    T.fuelUsed = l; T.fuelEstimated = true;
  }
  T.consAvg = isFinite(T.fuelUsed) && T.dist > 0.2 ? T.fuelUsed / T.dist * 100 : NaN;
  const fc = stats.fuel_cost;
  T.cost = fc ? fc.max - fc.min : NaN;
  T.pricePerL = isFinite(T.cost) && T.fuelUsed > 0 ? T.cost / T.fuelUsed : NaN;
  T.co2 = isFinite(T.fuelUsed) ? T.fuelUsed * (CO2_PER_L[(ds.profile && ds.profile.fuel) || 'petrol'] || 2.37) : NaN;
  T.co2PerKm = isFinite(T.co2) && T.dist > 0.2 ? T.co2 * 1000 / T.dist : NaN;

  /* Motor */
  T.rpmMax = stats.rpm ? stats.rpm.max : NaN;
  T.rpmAvg = stats.rpm ? stats.rpm.meanW : NaN;
  T.powerMax = stats.power ? stats.power.max : NaN;
  T.boostMax = stats.boost ? stats.boost.max : NaN;
  T.loadMax = stats.load_abs ? stats.load_abs.max : (stats.load_calc ? stats.load_calc.max : NaN);
  T.coolantMax = stats.coolant ? stats.coolant.max : NaN;

  /* Zeitanteile */
  const share = (arr, pred) => {
    if (!arr) return NaN;
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) if (arr[i] === arr[i]) { b += step; if (pred(arr[i], i)) a += step; }
    return b > 0 ? a / b : NaN;
  };
  T.timeHighRpm = share(G.rpm, v => v > 4000);
  T.timeOver3k   = share(G.rpm, v => v > 3000);
  const wot = wotSignal(ds);
  T.wotShare = wot ? share(wot.arr, v => v >= wot.thr) : NaN;
  T.wotSignal = wot ? wot.label : null;
  T.coastShare = G.fuel_rate && G.rpm
    ? share(G.fuel_rate, (v, i) => v < coastThreshold(ds) && G.rpm[i] > 1000 && sp && sp[i] > 5) : NaN;
  T.brakeShare = G.accel ? share(G.accel, v => v < -0.08) : NaN;

  /* Höhenmeter */
  if (track && track.alt && track.n > 5) {
    const a = smooth(track.alt, 11);
    let up = 0, down = 0;
    for (let i = 1; i < track.n; i++) { const d = a[i] - a[i - 1]; if (d > 0.15) up += d; else if (d < -0.15) down -= d; }
    T.ascent = up; T.descent = down;
    T.altMin = Math.min.apply(null, Array.from(a)); T.altMax = Math.max.apply(null, Array.from(a));
  }

  /* Warmlauf */
  if (G.coolant) {
    let start = NaN, reached = NaN;
    for (let i = 0; i < N; i++) if (G.coolant[i] === G.coolant[i]) { start = grid[i]; break; }
    const target = 85;
    for (let i = 0; i < N; i++) if (G.coolant[i] >= target) { reached = grid[i]; break; }
    for (let i = 0; i < N; i++) if (G.coolant[i] === G.coolant[i]) { T.coolantStart = G.coolant[i]; break; }
    T.startedWarm = T.coolantStart >= 70;
    T.warmupTime = (!T.startedWarm && isFinite(start) && isFinite(reached)) ? reached - start : NaN;
  }
  ds.trip = T;
}

/* Wählt das beste Volllast-Signal und eine dazu passende Schwelle.
   Fahrpedal-PIDs sind oft nicht auf 100 % skaliert – deshalb adaptiv. */
function wotSignal(ds) {
  const { G, stats } = ds;
  if (G.load_abs && stats.load_abs && stats.load_abs.max > 110)
    return { arr: G.load_abs, thr: 140, label: 'Absolute Motorlast ≥ 140 %', id: 'load_abs' };
  for (const id of ['pedal', 'throttle', 'load_calc', 'load_abs']) {
    const s = stats[id];
    if (!G[id] || !s) continue;
    const thr = s.max >= 90 ? 80 : Math.max(s.p95, s.max * 0.85);
    return { arr: G[id], thr, label: (METRIC_BY_ID[id] ? METRIC_BY_ID[id].label : id) + ' ≥ ' + fmt(thr, 0) + ' %', id };
  }
  return null;
}
function coastThreshold(ds) {
  const s = ds.stats.fuel_rate;
  return s ? Math.max(0.2, s.p05 + 0.05) : 0.25;
}

/* ---------- Fahrphasen ---------- */
const PHASES = [
  { id: 'stand',  label: 'Stillstand',      color: '#6b7280' },
  { id: 'accel',  label: 'Beschleunigung',  color: '#ef4444' },
  { id: 'cruise', label: 'Konstantfahrt',   color: '#22c55e' },
  { id: 'coast',  label: 'Schubbetrieb',    color: '#3b82f6' },
  { id: 'brake',  label: 'Verzögerung',     color: '#f59e0b' }
];
function computePhases(ds) {
  const { G, N, step, grid } = ds;
  const sp = G.speed_mix, acc = G.accel, fr = G.fuel_rate, rpm = G.rpm;
  const coastThr = coastThreshold(ds);
  const ph = new Array(N).fill(null);
  const time = {}; PHASES.forEach(p => time[p.id] = 0);
  for (let i = 0; i < N; i++) {
    const s = sp ? sp[i] : NaN;
    let a = acc ? acc[i] : NaN;
    if (!(a === a) && sp && i > 0 && i < N - 1) {
      const dv = (sp[i + 1] - sp[i - 1]) / 3.6, dt = grid[i + 1] - grid[i - 1];
      a = dt > 0 ? dv / dt / 9.80665 : NaN;
    }
    let id = null;
    if (s === s && s <= 1.5) id = 'stand';
    else if (s === s) {
      const coasting = fr && fr[i] === fr[i] && fr[i] < coastThr && rpm && rpm[i] > 1000;
      if (a === a && a < -0.05) id = coasting ? 'coast' : 'brake';
      else if (coasting) id = 'coast';
      else if (a === a && a > 0.04) id = 'accel';
      else id = 'cruise';
    }
    ph[i] = id;
    if (id) time[id] += step;
  }
  // Segmente zusammenfassen
  const segs = [];
  let cur = null;
  for (let i = 0; i < N; i++) {
    if (ph[i] !== (cur && cur.id)) { if (cur) segs.push(cur); cur = ph[i] ? { id: ph[i], i0: i, i1: i } : null; }
    else if (cur) cur.i1 = i;
  }
  if (cur) segs.push(cur);
  ds.phases = { per: ph, time, segs: segs.filter(s => (s.i1 - s.i0) * step > 0.8), defs: PHASES };
}

/* ---------- Events: Stopps, Volllast, Sprints ---------- */
function computeEvents(ds) {
  const { G, grid, N, step, stats } = ds;
  const sp = G.speed_mix;
  const ev = { stops: [], wot: [], sprints: [], knock: [] };

  /* Stopps */
  if (sp) {
    let i = 0;
    while (i < N) {
      if (sp[i] === sp[i] && sp[i] <= 1.5) {
        let j = i; while (j + 1 < N && sp[j + 1] === sp[j + 1] && sp[j + 1] <= 1.5) j++;
        const dur = (j - i + 1) * step;
        if (dur >= 3) ev.stops.push({ i0: i, i1: j, t0: grid[i], dur });
        i = j + 1;
      } else i++;
    }
  }

  /* Volllast-Phasen */
  const wsig = wotSignal(ds);
  const wotSig = wsig && wsig.arr, wotThr = wsig ? wsig.thr : 0;
  if (wotSig) {
    let i = 0;
    while (i < N) {
      if (wotSig[i] >= wotThr) {
        let j = i; while (j + 1 < N && wotSig[j + 1] >= wotThr * 0.8) j++;
        const dur = (j - i + 1) * step;
        if (dur >= 1.0) {
          const seg = { i0: i, i1: j, t0: grid[i], dur };
          seg.rpm0 = G.rpm ? G.rpm[i] : NaN;
          seg.rpmMax = -Infinity; seg.boostMax = -Infinity; seg.powerMax = -Infinity;
          seg.timingMin = Infinity; seg.speed0 = sp ? sp[i] : NaN; seg.speed1 = sp ? sp[j] : NaN;
          seg.cacMax = -Infinity;
          for (let k = i; k <= j; k++) {
            if (G.rpm && G.rpm[k] > seg.rpmMax) seg.rpmMax = G.rpm[k];
            if (G.boost && G.boost[k] > seg.boostMax) seg.boostMax = G.boost[k];
            if (G.power && G.power[k] > seg.powerMax) seg.powerMax = G.power[k];
            if (G.timing && G.timing[k] < seg.timingMin) seg.timingMin = G.timing[k];
            if (G.cac_mean && G.cac_mean[k] > seg.cacMax) seg.cacMax = G.cac_mean[k];
          }
          ev.wot.push(seg);
        }
        i = j + 1;
      } else i++;
    }
    ev.wot.sort((a, b) => (b.rpmMax - b.rpm0) - (a.rpmMax - a.rpm0));
  }

  /* Beschleunigungsmessungen */
  if (sp) {
    const spS = smooth(sp, 3);
    const targets = [[0, 100], [50, 100], [60, 100], [80, 120], [100, 200]];
    for (const [from, to] of targets) {
      let best = null;
      for (let i = 0; i < N; i++) {
        if (!(spS[i] === spS[i]) || spS[i] > from + (from === 0 ? 1.5 : 1)) continue;
        if (from === 0 && spS[i] > 2) continue;
        // ab hier muss die Geschwindigkeit monoton bis `to` steigen
        let j = i, ok = false, dropped = 0;
        while (j + 1 < N) {
          j++;
          if (!(spS[j] === spS[j])) { ok = false; break; }
          if (spS[j] < spS[j - 1] - 1.5) { dropped++; if (dropped > 2) { ok = false; break; } }
          if (spS[j] >= to) { ok = true; break; }
          if ((j - i) * step > 60) break;
        }
        if (ok) {
          // Plateaus aussortieren: eine echte Messfahrt hat keine Phase ohne Zuwachs
          let plateau = 0, worst = 0;
          for (let k = Math.max(i + 1, 1); k <= j; k++) {
            if (spS[k] <= from) continue;
            if (spS[k] - spS[k - 1] < 0.05) { plateau += step; if (plateau > worst) worst = plateau; }
            else plateau = 0;
          }
          const tA = interpCross(grid, spS, i, j, from), tB = interpCross(grid, spS, i, j, to);
          const dur = tB - tA;
          const avgA = ((to - from) / 3.6) / dur;          // m/s²
          if (dur > 0.5 && worst < 1.5 && avgA > 1.1 && (!best || dur < best.dur))
            best = { from, to, dur, t0: tA, i0: i, i1: j, avgA, plateau: worst };
          i = j;
        }
      }
      if (best) ev.sprints.push(best);
    }
  }

  /* Zündwinkel-Rücknahme unter Last (Klopfverdacht) */
  if (G.timing && (G.load_abs || G.load_calc)) {
    const load = G.load_abs || G.load_calc;
    const thr = G.load_abs ? 120 : 70;
    let i = 0;
    while (i < N) {
      if (load[i] >= thr && G.timing[i] < 0) {
        let j = i; while (j + 1 < N && load[j + 1] >= thr * 0.85 && G.timing[j + 1] < 2) j++;
        const dur = (j - i + 1) * step;
        let tmin = Infinity, rmax = -Infinity;
        for (let k = i; k <= j; k++) { if (G.timing[k] < tmin) tmin = G.timing[k]; if (G.rpm && G.rpm[k] > rmax) rmax = G.rpm[k]; }
        if (dur >= 0.4) ev.knock.push({ i0: i, i1: j, t0: grid[i], dur, timingMin: tmin, rpmMax: rmax });
        i = j + 1;
      } else i++;
    }
  }
  ds.events = ev;
}
function interpCross(grid, v, i0, i1, target) {
  for (let i = Math.max(1, i0); i <= i1; i++) {
    if (v[i - 1] < target && v[i] >= target) {
      const f = (target - v[i - 1]) / (v[i] - v[i - 1]);
      return grid[i - 1] + f * (grid[i] - grid[i - 1]);
    }
  }
  return grid[i0];
}

/* ---------- Histogramm & 2D-Dichte ---------- */
function histogram(arr, bins, lo, hi, weights, step) {
  const n = arr.length;
  if (!isFinite(lo) || !isFinite(hi)) {
    lo = Infinity; hi = -Infinity;
    for (let i = 0; i < n; i++) { const v = arr[i]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  }
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return null;
  const nb = niceTicks(lo, hi, bins);
  const w = (hi - lo) / bins;
  const counts = new Float64Array(bins);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const v = arr[i]; if (!(v === v)) continue;
    let b = Math.floor((v - lo) / w); if (b < 0) b = 0; if (b >= bins) b = bins - 1;
    const add = weights ? weights[i] : (step || 1);
    counts[b] += add; total += add;
  }
  return { counts, lo, hi, w, bins, total };
}

function density2d(xs, ys, nx, ny, xlo, xhi, ylo, yhi, step) {
  const n = Math.min(xs.length, ys.length);
  const cells = new Float64Array(nx * ny);
  let max = 0, total = 0;
  const dx = (xhi - xlo) / nx, dy = (yhi - ylo) / ny;
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i];
    if (!(x === x) || !(y === y)) continue;
    let cx = Math.floor((x - xlo) / dx), cy = Math.floor((y - ylo) / dy);
    if (cx < 0 || cy < 0 || cx >= nx || cy >= ny) continue;
    const k = cy * nx + cx;
    cells[k] += step || 1; total += step || 1;
    if (cells[k] > max) max = cells[k];
  }
  return { cells, nx, ny, xlo, xhi, ylo, yhi, dx, dy, max, total };
}

/* Pearson-Korrelation zweier Rasterreihen */
function pearson(a, b) {
  let n = 0, sa = 0, sb = 0;
  const N = Math.min(a.length, b.length);
  for (let i = 0; i < N; i++) if (a[i] === a[i] && b[i] === b[i]) { n++; sa += a[i]; sb += b[i]; }
  if (n < 10) return NaN;
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < N; i++) if (a[i] === a[i] && b[i] === b[i]) {
    const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}


/* ---------- Ganganalyse: Cluster in log(rpm/v) ---------- */
function computeGears(ds, rollCircumM) {
  const { G, N, grid, step } = ds;
  const rpm = G.rpm, sp = G.speed_mix;
  if (!rpm || !sp) return null;
  const ks = [], idxs = [];
  for (let i = 0; i < N; i++) {
    const v = sp[i], r = rpm[i];
    if (!(v === v) || !(r === r) || v < 15 || r < 900) continue;
    // Schaltvorgänge/Schlupf aussortieren: Drehzahl muss lokal stabil sein
    if (i > 1 && i < N - 2) {
      const dr = Math.abs(rpm[i + 1] - rpm[i - 1]) / Math.max(1, grid[i + 1] - grid[i - 1]);
      if (dr > 1400) continue;
    }
    ks.push(r / v); idxs.push(i);
  }
  if (ks.length < 120) return null;
  const logs = ks.map(Math.log);
  let lo = Infinity, hi = -Infinity;
  for (const x of logs) { if (x < lo) lo = x; if (x > hi) hi = x; }
  const NB = 320, w = (hi - lo) / NB;
  const h = new Float64Array(NB);
  for (const x of logs) h[Math.min(NB - 1, Math.max(0, Math.floor((x - lo) / w)))]++;
  const hs = smooth(h, 5);
  const total = ks.length;
  const peaks = [];
  for (let i = 2; i < NB - 2; i++) {
    if (hs[i] >= hs[i-1] && hs[i] >= hs[i+1] && hs[i] > hs[i-2] && hs[i] > hs[i+2] &&
        hs[i] / total > 0.0035) peaks.push({ bin: i, val: hs[i], k: Math.exp(lo + (i + .5) * w) });
  }
  // dicht beieinander liegende Peaks verschmelzen (< 6 % Abstand)
  peaks.sort((a, b) => a.k - b.k);
  const merged = [];
  for (const p of peaks) {
    const last = merged[merged.length - 1];
    if (last && (p.k - last.k) / last.k < 0.06) { if (p.val > last.val) merged[merged.length - 1] = p; }
    else merged.push(p);
  }
  if (merged.length < 2) return null;
  // Zuordnung + Median je Cluster
  const groups = merged.map(() => []);
  const assign = new Int8Array(N).fill(-1);
  let assigned = 0;
  for (let j = 0; j < ks.length; j++) {
    let best = -1, bd = Infinity;
    for (let g = 0; g < merged.length; g++) { const d = Math.abs(ks[j] - merged[g].k) / merged[g].k; if (d < bd) { bd = d; best = g; } }
    if (bd < 0.045) { groups[best].push({ k: ks[j], i: idxs[j] }); assign[idxs[j]] = best; assigned++; }
  }
  const gears = [];
  groups.forEach((g, gi) => {
    if (g.length < 12) return;
    const kk = g.map(x => x.k).sort((a, b) => a - b);
    const kMed = quantileSorted(kk, .5);
    let vMin = Infinity, vMax = -Infinity, rMax = -Infinity;
    for (const x of g) { const v = sp[x.i], r = rpm[x.i]; if (v < vMin) vMin = v; if (v > vMax) vMax = v; if (r > rMax) rMax = r; }
    gears.push({ idx: gi, k: kMed, kmhPer1000: 1000 / kMed, samples: g.length,
                 time: g.length * step, vMin, vMax, rpmMax: rMax,
                 ratio: rollCircumM ? (60 * rollCircumM) / (1000 / kMed) : null });
  });
  gears.sort((a, b) => b.k - a.k);
  gears.forEach((g, i) => { g.gear = i + 1; g.label = 'G' + (i + 1); });
  const remap = {};
  gears.forEach(g => remap[g.idx] = g.gear);
  const spread = [];
  for (let i = 1; i < gears.length; i++) spread.push(gears[i - 1].k / gears[i].k);
  return { gears, assign, remap, coverage: assigned / Math.max(1, ks.length),
           usable: ks.length, spread, hist: { h: hs, lo, w, NB } };
}
