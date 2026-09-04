/* ===== Bericht ======================================================
   Ein eigenes Dokument, keine abfotografierte Oberfläche: feste Seiten
   im A4-Format, Kopf- und Fußzeile mit Seitenzahl, Inhaltsverzeichnis
   mit echten Seitenzahlen, am Ende eine Seite mit QR-Code und Link.

   Der Inhalt ist auf das zugeschnitten, was eine Werkstatt oder ein
   Käufer braucht: Befunde mit Messwert, Sollbereich, Bedingung und
   Maßnahme; Kennzahlen als Tabelle; keine Bedienelemente, keine
   Erklärkästen, keine Wiederholungen.
   ================================================================== */

/* A4 bei 96 dpi: 297 mm hoch, minus 12 mm Rand oben und unten (@page), minus
   Kopf- und Fußzeile. Bleibt rund 930 px für den Inhalt einer Seite. */
const REP_PAGE_H = 950;      // Body-Raum je Blatt in px (A4 minus Ränder, Kopf und Fuß)
const REP_PAGE_W = 700;

const REPORT_KINDS = {
  werkstatt: { label: 'Werkstatt', hint: 'Befunde, Sollwerte, Prüfschritte',
    parts: ['zusammenfassung', 'befunde', 'fahrt', 'aufzeichnung'] },
  kauf:      { label: 'Kauf',      hint: 'Zustand, Kaufcheck, Fahrzeugakte',
    parts: ['zusammenfassung', 'befunde', 'kaufcheck', 'akte', 'fahrt'] },
  technik:   { label: 'Technik',   hint: 'alles Messbare mit Statistik',
    parts: ['zusammenfassung', 'befunde', 'fahrt', 'gaenge', 'tacho', 'messgroessen', 'ereignisse', 'daten'] },
  kurz:      { label: 'Kurzfassung', hint: 'eine Seite',
    parts: ['zusammenfassung'] }
};

const REP_STATUS_LABEL = { ok: 'unauffällig', warn: 'grenzwertig', crit: 'auffällig', unklar: 'nicht bewertbar', missing: 'PID fehlt' };

function repEl(tag, cls, ...kids) { return el(tag, cls ? { class: cls } : {}, ...kids); }
function repRow(cells, opts) {
  opts = opts || {};
  return el('tr', opts.cls ? { class: opts.cls } : {}, cells.map((c, i) =>
    el(opts.head ? 'th' : 'td', { class: (opts.num && opts.num.includes(i)) ? 'n' : null }, c)));
}
function repTable(head, rows, cls) {
  return el('table', { class: 'rt' + (cls ? ' ' + cls : '') },
    head ? el('thead', {}, repRow(head, { head: true })) : null,
    el('tbody', {}, ...rows));
}
function repH(level, text, sub) {
  return el('div', { class: 'rt-h rt-h' + level },
    el(level === 1 ? 'h2' : 'h3', {}, text), sub ? el('span', {}, sub) : null);
}

