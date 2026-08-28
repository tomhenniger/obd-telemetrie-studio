/* ---------------------------------------------------------------------------
   Getriebe: Werksübersetzungen, eigene Eingabe, oder nur die Gangzahl.

   Warum überhaupt: das Werkzeug misst die tatsächlich gefahrenen Übersetzungen
   sehr genau — aber es kann nicht wissen, WELCHE Gangnummern das sind. Ein Gang,
   der in der Fahrt nicht benutzt wurde, hinterlässt keine Spur; beim Anfahren
   schleift die Kupplung und liefert gar kein festes Verhältnis. Wer weiß, dass
   sein Getriebe sieben Gänge hat, bekommt hier deshalb echte Gangnummern statt
   einer Nummerierung nach Übersetzung — und die Angabe, welcher Gang fehlt.

   Das Getriebe kommt NICHT aus dem Motorprofil: denselben Motor gibt es mit
   Handschalter, Wandler und Doppelkupplung, und derselbe Getriebetyp läuft je
   Modell mit verschiedenen Achsantrieben. Es ist eine eigene Angabe.

   Grundformel, überall in dieser Datei:
       km/h je 1000 min⁻¹ = 60 · Abrollumfang[m] / (Getriebeübersetzung · Achsantrieb)
--------------------------------------------------------------------------- */

const GEARBOX_MODES = [
  { id: '',        label: 'keine Angabe – nach Übersetzung nummerieren' },
  { id: 'catalog', label: 'Getriebe aus dem Katalog wählen' },
  { id: 'manual',  label: 'Übersetzungen selbst eintragen' },
  { id: 'count',   label: 'nur die Anzahl der Gänge angeben' }
];

/* Werksübersetzungen. Jeder Eintrag trägt seine Quelle und eine Konfidenz —
   ein geratener Wert wäre hier schädlicher als eine Lücke. */
