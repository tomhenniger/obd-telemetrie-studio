/* ---------------------------------------------------------------------------
   Aufzeichnungs-Assistent.

   Nach jeder Datei weiß die Diagnose genau, warum eine Regel nichts sagen konnte:
   die PID fehlt, oder die Fahrsituation kam nicht vor. Beides lässt sich beim
   nächsten Mal vermeiden – wenn man es vorher weiß. Dieses Modul macht aus den
   Befunden "pid-fehlt" und "nicht bewertbar" einen Zettel fürs Handy: diese PIDs
   in der App anhaken, diese Situationen fahren.
--------------------------------------------------------------------------- */

/* Was eine Regel an Fahrsituation braucht. Eine Regel kann mehrere brauchen. */
const RULE_NEEDS = {
  coolant_warmup:     ['kaltstart'],
  coolant_operating:  ['warm'],
  cac_absolute:       ['warm', 'volllast'],
  cac_over_ambient:   ['warm', 'teillast'],
  cac_bank_delta:     ['warm', 'volllast'],
  cac_recovery:       ['warm', 'volllast_mehrfach'],
  ltft_b1: ['warm'], ltft_b2: ['warm'], ltft_bank_delta: ['warm'], ltft_load_dep: ['warm', 'teillast', 'volllast'],
  stft_bias:          ['warm'],
  lambda_closed_loop: ['warm', 'teillast'],
  o2_switching:       ['warm', 'teillast'],
  load_wot:           ['warm', 'volllast'],
  load_idle:          ['warm', 'leerlauf'],
  boost_wot:          ['warm', 'volllast'],
  boost_diesel_map:   ['warm', 'volllast'],
  timing_wot:         ['warm', 'volllast'],
  timing_partload:    ['warm', 'teillast'],
  timing_trend:       ['warm', 'volllast_mehrfach'],
  knock_retard_pid:   ['warm', 'volllast'],
  idle_rpm:           ['warm', 'leerlauf'],
  rpm_limit:          ['volllast'],
  speed_cross:        ['gps'],
  baro_sanity:        [],
  start_voltage:      ['kaltstart'],
  boost_spool:        ['volllast_mehrfach'],
  fuel_econ:          ['ruhig', 'strecke'],
  power_estimate:     ['warm', 'volllast'],
  pedal_scaling:      ['volllast'],
  oil_temp:           ['warm', 'laufzeit'],
  cat_temp:           ['warm'],
  maf_sanity:         ['warm', 'leerlauf'],
  maf_diesel_idle:    ['warm', 'leerlauf'],
  fuel_pressure:      ['leerlauf', 'volllast'],
  batt_voltage:       ['laufzeit'],
  trans_temp:         ['laufzeit'],
  iat_heat_soak:      ['teillast'],
  dpf_regen:          ['laufzeit'],
  egr_plausibility:   ['warm', 'teillast', 'volllast']
};