/* ---------- Bausteine ---------- */
function repSummary(ds, diag, prof, gears) {
  const out = [], T = (ds && ds.trip) || {};
  const t = diag && diag.tally ? diag.tally : { ok: 0, warn: 0, crit: 0, unklar: 0, missing: 0 };
  const findings = (diag && diag.results) || [];
  const auffaellig = findings.filter(r => r.status === 'crit');
  const grenz = findings.filter(r => r.status === 'warn');

  out.push(repH(1, 'Zusammenfassung'));
  /* Urteil in einem Satz */
  const urteil = auffaellig.length
    ? auffaellig.length + ' Prüfung' + (auffaellig.length > 1 ? 'en liegen' : ' liegt') + ' außerhalb des Sollbereichs, ' + grenz.length + ' im Grenzbereich.'
    : grenz.length
      ? 'Keine Prüfung liegt außerhalb des Sollbereichs; ' + grenz.length + ' Wert' + (grenz.length > 1 ? 'e liegen' : ' liegt') + ' im Grenzbereich.'
      : 'Alle ' + t.ok + ' auswertbaren Prüfungen liegen innerhalb ihrer Sollbereiche.';
  out.push(el('p', { class: 'rt-lead' }, urteil +
    ' Bewertet wurden ' + (t.ok + t.warn + t.crit) + ' von ' + findings.length + ' Regeln; für ' + (t.unklar + t.missing) +
    ' fehlten die nötigen Messgrößen oder Fahrsituationen.'));

  const kpis = [
    ['Fahrtdauer', ds ? fmtDur(ds.duration) : '–'],
    ['Strecke', isFinite(T.dist) ? fmt(T.dist, 1) + ' km' : '–'],
    ['⌀ in Bewegung', isFinite(T.speedAvgMoving) ? fmt(T.speedAvgMoving, 0) + ' km/h' : '–'],
    ['Verbrauch', isFinite(T.consAvg) ? fmt(T.consAvg, 1) + ' L/100km' : '–'],
    ['Kühlmittel max.', isFinite(T.coolantMax) ? fmt(T.coolantMax, 0) + ' °C' : '–'],
    ['Warmlaufzeit', isFinite(T.warmupTime) ? fmtDur(T.warmupTime) : (T.startedWarm ? 'startete warm' : '–')]
  ];
  out.push(el('div', { class: 'rt-kpis' }, kpis.map(([k, v]) => el('div', {}, el('span', {}, k), el('b', {}, v)))));

  /* Ampel */
  out.push(el('div', { class: 'rt-tally' },
    [['ok', t.ok], ['warn', t.warn], ['crit', t.crit], ['unklar', t.unklar], ['missing', t.missing]].map(([k, n]) =>
      el('div', { class: 'rt-t rt-t-' + k }, el('b', {}, String(n)), el('span', {}, REP_STATUS_LABEL[k])))));

  /* Handlungsbedarf zuerst */
  const list = auffaellig.concat(grenz).slice(0, 8);
  if (list.length) {
    out.push(repH(2, 'Was zuerst zu prüfen ist'));
    out.push(repTable(['Befund', 'Messwert', 'Sollbereich', 'Nächster Schritt'],
      list.map(r => repRow([
        el('div', {}, el('b', {}, r.title), el('span', { class: 'rt-dim' }, r.group + ' · ' + REP_STATUS_LABEL[r.status])),
        isFinite(r.value) ? fmt(r.value, r.dec === undefined ? 2 : r.dec) + (r.unit ? ' ' + r.unit : '') : '–',
        r.ref || '–',
        (r.action && r.action.length ? r.action[0] : (r.text || '').split('. ')[0] + '.')
      ], { num: [1] })), 'rt-first'));
  } else {
    out.push(el('p', { class: 'rt-note' }, 'Aus dieser Aufzeichnung ergibt sich kein Handlungsbedarf. Das ist eine Momentaufnahme: erst mehrere Fahrten desselben Fahrzeugs zeigen, ob ein Wert wandert.'));
  }
  if (gears && gears.gears && gears.gears.length) {
    const named = gears.gearbox && (gears.gearbox.mode === 'table' || gears.gearbox.mode === 'count');
    out.push(el('p', { class: 'rt-note' }, 'Getriebe: ' + gears.gears.length + ' ' + (named ? 'Gänge erkannt' : 'Übersetzungsstufen gemessen') +
      (gears.gearbox && gears.gearbox.label ? ' (' + gears.gearbox.label + ')' : '') + '.'));
  }
  return out;
}

function repFindings(diag) {
  const out = [];
  const results = (diag && diag.results) || [];
  if (!results.length) return out;
  out.push(repH(1, 'Befunde im Einzelnen', 'Messwert gegen hinterlegte Werksangabe'));
  const order = { crit: 0, warn: 1, ok: 2, unklar: 3, missing: 4 };
  const groups = new Map();
  results.slice().sort((a, b) => (order[a.status] - order[b.status]) || a.group.localeCompare(b.group))
    .forEach(r => { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group).push(r); });
  for (const [grp, list] of groups) {
    out.push(repH(2, grp));
    for (const r of list) {
      const bewertet = r.status === 'ok' || r.status === 'warn' || r.status === 'crit';
      const kids = [
        el('div', { class: 'rt-f-head' },
          el('span', { class: 'rt-dot rt-' + r.status }),
          el('b', {}, r.title),
          el('span', { class: 'rt-f-val' }, bewertet && isFinite(r.value)
            ? fmt(r.value, r.dec === undefined ? 2 : r.dec) + (r.unit ? ' ' + r.unit : '')
            : REP_STATUS_LABEL[r.status]))
      ];
      const meta = [];
      if (r.ref) meta.push('Soll ' + r.ref);
      if (r.cond) meta.push('gilt bei: ' + r.cond);
      if (r.specDerived) meta.push('Sollwert klassenbasiert, nicht aus dem Profil');
      if (r.confidence) meta.push('Aussagekraft ' + r.confidence);
      if (meta.length) kids.push(el('div', { class: 'rt-f-meta' }, meta.join(' · ')));
      const txt = bewertet ? r.text : (r.note || (r.missing ? 'Nicht aufgezeichnet: ' + r.missing.join(', ') : ''));
      if (txt) kids.push(el('p', {}, txt));
      /* Zusatzangaben können je nach Regel Lücken enthalten – hier nichts voraussetzen */
      const facts = (bewertet && Array.isArray(r.extra) ? r.extra : []).filter(e => Array.isArray(e) && e.length >= 2).slice(0, 6);
      if (facts.length)
        kids.push(el('div', { class: 'rt-f-facts' }, facts.map(([k, v]) => el('span', {}, el('i', {}, k), ' ' + v))));
      if (r.action && r.action.length)
        kids.push(el('ul', { class: 'rt-f-act' }, r.action.map(a => el('li', {}, a))));
      out.push(el('div', { class: 'rt-f rt-f-' + r.status }, ...kids));
    }
  }
  return out;
}

