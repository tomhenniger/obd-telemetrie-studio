/* ============================================================
   Fahrzeugprofile + Diagnose-Engine
   Fünf Zustände je Regel: ok | warn | crit | missing | unklar
   ============================================================ */

const VEHICLE_PROFILES = [
{
  id: 'audi_s5_b85_cgwc',
  name: 'Audi S5 B8.5 · 3.0 TFSI (CGWC)',
  short: 'S5 B8.5 CGWC',
  engine: 'V6 90°, 24V DOHC, Roots-Kompressor Eaton TVS 1320',
  aspiration: 'kompressor', fuel: 'petrol',
  specs: {
    displacement: 2995, bore: 84.5, stroke: 89, compression: 10.5,
    powerPS: 333, powerKW: 245, powerRpm: [5500, 6500],
    torqueNm: 440, torqueRpm: [2900, 5300],
    redline: 7000, idleWarm: [620, 780], idleCold: [900, 1300],
    boostMaxBar: 0.80, boostWotGreen: [0.65, 0.90],
    coolantGreen: [85, 105], thermostat: 87,
    loadWotGreen: [150, 220], loadIdleGreen: [18, 42],
    fuelSpec: 'min. ROZ 95, empfohlen ROZ 98 (Super Plus)',
    oilSpec: 'VW 502 00 / 504 00 · 5W-40 bzw. 5W-30 · ≈ 6,8 L',
    injection: 'FSI-Direkteinspritzung, bis 150 bar',
    ecu: 'Simos 8.x',
    massKg: 1750, cw: 0.32, area: 2.16, cr: 0.012,
    consNEDC: 8.1, consUrban: 10.9, consExtra: 6.4, consReal: 13.7,
    co2NEDC: 190, accel0100: 4.9, vmax: 250,
    gearbox: '7-Gang S tronic (DL501)', tyre: '255/35 R19', rollCircum: 2.077,
    banks: 2, cacType: 'wasser'
  },
  weakSpots: [
    { t: 'Zusatz-Wasserpumpe des Ladeluft-Kreises (P190C-Familie)', s: 'LLK-Temperatur bleibt nach Volllast oben, kühlt im Teillast nicht zurück' },
    { t: 'Internes Leck der wassergekühlten LLK im Laderkäfig', s: 'Bank-Delta der Ladelufttemperatur dauerhaft > 6 K, Kühlmittelverlust ohne äußere Leckage' },
    { t: 'Kompressorriemen / Spanner', s: 'Volllast trotz Vollgas unter 130 % Last, Ladedruck bricht im Zug ein' },
    { t: 'Kohlenstoffablagerungen an den Einlassventilen (FSI, ab ~100.000 km)', s: 'Unruhiger Leerlauf (σ > 40 min⁻¹), erhöhte Leerlauf-Last, LTFT im Leerlauf höher als unter Last' },
    { t: 'Falschluft: Saugrohrdichtung, Ladeluftschläuche, Kurbelgehäuseentlüftung', s: 'LTFT im Leerlauf/Teillast deutlich höher als unter Volllast' },
    { t: 'Kennfeldthermostat / Kühlerlüfter', s: 'Kühlmittel-Plateau unter 82 °C oder Sägezahn über 105 °C' }
  ],
  extraPids: ['Short term fuel trim B1/B2', 'Intake manifold absolute pressure (0x0B)',
              'Fuel rail pressure (0x23/0x59)', 'Misfire count Cyl 1–6',
              'Intake air temperature (0x0F)', 'Engine oil temperature (0x5C)']
},
{
  id: 'generic_turbo', name: 'Generisch · Turbo-/Kompressor-Benziner', short: 'Turbo Benzin',
  engine: 'unbekannt', aspiration: 'turbo', fuel: 'petrol',
  specs: { redline: 6800, idleWarm: [600, 800], coolantGreen: [85, 108], loadWotGreen: [130, 220],
           boostWotGreen: [0.6, 1.6], banks: 2 }
},
{
  id: 'generic_na', name: 'Generisch · Saugmotor Benzin', short: 'Sauger Benzin',
  engine: 'unbekannt', aspiration: 'sauger', fuel: 'petrol',
  specs: { redline: 6800, idleWarm: [650, 850], coolantGreen: [80, 105], loadWotGreen: [85, 100], banks: 1 }
},
{
  id: 'generic_diesel', name: 'Generisch · Diesel', short: 'Diesel',
  engine: 'unbekannt', aspiration: 'turbo', fuel: 'diesel',
  specs: { redline: 5000, idleWarm: [700, 900], coolantGreen: [80, 100], loadWotGreen: [100, 220],
           boostWotGreen: [0.8, 2.2], banks: 1 }
}
];

function autoProfile(ds) {
  const s = ds.stats;
  const rpmMax = s.rpm ? s.rpm.max : 0;
  const hasTiming = !!s.timing;
  const loadMax = s.load_abs ? s.load_abs.max : (s.load_calc ? s.load_calc.max : 0);
  const twoBanks = !!(s.ltft_b2 || s.cac_b2 || s.stft_b2);
  if (twoBanks && s.cac_b1 && rpmMax > 5800 && loadMax > 170 && hasTiming) return 'audi_s5_b85_cgwc';
  if (!hasTiming && rpmMax < 5200) return 'generic_diesel';
  if (loadMax > 115) return 'generic_turbo';
  return 'generic_na';
}

