/* ============================================================
   KI-Prompt-Export — die Auswertung als XML-Dokument, das man in
   ChatGPT, Claude oder ein anderes Sprachmodell einfügt.
   Enthält Anleitung, Fahrzeugprofil, Kennzahlen, Befunde und eine
   heruntergerechnete Zeitreihe. Die Rohdatei bleibt außen vor:
   28 MB passen in kein Kontextfenster.
   ============================================================ */

function xesc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
/* In Textinhalten müssen nur & < > maskiert werden — Anführungszeichen dort
   zu escapen macht das Dokument nur schwerer lesbar. */
function xtext(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function xattr(o) {
  const out = [];
  for (const k in o) {
    const v = o[k];
    if (v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v))) continue;
    out.push(k + '="' + xesc(typeof v === 'number' ? round(v) : v) + '"');
  }
  return out.length ? ' ' + out.join(' ') : '';
}
function round(v, d) {
  if (!isFinite(v)) return '';
  const a = Math.abs(v);
  d = d !== undefined ? d : a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4;
  return String(+v.toFixed(d));
}

const AI_DETAIL = {
  kompakt:     { step: 15, hist: 0,  label: 'Kompakt',     hint: 'Kennzahlen und Befunde, Zeitreihe alle 15 s' },
  standard:    { step: 5,  hist: 20, label: 'Standard',    hint: 'zusätzlich Verteilungen, Zeitreihe alle 5 s' },
  vollstaendig:{ step: 2,  hist: 30, label: 'Vollständig', hint: 'feinste Auflösung, Zeitreihe alle 2 s' }
};

const AI_RULES = [
  'Die Werte in diesem Dokument sind bereits ausgewertet. Rechne sie nicht neu und leite keine Zahlen ab, die hier nicht stehen.',
  'Jede Messgröße trägt ein Attribut herkunft. „gemessen“ heißt: vom Steuergerät geliefert. „berechnet“ heißt: von diesem Werkzeug aus anderen Größen abgeleitet. „app-rechenwert“ heißt: die Aufzeichnungs-App hat den Wert selbst errechnet statt gemessen — solche Werte können ein Problem weder belegen noch ausschließen und dürfen nicht als Beweis benutzt werden.',
  'Jeder Befund trägt einen Status. „unauffaellig“, „grenzwertig“ und „auffaellig“ sind bewertete Ergebnisse. „nicht-bewertbar“ heißt: die dafür nötige Fahrsituation kam in dieser Aufzeichnung nicht vor. „pid-fehlt“ heißt: die Messgröße wurde gar nicht aufgezeichnet. Die letzten beiden sind keine Entwarnung, sondern eine Wissenslücke — behandle sie als solche.',
  'Sollwerte tragen ein Attribut sollwert-quelle. Bei „klassenbasiert“ stammt der Sollbereich nicht aus den Werksangaben dieses Motors, sondern aus einem weit gefassten Rückfallwert der Motorbauart. Solche Befunde tragen weniger Gewicht.',
  'Erfinde keine Werksangaben, keine Fehlercodes und keine Messwerte. Fehlt dir etwas für eine Aussage, sage das und benenne, welche Messgröße oder welche Fahrsituation du bräuchtest.',
  'Eine einzelne Fahrt ist eine Momentaufnahme. Formuliere Verdachtsmomente als solche und nenne jeweils, wie sich der Verdacht erhärten oder ausräumen ließe.',
  'Antworte auf Deutsch, sachlich und ohne Panikmache. Wenn alles unauffällig ist, sage das klar, statt Auffälligkeiten zu konstruieren.'
];

const AI_TASKS = [
  'Fasse den technischen Zustand des Motors in wenigen Sätzen zusammen.',
  'Benenne die drei auffälligsten Punkte, jeweils mit der Messgröße, auf die du dich stützt.',
  'Prüfe die Befunde auf Zusammenhänge, die einzeln unauffällig aussehen, gemeinsam aber ein Muster ergeben.',
  'Sage, welche Messgrößen oder Fahrsituationen der nächsten Aufzeichnung fehlen, um die offenen Punkte zu klären.',
  'Nenne konkrete nächste Schritte, nach Aufwand und Nutzen geordnet.'
];