/* Wie man die Situation herstellt – in der Reihenfolge, in der man sie fährt. */
const SITUATIONS = {
  kaltstart:         { order: 1, title: 'Kaltstart aufzeichnen', text: 'Aufzeichnung starten, BEVOR der Motor läuft – bei Kühlmittel unter 50 °C. Die ersten zehn Minuten sind das Warmlaufverhalten; sie fehlen, wenn die App erst unterwegs gestartet wird.' },
  laufzeit:          { order: 2, title: 'Mindestens 15 Minuten am Stück', text: 'Kurze Aufzeichnungen lassen Öl, Getriebe und Bordnetz nie ihren Beharrungszustand erreichen. Erst danach sagen die Temperaturen etwas.' },
  warm:              { order: 3, title: 'Bis zur Betriebstemperatur fahren', text: 'Die meisten Regeln bewerten erst ab 80 °C Kühlmittel. Zehn Minuten Fahrt reichen im Sommer, im Winter eher fünfzehn.' },
  leerlauf:          { order: 4, title: '60 Sekunden warmer Leerlauf im Stand', text: 'Nach dem Warmfahren anhalten, Motor laufen lassen, Fuß vom Gas, keine Klimaanlage schalten. Leerlaufdrehzahl, -ruhe, Leerlauflast und Luftmasse brauchen ein ruhiges Fenster ohne Rollen.' },
  teillast:          { order: 5, title: 'Zwei Minuten Konstantfahrt', text: 'Landstraße oder Autobahn, 70–100 km/h, ohne Gasstöße, möglichst eben. Hier werden Gemischregelung, Lambdasonde und Ladeluftkühlung bewertet.' },
  volllast:          { order: 6, title: 'Ein Volllastzug', text: 'Warmer Motor, gerade und freie Strecke, Pedal ganz durchtreten von etwa 2500 bis kurz vor den Begrenzer – drei bis fünf Sekunden genügen. Autobahnauffahrt oder Kraftfahrstraße, nie bei Nässe.' },
  volllast_mehrfach: { order: 7, title: 'Drei Volllastzüge mit je einer ruhigen Minute danach', text: 'Zwischen den Zügen eine Minute gleichmäßig weiterfahren, ohne Gas. Nur so lässt sich die Rückkühlung der Ladeluft messen und ein Trend über die Züge bilden.' },
  ruhig:             { order: 8, title: 'Eine ruhige Fahrt über 5 km', text: 'Für den Verbrauchsvergleich gegen den Normwert: weniger als 5 % Vollgas, wenig Stillstand, 30–90 km/h im Mittel.' },
  strecke:           { order: 8, title: 'Streckenzähler mitloggen', text: 'Die PID „Distance travelled“ (oder GPS) muss die ganze Fahrt abdecken, sonst passen Kraftstoff und Strecke nicht zusammen.' },
  gps:               { order: 9, title: 'GPS in der App einschalten', text: 'Ohne Positionsdaten gibt es weder Karte noch Höhenprofil noch die Gegenprobe der Geschwindigkeit.' }
};

/* Wie die Messgrößen in den gängigen Apps heißen – damit der Zettel mit dem
   Bildschirm der App zusammenpasst, nicht nur mit unseren Bezeichnungen. */
const PID_HINTS = {
  rpm:        { app: 'Engine RPM', code: '01 0C' },
  speed:      { app: 'Vehicle speed', code: '01 0D' },
  coolant:    { app: 'Engine coolant temperature', code: '01 05' },
  load_abs:   { app: 'Absolute load value', code: '01 43' },
  load_calc:  { app: 'Calculated engine load', code: '01 04' },
  timing:     { app: 'Timing advance', code: '01 0E' },
  ltft_b1:    { app: 'Long term fuel % trim - Bank 1', code: '01 07' },
  ltft_b2:    { app: 'Long term fuel % trim - Bank 2', code: '01 09' },
  stft_b1:    { app: 'Short term fuel % trim - Bank 1', code: '01 06' },
  cac_b1:     { app: 'Charge Air Cooler Temperature Bank 1, Sensor 1', code: '01 77' },
  cac_b2:     { app: 'Charge Air Cooler Temperature Bank 2, Sensor 1', code: '01 77' },
  pedal:      { app: 'Absolute pedal position D', code: '01 49' },
  throttle:   { app: 'Throttle position', code: '01 11' },
  map:        { app: 'Intake manifold absolute pressure', code: '01 0B' },
  boost:      { app: 'Intake manifold absolute pressure (statt „Calculated boost“)', code: '01 0B' },
  maf:        { app: 'Mass air flow rate', code: '01 10' },
  iat:        { app: 'Intake air temperature', code: '01 0F' },
  ambient:    { app: 'Ambient air temperature', code: '01 46' },
  oil_temp:   { app: 'Engine oil temperature', code: '01 5C' },
  cat_temp_b1:{ app: 'Catalyst Temperature Bank 1 Sensor 1', code: '01 3C' },
  cat_temp_b2:{ app: 'Catalyst Temperature Bank 2 Sensor 1', code: '01 3E' },
  lambda:     { app: 'Commanded equivalence ratio', code: '01 44' },
  o2_b1s1:    { app: 'O2 Sensor 1 Bank 1 Voltage (Sprungsonde)', code: '01 14' },
  fuel_press: { app: 'Fuel pressure / Fuel rail pressure', code: '01 0A / 01 23' },
  fuel_rate:  { app: 'Engine fuel rate', code: '01 5E' },
  fuel_used:  { app: 'Fuel used (App-Zähler)', code: 'App' },
  distance:   { app: 'Distance travelled (App-Zähler)', code: 'App' },
  batt:       { app: 'Control module voltage', code: '01 42' },
  trans_temp: { app: 'Transmission temperature (herstellerspezifisch)', code: 'Hersteller' },
  knock_retard:{ app: 'Knock retard (herstellerspezifisch)', code: 'Hersteller' },
  baro:       { app: 'Barometric pressure', code: '01 33' },
  speed_gps:  { app: 'Speed (GPS)', code: 'App' },
  dpf_temp:   { app: 'DPF temperature (herstellerspezifisch)', code: 'Hersteller' },
  egr:        { app: 'Commanded EGR', code: '01 2C' }
};