/* ---------- Auswerte-Kontext ---------- */
function buildContext(ds, profile) {
  const { G, N, step, grid, stats } = ds;
  const P = profile.specs || {};
  const has = id => !!G[id];
  const mask = fn => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = fn(i) ? 1 : 0; return m; };
  const V = id => G[id];

  const coolant = V('coolant'), rpm = V('rpm'), load = V('load_abs') || V('load_calc'),
        sp = V('speed_mix'), pedal = V('pedal'), fr = V('fuel_rate');
  const loadIsAbs = !!V('load_abs');

  const warm  = mask(i => coolant ? coolant[i] >= 80 : (grid[i] - ds.t0) > 420);
  const engineOn = mask(i => rpm && rpm[i] > 300);
  // Schub: rpm hoch, Last niedrig  (bewusst NICHT über fuel_rate — die ist bei vielen Apps modelliert)
  const coast = mask(i => rpm && load && rpm[i] > 1400 && load[i] < (loadIsAbs ? 28 : 20));
  const wotThr = loadIsAbs ? 150 : 85;
  const wotRaw = mask(i => load && load[i] >= wotThr);
  // Volllast erst ab 1,0 s Dauer
  const wot = new Uint8Array(N);
  { let i = 0; while (i < N) { if (wotRaw[i]) { let j = i; while (j + 1 < N && wotRaw[j + 1]) j++;
      if ((j - i + 1) * step >= 1.0) for (let k = i; k <= j; k++) wot[k] = 1; i = j + 1; } else i++; } }
  const idle = mask(i => {
    if (!rpm || !(rpm[i] > 300) || !warm[i]) return false;
    if (sp) { if (!(sp[i] === sp[i]) || sp[i] > 1.5) return false; }        // NaN = unbekannt, nicht Leerlauf
    else if (rpm[i] > 1200) return false;
    if (pedal && pedal[i] > (stats.pedal ? stats.pedal.p05 + 6 : 20)) return false;
    return true;
  });
  /* Leerlauffenster bereinigen. Zwei Schritte, beide notwendig:
     1. Fenster unter 12 s ganz verwerfen – zu kurz für eine Aussage über die Laufruhe.
     2. Die ersten 5 s jedes Fensters verwerfen. Nach dem Anhalten fängt der Leerlaufregler die
        Drehzahl erst ein (Überschwinger bis 950 min⁻¹, Zündwinkel bis −17° Momenteneingriff).
        Wer diese Phase mitmisst, misst das Abbremsen, nicht die Laufruhe. */
  const idleSettle = Math.round(5 / step);
  { let i = 0; while (i < N) {
      if (idle[i]) { let j = i; while (j + 1 < N && idle[j + 1]) j++;
        const len = j - i + 1;
        if (len * step < 12) { for (let k = i; k <= j; k++) idle[k] = 0; }
        else { for (let k = i; k < Math.min(i + idleSettle, j + 1); k++) idle[k] = 0; }
        i = j + 1;
      } else i++; } }

  const partLoad = mask(i => load && sp && load[i] > 25 && load[i] < (loadIsAbs ? 90 : 70) && sp[i] > 30 && warm[i] && !coast[i]);
  const moving = mask(i => sp && sp[i] > 5);

  const agg = (id, m, kind) => {
    const a = V(id); if (!a) return NaN;
    const vals = [];
    let sum = 0, cnt = 0, mx = -Infinity, mn = Infinity;
    for (let i = 0; i < N; i++) {
      if (m && !m[i]) continue;
      const v = a[i]; if (!(v === v)) continue;
      vals.push(v); sum += v; cnt++;
      if (v > mx) mx = v; if (v < mn) mn = v;
    }
    if (!cnt) return NaN;
    if (kind === 'max') return mx;
    if (kind === 'min') return mn;
    if (kind === 'mean') return sum / cnt;
    if (kind === 'std') { const mu = sum / cnt; let s2 = 0; for (const v of vals) s2 += (v - mu) ** 2; return Math.sqrt(s2 / Math.max(1, cnt - 1)); }
    if (kind === 'count') return cnt;
    if (kind === 'p95' || kind === 'p05' || kind === 'median') {
      vals.sort((x, y) => x - y);
      return quantileSorted(vals, kind === 'p95' ? .95 : kind === 'p05' ? .05 : .5);
    }
    return sum / cnt;
  };
  const dur = m => { let d = 0; for (let i = 0; i < N; i++) if (m[i]) d += step; return d; };
  const combine = (...ms) => mask(i => ms.every(m => m[i]));
  const maskFn = fn => mask(fn);

  return { ds, profile, P, G, N, step, grid, stats, has, V, agg, dur, mask: maskFn, combine,
           masks: { warm, engineOn, coast, wot, idle, partLoad, moving }, loadIsAbs, wotThr };
}

/* ---------- Regelwerk ---------- */
const S = { OK: 'ok', WARN: 'warn', CRIT: 'crit', MISSING: 'missing', UNCLEAR: 'unklar' };

function band(v, green, yellow, higherIsWorse) {
  if (!isFinite(v)) return S.UNCLEAR;
  if (higherIsWorse) return v <= green ? S.OK : v <= yellow ? S.WARN : S.CRIT;
  return v >= green ? S.OK : v >= yellow ? S.WARN : S.CRIT;
}
function inRange(v, lo, hi, tolLo, tolHi) {
  if (!isFinite(v)) return S.UNCLEAR;
  if (v >= lo && v <= hi) return S.OK;
  if (v >= lo - tolLo && v <= hi + tolHi) return S.WARN;
  return S.CRIT;
}