const AI_LIMITS = [
  'Mechanische Zustände ohne eigenen Sensor: Kompression, Ventilspiel, Turbolader-Spiel, Kupplungsverschleiß, Zustand von Fahrwerk und Bremsen.',
  'Ölverbrauch, Ölqualität, Kühlmittelqualität und Füllstände.',
  'Steuerkettenlängung, sofern kein Nockenwellen-Verstellwinkel aufgezeichnet wurde.',
  'Fehlercodes und Freeze-Frame-Daten — dieses Werkzeug wertet nur die Messwertaufzeichnung aus, nicht den Fehlerspeicher.',
  'Alles, was Sichtprüfung braucht: Leckagen, Rost, Unfallspuren, Verschleißbild.'
];

/* --- Hauptfunktion: erzeugt das komplette XML-Dokument --- */
function buildAiPrompt(detailKey) {
  const ds = App.ds, prof = App.profile;
  const D = AI_DETAIL[detailKey] || AI_DETAIL.standard;
  const L = [];
  const p = (s) => L.push(s);
  const xf = ds ? xFormatter() : null;

  p('<?xml version="1.0" encoding="UTF-8"?>');
  p('<obd-fahrtanalyse version="1" sprache="de" erzeugt-von="OBD Telemetrie Studio">');
  p('');

  /* ---- Anleitung ---- */
  p('<anleitung>');
  p('  <was-ist-das>Dies ist die fertig ausgewertete Aufzeichnung einer OBD2-Fahrtdatenerfassung eines Kraftfahrzeugs. ' +
    'Die Rohdatei mit mehreren hunderttausend Messpunkten ist bewusst nicht enthalten — stattdessen findest du hier ' +
    'die Statistik jeder Messgröße, die Ergebnisse eines Diagnose-Regelwerks gegen hinterlegte Werksangaben, ' +
    'die erkannten Fahrereignisse und eine heruntergerechnete Zeitreihe.</was-ist-das>');
  p('  <rolle>Du bist ein erfahrener Kfz-Diagnosetechniker. Du liest Messwerte kritisch, unterscheidest Messung von Rechenwert ' +
    'und sagst offen, wenn die Datenlage für eine Aussage nicht reicht.</rolle>');
  p('  <aufgabe>');
  AI_TASKS.forEach(t => p('    <punkt>' + xtext(t) + '</punkt>'));
  p('  </aufgabe>');
  p('  <umgang-mit-den-daten>');
  AI_RULES.forEach(r => p('    <regel>' + xtext(r) + '</regel>'));
  p('  </umgang-mit-den-daten>');
  p('  <nicht-beantwortbar>');
  p('    <hinweis>Aus einer OBD-Messwertaufzeichnung lassen sich die folgenden Dinge grundsätzlich nicht beurteilen. ' +
    'Behaupte dazu nichts.</hinweis>');
  AI_LIMITS.forEach(t => p('    <punkt>' + xtext(t) + '</punkt>'));
  p('  </nicht-beantwortbar>');
  p('</anleitung>');
  p('');

  /* ---- Fahrzeug ---- */
  if (prof) {
    const R = resolveSpecs(prof);
    const derived = new Set(R.derived);
    p('<fahrzeug>');
    p('  <profil' + xattr({
      name: prof.name, marke: prof.brand, motorfamilie: prof.family,
      motorkennbuchstaben: (prof.engineCode || []).join(', '),
      baujahre: prof.years ? prof.years[0] + '–' + prof.years[1] : '',
      fahrzeuge: prof.models,
      kraftstoff: prof.fuel === 'diesel' ? 'Diesel' : 'Benzin',
      aufladung: prof.aspiration,
      datenlage: prof.custom ? 'vom Nutzer selbst eingetragen'
                : prof.generic ? 'allgemeines Klassenprofil, keine Werksangaben eines konkreten Motors'
                : prof.confidence === 'hoch' ? 'Werksangaben belegt' : 'Werksangaben teilweise belegt'
    }) + '/>');
    const NAMES = {
      displacement: ['Hubraum', 'cm³'], bore: ['Bohrung', 'mm'], stroke: ['Hub', 'mm'],
      compression: ['Verdichtung', ':1'], powerPS: ['Leistung', 'PS'], powerKW: ['Leistung', 'kW'],
      torqueNm: ['Drehmoment', 'Nm'], redline: ['Drehzahlbegrenzer', 'min⁻¹'],
      thermostat: ['Thermostat-Öffnung', '°C'], boostMaxBar: ['Ladedruck Werk', 'bar'],
      massKg: ['Leergewicht', 'kg'], consNEDC: ['Normverbrauch', 'L/100km'],
      consReal: ['Realverbrauch', 'L/100km'], co2NEDC: ['CO₂ Norm', 'g/km'],
      accel0100: ['0–100 km/h', 's'], vmax: ['Höchstgeschwindigkeit', 'km/h'],
      banks: ['Zylinderbänke', ''], timingDrive: ['Steuertrieb', ''],
      fuelSpec: ['Kraftstoff', ''], oilSpec: ['Motoröl', ''], injection: ['Einspritzung', ''],
      ecu: ['Steuergerät', ''], gearbox: ['Getriebe', ''], tyre: ['Bereifung', '']
    };
    const RANGES = {
      powerRpm: ['Nennleistung bei', 'min⁻¹'], torqueRpm: ['Nenndrehmoment bei', 'min⁻¹'],
      idleWarm: ['Leerlauf warm', 'min⁻¹'], idleCold: ['Leerlauf kalt', 'min⁻¹'],
      coolantGreen: ['Kühlmittel Sollbereich', '°C'], loadWotGreen: ['Absolute Last bei Volllast', '%'],
      loadIdleGreen: ['Absolute Last im Leerlauf', '%'], boostWotGreen: ['Ladedruck bei Volllast', 'bar']
    };
    p('  <werksangaben>');
    for (const k in NAMES) {
      const v = R.specs[k];
      if (v === undefined || v === null || v === '') continue;
      p('    <angabe' + xattr({ groesse: NAMES[k][0], schluessel: k, wert: v, einheit: NAMES[k][1],
        quelle: derived.has(k) ? 'klassenbasiert' : 'profil' }) + '/>');
    }
    for (const k in RANGES) {
      const v = R.specs[k];
      if (!v || !v.length) continue;
      p('    <angabe' + xattr({ groesse: RANGES[k][0], schluessel: k, von: v[0], bis: v[1],
        einheit: RANGES[k][1], quelle: derived.has(k) ? 'klassenbasiert' : 'profil' }) + '/>');
    }
    p('  </werksangaben>');
    if (prof.weakSpots && prof.weakSpots.length) {
      p('  <bekannte-schwachstellen hinweis="Dokumentierte Schwachpunkte dieser Motorbaureihe. Prüfe, ob die Messwerte eine davon stützen.">');
      prof.weakSpots.forEach(w => p('    <schwachstelle' + xattr({ titel: w.t, ab: w.km }) + '>' + xtext(w.s) + '</schwachstelle>'));
      p('  </bekannte-schwachstellen>');
    }
    p('</fahrzeug>');
    p('');
  }

  if (!ds) {
    p('<hinweis>Es ist keine Messwertaufzeichnung geladen. Dieses Dokument enthält nur das Fahrzeugprofil' +
      (typeof BUY_CHECKS !== 'undefined' ? ' und den Stand der Kaufcheckliste' : '') + '.</hinweis>');
    appendInspection(p);
    p('</obd-fahrtanalyse>');
    return L.join('\n');
  }

  /* ---- Aufzeichnung ---- */
  const m = ds.meta, T = ds.trip;
  p('<aufzeichnung>');
  p('  <datei' + xattr({ name: App.fileName, format: m.format === 'long' ? 'Long-Format (eine Zeile je Messwert)' : 'Wide-Format (eine Spalte je Messgröße)',
    datenzeilen: m.rows, messreihen: m.seriesCount, uebersprungen: m.skipped }) + '/>');
  p('  <zeitraum' + xattr({ von: xf(ds.t0), bis: xf(ds.t1), dauer_s: round(ds.duration, 0),
    auswerteraster_s: round(ds.step, 3), stuetzstellen: ds.N }) + '/>');
  if (m.gpsPoints) p('  <gps' + xattr({ punkte: m.gpsPoints, quelle: m.gpsSource,
    verworfene_ausreisser: ds.track ? ds.track.rejected : 0,
    luecken: ds.track ? ds.track.gaps.length : 0 }) + '/>');
  if (ds.notices.length) {
    p('  <erkannte-artefakte hinweis="Dieses Werkzeug hat folgende Eigenheiten der Aufzeichnung erkannt und bereits berücksichtigt.">');
    ds.notices.forEach(n => p('    <artefakt' + xattr({ stufe: n.level, titel: n.title }) + '>' + xtext(n.text) + '</artefakt>'));
    p('  </erkannte-artefakte>');
  }
  if (T.unknownTime > ds.duration * 0.05)
    p('  <luecke groesse="Geschwindigkeit"' + xattr({ dauer_s: round(T.unknownTime, 0) }) +
      '>Für diesen Teil der Fahrt liegt keine Geschwindigkeit vor. Alle geschwindigkeitsabhängigen Kennzahlen beziehen sich ausschließlich auf den abgedeckten Zeitraum.</luecke>');
  p('</aufzeichnung>');
  p('');

  /* ---- Fahrt-Kennzahlen ---- */
  const K = [
    ['Fahrtdauer', T.duration, 's'], ['Zeit in Bewegung', T.movingTime, 's'],
    ['Standzeit', T.stoppedTime, 's'], ['Leerlaufzeit', T.idleTime, 's'],
    ['Strecke', T.dist, 'km', T.distSource], ['davon Luftlinie über GPS-Lücken', T.gapDist, 'km'],
    ['Durchschnittsgeschwindigkeit in Bewegung', T.speedAvgMoving, 'km/h'],
    ['Höchstgeschwindigkeit', T.speedMax, 'km/h'],
    ['Kraftstoff verbraucht', T.fuelUsed, 'L'], ['Verbrauch', T.consAvg, 'L/100km'],
    ['Kosten', T.cost, '€'], ['CO2', T.co2, 'kg'], ['CO2 je km', T.co2PerKm, 'g/km'],
    ['Durchschnittsdrehzahl', T.rpmAvg, 'min⁻¹'], ['Höchstdrehzahl', T.rpmMax, 'min⁻¹'],
    ['Maximaler Ladedruck', T.boostMax, 'bar'], ['Maximale absolute Motorlast', T.loadMax, '%'],
    ['Maximale Kühlmitteltemperatur', T.coolantMax, '°C'],
    ['Kühlmitteltemperatur beim Start', T.coolantStart, '°C'],
    ['Warmlaufzeit auf 85 °C', T.warmupTime, 's'],
    ['Zeitanteil über 4000 min⁻¹', T.timeHighRpm * 100, '%'],
    ['Vollgasanteil', T.wotShare * 100, '%', T.wotSignal],
    ['Schubanteil', T.coastShare * 100, '%'],
    ['Höhenmeter bergauf', T.ascent, 'm'], ['Höhenmeter bergab', T.descent, 'm']
  ];
  p('<fahrt>');
  K.forEach(([n, v, u, q]) => { if (isFinite(v)) p('  <kennzahl' + xattr({ name: n, wert: v, einheit: u, quelle: q }) + '/>'); });
  p('  <stopps' + xattr({ anzahl: ds.events.stops.length }) + '/>');
  p('</fahrt>');
  p('');

  /* ---- Messgrößen ---- */
  p('<messgroessen hinweis="Ø ist zeitgewichtet. p05 und p95 sind robuster als Minimum und Maximum, die ein einzelner Ausreißer bestimmt.">');
  Array.from(ds.metrics.values()).forEach(mm => {
    const s = ds.stats[mm.id]; if (!s) return;
    const herkunft = mm.derived ? 'berechnet'
      : (mm.id === 'boost' && ds.boostDerived) || mm.id === 'power' || /^cons_(avg|10s|inst)$/.test(mm.id)
        ? 'app-rechenwert' : 'gemessen';
    p('  <messgroesse' + xattr({
      id: mm.id, label: mm.label, einheit: mm.unit, herkunft: herkunft,
      pid: mm.rawName, umgerechnet_aus: mm.converted ? mm.srcUnit : '',
      n: s.n, abdeckung: round((ds.coverage[mm.id] || 0) * 100, 0),
      min: s.min, p05: s.p05, median: s.median, mittel: s.meanW, p95: s.p95, max: s.max, std: s.std
    }) + '/>');
  });
  p('</messgroessen>');
  p('');

  /* ---- Befunde ---- */
  const STAT = { ok: 'unauffaellig', warn: 'grenzwertig', crit: 'auffaellig', unklar: 'nicht-bewertbar', missing: 'pid-fehlt' };
  p('<befunde' + xattr({ unauffaellig: App.diag.tally.ok, grenzwertig: App.diag.tally.warn,
    auffaellig: App.diag.tally.crit, nicht_bewertbar: App.diag.tally.unklar, pid_fehlt: App.diag.tally.missing }) + '>');
  App.diag.results.forEach(r => {
    p('  <befund' + xattr({
      id: r.id, titel: r.title, gruppe: r.group, status: STAT[r.status] || r.status,
      wert: isFinite(r.value) ? round(r.value, r.dec) : '', einheit: r.unit,
      soll: r.ref, aussagekraft: r.confidence, herkunft: r.provenance,
      sollwert_quelle: r.specDerived ? 'klassenbasiert' : (r.ref ? 'profil' : ''),
      ohne_ampel: r.noLight ? 'ja' : ''
    }) + '>');
    if (r.text) p('    <bewertung>' + xtext(r.text) + '</bewertung>');
    if (r.note) p('    <einschraenkung>' + xtext(r.note) + '</einschraenkung>');
    if (r.missing) p('    <fehlende-messgroessen>' + xtext(r.missing.join(', ')) + '</fehlende-messgroessen>');
    (r.extra || []).filter(Boolean).forEach(([k, v]) => p('    <detail' + xattr({ name: k, wert: v }) + '/>'));
    (r.action || []).forEach(a => p('    <massnahme>' + xtext(a) + '</massnahme>'));
    p('  </befund>');
  });
  p('</befunde>');
  p('');

  /* ---- Ereignisse ---- */
  p('<ereignisse>');
  ds.events.sprints.forEach(s => p('  <beschleunigung' + xattr({
    von_kmh: s.from, bis_kmh: s.to, sekunden: round(s.dur, 2), zeitpunkt: xf(s.t0),
    mittlere_beschleunigung_g: round(s.avgA / 9.80665, 2) }) + '/>'));
  ds.events.wot.slice(0, 12).sort((a, b) => a.t0 - b.t0).forEach(w => p('  <volllastzug' + xattr({
    zeitpunkt: xf(w.t0), dauer_s: round(w.dur, 1), drehzahl_von: round(w.rpm0, 0), drehzahl_bis: round(w.rpmMax, 0),
    ladedruck_max_bar: round(w.boostMax, 2), leistung_max_ps: round(w.powerMax, 0),
    zuendwinkel_min: round(w.timingMin, 1), ladeluft_max_c: round(w.cacMax, 0),
    tempo_von: round(w.speed0, 0), tempo_bis: round(w.speed1, 0) }) + '/>'));
  ds.events.knock.slice(0, 12).forEach(k => p('  <zuendwinkel-ruecknahme-unter-last' + xattr({
    zeitpunkt: xf(k.t0), dauer_s: round(k.dur, 1), zuendwinkel_min: round(k.timingMin, 1),
    drehzahl_max: round(k.rpmMax, 0) }) + '/>'));
  ds.events.stops.slice(0, 12).forEach(s => p('  <stopp' + xattr({ zeitpunkt: xf(s.t0), dauer_s: round(s.dur, 0) }) + '/>'));
  p('</ereignisse>');
  p('');

  /* ---- Betriebszustände und Gänge ---- */
  p('<betriebszustaende hinweis="Zeitanteil der Fahrt je Zustand.">');
  ds.phases.defs.forEach(ph => {
    const t = ds.phases.time[ph.id];
    if (t > 0) p('  <zustand' + xattr({ name: ph.label, sekunden: round(t, 0), anteil_prozent: round(t / ds.duration * 100, 1) }) + '/>');
  });
  p('</betriebszustaende>');
  if (App.gears && App.gears.gears.length > 1) {
    p('<gaenge' + xattr({ hinweis: 'Aus dem Verhältnis Drehzahl zu Geschwindigkeit geclustert, nicht aus einer Tabelle. Nummeriert nach Übersetzung, nicht nach Gangnummer.',
      zugeordnete_punkte_prozent: round(App.gears.coverage * 100, 0) }) + '>');
    App.gears.gears.forEach(g => p('  <stufe' + xattr({ bezeichnung: g.label,
      kmh_je_1000_umdrehungen: round(g.kmhPer1000, 1), gesamtuebersetzung: g.ratio ? round(g.ratio, 2) : '',
      genutzt_von_kmh: round(g.vMin, 0), genutzt_bis_kmh: round(g.vMax, 0),
      max_drehzahl: round(g.rpmMax, 0), sekunden: round(g.time, 0) }) + '/>'));
    p('</gaenge>');
  }
  p('');

  /* ---- Verteilungen ---- */
  if (D.hist) {
    const wanted = ['rpm', 'speed_mix', 'load_abs', 'boost', 'timing', 'coolant', 'cac_mean', 'cons_calc'];
    const av = wanted.filter(id => ds.G[id] && ds.stats[id]);
    if (av.length) {
      p('<verteilungen hinweis="Zeit in Sekunden je Werteklasse, gleichmäßig von min bis max aufgeteilt. Die Reihenfolge der Zahlen entspricht den Klassen von unten nach oben.">');
      av.forEach(id => {
        const st = ds.stats[id], mm = ds.metrics.get(id);
        const h = histogram(ds.G[id], D.hist, st.min, st.max, null, ds.step);
        if (!h) return;
        p('  <verteilung' + xattr({ metrik: id, label: mm.label, einheit: mm.unit,
          von: round(h.lo), bis: round(h.hi), klassen: h.bins, klassenbreite: round(h.w) }) + '>' +
          Array.from(h.counts).map(v => round(v, 1)).join(' ') + '</verteilung>');
      });
      p('</verteilungen>');
      p('');
    }
  }

  /* ---- Zeitreihe ---- */
  const cols = ['speed_mix', 'rpm', 'load_abs', 'boost', 'timing', 'fuel_rate', 'coolant', 'cac_mean',
                'ltft_mean', 'pedal', 'accel', 'power'].filter(id => ds.G[id]);
  if (cols.length) {
    const every = Math.max(1, Math.round(D.step / ds.step));
    const head = ['zeit_s'].concat(cols.map(id => id + '[' + (ds.metrics.get(id).unit || '-') + ']'));
    const rows = [];
    for (let i = 0; i < ds.N; i += every) {
      const line = [round(ds.grid[i] - ds.t0, 1)];
      let any = false;
      for (const id of cols) {
        const v = ds.G[id][i];
        if (v === v) { line.push(round(v, ds.metrics.get(id).decimals)); any = true; }
        else line.push('');
      }
      if (any) rows.push(line.join(';'));
    }
    p('<zeitreihe' + xattr({ intervall_s: D.step, zeilen: rows.length, trennzeichen: 'Semikolon',
      hinweis: 'Zeit in Sekunden seit Aufzeichnungsbeginn. Leere Felder bedeuten: für diesen Zeitpunkt liegt kein Wert vor — nicht null.' }) + '>');
    p(head.join(';'));
    rows.forEach(r => p(r));
    p('</zeitreihe>');
    p('');
  }

  appendInspection(p);
  p('</obd-fahrtanalyse>');
  return L.join('\n');
}

