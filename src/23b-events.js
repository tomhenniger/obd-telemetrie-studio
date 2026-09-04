/* ===== Ereignisse, Anmerkungen, Sollbänder =========================
   Ereignisse sind Zeitpunkte, die auf Karte und Verläufen als Marker
   erscheinen: Stopps, Volllastzüge, Klopfereignisse, starke Bremsungen,
   Warmlauf-Ende, gemessene Sprints. Anmerkungen sind Marker des Nutzers.
   Sollbänder sind die grünen Bereiche, die der Verlauf einer Messgröße
   hinterlegt bekommt.
   ================================================================== */

const EVENT_KINDS = {
  stop:   { code: 'S', label: 'Stopp',          color: '#8a9099' },
  wot:    { code: 'V', label: 'Volllastzug',    color: '#ee6b5b' },
  sprint: { code: 'M', label: 'Messung',        color: '#e9b44c' },
  knock:  { code: 'K', label: 'Klopfregelung',  color: '#c9a0dc' },
  brake:  { code: 'B', label: 'Starke Bremsung',color: '#f0a06a' },
  warm:   { code: 'W', label: 'Betriebswarm',   color: '#4fcf92' },
  note:   { code: 'N', label: 'Anmerkung',      color: '#ecebe4' }
};

/* Ereignisse einer Fahrt aus den bereits erkannten Segmenten plus zwei eigenen Erkennungen */
function driveEvents(ds) {
  const out = [];
  if (!ds || !ds.grid) return out;
  const grid = ds.grid, G = ds.G || {}, ev = ds.events || {};
  const xf = typeof timeFormatterFor === 'function' ? timeFormatterFor(ds) : (v => String(Math.round(v)));
  (ev.stops || []).forEach(s => out.push({ kind: 'stop', t: s.t0, i: s.i0, label: 'Stopp ' + fmtDur(s.dur), detail: 'Stillstand ' + fmtDur(s.dur) }));
  (ev.wot || []).forEach(s => out.push({ kind: 'wot', t: grid[s.i0], i: s.i0,
    label: 'Volllast' + (isFinite(s.rpmMax) && s.rpmMax > 0 ? ' bis ' + fmt(s.rpmMax, 0) + ' min⁻¹' : ''),
    detail: (isFinite(s.speedMax) && s.speedMax > 0 ? 'bis ' + fmt(s.speedMax, 0) + ' km/h' : '') + (isFinite(s.boostMax) && s.boostMax > 0 ? ' · Ladedruck ' + fmt(s.boostMax, 2) + ' bar' : '') }));
  (ev.sprints || []).forEach(s => out.push({ kind: 'sprint', t: s.t0 !== undefined ? s.t0 : grid[s.i0], i: s.i0,
    label: (s.from !== undefined ? s.from + '–' + s.to + ' km/h' : 'Sprint') + (isFinite(s.dur) ? ' in ' + fmt(s.dur, 2) + ' s' : ''), detail: '' }));
  (ev.knock || []).forEach(s => out.push({ kind: 'knock', t: s.t0, i: s.i0, label: 'Klopfregelung ' + fmt(s.drop, 1) + '°',
    detail: 'Zündwinkel bis ' + fmt(s.timingMin, 1) + '° bei ' + fmt(s.rpmMax, 0) + ' min⁻¹' }));
  /* Starke Bremsungen: Längsbeschleunigung unter -0,3 g für mindestens eine Sekunde */
  if (G.accel && G.speed_mix) {
    const step = grid.length > 1 ? grid[1] - grid[0] : 1;
    let i = 0;
    while (i < grid.length) {
      if (G.accel[i] < -0.3) {
        let j = i, mn = 0, mi = i;
        while (j < grid.length && G.accel[j] < -0.2) { if (G.accel[j] < mn) { mn = G.accel[j]; mi = j; } j++; }
        if ((j - i) * step >= 1) out.push({ kind: 'brake', t: grid[mi], i: mi, label: 'Bremsung ' + fmt(mn, 2) + ' g',
          detail: 'aus ' + fmt(G.speed_mix[i], 0) + ' km/h' + (G.speed_mix[j - 1] === G.speed_mix[j - 1] ? ' auf ' + fmt(G.speed_mix[j - 1], 0) : '') });
        i = j;
      } else i++;
    }
  }
  /* Warmlauf-Ende: Kühlmittel erreicht 80 °C, wenn es unter 60 °C gestartet ist */
  if (G.coolant) {
    let start = NaN;
    for (let i = 0; i < grid.length; i++) if (G.coolant[i] === G.coolant[i]) { start = G.coolant[i]; break; }
    if (start < 60) for (let i = 0; i < grid.length; i++) if (G.coolant[i] >= 80) {
      out.push({ kind: 'warm', t: grid[i], i, label: 'Betriebswarm nach ' + fmtDur(grid[i] - ds.t0), detail: 'Kühlmittel 80 °C, Start bei ' + fmt(start, 0) + ' °C' }); break;
    }
  }
  out.sort((a, b) => a.t - b.t);
  out.forEach(e => { e.time = xf(e.t); e.code = EVENT_KINDS[e.kind].code; e.color = EVENT_KINDS[e.kind].color; });
  return out;
}

