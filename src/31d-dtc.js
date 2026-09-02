/* ---------------------------------------------------------------------------
   Fehlerspeicher (DTC).

   Ein Fehlercode neben dem gemessenen Verlauf ist mehr wert als beides einzeln:
   P0300 neben dem Zündwinkelbild, P0171 neben der Gemischkorrektur, P0299 neben
   der Lastkurve. Die Codes kommen aus der OBD-App (Ausgabe kopieren) oder werden
   von Hand eingetippt; die Tabelle deckt die genormten P0-/P2-Codes ab, die in
   jedem Fahrzeug gleich bedeuten. Herstellercodes (P1xxx, P3xxx) werden erkannt,
   aber nicht gedeutet – dafür gibt es keine allgemeingültige Tabelle.
--------------------------------------------------------------------------- */

/* Genormte Codes nach SAE J2012 / ISO 15031-6. rules: Diagnoseregeln, deren
   Messbild den Code stützt oder entkräftet. check: worauf hier zu schauen ist. */
const DTC_TABLE = {
  P0011: { t: 'Nockenwellenverstellung Bank 1 – Position zu früh', rules: ['timing_wot', 'idle_rpm'], check: 'Kaltstart-Rasseln und Ölstand; Verstellwinkel Soll/Ist im Steuergerät' },
  P0012: { t: 'Nockenwellenverstellung Bank 1 – Position zu spät', rules: ['timing_wot', 'idle_rpm'], check: 'Ölstand, Ölwechselintervall, Magnetventil der Verstellung' },
  P0014: { t: 'Nockenwellenverstellung Bank 1 Auslass – zu früh', rules: ['timing_wot'], check: 'Wie P0011, Auslassseite' },
  P0016: { t: 'Kurbel-/Nockenwelle Bank 1 – Korrelation', rules: ['idle_rpm'], check: 'Kette/Riemen gelängt oder übergesprungen – beim Gebrauchtwagen ein Abbruchkriterium' },
  P0017: { t: 'Kurbel-/Nockenwelle Bank 1 Auslass – Korrelation', rules: ['idle_rpm'], check: 'Wie P0016' },
  P0018: { t: 'Kurbel-/Nockenwelle Bank 2 – Korrelation', rules: ['idle_rpm'], check: 'Wie P0016, zweite Bank' },
  P0068: { t: 'Saugrohrdruck/Luftmasse passen nicht zur Drosselklappe', rules: ['maf_sanity', 'load_wot'], check: 'Falschluft nach der Drosselklappe, Luftmassenmesser' },
  P0087: { t: 'Kraftstoff-Raildruck zu niedrig', rules: ['fuel_pressure', 'ltft_load_dep'], check: 'Kraftstoffdruck unter Last, Filter, Hochdruckpumpe' },
  P0088: { t: 'Kraftstoff-Raildruck zu hoch', rules: ['fuel_pressure'], check: 'Druckregelventil, Mengensteuerventil' },
  P0089: { t: 'Kraftstoffdruckregler – Leistung', rules: ['fuel_pressure'], check: 'Druck im Leerlauf gegen Volllast' },
  P0100: { t: 'Luftmassenmesser – Stromkreis', rules: ['maf_sanity', 'ltft_b1'], check: 'Luftmasse gegen Last, Stecker' },
  P0101: { t: 'Luftmassenmesser – Bereich/Leistung', rules: ['maf_sanity', 'ltft_b1', 'ltft_load_dep'], check: 'Luftmasse je Liter im Leerlauf, Falschluft hinter dem Messer' },
  P0102: { t: 'Luftmassenmesser – Signal zu niedrig', rules: ['maf_sanity', 'ltft_b1'], check: 'Verschmutzung, Gemischkorrektur ins Plus' },
  P0103: { t: 'Luftmassenmesser – Signal zu hoch', rules: ['maf_sanity'], check: 'Verkabelung, Messer' },
  P0105: { t: 'Saugrohrdrucksensor – Stromkreis', rules: ['boost_wot', 'boost_diesel_map'], check: 'Saugrohrdruck gegen Umgebungsdruck bei Zündung an' },
  P0106: { t: 'Saugrohrdrucksensor – Bereich/Leistung', rules: ['boost_wot', 'load_wot'], check: 'Ladedruck- und Lastkurve, Falschluft' },
  P0107: { t: 'Saugrohrdrucksensor – Signal zu niedrig', rules: ['boost_wot'], check: 'Sensor, Verkabelung' },
  P0108: { t: 'Saugrohrdrucksensor – Signal zu hoch', rules: ['boost_wot'], check: 'Sensor, Verkabelung' },
  P0110: { t: 'Ansauglufttemperatur – Stromkreis', rules: ['iat_heat_soak'], check: 'Ansaugluft gegen Außentemperatur' },
  P0111: { t: 'Ansauglufttemperatur – Bereich/Leistung', rules: ['iat_heat_soak'], check: 'Unplausible Sprünge im Verlauf' },
  P0112: { t: 'Ansauglufttemperatur – Signal zu niedrig', rules: ['iat_heat_soak'], check: 'Kurzschluss, Sensor' },
  P0113: { t: 'Ansauglufttemperatur – Signal zu hoch', rules: ['iat_heat_soak'], check: 'Unterbrechung, Sensor' },
  P0115: { t: 'Kühlmitteltemperatur – Stromkreis', rules: ['coolant_operating', 'coolant_warmup'], check: 'Kühlmittelverlauf auf Sprünge und Ausfälle' },
  P0116: { t: 'Kühlmitteltemperatur – Bereich/Leistung', rules: ['coolant_operating', 'coolant_warmup'], check: 'Warmlaufkurve gegen Öltemperatur' },
  P0117: { t: 'Kühlmitteltemperatur – Signal zu niedrig', rules: ['coolant_operating'], check: 'Geber G62, Verkabelung' },
  P0118: { t: 'Kühlmitteltemperatur – Signal zu hoch', rules: ['coolant_operating'], check: 'Geber G62, Verkabelung' },
  P0120: { t: 'Drosselklappen-/Pedalgeber – Stromkreis', rules: ['pedal_scaling'], check: 'Pedal- und Drosselklappenwerte auf Aussetzer' },
  P0121: { t: 'Drosselklappengeber – Bereich/Leistung', rules: ['pedal_scaling', 'load_wot'], check: 'Verkokte Drosselklappe, Grundeinstellung' },
  P0122: { t: 'Drosselklappengeber – Signal zu niedrig', rules: ['pedal_scaling'], check: 'Verkabelung' },
  P0123: { t: 'Drosselklappengeber – Signal zu hoch', rules: ['pedal_scaling'], check: 'Verkabelung' },
  P0125: { t: 'Kühlmittel zu kalt für Regelbetrieb', rules: ['coolant_warmup', 'coolant_operating'], check: 'Warmlaufzeit, Plateau unter 80 °C – Thermostat' },
  P0128: { t: 'Thermostat – Kühlmittel erreicht Regeltemperatur nicht', rules: ['coolant_warmup', 'coolant_operating'], check: 'Der klassische Thermostat-Code; Warmlauf und Plateau ansehen' },
  P0130: { t: 'Lambdasonde 1 Bank 1 – Stromkreis', rules: ['o2_switching', 'stft_bias'], check: 'Schaltverhalten und Kurzzeitkorrektur' },
  P0131: { t: 'Lambdasonde 1 Bank 1 – Signal zu niedrig', rules: ['o2_switching', 'stft_bias', 'ltft_b1'], check: 'Sonde hängt mager: Falschluft oder Sonde' },
  P0132: { t: 'Lambdasonde 1 Bank 1 – Signal zu hoch', rules: ['o2_switching', 'stft_bias'], check: 'Sonde hängt fett' },
  P0133: { t: 'Lambdasonde 1 Bank 1 – zu träge', rules: ['o2_switching'], check: 'Schaltfrequenz unter 0,5 Hz' },
  P0134: { t: 'Lambdasonde 1 Bank 1 – keine Aktivität', rules: ['o2_switching', 'stft_bias'], check: 'Sonde tot oder Heizung' },
  P0135: { t: 'Lambdasondenheizung 1 Bank 1', rules: ['o2_switching'], check: 'Heizkreis, Sicherung' },
  P0136: { t: 'Lambdasonde 2 Bank 1 – Stromkreis', rules: ['cat_temp'], check: 'Monitorsonde hinter dem Kat' },
  P0137: { t: 'Lambdasonde 2 Bank 1 – Signal zu niedrig', rules: ['cat_temp'], check: 'Abgasleck vor der Sonde' },
  P0138: { t: 'Lambdasonde 2 Bank 1 – Signal zu hoch', rules: ['cat_temp'], check: 'Sonde, Verkabelung' },
  P0140: { t: 'Lambdasonde 2 Bank 1 – keine Aktivität', rules: ['cat_temp'], check: 'Sonde tot' },
  P0141: { t: 'Lambdasondenheizung 2 Bank 1', rules: [], check: 'Heizkreis' },
  P0150: { t: 'Lambdasonde 1 Bank 2 – Stromkreis', rules: ['ltft_b2', 'ltft_bank_delta'], check: 'Bankvergleich der Gemischkorrektur' },
  P0151: { t: 'Lambdasonde 1 Bank 2 – Signal zu niedrig', rules: ['ltft_b2', 'ltft_bank_delta'], check: 'Bank 2 mager' },
  P0152: { t: 'Lambdasonde 1 Bank 2 – Signal zu hoch', rules: ['ltft_b2'], check: 'Bank 2 fett' },
  P0154: { t: 'Lambdasonde 1 Bank 2 – keine Aktivität', rules: ['ltft_b2'], check: 'Sonde tot' },
  P0155: { t: 'Lambdasondenheizung 1 Bank 2', rules: [], check: 'Heizkreis' },
  P0171: { t: 'Gemisch Bank 1 zu mager', rules: ['ltft_b1', 'ltft_load_dep', 'stft_bias', 'maf_sanity', 'fuel_pressure'], check: 'Lastabhängigkeit der Korrektur entscheidet: bei niedriger Last stärker = Falschluft, bei hoher Last stärker = Kraftstoffversorgung' },
  P0172: { t: 'Gemisch Bank 1 zu fett', rules: ['ltft_b1', 'stft_bias', 'fuel_pressure'], check: 'Undichter Injektor, Tankentlüftung, Kraftstoffdruck zu hoch, Luftmassenmesser zu hoch' },
  P0174: { t: 'Gemisch Bank 2 zu mager', rules: ['ltft_b2', 'ltft_bank_delta', 'ltft_load_dep'], check: 'Nur eine Bank mager = Falschluft auf dieser Seite; beide = Kraftstoff oder Luftmasse' },
  P0175: { t: 'Gemisch Bank 2 zu fett', rules: ['ltft_b2', 'ltft_bank_delta'], check: 'Wie P0172, Bank 2' },
  P0190: { t: 'Kraftstoff-Raildrucksensor – Stromkreis', rules: ['fuel_pressure'], check: 'Druckverlauf auf Ausfälle' },
  P0191: { t: 'Kraftstoff-Raildrucksensor – Bereich/Leistung', rules: ['fuel_pressure'], check: 'Druck im Leerlauf gegen Volllast' },
  P0200: { t: 'Einspritzventil – Stromkreis', rules: ['stft_bias'], check: 'Zylinderselektive Aussetzer' },
  P0217: { t: 'Motor überhitzt', rules: ['coolant_operating', 'oil_temp'], check: 'Kühlmittelspitze und Dauer über 105 °C' },
  P0218: { t: 'Getriebe überhitzt', rules: ['trans_temp'], check: 'Getriebeöltemperatur-Spitze' },
  P0219: { t: 'Motor überdreht', rules: ['rpm_limit'], check: 'Drehzahlspitze gegen Begrenzer – beim Gebrauchtwagen ein Warnzeichen' },
  P0230: { t: 'Kraftstoffpumpe – Primärkreis', rules: ['fuel_pressure'], check: 'Druck bricht unter Last ein' },
  P0234: { t: 'Ladedruck zu hoch (Overboost)', rules: ['boost_wot', 'load_wot', 'boost_diesel_map'], check: 'Ladedruckspitze; Wastegate/VTG klemmt zu' },
  P0235: { t: 'Ladedrucksensor – Stromkreis', rules: ['boost_wot'], check: 'Sensor, Verkabelung' },
  P0236: { t: 'Ladedrucksensor – Bereich/Leistung', rules: ['boost_wot'], check: 'Ladedruck gegen Last plausibel?' },
  P0243: { t: 'Wastegate-Magnetventil A', rules: ['boost_wot'], check: 'Ladedruckregelung, Unterdruckschläuche' },
  P0245: { t: 'Wastegate-Magnetventil A – Signal zu niedrig', rules: ['boost_wot'], check: 'Verkabelung' },
  P0246: { t: 'Wastegate-Magnetventil A – Signal zu hoch', rules: ['boost_wot'], check: 'Verkabelung' },
  P0299: { t: 'Ladedruck zu niedrig (Underboost)', rules: ['load_wot', 'boost_wot', 'boost_diesel_map'], check: 'Absolute Last bei Volllast; Ladeluftstrecke, VTG, Wastegate, Bypass. Ein Notlauf begrenzt die Last sichtbar' },
  P0300: { t: 'Zündaussetzer – mehrere Zylinder', rules: ['timing_wot', 'timing_partload', 'cat_temp', 'idle_rpm'], check: 'Leerlaufruhe (σ), Zündwinkelbild, Kat-Temperatur' },
  P0301: { t: 'Zündaussetzer Zylinder 1', rules: ['idle_rpm', 'cat_temp'], check: 'Zündspule/Kerze tauschen und Code wandert mit?' },
  P0302: { t: 'Zündaussetzer Zylinder 2', rules: ['idle_rpm', 'cat_temp'], check: 'Wie P0301' },
  P0303: { t: 'Zündaussetzer Zylinder 3', rules: ['idle_rpm', 'cat_temp'], check: 'Wie P0301' },
  P0304: { t: 'Zündaussetzer Zylinder 4', rules: ['idle_rpm', 'cat_temp'], check: 'Wie P0301' },
  P0305: { t: 'Zündaussetzer Zylinder 5', rules: ['idle_rpm', 'cat_temp'], check: 'Wie P0301' },
  P0306: { t: 'Zündaussetzer Zylinder 6', rules: ['idle_rpm', 'cat_temp'], check: 'Wie P0301' },
  P0307: { t: 'Zündaussetzer Zylinder 7', rules: ['idle_rpm', 'cat_temp'], check: 'Wie P0301' },
  P0308: { t: 'Zündaussetzer Zylinder 8', rules: ['idle_rpm', 'cat_temp'], check: 'Wie P0301' },
  P0325: { t: 'Klopfsensor 1 – Stromkreis', rules: ['timing_wot', 'knock_retard_pid'], check: 'Zündwinkel unter Last; ohne Sensor fährt das Steuergerät ein Sicherheitskennfeld' },
  P0326: { t: 'Klopfsensor 1 – Bereich/Leistung', rules: ['timing_wot', 'knock_retard_pid'], check: 'Sensor, Anzugsmoment' },
  P0327: { t: 'Klopfsensor 1 – Signal zu niedrig', rules: ['timing_wot'], check: 'Verkabelung' },
  P0328: { t: 'Klopfsensor 1 – Signal zu hoch', rules: ['timing_wot'], check: 'Verkabelung' },
  P0330: { t: 'Klopfsensor 2 – Stromkreis', rules: ['timing_wot'], check: 'Wie P0325' },
  P0335: { t: 'Kurbelwellensensor – Stromkreis', rules: ['idle_rpm'], check: 'Drehzahlaussetzer im Verlauf' },
  P0336: { t: 'Kurbelwellensensor – Bereich/Leistung', rules: ['idle_rpm'], check: 'Geberrad, Luftspalt' },
  P0340: { t: 'Nockenwellensensor – Stromkreis', rules: [], check: 'Startverhalten' },
  P0341: { t: 'Nockenwellensensor – Bereich/Leistung', rules: [], check: 'Steuerzeiten' },
  P0400: { t: 'Abgasrückführung – Durchfluss', rules: ['egr_plausibility', 'maf_diesel_idle'], check: 'AGR in Teil- und Volllast, Luftmasse im Leerlauf' },
  P0401: { t: 'Abgasrückführung – Durchfluss zu gering', rules: ['egr_plausibility', 'maf_diesel_idle'], check: 'Ventil und Kanäle versottet – der Diesel-Klassiker' },
  P0402: { t: 'Abgasrückführung – Durchfluss zu hoch', rules: ['egr_plausibility', 'maf_diesel_idle', 'idle_rpm'], check: 'Ventil hängt offen; Luftmasse im Leerlauf zu niedrig' },
  P0403: { t: 'Abgasrückführung – Stellerkreis', rules: ['egr_plausibility'], check: 'Stellmotor, Verkabelung' },
  P0404: { t: 'Abgasrückführung – Stellerposition', rules: ['egr_plausibility'], check: 'Positionsrückmeldung' },
  P0410: { t: 'Sekundärluftsystem', rules: ['cat_temp'], check: 'Pumpe und Ventil, nur beim Kaltstart aktiv' },
  P0420: { t: 'Katalysator Bank 1 – Wirkungsgrad zu gering', rules: ['cat_temp', 'ltft_b1', 'o2_switching'], check: 'Erst Gemisch und Sonde 1 ausschließen; ein Kat stirbt selten von selbst' },
  P0430: { t: 'Katalysator Bank 2 – Wirkungsgrad zu gering', rules: ['cat_temp', 'ltft_b2'], check: 'Wie P0420, Bank 2' },
  P0440: { t: 'Tankentlüftung – Fehlfunktion', rules: ['ltft_b1', 'stft_bias'], check: 'Tankdeckel, Ventil' },
  P0441: { t: 'Tankentlüftung – Spülfluss falsch', rules: ['stft_bias'], check: 'Spülventil klemmt: Gemisch im Leerlauf fett' },
  P0442: { t: 'Tankentlüftung – kleines Leck', rules: [], check: 'Tankdeckel zuerst' },
  P0455: { t: 'Tankentlüftung – großes Leck', rules: [], check: 'Tankdeckel offen oder Schlauch ab' },
  P0456: { t: 'Tankentlüftung – sehr kleines Leck', rules: [], check: 'Tankdeckeldichtung' },
  P0460: { t: 'Tankgeber – Stromkreis', rules: [], check: 'Tankanzeige' },
  P0480: { t: 'Kühlerlüfter 1 – Steuerkreis', rules: ['coolant_operating'], check: 'Kühlmittel im Stand und Stau' },
  P0481: { t: 'Kühlerlüfter 2 – Steuerkreis', rules: ['coolant_operating'], check: 'Wie P0480' },
  P0500: { t: 'Geschwindigkeitssensor', rules: ['speed_cross'], check: 'OBD-Geschwindigkeit gegen GPS' },
  P0501: { t: 'Geschwindigkeitssensor – Bereich/Leistung', rules: ['speed_cross'], check: 'Wie P0500' },
  P0505: { t: 'Leerlaufregelung', rules: ['idle_rpm', 'load_idle'], check: 'Leerlaufdrehzahl und -ruhe' },
  P0506: { t: 'Leerlaufdrehzahl zu niedrig', rules: ['idle_rpm', 'load_idle'], check: 'Verkokte Drosselklappe, Falschluft' },
  P0507: { t: 'Leerlaufdrehzahl zu hoch', rules: ['idle_rpm', 'load_idle'], check: 'Falschluft – Leerlauflast über Soll' },
  P0520: { t: 'Öldrucksensor – Stromkreis', rules: ['oil_temp'], check: 'Öldruck sofort prüfen lassen' },
  P0521: { t: 'Öldrucksensor – Bereich/Leistung', rules: ['oil_temp'], check: 'Wie P0520' },
  P0522: { t: 'Öldruck – Signal zu niedrig', rules: ['oil_temp'], check: 'Nicht weiterfahren, bis der Öldruck gemessen ist' },
  P0560: { t: 'Bordspannung – Fehlfunktion', rules: ['batt_voltage'], check: 'Bordspannung bei laufendem Motor' },
  P0562: { t: 'Bordspannung zu niedrig', rules: ['batt_voltage'], check: 'Generator lädt nicht ausreichend' },
  P0563: { t: 'Bordspannung zu hoch', rules: ['batt_voltage'], check: 'Regler defekt – Steuergeräte in Gefahr' },
  P0600: { t: 'Steuergeräte-Kommunikation', rules: [], check: 'CAN-Bus, Masse' },
  P0601: { t: 'Motorsteuergerät – Speicherfehler', rules: [], check: 'Steuergerät' },
  P0605: { t: 'Motorsteuergerät – ROM-Fehler', rules: [], check: 'Steuergerät' },
  P0606: { t: 'Motorsteuergerät – Prozessor', rules: [], check: 'Steuergerät' },
  P0685: { t: 'Motorsteuergerät – Versorgungsrelais', rules: ['batt_voltage'], check: 'Relais, Verkabelung' },
  P0700: { t: 'Getriebesteuerung – Fehler gespeichert', rules: ['trans_temp'], check: 'Der eigentliche Code steht im Getriebesteuergerät' },
  P0715: { t: 'Getriebe-Eingangsdrehzahlsensor', rules: [], check: 'Getriebesteuergerät auslesen' },
  P0720: { t: 'Getriebe-Ausgangsdrehzahlsensor', rules: ['speed_cross'], check: 'Getriebesteuergerät auslesen' },
  P0730: { t: 'Getriebe – falsche Übersetzung', rules: [], check: 'Gangerkennung: schlupft ein Gang?' },
  P0740: { t: 'Wandlerüberbrückung – Stromkreis', rules: [], check: 'Gangerkennung: Streuung um die Geraden' },
  P0741: { t: 'Wandlerüberbrückung – Leistung/hängt offen', rules: [], check: 'Punkte streuen nach oben von den Ganggeraden ab' },
  P2002: { t: 'Partikelfilter Bank 1 – Wirkungsgrad', rules: ['dpf_regen'], check: 'Regenerationshäufigkeit, Differenzdruck' },
  P2096: { t: 'Gemischregelung hinter Kat zu mager Bank 1', rules: ['cat_temp', 'ltft_b1'], check: 'Abgasleck vor Sonde 2' },
  P2097: { t: 'Gemischregelung hinter Kat zu fett Bank 1', rules: ['cat_temp', 'ltft_b1'], check: 'Kat oder Sonde 2' },
  P2181: { t: 'Kühlsystem – Leistung', rules: ['coolant_operating', 'coolant_warmup'], check: 'Thermostat, Kühlmittelverlauf' },
  P2187: { t: 'Gemisch im Leerlauf zu mager Bank 1', rules: ['ltft_load_dep', 'load_idle', 'stft_bias'], check: 'Falschluft – zeigt sich vor allem im Leerlauf' },
  P2188: { t: 'Gemisch im Leerlauf zu fett Bank 1', rules: ['stft_bias', 'load_idle'], check: 'Undichter Injektor, Spülventil' },
  P2195: { t: 'Lambdasonde 1 Bank 1 – Signal hängt mager', rules: ['o2_switching', 'stft_bias'], check: 'Sonde oder Falschluft' },
  P2196: { t: 'Lambdasonde 1 Bank 1 – Signal hängt fett', rules: ['o2_switching', 'stft_bias'], check: 'Sonde oder Gemisch' },
  P2270: { t: 'Lambdasonde 2 Bank 1 – hängt mager', rules: ['cat_temp'], check: 'Abgasleck, Sonde' },
  P2271: { t: 'Lambdasonde 2 Bank 1 – hängt fett', rules: ['cat_temp'], check: 'Sonde, Kat' },
  P2452: { t: 'Differenzdrucksensor Partikelfilter – Stromkreis', rules: ['dpf_regen'], check: 'Schläuche zum Sensor, Sensor' },
  P2453: { t: 'Differenzdrucksensor Partikelfilter – Bereich/Leistung', rules: ['dpf_regen'], check: 'Verstopfte Schläuche – häufige Fehlursache für vermeintlich vollen Filter' },
  P2455: { t: 'Differenzdrucksensor Partikelfilter – Signal zu hoch', rules: ['dpf_regen'], check: 'Filter voll oder Sensor' },
  P0234: { t: 'Ladedruck zu hoch (Overboost)', rules: ['boost_wot', 'load_wot', 'boost_diesel_map'], check: 'Ladedruckspitze; Wastegate/VTG klemmt zu' }
};