/* Kaufcheck anhängen, wenn eine Besichtigung begonnen wurde */
function appendInspection(p) {
  if (typeof inspections !== 'function') return;
  const list = inspections();
  const id = store.get('activeInspection', null);
  const insp = list.find(x => x.id === id) || list[0];
  if (!insp) return;
  const marks = Object.keys(insp.marks || {});
  if (!marks.length && !insp.name) return;
  const prof = App.profile;
  const checks = checksFor(prof);
  const sc = inspectionScore(insp, prof);
  p('');
  p('<kaufcheck' + xattr({ fahrzeug: insp.name, erstzulassung: insp.year, kilometerstand: insp.km,
    preis_eur: insp.price, verkaeufer: insp.seller,
    geprueft: sc.done, punkte_gesamt: sc.total, befunde: sc.bad, abbruchkriterien: sc.ko }) + '>');
  p('  <hinweis>Stand einer Gebrauchtwagen-Besichtigung. „nicht geprueft“ bedeutet offen, nicht in Ordnung.</hinweis>');
  checks.forEach(c => {
    const mk = insp.marks[c.id];
    if (!mk && !insp.notes[c.id]) return;
    p('  <punkt' + xattr({ id: c.id, phase: c.phase, titel: c.title, schweregrad: c.severity,
      ergebnis: mk === 'ok' ? 'in-ordnung' : mk === 'bad' ? 'befund' : mk === 'na' ? 'uebersprungen' : 'nicht-geprueft',
      kosten: mk === 'bad' ? c.cost : '' }) + '>');
    if (mk === 'bad') p('    <warnsignal>' + xtext(c.bad) + '</warnsignal>');
    if (insp.notes[c.id]) p('    <notiz>' + xtext(insp.notes[c.id]) + '</notiz>');
    p('  </punkt>');
  });
  p('</kaufcheck>');
}
