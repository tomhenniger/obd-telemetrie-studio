/* ===== Fahrgestellnummer (FIN/VIN) =================================
   Manche OBD-Apps schreiben die FIN in die Aufzeichnung. Aus ihr lassen
   sich Hersteller (WMI) und Modelljahr lesen – genug für einen besseren
   Profilvorschlag und ein vorausgefülltes Kaufcheck-Feld.
   ================================================================== */

const VIN_WMI = {
  WAU: 'Audi', WA1: 'Audi (SUV)', WUA: 'Audi Sport', TRU: 'Audi (Győr)',
  WVW: 'Volkswagen', WVG: 'Volkswagen (SUV)', WV1: 'Volkswagen Nutzfahrzeuge', WV2: 'Volkswagen Nutzfahrzeuge', '3VW': 'Volkswagen (Mexiko)',
  TMB: 'Škoda', VSS: 'SEAT', VSZ: 'SEAT', WP0: 'Porsche', WP1: 'Porsche (SUV)',
  WBA: 'BMW', WBS: 'BMW M', WBY: 'BMW i', WMW: 'MINI',
  WDD: 'Mercedes-Benz', WDB: 'Mercedes-Benz', WDC: 'Mercedes-Benz (SUV)', WMX: 'Mercedes-AMG', W1K: 'Mercedes-Benz', W1N: 'Mercedes-Benz (SUV)',
  W0L: 'Opel', W0V: 'Opel', WF0: 'Ford (Deutschland)', WME: 'smart',
  VF1: 'Renault', VF3: 'Peugeot', VF7: 'Citroën', VR1: 'DS', VR3: 'Peugeot', VR7: 'Citroën',
  ZFA: 'Fiat', ZAR: 'Alfa Romeo', ZFF: 'Ferrari', ZHW: 'Lamborghini', ZAM: 'Maserati',
  YV1: 'Volvo', YS3: 'Saab', SB1: 'Toyota (UK)', JT: 'Toyota', JTD: 'Toyota', JHM: 'Honda', JH4: 'Acura', JN1: 'Nissan', JMZ: 'Mazda', JF1: 'Subaru', JS1: 'Suzuki',
  KMH: 'Hyundai', KNA: 'Kia', KNM: 'Renault Samsung', TMA: 'Hyundai (Tschechien)', U5Y: 'Kia (Slowakei)',
  SAL: 'Land Rover', SAJ: 'Jaguar', SCC: 'Lotus', SCB: 'Bentley', SCA: 'Rolls-Royce',
  '1G1': 'Chevrolet', '1FA': 'Ford (USA)', '1HG': 'Honda (USA)', '5YJ': 'Tesla', '7SA': 'Tesla', 'LRW': 'Tesla (China)', 'XP7': 'Tesla (Berlin)',
  VXK: 'Opel/DS (Stellantis)', VNK: 'Toyota (Frankreich)', SJN: 'Nissan (UK)', NLH: 'Hyundai (Türkei)', TSM: 'Suzuki (Ungarn)'
};
const VIN_YEAR = 'ABCDEFGHJKLMNPRSTVWXY123456789';   // Position 10: A=2010 … Y=2030, 1=2031 … ; davor A=1980 …

function decodeVin(vin) {
  vin = String(vin || '').toUpperCase().trim();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;
  const wmi3 = vin.slice(0, 3), wmi2 = vin.slice(0, 2);
  const maker = VIN_WMI[wmi3] || VIN_WMI[wmi2] || null;
  const r = vin[0];
  const region = /[S-Z]/.test(r) ? 'Europa' : /[J-R]/.test(r) ? 'Asien' : /[1-5]/.test(r) ? 'Nordamerika' : /[6-7]/.test(r) ? 'Ozeanien' : /[8-9]/.test(r) ? 'Südamerika' : /[A-H]/.test(r) ? 'Afrika' : null;
  const yc = vin[9], yi = VIN_YEAR.indexOf(yc);
  /* Zweideutig (30-Jahres-Zyklus): wir nehmen den Zyklus ab 2010; liegt das Jahr in der Zukunft, den davor */
  let year = null;
  if (yi >= 0) { year = 2010 + yi; if (year > new Date().getFullYear() + 1) year -= 30; }
  return { vin, maker, region, modelYear: year, plant: vin[10], serial: vin.slice(11) };
}

/* FIN im Rohtext suchen: 17 Zeichen ohne I, O, Q; der häufigste Treffer gewinnt */
function findVin(text) {
  if (!text) return null;
  const head = text.length > 1500000 ? text.slice(0, 1500000) : text;
  const re = /(?<![A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?![A-Z0-9])/g;
  const count = new Map();
  let m;
  while ((m = re.exec(head))) {
    const v = m[1];
    if (!/[A-Z]/.test(v) || !/\d/.test(v)) continue;             // reine Zahlen- oder Buchstabenfolgen sind keine FIN
    if (!/^[A-Z0-9]{3}[A-Z0-9]{6}[A-Z0-9]{8}$/.test(v)) continue;
    if (!decodeVin(v)) continue;
    count.set(v, (count.get(v) || 0) + 1);
  }
  let best = null, bestN = 0;
  for (const [v, n] of count) if (n > bestN) { best = v; bestN = n; }
  /* Ein einzelner Treffer irgendwo im Text kann Zufall sein; ohne bekannten Hersteller braucht es mindestens zwei */
  if (!best) return null;
  const d = decodeVin(best);
  if (bestN < 2 && !d.maker) return null;
  return Object.assign(d, { hits: bestN });
}
