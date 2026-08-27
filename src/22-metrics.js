/* ============================================================
   Metrik-Registry — bildet beliebige PID-Namen auf kanonische IDs ab
   und normalisiert Einheiten. Damit ist die CSV wirklich austauschbar.
   ============================================================ */

/* ---------- Einheiten-Normalisierung ---------- */
const UNIT_CANON = {
  '℃': '°C', 'c': '°C', '°c': '°C', 'degc': '°C', 'celsius': '°C', 'grad c': '°C',
  '℉': '°F', 'f': '°F', '°f': '°F', 'degf': '°F',
  'kmh': 'km/h', 'km/h': 'km/h', 'kph': 'km/h', 'km/hr': 'km/h',
  'mph': 'mph', 'm/s': 'm/s',
  'rpm': 'rpm', 'u/min': 'rpm', '1/min': 'rpm', 'min-1': 'rpm',
  '%': '%', 'pct': '%',
  'bar': 'bar', 'psi': 'psi', 'kpa': 'kPa', 'hpa': 'hPa', 'mbar': 'hPa', 'pa': 'Pa', 'mmhg': 'mmHg', 'inhg': 'inHg',
  'l/100km': 'L/100km', 'l/100 km': 'L/100km', 'mpg': 'mpg', 'mpg(us)': 'mpg', 'mpg(uk)': 'mpg_uk',
  'km/l': 'km/L', 'l/h': 'L/h', 'l': 'L', 'ml': 'mL', 'gal': 'gal',
  'hp': 'PS', 'ps': 'PS', 'bhp': 'hp_mech', 'kw': 'kW', 'w': 'W',
  'nm': 'Nm', 'lb-ft': 'lbft', 'ftlb': 'lbft',
  'g/s': 'g/s', 'kg/h': 'kg/h', 'g': 'g', 'm/s²': 'm/s²', 'm/s2': 'm/s²',
  'v': 'V', 'mv': 'mV', 'a': 'A',
  'km': 'km', 'mi': 'mi', 'm': 'm', 'ft': 'ft',
  '°': '°', 'deg': '°', 'grad': '°', '° kw': '°KW', '°kw': '°KW',
  '€': '€', 'eur': '€', '$': '$', 'usd': '$',
  's': 's', 'sec': 's', 'min': 'min', 'h': 'h'
};
function canonUnit(u) {
  if (!u) return '';
  const k = String(u).trim().toLowerCase();
  return UNIT_CANON[k] || String(u).trim();
}

/* Konvertierungsfaktoren in die jeweilige Zieleinheit */
const CONVERT = {
  '°C':      { '°F': v => (v - 32) / 1.8, 'K': v => v - 273.15 },
  'km/h':    { 'mph': v => v * 1.609344, 'm/s': v => v * 3.6, 'kn': v => v * 1.852 },
  'bar':     { 'psi': v => v / 14.503774, 'kPa': v => v / 100, 'hPa': v => v / 1000,
               'Pa': v => v / 1e5, 'mmHg': v => v / 750.062, 'inHg': v => v / 29.5300 },
  'kPa':     { 'bar': v => v * 100, 'psi': v => v * 6.894757, 'hPa': v => v / 10, 'Pa': v => v / 1000,
               'mmHg': v => v * 0.133322, 'inHg': v => v * 3.386389 },
  'PS':      { 'kW': v => v / 0.7354988, 'W': v => v / 735.4988, 'hp_mech': v => v * 1.013870 },
  'kW':      { 'PS': v => v * 0.7354988, 'hp_mech': v => v * 0.7456999, 'W': v => v / 1000 },
  'Nm':      { 'lbft': v => v * 1.355818 },
  'L/100km': { 'mpg': v => 235.2145 / v, 'mpg_uk': v => 282.481 / v, 'km/L': v => 100 / v },
  'km':      { 'mi': v => v * 1.609344, 'm': v => v / 1000, 'ft': v => v * 0.0003048 },
  'm':       { 'ft': v => v * 0.3048, 'km': v => v * 1000 },
  'g':       { 'm/s²': v => v / 9.80665 },
  'm/s²':    { 'g': v => v * 9.80665 },
  'V':       { 'mV': v => v / 1000 },
  'L':       { 'mL': v => v / 1000, 'gal': v => v * 3.785412 },
  'L/h':     { 'gal/h': v => v * 3.785412, 'cc/min': v => v * 0.06 }
};
function convertTo(target, from, v) {
  from = canonUnit(from); target = canonUnit(target);
  if (!from || from === target) return v;
  const c = CONVERT[target];
  return c && c[from] ? c[from](v) : v;
}
function hasConversion(target, from) {
  from = canonUnit(from); target = canonUnit(target);
  if (!from || from === target) return true;
  return !!(CONVERT[target] && CONVERT[target][from]);
}