const GEARBOXES = [
  {"id": "zf_8hp45", "kennung": "ZF 8HP45 (auch 8HP30/I)", "name": "8-Gang Steptronic / ZF 8HP Gen 1 (klein)", "kind": "wandler", "gears": 8, "ratios": [4.7143, 3.1429, 2.1064, 1.6667, 1.2854, 1.0, 0.8387, 0.6667], "final": 0, "models": "BMW 3er F30 (320i/328i/320d/330d), 5er F10 (520i-528i, 520d), 1er F20, X1/X3, Audi A8 4.0 (als 8HP55A-Familie abweichend)", "years": [2010, 2018], "confidence": "hoch", "quelle": "en.wikipedia.org/wiki/ZF_8HP_transmission (zaehnezahlbasierte Radsatztabelle, 8HP45 = 33/7 usw.); Gen-1-Reihe zusaetzlich durch offizielles BMW-Datenblatt 7er F01 09/2010 bestaetigt (760i, gerundet identisch)", "hinweis": "Achsantrieb variiert je Modell/Motorisierung (ca. 2,81-3,64) - BMW-Datenblatt des jeweiligen Fahrzeugs noetig. Stufensprung 4->5 (1,297) ist groesser als 3->4 (1,264): dokumentierte 8HP-Radsatz-Eigenheit, kein Datenfehler."},
  {"id": "zf_8hp70", "kennung": "ZF 8HP70 (auch 8HP55/65/90 und 8HP75/I)", "name": "8-Gang Steptronic / ZF 8HP Gen 1 (gross)", "kind": "wandler", "gears": 8, "ratios": [4.7143, 3.1429, 2.1064, 1.6667, 1.2847, 1.0, 0.8392, 0.6667], "final": 0, "models": "BMW 550i/650i/750i (LCI), 535d/740d/X5/X6, 760i (8HP90); Chrysler/Dodge/Jeep/Ram als 845RE/850RE; Jaguar/Land Rover; Rolls-Royce", "years": [2008, 2023], "confidence": "hoch", "quelle": "en.wikipedia.org/wiki/ZF_8HP_transmission (Radsatztabelle, R = -534/161); BMW-Datenblatt 7er F01 09/2010 (760i: 4,714/3,143/2,106/1,667/1,285/1,000/0,839/0,667, R 3,317, HA 2,813); Anwendungen 845RE/850RE: en.wikipedia.org/wiki/List_of_Chrysler_transmissions", "hinweis": "Vom 8HP45 nur in Gang 5 (1,2847 vs. 1,2854), Gang 7 (0,8392 vs. 0,8387) und R unterscheidbar - fuer OBD-Ganganalyse praktisch identisch. Bei Stellantis (845RE/850RE) bis mind. 2023 in Produktion.", "finalTypisch": [{"modell": "BMW 760i F01 (8HP90)", "wert": 2.813}]},
  {"id": "zf_8hp_gen2", "kennung": "ZF 8HP50 / 8HP75(II) / 8HP95 (Gen 2, ab 2018 auch 8HP76/I)", "name": "8-Gang Steptronic / ZF 8HP Gen 2", "kind": "wandler", "gears": 8, "ratios": [5.0, 3.2, 2.1429, 1.72, 1.3131, 1.0, 0.8226, 0.64], "final": 0, "models": "BMW G-Baureihen ab ca. 2015/16: 7er G11, 5er G30, 3er G20 (fruehe), X3 G01, X5 G05; Toyota/BMW-Kooperationsmodelle; Jaguar/Land Rover; Alfa Romeo Giulia/Stelvio (8HP50/75)", "years": [2014, null], "confidence": "mittel", "quelle": "en.wikipedia.org/wiki/ZF_8HP_transmission (Radsatztabelle Gen 2: 8HP50 R -432/125 = -3,456, i5 1,3139, i7 0,8221; 8HP75/II u. 8HP95: R -3,4783, i5 1,3131, i7 0,8226)", "hinweis": "Werte hier = 8HP75/II; 8HP50 weicht nur minimal ab (Gang 5: 1,3139, Gang 7: 0,8221, R -3,456) - fuer Ganganalyse identisch. Nur eine unabhaengige Quelle live geprueft, deckt sich aber mit BMW-Katalogrundung 5,000/3,200/2,143/1,720/1,314/1,000/0,823/0,640. Achtung: der fruehe 8HP75/I (2014) behielt noch den Gen-1-Radsatz (4,714er-Reihe)."},
  {"id": "zf_8hp51_gen3", "kennung": "ZF 8HP51 (auch 8HP30/III, Gen 3)", "name": "8-Gang Steptronic / ZF 8HP Gen 3 (klein)", "kind": "wandler", "gears": 8, "ratios": [5.25, 3.36, 2.1724, 1.72, 1.3161, 1.0, 0.8221, 0.64], "final": 0, "models": "Toyota GR Supra (8HP51), BMW 3er G20 (320i/330i/320d spaetere), Z4 G29, 1er/2er", "years": [2018, null], "confidence": "mittel", "quelle": "en.wikipedia.org/wiki/ZF_8HP_transmission (Radsatztabelle Gen 3); Supra-Anwendung 8HP51: de.wikipedia.org (Toyota-Supra-Artikel, Erwaehnung '8HP 51 von ZF')", "hinweis": "Nur eine unabhaengige Quelle live geprueft. Erster Gang deutlich kuerzer (5,25) als Gen 1/2."},
  {"id": "zf_8hp76_gen3", "kennung": "ZF 8HP76/II (Gen 3, gross)", "name": "8-Gang Steptronic / ZF 8HP Gen 3 (gross)", "kind": "wandler", "gears": 8, "ratios": [5.5, 3.52, 2.2, 1.72, 1.3172, 1.0, 0.8226, 0.64], "final": 0, "models": "BMW M340i/M440i, 540i/540d LCI, X3 M40i, X5/X6/X7 40i/40d (ab ca. 2018-2020), Land Rover", "years": [2018, null], "confidence": "mittel", "quelle": "en.wikipedia.org/wiki/ZF_8HP_transmission (Radsatztabelle Gen 3: 8HP76/II R -3,993)", "hinweis": "Nur eine unabhaengige Quelle live geprueft. Der fruehe 8HP76/I (2018) nutzt noch die Gen-2-Reihe (5,000...). Stufensprung 2->3 (1,60) groesser als 1->2 (1,5625) - reale Eigenheit dieser Variante."},
  {"id": "zf_6hp", "kennung": "ZF 6HP19 / 6HP21 / 6HP26 / 6HP28 / 6HP32", "name": "6-Gang-Automatik (6HP)", "kind": "wandler", "gears": 6, "ratios": [4.171, 2.34, 1.521, 1.143, 0.867, 0.691], "final": 0, "models": "BMW E60/E65/E70/E90/F01 (fast alle Automatik-BMW 2001-2011), Audi (6HP19A quattro), Jaguar XK/XF, Aston Martin DB9, Maserati, Ford Falcon", "years": [2000, 2014], "confidence": "hoch", "quelle": "en.wikipedia.org/wiki/ZF_6HP_transmission (alle Varianten identische Reihe); bestaetigt durch offizielle BMW-Datenblaetter 7er F01 09/2010 (4,171/2,340/1,521/1,143/0,867/0,691, R 3,403) inkl. Achsuebersetzungen", "hinweis": "Alle 6HP-Varianten (19/21/26/28/32) haben denselben Radsatz - per OBD nicht unterscheidbar. Stufenspruenge streng monoton fallend (1,78/1,54/1,33/1,32/1,25) - Plausibilitaetsprobe voll bestanden.", "finalTypisch": [{"modell": "BMW 740i/750i F01 (2010)", "wert": 3.462}, {"modell": "BMW 730d F01 (2010)", "wert": 2.813}, {"modell": "BMW 740d F01 (2010)", "wert": 3.077}]},
  {"id": "mb_722_6_klein", "kennung": "Mercedes 722.6 (W5A 280/300/330)", "name": "5G-Tronic (kleine Variante)", "kind": "wandler", "gears": 5, "ratios": [3.932, 2.408, 1.486, 1.0, 0.83], "final": 0, "models": "Mercedes C-Klasse (W202/W203), E-Klasse 4-/6-Zyl. (W210/W211), SLK, CLK, ML 4-/6-Zyl.", "years": [1996, 2011], "confidence": "hoch", "quelle": "en.wikipedia.org/wiki/5G-Tronic (komplette Reihe); de.wikipedia.org/wiki/Liste_der_Mercedes-Benz-Automatikgetriebe (W5A330: i1 3,9319 / i5 0,8305 / iR -3,1002)", "hinweis": "Achsantrieb stark modellabhaengig (ca. 2,87-3,91). Stufenspruenge monoton fallend - Probe bestanden."},
  {"id": "mb_722_6_gross", "kennung": "Mercedes 722.6 (W5A 400/580/900)", "name": "5G-Tronic (grosse Variante) / Chrysler NAG1 W5A580", "kind": "wandler", "gears": 5, "ratios": [3.588, 2.186, 1.405, 1.0, 0.831], "final": 0, "models": "Mercedes E/S/SL/CL V8, G-Klasse, AMG-Modelle bis 2006 (55er Kompressor); als NAG1: Chrysler 300C, Dodge Charger/Challenger/Magnum, Jeep Grand Cherokee, Crossfire; Porsche 911 (996/997) Tiptronic S", "years": [1996, 2020], "confidence": "hoch", "quelle": "en.wikipedia.org/wiki/5G-Tronic; de.wikipedia.org/wiki/Liste_der_Mercedes-Benz-Automatikgetriebe (W5A580: i1 3,5876 / i5 0,8314 / iR -3,1605); NAG1-Anwendungen: en.wikipedia.org/wiki/List_of_Chrysler_transmissions", "hinweis": "In US-Quellen oft als 3,59/2,19/1,41/1,00/0,83 gerundet. Bis 2018/2020 bei Chrysler in Produktion."},
  {"id": "mb_722_9", "kennung": "Mercedes 722.9 (W7A 400/700/900)", "name": "7G-Tronic / 7G-Tronic Plus", "kind": "wandler", "gears": 7, "ratios": [4.3772, 2.8586, 1.9206, 1.3684, 1.0, 0.8204, 0.7276], "final": 0, "models": "Fast alle Mercedes mit Laengsmotor 2004-2016: C/E/S-Klasse, CLS, SL, SLK, ML/GL/GLK, Sprinter-Nachfolgevarianten; Infiniti Q50/Q60 2.0t/2.2d; SsangYong", "years": [2003, 2020], "confidence": "hoch", "quelle": "en.wikipedia.org/wiki/7G-Tronic (komplette Reihe, R1 -3,4157, R2 -2,2307); de.wikipedia.org/wiki/Liste_der_Mercedes-Benz-Automatikgetriebe (zaehnezahlbasiert: i1 203840/46569 = 4,3760, i7 0,7277, iR -3,4164)", "hinweis": "Zwei Rueckwaertsgaenge (R1 -3,416, R2 -2,231). Beide Quellen weichen in der 4. Nachkommastelle ab (Rundung der Zaehnezahl-Brueche). Achsantrieb modellabhaengig ca. 2,47-3,27. Stufenspruenge monoton fallend - Probe bestanden."},
  {"id": "amg_speedshift_mct7", "kennung": "AMG Speedshift MCT 7 (724.2, Basis 722.9)", "name": "AMG Speedshift MCT 7-Gang", "kind": "wandler", "gears": 7, "ratios": [4.3772, 2.8586, 1.9206, 1.3684, 1.0, 0.8204, 0.7276], "final": 0, "models": "Mercedes-AMG SL63 (R230/R231), E63 (W212), CLS63, S63 (W221), C63 (W205)", "years": [2008, 2022], "confidence": "mittel", "quelle": "en.wikipedia.org/wiki/7G-Tronic (MCT als AMG-Variante des 722.9 mit identischem Radsatz, nasse Anfahrkupplung statt Wandler)", "hinweis": "Kein Drehmomentwandler, sondern nasse Anfahrkupplung - Radsatz und Uebersetzungen aber identisch zum 722.9, daher per OBD-Ratioanalyse nicht vom 722.9 unterscheidbar. Die Gleichheit der Uebersetzungen ist nur ueber eine Quelle direkt belegt, daher Konfidenz mittel."},
  {"id": "mb_725_0", "kennung": "Mercedes 725.0 (W9A 700)", "name": "9G-Tronic", "kind": "wandler", "gears": 9, "ratios": [5.5032, 3.3333, 2.3148, 1.6611, 1.2106, 1.0, 0.8651, 0.7167, 0.6015], "final": 0, "models": "Mercedes E-Klasse (ab 2013, zuerst E 350 BlueTEC), C-Klasse W205/W206, S-Klasse, GLC/GLE/GLS, CLS - praktisch alle Laengsmotor-Mercedes ab ca. 2016", "years": [2013, null], "confidence": "hoch", "quelle": "en.wikipedia.org/wiki/9G-Tronic und de.wikipedia.org/wiki/Mercedes-Benz_9G-Tronic (identische 4-Dezimal-Werte); Spreizung 5,5032/0,6015 = 9,15 deckt sich exakt mit der offiziellen Daimler-Angabe 9,15", "hinweis": "Im Netz kursiert eine abweichende Reihe (5,35/3,24/2,25/1,64/...) - sie ergibt Spreizung 8,9 und passt NICHT zur amtlichen Spreizung 9,15; vermutlich fehlerhafte Wiedergabe. Stufensprung 7->8 (1,207) groesser als 6->7 (1,156): reale Radsatz-Eigenheit der 9G, kein Fehler. Achsantrieb modellabhaengig (ca. 2,47-3,27)."},
  {"id": "ford_6f35", "kennung": "Ford 6F35", "name": "6-Gang-Automatik (6F35)", "kind": "wandler", "gears": 6, "ratios": [4.584, 2.964, 1.912, 1.446, 1.0, 0.746], "final": 0, "models": "Ford Escape/Kuga, Fusion, Focus (2.0), C-Max (2009-2020)", "years": [2009, 2020], "confidence": "mittel", "quelle": "Reihe live nur fuer die baugleich uebersetzte GM-Schwesterkonstruktion 6T40/6T45 belegt (en.wikipedia.org/wiki/GM_6T40_transmission: 4,584/2,964/1,912/1,446/1,000/0,746, R -2,940); 6F35-Anwendungen: en.wikipedia.org/wiki/List_of_Ford_transmissions", "hinweis": "VORBEHALT: Eine Ford-eigene Quelle fuer die 6F35-Reihe konnte in dieser Recherche nicht live verifiziert werden; die Werte entsprechen den in Ford-Presskits ueblichen Angaben und exakt der GM-6T40-Reihe. Getriebe ist quer eingebaut (Transaxle) - 'Achsantrieb' ist der integrierte Final Drive, je Anwendung ca. 3,17-3,88."}
];