const DIAG_RULES = [
/* ---------------- Kühlkreis ---------------- */
{
  id: 'coolant_operating', group: 'Kühlkreis', title: 'Kühlmitteltemperatur im Betrieb',
  requires: ['coolant'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const P = c.P.coolantGreen || [85, 105];
    const m = c.combine(c.masks.warm, c.masks.engineOn);
    const d = c.dur(m);
    if (d < 120) return { status: S.UNCLEAR, note: 'Zu wenig Betriebszeit im warmen Zustand (' + fmtDur(d) + ').' };
    const med = c.agg('coolant', m, 'median'), mx = c.agg('coolant', m, 'max'), mn = c.agg('coolant', m, 'min');
    let st = inRange(med, P[0], P[1], 5, 5);
    if (mx > 112) st = S.CRIT;
    return {
      status: st, value: med, unit: '°C', dec: 0,
      ref: P[0] + '–' + P[1] + ' °C', refLo: P[0], refHi: P[1],
      extra: [['Maximum', fmt(mx, 0) + ' °C'], ['Minimum (warm)', fmt(mn, 0) + ' °C'], ['Bewertete Zeit', fmtDur(d)]],
      text: st === S.OK
        ? 'Die Kühlmitteltemperatur hält im warmen Betrieb ein stabiles Plateau von ' + fmt(med, 0) + ' °C. Kennfeldthermostat, Wasserpumpe und Kühlerlüfter arbeiten unauffällig.'
        : med < P[0]
          ? 'Der Motor bleibt mit ' + fmt(med, 0) + ' °C unter dem Sollplateau. Typische Ursache: Thermostat hängt offen oder falsches Thermostat verbaut. Folge: mehr Verbrauch, stärkere Ventilverkokung, Ölverdünnung.'
          : 'Die Kühlmitteltemperatur liegt mit ' + fmt(med, 0) + ' °C über dem Sollband (Spitze ' + fmt(mx, 0) + ' °C). Kühlmittelstand, Entlüftung, Wasserpumpe und Lüfterlauf prüfen.',
      action: st === S.OK ? null : ['Thermostat und Temperaturgeber G62 prüfen', 'Kühlmittelstand und Entlüftung kontrollieren', 'Lüfterlauf per Stellglieddiagnose testen']
    };
  }
},
{
  id: 'coolant_warmup', group: 'Kühlkreis', title: 'Warmlaufverhalten',
  requires: ['coolant'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const co = c.V('coolant');
    let start = NaN, i0 = -1;
    for (let i = 0; i < c.N; i++) if (co[i] === co[i]) { start = co[i]; i0 = i; break; }
    if (!isFinite(start)) return { status: S.UNCLEAR, note: 'Keine Kühlmitteldaten.' };
    if (start >= 50) return { status: S.UNCLEAR,
      note: 'Der Motor war beim Aufzeichnungsstart bereits warm (' + fmt(start, 0) + ' °C) – das Warmlaufverhalten lässt sich aus dieser Fahrt nicht bewerten.' };
    let t85 = NaN;
    for (let i = i0; i < c.N; i++) if (co[i] >= 85) { t85 = c.grid[i] - c.grid[i0]; break; }
    if (!isFinite(t85)) return { status: S.CRIT, value: NaN,
      text: 'Der Motor hat in der gesamten Aufzeichnung nie 85 °C erreicht. Thermostat prüfen.' };
    const st = t85 < 360 ? S.OK : t85 < 600 ? S.WARN : S.CRIT;
    return { status: st, value: t85 / 60, unit: 'min', dec: 1, ref: '< 6 min', refLo: 0, refHi: 6,
      extra: [['Starttemperatur', fmt(start, 0) + ' °C']],
      text: 'Von ' + fmt(start, 0) + ' °C auf 85 °C in ' + fmtDur(t85) + '. ' +
            (st === S.OK ? 'Das entspricht einem intakten Thermostat.' : 'Ein deutlich verzögerter Warmlauf spricht für ein offen hängendes Thermostat.') }
  }
},
/* ---------------- Ladeluft ---------------- */
{
  id: 'cac_absolute', group: 'Ladeluft', title: 'Ladelufttemperatur absolut',
  requires: ['cac_mean'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const m = c.masks.warm;
    const mx = c.agg('cac_mean', m, 'max'), med = c.agg('cac_mean', m, 'median');
    const st = band(mx, 65, 80, true);
    return { status: st, value: mx, unit: '°C', dec: 0, ref: '≤ 65 °C', refLo: 20, refHi: 65,
      extra: [['Median', fmt(med, 0) + ' °C']],
      text: st === S.OK
        ? 'Die Ladeluft bleibt mit maximal ' + fmt(mx, 0) + ' °C klar unterhalb der Klopfgrenze. Der Ladeluftkühlkreis arbeitet.'
        : 'Die Ladeluft erreicht ' + fmt(mx, 0) + ' °C. Ab etwa 65 °C beginnt das Steuergerät Zündwinkel und Ladedruck zurückzunehmen – die Leistung sinkt, bevor etwas kaputtgeht.',
      action: st === S.OK ? null : ['Niedertemperatur-Kreis entlüften', 'Zusatz-Kühlmittelpumpe per Stellglieddiagnose prüfen', 'NT-Kühler vorne auf Verschmutzung kontrollieren'] };
  }
},
{
  id: 'cac_over_ambient', group: 'Ladeluft', title: 'Ladeluft über Außentemperatur (Teillast)',
  requires: ['cac_over_amb'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const m = c.combine(c.masks.partLoad, c.masks.moving);
    const d = c.dur(m);
    if (d < 60) return { status: S.UNCLEAR, note: 'Zu wenig konstante Teillastfahrt (' + fmtDur(d) + ') für eine belastbare Aussage.' };
    const med = c.agg('cac_over_amb', m, 'median');
    const st = band(med, 20, 30, true);
    return { status: st, value: med, unit: 'K', dec: 1, ref: '≤ 20 K', refLo: 0, refHi: 20,
      extra: [['Bewertete Zeit', fmtDur(d)]],
      text: st === S.OK
        ? 'Im Teillastbetrieb liegt die Ladeluft im Median nur ' + fmt(med, 1) + ' K über der Außenluft – der Kühlkreis kühlt sauber zurück, die Zusatzwasserpumpe fördert.'
        : 'Im Teillastbetrieb bleibt die Ladeluft ' + fmt(med, 1) + ' K über der Außenluft. Wenn das dauerhaft so ist und die Temperatur nach Volllast nicht abfällt, ist die Zusatz-Wasserpumpe des Ladeluftkreises der Hauptverdächtige.',
      action: st === S.OK ? null : ['Zusatz-Wasserpumpe (V188/V178) prüfen', 'NT-Kreis entlüften und Kühlmittelstand prüfen'] };
  }
},
{
  id: 'cac_bank_delta', group: 'Ladeluft', title: 'Ladelufttemperatur – Bankabgleich',
  requires: ['cac_b1', 'cac_b2'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const m = c.combine(c.masks.warm, c.mask(i => { const l = c.V('load_abs') || c.V('load_calc'); return l && l[i] > (c.loadIsAbs ? 100 : 60); }));
    const use = c.dur(m) > 20 ? m : c.masks.warm;
    const d = c.V('cac_delta');
    let mx = 0, sum = 0, cnt = 0;
    for (let i = 0; i < c.N; i++) { if (!use[i] || !(d[i] === d[i])) continue; const a = Math.abs(d[i]); if (a > mx) mx = a; sum += a; cnt++; }
    if (!cnt) return { status: S.UNCLEAR, note: 'Keine gemeinsamen Messpunkte beider Bänke.' };
    const mean = sum / cnt;
    const st = band(mean, 3, 6, true);
    return { status: st, value: mean, unit: 'K', dec: 2, ref: '≤ 3,0 K', refLo: 0, refHi: 3,
      extra: [['Maximale Abweichung', fmt(mx, 1) + ' K']],
      text: st === S.OK
        ? 'Beide Ladeluftkühler-Pakete arbeiten mit im Mittel ' + fmt(mean, 2) + ' K Abweichung praktisch identisch. Ein einseitig zugesetztes oder innen undichtes Kühlerpaket ist damit sehr unwahrscheinlich.'
        : 'Die beiden Bänke weichen im Mittel um ' + fmt(mean, 2) + ' K voneinander ab (Spitze ' + fmt(mx, 1) + ' K). Das deutet auf ein einseitig zugesetztes Kühlerpaket, einen Luftpolster im NT-Kreis oder einen driftenden Sensor hin.',
      action: st === S.OK ? null : ['Endoskopie des Ansaugtrakts', 'CO₂-Test im Kühlkreis (internes LLK-Leck)', 'Druckprüfung des Niedertemperatur-Kreises'] };
  }
},
{
  id: 'cac_recovery', group: 'Ladeluft', title: 'Rückkühlung nach Volllast',
  requires: ['cac_mean'], confidence: 'mittel', provenance: 'abgeleitet',
  run(c) {
    const cac = c.V('cac_mean'), load = c.V('load_abs') || c.V('load_calc');
    const win = Math.round(60 / c.step);
    const drops = [];
    for (const w of c.ds.events.wot) {
      if (w.dur < 2) continue;
      const endI = Math.min(c.N - 1, w.i1 + win);
      // Die folgende Minute muss überwiegend ruhig sein, sonst misst man Heat-Soak des nächsten Zugs
      let quiet = 0, tot = 0;
      for (let i = w.i1 + 1; i <= endI; i++) { tot++; if (!load || load[i] < c.wotThr * 0.8) quiet++; }
      if (tot < win * 0.7 || quiet / Math.max(1, tot) < 0.85) continue;
      let peak = -Infinity, after = NaN, before = NaN;
      for (let i = w.i0; i <= w.i1; i++) if (cac[i] > peak) peak = cac[i];
      for (let i = Math.max(0, w.i0 - Math.round(5 / c.step)); i <= w.i0; i++) if (cac[i] === cac[i]) { before = cac[i]; break; }
      for (let i = endI; i > w.i1; i--) if (cac[i] === cac[i]) { after = cac[i]; break; }
      // Der Zug muss die Ladeluft überhaupt erwärmt haben, sonst misst man nur Sensorrauschen
      if (!isFinite(peak) || !isFinite(after) || !isFinite(before) || peak - before < 5) continue;
      drops.push({ drop: peak - after, peak, after, before, t0: w.t0 });
    }
    if (!drops.length) return { status: S.UNCLEAR,
      note: 'Kein auswertbarer Zug: gebraucht wird eine Volllastphase, die die Ladeluft um mindestens 5 K erwärmt, gefolgt von einer ruhigen Minute. Kurze Zwischenspurts erwärmen den wassergekühlten Ladeluftkühler nicht genug, um seine Rückkühlung messen zu können.' };
    const sorted = drops.map(d => d.drop).sort((a, b) => a - b);
    const med = quantileSorted(sorted, .5);
    const best = drops.reduce((a, b) => b.drop > a.drop ? b : a);
    const st = med >= 8 ? S.OK : med >= 3 ? S.WARN : S.CRIT;
    return { status: st, value: med, unit: 'K', dec: 1, ref: '≥ 8 K in 60 s', refLo: 8, refHi: 40,
      extra: [['Ausgewertete Züge', String(drops.length)],
              ['Bester Zug', fmt(best.drop, 1) + ' K (' + fmt(best.peak, 0) + ' → ' + fmt(best.after, 0) + ' °C)'],
              ['Erwärmung dabei', '+' + fmt(best.peak - best.before, 0) + ' K']],
      text: st === S.OK
        ? 'Nach einem Volllastzug fällt die Ladelufttemperatur binnen einer Minute im Median um ' + fmt(med, 1) + ' K. Der Niedertemperatur-Kreis transportiert die Wärme ab – die Zusatzwasserpumpe fördert.'
        : 'Nach Volllast fällt die Ladelufttemperatur nur um ' + fmt(med, 1) + ' K je Minute. Eine schwache Rückkühlung ist die klassische Signatur einer nicht mehr fördernden Zusatz-Wasserpumpe im Ladeluftkreis – vorausgesetzt, beide Bänke verhalten sich dabei gleich.',
      action: st === S.OK ? null : ['Zusatz-Wasserpumpe (V188/V178) stellgliedtesten', 'Niedertemperatur-Kreis auf Luftpolster prüfen', 'Messung bei über 30 °C Außentemperatur wiederholen'] };
  }
},
/* ---------------- Gemisch ---------------- */
{
  id: 'ltft_b1', group: 'Gemisch', title: 'Langzeit-Gemischkorrektur Bank 1',
  requires: ['ltft_b1'], confidence: 'hoch', provenance: 'gemessen',
  run(c) { return ltftRule(c, 'ltft_b1', 'Bank 1'); }
},
{
  id: 'ltft_b2', group: 'Gemisch', title: 'Langzeit-Gemischkorrektur Bank 2',
  requires: ['ltft_b2'], confidence: 'hoch', provenance: 'gemessen',
  run(c) { return ltftRule(c, 'ltft_b2', 'Bank 2'); }
},
{
  id: 'ltft_bank_delta', group: 'Gemisch', title: 'Gemischkorrektur – Bankabgleich',
  requires: ['ltft_b1', 'ltft_b2'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const m = c.combine(c.masks.warm, c.mask(i => !c.masks.coast[i]));
    const d = c.V('ltft_delta');
    const vals = [];
    for (let i = 0; i < c.N; i++) if (m[i] && d[i] === d[i]) vals.push(Math.abs(d[i]));
    if (vals.length < 40) return { status: S.UNCLEAR, note: 'Zu wenig warme, schubfreie Messpunkte.' };
    vals.sort((a, b) => a - b);
    const med = quantileSorted(vals, .5), p95 = quantileSorted(vals, .95);
    const st = band(med, 3, 6, true);
    return { status: st, value: med, unit: '%-Punkte', dec: 2, ref: '≤ 3,0 pp', refLo: 0, refHi: 3,
      extra: [['95. Perzentil', fmt(p95, 2) + ' pp']],
      text: st === S.OK
        ? 'Beide Bänke werden nahezu gleich korrigiert (Median ' + fmt(med, 2) + ' pp Unterschied). Ein bankspezifischer Fehler – undichte Saugrohrdichtung, einzelner Injektor, gealterte Lambdasonde einer Bank – ist damit sehr unwahrscheinlich. Falls überhaupt eine Abweichung besteht, wirkt sie zentral auf beide Bänke.'
        : 'Die Bänke weichen im Median um ' + fmt(med, 2) + ' pp voneinander ab. Das spricht für eine bankspezifische Ursache: Saugrohrdichtung, Injektor, Lambdasonde oder ein undichter Krümmer vor der Sonde auf genau einer Seite.',
      action: st === S.OK ? null : ['Rauchtest des Ansaugtrakts, beide Bänke getrennt', 'Lambdasonden-Spannungsbild vergleichen', 'Injektoren der auffälligen Bank prüfen'] };
  }
},
{
  id: 'ltft_load_dep', group: 'Gemisch', title: 'Lastabhängigkeit der Gemischkorrektur',
  requires: ['ltft_b1'], confidence: 'mittel', provenance: 'abgeleitet',
  run(c) {
    const load = c.V('load_abs') || c.V('load_calc');
    if (!load) return { status: S.MISSING, missing: ['Motorlast'] };
    const lowT = c.loadIsAbs ? 40 : 30, highT = c.loadIsAbs ? 100 : 70;
    const lowM  = c.combine(c.masks.warm, c.mask(i => load[i] < lowT && !c.masks.coast[i]));
    const highM = c.combine(c.masks.warm, c.mask(i => load[i] > highT));
    if (c.dur(lowM) < 30 || c.dur(highM) < 8)
      return { status: S.UNCLEAR, note: 'Die Fahrt enthält zu wenig Kontrast zwischen niedriger und hoher Last.' };
    const ids = c.has('ltft_mean') ? 'ltft_mean' : 'ltft_b1';
    const lo = c.agg(ids, lowM, 'median'), hi = c.agg(ids, highM, 'median');
    const diff = lo - hi;
    const st = band(Math.abs(diff), 4, 8, true);
    return { status: st, value: diff, unit: '%-Punkte', dec: 2, ref: '≤ 4 pp Unterschied', refLo: -4, refHi: 4,
      extra: [['Niedriglast (< ' + lowT + ' %)', fmt(lo, 2) + ' %'], ['Hochlast (> ' + highT + ' %)', fmt(hi, 2) + ' %']],
      text: st === S.OK
        ? 'Die Gemischkorrektur beträgt ' + fmt(lo, 2) + ' % bei niedriger und ' + fmt(hi, 2) + ' % bei hoher Last' +
          (diff < -0.5
            ? ' – sie steigt also mit der Last, statt zu fallen. Genau umgekehrt verhält sich Falschluft: eine konstante Leckluftmenge fällt bei kleiner Füllung relativ stark ins Gewicht und verschwindet unter Last. Ein mit der Last zunehmender Korrekturbedarf zeigt stattdessen auf etwas, das proportional zur eingespritzten Menge wirkt – Kraftstoffsorte (E10 braucht rund 3 % mehr Masse), Einspritzmenge oder Luftmassenmesser.'
            : '. Falschluft würde bei niedriger Last deutlich stärker korrigiert werden – dieses Muster liegt hier nicht vor.')
        : 'Bei niedriger Last wird um ' + fmt(diff, 2) + ' %-Punkte stärker korrigiert als bei hoher Last. Genau so verhält sich Falschluft: die Leckluftmenge ist absolut konstant und fällt bei kleiner Füllung relativ stark ins Gewicht.',
      action: st === S.OK ? null : ['Rauchtest inklusive Kurbelgehäuseentlüftung', 'Saugrohr- und Ladeluftschlauch-Dichtungen prüfen'] };
  }
},
/* ---------------- Aufladung & Last ---------------- */
{
  id: 'load_wot', group: 'Aufladung', title: 'Absolute Motorlast bei Volllast',
  requires: ['load_abs'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const m = c.combine(c.masks.wot, c.mask(i => { const r = c.V('rpm'); return r && r[i] > 3000; }));
    const use = c.dur(m) > 1 ? m : c.masks.wot;
    const d = c.dur(use);
    if (d < 1) return { status: S.UNCLEAR, note: 'Kein Volllastzug in dieser Fahrt (Last dauerhaft unter ' + c.wotThr + ' %).' };
    const p95 = c.agg('load_abs', use, 'p95'), mx = c.agg('load_abs', use, 'max');
    const G = c.P.loadWotGreen || [150, 220];
    const st = p95 >= G[0] ? (p95 <= G[1] ? S.OK : S.WARN) : p95 >= G[0] * 0.8 ? S.WARN : S.CRIT;
    return { status: st, value: p95, unit: '%', dec: 0, ref: G[0] + '–' + G[1] + ' %', refLo: G[0], refHi: G[1],
      extra: [['Spitzenwert', fmt(mx, 1) + ' %'], ['Bewertete Volllastzeit', fmtDur(d)]],
      text: st === S.OK
        ? 'Unter Volllast erreicht die absolute Motorlast ' + fmt(p95, 0) + ' % (Spitze ' + fmt(mx, 0) + ' %). Werte über 100 % sind beim aufgeladenen Motor normal und zeigen, dass Lader, Riemen, Bypassklappe und die gesamte Ladeluftstrecke liefern. Ein Notlauf oder eine Leistungsreduktion liegt nicht vor.'
        : 'Unter Vollgas werden nur ' + fmt(p95, 0) + ' % Last erreicht. Erwartet werden ' + G[0] + '–' + G[1] + ' %. Das ist die typische Signatur eines Notlaufs, eines rutschenden Kompressorriemens oder eines Lecks in der Ladeluftstrecke.',
      action: st === S.OK ? null : ['Fehlerspeicher auslesen (Notlauf?)', 'Kompressorriemen und Spanner sichtprüfen', 'Ladeluftstrecke abdrücken', 'Bypassklappe stellgliedtesten'] };
  }
},
{
  id: 'load_idle', group: 'Aufladung', title: 'Motorlast im Leerlauf',
  requires: ['load_abs'], confidence: 'niedrig', provenance: 'gemessen',
  run(c) {
    const m = c.masks.idle;
    const d = c.dur(m);
    if (d < 8) return { status: S.UNCLEAR, note: 'Zu wenig zusammenhängender warmer Leerlauf in dieser Fahrt (' + fmtDur(d) + ').' };
    const med = c.agg('load_abs', m, 'median'), mn = c.agg('load_abs', m, 'min');
    const R = c.P.loadIdleGreen || (c.profile.aspiration === 'sauger' ? [15, 32] : [18, 42]);
    const st = med <= R[1] ? S.OK : med <= R[1] + 8 ? S.WARN : S.CRIT;
    const blown = c.profile.aspiration === 'kompressor';
    return { status: st, value: med, unit: '%', dec: 1, ref: R[0] + '–' + R[1] + ' %', refLo: R[0], refHi: R[1],
      extra: [['Minimum im Leerlauf', fmt(mn, 1) + ' %'], ['Leerlaufzeit', fmtDur(d)]],
      text: (st === S.OK
        ? 'Im Leerlauf liegt die absolute Motorlast bei ' + fmt(med, 1) + ' % – für dieses Triebwerk unauffällig. '
        : 'Die Leerlauflast liegt mit ' + fmt(med, 1) + ' % über dem Erwartungswert. Mögliche Ursachen: Falschluft, stark verkokte Einlassventile, hohe Nebenverbraucherlast oder eine schleifende Bremse. ') +
        (blown
          ? 'Zur Einordnung: der Roots-Kompressor hängt permanent am Riemen und wird auch im Leerlauf mitgeschleppt. Diese Schleppleistung hebt den Luftdurchsatz und damit die abgelesene Last gegenüber einem Saugmotor spürbar an – Werte um 30–40 % sind hier normal. '
          : '') +
        'Die absolute Motorlast wird zudem herstellerspezifisch normiert; als Absolutwert ist sie nur begrenzt vergleichbar. Aussagekräftig wird sie erst im Vergleich mehrerer Fahrten desselben Fahrzeugs.' };
  }
},
{
  id: 'boost_wot', group: 'Aufladung', title: 'Ladedruck bei Volllast', noLight: true,
  requires: ['boost'], confidence: 'niedrig', provenance: 'abgeleitet',
  run(c) {
    const m = c.masks.wot;
    if (c.dur(m) < 1) return { status: S.UNCLEAR, note: 'Kein Volllastzug für eine Ladedruckbewertung.' };
    const p95 = c.agg('boost', m, 'p95'), mx = c.agg('boost', m, 'max');
    const G = c.P.boostWotGreen;
    const derived = !!c.ds.boostDerived;
    return { status: S.UNCLEAR, value: p95, unit: 'bar', dec: 2,
      ref: G ? G[0] + '–' + G[1] + ' bar' : null, refLo: G && G[0], refHi: G && G[1],
      extra: [['Spitzenwert', fmt(mx, 2) + ' bar'], ['in psi', fmt(mx * 14.5038, 1) + ' psi']],
      text: 'Bei Volllast werden ' + fmt(p95, 2) + ' bar Ladedruck erreicht (Spitze ' + fmt(mx, 2) + ' bar / ' + fmt(mx * 14.5038, 1) + ' psi)' +
            (G ? ', der Werksbereich liegt bei ' + G[0] + '–' + G[1] + ' bar' : '') + '. ' +
            (derived
              ? 'Bewusst ohne Ampel: dieser Wert ist keine Messgröße. Die App rechnet ihn linear aus der Motorlast – er trägt keine eigene Information und ist im Absolutbetrag nicht kalibriert. Für eine belastbare Ladedruckdiagnose die PID „Intake Manifold Absolute Pressure" (0x0B) mitloggen; bis dahin ist die absolute Motorlast der verlässlichere Indikator.'
              : 'Ohne Ampel, weil die Absolutkalibrierung des Werts nicht überprüfbar ist.') };
  }
},
/* ---------------- Zündung ---------------- */
{
  id: 'timing_wot', group: 'Zündung', title: 'Zündwinkel unter Volllast',
  requires: ['timing'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const rpm = c.V('rpm');
    const m = c.combine(c.masks.wot, c.mask(i => rpm && rpm[i] >= 3000));
    const d = c.dur(m);
    if (d < 0.5) return { status: S.UNCLEAR,
      note: 'Kein Volllastzug oberhalb 3000 min⁻¹. Negative Zündwinkel im Leerlauf, im Schub oder beim Schalten sind normal (Katheizen bzw. Momenteneingriff) und werden bewusst nicht bewertet.' };
    const med = c.agg('timing', m, 'median'), mn = c.agg('timing', m, 'min');
    const st = med >= 6 ? S.OK : med >= 0 ? S.WARN : S.CRIT;
    const cacPeak = c.has('cac_mean') ? c.agg('cac_mean', m, 'max') : NaN;
    return { status: st, value: med, unit: '°KW', dec: 1, ref: '≥ +6 °', refLo: 6, refHi: 25,
      extra: [['Minimum im Fenster', fmt(mn, 1) + ' °'], ['Bewertete Zeit', fmtDur(d)],
              isFinite(cacPeak) ? ['Ladeluft dabei', fmt(cacPeak, 0) + ' °C'] : null].filter(Boolean),
      text: st === S.OK
        ? 'Unter Volllast oberhalb 3000 min⁻¹ liegt der Zündwinkel im Median bei ' + fmt(med, 1) + ' ° vor OT. Das Steuergerät gibt die Frühzündung frei – der Motor klopft unter Last nicht.'
        : 'Unter Volllast wird der Zündwinkel auf ' + fmt(med, 1) + ' ° zurückgenommen. Das ist aktive Klopfregelung. Erste Verdächtige in dieser Reihenfolge: zu niedrigoktaniger Kraftstoff, zu hohe Ladelufttemperatur, verkokte Brennräume, überalterte Zündkerzen.',
      action: st === S.OK ? null : ['Eine Tankfüllung ROZ 98/100 fahren und Messung wiederholen', 'Ladelufttemperatur unter Last prüfen', 'Zündkerzen-Wechselintervall kontrollieren'] };
  }
},
{
  id: 'timing_partload', group: 'Zündung', title: 'Zündwinkel-Freigabe im Teillast',
  requires: ['timing'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const m = c.masks.partLoad;
    if (c.dur(m) < 30) return { status: S.UNCLEAR, note: 'Zu wenig konstante Teillastfahrt.' };
    const mx = c.agg('timing', m, 'p95'), med = c.agg('timing', m, 'median');
    const st = mx >= 25 ? S.OK : mx >= 15 ? S.WARN : S.CRIT;
    return { status: st, value: mx, unit: '°KW', dec: 1, ref: '≥ 25 °', refLo: 25, refHi: 45,
      extra: [['Median Teillast', fmt(med, 1) + ' °']],
      text: st === S.OK
        ? 'Im Teillastbetrieb gibt das Steuergerät bis zu ' + fmt(mx, 1) + ' ° Frühzündung frei. Bei einem klopfenden, stark verkokten oder falsch betankten Motor wäre das nicht möglich – ein starker Freispruch.'
        : 'Selbst im Teillastbetrieb bleibt der Zündwinkel auf ' + fmt(mx, 1) + ' ° begrenzt. Das deutet auf dauerhafte Klopfregelung hin.' };
  }
},
{
  id: 'timing_trend', group: 'Zündung', title: 'Zündwinkel-Trend über die Volllastzüge',
  requires: ['timing'], confidence: 'mittel', provenance: 'abgeleitet',
  run(c) {
    const ev = c.ds.events.wot.filter(w => w.dur >= 1.5 && w.rpmMax > 3000)
                 .slice().sort((a, b) => a.t0 - b.t0);
    if (ev.length < 3) return { status: S.UNCLEAR, note: 'Weniger als drei vergleichbare Volllastzüge in dieser Fahrt.' };
    const tim = c.V('timing');
    const vals = ev.map(w => { let s = 0, n = 0; for (let i = w.i0; i <= w.i1; i++) if (tim[i] === tim[i]) { s += tim[i]; n++; } return n ? s / n : NaN; }).filter(isFinite);
    if (vals.length < 3) return { status: S.UNCLEAR, note: 'Zu wenig auswertbare Züge.' };
    const drop = vals[0] - vals[vals.length - 1];
    const st = band(drop, 3, 6, true);
    return { status: st, value: drop, unit: '°KW', dec: 1, ref: '≤ 3 ° Abnahme', refLo: -10, refHi: 3,
      extra: [['Züge', String(vals.length)], ['erster / letzter', fmt(vals[0], 1) + ' ° / ' + fmt(vals[vals.length - 1], 1) + ' °']],
      text: st === S.OK
        ? 'Der Zündwinkel bleibt über die Volllastzüge hinweg stabil (' + fmt(drop, 1) + ' ° Veränderung). Weder ein thermisches Problem noch eine sich erwärmende Zündanlage.'
        : 'Der Zündwinkel nimmt von Zug zu Zug um ' + fmt(drop, 1) + ' ° ab. Steigt dabei die Ladelufttemperatur, ist die Ladeluftkühlung überfordert; bleibt sie konstant, sind Zündanlage oder Kraftstoffqualität die wahrscheinlichere Ursache.' };
  }
},
/* ---------------- Motor allgemein ---------------- */
{
  id: 'idle_rpm', group: 'Motor', title: 'Leerlaufdrehzahl und -ruhe',
  requires: ['rpm'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const m = c.masks.idle;
    const d = c.dur(m);
    if (d < 8) return { status: S.UNCLEAR,
      note: 'Diese Fahrt enthält keinen ausreichend langen, eingeschwungenen Leerlauf (' + fmtDur(d) +
            '). Bewertet werden nur Standphasen ab 12 s, und davon erst die Zeit nach den ersten fünf Sekunden – vorher fängt der Leerlaufregler die Drehzahl noch ein.' };
    const med = c.agg('rpm', m, 'median'), sd = c.agg('rpm', m, 'std');
    const mn = c.agg('rpm', m, 'min'), mx = c.agg('rpm', m, 'max');
    const R = c.P.idleWarm || [600, 800];
    let st = inRange(med, R[0], R[1], 50, 100);
    if (sd > 50) st = S.CRIT; else if (sd > 25 && st === S.OK) st = S.WARN;
    const startedWarm = c.ds.trip.startedWarm;
    return { status: st, value: med, unit: 'min⁻¹', dec: 0, ref: R[0] + '–' + R[1] + ' min⁻¹', refLo: R[0], refHi: R[1],
      extra: [['Standardabweichung', fmt(sd, 1) + ' min⁻¹'],
              ['Spanne', fmt(mn, 0) + '–' + fmt(mx, 0) + ' min⁻¹'],
              ['Bewertete Leerlaufzeit', fmtDur(d)]],
      text: (st === S.OK
        ? 'Der eingeschwungene warme Leerlauf liegt bei ' + fmt(med, 0) + ' min⁻¹ und schwankt dabei um ' + fmt(sd, 1) +
          ' min⁻¹ (Spanne ' + fmt(mn, 0) + '–' + fmt(mx, 0) + '). Das ist ein ruhiger Leerlauf: der Regler hält die Drehzahl eng, ohne dass die Zündung dauernd gegensteuern muss.'
        : 'Leerlauf ' + fmt(med, 0) + ' min⁻¹ bei ' + fmt(sd, 1) + ' min⁻¹ Streuung. Eine hohe Streuung im eingeschwungenen Zustand spricht für Zündaussetzer, stark verkokte Einlassventile oder Falschluft.') +
        (startedWarm
          ? ' Wichtige Einschränkung: der Motor war beim Aufzeichnungsstart bereits warm. Verkokte Einlassventile fallen aber gerade im kalten Leerlauf der ersten ein bis zwei Minuten auf – dieser Datensatz kann eine Verkokung deshalb nicht ausschließen, nur zeigen, dass sie sich warm nicht bemerkbar macht.'
          : ''),
      action: st === S.OK ? null : ['Zündkerzen-Wechselintervall prüfen', 'Rauchtest auf Falschluft', 'Endoskopie der Einlassventile'] };
  }
},
{
  id: 'rpm_limit', group: 'Motor', title: 'Drehzahlausnutzung',
  requires: ['rpm'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const red = c.P.redline || (c.stats.rpm.p99 + 400);
    const mx = c.stats.rpm.max;
    const st = mx <= red ? S.OK : mx <= red + 100 ? S.WARN : S.CRIT;
    return { status: st, value: mx, unit: 'min⁻¹', dec: 0, ref: '≤ ' + fmt(red, 0) + ' min⁻¹', refLo: 0, refHi: red,
      extra: [['Ausnutzung', fmt(mx / red * 100, 0) + ' %']],
      text: st === S.OK
        ? 'Höchstdrehzahl ' + fmt(mx, 0) + ' min⁻¹ – das sind ' + fmt(mx / red * 100, 0) + ' % des Begrenzers bei ' + fmt(red, 0) + ' min⁻¹. Kein Überdrehen.'
        : 'Die Drehzahl lag mit ' + fmt(mx, 0) + ' min⁻¹ über dem Begrenzer von ' + fmt(red, 0) + ' min⁻¹ – typischerweise eine Fehlschaltung. Ventiltrieb im Auge behalten.' };
  }
},
{
  id: 'speed_cross', group: 'Motor', title: 'Tachoabgleich OBD gegen GPS',
  requires: ['speed', 'speed_gps'], confidence: 'mittel', provenance: 'abgeleitet',
  run(c) {
    const a = c.V('speed'), b = c.V('speed_gps');
    let sa = 0, sb = 0, n = 0;
    for (let i = 0; i < c.N; i++) if (a[i] === a[i] && b[i] === b[i] && a[i] > 40) { sa += a[i]; sb += b[i]; n++; }
    if (n < 50) return { status: S.UNCLEAR, note: 'Zu wenig gemeinsame Messpunkte über 40 km/h.' };
    const dev = (sa / n - sb / n) / (sb / n) * 100;
    const st = band(Math.abs(dev), 4, 8, true);
    return { status: st, value: dev, unit: '%', dec: 2, ref: '±4 %', refLo: -4, refHi: 4,
      extra: [['⌀ OBD', fmt(sa / n, 1) + ' km/h'], ['⌀ GPS', fmt(sb / n, 1) + ' km/h']],
      text: st === S.OK
        ? 'OBD- und GPS-Geschwindigkeit weichen nur um ' + fmt(dev, 2) + ' % voneinander ab. Radumfang und Tachokalibrierung passen zusammen.'
        : 'OBD-Geschwindigkeit weicht um ' + fmt(dev, 2) + ' % vom GPS ab. Bei dauerhaft mehr als 8 % lohnt der Blick auf Reifengröße und die codierte Achsübersetzung.' };
  }
},
{
  id: 'baro_sanity', group: 'Motor', title: 'Umgebungsdrucksensor',
  requires: ['baro'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const med = c.stats.baro.median, mn = c.stats.baro.min, mx = c.stats.baro.max;
    const st = (med >= 80 && med <= 106) ? S.OK : S.WARN;
    let alt = null;
    if (c.has('alt_smooth') && c.stats.alt_smooth) {
      const h = c.stats.alt_smooth.median;
      const soll = 101.325 * Math.pow(1 - 2.25577e-5 * h, 5.2559);
      alt = [['Erwartet auf ' + fmt(h, 0) + ' m', fmt(soll, 1) + ' kPa'], ['Abweichung', fmt(med - soll, 1) + ' kPa']];
    }
    return { status: st, value: med, unit: 'kPa', dec: 1, ref: '80–106 kPa', refLo: 80, refHi: 106,
      extra: [['Spanne', fmt(mn, 0) + '–' + fmt(mx, 0) + ' kPa']].concat(alt || []),
      text: st === S.OK
        ? 'Der Umgebungsdrucksensor meldet ' + fmt(med, 1) + ' kPa – plausibel. Bewusst ohne Höhen-Ampel: das reale Luftdruckniveau schwankt wetterbedingt um ±3,5 kPa gegenüber der Standardatmosphäre, ein Vergleich mit der GPS-Höhe würde bei jedem Tief Fehlalarm auslösen.'
        : 'Der gemeldete Umgebungsdruck von ' + fmt(med, 1) + ' kPa liegt außerhalb des physikalisch sinnvollen Bereichs. Sensor- oder Übertragungsfehler.' };
  }
},
/* ---------------- Verbrauch & Leistung ---------------- */
{
  id: 'fuel_econ', group: 'Verbrauch', title: 'Kraftstoffverbrauch gegen Werksangabe',
  requires: [], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const T = c.ds.trip;
    if (!isFinite(T.consAvg)) return { status: S.MISSING, missing: ['Kraftstoffzähler oder Streckenangabe'] };
    const ref = c.P.consNEDC;
    if (T.dist < 5) return { status: S.UNCLEAR, value: T.consAvg, unit: 'L/100km', dec: 1,
      note: 'Die Fahrt ist mit ' + fmt(T.dist, 1) + ' km zu kurz für einen belastbaren Verbrauchsvergleich.' };
    if (!ref) return { status: S.UNCLEAR, value: T.consAvg, unit: 'L/100km', dec: 1,
      note: 'Für dieses Fahrzeugprofil ist kein Werksverbrauch hinterlegt.' };
    const vAvg = T.speedAvgMoving;
    const calm = (T.wotShare || 0) < 0.05 && (T.stoppedTime / Math.max(1, T.knownTime)) < 0.3
                 && isFinite(vAvg) && vAvg >= 30 && vAvg <= 90;
    const ratio = T.consAvg / ref;
    // Grün bis zum Alltags-Flottenmittel (falls hinterlegt), sonst 1,55 × NEFZ
    const greenTo = Math.max(ref * 1.55, (c.P.consReal || 0) * 1.05);
    const st = !calm ? S.UNCLEAR : T.consAvg <= greenTo ? S.OK : ratio <= 2.1 ? S.WARN : S.CRIT;
    return { status: st, value: T.consAvg, unit: 'L/100km', dec: 1,
      ref: 'NEFZ ' + fmt(ref, 1) + ' · Alltag ' + fmt(c.P.consReal || ref * 1.6, 1),
      refLo: ref, refHi: (c.P.consReal || ref * 1.7),
      extra: [['Faktor zum NEFZ', fmt(ratio, 2) + ' ×'], ['Getankt in dieser Fahrt', fmt(T.fuelUsed, 2) + ' L'],
              ['Strecke (' + T.distSource + ')', fmt(T.dist, 2) + ' km'],
              ['Vollgasanteil', fmt((T.wotShare || 0) * 100, 1) + ' %']],
      text: !calm
        ? fmt(T.consAvg, 1) + ' L/100 km bei ' + fmt((T.wotShare || 0) * 100, 1) + ' % Vollgasanteil. Bewusst ohne Ampel – bei diesem Fahrprofil ist ein Vergleich mit dem Normverbrauch sinnlos. Für eine Bewertung eine ruhige Fahrt mit unter 5 % Vollgasanteil aufzeichnen.'
        : st === S.OK
          ? fmt(T.consAvg, 1) + ' L/100 km – das ' + fmt(ratio, 2) + '-fache des NEFZ-Werts von ' + fmt(ref, 1) + ' L und damit im normalen Alltagsbereich' + (c.P.consReal ? ' (Flottenmittel ' + fmt(c.P.consReal, 1) + ' L)' : '') + '. Der NEFZ-Wert wird im realen Verkehr von keinem Fahrzeug erreicht; der Vergleich mit dem Alltagsmittel ist die ehrlichere Bezugsgröße.'
          : fmt(T.consAvg, 1) + ' L/100 km sind bei ruhiger Fahrweise auffällig viel. Mögliche Ursachen: zu fettes Gemisch, Zündwinkelrücknahme, schleifende Bremse, gealterte Lambdasonde.' };
  }
},
{
  id: 'power_estimate', group: 'Verbrauch', title: 'Leistungsabschätzung', noLight: true,
  requires: ['fuel_rate'], confidence: 'niedrig', provenance: 'geschätzt',
  run(c) {
    const m = c.combine(c.masks.wot, c.mask(i => { const r = c.V('rpm'); return r && r[i] > 4500; }));
    const use = c.dur(m) > 0.5 ? m : c.masks.wot;
    if (c.dur(use) < 1) return { status: S.UNCLEAR, note: 'Kein Volllastzug für eine Leistungsabschätzung.' };
    const rate = c.agg('fuel_rate', use, 'max');
    const kgh = rate * 0.745;
    const lo = kgh / 0.40, mid = kgh / 0.36, hi = kgh / 0.33;   // kW über BSFC-Spanne
    const ref = c.P.powerKW;
    return { status: S.UNCLEAR, value: mid, unit: 'kW', dec: 0,
      ref: ref ? fmt(ref, 0) + ' kW / ' + fmt(c.P.powerPS, 0) + ' PS' : null, refLo: ref, refHi: ref,
      extra: [['Spanne', fmt(lo, 0) + '–' + fmt(hi, 0) + ' kW (' + fmt(lo * 1.35962, 0) + '–' + fmt(hi * 1.35962, 0) + ' PS)'],
              ['Spitzen-Kraftstofffluss', fmt(rate, 1) + ' L/h'],
              ['Angenommener spez. Verbrauch', '0,33–0,40 kg/kWh']],
      text: 'Aus dem Spitzen-Kraftstofffluss von ' + fmt(rate, 1) + ' L/h ergibt sich eine Leistung von ' + fmt(lo, 0) + '–' + fmt(hi, 0) + ' kW (' + fmt(lo * 1.35962, 0) + '–' + fmt(hi * 1.35962, 0) + ' PS)' +
            (ref ? ', Werk sind ' + fmt(ref, 0) + ' kW / ' + fmt(c.P.powerPS, 0) + ' PS' : '') + '. ' +
            'Bewusst ohne Ampel und nur als Spanne: der Kraftstofffluss ist in dieser App selbst ein Rechenwert aus Luftmasse und Last, und der angenommene spezifische Verbrauch geht direkt linear ein. Die Abschätzung kann ein Leistungsdefizit weder belegen noch ausschließen. Der von der App gemeldete Momentanwert „Instant engine power" überschätzt systematisch und ist als Absolutwert unbrauchbar – nur sein Verlauf ist aussagekräftig.' };
  }
},
{
  id: 'pedal_scaling', group: 'Motor', title: 'Plausibilität des Fahrpedalgebers',
  requires: ['pedal', 'load_abs'], confidence: 'mittel', provenance: 'abgeleitet',
  run(c) {
    const pMax = c.stats.pedal.max, pIdle = c.stats.pedal.p05;
    const lMax = c.stats.load_abs.max;
    const wotSeen = c.dur(c.masks.wot) > 1;
    if (!wotSeen) return { status: S.UNCLEAR, note: 'Ohne Volllastzug lässt sich die Pedalskalierung nicht prüfen.' };
    const st = pMax >= 55 ? S.OK : S.WARN;
    return { status: st, value: pMax, unit: '%', dec: 1, ref: '≥ 55 % bei Volllast', refLo: 55, refHi: 100,
      extra: [['Ruhewert', fmt(pIdle, 1) + ' %'], ['Maximale Last dabei', fmt(lMax, 0) + ' %']],
      text: st === S.OK
        ? 'Der Pedalgeber meldet im Ruhezustand ' + fmt(pIdle, 1) + ' % und bei Vollgas ' + fmt(pMax, 1) + ' %. VAG nutzt den elektrischen Sensorbereich bewusst nicht voll aus – ' + fmt(pMax, 1) + ' % sind hier echtes Vollgas, nicht Teillast. Die gleichzeitig erreichten ' + fmt(lMax, 0) + ' % Motorlast bestätigen das.'
        : 'Bei Volllast (' + fmt(lMax, 0) + ' % Motorlast) erreicht der Pedalgeber nur ' + fmt(pMax, 1) + ' %. Kennlinie des Gebers prüfen.' };
  }
}
];