/* ---------- Kanonische Metriken ----------
   a  = Alias-Regexes (auf normalisierten PID-Namen, lowercase)
   u  = Zieleinheit,  d = Nachkommastellen,  g = Gruppe
   p  = Priorität (höher gewinnt, wenn mehrere Serien auf dieselbe ID passen)
   agg= 'inst' (Momentanwert) | 'cum' (kumulierter Zähler) | 'avg' (laufender Mittelwert)
*/
const METRICS = [
  /* --- Motor --- */
  { id:'rpm', label:'Motordrehzahl', short:'Drehzahl', u:'rpm', d:0, g:'motor', p:10, c:'#ff5c47',
    a:[/^engine\s*rpm$/, /^rpm$/, /^motordrehzahl$/, /^engine\s*speed$/, /^drehzahl$/] },
  { id:'rpm_k', label:'Motordrehzahl ×1000', u:'rpm', d:2, g:'motor', p:1, hidden:true,
    a:[/rpm\s*x\s*1000/, /rpm\s*\/\s*1000/] },
  { id:'load_abs', label:'Absolute Motorlast', short:'Last (abs.)', u:'%', d:1, g:'motor', p:9, c:'#ffa726',
    a:[/^absolute\s*load(\s*value)?$/, /^absolute\s*engine\s*load/, /^abs.*last/] },
  { id:'load_calc', label:'Berechnete Motorlast', short:'Last (ber.)', u:'%', d:1, g:'motor', p:8, c:'#ffb74d',
    a:[/^(calculated\s*)?engine\s*load(\s*value)?$/, /^calculated\s*load/, /^motorlast/, /^engine\s*load$/] },
  { id:'timing', label:'Zündwinkel', short:'Zündwinkel', u:'°', d:1, g:'motor', p:9, c:'#7e57c2',
    a:[/^timing\s*advance/, /^ignition\s*(timing|advance|angle)/, /^zündwinkel/, /^zuendwinkel/, /^spark\s*advance/] },
  { id:'knock_retard', label:'Klopfrücknahme', u:'°', d:1, g:'motor', p:8, c:'#e53935',
    a:[/knock\s*(retard|correction)/, /klopf(rücknahme|regelung)/, /ignition\s*retard/] },
  { id:'throttle', label:'Drosselklappe', short:'Drosselklappe', u:'%', d:1, g:'motor', p:8, c:'#26c6da',
    a:[/^throttle\s*position/, /^absolute\s*throttle/, /^drosselklappe/, /^rel(ative)?\s*throttle/, /^commanded\s*throttle/] },
  { id:'pedal', label:'Fahrpedalstellung', short:'Fahrpedal', u:'%', d:1, g:'motor', p:9, c:'#4dd0e1',
    a:[/^(absolute\s*)?pedal\s*position/, /^accelerator\s*pedal/, /^fahrpedal/, /^gaspedal/] },
  { id:'run_time', label:'Motorlaufzeit', u:'s', d:0, g:'motor', p:5, agg:'cum',
    a:[/run\s*time\s*since\s*engine\s*start/, /engine\s*run\s*time/, /motorlaufzeit/] },
  { id:'power', label:'Motorleistung (aus Verbrauch)', short:'Leistung (App)', u:'PS', d:0, g:'motor', p:9, c:'#ec407a',
    a:[/^instant(aneous)?\s*engine\s*power/, /^engine\s*power/, /^power\s*\(/, /^power$/, /^leistung/, /^motorleistung/] },
  { id:'torque', label:'Drehmoment', u:'Nm', d:0, g:'motor', p:8, c:'#ab47bc',
    a:[/^(engine\s*)?torque/, /^drehmoment/] },

  /* --- Aufladung --- */
  { id:'boost', label:'Ladedruck', short:'Ladedruck', u:'bar', d:2, g:'boost', p:10, c:'#42a5f5', pressure:true,
    a:[/^calculated\s*boost/, /^boost(\s*pressure)?$/, /^ladedruck$/, /^turbo\s*boost/, /boost\s*pressure/] },
  { id:'boost_target', label:'Ladedruck Soll', u:'bar', d:2, g:'boost', p:8, c:'#90caf9', pressure:true,
    a:[/boost.*(desired|target|commanded|soll)/, /(desired|commanded).*boost/] },
  { id:'map', label:'Saugrohrdruck (absolut)', short:'MAP', u:'kPa', d:0, g:'boost', p:9, c:'#5c6bc0',
    a:[/^intake\s*manifold\s*(absolute\s*)?pressure/, /^manifold\s*(absolute\s*)?pressure/, /^map$/, /^saugrohrdruck/] },
  { id:'baro', label:'Umgebungsdruck', short:'Luftdruck', u:'kPa', d:1, g:'boost', p:7, c:'#9fa8da',
    a:[/^barometric\s*pressure/, /^ambient\s*(air\s*)?pressure/, /^luftdruck/, /^umgebungsdruck/] },
  { id:'maf', label:'Luftmasse', short:'MAF', u:'g/s', d:1, g:'boost', p:8, c:'#66bb6a',
    a:[/^(mass\s*)?air\s*flow/, /^maf/, /^luftmasse/, /air\s*flow\s*rate/] },
  { id:'wastegate', label:'Wastegate', u:'%', d:1, g:'boost', p:5,
    a:[/wastegate/, /waste\s*gate/] },

  /* --- Temperaturen --- */
  { id:'coolant', label:'Kühlmitteltemperatur', short:'Kühlmittel', u:'°C', d:0, g:'temp', p:10, c:'#ef5350',
    a:[/^engine\s*coolant\s*temp/, /^coolant\s*temp/, /^kühlmittel/, /^kuehlmittel/, /^ect$/] },
  { id:'oil_temp', label:'Öltemperatur', short:'Öl', u:'°C', d:0, g:'temp', p:9, c:'#ffa000',
    a:[/^(engine\s*)?oil\s*temp/, /^öltemp/, /^oeltemp/] },
  { id:'iat', label:'Ansauglufttemperatur', short:'Ansaugluft', u:'°C', d:0, g:'temp', p:9, c:'#29b6f6',
    a:[/^intake\s*air\s*temp/, /^iat$/, /^ansaugluft/, /^air\s*intake\s*temp/] },
  { id:'cac_b1', label:'Ladelufttemperatur Bank 1', short:'LLK B1', u:'°C', d:0, g:'temp', p:9, c:'#26a69a',
    a:[/charge\s*air\s*cooler\s*temp.*bank\s*1/, /ladeluft.*bank\s*1/, /^cact.*b1/] },
  { id:'cac_b2', label:'Ladelufttemperatur Bank 2', short:'LLK B2', u:'°C', d:0, g:'temp', p:9, c:'#00897b',
    a:[/charge\s*air\s*cooler\s*temp.*bank\s*2/, /ladeluft.*bank\s*2/, /^cact.*b2/] },
  { id:'ambient', label:'Außentemperatur', short:'Außenluft', u:'°C', d:0, g:'temp', p:8, c:'#81d4fa',
    a:[/^ambient\s*air\s*temp/, /^outside\s*(air\s*)?temp/, /^außentemp/, /^aussentemp/, /^umgebungstemp/] },
  { id:'cat_temp_b1', label:'Katalysatortemperatur B1', u:'°C', d:0, g:'temp', p:6,
    a:[/catalyst\s*temp.*bank\s*1/, /kat.*temp.*bank\s*1/] },
  { id:'cat_temp_b2', label:'Katalysatortemperatur B2', u:'°C', d:0, g:'temp', p:6,
    a:[/catalyst\s*temp.*bank\s*2/, /kat.*temp.*bank\s*2/] },
  { id:'fuel_temp', label:'Kraftstofftemperatur', u:'°C', d:0, g:'temp', p:5,
    a:[/^fuel\s*temp/, /kraftstofftemp/] },
  { id:'trans_temp', label:'Getriebeöltemperatur', u:'°C', d:0, g:'temp', p:6,
    a:[/transmission.*temp/, /getriebe.*temp/, /atf.*temp/] },
  { id:'dpf_temp', label:'DPF-Temperatur', u:'°C', d:0, g:'temp', p:5,
    a:[/dpf.*temp/, /(particulate|partikel).*temp/] },

  /* --- Gemisch / Abgas --- */
  { id:'ltft_b1', label:'Langzeit-Gemischkorrektur Bank 1', short:'LTFT B1', u:'%', d:2, g:'fuel', p:10, c:'#ffca28',
    a:[/^long\s*term\s*fuel\s*%?\s*trim.*bank\s*1/, /^ltft.*(b1|bank\s*1)/, /langzeit.*bank\s*1/] },
  { id:'ltft_b2', label:'Langzeit-Gemischkorrektur Bank 2', short:'LTFT B2', u:'%', d:2, g:'fuel', p:10, c:'#ffb300',
    a:[/^long\s*term\s*fuel\s*%?\s*trim.*bank\s*2/, /^ltft.*(b2|bank\s*2)/, /langzeit.*bank\s*2/] },
  { id:'stft_b1', label:'Kurzzeit-Gemischkorrektur Bank 1', short:'STFT B1', u:'%', d:2, g:'fuel', p:10, c:'#c0ca33',
    a:[/^short\s*term\s*fuel\s*%?\s*trim.*bank\s*1/, /^stft.*(b1|bank\s*1)/, /kurzzeit.*bank\s*1/] },
  { id:'stft_b2', label:'Kurzzeit-Gemischkorrektur Bank 2', short:'STFT B2', u:'%', d:2, g:'fuel', p:10, c:'#9e9d24',
    a:[/^short\s*term\s*fuel\s*%?\s*trim.*bank\s*2/, /^stft.*(b2|bank\s*2)/, /kurzzeit.*bank\s*2/] },
  { id:'lambda', label:'Lambda', u:'λ', d:3, g:'fuel', p:8,
    a:[/^lambda/, /equivalence\s*ratio/, /^afr\s*ratio/] },
  { id:'o2_b1s1', label:'O₂-Sonde B1S1', u:'V', d:3, g:'fuel', p:6,
    a:[/o2.*b1.*s1/, /oxygen.*bank\s*1.*sensor\s*1/, /lambdasonde.*1.*1/] },
  { id:'o2_b2s1', label:'O₂-Sonde B2S1', u:'V', d:3, g:'fuel', p:6,
    a:[/o2.*b2.*s1/, /oxygen.*bank\s*2.*sensor\s*1/] },
  { id:'fuel_press', label:'Kraftstoffdruck', u:'kPa', d:0, g:'fuel', p:6,
    a:[/^fuel\s*(rail\s*)?pressure/, /kraftstoffdruck/, /raildruck/] },
  { id:'fuel_level', label:'Tankfüllstand', u:'%', d:0, g:'fuel', p:6,
    a:[/fuel\s*(tank\s*)?level/, /tankfüllstand/, /tankinhalt/] },
  { id:'egr', label:'AGR-Rate', u:'%', d:1, g:'fuel', p:5,
    a:[/^(commanded\s*)?egr/, /^agr/, /exhaust\s*gas\s*recirc/] },

  /* --- Verbrauch --- */
  { id:'fuel_rate', label:'Momentaner Kraftstofffluss', short:'Fluss', u:'L/h', d:2, g:'cons', p:10, c:'#8d6e63',
    a:[/^(calculated\s*)?instant.*fuel\s*rate/, /^fuel\s*(flow\s*)?rate/, /^engine\s*fuel\s*rate/, /kraftstofffluss/] },
  { id:'cons_inst', label:'Momentanverbrauch', short:'Verbrauch (App)', u:'L/100km', d:1, g:'cons', p:10, c:'#a1887f',
    a:[/^(calculated\s*)?instant(aneous)?\s*fuel\s*consumption/, /^fuel\s*consumption\s*\(inst/, /^momentanverbrauch/] },
  { id:'cons_10s', label:'Verbrauch ⌀ 10 s', u:'L/100km', d:1, g:'cons', p:7,
    a:[/average\s*fuel\s*consumption\s*10\s*sec/] },
  { id:'cons_avg', label:'Durchschnittsverbrauch (Fahrt)', short:'⌀ Verbrauch', u:'L/100km', d:1, g:'cons', p:8, agg:'avg',
    a:[/^average\s*fuel\s*consumption$/, /^durchschnittsverbrauch$/] },
  { id:'fuel_used', label:'Verbrauchte Kraftstoffmenge', short:'Getankt kumuliert', u:'L', d:3, g:'cons', p:9, agg:'cum',
    a:[/^fuel\s*used$/, /^verbrauchte?\s*kraftstoff/, /^fuel\s*consumed$/] },
  { id:'fuel_cost', label:'Kraftstoffkosten', u:'€', d:2, g:'cons', p:7, agg:'cum',
    a:[/^fuel\s*used\s*price$/, /^kraftstoffkosten$/] },

  /* --- Fahrdynamik / Strecke --- */
  { id:'speed', label:'Geschwindigkeit (OBD)', short:'Tempo (OBD)', u:'km/h', d:0, g:'drive', p:10, c:'#29b6f6',
    a:[/^vehicle\s*speed$/, /^speed$/, /^geschwindigkeit$/, /^obd\s*speed/] },
  { id:'speed_gps', label:'Geschwindigkeit (GPS)', short:'Tempo GPS', u:'km/h', d:0, g:'drive', p:9, c:'#4fc3f7',
    a:[/^speed\s*\(gps\)/, /^gps\s*speed/] },
  { id:'speed_avg', label:'Durchschnittsgeschwindigkeit', u:'km/h', d:1, g:'drive', p:6, agg:'avg',
    a:[/^average\s*speed$/] },
  { id:'speed_avg_gps', label:'⌀-Geschwindigkeit (GPS)', u:'km/h', d:1, g:'drive', p:5, agg:'avg',
    a:[/^average\s*speed\s*\(gps\)/] },
  { id:'accel', label:'Längsbeschleunigung', short:'Beschl.', u:'g', d:3, g:'drive', p:9, c:'#9ccc65',
    a:[/^vehicle\s*acceleration/, /^acceleration$/, /^beschleunigung/, /^g[\s-]?force/] },
  { id:'altitude', label:'Höhe (GPS)', short:'Höhe', u:'m', d:1, g:'drive', p:8, c:'#a5d6a7',
    a:[/^altitude/, /^höhe/, /^hoehe/, /^elevation/] },
  { id:'distance', label:'Zurückgelegte Strecke', short:'Strecke', u:'km', d:2, g:'drive', p:8, agg:'cum',
    a:[/^distance\s*travell?ed$/, /^trip\s*distance$/, /^strecke$/, /^distanz$/] },
  { id:'gear', label:'Gang', u:'', d:0, g:'drive', p:7,
    a:[/^gear$/, /^current\s*gear/, /^gang$/, /^gangstufe/] },

  /* --- Elektrik --- */
  { id:'batt', label:'Bordspannung', short:'Spannung', u:'V', d:2, g:'misc', p:8, c:'#ffee58',
    a:[/^(control\s*module\s*)?voltage/, /^battery\s*voltage/, /^bordspannung/, /^batteriespannung/, /^module\s*voltage/] }
];

const METRIC_BY_ID = Object.fromEntries(METRICS.map(m => [m.id, m]));

const GROUPS = {
  motor: { label: 'Motor',        icon: 'engine' },
  boost: { label: 'Aufladung',    icon: 'boost'  },
  temp:  { label: 'Temperaturen', icon: 'temp'   },
  fuel:  { label: 'Gemisch',      icon: 'fuel'   },
  cons:  { label: 'Verbrauch',    icon: 'drop'   },
  drive: { label: 'Fahrdynamik',  icon: 'car'    },
  misc:  { label: 'Sonstiges',    icon: 'dots'   },
  calc:  { label: 'Berechnet',    icon: 'calc'   }
};

/* Serien-Name normalisieren: Klammerzusätze wie (Today)/(Week)/(total) markieren */
const SCOPE_RE = /\s*[\(\[]\s*(today|heute|week|woche|total|gesamt|overall|all\s*time|trip|fahrt)\s*[\)\]]\s*/i;

function normName(name) {
  return String(name).toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[·•]/g, '')
    .trim();
}

/* Ordnet alle geparsten Serien kanonischen Metrik-IDs zu.
   Zweistufig: erst alle Treffer sammeln, dann gierig nach Priorität vergeben,
   damit eine Serie nicht einer schwächer passenden Metrik "wegschnappt". */
function mapSeries(seriesMap) {
  const cands = [];   // {raw, s, defs:[def]}
  const scoped = [];

  for (const [rawName, s] of seriesMap) {
    const scopeMatch = rawName.match(SCOPE_RE);
    if (scopeMatch) {
      scoped.push({ raw: rawName, s, scope: scopeMatch[1].toLowerCase(),
                    base: rawName.replace(SCOPE_RE, ' ').replace(/\s+/g, ' ').trim() });
      continue;
    }
    const n = normName(rawName);
    const defs = [];
    for (const def of METRICS) {
      for (const re of def.a) if (re.test(n)) { defs.push(def); break; }
    }
    defs.sort((a, b) => (b.p || 0) - (a.p || 0));
    cands.push({ raw: rawName, s, defs });
  }

  const assigned = new Map();
  const takenSeries = new Set();
  const defOrder = METRICS.slice().sort((a, b) => (b.p || 0) - (a.p || 0));

  for (const def of defOrder) {
    if (assigned.has(def.id)) continue;
    let best = null;
    for (const c of cands) {
      if (takenSeries.has(c.raw) || c.defs.indexOf(def) < 0) continue;
      // Serien, die noch eine höher priorisierte, unvergebene Metrik bedienen könnten, zurückstellen
      const better = c.defs.find(d => d !== def && (d.p || 0) > (def.p || 0) && !assigned.has(d.id));
      if (better) continue;
      const score = c.s.n * (hasConversion(def.u, c.s.unit) ? 1 : 0.4);
      if (!best || score > best.score) best = { c, score };
    }
    if (best) { assigned.set(def.id, buildMetric(def, best.c.s, best.c.raw)); takenSeries.add(best.c.raw); }
  }

  const extras = cands.filter(c => !takenSeries.has(c.raw)).map(c => ({ raw: c.raw, s: c.s }));
  if (assigned.has('rpm') && assigned.has('rpm_k')) assigned.delete('rpm_k');
  return { assigned, extras, scoped };
}

function buildMetric(def, s, rawName) {
  const srcUnit = canonUnit(s.unit);
  const needConv = srcUnit && srcUnit !== canonUnit(def.u) && hasConversion(def.u, srcUnit);
  let v = s.v;
  if (needConv) {
    v = new Float64Array(s.n);
    for (let i = 0; i < s.n; i++) v[i] = convertTo(def.u, srcUnit, s.v[i]);
  }
  return {
    id: def.id, def, label: def.label, short: def.short || def.label,
    unit: canonUnit(def.u), srcUnit: s.unit, rawName,
    t: s.t, v, n: s.n, converted: needConv,
    group: def.g, decimals: def.d, color: def.c || null, agg: def.agg || 'inst'
  };
}

/* Freie Serie ohne Registry-Eintrag als Metrik verpacken */
function buildFreeMetric(rawName, s, i) {
  const u = canonUnit(s.unit);
  return {
    id: 'x_' + rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x_' + i,
    def: null, label: rawName, short: rawName.length > 22 ? rawName.slice(0, 21) + '…' : rawName,
    unit: u, srcUnit: s.unit, rawName, t: s.t, v: s.v, n: s.n, converted: false,
    group: 'misc', decimals: u === '%' ? 1 : 2, color: null, agg: 'inst', free: true
  };
}