function gearboxById(id) { return GEARBOXES.find(g => g.id === id) || null; }

/* Die gespeicherte Getriebeangabe. Bewusst nicht Teil des Motorprofils. */
function gearboxSetting() {
  const s = store.get('gearbox', null);
  if (!s || typeof s !== 'object' || !s.mode) return null;
  return s;
}
function setGearboxSetting(s) {
  if (!s || !s.mode) store.del('gearbox'); else store.set('gearbox', s);
}

/* Übersetzung je Gang -> km/h je 1000 min⁻¹, unter Berücksichtigung getrennter
   Achsantriebe je Teilgetriebe (bei Doppelkupplungsgetrieben die Regel). */
function gearboxTable(gb, rollCircum) {
  if (!gb || !gb.ratios || !gb.ratios.length || !(rollCircum > 0)) return null;
  const out = [];
  for (let i = 0; i < gb.ratios.length; i++) {
    const gear = i + 1;
    const g = gb.ratios[i];
    if (!(g > 0)) continue;
    let f = gb.final;
    if (gb.final2 && gb.final2Gears && gb.final2Gears.indexOf(gear) >= 0) f = gb.final2;
    if (!(f > 0)) continue;
    out.push({ gear, ratio: g, final: f, total: g * f, kmhPer1000: 60 * rollCircum / (g * f) });
  }
  return out.length ? out : null;
}