function repDrive(ds, prof) {
  const out = [], T = (ds && ds.trip) || {};
  if (!ds) return out;
  out.push(repH(1, 'Fahrt und Fahrzeug'));
  const specs = (prof && prof.specs) || {};
  const rows = [
    ['Fahrzeugprofil', prof ? prof.name : 'keines gewählt'],
    ['Motor', prof ? (prof.engine || '–') : '–'],
    ['Werksangaben', specs.powerPS ? specs.powerPS + ' PS · ' + specs.torqueNm + ' Nm · Begrenzer ' + specs.redline + ' min⁻¹' : '–'],
    ['Aufzeichnung', App.fileName || '–'],
    ['Zeitraum', timeFormatterFor(ds)(ds.t0) + ' – ' + timeFormatterFor(ds)(ds.t1) + ' (' + fmtDur(ds.duration) + ')'],
    ['Messpunkte', fmt(ds.parsed && ds.parsed.meta ? ds.parsed.meta.rows : ds.N, 0) + ' Zeilen · Raster ' + fmt(ds.step, 1) + ' s']
  ];
  if (App.vin) rows.push(['Fahrgestellnummer', App.vin.vin + (App.vin.maker ? ' · ' + App.vin.maker : '') + (App.vin.modelYear ? ' · Modelljahr ' + App.vin.modelYear : '')]);
  out.push(repTable(null, rows.map(r => repRow([el('b', {}, r[0]), r[1]]))));

  out.push(repH(2, 'Kennzahlen der Fahrt'));
  const num = (v, d, u) => isFinite(v) ? fmt(v, d) + (u ? ' ' + u : '') : '–';
  const k = [
    ['Strecke', num(T.dist, 2, 'km') + (T.distSource ? ' (Quelle: ' + T.distSource + ')' : '')],
    ['In Bewegung', fmtDur(T.movingTime) + ' von ' + fmtDur(ds.duration)],
    ['Stillstand', fmtDur(T.stoppedTime) + ' · ' + (ds.events ? ds.events.stops.length : 0) + ' Stopps'],
    ['Geschwindigkeit', 'Ø ' + num(T.speedAvgMoving, 0, 'km/h') + ' · max ' + num(T.speedMax, 0, 'km/h')],
    ['Drehzahl', 'max ' + num(T.rpmMax, 0, 'min⁻¹') + (specs.redline ? ' (' + fmt(T.rpmMax / specs.redline * 100, 0) + ' % des Begrenzers)' : '')],
    ['Verbrauch', num(T.consAvg, 1, 'L/100km') + ' · ' + num(T.fuelUsed, 2, 'L') + (isFinite(T.cost) ? ' · ' + fmt(T.cost, 2) + ' €' : '')],
    ['CO₂', num(T.co2, 2, 'kg') + (isFinite(T.co2PerKm) ? ' · ' + fmt(T.co2PerKm, 0) + ' g/km' : '')],
    ['Kühlmittel', 'Start ' + num(T.coolantStart, 0, '°C') + ' · max ' + num(T.coolantMax, 0, '°C') + (isFinite(T.warmupTime) ? ' · warm nach ' + fmtDur(T.warmupTime) : '')],
    ['Volllast', ds.events ? fmtDur(ds.events.wot.reduce((a, w) => a + w.dur, 0)) + ' in ' + ds.events.wot.length + ' Zügen' : '–'],
    ['Klopfereignisse', ds.events ? String(ds.events.knock.length) : '–']
  ];
  out.push(repTable(null, k.map(r => repRow([el('b', {}, r[0]), r[1]]))));
  if (ds.events && ds.events.sprints && ds.events.sprints.length) {
    out.push(repH(2, 'Gemessene Beschleunigungswerte', 'aus dem Geschwindigkeitsverlauf, keine Messstrecke'));
    out.push(repTable(['Messung', 'Zeit', '⌀ Beschleunigung'],
      ds.events.sprints.map(s => repRow([s.from + '–' + s.to + ' km/h', fmt(s.dur, 2) + ' s',
        fmt((s.to - s.from) / 3.6 / s.dur / 9.81, 2) + ' g'], { num: [1, 2] }))));
  }
  return out;
}

