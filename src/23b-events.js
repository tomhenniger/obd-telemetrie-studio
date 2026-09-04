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