/* Die aktuell gültige Getriebeangabe, aufgelöst zu dem, was die Auswertung braucht.
   Rückgabe: null, oder { kind, gears, table|null, firstGear|null, label, quelle } */
function resolveGearbox(profile, rollCircum) {
  const s = gearboxSetting();
  if (!s) return null;
  if (s.mode === 'catalog') {
    const gb = gearboxById(s.id);
    if (!gb) return null;
    const fin = s.final > 0 ? s.final : gb.final;
    const table = gearboxTable(Object.assign({}, gb, { final: fin }), rollCircum);
    return { kind: 'catalog', gears: gb.gears, table, firstGear: null,
             ratios: gb.ratios, final: fin, rollCircum,
             label: gb.kennung + ' · ' + gb.name, quelle: gb.quelle || '',
             confidence: gb.confidence || 'mittel', hinweis: gb.hinweis || '',
             finalUser: s.final > 0 ? s.final : null };
  }
  if (s.mode === 'manual') {
    const ratios = (s.ratios || []).map(Number).filter(v => v > 0);
    if (ratios.length && !(s.final > 0))
      // Übersetzungen ohne Achsantrieb: der lässt sich aus der Messung bestimmen.
      return { kind: 'manual', gears: ratios.length, table: null, firstGear: null,
               ratios, final: 0, rollCircum, label: 'eigene Übersetzungen',
               quelle: 'selbst eingetragen', confidence: 'eigenangabe' };
    if (!ratios.length || !(s.final > 0)) {
      return s.gears > 1 ? { kind: 'count', gears: s.gears | 0, table: null,
                             firstGear: s.firstGear || null, label: 'eigene Angabe', quelle: '' } : null;
    }
    const table = gearboxTable({ ratios, final: s.final, final2: s.final2, final2Gears: s.final2Gears }, rollCircum);
    return { kind: 'manual', gears: ratios.length, table, firstGear: null,
             ratios, final: s.final, rollCircum,
             label: 'eigene Übersetzungen', quelle: 'selbst eingetragen', confidence: 'eigenangabe' };
  }
  if (s.mode === 'count' && s.gears > 1)
    return { kind: 'count', gears: s.gears | 0, table: null, firstGear: s.firstGear || null,
             label: s.gears + '-Gang-Getriebe', quelle: 'eigene Angabe' };
  return null;
}

