/* ============================================================
   Fahrzeugprofile — Katalog, Suche, eigene Profile
   Jedes Profil trägt ein `confidence`-Feld. Werte, die nicht belegt sind,
   fehlen im Profil und werden zur Laufzeit aus dem Klassenprofil ergänzt;
   die Oberfläche weist das aus.
   ============================================================ */

/* --- Klassenbasierte Rückfallwerte -------------------------------
   Greifen, wenn ein Profil ein Feld nicht mitbringt. Bewusst weit gefasst:
   ein zu enger Sollbereich erzeugt Fehlalarme, ein zu weiter nur ein „unauffällig". */
const CLASS_DEFAULTS = {
  sauger:      { redline: 6800, idleWarm: [650, 900], coolantGreen: [80, 105], thermostat: 88,
                 loadWotGreen: [80, 105], loadIdleGreen: [12, 32], banks: 1 },
  turbo:       { redline: 6800, idleWarm: [600, 850], coolantGreen: [85, 108], thermostat: 90,
                 loadWotGreen: [130, 230], loadIdleGreen: [15, 40], boostWotGreen: [0.6, 1.8], banks: 1 },
  kompressor:  { redline: 6800, idleWarm: [600, 800], coolantGreen: [85, 105], thermostat: 87,
                 loadWotGreen: [140, 220], loadIdleGreen: [18, 42], boostWotGreen: [0.5, 0.9], banks: 1 },
  diesel:      { redline: 5000, idleWarm: [700, 950], coolantGreen: [80, 102], thermostat: 87,
                 loadWotGreen: [100, 230], loadIdleGreen: [12, 38], boostWotGreen: [0.8, 2.2], banks: 1 }
};
function classKey(p) {
  if (p.fuel === 'diesel') return 'diesel';
  return p.aspiration === 'kompressor' ? 'kompressor' : p.aspiration === 'sauger' ? 'sauger' : 'turbo';
}
/* Liefert die Sollwerte eines Profils, ergänzt um die Klassenwerte.
   `derivedFields` sagt, welche Werte nicht aus dem Profil stammen. */
function resolveSpecs(p) {
  const base = CLASS_DEFAULTS[classKey(p)] || {};
  const own = p.specs || {};
  const out = Object.assign({}, base, own);
  const derived = [];
  for (const k in base) if (own[k] === undefined) derived.push(k);
  return { specs: out, derived };
}

const BUILTIN_PROFILES = [
{
  id: 'audi_s5_b85_cgwc',
  name: 'Audi S5 B8.5 · 3.0 TFSI Kompressor · 333 PS',
  short: 'S5 B8.5 CGWC',
  brand: 'Audi', family: 'EA837 3.0 TFSI', engineCode: ['CGWC'],
  years: [2011, 2016], models: 'A4/S4 B8.5, A5/S5 B8.5, Q5 SQ5',
  confidence: 'hoch',
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
  id: 'generic_turbo', name: 'Allgemein · Turbo-Benziner', short: 'Turbo Benzin', generic: true,
  brand: 'Allgemein', engine: 'aufgeladener Ottomotor', aspiration: 'turbo', fuel: 'petrol',
  confidence: 'klassenbasiert', specs: {}
},
{
  id: 'generic_kompressor', name: 'Allgemein · Kompressor-Benziner', short: 'Kompressor', generic: true,
  brand: 'Allgemein', engine: 'mechanisch aufgeladener Ottomotor', aspiration: 'kompressor', fuel: 'petrol',
  confidence: 'klassenbasiert', specs: {}
},
{
  id: 'generic_na', name: 'Allgemein · Saugmotor Benzin', short: 'Sauger Benzin', generic: true,
  brand: 'Allgemein', engine: 'Ottomotor ohne Aufladung', aspiration: 'sauger', fuel: 'petrol',
  confidence: 'klassenbasiert', specs: {}
},
{
  id: 'generic_diesel', name: 'Allgemein · Diesel', short: 'Diesel', generic: true,
  brand: 'Allgemein', engine: 'Dieselmotor mit Aufladung', aspiration: 'turbo', fuel: 'diesel',
  confidence: 'klassenbasiert', specs: {}
}
];


/* --- Eigene Profile ---------------------------------------------- */
function customProfiles() {
  const raw = store.get('customProfiles', []);
  return Array.isArray(raw) ? raw.filter(p => p && p.id && p.name) : [];
}
function saveCustomProfile(p) {
  const list = customProfiles().filter(x => x.id !== p.id);
  list.push(p);
  store.set('customProfiles', list);
}
function deleteCustomProfile(id) {
  store.set('customProfiles', customProfiles().filter(x => x.id !== id));
}

/* Der vollständige Katalog: mitgelieferte plus eigene Profile. */
function allProfiles() {
  return BUILTIN_PROFILES.concat(customProfiles().map(p => Object.assign({ custom: true }, p)));
}
function profileById(id) {
  return allProfiles().find(p => p.id === id) || null;
}

/* --- Suche --------------------------------------------------------
   Sucht über Name, Marke, Familie, Motorkennbuchstaben, Trägerfahrzeuge und Baujahr.
   Alle Teilbegriffe müssen treffen, damit „audi 2.0 tdi" sinnvoll filtert. */
function searchProfiles(query, filters) {
  filters = filters || {};
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  for (const p of allProfiles()) {
    if (filters.fuel && p.fuel !== filters.fuel) continue;
    if (filters.aspiration && p.aspiration !== filters.aspiration) continue;
    const hay = [p.name, p.brand, p.family, p.models, p.short,
                 (p.engineCode || []).join(' '),
                 p.years ? p.years[0] + '-' + p.years[1] : '',
                 p.specs && p.specs.powerPS ? p.specs.powerPS + ' ps' : '',
                 p.specs && p.specs.displacement ? (p.specs.displacement / 1000).toFixed(1) : ''
                ].filter(Boolean).join(' ').toLowerCase();
    let score = 0, ok = true;
    for (const t of terms) {
      const i = hay.indexOf(t);
      if (i < 0) {
        // Baujahr-Suche: „2014" trifft jedes Profil, dessen Bauzeitraum das Jahr enthält
        const y = parseInt(t, 10);
        if (y > 1990 && y < 2035 && p.years && y >= p.years[0] && y <= p.years[1]) { score += 3; continue; }
        ok = false; break;
      }
      score += i === 0 ? 10 : 5;
    }
    if (!ok) continue;
    if (p.custom) score += 20;
    if (p.generic) score -= 8;
    if (p.confidence === 'hoch') score += 2;
    scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score || String(a.p.name).localeCompare(String(b.p.name)));
  return scored.map(x => x.p);
}

/* Nach Marke gruppieren, für die Auswahlliste ohne Suchbegriff */
function profilesByBrand() {
  const map = new Map();
  for (const p of allProfiles()) {
    const b = p.custom ? 'Eigene Profile' : (p.generic ? 'Allgemeine Profile' : (p.brand || 'Sonstige'));
    if (!map.has(b)) map.set(b, []);
    map.get(b).push(p);
  }
  for (const list of map.values())
    list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return map;
}

/* Vorbelegung, wenn nichts gewählt und nichts erkannt ist */
function defaultProfile() {
  return profileById('generic_turbo') || BUILTIN_PROFILES[0];
}