function repGears(gears) {
  const out = [];
  if (!gears || !gears.gears || !gears.gears.length) return out;
  out.push(repH(1, 'Übersetzungen und Schaltverhalten'));
  const named = gears.gearbox && (gears.gearbox.mode === 'table' || gears.gearbox.mode === 'count');
  out.push(el('p', { class: 'rt-note' }, named
    ? 'Die Gangnummern stammen aus dem angegebenen Getriebe' + (gears.gearbox.label ? ' (' + gears.gearbox.label + ')' : '') + '.'
    : 'Ohne Getriebeangabe werden die gemessenen Stufen nach Übersetzung nummeriert; die Nummern müssen nicht den Gangnummern entsprechen.'));
  out.push(repTable(['Stufe', 'km/h je 1000 min⁻¹', 'Messpunkte', 'Geschwindigkeitsbereich', 'Abweichung zur Tabelle'],
    gears.gears.map(g => repRow([g.label, fmt(g.kmhPer1000, 1), fmt(g.n || 0, 0),
      isFinite(g.vMin) ? fmt(g.vMin, 0) + '–' + fmt(g.vMax, 0) + ' km/h' : '–',
      isFinite(g.dev) ? (g.dev >= 0 ? '+' : '') + fmt(g.dev * 100, 1) + ' %' : '–'], { num: [1, 2, 3, 4] }))));
  const sa = App.ds ? shiftAnalysis(App.ds, gears) : { ok: false };
  if (sa.ok) {
    out.push(repH(2, 'Schaltvorgänge', sa.n + ' Wechsel · Median der Schaltdauer ' + fmt(sa.durMedian, 1) + ' s'));
    out.push(repTable(['Wechsel', 'Anzahl', 'Drehzahl davor', 'danach', 'Pedal'],
      sa.up.concat(sa.down).map(u => repRow([sa.labelOf(u.from) + ' → ' + sa.labelOf(u.to), String(u.n),
        isFinite(u.rpmMed) ? fmt(u.rpmMed, 0) : '–', isFinite(u.rpmAfter) ? fmt(u.rpmAfter, 0) : '–',
        isFinite(u.pedMed) ? fmt(u.pedMed, 0) + ' %' : '–'], { num: [1, 2, 3, 4] }))));
  }
  return out;
}

function repTyres(ds, prof) {
  const out = [];
  if (!ds) return out;
  const r = speedRatioAnalysis(ds.G, ds.grid);
  if (!r.ok) return out;
  const ecu = rollCircumNow();
  const mounted = parseTyre(store.get('tyreMounted', (prof && prof.specs && prof.specs.tyre) || ''));
  const it = tyreInterpretation(r.k, ecu, mounted);
  out.push(repH(1, 'Tacho, Tempomat und Bereifung'));
  out.push(repTable(null, [
    repRow([el('b', {}, 'Reifenfaktor'), fmt(r.k, 4) + ' (GPS ÷ Radsensor, Median aus ' + fmt(r.n, 0) + ' ruhigen Sekunden)']),
    repRow([el('b', {}, 'Radsensor gegenüber GPS'), ((1 / r.k - 1) >= 0 ? '+' : '') + fmt((1 / r.k - 1) * 100, 1) + ' % · Streuung ±' + fmt(r.mad * 100, 2) + ' %']),
    repRow([el('b', {}, 'Wirksamer Abrollumfang'), fmt(it.effectiveCircum, 3) + ' m (Steuergerät rechnet mit ' + fmt(ecu, 3) + ' m)']),
    mounted ? repRow([el('b', {}, 'Montiert laut Angabe'), mounted.label + ' · Abrollumfang neu ' + fmt(mounted.rollCircum, 3) + ' m' +
      (isFinite(it.devMountedPct) ? ' · Abweichung ' + (it.devMountedPct >= 0 ? '+' : '') + fmt(it.devMountedPct, 1) + ' %' : '')]) : null,
    repRow([el('b', {}, 'Tempomat bei 130'), fmt(cruiseTable(r.k, 0, 0, [130])[0].real, 1) + ' km/h tatsächlich'])
  ].filter(Boolean)));
  return out;
}