function ltftRule(c, id, bankLabel) {
  const m = c.combine(c.masks.warm, c.mask(i => !c.masks.coast[i]));
  const d = c.dur(m);
  if (d < 60) return { status: S.UNCLEAR, note: 'Zu wenig warme, schubfreie Fahrzeit (' + fmtDur(d) + ').' };
  const med = c.agg(id, m, 'median'), mn = c.agg(id, m, 'min'), mx = c.agg(id, m, 'max');
  const a = Math.abs(med);
  const st = a <= 5 ? S.OK : a <= 10 ? S.WARN : S.CRIT;
  const lean = med > 0;
  const near = a > 3 && a <= 5;
  return {
    status: st, value: med, unit: '%', dec: 2, ref: '−5 bis +5 %', refLo: -5, refHi: 5,
    extra: [['Spanne', fmt(mn, 2) + ' … ' + fmt(mx, 2) + ' %'], ['Bewertete Zeit', fmtDur(d)]],
    text: st === S.OK
      ? (near
        ? 'Die Langzeitkorrektur ' + bankLabel + ' liegt bei ' + fmt(med, 2) + ' % – im grünen Bereich, aber in dessen oberer Hälfte. Der Motor gibt dauerhaft etwas Kraftstoff zu. Bei symmetrischem Verhalten beider Bänke ist die mit Abstand häufigste Ursache schlicht E10 statt E5: Ethanol braucht rund 3 % mehr Kraftstoffmasse, das Steuergerät korrigiert entsprechend nach oben – ohne dass irgendetwas defekt wäre.'
        : 'Die Langzeitkorrektur ' + bankLabel + ' liegt bei ' + fmt(med, 2) + ' % und damit sauber im Sollband.')
      : lean
        ? 'Die Langzeitkorrektur ' + bankLabel + ' liegt bei ' + fmt(med, 2) + ' % – das Steuergerät muss dauerhaft Kraftstoff zugeben, das Gemisch läuft mager. Ursachen in absteigender Wahrscheinlichkeit: Falschluft (Saugrohrdichtung, Ladeluftschlauch, Kurbelgehäuseentlüftung), zu geringe Einspritzmenge, gealterte Breitbandsonde, E10 statt E5.'
        : 'Die Langzeitkorrektur ' + bankLabel + ' liegt bei ' + fmt(med, 2) + ' % – das Steuergerät nimmt dauerhaft Kraftstoff weg, das Gemisch läuft fett. Ursachen: undichter Injektor, zu hoher Kraftstoffdruck, überzählender Luftmassenmesser, Ölverdünnung.',
    action: st === S.OK && !near ? null
      : near ? ['Eine Tankfüllung Super Plus (ROZ 98, E5) fahren und die Messung wiederholen – fällt der Wert auf unter 2 %, war es der Kraftstoff']
      : ['Rauchtest des Ansaugtrakts inklusive Kurbelgehäuseentlüftung', 'Kraftstoffdruck prüfen', 'Lambdasonden-Signalbild kontrollieren', 'Kurzzeit-Gemischkorrektur (STFT) zusätzlich mitloggen']
  };
}

/* Regeln ausführen */
function runDiagnostics(ds, profile) {
  const c = buildContext(ds, profile);
  const out = [];
  for (const rule of DIAG_RULES) {
    const missing = (rule.requires || []).filter(id => !c.has(id));
    if (missing.length) {
      out.push(Object.assign({}, rule, {
        status: S.MISSING, missing: missing.map(id => METRIC_BY_ID[id] ? METRIC_BY_ID[id].label : id)
      }));
      continue;
    }
    let r;
    try { r = rule.run(c); }
    catch (e) { r = { status: S.UNCLEAR, note: 'Regel konnte nicht ausgewertet werden: ' + e.message }; }
    out.push(Object.assign({}, rule, r));
  }
  const order = { crit: 0, warn: 1, ok: 2, unklar: 3, missing: 4 };
  out.sort((a, b) => (order[a.status] - order[b.status]) || 0);
  const tally = { ok: 0, warn: 0, crit: 0, missing: 0, unklar: 0 };
  out.forEach(r => tally[r.status]++);
  return { results: out, tally, ctx: c };
}