/* Aus den Diagnoseergebnissen den Zettel bauen.
   results: Array der Befunde mit status/missing/id; present: welche Metrik-IDs da sind. */
function buildAssist(results, present, profile) {
  const presentSet = new Set(present || []);
  const pids = new Map();          // metric id -> Regeln, die daran hängen
  const sits = new Map();          // situation -> Regeln, die daran hängen
  const diesel = profile && profile.fuel === 'diesel';
  for (const r of results || []) {
    if (r.status === 'missing') {
      const need = r.requires || [];
      for (const id of need) {
        if (presentSet.has(id)) continue;
        if (!pids.has(id)) pids.set(id, []);
        pids.get(id).push(r.id);
      }
    } else if (r.status === 'unklar' && !r.noLight && !(r.fuel && profile && profile.fuel && r.fuel !== profile.fuel)) {
      // gesperrte Regeln der anderen Kraftstoffart sind keine fehlende Fahrsituation
      const needs = RULE_NEEDS[r.id] || [];
      for (const s of needs) { if (!sits.has(s)) sits.set(s, []); sits.get(s).push(r.id); }
    }
  }
  // Ohne GPS-Quelle die GPS-Situation ergänzen, auch wenn keine Regel sie nennt
  if (!presentSet.has('speed_gps') && !presentSet.has('speed') && !sits.has('gps')) sits.set('gps', []);
  const pidList = Array.from(pids.entries()).map(([id, rules]) => {
    const h = PID_HINTS[id] || {};
    const label = (typeof METRIC_BY_ID !== 'undefined' && METRIC_BY_ID[id]) ? METRIC_BY_ID[id].label : id;
    return { id, label, app: h.app || label, code: h.code || '', rules, weight: rules.length };
  }).sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label, 'de'));
  const sitList = Array.from(sits.entries()).map(([key, rules]) => Object.assign({ key, rules }, SITUATIONS[key] || { order: 99, title: key, text: '' }))
    .sort((a, b) => a.order - b.order);
  // Was jetzt schon geht – zur Ermutigung, nicht zur Zierde
  const answered = (results || []).filter(r => r.status === 'ok' || r.status === 'warn' || r.status === 'crit').length;
  return { pids: pidList, situations: sitList, answered, total: (results || []).length, diesel };
}

/* Als Klartext, zum Kopieren oder Teilen aufs Handy. */
function assistText(a, profileName) {
  const L = [];
  L.push('Aufzeichnungs-Zettel' + (profileName ? ' – ' + profileName : ''));
  L.push('Stand: ' + a.answered + ' von ' + a.total + ' Prüfungen konnten bewertet werden.');
  if (a.pids.length) {
    L.push(''); L.push('In der OBD-App zusätzlich aufzeichnen:');
    a.pids.forEach(p => L.push('  [ ] ' + p.app + (p.code ? '  (' + p.code + ')' : '') + '  → ' + p.rules.length + ' Prüfung' + (p.rules.length === 1 ? '' : 'en')));
  }
  if (a.situations.length) {
    L.push(''); L.push('So fahren:');
    a.situations.forEach((s, i) => { L.push('  ' + (i + 1) + '. ' + s.title); L.push('     ' + s.text); });
  }
  if (!a.pids.length && !a.situations.length) L.push('Nichts offen – diese Aufzeichnung hat alles beantwortet, was das Werkzeug fragen kann.');
  return L.join('\n');
}