/* Gemessene Cluster den Werksgängen zuordnen.

   Die gemessenen Übersetzungen sind aufsteigend sortiert und müssen auf eine
   aufsteigende Teilfolge der Gänge abgebildet werden — ein Gang kann fehlen
   (nicht gefahren), aber die Reihenfolge kann sich nicht umkehren. Bei höchstens
   zehn Gängen ist das kleine Suchproblem exakt lösbar; eine gierige Zuordnung
   würde bei einem fehlenden mittleren Gang alles danach verschieben. */
function matchGearsToTable(measuredKmh, table) {
  const m = measuredKmh.length, n = table.length;
  if (!m || !n || m > n) return null;
  const lm = measuredKmh.map(Math.log), lt = table.map(t => Math.log(t.kmhPer1000));
  let best = null;
  const pick = new Array(m);
  (function walk(mi, ti, cost) {
    if (best && cost >= best.cost) return;          // kann nicht mehr besser werden
    if (mi === m) { best = { cost, idx: pick.slice() }; return; }
    if (n - ti < m - mi) return;                    // nicht mehr genug Gänge übrig
    for (let t = ti; t <= n - (m - mi); t++) {
      const d = lm[mi] - lt[t];
      pick[mi] = t;
      walk(mi + 1, t + 1, cost + d * d);
    }
  })(0, 0, 0);
  if (!best) return null;
  // Zuordnung nur annehmen, wenn sie auch passt. 9 % ist grosszügig genug für
  // einen abweichenden Achsantrieb oder eine andere Reifengroesse, aber eng
  // genug, um eine falsche Getriebewahl auffallen zu lassen.
  const dev = best.idx.map((t, i) => measuredKmh[i] / table[t].kmhPer1000 - 1);
  const worst = dev.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  return { idx: best.idx, dev, worst, ok: worst <= 0.09 };
}