function repMetrics(ds) {
  const out = [];
  if (!ds) return out;
  const list = Array.from(ds.metrics.values()).filter(m => ds.stats[m.id] && ds.stats[m.id].n > 5)
    .sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.label.localeCompare(b.label));
  if (!list.length) return out;
  out.push(repH(1, 'Messgrößen im Überblick', list.length + ' Größen mit Statistik über die ganze Fahrt'));
  out.push(repTable(['Messgröße', 'Einheit', 'Min', 'Median', 'Ø', 'Max', 'Abdeckung'],
    list.map(m => {
      const s = ds.stats[m.id], cov = ds.coverage[m.id];
      return repRow([m.label, m.unit || '–', fmt(s.min, m.decimals), fmt(s.median, m.decimals),
        fmt(s.meanW, m.decimals), fmt(s.max, m.decimals), isFinite(cov) ? fmt(cov * 100, 0) + ' %' : '–'], { num: [2, 3, 4, 5, 6] });
    })));
  return out;
}

function repEvents(ds) {
  const out = [];
  if (!ds) return out;
  const ev = driveEvents(ds);
  const notes = sortNotes(store.get(notesKey(driveId(ds, App.fileName)), []));
  if (!ev.length && !notes.length) return out;
  out.push(repH(1, 'Ereignisse und Anmerkungen'));
  if (notes.length) {
    out.push(repH(2, 'Anmerkungen des Fahrers'));
    out.push(repTable(['Zeit', 'Anmerkung'], notes.map(n => repRow([timeFormatterFor(ds)(n.t), n.text]))));
  }
  if (ev.length) {
    const counts = {};
    ev.forEach(e => { counts[e.kind] = (counts[e.kind] || 0) + 1; });
    out.push(repH(2, 'Erkannte Ereignisse', Object.keys(counts).map(k => EVENT_KINDS[k].label + ': ' + counts[k]).join(' · ')));
    out.push(repTable(['Zeit', 'Ereignis', 'Einzelheiten'],
      ev.slice(0, 40).map(e => repRow([e.time, EVENT_KINDS[e.kind].label, e.label + (e.detail ? ' · ' + e.detail : '')]))));
  }
  return out;
}

function repBuy(prof) {
  const out = [];
  if (typeof inspections !== 'function') return out;
  const list = inspections();
  const insp = list && list.length ? list[0] : null;
  if (!insp) return out;
  const checks = checksFor(prof, insp);
  const marked = checks.filter(c => insp.marks[c.id]);
  if (!marked.length) return out;
  const sc = inspectionScore(insp, prof);
  out.push(repH(1, 'Kaufcheck', (insp.name || 'Besichtigung') + ' · ' + marked.length + ' von ' + checks.length + ' Punkten geprüft'));
  const kopf = [['Fahrzeug', insp.name || '–'], ['Erstzulassung', insp.year || '–'], ['Kilometerstand', insp.km ? insp.km + ' km' : '–'],
    ['Preis', insp.price ? insp.price + ' €' : '–'], ['Verkäufer', insp.seller || '–'], ['FIN', insp.vin || '–']];
  out.push(repTable(null, kopf.map(r => repRow([el('b', {}, r[0]), r[1]]))));
  const bad = checks.filter(c => insp.marks[c.id] === 'bad');
  if (bad.length) {
    out.push(repH(2, 'Befunde bei der Besichtigung', bad.length + ' Punkte auffällig' + (sc && sc.ko ? ' · davon ' + sc.ko + ' K.-o.-Kriterien' : '')));
    out.push(repTable(['Punkt', 'Phase', 'Worum es geht', 'Kosten'],
      bad.map(c => repRow([el('b', {}, c.title), c.phase || '–', (c.what || '').slice(0, 160), c.cost || '–']))));
  }
  const ok = checks.filter(c => insp.marks[c.id] === 'ok').length;
  const na = checks.filter(c => insp.marks[c.id] === 'na').length;
  out.push(el('p', { class: 'rt-note' }, ok + ' Punkte in Ordnung, ' + bad.length + ' auffällig, ' + na + ' übersprungen, ' +
    (checks.length - marked.length) + ' offen.'));
  return out;
}