/* Sollbänder je Messgröße: [lo, hi] oder null. Werksangaben aus dem Profil, sonst Klassenwerte. */
function specBandFor(id, profile) {
  const P = (profile && profile.specs) || {};
  switch (id) {
    case 'coolant':    return P.coolantGreen || [85, 105];
    case 'oil_temp':   return P.oilGreen || [85, 125];
    case 'trans_temp': return [70, 105];
    case 'ltft_b1': case 'ltft_b2': case 'ltft_mean': return [-5, 5];
    case 'stft_b1': case 'stft_b2': return [-8, 8];
    case 'batt':       return [13.4, 14.8];
    case 'cat_temp':   return [400, 850];
    case 'lambda':     return [0.97, 1.03];
    default: return null;
  }
}

/* Anmerkungen: [{ t, text }] je Fahrt, im Browser gespeichert */
function notesKey(driveIdStr) { return 'notes:' + driveIdStr; }
function sortNotes(list) { return (list || []).filter(n => n && isFinite(n.t) && n.text).sort((a, b) => a.t - b.t); }

/* ===== Wiederkehrende Abschnitte ====================================
   Findet Stellen, an denen dieselbe Strecke mehrfach befahren wurde:
   Route in Zellen rastern, wiederholte Zellenfolgen suchen und die
   Durchfahrten vergleichen (Zeit, Tempo, Verbrauch).
   ================================================================== */
function repeatSegments(tr, opts) {
  opts = opts || {};
  const cellM = opts.cellM || 60;                 // Rasterweite in Metern
  const minLen = opts.minLenM || 500;             // Mindestlänge eines Abschnitts
  const out = [];
  if (!tr || tr.n < 20 || !tr.dist) return out;
  const cos = Math.cos(tr.lat[0] * Math.PI / 180);
  const key = i => Math.round(tr.lat[i] * 110540 / cellM) + ':' + Math.round(tr.lon[i] * 111320 * cos / cellM);
  /* Jede Zelle merkt sich, wann sie besucht wurde */
  const visits = new Map();
  for (let i = 0; i < tr.n; i++) {
    const k = key(i);
    let a = visits.get(k); if (!a) { a = []; visits.set(k, a); }
    /* Ein neuer Besuch zählt erst, wenn das Auto die Zelle verlassen hatte – gemessen
       an der gefahrenen Strecke, nicht am Index. Sonst ist der Wendepunkt einer
       Pendelfahrt nur ein Besuch, weil die Punkte dort direkt aufeinander folgen. */
    if (!a.length || tr.dist[i] - tr.dist[a[a.length - 1]] > cellM * 3) a.push(i);
  }
  /* Zellen mit mehreren Besuchen sind Kandidaten; benachbarte Wiederholungen zu Läufen bündeln */
  const repeated = [];
  for (let i = 0; i < tr.n; i++) if ((visits.get(key(i)) || []).length > 1) repeated.push(i);
  if (!repeated.length) return out;
  const runs = [];
  let start = repeated[0], prev = repeated[0];
  for (let x = 1; x < repeated.length; x++) {
    const i = repeated[x];
    if (i - prev > 5) { runs.push([start, prev]); start = i; }
    prev = i;
  }
  runs.push([start, prev]);
  /* Für jeden Lauf: die Durchfahrten über die Zellen der Mitte finden */
  for (const [a, b] of runs) {
    const lenM = tr.dist[b] - tr.dist[a];
    if (lenM < minLen) continue;
    /* Die Zelle mit den meisten Besuchen im Lauf verankert den Abschnitt */
    let mid = Math.floor((a + b) / 2), most = 0;
    for (let i = a; i <= b; i++) { const nv = (visits.get(key(i)) || []).length; if (nv > most) { most = nv; mid = i; } }
    const passes = (visits.get(key(mid)) || []).slice();
    if (passes.length < 2) continue;
    const half = lenM / 2;
    const laps = [];
    for (const p of passes) {
      let i0 = p, i1 = p;
      while (i0 > 0 && tr.dist[p] - tr.dist[i0] < half) i0--;
      while (i1 < tr.n - 1 && tr.dist[i1] - tr.dist[p] < half) i1++;
      const dt = tr.t[i1] - tr.t[i0], dd = tr.dist[i1] - tr.dist[i0];
      if (!(dt > 5) || !(dd > minLen * 0.6)) continue;
      laps.push({ i0, i1, t0: tr.t[i0], t1: tr.t[i1], dur: dt, dist: dd, kmh: dd / dt * 3.6 });
    }
    if (laps.length < 2) continue;
    laps.sort((x, y) => x.t0 - y.t0);
    const best = laps.reduce((m, l) => (l.dur < m.dur ? l : m), laps[0]);
    out.push({ lat: tr.lat[mid], lon: tr.lon[mid], lengthM: laps[0].dist, laps, best,
               spreadS: Math.max(...laps.map(l => l.dur)) - Math.min(...laps.map(l => l.dur)) });
  }
  out.sort((x, y) => y.laps.length - x.laps.length || y.lengthM - x.lengthM);
  return out.slice(0, opts.limit || 8);
}