/* Achsantrieb aus der Messung bestimmen.

   Bei fast allen Wandlerautomaten steht der Achsantrieb nicht am Getriebe, sondern
   am Fahrzeug — dasselbe Getriebe läuft je Motorisierung mit anderer Hinterachse.
   Die Übersetzungen SELBST verraten aber, welche Gänge gefahren wurden: ihre
   Abstände sind ein Fingerabdruck, den ein gemeinsamer Faktor nicht verändert.
   Ist die Zuordnung gefunden, folgt der Achsantrieb als Median der Einzelwerte.

   Rückgabe: { final, idx, dev, worst } oder null. */
function fitFinalDrive(measuredKmh, ratios, rollCircum) {
  const m = measuredKmh.length, n = ratios.length;
  if (!m || !n || m > n || !(rollCircum > 0)) return null;
  // gemessen aufsteigend km/h je 1000 == absteigend in der Übersetzung
  let best = null;
  const pick = new Array(m);
  (function walk(mi, ti) {
    if (mi === m) {
      // je Paarung ein Achsantrieb, der Median ist gegen einen Ausreißer robust
      const fs = [];
      for (let i = 0; i < m; i++) fs.push(60 * rollCircum / (measuredKmh[i] * ratios[pick[i]]));
      const f = quantileSorted(fs.slice().sort((a, b) => a - b), .5);
      let worst = 0;
      const dev = [];
      for (let i = 0; i < m; i++) {
        const soll = 60 * rollCircum / (ratios[pick[i]] * f);
        const d = measuredKmh[i] / soll - 1;
        dev.push(d);
        if (Math.abs(d) > worst) worst = Math.abs(d);
      }
      if (!best || worst < best.worst) best = { final: f, idx: pick.slice(), dev, worst };
      return;
    }
    if (n - ti < m - mi) return;
    for (let t = ti; t <= n - (m - mi); t++) { pick[mi] = t; walk(mi + 1, t + 1); }
  })(0, 0);
  if (!best) return null;
  // Ein Achsantrieb ausserhalb dieses Bandes ist keine Achse, sondern ein Fehlschluss.
  if (!(best.final > 1.5 && best.final < 6.5)) return null;
  return best;
}

/* Ohne Werksübersetzungen bleibt nur die Gangzahl. Dann ist offen, ob der
   kürzeste gemessene Gang der erste ist — beim Anfahren schleift die Kupplung,
   der erste Gang hinterlässt oft gar kein festes Verhältnis. Aus der Drehzahl-
   grenze lässt sich das aber abschätzen: ein erster Gang ist so ausgelegt, dass
   er am Begrenzer etwa 45–75 km/h erreicht. */
function suggestFirstGear(lowestKmhPer1000, redline, gears, measuredCount) {
  const maxOffset = Math.max(1, gears - measuredCount + 1);
  if (!(lowestKmhPer1000 > 0) || !(redline > 0)) return 1;
  const vAtRedline = lowestKmhPer1000 * redline / 1000;
  let g = 1;
  if (vAtRedline > 135) g = 3;
  else if (vAtRedline > 80) g = 2;
  return Math.min(g, maxOffset);
}

/* Welches Katalog-Getriebe passt zu dieser Messung?

   Die Abstände der gemessenen Übersetzungen sind ein Fingerabdruck, den der
   Achsantrieb nicht verändert — deshalb lässt sich das Getriebe erraten, ohne
   ihn zu kennen. Das ist ein Vorschlag, kein Befund: mehrere Getriebe können
   ähnlich abgestuft sein, und wer nur drei Gänge gefahren ist, hat zu wenig
   Fingerabdruck für eine Entscheidung. */