async function repAkte(prof) {
  const out = [];
  let rows = [];
  try { rows = await akteAll(); } catch (e) { return out; }
  if (prof) rows = rows.filter(r => !r.profileId || r.profileId === prof.id);
  if (rows.length < 2) return out;
  rows.sort((a, b) => a.date - b.date);
  out.push(repH(1, 'Fahrzeugakte', rows.length + ' gespeicherte Fahrten'));
  out.push(repTable(['Datum', 'Strecke', 'Verbrauch', 'Kühlmittel max.', 'Klopfen', 'Befunde (ok/grenz/auff.)'],
    rows.map(r => repRow([AKTE_FMT_DATE(r.date), isFinite(r.dist) ? fmt(r.dist, 1) + ' km' : '–',
      isFinite(r.consAvg) ? fmt(r.consAvg, 1) + ' L' : '–', isFinite(r.coolantMax) ? fmt(r.coolantMax, 0) + ' °C' : '–',
      String(r.knock || 0), r.tally ? (r.tally.ok || 0) + ' / ' + (r.tally.warn || 0) + ' / ' + (r.tally.crit || 0) : '–'],
      { num: [1, 2, 3, 4] }))));
  const bl = baselineRules(rows).slice(0, 10);
  if (bl.length) {
    out.push(repH(2, 'Eigener Normalbereich', 'aus den gespeicherten Fahrten gelernt, unabhängig vom Werksband'));
    out.push(repTable(['Befund', 'Fahrten', 'Normalwert', 'Streuband', 'Trend je 30 Tage'],
      bl.map(({ id, b }) => {
        const rule = DIAG_RULES.find(x => x.id === id);
        return repRow([rule ? rule.title : id, String(b.n), fmt(b.median, 2) + (b.unit ? ' ' + b.unit : ''),
          '±' + fmt(3 * b.sigma, 2), (b.slope30 >= 0 ? '+' : '') + fmt(b.slope30, 2)], { num: [1, 2, 3, 4] });
      })));
  }
  return out;
}

function repNextRecording(diag) {
  const out = [];
  if (!diag || typeof buildAssist !== 'function') return out;
  const a = buildAssist(diag.results, App.ds ? Object.keys(App.ds.G) : [], App.profile);
  if (a) { a.pids = a.pids || []; a.situations = a.situations || []; }
  if (!a || (!a.pids.length && !a.situations.length)) return out;
  out.push(repH(1, 'Damit die nächste Aufzeichnung mehr beantwortet'));
  if (a.pids.length) {
    out.push(repH(2, 'In der OBD-App zusätzlich aktivieren'));
    out.push(repTable(['Messgröße', 'PID', 'Öffnet Prüfungen'],
      a.pids.slice(0, 14).map(p => repRow([p.label, p.code || '–', String(p.rules.length)], { num: [2] }))));
  }
  if (a.situations.length) {
    out.push(repH(2, 'So fahren'));
    out.push(el('ol', { class: 'rt-steps' }, a.situations.map(s => el('li', {}, el('b', {}, s.title), el('span', {}, s.text)))));
  }
  return out;
}

/* ---------- Seitenumbruch ---------- */
/* Blöcke der Reihe nach in Seiten füllen; ein Block, der nicht mehr passt,
   beginnt die nächste Seite. Tabellen dürfen umbrechen und bekommen dann
   ihre Kopfzeile erneut. */
function repPaginate(blocks, meta) {
  /* Der Umbruch geschieht am echten Layout: jeder Block wird eingehängt und die
     Höhe der Seite gemessen. Ein Ersatzrahmen kam auf andere Werte, weil
     Ränder im Fluss verschmelzen und Tabellen anders umbrechen. */
  const doc = el('div', { class: 'rt-doc rt-measure' });
  let page = null, body = null, pageNo = 0;
  document.body.appendChild(doc);
  const newPage = () => {
    pageNo++;
    body = el('div', { class: 'rt-body' });
    page = el('section', { class: 'rt-page' },
      el('div', { class: 'rt-head' }, el('span', {}, meta.title), el('span', {}, meta.sub)),
      body,
      el('div', { class: 'rt-foot' }, el('span', {}, meta.foot), el('span', { class: 'rt-pageno' }, 'Seite ' + pageNo)));
    doc.appendChild(page);
    return pageNo;
  };
  newPage();
  for (const b of blocks) {
    if (b.page && body.children.length) newPage();
    if (b.mark) b.mark.page = pageNo;
    body.appendChild(b.node);
    if (body.scrollHeight > REP_PAGE_H && body.children.length > 1) {
      body.removeChild(b.node);
      newPage();
      if (b.mark) b.mark.page = pageNo;
      body.appendChild(b.node);
    }
    /* Ein Block, der für sich allein höher ist als eine Seite, läuft im Druck auf
       mehrere Blätter. Der Zähler springt entsprechend weiter, damit die
       Seitenzahlen im Verzeichnis stimmen. */
    if (body.scrollHeight > REP_PAGE_H && body.children.length === 1) {
      pageNo += Math.ceil(body.scrollHeight / REP_PAGE_H) - 1;
      newPage();
    }
  }
  doc.classList.remove('rt-measure');
  doc.remove();
  return { doc, pages: pageNo };
}


