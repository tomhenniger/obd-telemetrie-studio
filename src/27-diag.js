/* ============================================================
   Diagnose-Engine
   Fünf Zustände je Regel: ok | warn | crit | missing | unklar
   ============================================================ */

function autoProfile(ds) {
  const s = ds.stats;
  const rpmMax = s.rpm ? s.rpm.max : 0;
  const hasTiming = !!s.timing;
  const loadMax = s.load_abs ? s.load_abs.max : (s.load_calc ? s.load_calc.max : 0);
  const twoBanks = !!(s.ltft_b2 || s.cac_b2 || s.stft_b2);
  // Gemischadaption gibt es nur beim Ottomotor. Wo LTFT/STFT geloggt sind, ist die Frage
  // entschieden – der fehlende Zündwinkel allein macht aus einem Benziner keinen Diesel.
  const hasTrim = !!(s.ltft_b1 || s.ltft_b2 || s.stft_b1 || s.stft_b2 || s.lambda);
  if (twoBanks && s.cac_b1 && rpmMax > 5800 && loadMax > 170 && hasTiming) return 'audi_s5_b85_cgwc';
  if (!hasTiming && !hasTrim && rpmMax < 5200) return 'generic_diesel';
  if (loadMax > 115) return 'generic_turbo';
  return 'generic_na';
}