function suggestGearboxes(measuredKmh, rollCircum, limit) {
  const hits = [];
  for (const gb of GEARBOXES) {
    const fit = fitFinalDrive(measuredKmh, gb.ratios, rollCircum);
    if (!fit) continue;
    hits.push({ gb, final: fit.final, worst: fit.worst, gears: fit.idx.map(i => i + 1) });
  }
  hits.sort((a, b) => a.worst - b.worst);
  return hits.slice(0, limit || 5);
}

/* Gangnummern an das Ergebnis von computeGears heften.
   Verändert `gears` in place und liefert die Zusatzinformationen fürs UI. */
function labelGears(res, gbx, redline) {
  if (!res || !res.gears.length) return null;
  const asc = res.gears.slice().sort((a, b) => a.kmhPer1000 - b.kmhPer1000);
  const meas = asc.map(g => g.kmhPer1000);

  // Übersetzungen bekannt, Achsantrieb nicht: aus der Messung bestimmen.
  let fitted = null;
  if (gbx && !gbx.table && gbx.ratios && gbx.ratios.length && !(gbx.final > 0)) {
    const fit = fitFinalDrive(meas, gbx.ratios, gbx.rollCircum);
    if (fit && fit.worst <= 0.025) {
      fitted = fit;
      gbx = Object.assign({}, gbx, {
        final: fit.final,
        table: gearboxTable({ ratios: gbx.ratios, final: fit.final }, gbx.rollCircum)
      });
    } else {
      // Ohne belastbaren Achsantrieb bleibt immerhin die Gangzahl.
      gbx = Object.assign({}, gbx, { kind: 'count', table: null, firstGear: null,
                                     needsFinal: true, fitWorst: fit ? fit.worst : null });
    }
  }

  if (gbx && gbx.table) {
    const mt = matchGearsToTable(meas, gbx.table);
    if (mt && mt.ok) {
      asc.forEach((g, i) => {
        const t = gbx.table[mt.idx[i]];
        g.gear = t.gear; g.label = 'G' + t.gear;
        g.refKmhPer1000 = t.kmhPer1000; g.refRatio = t.ratio; g.refFinal = t.final;
        g.dev = mt.dev[i];
      });
      const used = new Set(mt.idx);
      const missing = gbx.table.filter((t, i) => !used.has(i));
      return { mode: 'table', gears: gbx.gears, missing, worst: mt.worst,
               label: gbx.label, quelle: gbx.quelle, confidence: gbx.confidence,
               hinweis: gbx.hinweis, final: gbx.final,
               finalFitted: fitted ? fitted.final : null, finalUser: gbx.finalUser };
    }
    // Zuordnung passt nicht — das ist selbst ein Befund, kein Grund zum Raten.
    asc.forEach((g, i) => { g.gear = i + 1; g.label = 'S' + (i + 1); });
    return { mode: 'mismatch', gears: gbx.gears, label: gbx.label,
             worst: mt ? mt.worst : null, quelle: gbx.quelle, confidence: gbx.confidence };
  }

  if (gbx && gbx.kind === 'count') {
    // Mehr gemessene Übersetzungen als das Getriebe Gänge hat: das ist ein Widerspruch,
    // kein Rundungsproblem. Entweder stimmt die Angabe nicht, oder die Erkennung hat eine
    // Stufe erfunden. Beides gehört gesagt, statt es durch Nummerieren zu überdecken.
    if (asc.length > gbx.gears) {
      asc.forEach((g, i) => { g.gear = i + 1; g.label = 'S' + (i + 1); });
      return { mode: 'too-many', gears: gbx.gears, measured: asc.length, label: gbx.label };
    }
    const off = gbx.firstGear > 0
      ? Math.min(gbx.firstGear, Math.max(1, gbx.gears - asc.length + 1))
      : suggestFirstGear(meas[0], redline, gbx.gears, asc.length);
    asc.forEach((g, i) => { g.gear = off + i; g.label = 'G' + (off + i); });
    const missing = [];
    for (let n = 1; n <= gbx.gears; n++) if (n < off || n >= off + asc.length) missing.push({ gear: n });
    return { mode: 'count', gears: gbx.gears, firstGear: off, missing,
             suggested: !(gbx.firstGear > 0), label: gbx.label, quelle: gbx.quelle,
             needsFinal: !!gbx.needsFinal, fitWorst: gbx.fitWorst };
  }

  // Ohne jede Angabe: nach Übersetzung nummerieren und das auch so nennen.
  asc.forEach((g, i) => { g.gear = i + 1; g.label = 'S' + (i + 1); });
  return { mode: 'none' };
}