/* ---------- Zusammenbau ---------- */
async function buildReportDoc(kindKey) {
  const kind = REPORT_KINDS[kindKey] || REPORT_KINDS.werkstatt;
  const ds = App.ds, prof = App.profile, diag = App.diag, gears = App.gears;
  const now = new Date();
  const title = prof ? prof.name : 'Fahrzeugbericht';
  const meta = { title, sub: (App.fileName || 'ohne Aufzeichnung') + ' · ' + now.toLocaleDateString('de-DE'),
                 foot: 'OBD Telemetrie Studio · ' + kind.label + 'bericht' };

  /* Deckblatt */
  const T = (ds && ds.trip) || {};
  const t = diag && diag.tally ? diag.tally : null;
  const cover = el('section', { class: 'rt-page rt-cover' },
    el('div', { class: 'rt-cover-top' },
      el('div', { class: 'brand-mark' }, 'OBD'),
      el('div', {}, el('b', {}, 'OBD Telemetrie Studio'), el('span', {}, kind.label + 'bericht · ' + kind.hint))),
    el('h1', {}, title),
    el('p', { class: 'rt-cover-sub' },
      (prof ? (profileSpecLine(prof) || prof.engine || '') : 'kein Fahrzeugprofil gewählt')),
    el('div', { class: 'rt-cover-facts' },
      [['Aufzeichnung', App.fileName || '–'],
       ['Gefahren am', ds ? timeFormatterFor(ds)(ds.t0) + ' · ' + fmtDur(ds.duration) : '–'],
       ['Strecke', isFinite(T.dist) ? fmt(T.dist, 1) + ' km' : '–'],
       ['Bericht erstellt', now.toLocaleDateString('de-DE') + ' um ' + now.toLocaleTimeString('de-DE').slice(0, 5)],
       App.vin ? ['Fahrgestellnummer', App.vin.vin] : null].filter(Boolean)
        .map(([k, v]) => el('div', {}, el('span', {}, k), el('b', {}, v)))),
    t ? el('div', { class: 'rt-tally rt-cover-tally' },
      [['ok', t.ok], ['warn', t.warn], ['crit', t.crit], ['unklar', t.unklar], ['missing', t.missing]].map(([k, n]) =>
        el('div', { class: 'rt-t rt-t-' + k }, el('b', {}, String(n)), el('span', {}, REP_STATUS_LABEL[k])))) : null,
    el('p', { class: 'rt-cover-note' },
      'Dieser Bericht wertet eine einzelne OBD2-Aufzeichnung aus und stellt die Messwerte den hinterlegten Werksangaben des Triebwerks gegenüber. ' +
      'Er ersetzt keine Werkstattprüfung: eine Fahrt ist eine Momentaufnahme, und was nicht aufgezeichnet wurde, kann nicht bewertet werden.'));

  /* Inhalte je nach Umfang */
  const parts = [];
  const add = (key, nodes) => { if (nodes && nodes.length) parts.push({ key, nodes }); };
  for (const p of kind.parts) {
    if (p === 'zusammenfassung') add(p, repSummary(ds, diag, prof, gears));
    else if (p === 'befunde') add(p, repFindings(diag));
    else if (p === 'fahrt') add(p, repDrive(ds, prof));
    else if (p === 'gaenge') add(p, repGears(gears));
    else if (p === 'tacho') add(p, repTyres(ds, prof));
    else if (p === 'messgroessen') add(p, repMetrics(ds));
    else if (p === 'ereignisse') add(p, repEvents(ds));
    else if (p === 'kaufcheck') add(p, repBuy(prof));
    else if (p === 'akte') add(p, await repAkte(prof));
    else if (p === 'daten') add(p, repMetrics(ds));
    else if (p === 'aufzeichnung') add(p, repNextRecording(diag));
  }

  /* Inhaltsverzeichnis: Platzhalter, Seitenzahlen kommen nach dem Umbruch */
  const tocRows = [];
  const toc = el('section', { class: 'rt-page rt-toc-sheet' },
    el('div', { class: 'rt-head' }, el('span', {}, title), el('span', {}, meta.sub)),
    el('div', { class: 'rt-body' },
      el('h2', { class: 'rt-toc-title' }, 'Inhalt'),
      el('ol', { class: 'rt-toc' })),
    el('div', { class: 'rt-foot' }, el('span', {}, meta.foot), el('span', { class: 'rt-pageno' }, 'Seite 2')));
  const tocList = toc.querySelector('.rt-toc');

  /* Blöcke für den Umbruch: erste Überschrift jedes Teils markiert den Eintrag */
  const blocks = [];
  parts.forEach((part, i) => {
    part.nodes.forEach((n, j) => {
      const mark = j === 0 ? { key: part.key, node: n } : null;
      if (mark) part.mark = mark;
      blocks.push({ node: n, mark: mark || undefined, page: j === 0 && i > 0 });
    });
  });

  const { doc, pages } = repPaginate(blocks, meta);

  /* Verzeichnis füllen: Seitenzahl = Umbruchseite + 2 (Deckblatt und Inhalt davor) */
  parts.forEach(part => {
    const h = part.nodes[0];
    const label = h.querySelector ? (h.querySelector('h2, h3') || {}).textContent : part.key;
    const sub = h.querySelector && h.querySelector('span') ? h.querySelector('span').textContent : '';
    const no = (part.mark && part.mark.page ? part.mark.page : 1) + 2;
    tocRows.push({ label, sub, no });
    tocList.appendChild(el('li', {},
      el('span', { class: 'rt-toc-label' }, label || part.key),
      el('span', { class: 'rt-toc-dots' }),
      el('span', { class: 'rt-toc-page' }, String(no))));
  });

  /* Schlussseite: Herkunft, Grenzen, QR-Code */
  const url = location.origin + location.pathname;
  let shareUrlStr = null;
  try { if (ds && diag) shareUrlStr = shareUrl(await encodeShare(shareSummary(ds, diag, prof, gears, App.fileName))); } catch (e) {}
  const qrTarget = shareUrlStr && shareUrlStr.length < 2400 ? shareUrlStr : url;
  let qr = null;
  try { qr = qrSvg(qrTarget, { px: 190, quiet: 3, fg: '#000000', bg: '#ffffff' }); } catch (e) { qr = null; }
  const last = el('section', { class: 'rt-page rt-last' },
    el('div', { class: 'rt-head' }, el('span', {}, title), el('span', {}, meta.sub)),
    el('div', { class: 'rt-body' },
      repH(1, 'Woher diese Zahlen stammen'),
      el('p', {},
        'Alle Werte stammen aus der oben genannten Aufzeichnung und wurden im Browser ausgewertet – es wurden keine Daten hochgeladen. ' +
        'Die Sollbereiche kommen aus einem hinterlegten Katalog von Triebwerksdaten; wo für das gewählte Profil keine Werksangabe vorlag, ' +
        'wird gegen einen Klassenwert geprüft, und der Befund sagt das ausdrücklich.'),
      el('p', {},
        'Was der Bericht nicht kann: Er misst nichts, was das Steuergerät nicht liefert, und er sieht das Fahrzeug nicht. ' +
        'Verschleiß an Bremsen, Fahrwerk, Karosserie und alles Mechanische bleibt außen vor. Eine einzelne Fahrt ist eine Momentaufnahme; ' +
        'belastbar wird ein Wert erst im Verlauf über mehrere Aufzeichnungen desselben Fahrzeugs.'),
      repH(2, 'Auswertung selbst öffnen'),
      el('div', { class: 'rt-qr' },
        qr ? el('div', { class: 'rt-qr-img', html: qr }) : null,
        el('div', { class: 'rt-qr-txt' },
          el('p', {}, shareUrlStr === qrTarget && shareUrlStr
            ? 'Der Code führt zu dieser Auswertung: Kennzahlen und Befunde sind im Link selbst enthalten, ohne Server und ohne Konto. Wer ihn öffnet, sieht dieselbe Zusammenfassung im eigenen Browser.'
            : 'Der Code führt zum Werkzeug. Dort lässt sich die zugehörige CSV-Datei laden und dieselbe Auswertung erzeugen.'),
          el('p', { class: 'rt-url' }, qrTarget.length > 120 ? qrTarget.slice(0, 117) + '…' : qrTarget),
          el('p', { class: 'rt-dim' }, 'Werkzeug: ' + url))),
      el('p', { class: 'rt-dim', style: { marginTop: '18px' } },
        'Erstellt mit OBD Telemetrie Studio am ' + now.toLocaleDateString('de-DE') + '. Läuft vollständig im Browser, quelloffen, ohne Datenübertragung.')),
    el('div', { class: 'rt-foot' }, el('span', {}, meta.foot), el('span', { class: 'rt-pageno' }, 'Seite ' + (pages + 3))));

  const wrap = el('div', { id: 'full-report', class: 'rt-doc-wrap' }, cover, toc);
  Array.from(doc.children).forEach(p => wrap.appendChild(p));
  wrap.appendChild(last);
  /* Kopf- und Fußzeilen der Inhaltsseiten um zwei verschieben (Deckblatt, Inhalt) */
  wrap.querySelectorAll('.rt-page .rt-pageno').forEach(n => {
    if (n.closest('.rt-last') || n.closest('.rt-toc-sheet') || n.closest('.rt-cover')) return;
    const m = /Seite (\d+)/.exec(n.textContent);
    if (m) n.textContent = 'Seite ' + (+m[1] + 2);
  });
  return { node: wrap, pages: pages + 3, parts: tocRows.length, kind };
}