/* Codes aus freiem Text ziehen: "P0300, P0171 P1234" oder die Ausgabe einer App. */
function parseDtcInput(text) {
  const out = [];
  const seen = new Set();
  const re = /\b([PBCU][0-3][0-9A-F]{3})\b/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const code = m[1].toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code); out.push(code);
  }
  return out;
}

function dtcLookup(code) {
  code = String(code || '').toUpperCase();
  const e = DTC_TABLE[code];
  const family = code[0] === 'P' ? 'Antrieb' : code[0] === 'B' ? 'Karosserie' : code[0] === 'C' ? 'Fahrwerk' : code[0] === 'U' ? 'Netzwerk' : '';
  // P0xxx und P2xxx sind genormt, P1xxx und P3xxx herstellerspezifisch
  const generic = /^P[02]/.test(code) || /^[BCU]0/.test(code);
  return {
    code, family, generic,
    title: e ? e.t : (generic ? 'genormter Code, nicht in der Tabelle' : 'herstellerspezifischer Code – Bedeutung nur aus dem Reparaturleitfaden dieses Herstellers'),
    rules: e ? e.rules : [], check: e ? e.check : ''
  };
}

/* Codes gegen die Befunde stellen: welche Regel stützt oder entkräftet den Code? */
function dtcCrossCheck(codes, results) {
  return codes.map(code => {
    const info = dtcLookup(code);
    const hits = info.rules.map(id => results.find(r => r.id === id)).filter(Boolean);
    const supporting = hits.filter(r => r.status === 'warn' || r.status === 'crit');
    const contra = hits.filter(r => r.status === 'ok');
    const open = hits.filter(r => r.status === 'unklar' || r.status === 'missing');
    let verdict = 'ohne Messbild';
    if (supporting.length) verdict = 'Messung stützt den Code';
    else if (contra.length && !open.length) verdict = 'Messung zeigt nichts – Code eher sporadisch oder alt';
    else if (contra.length) verdict = 'Messung teils unauffällig, teils nicht bewertbar';
    else if (open.length) verdict = 'Messung kann den Code nicht prüfen';
    return Object.assign(info, { supporting: supporting.map(r => r.id), contra: contra.map(r => r.id), open: open.map(r => r.id), verdict });
  });
}