/* ---------- Auswerte-Kontext ---------- */
function buildContext(ds, profile) {
  const { G, N, step, grid, stats } = ds;
  const R = resolveSpecs(profile);
  const P = R.specs;                    // Profilwerte, ergänzt um Klassenwerte
  const derivedSpecs = R.derived;       // welche davon nicht aus dem Profil stammen
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

  return { ds, profile, P, derivedSpecs, G, N, step, grid, stats, has, V, agg, dur, mask: maskFn, combine,
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
  id: 'coolant_operating', usesSpec: ['coolantGreen'], group: 'Kühlkreis', title: 'Kühlmitteltemperatur im Betrieb',
  requires: ['coolant'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const P = c.P.coolantGreen || [85, 105];
    const m = c.combine(c.masks.warm, c.masks.engineOn);
    const d = c.dur(m);
    if (d < 120) {
      /* Die Maske verlangt >= 80 °C – ein Motor, der auf 75 °C hängen bleibt, erzeugt hier
         eine leere Maske. Das als "zu wenig Daten" zu melden verwechselt den Defekt mit
         einer Datenlücke: genau so sieht ein offen hängendes Thermostat aus. */
      const on = c.dur(c.masks.engineOn);
      const co = c.V('coolant');
      let plateau = NaN;
      if (on >= 480) {
        const late = c.combine(c.masks.engineOn, c.mask(i => (c.grid[i] - c.ds.t0) > 420));
        if (c.dur(late) >= 120) plateau = c.agg('coolant', late, 'median');
      }
      if (isFinite(plateau) && plateau < P[0] - 5)
        return { status: plateau < P[0] - 12 ? S.CRIT : S.WARN, value: plateau, unit: '°C', dec: 0,
          ref: P[0] + '–' + P[1] + ' °C', refLo: P[0], refHi: P[1],
          cond: 'Motor läuft, ab 7 min nach Aufzeichnungsbeginn',
          extra: [['Betriebszeit', fmtDur(on)], ['Zeit über 80 °C', fmtDur(d)]],
          text: 'Der Motor erreicht die Betriebstemperatur nicht: nach der Warmlaufphase liegt das Plateau bei ' + fmt(plateau, 0) + ' °C statt bei ' + P[0] + '–' + P[1] + ' °C. Typische Ursache ist ein offen hängendes oder falsches Thermostat. Folgen sind mehr Verbrauch, stärkere Ventilverkokung und Kraftstoffeintrag ins Öl.',
          action: ['Thermostat und Temperaturgeber G62 prüfen', 'Kühlmitteltemperatur im Stand nach 15 min Leerlauf gegenprüfen'] };
      return { status: S.UNCLEAR, note: 'Zu wenig Betriebszeit im warmen Zustand (' + fmtDur(d) + ').' };
    }
    const med = c.agg('coolant', m, 'median'), mx = c.agg('coolant', m, 'max'), mn = c.agg('coolant', m, 'min');
    let st = inRange(med, P[0], P[1], 5, 5);
    // Ein einzelner Rasterpunkt über 112 °C ist ein Sensor- oder Übertragungsausreißer,
    // keine Überhitzung. Erst eine zusammenhängende Sekunde zählt.
    const hot = c.dur(c.combine(m, c.mask(i => { const v = c.V('coolant'); return v && v[i] > 112; })));
    if (hot >= 1) st = S.CRIT;
    return {
      status: st, value: med, unit: '°C', dec: 0,
      ref: P[0] + '–' + P[1] + ' °C', refLo: P[0], refHi: P[1],
      cond: 'Kühlmittel ≥ 80 °C und Motor läuft',
      // kein "Minimum (warm)": das ist die Maskengrenze, keine Beobachtung
      extra: [['Maximum', fmt(mx, 0) + ' °C'], ['Bewertete Zeit', fmtDur(d)]],
      text: st === S.OK
        ? 'Die Kühlmitteltemperatur hält im warmen Betrieb ein stabiles Plateau von ' + fmt(med, 0) + ' °C. Kennfeldthermostat und Wasserpumpe arbeiten unauffällig. Über den Kühlerlüfter sagt die Aufzeichnung nichts – dafür fehlt die Messgröße.'
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
    if (!isFinite(t85)) {
      /* "Nie 85 °C erreicht" ist nur dann ein Befund, wenn der Motor auch lange genug
         gelaufen ist UND die Messreihe das begleitet hat. Vier Sekunden Kühlmitteldaten
         vom Aufzeichnungsstart sagen nichts über ein Thermostat — daraus eine Werkstatt-
         empfehlung abzuleiten ist schlimmer als gar keine Aussage. */
      const covered = c.dur(c.mask(i => co[i] === co[i]));
      const ran = c.dur(c.masks.engineOn);
      const last = c.agg('coolant', c.mask(i => co[i] === co[i]), 'max');
      if (covered < 300 || ran < 600)
        return { status: S.UNCLEAR,
          note: 'Zu wenig Daten für eine Aussage zum Warmlauf: Kühlmitteltemperatur liegt nur über ' +
                fmtDur(covered) + ' vor, der Motor lief in der Aufzeichnung ' + fmtDur(ran) +
                '. Für eine Bewertung wird ein Kaltstart mit durchgehender Aufzeichnung gebraucht, ' +
                'bis der Motor sein Temperaturplateau erreicht hat.',
          extra: [['Kühlmitteldaten vorhanden über', fmtDur(covered)],
                  ['Motorlaufzeit in der Aufzeichnung', fmtDur(ran)],
                  ['Höchste gemessene Temperatur', fmt(last, 0) + ' °C']] };
      return { status: S.CRIT, value: NaN,
        extra: [['Kühlmitteldaten vorhanden über', fmtDur(covered)],
                ['Höchste gemessene Temperatur', fmt(last, 0) + ' °C']],
        text: 'Der Motor läuft seit ' + fmtDur(ran) + ' und erreicht nur ' + fmt(last, 0) +
              ' °C – 85 °C werden in der gesamten Aufzeichnung nie erreicht. Das ist die Signatur eines offen ' +
              'hängenden oder falschen Thermostats. Folgen: mehr Verbrauch, stärkere Ventilverkokung, Ölverdünnung.',
        action: ['Thermostat und Temperaturgeber prüfen', 'Kühlmittelstand und Entlüftung kontrollieren'] };
    }
    /* Die Schwelle muss mit der Starttemperatur wachsen. Eine feste Sechs-Minuten-Grenze
       gilt sonst fuer den 45-°C-Start genauso wie fuer den Winterkaltstart bei -10 °C —
       und macht aus einem gesunden Motor im Januar einen Thermostatschaden. Grob: ein
       Grundbedarf plus rund 4,5 s je Kelvin Temperaturhub. */
    const allow = (180 + (85 - start) * 4.5) * ((c.profile && c.profile.fuel === 'diesel') ? 1.3 : 1);
    const st = t85 < allow ? S.OK : t85 < allow * 1.7 ? S.WARN : S.CRIT;
    return { status: st, value: t85 / 60, unit: 'min', dec: 1,
      ref: '< ' + fmt(allow / 60, 1) + ' min ab ' + fmt(start, 0) + ' °C',
      refLo: 0, refHi: allow / 60,
      extra: [['Starttemperatur', fmt(start, 0) + ' °C'],
              ['Erwartet bei diesem Start', 'bis ' + fmtDur(allow)]],
      text: 'Von ' + fmt(start, 0) + ' °C auf 85 °C in ' + fmtDur(t85) + '. ' +
            (st === S.OK
              ? 'Für diesen Temperaturhub ist das unauffällig – die Erwartung wächst mit der Kälte beim Start.'
              : 'Das ist deutlich länger als für diesen Temperaturhub zu erwarten und spricht für ein offen hängendes Thermostat.') }
  }
},
/* ---------------- Ladeluft ---------------- */
{
  id: 'cac_absolute', group: 'Ladeluft', title: 'Ladelufttemperatur absolut',
  requires: ['cac_mean'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const m = c.masks.warm;
    const d = c.dur(m);
    const mx = c.agg('cac_mean', m, 'max'), med = c.agg('cac_mean', m, 'median');
    // Der Gesamtmaximalwert steht anderswo im Dokument. Ohne ihn hier liest sich "maximal"
    // zweimal mit verschiedenen Zahlen und der Leser muss einen Fehler annehmen.
    const mxAll = c.stats.cac_mean ? c.stats.cac_mean.max : NaN;
    const colder = isFinite(mxAll) && mxAll > mx + 0.4;
    const st = band(mx, 65, 80, true);
    return { status: st, value: mx, unit: '°C', dec: 0, ref: '≤ 65 °C', refLo: 20, refHi: 65,
      cond: 'Kühlmittel ≥ 80 °C',
      extra: [['Median', fmt(med, 0) + ' °C'], ['Bewertete Zeit', fmtDur(d)],
              colder ? ['Maximum über die ganze Aufzeichnung', fmt(mxAll, 0) + ' °C (vor Erreichen der Betriebstemperatur)'] : null],
      text: st === S.OK
        ? 'Die Ladeluft bleibt im warmen Betrieb mit maximal ' + fmt(mx, 0) + ' °C klar unterhalb der Klopfgrenze'
          + (colder ? ' (über die ganze Aufzeichnung, also inklusive Warmlaufphase, bis ' + fmt(mxAll, 0) + ' °C)' : '')
          + '. Der Ladeluftkühlkreis arbeitet.'
        : 'Die Ladeluft erreicht ' + fmt(mx, 0) + ' °C. Ab etwa 65 °C beginnt das Steuergerät Zündwinkel und Ladedruck zurückzunehmen – die Leistung sinkt, bevor etwas kaputtgeht.',
      action: st === S.OK ? null : ['Niedertemperatur-Kreis entlüften', 'Zusatz-Kühlmittelpumpe per Stellglieddiagnose prüfen', 'NT-Kühler vorne auf Verschmutzung kontrollieren'] };
  }
},
{
  id: 'cac_over_ambient', group: 'Ladeluft', title: 'Ladeluft über Außentemperatur (Teillast)',
  requires: ['cac_over_amb'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const m = c.combine(c.masks.partLoad, c.masks.moving);
    const viaIat = c.ds.cacRefSource === 'iat';
    const d = c.dur(m);
    if (d < 60) return { status: S.UNCLEAR, note: 'Zu wenig konstante Teillastfahrt (' + fmtDur(d) + ') für eine belastbare Aussage.' };
    const med = c.agg('cac_over_amb', m, 'median');
    const st = band(med, 20, 30, true);
    return { status: st, confidence: viaIat ? 'niedrig' : 'mittel',
      cond: viaIat ? 'Referenz: Ansauglufttemperatur (keine Außentemperatur im Log)' : 'Referenz: Außentemperatur', value: med, unit: 'K', dec: 1, ref: '≤ 20 K', refLo: 0, refHi: 20,
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
    const useLoad = c.dur(m) > 20;
    const d = c.V('cac_delta');
    let mx = 0, sum = 0, cnt = 0;
    for (let i = 0; i < c.N; i++) { if (!use[i] || !(d[i] === d[i])) continue; const a = Math.abs(d[i]); if (a > mx) mx = a; sum += a; cnt++; }
    if (!cnt) return { status: S.UNCLEAR, note: 'Keine gemeinsamen Messpunkte beider Bänke.' };
    const mean = sum / cnt;
    const st = band(mean, 3, 6, true);
    return { status: st, value: mean, unit: 'K', dec: 2, ref: '≤ 3,0 K', refLo: 0, refHi: 3,
      cond: useLoad ? 'Kühlmittel ≥ 80 °C und hohe Last' : 'Kühlmittel ≥ 80 °C',
      extra: [['Maximale Abweichung', fmt(mx, 1) + ' K'], ['Bewertete Zeit', fmtDur(c.dur(use))]],
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
    // Ein "Median" aus einem einzigen Zug ist eine Einzelmessung. Sagen, was es ist.
    const few = drops.length < 3;
    const wie = drops.length === 1 ? 'im einzigen auswertbaren Zug'
              : few ? 'in den ' + drops.length + ' auswertbaren Zügen' : 'im Median';
    return { status: st, value: med, unit: 'K', dec: 1, ref: '≥ 8 K in 60 s', refLo: 8, refHi: 40,
      confidence: few ? 'niedrig' : 'mittel',
      note: few ? 'Nur ' + drops.length + ' auswertbare' + (drops.length === 1 ? 'r Zug' : ' Züge')
                  + ' – die Zahl beschreibt diese Messung, nicht das typische Verhalten des Fahrzeugs.' : null,
      extra: [['Ausgewertete Züge', String(drops.length)],
              ['Bester Zug', fmt(best.drop, 1) + ' K (' + fmt(best.peak, 0) + ' → ' + fmt(best.after, 0) + ' °C)'],
              ['Erwärmung dabei', '+' + fmt(best.peak - best.before, 0) + ' K']],
      text: st === S.OK
        ? 'Nach einem Volllastzug fällt die Ladelufttemperatur binnen einer Minute ' + wie + ' um ' + fmt(med, 1) + ' K. Der Niedertemperatur-Kreis transportiert die Wärme ab – die Zusatzwasserpumpe fördert.'
        : 'Nach Volllast fällt die Ladelufttemperatur ' + wie + ' nur um ' + fmt(med, 1) + ' K je Minute. Eine schwache Rückkühlung ist die klassische Signatur einer nicht mehr fördernden Zusatz-Wasserpumpe im Ladeluftkreis – vorausgesetzt, beide Bänke verhalten sich dabei gleich.',
      action: st === S.OK ? null : ['Zusatz-Wasserpumpe (V188/V178) stellgliedtesten', 'Niedertemperatur-Kreis auf Luftpolster prüfen', 'Messung bei über 30 °C Außentemperatur wiederholen'] };
  }
},
/* ---------------- Gemisch ---------------- */
{
  id: 'ltft_b1', fuel: 'petrol', group: 'Gemisch', title: 'Langzeit-Gemischkorrektur Bank 1',
  requires: ['ltft_b1'], confidence: 'hoch', provenance: 'gemessen',
  run(c) { return ltftRule(c, 'ltft_b1', 'Bank 1'); }
},
{
  id: 'ltft_b2', fuel: 'petrol', group: 'Gemisch', title: 'Langzeit-Gemischkorrektur Bank 2',
  requires: ['ltft_b2'], confidence: 'hoch', provenance: 'gemessen',
  run(c) { return ltftRule(c, 'ltft_b2', 'Bank 2'); }
},
{
  id: 'ltft_bank_delta', fuel: 'petrol', group: 'Gemisch', title: 'Gemischkorrektur – Bankabgleich',
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
  id: 'ltft_load_dep', fuel: 'petrol', group: 'Gemisch', title: 'Lastabhängigkeit der Gemischkorrektur',
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
            ? ' – sie steigt also mit der Last, statt zu fallen. Genau umgekehrt verhält sich Falschluft: eine konstante Leckluftmenge fällt bei kleiner Füllung relativ stark ins Gewicht und verschwindet unter Last. Ein mit der Last zunehmender Korrekturbedarf zeigt stattdessen auf etwas, das proportional zur eingespritzten Menge wirkt – Kraftstoffsorte (E10 braucht rund 1–2 % mehr Masse als E5), Einspritzmenge oder Luftmassenmesser.'
            : '. Falschluft würde bei niedriger Last deutlich stärker korrigiert werden – dieses Muster liegt hier nicht vor.')
        : diff > 0
          ? 'Bei niedriger Last wird um ' + fmt(diff, 2) + ' %-Punkte stärker korrigiert als bei hoher Last. Genau so verhält sich Falschluft: die Leckluftmenge ist absolut konstant und fällt bei kleiner Füllung relativ stark ins Gewicht.'
          // Die Gegenrichtung spricht GEGEN Falschluft. Denselben Text zu drucken schickt
          // die Werkstatt ans falsche Ende des Motors.
          : 'Bei hoher Last wird um ' + fmt(-diff, 2) + ' %-Punkte stärker korrigiert als bei niedriger Last. Das spricht gegen Falschluft – die fällt bei kleiner Füllung stärker ins Gewicht, nicht bei großer. Diese Richtung deutet auf die Kraftstoffversorgung (Förderdruck, Hochdruckpumpe, verengter Filter) oder auf einen driftenden Luftmassenmesser.',
      action: st === S.OK ? null : ['Rauchtest inklusive Kurbelgehäuseentlüftung', 'Saugrohr- und Ladeluftschlauch-Dichtungen prüfen'] };
  }
},
/* ---------------- Aufladung & Last ---------------- */
{
  id: 'load_wot', usesSpec: ['loadWotGreen'], group: 'Aufladung', title: 'Absolute Motorlast bei Volllast',
  requires: ['load_abs'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    /* Volllast am Fahrerwunsch erkennen, nicht an der Last. Über die Last definiert ist
       die Maske zirkulär: das p95 der Last innerhalb "Last >= Schwelle" liegt zwangsläufig
       über der Schwelle, der Warn- und der Kritisch-Zweig sind dann toter Code — und ein
       gedeckelter Ladedruck, also genau der gesuchte Defekt, erzeugt eine leere Maske
       und meldet "nicht bewertbar" statt "auffällig". */
    const rpm = c.V('rpm');
    const ped = c.V('pedal') || c.V('throttle');
    const pst = c.V('pedal') ? c.stats.pedal : c.stats.throttle;
    let m = null, viaPedal = false;
    if (ped && pst && isFinite(pst.max) && pst.max > 20) {
      const lim = pst.max * 0.92;                 // VAG-Pedale enden bei ~67 %, darum relativ
      const cand = c.mask(i => ped[i] >= lim && rpm && rpm[i] > 2500);
      if (c.dur(cand) >= 1) { m = cand; viaPedal = true; }
    }
    if (!m) {
      const byLoad = c.combine(c.masks.wot, c.mask(i => rpm && rpm[i] > 3000));
      m = c.dur(byLoad) > 1 ? byLoad : c.masks.wot;
    }
    const d = c.dur(m);
    if (d < 1) return { status: S.UNCLEAR, note: viaPedal
      ? 'Kein Volllastzug in dieser Fahrt.'
      : 'Kein Volllastzug erkennbar. Ohne Fahrpedal- oder Drosselklappenstellung im Log lässt sich Vollgas nur über die Last selbst erkennen – ein gedeckelter Ladedruck bliebe dabei unsichtbar. Für eine belastbare Prüfung die PID „Accelerator Pedal Position D/E" mitloggen.' };
    const p95 = c.agg('load_abs', m, 'p95'), mx = c.agg('load_abs', m, 'max');
    const G = c.P.loadWotGreen || [150, 220];
    const st = p95 >= G[0] ? (p95 <= G[1] ? S.OK : S.WARN) : p95 >= G[0] * 0.8 ? S.WARN : S.CRIT;
    const low = p95 < G[0];
    return { status: st, value: p95, unit: '%', dec: 0, ref: G[0] + '–' + G[1] + ' %', refLo: G[0], refHi: G[1],
      cond: viaPedal ? 'Fahrpedal über 92 % des Maximums, Drehzahl über 2500 min⁻¹'
                     : 'Last über ' + c.wotThr + ' % (kein Pedalsignal im Log)',
      extra: [['Spitzenwert', fmt(mx, 1) + ' %'], ['Bewertete Volllastzeit', fmtDur(d)],
              ['Volllast erkannt über', viaPedal ? 'Fahrpedalstellung' : 'Motorlast selbst']],
      text: st === S.OK
        ? 'Unter Volllast erreicht die absolute Motorlast ' + fmt(p95, 0) + ' % (Spitze ' + fmt(mx, 0) + ' %). Werte über 100 % sind beim aufgeladenen Motor normal und zeigen, dass Lader, Riemen, Bypassklappe und die gesamte Ladeluftstrecke liefern. Ein Notlauf oder eine Leistungsreduktion liegt nicht vor.'
        : low
          ? 'Bei Vollgas werden nur ' + fmt(p95, 0) + ' % Last erreicht, erwartet werden ' + G[0] + '–' + G[1] + ' %. Das ist die typische Signatur eines Notlaufs, eines rutschenden Kompressorriemens oder eines Lecks in der Ladeluftstrecke.'
          : 'Bei Vollgas werden ' + fmt(p95, 0) + ' % Last erreicht und damit mehr als die erwarteten ' + G[0] + '–' + G[1] + ' %. Das ist für sich genommen kein Defekt: entweder ist der Erwartungsbereich für diesen Motor zu eng gefasst (bei einem Rückfallprofil der Normalfall), oder der Ladedruck wurde angehoben. Erhöhte Ladedrücke gehören zusammen mit Zündwinkelrücknahme und Ladelufttemperatur beurteilt.',
      action: st === S.OK ? null : low
        ? ['Fehlerspeicher auslesen (Notlauf?)', 'Kompressorriemen und Spanner sichtprüfen', 'Ladeluftstrecke abdrücken', 'Bypassklappe stellgliedtesten']
        : ['Prüfen, ob ein Softwarestand ab Werk oder eine Leistungssteigerung vorliegt', 'Zündwinkelrücknahme unter Volllast mitbeurteilen', 'Ladelufttemperatur unter Dauerlast beobachten'] };
  }
},
{
  id: 'load_idle', usesSpec: ['loadIdleGreen'], group: 'Aufladung', title: 'Motorlast im Leerlauf',
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
  id: 'boost_wot', usesSpec: ['boostWotGreen'], group: 'Aufladung', title: 'Ladedruck bei Volllast', noLight: true,
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
              ? 'Bewusst ohne Ampel: dieser Wert ist keine Messgröße. Die App rechnet ihn linear aus der Motorlast – er trägt keine eigene Information und ist im Absolutbetrag nicht kalibriert. Für eine belastbare Ladedruckdiagnose die PID „Intake Manifold Absolute Pressure“ (0x0B) mitloggen; bis dahin ist die absolute Motorlast der verlässlichere Indikator.'
              : 'Ohne Ampel, weil die Absolutkalibrierung des Werts nicht überprüfbar ist.') };
  }
},
/* ---------------- Zündung ---------------- */
{
  id: 'timing_wot', fuel: 'petrol', group: 'Zündung', title: 'Zündwinkel unter Volllast',
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
  id: 'timing_partload', fuel: 'petrol', group: 'Zündung', title: 'Zündwinkel-Freigabe im Teillast',
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
  id: 'timing_trend', fuel: 'petrol', group: 'Zündung', title: 'Zündwinkel-Trend über die Volllastzüge',
  requires: ['timing'], confidence: 'mittel', provenance: 'abgeleitet',
  run(c) {
    const ev = c.ds.events.wot.filter(w => w.dur >= 1.5 && w.rpmMax > 3000)
                 .slice().sort((a, b) => a.t0 - b.t0);
    if (ev.length < 3) return { status: S.UNCLEAR, note: 'Weniger als drei vergleichbare Volllastzüge in dieser Fahrt.' };
    const tim = c.V('timing'), rpm = c.V('rpm');
    /* Der mittlere Zündwinkel eines Zugs hängt am Drehzahlbereich: ein Zug bis 6300 min⁻¹
       liegt im Mittel Grad höher als einer bis 3900. Nur das gemeinsame Fenster vergleichen,
       sonst wird aus verschiedenen Gängen ein "Trend". */
    const LO = 3000, HI = 4500;
    const vals = ev.map(w => { let s = 0, n = 0;
      for (let i = w.i0; i <= w.i1; i++) if (tim[i] === tim[i] && rpm && rpm[i] >= LO && rpm[i] <= HI) { s += tim[i]; n++; }
      return n >= 3 ? s / n : NaN; }).filter(isFinite);
    if (vals.length < 3) return { status: S.UNCLEAR, note: 'Weniger als drei Volllastzüge decken das Vergleichsfenster 3000–4500 min⁻¹ ab.' };
    const drop = vals[0] - vals[vals.length - 1];
    const st = band(drop, 3, 6, true);
    return { status: st, value: drop, unit: '°KW', dec: 1, ref: '≤ 3 ° Abnahme', refLo: -10, refHi: 3,
      cond: 'Volllast, 3000–4500 min⁻¹',
      extra: [['Züge', String(vals.length)], ['erster / letzter', fmt(vals[0], 1) + ' ° / ' + fmt(vals[vals.length - 1], 1) + ' °']],
      text: st === S.OK
        ? 'Der Zündwinkel bleibt über die Volllastzüge hinweg stabil (' + fmt(drop, 1) + ' ° Veränderung). Weder ein thermisches Problem noch eine sich erwärmende Zündanlage.'
        : 'Der Zündwinkel nimmt von Zug zu Zug um ' + fmt(drop, 1) + ' ° ab. Steigt dabei die Ladelufttemperatur, ist die Ladeluftkühlung überfordert; bleibt sie konstant, sind Zündanlage oder Kraftstoffqualität die wahrscheinlichere Ursache.' };
  }
},
/* ---------------- Motor allgemein ---------------- */
{
  id: 'idle_rpm', usesSpec: ['idleWarm'], group: 'Motor', title: 'Leerlaufdrehzahl und -ruhe',
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
  id: 'rpm_limit', usesSpec: ['redline'], group: 'Motor', title: 'Drehzahlausnutzung',
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
  id: 'speed_cross', group: 'Motor', title: 'Geschwindigkeitssignal OBD gegen GPS',
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
        ? 'OBD- und GPS-Geschwindigkeit weichen nur um ' + fmt(dev, 2) + ' % voneinander ab. Der Radumfang passt zur codierten Übersetzung. Über die Tachoanzeige sagt das nichts: verglichen wird der Steuergerätewert (PID 0x0D), die Anzeige im Kombiinstrument muss gesetzlich nach oben abweichen.'
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
    /* Zähler und Strecke müssen dieselbe Zeit abdecken. Läuft der Kraftstoffzähler durch,
       die Streckenquelle aber nur einen Teil der Fahrt, entsteht ein Verbrauch, der mit dem
       Motor nichts zu tun hat – und daraus wurde bisher ein kritischer Befund. */
    const covFuel = (c.ds.coverage && (c.ds.coverage.fuel_used || c.ds.coverage.fuel_rate)) || 0;
    const covDist = (T.distCands || []).reduce((a, x) => Math.max(a, (x.deckung || 0) / 100), 0);
    if (covFuel > 0 && covDist > 0 && Math.abs(covFuel - covDist) > 0.25)
      return { status: S.UNCLEAR, value: T.consAvg, unit: 'L/100km', dec: 1,
        note: 'Kraftstoffzähler und Streckenquelle decken verschiedene Zeiträume ab (' + fmt(covFuel * 100, 0) + ' % gegen ' +
              fmt(covDist * 100, 0) + ' % der Fahrt). Ein Verbrauch aus zwei ungleichen Zeiträumen ist keine Aussage über den Motor.',
        extra: [['Abdeckung Kraftstoff', fmt(covFuel * 100, 0) + ' %'], ['Abdeckung Strecke', fmt(covDist * 100, 0) + ' %']] };
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
    /* Dichte und spezifischer Verbrauch sind kraftstoffabhängig. Mit Ottowerten wird ein
       Diesel um rund 40 % unterschätzt – und der Text stellt die Zahl dann neben die
       Werksangabe, als wäre da ein Leistungsdefizit. */
    const diesel = c.profile && c.profile.fuel === 'diesel';
    const dens = diesel ? 0.83 : 0.745;
    const bsfc = diesel ? [0.24, 0.22, 0.20] : [0.40, 0.36, 0.33];
    const kgh = rate * dens;
    const lo = kgh / bsfc[0], mid = kgh / bsfc[1], hi = kgh / bsfc[2];   // kW über BSFC-Spanne
    const ref = c.P.powerKW;
    return { status: S.UNCLEAR, value: mid, unit: 'kW', dec: 0,
      ref: ref ? fmt(ref, 0) + ' kW / ' + fmt(c.P.powerPS, 0) + ' PS' : null, refLo: ref, refHi: ref,
      extra: [['Spanne', fmt(lo, 0) + '–' + fmt(hi, 0) + ' kW (' + fmt(lo * 1.35962, 0) + '–' + fmt(hi * 1.35962, 0) + ' PS)'],
              ['Spitzen-Kraftstofffluss', fmt(rate, 1) + ' L/h'],
              ['Angenommener spez. Verbrauch', diesel ? '0,20–0,24 kg/kWh (Diesel)' : '0,33–0,40 kg/kWh (Otto)']],
      text: 'Aus dem Spitzen-Kraftstofffluss von ' + fmt(rate, 1) + ' L/h ergibt sich eine Leistung von ' + fmt(lo, 0) + '–' + fmt(hi, 0) + ' kW (' + fmt(lo * 1.35962, 0) + '–' + fmt(hi * 1.35962, 0) + ' PS)' +
            (ref ? ', Werk sind ' + fmt(ref, 0) + ' kW / ' + fmt(c.P.powerPS, 0) + ' PS' : '') + '. ' +
            'Bewusst ohne Ampel und nur als Spanne: der Kraftstofffluss ist in dieser App selbst ein Rechenwert aus Luftmasse und Last, und der angenommene spezifische Verbrauch geht direkt linear ein. Die Abschätzung kann ein Leistungsdefizit weder belegen noch ausschließen. Der von der App gemeldete Momentanwert „Instant engine power“ überschätzt systematisch und ist als Absolutwert unbrauchbar – nur sein Verlauf ist aussagekräftig.' };
  }
},
{
  id: 'pedal_scaling', group: 'Motor', title: 'Plausibilität des Fahrpedalgebers',
  requires: ['pedal', 'load_abs'], confidence: 'mittel', provenance: 'abgeleitet',
  run(c) {
    const pMax = c.stats.pedal.max, pIdle = c.stats.pedal.p05;
    const lMax = c.stats.load_abs.max;
    // Last im Fenster um das Pedalmaximum – sonst behauptet der Text eine Gleichzeitigkeit,
    // die aus zwei unabhaengigen globalen Maxima gar nicht folgt
    const pArr = c.V('pedal'), lArr = c.V('load_abs');
    let pi = -1, pv = -Infinity;
    for (let i = 0; i < c.N; i++) if (pArr[i] === pArr[i] && pArr[i] > pv) { pv = pArr[i]; pi = i; }
    const w = Math.max(1, Math.round(1 / c.step));
    let lNear = -Infinity, li = -1;
    for (let i = Math.max(0, pi - w); i <= Math.min(c.N - 1, pi + w); i++)
      if (lArr[i] === lArr[i] && lArr[i] > lNear) { lNear = lArr[i]; li = i; }
    let lmi = -1, lmv = -Infinity;
    for (let i = 0; i < c.N; i++) if (lArr[i] === lArr[i] && lArr[i] > lmv) { lmv = lArr[i]; lmi = i; }
    const dt = (pi >= 0 && lmi >= 0) ? Math.abs(lmi - pi) * c.step : NaN;
    const wotSeen = c.dur(c.masks.wot) > 1;
    if (!wotSeen) return { status: S.UNCLEAR, note: 'Ohne Volllastzug lässt sich die Pedalskalierung nicht prüfen.' };
    const st = pMax >= 55 ? S.OK : S.WARN;
    return { status: st, value: pMax, unit: '%', dec: 1, ref: '≥ 55 % bei Volllast', refLo: 55, refHi: 100,
      extra: [['Ruhewert', fmt(pIdle, 1) + ' %'],
              ['Last im Sekundenfenster um das Pedalmaximum', isFinite(lNear) ? fmt(lNear, 0) + ' %' : '–'],
              ['Höchste Last der Fahrt', fmt(lMax, 0) + ' %'],
              isFinite(dt) ? ['Abstand beider Maxima', fmt(dt, 1) + ' s'] : null],
      text: st === S.OK
        ? 'Der Pedalgeber meldet im Ruhezustand ' + fmt(pIdle, 1) + ' % und bei Vollgas ' + fmt(pMax, 1) + ' %. VAG nutzt den elektrischen Sensorbereich bewusst nicht voll aus – ' + fmt(pMax, 1) + ' % sind hier echtes Vollgas, nicht Teillast. Im Sekundenfenster um dieses Pedalmaximum liegt die Motorlast bei ' + fmt(lNear, 0) + ' %, was das bestätigt.'
        : 'Bei Volllast (' + fmt(lMax, 0) + ' % Motorlast) erreicht der Pedalgeber nur ' + fmt(pMax, 1) + ' %. Kennlinie des Gebers prüfen.' };
  }
},
/* ================= Bisher ungenutzte Messgrößen =================
   Die Registry erkennt 53 Größen, die Regeln oben fragen 16 davon ab. Was folgt,
   sind Werkstatt-Faustwerte (sollwert_quelle "regelwerk"), keine Werksangaben – jede
   Regel sagt, unter welcher Bedingung sie misst, und tritt bei dünner Datenlage
   lieber zurück, als etwas zu behaupten. */
{
  id: 'oil_temp', group: 'Kühlkreis', title: 'Öltemperatur im Betrieb',
  requires: ['oil_temp'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const m = c.combine(c.masks.warm, c.masks.engineOn);
    const d = c.dur(m);
    if (d < 300) return { status: S.UNCLEAR, note: 'Zu wenig warme Betriebszeit (' + fmtDur(d) + ') für eine Öltemperatur-Bewertung.' };
    const med = c.agg('oil_temp', m, 'median'), mx = c.agg('oil_temp', m, 'max');
    const co = c.V('coolant') ? c.agg('coolant', m, 'median') : NaN;
    let st = mx > 135 ? S.CRIT : mx > 125 ? S.WARN : S.OK;
    if (med < 70) st = S.WARN;
    return { status: st, value: med, unit: '°C', dec: 0, ref: '80–120 °C, Spitze ≤ 125 °C', refLo: 80, refHi: 120,
      cond: 'Kühlmittel ≥ 80 °C und Motor läuft',
      extra: [['Maximum', fmt(mx, 0) + ' °C'], isFinite(co) ? ['Kühlmittel dabei', fmt(co, 0) + ' °C'] : null, ['Bewertete Zeit', fmtDur(d)]],
      text: st === S.OK
        ? 'Das Öl liegt im warmen Betrieb bei ' + fmt(med, 0) + ' °C (Spitze ' + fmt(mx, 0) + ' °C) – im Bereich, in dem Kondensat und Kraftstoffeintrag ausdampfen und die Viskosität stimmt.'
        : med < 70
          ? 'Das Öl erreicht mit ' + fmt(med, 0) + ' °C keine Betriebstemperatur. Bei Kurzstrecke normal; ist die Fahrt lang, verdünnt sich das Öl mit Kraftstoff und Wasser.'
          : 'Das Öl erreicht ' + fmt(mx, 0) + ' °C. Ab etwa 130 °C altert es beschleunigt; Ölkühler, Thermostat des Ölkreises und den Ölstand prüfen.',
      action: st === S.OK ? null : ['Ölstand und Ölzustand prüfen', 'Öl-Wasser-Wärmetauscher bzw. Ölkühler auf Durchfluss prüfen'] };
  }
},
{
  id: 'cat_temp', group: 'Abgas', title: 'Katalysatortemperatur',
  requires: ['cat_temp_b1'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const m = c.combine(c.masks.warm, c.masks.moving);
    const d = c.dur(m);
    if (d < 180) return { status: S.UNCLEAR, note: 'Zu wenig warme Fahrzeit für eine Katalysator-Bewertung.' };
    const med = c.agg('cat_temp_b1', m, 'median'), mx = c.agg('cat_temp_b1', m, 'max');
    const hot = c.dur(c.combine(m, c.mask(i => { const v = c.V('cat_temp_b1'); return v && v[i] > 900; })));
    let st = hot > 20 ? S.CRIT : hot > 3 ? S.WARN : S.OK;
    if (med < 300) st = S.WARN;
    let delta = NaN;
    if (c.V('cat_temp_b2')) delta = Math.abs(c.agg('cat_temp_b1', m, 'median') - c.agg('cat_temp_b2', m, 'median'));
    if (isFinite(delta) && delta > 100 && st === S.OK) st = S.WARN;
    return { status: st, value: med, unit: '°C', dec: 0, ref: '350–800 °C, über 900 °C nur sekundenweise', refLo: 350, refHi: 800,
      cond: 'Kühlmittel ≥ 80 °C, in Bewegung',
      extra: [['Maximum', fmt(mx, 0) + ' °C'], ['Zeit über 900 °C', fmtDur(hot)],
              isFinite(delta) ? ['Unterschied Bank 1/2', fmt(delta, 0) + ' K'] : null],
      text: st === S.OK
        ? 'Der Katalysator arbeitet bei ' + fmt(med, 0) + ' °C im Median. Zündaussetzer oder ein zu fettes Gemisch würden ihn deutlich heißer laufen lassen – davon ist nichts zu sehen.'
        : med < 300
          ? 'Der Katalysator bleibt mit ' + fmt(med, 0) + ' °C zu kühl für einen guten Umsatz. Bei viel Schubbetrieb oder Kurzstrecke normal; sonst Anspringverhalten und Lambdaregelung prüfen.'
          : isFinite(delta) && delta > 100
            ? 'Die beiden Bänke laufen ' + fmt(delta, 0) + ' K auseinander. Eine Bank verbrennt Kraftstoff im Kat nach – Zündaussetzer oder ein undichter Injektor auf dieser Seite.'
            : 'Der Katalysator lag ' + fmtDur(hot) + ' über 900 °C. Unverbrannter Kraftstoff verbrennt im Kat: Zündaussetzer, zu fettes Gemisch oder eine träge Lambdasonde. Bei anhaltend über 950 °C schmilzt der Träger.',
      action: st === S.OK ? null : ['Aussetzerzähler je Zylinder auslesen', 'Lambdasonden-Signale auf Schaltfrequenz prüfen', 'Einspritzventile auf Dichtheit prüfen'] };
  }
},
{
  id: 'stft_bias', fuel: 'petrol', group: 'Gemisch', title: 'Kurzzeit-Gemischkorrektur',
  requires: ['stft_b1'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const m = c.combine(c.masks.warm, c.mask(i => !c.masks.coast[i]), c.masks.engineOn);
    const d = c.dur(m);
    if (d < 120) return { status: S.UNCLEAR, note: 'Zu wenig warme, schubfreie Laufzeit (' + fmtDur(d) + ').' };
    const med = c.agg('stft_b1', m, 'median'), sd = c.agg('stft_b1', m, 'std');
    const a = Math.abs(med);
    let st = a <= 5 ? S.OK : a <= 10 ? S.WARN : S.CRIT;
    const frozen = isFinite(sd) && sd < 0.3;
    if (frozen && st === S.OK) st = S.WARN;
    return { status: st, value: med, unit: '%', dec: 2, ref: '−5 bis +5 %, lebendig', refLo: -5, refHi: 5,
      cond: 'Kühlmittel ≥ 80 °C, kein Schub',
      extra: [['Streuung (σ)', fmt(sd, 2) + ' %'], ['Bewertete Zeit', fmtDur(d)]],
      text: frozen
        ? 'Die Kurzzeitkorrektur steht praktisch still (σ ' + fmt(sd, 2) + ' %). Ein geregeltes Gemisch pendelt ständig um null – ein eingefrorener Wert heißt: die Regelung läuft nicht (offener Regelkreis, Sonde nicht betriebsbereit oder Ersatzwert).'
        : st === S.OK
          ? 'Die Kurzzeitkorrektur pendelt um ' + fmt(med, 2) + ' % mit ' + fmt(sd, 2) + ' % Streuung – so sieht eine arbeitende Lambdaregelung aus.'
          : 'Die Kurzzeitkorrektur liegt dauerhaft bei ' + fmt(med, 2) + ' %. Was die Langzeitkorrektur nicht mehr auffängt, landet hier: ' + (med > 0 ? 'zu mager (Falschluft, Kraftstoffdruck, Sonde)' : 'zu fett (undichter Injektor, Tankentlüftung, Kraftstoffdruck zu hoch)') + '.',
      action: st === S.OK ? null : (frozen ? ['Lambdasonde auf Betriebsbereitschaft und Heizung prüfen', 'Fehlerspeicher auf Regelkreis-Codes prüfen'] : ['Rauchtest', 'Kraftstoffdruck messen', 'Lambdasonde auf Schaltfrequenz prüfen']) };
  }
},
{
  id: 'lambda_closed_loop', fuel: 'petrol', group: 'Gemisch', title: 'Lambda in der Teillast',
  requires: ['lambda'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const m = c.masks.partLoad;
    const d = c.dur(m);
    if (d < 60) return { status: S.UNCLEAR, note: 'Zu wenig warme Teillastfahrt (' + fmtDur(d) + ').' };
    const med = c.agg('lambda', m, 'median'), p05 = c.agg('lambda', m, 'p05'), p95 = c.agg('lambda', m, 'p95');
    // Manche Apps liefern statt Lambda das Verhältnis Luft/Kraftstoff (≈14,7 bei λ = 1)
    const afr = med > 5;
    const lam = afr ? med / 14.7 : med;
    const st = inRange(lam, 0.97, 1.03, 0.03, 0.03);
    return { status: st, value: lam, unit: 'λ', dec: 3, ref: '0,97–1,03', refLo: 0.97, refHi: 1.03,
      cond: 'Teillast, warm, kein Schub' + (afr ? ' · Rohwert als Luft/Kraftstoff-Verhältnis geliefert' : ''),
      extra: [['5.–95. Perzentil', fmt(afr ? p05 / 14.7 : p05, 3) + ' … ' + fmt(afr ? p95 / 14.7 : p95, 3)], ['Bewertete Zeit', fmtDur(d)]],
      text: st === S.OK
        ? 'In der Teillast liegt Lambda bei ' + fmt(lam, 3) + ' – stöchiometrisch, wie es der Katalysator braucht.'
        : 'In der Teillast liegt Lambda bei ' + fmt(lam, 3) + ', also dauerhaft ' + (lam > 1 ? 'mager' : 'fett') + '. Die Regelung müsste das ausgleichen; tut sie es nicht, ist entweder die Sonde träge oder die Korrektur am Anschlag.',
      action: st === S.OK ? null : ['Langzeit- und Kurzzeitkorrektur daneben legen', 'Lambdasonde prüfen'] };
  }
},
{
  id: 'o2_switching', fuel: 'petrol', group: 'Gemisch', title: 'Lambdasonde 1 – Schaltverhalten',
  requires: ['o2_b1s1'], confidence: 'mittel', provenance: 'abgeleitet',
  run(c) {
    const v = c.V('o2_b1s1'), s = c.stats.o2_b1s1;
    // Nur für Sprungsonden (0–1 V). Breitbandsonden liefern Strom oder Lambda – dann keine Aussage.
    if (!s || s.max > 1.5) return { status: S.UNCLEAR, note: 'Kein Sprungsonden-Signal (0–1 V) – bei einer Breitbandsonde gibt es kein Schaltverhalten zu bewerten.' };
    const m = c.combine(c.masks.partLoad);
    const d = c.dur(m);
    if (d < 60) return { status: S.UNCLEAR, note: 'Zu wenig warme Teillastfahrt (' + fmtDur(d) + ').' };
    let cross = 0, prev = NaN, lo = Infinity, hi = -Infinity, cnt = 0;
    for (let i = 0; i < c.N; i++) {
      if (!m[i] || !(v[i] === v[i])) continue;
      cnt++; if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i];
      if (prev === prev && ((prev < 0.45 && v[i] >= 0.45) || (prev >= 0.45 && v[i] < 0.45))) cross++;
      prev = v[i];
    }
    const hz = cross / d;
    // Die Abtastrate begrenzt, was zählbar ist: unter 2 Hz Abtastung ist die Frequenz nicht messbar.
    const rate = cnt / d;
    if (rate < 2) return { status: S.UNCLEAR, note: 'Die Sonde wird nur mit ' + fmt(rate, 1) + ' Hz geloggt – zu langsam, um ihr Schalten zu sehen. Diese PID allein mit hoher Rate aufzeichnen.' };
    const stuck = hi < 0.6 || lo > 0.3;
    const st = stuck ? S.CRIT : hz >= 0.5 ? S.OK : hz >= 0.2 ? S.WARN : S.CRIT;
    return { status: st, value: hz, unit: 'Hz', dec: 2, ref: '≥ 0,5 Hz, Hub 0,1–0,9 V', refLo: 0.5, refHi: 5,
      cond: 'Teillast, warm · Abtastung ' + fmt(rate, 1) + ' Hz',
      extra: [['Signalhub', fmt(lo, 2) + '–' + fmt(hi, 2) + ' V'], ['Wechsel um 0,45 V', String(cross)], ['Bewertete Zeit', fmtDur(d)]],
      text: stuck
        ? 'Die Sonde bleibt zwischen ' + fmt(lo, 2) + ' und ' + fmt(hi, 2) + ' V hängen – sie schaltet nicht mehr durch. Eine gealterte oder vergiftete Sprungsonde; die Regelung fährt auf Ersatzwerten.'
        : st === S.OK
          ? 'Die Sonde schaltet ' + fmt(hz, 2) + '-mal pro Sekunde zwischen fett und mager mit vollem Hub – eine gesunde Sprungsonde.'
          : 'Die Sonde schaltet nur ' + fmt(hz, 2) + '-mal pro Sekunde. Eine träge Sonde regelt zu langsam, der Verbrauch steigt und der Katalysator sieht Gemischschwankungen.',
      action: st === S.OK ? null : ['Lambdasonde 1 erneuern, wenn älter als 120.000 km', 'Sondenheizung und Abgasleck vor der Sonde prüfen'] };
  }
},
{
  id: 'maf_sanity', group: 'Motor', title: 'Luftmassenmesser – Plausibilität',
  requires: ['maf', 'rpm'], confidence: 'niedrig', provenance: 'abgeleitet',
  run(c) {
    const disp = c.P.displacement ? c.P.displacement / 1000 : NaN;
    const idle = c.masks.idle;
    const dIdle = c.dur(idle);
    const load = c.V('load_abs') || c.V('load_calc');
    // Korrelation Luftmasse zu Last: ein driftender LMM verliert den Zusammenhang
    let r = NaN;
    if (load) {
      const xs = [], ys = [];
      const maf = c.V('maf');
      for (let i = 0; i < c.N; i++) if (maf[i] === maf[i] && load[i] === load[i] && c.masks.engineOn[i]) { xs.push(load[i]); ys.push(maf[i]); }
      if (xs.length > 200) r = pearson(xs, ys);
    }
    const idleMaf = dIdle >= 8 ? c.agg('maf', idle, 'median') : NaN;
    const perL = isFinite(disp) && isFinite(idleMaf) ? idleMaf / disp : NaN;
    let st = S.OK;
    const notes = [];
    if (isFinite(r) && r < 0.85) { st = S.WARN; notes.push('Die Luftmasse folgt der Last nur lose (r = ' + fmt(r, 2) + ').'); }
    if (isFinite(perL) && (perL < 1.2 || perL > 6)) { st = S.WARN; notes.push('Im Leerlauf ' + fmt(perL, 1) + ' g/s je Liter Hubraum – außerhalb 1,5–4,5.'); }
    if (!isFinite(r) && !isFinite(perL)) return { status: S.UNCLEAR, note: 'Weder Leerlauf noch Lastsignal ausreichend für eine Plausibilitätsprüfung.' };
    return { status: st, value: isFinite(perL) ? perL : r, unit: isFinite(perL) ? 'g/s·L' : 'r', dec: 2,
      ref: isFinite(perL) ? '1,5–4,5 g/s je Liter im Leerlauf' : 'r ≥ 0,85 zur Last', refLo: isFinite(perL) ? 1.5 : 0.85, refHi: isFinite(perL) ? 4.5 : 1,
      extra: [isFinite(idleMaf) ? ['Luftmasse im Leerlauf', fmt(idleMaf, 1) + ' g/s'] : null, isFinite(r) ? ['Korrelation zur Last', fmt(r, 3)] : null],
      text: st === S.OK
        ? 'Der Luftmassenmesser liefert plausible Werte: ' + (isFinite(perL) ? fmt(perL, 1) + ' g/s je Liter im Leerlauf' : '') + (isFinite(r) ? (isFinite(perL) ? ', ' : '') + 'Korrelation ' + fmt(r, 2) + ' zur Last' : '') + '.'
        : notes.join(' ') + ' Ein verschmutzter oder driftender Luftmassenmesser zeigt zu wenig – das Steuergerät magert ab, die Gemischkorrektur wandert ins Plus.',
      action: st === S.OK ? null : ['Luftmassenmesser reinigen oder tauschen', 'Falschluft zwischen LMM und Drosselklappe ausschließen'] };
  }
},
{
  id: 'fuel_pressure', group: 'Kraftstoff', title: 'Kraftstoffdruck unter Last',
  requires: ['fuel_press'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const s = c.stats.fuel_press;
    const idle = c.masks.idle, wot = c.masks.wot;
    const dI = c.dur(idle), dW = c.dur(wot);
    const isRail = s.median > 2000;                       // Hochdruck-Rail (GDI/Common Rail) statt Vorförderdruck
    const pI = dI >= 8 ? c.agg('fuel_press', idle, 'median') : NaN;
    const pW = dW >= 1 ? c.agg('fuel_press', wot, 'p05') : NaN;
    const sdI = dI >= 8 ? c.agg('fuel_press', idle, 'std') : NaN;
    if (!isFinite(pI) && !isFinite(pW)) return { status: S.UNCLEAR, note: 'Weder Leerlauf noch Volllast lang genug für eine Druckbewertung.' };
    let st = S.OK, why = '';
    if (isFinite(pW) && isFinite(pI)) {
      const drop = (pI - pW) / pI;
      if (!isRail && drop > 0.15) { st = drop > 0.25 ? S.CRIT : S.WARN; why = 'Unter Volllast bricht der Druck um ' + fmt(drop * 100, 0) + ' % ein.'; }
    }
    if (!isRail && isFinite(sdI) && sdI > 0.08 * pI) { st = st === S.OK ? S.WARN : st; why += ' Im Leerlauf schwankt er um σ ' + fmt(sdI, 0) + ' kPa.'; }
    if (isRail && isFinite(pW) && isFinite(s.max) && pW < s.max * 0.5) { st = S.WARN; why = 'Unter Volllast fällt der Raildruck auf ' + fmt(pW / 1000, 1) + ' MPa gegen Spitze ' + fmt(s.max / 1000, 1) + ' MPa.'; }
    return { status: st, value: isFinite(pW) ? pW : pI, unit: 'kPa', dec: 0,
      ref: isRail ? 'Raildruck unter Last ≥ 50 % der Spitze' : 'Einbruch unter Last ≤ 15 %', refLo: 0, refHi: s.max,
      cond: isRail ? 'Hochdruck-Rail' : 'Vorförderdruck',
      extra: [isFinite(pI) ? ['Leerlauf', fmt(pI, 0) + ' kPa'] : null, isFinite(pW) ? ['Volllast (p05)', fmt(pW, 0) + ' kPa'] : null, ['Spitze', fmt(s.max, 0) + ' kPa']],
      text: st === S.OK
        ? 'Der Kraftstoffdruck hält unter Last (' + (isFinite(pW) ? fmt(pW, 0) : fmt(pI, 0)) + ' kPa). Förderpumpe und Druckregler liefern.'
        : why + ' Das ist die Signatur einer schwächelnden Kraftstoffpumpe, eines verstopften Filters oder eines undichten Druckreglers.',
      action: st === S.OK ? null : ['Kraftstofffilter-Wechselintervall prüfen', 'Förderdruck mit Manometer gegenmessen', 'Druckregler auf Dichtheit prüfen'] };
  }
},
{
  id: 'batt_voltage', group: 'Elektrik', title: 'Bordspannung bei laufendem Motor',
  requires: ['batt', 'rpm'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const m = c.mask(i => { const r = c.V('rpm'); return r && r[i] > 500; });
    const d = c.dur(m);
    if (d < 60) return { status: S.UNCLEAR, note: 'Zu wenig Laufzeit für eine Aussage zur Ladespannung.' };
    const med = c.agg('batt', m, 'median'), p05 = c.agg('batt', m, 'p05'), mx = c.agg('batt', m, 'max');
    let st = med >= 13.4 && med <= 15.0 ? S.OK : med >= 13.0 ? S.WARN : S.CRIT;
    if (mx > 15.3) st = S.CRIT;
    return { status: st, value: med, unit: 'V', dec: 2, ref: '13,4–15,0 V', refLo: 13.4, refHi: 15.0,
      cond: 'Motor läuft',
      extra: [['5. Perzentil', fmt(p05, 2) + ' V'], ['Maximum', fmt(mx, 2) + ' V'], ['Bewertete Zeit', fmtDur(d)]],
      text: st === S.OK
        ? 'Die Bordspannung liegt bei laufendem Motor bei ' + fmt(med, 2) + ' V – Generator und Regler laden. Moderne Fahrzeuge senken die Spannung bewusst ab, wenn die Batterie voll ist; Werte um 13,5 V sind deshalb kein Mangel.'
        : mx > 15.3
          ? 'Die Spannung erreicht ' + fmt(mx, 2) + ' V. Ein Regler, der über 15,3 V lässt, kocht die Batterie und gefährdet Steuergeräte.'
          : 'Die Bordspannung liegt bei laufendem Motor nur bei ' + fmt(med, 2) + ' V. Der Generator lädt nicht ausreichend: Keilrippenriemen, Regler oder Generator selbst. Beim Gebrauchtwagen ein Kostenpunkt.',
      action: st === S.OK ? null : ['Generatorspannung an den Batteriepolen gegenmessen', 'Riemen und Spanner prüfen', 'Massekabel Motor–Karosserie prüfen'] };
  }
},
{
  id: 'start_voltage', group: 'Elektrik', title: 'Batterie beim Start',
  requires: ['batt', 'rpm'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const b = c.V('batt'), r = c.V('rpm'), grid = c.grid;
    let first = -1;
    for (let i = 0; i < grid.length; i++) if (r[i] > 500) { first = i; break; }
    if (first <= 0) return { status: S.UNCLEAR, note: 'Die Aufzeichnung beginnt bei laufendem Motor – Ruhespannung und Starteinbruch sind nicht enthalten. Beim nächsten Mal die Aufzeichnung vor dem Anlassen starten.' };
    let sum = 0, n = 0;
    for (let i = 0; i < first; i++) if (b[i] === b[i]) { sum += b[i]; n++; }
    if (!n) return { status: S.UNCLEAR, note: 'Vor dem Motorstart liegt keine Spannung vor.' };
    const rest = sum / n;
    let dip = Infinity;
    for (let i = Math.max(0, first - 3); i <= Math.min(grid.length - 1, first + 3); i++) if (b[i] < dip) dip = b[i];
    const st = rest >= 12.4 && dip >= 9.6 ? S.OK : rest >= 12.0 && dip >= 9.0 ? S.WARN : S.CRIT;
    return { status: st, value: rest, unit: 'V', dec: 2, ref: 'Ruhe ≥ 12,4 V · Einbruch ≥ 9,6 V', refLo: 12.4, refHi: 13.0,
      cond: 'vor dem ersten Motorlauf, ' + fmtDur(grid[first] - grid[0]) + ' Ruhe aufgezeichnet',
      extra: [['Ruhespannung', fmt(rest, 2) + ' V'], ['Einbruch beim Anlassen', isFinite(dip) ? fmt(dip, 2) + ' V' : '–'], ['Messpunkte davor', String(n)]],
      text: st === S.OK
        ? 'Ruhespannung ' + fmt(rest, 2) + ' V und Starteinbruch bis ' + fmt(dip, 2) + ' V: die Batterie ist geladen und hält die Last des Anlassers. Über mehrere Fahrten in der Akte zeigt dieser Wert das Altern der Batterie, lange bevor sie ausfällt.'
        : 'Ruhespannung ' + fmt(rest, 2) + ' V' + (isFinite(dip) ? ', beim Anlassen bis ' + fmt(dip, 2) + ' V' : '') + '. Unter 12,4 V ist die Batterie nicht voll, unter 12,0 V deutlich entladen oder gealtert; ein Einbruch unter 9,6 V heißt, der Anlasser zieht sie in die Knie. Bei kurzen Strecken und Standzeiten ist das normal; bleibt es über Fahrten so, ist die Batterie am Ende oder der Generator lädt zu wenig.',
      action: st === S.OK ? null : ['Batterie voll laden und Ruhespannung nach 12 h messen', 'Generatorspannung bei laufendem Motor prüfen (Regel Bordspannung)', 'Alter der Batterie am Aufdruck prüfen, ab 5–6 Jahren tauschen'] };
  }
},
{
  id: 'boost_spool', group: 'Aufladung', title: 'Ladedruckaufbau bei Volllast',
  requires: ['boost'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const ev = (c.ds.events && c.ds.events.wot) || [], b = c.V('boost'), grid = c.grid;
    const times = [];
    for (const s of ev) {
      let mx = -Infinity; for (let k = s.i0; k <= s.i1; k++) if (b[k] > mx) mx = b[k];
      const b0 = b[s.i0] === b[s.i0] ? b[s.i0] : 0;
      if (!(mx - b0 > 0.2)) continue;
      const target = b0 + 0.9 * (mx - b0);
      for (let k = s.i0; k <= s.i1; k++) if (b[k] >= target) { times.push(grid[k] - grid[s.i0]); break; }
    }
    if (times.length < 2) return { status: S.UNCLEAR, note: times.length ? 'Nur ein Volllastzug mit messbarem Ladedruckaufbau – für eine Aussage braucht es mindestens zwei.' : 'Kein Volllastzug mit messbarem Ladedruckaufbau (mindestens 0,2 bar über dem Ausgangswert).' };
    times.sort((p, q) => p - q);
    const med = times[Math.floor(times.length / 2)];
    const blown = c.profile && c.profile.aspiration === 'kompressor';
    const lim = blown ? [0.8, 1.5] : [2.0, 3.5];
    const st = med <= lim[0] ? S.OK : med <= lim[1] ? S.WARN : S.CRIT;
    const step = grid.length > 1 ? grid[1] - grid[0] : 1;
    return { status: st, value: med, unit: 's', dec: 1, ref: '≤ ' + fmt(lim[0], 1) + ' s (' + (blown ? 'Kompressor' : 'Turbolader') + ')', refLo: 0, refHi: lim[0],
      cond: times.length + ' Volllastzüge, Zeit bis 90 % des Spitzendrucks, Raster ' + fmt(step, 1) + ' s',
      extra: [['Züge', String(times.length)], ['schnellster', fmt(times[0], 1) + ' s'], ['langsamster', fmt(times[times.length - 1], 1) + ' s']],
      text: st === S.OK
        ? 'Der Ladedruck steht im Median nach ' + fmt(med, 1) + ' s – ' + (blown ? 'so unmittelbar, wie ein Kompressor es soll.' : 'ein gesunder Turbolader ohne Leckagen oder hängende Verstellung.') + ' Ein Trend über Fahrten in der Akte zeigt, ob der Aufbau langsamer wird.'
        : 'Der Ladedruck braucht im Median ' + fmt(med, 1) + ' s bis 90 % des Spitzenwerts. ' + (blown ? 'Ein Kompressor liefert Druck praktisch mit dem Gaspedal; eine solche Verzögerung deutet auf Bypassklappe, Schlauch oder Riemen.' : 'Langsamer Aufbau spricht für Undichtigkeit im Ladeluftweg, eine träge Ladedruckregelung oder eine schwergängige Verstellung.') + ' Bei grobem Zeitraster ist die Messung ungenau – die Regel rechnet mit dem, was die Aufzeichnung hergibt.',
      action: st === S.OK ? null : ['Ladeluftstrecke abdrücken (Schläuche, Schellen, Ladeluftkühler)', blown ? 'Bypassklappe und Riemen des Kompressors prüfen' : 'Ladedruckregelventil und Unterdruckdose prüfen', 'Aufzeichnung mit feinerem Raster (Boost mit 5–10 Hz) wiederholen'] };
  }
},
{
  id: 'knock_retard_pid', fuel: 'petrol', group: 'Zündung', title: 'Klopfregelung (herstellerspezifische PID)',
  requires: ['knock_retard'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const m = c.combine(c.masks.warm, c.mask(i => { const l = c.V('load_abs') || c.V('load_calc'); return l && l[i] > (c.loadIsAbs ? 100 : 60); }));
    const d = c.dur(m);
    if (d < 20) return { status: S.UNCLEAR, note: 'Zu wenig warme Lastfahrt (' + fmtDur(d) + ') für eine Aussage zur Klopfregelung.' };
    const mx = c.agg('knock_retard', m, 'max'), p95 = c.agg('knock_retard', m, 'p95');
    const st = band(p95, 3, 6, true);
    return { status: st, value: p95, unit: '°KW', dec: 1, ref: '≤ 3 ° (p95), Spitze ≤ 8 °', refLo: 0, refHi: 3,
      cond: 'Kühlmittel ≥ 80 °C, hohe Last',
      extra: [['Spitze', fmt(mx, 1) + ' °'], ['Bewertete Zeit', fmtDur(d)]],
      text: st === S.OK
        ? 'Die Klopfregelung greift unter Last nur mit ' + fmt(p95, 1) + ' ° ein (Spitze ' + fmt(mx, 1) + ' °) – das ist die normale Arbeit der Regelung, kein Klopfen.'
        : 'Die Klopfregelung nimmt unter Last regelmäßig ' + fmt(p95, 1) + ' ° zurück (Spitze ' + fmt(mx, 1) + ' °). Ursachen in dieser Reihenfolge: Kraftstoffqualität, Ladelufttemperatur, Ablagerungen im Brennraum, ein defekter Klopfsensor.',
      action: st === S.OK ? null : ['Mit ROZ 98/100 gegenfahren', 'Ladelufttemperatur unter Last prüfen', 'Brennraum endoskopieren'] };
  }
},
{
  id: 'trans_temp', group: 'Getriebe', title: 'Getriebeöltemperatur',
  requires: ['trans_temp'], confidence: 'hoch', provenance: 'gemessen',
  run(c) {
    const m = c.masks.engineOn;
    const d = c.dur(m);
    if (d < 300) return { status: S.UNCLEAR, note: 'Zu wenig Laufzeit für eine Getriebeöl-Bewertung.' };
    const med = c.agg('trans_temp', c.masks.warm, 'median'), mx = c.agg('trans_temp', m, 'max');
    const st = mx > 130 ? S.CRIT : mx > 115 ? S.WARN : S.OK;
    return { status: st, value: mx, unit: '°C', dec: 0, ref: 'Spitze ≤ 115 °C', refLo: 60, refHi: 115,
      extra: [['Median warm', fmt(med, 0) + ' °C'], ['Bewertete Zeit', fmtDur(d)]],
      text: st === S.OK
        ? 'Das Getriebeöl bleibt mit maximal ' + fmt(mx, 0) + ' °C im Rahmen. Bei Doppelkupplung und Wandler altert das Öl ab etwa 120 °C sprunghaft.'
        : 'Das Getriebeöl erreicht ' + fmt(mx, 0) + ' °C. Anhänger, Berg, Stau oder ein zugesetzter Getriebeölkühler – bei Doppelkupplungsgetrieben ist das die häufigste Vorstufe zu Mechatronik- und Kupplungsschäden.',
      action: st === S.OK ? null : ['Getriebeölkühler und Thermostat prüfen', 'Ölwechselintervall des Getriebes einhalten'] };
  }
},
{
  id: 'iat_heat_soak', group: 'Ladeluft', title: 'Ansauglufttemperatur gegen Außenluft',
  requires: ['iat', 'ambient'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    if (c.has('cac_b1')) return { status: S.UNCLEAR, note: 'Bei gemessener Ladelufttemperatur ist diese Prüfung durch die Ladeluft-Regeln abgedeckt.' };
    const m = c.combine(c.masks.moving, c.mask(i => { const s = c.V('speed_mix'); return s && s[i] > 50; }));
    const d = c.dur(m);
    if (d < 120) return { status: S.UNCLEAR, note: 'Zu wenig Fahrt über 50 km/h für eine Aussage.' };
    const iat = c.agg('iat', m, 'median'), amb = c.agg('ambient', m, 'median');
    const delta = iat - amb;
    const st = band(delta, 15, 25, true);
    return { status: st, value: delta, unit: 'K', dec: 1, ref: '≤ 15 K über Außenluft', refLo: 0, refHi: 15,
      cond: 'über 50 km/h',
      extra: [['Ansaugluft', fmt(iat, 0) + ' °C'], ['Außenluft', fmt(amb, 0) + ' °C']],
      text: st === S.OK
        ? 'Die Ansaugluft liegt bei Fahrt nur ' + fmt(delta, 1) + ' K über der Außenluft – die Ansaugung zieht Frischluft, keine Motorraumluft.'
        : 'Die Ansaugluft liegt bei Fahrt ' + fmt(delta, 1) + ' K über der Außenluft. Heiße Ansaugluft kostet Leistung und provoziert Klopfen: Ansaugweg, Luftfilterkasten und Abschirmung zum Krümmer prüfen.',
      action: st === S.OK ? null : ['Ansaugweg auf Motorraum-Ansaugung prüfen', 'Hitzeschild und Dichtungen des Luftfilterkastens prüfen'] };
  }
},

/* ================= Diesel =================
   Diesel kennt weder Zündwinkel noch Lambda-Regelung. Was ihn krank macht – AGR-
   Versottung, DPF-Beladung, Ladedruckregelung – zeigt sich in anderen Größen. */
{
  id: 'dpf_regen', fuel: 'diesel', group: 'Abgas', title: 'Partikelfilter – Regeneration und Temperatur',
  requires: ['dpf_temp'], confidence: 'mittel', provenance: 'abgeleitet',
  run(c) {
    const v = c.V('dpf_temp');
    const on = c.masks.engineOn;
    const d = c.dur(on);
    if (d < 300) return { status: S.UNCLEAR, note: 'Zu wenig Laufzeit für eine Aussage zum Partikelfilter.' };
    // Regeneration: zusammenhängend über 550 °C
    let regen = 0, i = 0, longest = 0;
    while (i < c.N) {
      if (on[i] && v[i] > 550) { let j = i; while (j + 1 < c.N && v[j + 1] > 550) j++;
        const len = (j - i + 1) * c.step; if (len >= 30) { regen += len; if (len > longest) longest = len; } i = j + 1; }
      else i++;
    }
    const mx = c.agg('dpf_temp', on, 'max');
    const share = regen / d;
    let st = mx > 800 ? S.CRIT : share > 0.25 ? S.WARN : S.OK;
    return { status: st, value: mx, unit: '°C', dec: 0, ref: 'Regeneration 550–700 °C, Spitze ≤ 800 °C', refLo: 0, refHi: 800,
      extra: [['Zeit in Regeneration', fmtDur(regen) + ' (' + fmt(share * 100, 0) + ' %)'], ['Längste Regeneration', fmtDur(longest)]],
      text: mx > 800
        ? 'Der Partikelfilter erreicht ' + fmt(mx, 0) + ' °C. Über 800 °C ist die Regeneration außer Kontrolle – meist eine Regeneration, die durch Motorstopp oder Schubbetrieb abgebrochen wurde und im Filter weiterbrennt.'
        : share > 0.25
          ? 'Der Filter regeneriert ' + fmt(share * 100, 0) + ' % der Fahrzeit. Sehr häufige Regenerationen heißen hohe Rußbeladung: Kurzstrecke, defekter Differenzdrucksensor oder ein Motor, der zu viel Ruß erzeugt (AGR, Injektoren).'
          : regen > 0
            ? 'In dieser Fahrt lief ' + fmtDur(regen) + ' Regeneration (Spitze ' + fmt(mx, 0) + ' °C) – planmäßig. Wichtig: eine laufende Regeneration nicht durch Abstellen unterbrechen.'
            : 'Keine Regeneration in dieser Fahrt, Spitze ' + fmt(mx, 0) + ' °C. Für die Beladung des Filters braucht es die herstellerspezifischen Werte Rußmasse und Aschemasse.',
      action: st === S.OK ? null : ['Differenzdruck und Rußmasse im Steuergerät auslesen', 'Regenerationsintervall über mehrere Fahrten beobachten'] };
  }
},
{
  id: 'egr_plausibility', fuel: 'diesel', group: 'Abgas', title: 'Abgasrückführung – Plausibilität',
  requires: ['egr'], confidence: 'niedrig', provenance: 'gemessen',
  run(c) {
    const wot = c.masks.wot, part = c.masks.partLoad;
    const dW = c.dur(wot), dP = c.dur(part);
    if (dP < 60) return { status: S.UNCLEAR, note: 'Zu wenig Teillastfahrt für eine AGR-Bewertung.' };
    const eP = c.agg('egr', part, 'median');
    const eW = dW >= 1 ? c.agg('egr', wot, 'p95') : NaN;
    let st = S.OK, why = '';
    if (isFinite(eW) && eW > 8) { st = S.WARN; why = 'Unter Volllast steht die AGR noch bei ' + fmt(eW, 0) + ' % – dort gehört sie zu.'; }
    if (eP < 2) { st = S.WARN; why += ' In der Teillast bleibt sie bei ' + fmt(eP, 0) + ' % – entweder abgeschaltet, versottet oder stillgelegt.'; }
    return { status: st, value: eP, unit: '%', dec: 0, ref: 'Teillast 5–40 %, Volllast ≈ 0 %', refLo: 5, refHi: 40,
      cond: 'Teillast warm · Volllast',
      extra: [['AGR in der Teillast', fmt(eP, 0) + ' %'], isFinite(eW) ? ['AGR unter Volllast (p95)', fmt(eW, 0) + ' %'] : null],
      text: st === S.OK
        ? 'Die Abgasrückführung arbeitet in der Teillast (' + fmt(eP, 0) + ' %) und schließt unter Volllast' + (isFinite(eW) ? ' (' + fmt(eW, 0) + ' %)' : '') + '. Diese PID zeigt meist den Sollwert, nicht die Ventilstellung – ein versottetes Ventil bleibt hier unsichtbar.'
        : why + ' Diese PID zeigt meist den Sollwert; für die Ist-Stellung und die Regelabweichung braucht es die herstellerspezifischen Messwerte.',
      action: st === S.OK ? null : ['AGR-Ventil und Ansaugbrücke endoskopieren', 'Fehlerspeicher auf AGR-Regelabweichung prüfen', 'Stilllegung ausschließen (Kaufcheck)'] };
  }
},
{
  id: 'boost_diesel_map', fuel: 'diesel', group: 'Aufladung', title: 'Ladedruck bei Volllast (Saugrohrdruck)',
  requires: ['map', 'rpm'], confidence: 'mittel', provenance: 'gemessen',
  run(c) {
    const m = c.combine(c.masks.wot, c.mask(i => { const r = c.V('rpm'); return r && r[i] > 2000 && r[i] < 3800; }));
    const d = c.dur(m);
    if (d < 2) return { status: S.UNCLEAR, note: 'Kein Volllastzug zwischen 2000 und 3800 min⁻¹ – dort liegt der Ladedruck eines Diesels.' };
    const p95 = c.agg('map', m, 'p95'), mx = c.agg('map', m, 'max');
    const baro = c.stats.baro ? c.stats.baro.median : 100;
    const boost = (p95 - baro) / 100;                    // bar Überdruck
    const G = c.P.boostWotGreen;
    let st = G ? inRange(boost, G[0], G[1], 0.2, 0.3) : (boost >= 0.8 ? S.OK : boost >= 0.5 ? S.WARN : S.CRIT);
    return { status: st, value: boost, unit: 'bar', dec: 2,
      ref: G ? G[0] + '–' + G[1] + ' bar' : '≥ 0,8 bar Überdruck', refLo: G ? G[0] : 0.8, refHi: G ? G[1] : 2.0,
      cond: 'Volllast, 2000–3800 min⁻¹',
      extra: [['Saugrohrdruck p95', fmt(p95, 0) + ' kPa'], ['Spitze', fmt(mx, 0) + ' kPa'], ['Umgebungsdruck', fmt(baro, 0) + ' kPa'], ['Bewertete Zeit', fmtDur(d)]],
      text: st === S.OK
        ? 'Unter Volllast baut der Lader ' + fmt(boost, 2) + ' bar Überdruck auf – die Ladedruckregelung erreicht ihr Soll.'
        : 'Unter Volllast kommen nur ' + fmt(boost, 2) + ' bar Überdruck zustande. Beim Diesel die Klassiker: verstellte oder verkokte VTG-Leitschaufeln, ein undichter Ladeluftschlauch, ein hängendes Unterdruckventil – oder ein Notlauf nach Überschreiten des Ladedrucks.',
      action: st === S.OK ? null : ['Fehlerspeicher auf Ladedruck-Regelabweichung prüfen', 'Ladeluftstrecke abdrücken', 'VTG-Verstellung auf Gängigkeit prüfen'] };
  }
},
{
  id: 'maf_diesel_idle', fuel: 'diesel', group: 'Abgas', title: 'Luftmasse im Leerlauf (AGR-Hinweis)',
  requires: ['maf'], confidence: 'niedrig', provenance: 'abgeleitet',
  run(c) {
    const disp = c.P.displacement ? c.P.displacement / 1000 : NaN;
    if (!isFinite(disp)) return { status: S.UNCLEAR, note: 'Ohne Hubraum im Profil lässt sich die Luftmasse nicht einordnen.' };
    const idle = c.masks.idle;
    const d = c.dur(idle);
    if (d < 12) return { status: S.UNCLEAR, note: 'Zu wenig warmer Leerlauf (' + fmtDur(d) + ').' };
    const maf = c.agg('maf', idle, 'median');
    const perL = maf / disp;
    // Beim Diesel ist die Luftmasse im Leerlauf ohne AGR hoch (keine Drosselklappe); mit
    // aktiver AGR sinkt sie. Sehr hohe Werte heißen: AGR bringt nichts. Sehr niedrige: hängt offen.
    const st = perL < 1.5 ? S.WARN : perL > 9 ? S.WARN : S.OK;
    return { status: st, value: perL, unit: 'g/s·L', dec: 2, ref: '2–8 g/s je Liter (warm, AGR aktiv)', refLo: 2, refHi: 8,
      cond: 'warmer Leerlauf',
      extra: [['Luftmasse', fmt(maf, 1) + ' g/s'], ['Hubraum', fmt(disp, 1) + ' L'], ['Leerlaufzeit', fmtDur(d)]],
      text: st === S.OK
        ? 'Im warmen Leerlauf gehen ' + fmt(perL, 1) + ' g/s je Liter Hubraum durch den Luftmassenmesser – plausibel für einen Diesel mit arbeitender Abgasrückführung.'
        : perL < 1.5
          ? 'Im Leerlauf misst der Luftmassenmesser nur ' + fmt(perL, 1) + ' g/s je Liter. Entweder hängt die AGR offen und verdrängt die Frischluft, oder der Messer selbst zeigt zu wenig – beides typische Diesel-Ursachen für Ruß und Leistungsmangel.'
          : 'Im Leerlauf misst der Luftmassenmesser ' + fmt(perL, 1) + ' g/s je Liter – so viel, als würde die AGR gar nicht zurückführen. Ventil klemmt geschlossen oder ist stillgelegt.',
      action: st === S.OK ? null : ['AGR-Regelabweichung im Steuergerät prüfen', 'Luftmassenmesser gegen Sollwert im Leerlauf prüfen'] };
  }
},
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
  const derivedSet = new Set(c.derivedSpecs);
  for (const rule of DIAG_RULES) {
    if (rule.fuel && profile && profile.fuel && rule.fuel !== profile.fuel) {
      out.push(Object.assign({}, rule, { status: S.UNCLEAR,
        note: rule.fuel === 'petrol'
          ? 'Diese Prüfung gilt nur für Ottomotoren. Beim Diesel gibt es weder einen Zündwinkel noch eine Lambda-Gemischkorrektur; an ihre Stelle treten Raildruck, Luftmassen-Soll/Ist, AGR-Regelabweichung und die Mengenabweichung je Zylinder – allesamt herstellerspezifische Messwerte, die im Standard-OBD-Export nicht enthalten sind.'
          : 'Diese Prüfung gilt nur für Dieselmotoren.' }));
      continue;
    }
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
    // Regeln, deren Sollbereich nur aus dem Klassenprofil stammt, werden gekennzeichnet
    const usesDerived = (rule.usesSpec || []).some(k => derivedSet.has(k));
    out.push(Object.assign({}, rule, r, usesDerived ? { specDerived: true } : null));
  }
  const order = { crit: 0, warn: 1, ok: 2, unklar: 3, missing: 4 };
  out.sort((a, b) => (order[a.status] - order[b.status]) || 0);
  const tally = { ok: 0, warn: 0, crit: 0, missing: 0, unklar: 0 };
  out.forEach(r => tally[r.status]++);
  return { results: out, tally, ctx: c };
}
