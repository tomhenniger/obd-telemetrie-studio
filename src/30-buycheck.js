/* ============================================================
   Kaufcheck — Prüfpunkte, Messprotokoll und Besichtigungs-Verwaltung
   Die Inhalte stehen weiter unten in BUY_CHECKS, MEASURE_PLAN und PID_SETS.
   ============================================================ */

const BUY_PHASES = [
  { id: 'vorher',     label: 'Vor dem Termin',   sub: 'am Telefon und aus dem Inserat klären', time: '10 min' },
  { id: 'papiere',    label: 'Papiere',          sub: 'Fahrzeugschein, Historie, Laufleistung', time: '10 min' },
  { id: 'karosserie', label: 'Karosserie',       sub: 'Lack, Spaltmaße, Rost, Unfallspuren',    time: '10 min' },
  { id: 'motorraum',  label: 'Motorraum kalt',   sub: 'vor dem ersten Start',                   time: '8 min'  },
  { id: 'kaltstart',  label: 'Kaltstart',        sub: 'gibt es nur einmal',                     time: '3 min'  },
  { id: 'innenraum',  label: 'Innenraum',        sub: 'Elektrik, Feuchtigkeit, Verschleiß',     time: '8 min'  },
  { id: 'fahrwerk',   label: 'Fahrwerk',         sub: 'Reifen, Bremsen, Lager',                 time: '7 min'  },
  { id: 'probefahrt', label: 'Probefahrt',       sub: 'mit laufender OBD-Aufzeichnung',         time: '25 min' },
  { id: 'danach',     label: 'Nach der Fahrt',   sub: 'warm nachschauen',                       time: '5 min'  }
];

const SEVERITY = {
  ko:      { label: 'Abbruchkriterium', badge: 'crit', rank: 0 },
  teuer:   { label: 'teuer',            badge: 'warn', rank: 1 },
  hinweis: { label: 'Hinweis',          badge: 'mute', rank: 2 }
};

/* --- Besichtigungen: mehrere Fahrzeuge nebeneinander führen --- */
function inspections() {
  const raw = store.get('inspections', []);
  return Array.isArray(raw) ? raw : [];
}
function saveInspection(insp) {
  const list = inspections().filter(x => x.id !== insp.id);
  list.unshift(insp);
  store.set('inspections', list.slice(0, 40));
}
function deleteInspection(id) {
  store.set('inspections', inspections().filter(x => x.id !== id));
  if (store.get('activeInspection', null) === id) store.del('activeInspection');
}
function newInspection(profileId) {
  const insp = {
    id: 'i' + Math.abs(hashCode(String(inspections().length) + (profileId || '') + BUY_CHECKS.length)).toString(36) +
        inspections().length,
    name: '', model: '', km: '', price: '', year: '', vin: '', seller: '', gearbox: '',
    profileId: profileId || null,
    marks: {}, notes: {}, created: null
  };
  saveInspection(insp);
  store.set('activeInspection', insp.id);
  return insp;
}
function activeInspection(profileId) {
  const id = store.get('activeInspection', null);
  const found = inspections().find(x => x.id === id);
  return found || (inspections()[0] || newInspection(profileId));
}

/* Welche Prüfpunkte gelten für dieses Fahrzeug?
   Kraftstoff und Aufladung kommen aus dem Motorprofil — das weiß der Motor.
   Modell und Getriebeart kommen aus der Besichtigung, denn dieselbe Motorisierung
   sitzt oft in mehreren Baureihen: aus einem Motorprofil lässt sich ein A4 nicht
   von einem S5 unterscheiden. Was sich nicht entscheiden lässt, wird angezeigt und
   als bedingt gekennzeichnet, statt es stillschweigend ein- oder auszublenden. */
const GEARBOX_KINDS = [
  { id: '', label: 'weiß ich noch nicht' },
  { id: 'manuell', label: 'Handschalter' },
  { id: 'wandler', label: 'Wandlerautomatik' },
  { id: 'dkg', label: 'Doppelkupplung (DSG, S tronic, PDK)' },
  { id: 'cvt', label: 'Stufenlos (CVT, multitronic)' }
];

function modelHaystack(profile, insp) {
  const typed = [insp && insp.model, insp && insp.name].filter(Boolean).join(' ').trim();
  if (typed) return { text: typed.toLowerCase(), quelle: 'eingabe' };
  const fromProfile = [profile && profile.models, profile && profile.name].filter(Boolean).join(' ');
  return { text: fromProfile.toLowerCase(), quelle: fromProfile ? 'profil' : 'leer' };
}

/* Prüft einen Punkt gegen Fahrzeug und Besichtigung.
   Ergebnis: null = gilt nicht · {} = gilt · {bedingung} = gilt vielleicht */
function checkApplies(c, profile, insp) {
  const a = c.appliesTo;
  if (!a) return {};
  if (a.fuel && profile && profile.fuel && a.fuel !== profile.fuel) return null;
  if (a.aspiration && profile && profile.aspiration) {
    const boosted = profile.aspiration !== 'sauger';
    if (a.aspiration === 'sauger' && boosted) return null;
    if (a.aspiration !== 'sauger' && !boosted) return null;
  }
  if (a.brandAny && profile && profile.brand) {
    const b = String(profile.brand).toLowerCase();
    if (!a.brandAny.some(x => b.indexOf(String(x).toLowerCase()) >= 0)) return null;
  }
  const cond = [];
  if (a.models) {
    const hay = modelHaystack(profile, insp);
    const hit = a.models.some(mdl => new RegExp('(^|[^a-z0-9])' + mdl.toLowerCase() + '([^a-z0-9]|$)').test(hay.text));
    if (!hit) {
      if (hay.quelle === 'eingabe') return null;          // Modell bekannt und passt nicht
      cond.push('nur bei ' + a.models.map(x => x.toUpperCase()).join(', '));
    } else if (hay.quelle !== 'eingabe') {
      cond.push('Baureihe im Feld „Modell“ eintragen, damit das sicher stimmt');
    }
  }
  if (a.gearbox) {
    const g = (insp && insp.gearbox) || '';
    if (g && a.gearbox.indexOf(g) < 0) return null;        // Getriebe bekannt und passt nicht
    if (!g) cond.push('nur bei ' + a.gearbox.map(x => {
      const k = GEARBOX_KINDS.find(y => y.id === x); return k ? k.label : x;
    }).join(' oder '));
  }
  return cond.length ? { bedingung: cond.join(' · ') } : {};
}

/* Textvarianten je Bauart.
   Ein Feld darf ein String sein (gilt immer) oder ein Objekt
   { base, petrol, diesel, turbo, sauger, cvt, dkg, wandler, manuell }.
   Zusammengesetzt wird base plus alles, was zum Fahrzeug passt — so steht beim
   Ottomotor nichts über Glühkerzen und beim Diesel nichts über Zündkerzen. */
function variantKeys(profile, insp) {
  const k = [];
  if (profile) {
    k.push(profile.fuel === 'diesel' ? 'diesel' : 'petrol');
    k.push(profile.aspiration === 'sauger' ? 'sauger' : 'turbo');
  }
  const g = insp && insp.gearbox;
  if (g) k.push(g);
  return k;
}
function resolveText(field, keys) {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return field.join(' ');
  const parts = [];
  if (field.base) parts.push(field.base);
  for (const k of keys) if (field[k]) parts.push(field[k]);
  if (!parts.length) {
    // Keine passende Variante: lieber alles zeigen als nichts
    for (const k in field) if (k !== 'base' && field[k]) parts.push(field[k]);
  }
  return parts.filter(Boolean).join(' ');
}
function resolveList(field, keys) {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  let out = Array.isArray(field.base) ? field.base.slice() : [];
  for (const k of keys) if (Array.isArray(field[k])) out = out.concat(field[k]);
  if (!out.length) for (const k in field) if (Array.isArray(field[k])) out = out.concat(field[k]);
  return out;
}
function resolveCheck(c, keys) {
  if (typeof c.what === 'string' && typeof c.good === 'string' && typeof c.bad === 'string') return c;
  return Object.assign({}, c, {
    what: resolveText(c.what, keys), good: resolveText(c.good, keys), bad: resolveText(c.bad, keys)
  });
}
function resolveMeasure(m, keys) {
  return Object.assign({}, m, {
    instruction: resolveText(m.instruction, keys), reveals: resolveList(m.reveals, keys),
    goodIf: resolveText(m.goodIf, keys), badIf: resolveText(m.badIf, keys)
  });
}

function checksFor(profile, insp) {
  const keys = variantKeys(profile, insp);
  const out = [];
  for (const c of BUY_CHECKS) {
    const r = checkApplies(c, profile, insp);
    if (!r) continue;
    const rc = resolveCheck(c, keys);
    out.push(r.bedingung ? Object.assign({}, rc, { bedingung: r.bedingung }) : rc);
  }
  return out;
}
function measuresFor(profile, insp) {
  const keys = variantKeys(profile, insp);
  return MEASURE_PLAN.filter(m => !m.fuel || !profile || !profile.fuel || m.fuel === profile.fuel)
                     .slice().sort((a, b) => (a.order || 0) - (b.order || 0))
                     .map(m => resolveMeasure(m, keys));
}
function pidsFor(profile) {
  const key = profile && profile.fuel === 'diesel' ? 'diesel' : 'petrol';
  return (PID_SETS && PID_SETS[key]) || [];
}

/* Fortschritt und Ampel einer Besichtigung */
function inspectionScore(insp, profile) {
  const list = checksFor(profile, insp);
  let done = 0, bad = 0, ko = 0, teuer = 0;
  for (const c of list) {
    const m = insp.marks[c.id];
    if (m === 'ok' || m === 'bad' || m === 'na') done++;
    if (m === 'bad') {
      bad++;
      if (c.severity === 'ko') ko++;
      else if (c.severity === 'teuer') teuer++;
    }
  }
  return { total: list.length, done, bad, ko, teuer, share: list.length ? done / list.length : 0 };
}

/* --- Inhalte: Prüfpunkte, Messfahrten, PID-Listen --------------- */
const BUY_CHECKS = [
  {
    id: 'motorcode_erfragen',
    phase: 'vorher',
    title: 'Motorcode und Baujahr erfragen',
    what: {
      base: 'Am Telefon nach dem Motorkennbuchstaben fragen, er steht im Fahrzeugschein in den Bemerkungen unter Feld 22, in älteren Scheinen unter „zu 2“, im Serviceheft und auf dem Motorblock. Um ein Foto der ersten Seite des Fahrzeugscheins bitten, die Fahrgestellnummer wird später für die Rückrufabfrage gebraucht.',
      petrol: 'Beim Ottomotor entscheidet der Kennbuchstabe darüber, ob eine Generation mit Ölverbrauch, gelängter Steuerkette oder schwacher Hochdruckpumpe vor dir steht.',
      diesel: 'Beim Diesel entscheidet der Kennbuchstabe über Abgasnorm, Rückrufstand, Zahnriemen oder Steuerkette und darüber, ob Injektoren und Abgasrückführung als Schwachstelle dieser Baureihe gelten.'
    },
    good: 'Der Verkäufer nennt den Motorkennbuchstaben ohne Zögern und schickt das Foto.',
    bad: 'Ausweichen oder Unwissen. Ohne Motorkennbuchstaben ist keine Aussage über bekannte Motorprobleme belastbar, du kaufst dann blind.',
    severity: 'hinweis'
  },
  {
    id: 'motornummer_praefix',
    phase: 'vorher',
    title: 'Motornummer-Präfix prüfen',
    what: {
      base: 'Nach dem Präfix der Motornummer fragen, es steht vor der eigentlichen Nummer auf dem Motorblock und in den Werkstattunterlagen.',
      petrol: '06J ist EA888 Gen1 und Gen2 mit Ölverbrauchs- und Kettenrisiko, 06K ist EA888 Gen3 ab etwa Mitte 2012 und deutlich entschärft.',
      diesel: '03L ist der 2.0 TDI EA189 mit Abgasskandal und verschlissenem Sechskant des Ölpumpenantriebs, 04L der spätere EA288.'
    },
    good: {
      base: 'Der Verkäufer nennt Präfix und Kennbuchstaben, und beides passt zum angegebenen Baujahr.',
      petrol: 'Risikoarm sind 06K sowie die Kennbuchstaben 1.8 TFSI CJEB und 2.0 TFSI CNCD.',
      diesel: 'Risikoarm sind 04L sowie die Kennbuchstaben 2.0 TDI CSUA und CSUB und die späteren EA288-Varianten.'
    },
    bad: {
      base: 'Kann oder will der Verkäufer das Präfix nicht nennen, bleibt die teuerste Frage des Termins offen.',
      petrol: 'Die Kombination 06J mit CDNB, CDNC, CAEA oder CAEB, verbaut vor allem in A4 B8, A5 8T und Q5 8R, hat Ölverbrauch und Steuerkette in einem. Die Kolbeninstandsetzung liegt bei etwa 3.000 EUR frei und 5.000 bis 6.000 EUR beim Vertragshändler.',
      diesel: 'Ein 03L-EA189 ohne durchgeführtes Abgasupdate bedeutet Stilllegungsrisiko. Mit Update hängt oft eine höhere Belastung von Abgasrückführung und Partikelfilter daran, beides vierstellig.'
    },
    severity: 'hinweis',
    appliesTo: { brandAny: ['VW', 'Audi', 'Seat', 'Skoda', 'Cupra'] }
  },
  {
    id: 'getriebeart_klaeren',
    phase: 'vorher',
    title: 'Getriebeart klären',
    what: {
      base: 'Fragen, ob Handschalter, Wandlerautomatik, Doppelkupplungsgetriebe oder stufenloses CVT verbaut ist. Das ist die teuerste Einzelfrage vor dem Termin. Zusätzlich nach Belegen über Getriebeölwechsel fragen.',
      manuell: 'Beim Handschalter zusätzlich fragen, ob und bei welchem Kilometerstand Kupplung und Zweimassenschwungrad getauscht wurden.',
      wandler: 'Bei der Wandlerautomatik nach Ölwechseln alle 80.000 bis 100.000 km fragen, die Lifetime-Angabe des Herstellers ist keine.',
      dkg: 'Beim Doppelkupplungsgetriebe zuerst fragen, ob es ein nasses oder ein trockenes Kupplungspaket ist. Nur das nasse hat einen Ölservice alle 60.000 km; beim trockenen entfällt er, dort zählt allein das Mechatronik-Öl.',
      cvt: 'Beim stufenlosen CVT nach Ölwechseln alle 60.000 km oder vier Jahre samt anschließender Grundeinstellung fragen.',
      diesel: 'Beim Diesel hängt am Handschalter fast immer ein Zweimassenschwungrad, danach gezielt fragen.'
    },
    good: {
      base: 'Zu der verbauten Getriebeart liegen Wechselbelege mit Datum und Kilometerstand vor.',
      manuell: 'Handschalter mit dokumentierter Kupplung oder mit weniger als 150.000 km auf der ersten Kupplung.',
      wandler: 'Wandlerautomatik mit Ölwechsel alle 80.000 bis 100.000 km.',
      dkg: 'Nasses Doppelkupplungsgetriebe mit Ölwechselbeleg alle 60.000 km; beim trockenen ist ein fehlender Beleg kein Befund, weil es diesen Service nicht gibt.',
      cvt: 'Stufenloses Getriebe nur mit lückenlosen Ölwechselbelegen samt Grundeinstellung.'
    },
    bad: {
      base: 'Keine Belege und keine klare Auskunft zur Getriebeart. Wer nicht weiß, was verbaut ist, weiß auch nichts über die Wartung.',
      manuell: 'Eine rutschende Kupplung mit Zweimassenschwungrad kostet 900 bis 1.800 EUR.',
      wandler: 'Ein nie gewechseltes Öl nach 200.000 km ist teurer als der Wechsel, die Instandsetzung liegt bei 2.000 bis 3.500 EUR.',
      dkg: 'Beim nassen Kupplungspaket ohne Ölservicebeleg 1.500 bis 2.000 EUR Rücklage einplanen. Ein Kupplungspaket kostet unabhängig von der Bauart 2.600 bis 3.800 EUR.',
      cvt: 'Stufenloses CVT ohne Wechselbelege. Instandsetzung 2.500 bis 3.500 EUR, Austauschgetriebe 4.000 bis 5.000 EUR, das liegt oft über dem Restwert des Fahrzeugs.'
    },
    severity: 'teuer',
    cost: '2.000-4.500 EUR'
  },
  {
    id: 'multitronic_meiden',
    phase: 'vorher',
    title: 'Stufenloses Getriebe abklären',
    what: 'Bei Audi A4, A5, A6 und A7 mit Frontantrieb und Automatik ist es immer die multitronic, also ein stufenloses CVT, verbaut von 12/2007 bis 08/2015. Klären, ob stattdessen quattro mit tiptronic oder S tronic oder ein Handschalter vorliegt — quattro schließt die multitronic aus. Stufenlose Getriebe bauen auch Toyota, Nissan, Subaru und Honda; dort gilt sinngemäß dasselbe.',
    good: 'Handschalter, Wandlerautomatik oder Doppelkupplung. Bei einem stufenlosen Getriebe nur mit lückenlosem Nachweis von Ölwechseln alle 60.000 km oder vier Jahre samt anschließender Grundeinstellung.',
    bad: 'Stufenloses Getriebe ohne Belege. Bei der multitronic Häufungen ab 100.000 bis 150.000 km, dokumentierte Ausfälle schon ab 60.000 km, rund 18 Prozent Getriebeprobleme in Zuverlässigkeitsumfragen. Angebote bis 6.800 EUR, damit wirtschaftlicher Totalschaden.',
    severity: 'ko',
    cost: '2.500-6.800 EUR',
    appliesTo: { gearbox: ['cvt', 'wandler'] }
  },
  {
    id: 'zahnriemen_beleg',
    phase: 'vorher',
    title: 'Zahnriemenbeleg anfordern',
    what: {
      base: 'Zuerst klären, ob der Motor einen Zahnriemen oder eine Steuerkette hat, danach richten sich Intervall und Kosten vollständig. Dann nach der Rechnung für den Steuertrieb fragen, mit Datum und Kilometerstand darauf.',
      diesel: 'Beim 2.0 TDI liegt das Zahnriemenintervall bei 180.000 km bis Baujahr 2009 und 210.000 km ab Modelljahr 2010, spätestens nach sechs bis sieben Jahren unabhängig von der Laufleistung. Der Riemen läuft hier gegen ein Nockenwellen- und Pumpenpaket, der Satz gehört mit Wasserpumpe und Spannrolle gewechselt.',
      petrol: 'Viele aufgeladene Ottomotoren laufen mit Steuerkette, die kein festes Intervall hat, sich dafür aber längt und dann ohne Vorwarnung überspringt. Hat der Ottomotor einen Zahnriemen, liegt das Intervall meist bei 120.000 bis 180.000 km oder sechs Jahren.'
    },
    good: {
      base: 'Die Rechnung liegt vor und nennt Datum, Kilometerstand und Teilenummern.',
      diesel: 'Der gewechselte Satz enthielt Wasserpumpe und Spannrolle, und der Wechsel liegt weniger als sechs Jahre zurück.',
      petrol: 'Bei einem Kettenmotor gibt es entweder einen Beleg über Kette, Spanner und Gleitschienen oder eine niedrige Laufleistung und einen unauffälligen Kaltstart.'
    },
    bad: {
      base: 'Mündliche Zusicherung ohne Papier. Ein Steuertrieb ohne Beleg ist ein ungewechselter Steuertrieb.',
      diesel: 'Nie gemacht bei 190.000 km. Frei 550 bis 900 EUR, in der Vertragswerkstatt bis 1.700 EUR. Reißt der Riemen, ist der Motor hin.',
      petrol: 'Sitzt die Steuerkette am Getriebeflansch, kostet der Wechsel 1.500 bis 3.000 EUR, weil der Motor ausgebaut oder abgesenkt werden muss. Ein Kettensprung mit Ventilkontakt liegt bei 4.000 bis 8.000 EUR.'
    },
    severity: 'teuer',
    cost: '550-3.000 EUR'
  },
  {
    id: 'halter_historie',
    phase: 'vorher',
    title: 'Halterzahl und Standzeit erfragen',
    what: {
      base: 'Anzahl der Halter, Serviceheft digital oder auf Papier, Datum der letzten Inspektion, wie lange das Fahrzeug schon steht und ob es täglich bewegt wird.',
      diesel: 'Beim Diesel zusätzlich nach dem Streckenprofil fragen, reiner Kurzstreckenbetrieb ruiniert Partikelfilter und Abgasrückführung.',
      petrol: 'Beim Ottomotor ist reiner Kurzstreckenbetrieb vor allem für Öl, Katalysator und Batterie ein Thema.'
    },
    good: 'Ein bis drei Halter, lückenlose Historie, Fahrzeug ist in Betrieb.',
    bad: {
      base: 'Fünf oder mehr Halter in zehn Jahren, Serviceheft verloren, Standzeit über drei Monate. Standschäden an Bremsen, Reifen und Batterie kosten 300 bis 800 EUR.',
      diesel: 'Ein Diesel mit 6.000 km im Jahr überwiegend im Stadtverkehr ist der teuerste Fall, Partikelfilter und Abgasrückführung sind dann meist am Ende.'
    },
    severity: 'hinweis',
    cost: '300-800 EUR'
  },
  {
    id: 'unfallfreiheit_schriftlich',
    phase: 'vorher',
    title: 'Unfallfreiheit schriftlich abfragen',
    what: 'Wörtlich fragen: Ist das Fahrzeug unfallfrei in dem Sinne, dass keine Reparatur an tragenden Teilen und keine Nachlackierung stattgefunden hat? Die Antwort per Nachricht oder Mail geben lassen, damit sie beweisbar ist.',
    good: 'Klares Ja in Textform, oder eine offene Schilderung des Schadens mit Reparaturrechnung.',
    bad: 'Ausweichende Formulierungen wie nur ein Bagatellschaden oder kleiner Parkrempler, war aber alles fachgerecht. Die schriftliche Aussage ist später die Grundlage für einen Rücktritt bei Falschangabe.',
    severity: 'hinweis'
  },
  {
    id: 'tuning_abfragen',
    phase: 'vorher',
    title: 'Tuning und Softwarestand abfragen',
    what: {
      base: 'Fragen, ob Chiptuning oder eine Softwareoptimierung stattgefunden hat, ob an der Abgasanlage etwas verändert wurde und ob alle Umbauten im Fahrzeugschein eingetragen sind.',
      diesel: 'Beim Diesel gezielt nach entferntem Partikelfilter, stillgelegter Abgasrückführung und abgeschalteter AdBlue-Dosierung fragen.',
      petrol: 'Beim Ottomotor gezielt nach Downpipe, entferntem Katalysator, bei Fahrzeugen ab etwa 2018 nach dem Ottopartikelfilter und nach einer Klappenabgasanlage fragen.',
      turbo: 'Bei Aufladung ist Software besonders folgenreich, weil Ladedruck, Lader, Kupplung und Getriebe unmittelbar daran hängen.',
      sauger: 'Beim Saugmotor bringt Software wenig, hier sind eher Nockenwellen, Fächerkrümmer und offene Ansaugung das Thema, und alles davon ist eintragungspflichtig.'
    },
    good: 'Serienzustand, oder Tuning mit Teilegutachten und Eintragung im Fahrzeugschein.',
    bad: {
      base: 'Nicht eingetragenes Tuning lässt den Versicherungsschutz erlöschen. Zurückgeflasht bedeutet meist, dass Reste in Fehlerspeicher und Adaptionen bleiben.',
      diesel: 'Ein entfernter Partikelfilter oder eine stillgelegte Abgasrückführung ist ein Abbruchgrund, weil die Betriebserlaubnis erlischt.',
      petrol: 'Ein entfernter Katalysator oder ein ausgebauter Ottopartikelfilter ist ein Abbruchgrund, weil die Betriebserlaubnis erlischt.',
      turbo: 'Mehrleistung ohne Eintragung belastet Lader, Kupplung und Getriebe und verkürzt deren Leben deutlich.'
    },
    severity: 'hinweis'
  },
  {
    id: 'reifenalter_hu_vorab',
    phase: 'vorher',
    title: 'Reifenalter und HU-Termin',
    what: 'Ein Foto der DOT-Nummer aller vier Reifen anfordern und den nächsten Termin der Hauptuntersuchung erfragen.',
    good: 'Reifen jünger als sechs Jahre, Hauptuntersuchung läuft noch mindestens ein Jahr.',
    bad: 'Läuft die Hauptuntersuchung in weniger als drei Monaten ab, will der Verkäufer die Mängelkosten loswerden. Ein Reifensatz älter als sechs Jahre kostet 500 bis 900 EUR.',
    severity: 'hinweis',
    cost: '500-900 EUR'
  },
  {
    id: 'rueckrufe_fin',
    phase: 'vorher',
    title: 'Rückrufe mit der FIN prüfen',
    what: {
      base: 'Mit der Fahrgestellnummer aus dem Inserat beim Markenhändler anrufen und abfragen lassen, welche Rückrufe und Serviceaktionen offen sind. Zusätzlich die Rückrufdatenbank des Kraftfahrt-Bundesamts durchsehen. Das ist der wirksamste einzelne Vorbereitungsschritt und kostet nichts.',
      diesel: 'Beim Diesel gehört die Frage nach Abgasupdate und Softwarestand dazu, das ist der mit Abstand häufigste offene Punkt.',
      petrol: 'Beim Ottomotor sind es eher Aktionen zu Kraftstoffverteiler, Hochdruckpumpe und Steuerkettenspanner.'
    },
    good: 'Keine offenen Aktionen, und das Serviceheft enthält die Aktionscodes der bereits erledigten Rückrufe.',
    bad: 'Eine offene sicherheitsrelevante Aktion. Manche Rückrufe bedeuten Stilllegungsrisiko oder Brandgefahr, und der Verkäufer weiß davon oft selbst nichts.',
    severity: 'hinweis'
  },
  {
    id: 'audi_rueckrufcodes',
    phase: 'vorher',
    title: 'Baureihen-Rückrufcodes abfragen',
    what: {
      base: 'Beim Audi-Partner konkret nach den Aktionen dieser Baureihe fragen: 27H2 und 27H8 Riemenstartergenerator beim 48-Volt-Mildhybrid der Baureihe B9, Wasserpumpenrückruf, Sperrbolzen der Anhängevorrichtung bis 2018 und Alu-Zierleisten 2014 bis 2017.',
      diesel: 'Zusätzlich nach 23Q7 EA189-Abgasupdate und nach 23DW Thermofenster und Abgasrückführung für die Modelljahre 2010 bis 2017 fragen.',
      petrol: 'Zusätzlich nach der Aktion zum Kraftstoffverteiler bis 2018 fragen.'
    },
    good: 'Alle zutreffenden Aktionen sind als erledigt vermerkt.',
    bad: {
      base: '27H2 offen bedeutet Brandgefahr durch den Riemenstartergenerator, Audi rät Betroffenen sogar vom Parken in der Garage ab — das betrifft Benziner wie Diesel mit 48-Volt-Bordnetz. Ein offener Wasserpumpenrückruf bedeutet Überhitzungsrisiko und im Folgeschaden die Zylinderkopfdichtung.',
      diesel: '23Q7 nicht durchgeführt bedeutet Stilllegungsrisiko. 23DW offen bedeutet, eine weitere Verschärfung der Abgasrückführung steht noch bevor.',
      petrol: 'Eine offene Aktion am Kraftstoffverteiler bedeutet Undichtigkeit im Hochdruckbereich.'
    },
    severity: 'hinweis',
    appliesTo: { models: ['A4', 'A5', 'S4', 'S5', 'Q5', 'allroad'] }
  },
  {
    id: 'kaltstart_vereinbaren',
    phase: 'vorher',
    title: 'Kaltstart verbindlich vereinbaren',
    what: {
      base: 'Den Termin so legen, dass das Fahrzeug seit mindestens acht Stunden steht, also früher Vormittag vor der Haustür des Verkäufers. Wörtlich sagen: Bitte nicht vorher fahren und nicht warmlaufen lassen, ich möchte den Kaltstart hören. Die Adresse vorher haben, kein Entgegenkommen mit dem Auto.',
      diesel: 'Beim Diesel zählt zusätzlich die Außentemperatur, unter etwa 10 Grad zeigt sich ein schwaches Glühsystem am deutlichsten.'
    },
    good: 'Der Verkäufer sagt zu und nennt die Adresse.',
    bad: {
      base: 'Ein warm angelieferter Motor macht Startverhalten, Auspuffrauch und kalten Getriebeschlag unprüfbar. Wer immer zufällig warm vorfährt, versteckt genau das teure Problem, das du suchst.',
      petrol: 'Warm hörst du kein Kettenrasseln in den ersten Sekunden und siehst keinen Blaurauch beim ersten Gasstoß.',
      diesel: 'Warm hörst du das kalte Nageln nicht, siehst den Rauch der ersten Sekunden nicht und kannst die Vorglühzeit nicht beurteilen.'
    },
    severity: 'hinweis'
  },
  {
    id: 'werkzeug_packen',
    phase: 'vorher',
    title: 'Werkzeug zusammenpacken',
    what: 'Einpacken: OBD-Adapter mit geladenem Handy und Powerbank, Lackschichtmessgerät, starke Taschenlampe, kleiner in Stoff gewickelter Magnet, Papiertücher, Einweghandschuhe, Reifenprofilmesser, Digitalthermometer, alte Decke oder Pappe, Zollstock, ausgedruckter Kaufvertrag und eine Begleitperson.',
    good: 'Alles ist dabei und der OBD-Adapter wurde vorher an einem anderen Fahrzeug getestet.',
    bad: 'Ohne Lackschichtmessgerät und Taschenlampe bleiben Unfallschaden und Rost unentdeckt. Ein leerer Handyakku beendet den Termin mitten im Log.',
    severity: 'hinweis',
    cost: '50-120 EUR',
    tool: 'Komplette Werkzeugliste'
  },
  {
    id: 'motor_wirklich_kalt',
    phase: 'papiere',
    title: 'Beweisen dass der Motor kalt ist',
    what: {
      base: 'Beim Eintreffen zuerst die flache Hand auf die Motorhaube legen, kurz die Handfläche ans Endrohr halten und das Endrohr innen mit einem Papiertuch auswischen. Unter die geöffnete Haube fassen und Motorblock und Kühlerlüfter prüfen. Unter dem Endrohr nach einer Kondenswasserpfütze schauen.',
      diesel: 'Beim Diesel ist Ruß im Endrohr völlig normal, entscheidend ist allein, ob er trocken oder feucht ist.'
    },
    good: {
      base: 'Haube und Endrohr haben Umgebungstemperatur, keine Pfütze am Boden, der Lüfter steht still.',
      diesel: 'Das Papiertuch nimmt trockenen, staubigen Ruß auf, aber keine feuchte Schmiere.',
      petrol: 'Das Papiertuch bleibt weitgehend sauber und nimmt höchstens hellgrauen trockenen Staub auf.'
    },
    bad: {
      base: 'Warme Haube oder eine Pfütze am Boden bedeuten, der Wagen ist gelaufen. Damit ist der wichtigste Test des Termins verloren, also Termin verschieben.',
      diesel: 'Feuchter, schmierig glänzender Ruß am Tuch heißt, der Motor lief eben noch.',
      petrol: 'Ein feuchter, öliger Film am Tuch heißt, der Motor lief eben noch.'
    },
    severity: 'ko'
  },
  {
    id: 'zb1_zb2',
    phase: 'papiere',
    title: 'Fahrzeugschein und Brief',
    what: {
      base: 'Beide Teile der Zulassungsbescheinigung im Original ansehen. Den Halter im Brief mit dem Personalausweis des Verkäufers abgleichen. Felder prüfen: B Erstzulassung, C Halter, I Zulassung auf den aktuellen Halter, P.3 Kraftstoff und Feld 22 Auflagen und Eintragungen.',
      diesel: 'Beim Diesel zusätzlich den Emissionsschlüssel in Feld 14.1 ansehen, er entscheidet über Umweltzonen und mögliche Fahrverbote.',
      petrol: 'Beim Ottomotor muss in Feld P.3 Benzin stehen, und der Emissionsschlüssel in Feld 14.1 entscheidet über die Plakette.'
    },
    good: 'Der Verkäufer ist der eingetragene Halter, Teil II liegt vor, keine ungewöhnlichen Eintragungen.',
    bad: 'Der Brief ist bei der Bank, dann läuft eine Finanzierung und es geht nur mit Ablösebestätigung. Verkauf für einen Freund oder ein Ersatzbrief ohne erklärbaren Grund. Fehlender Teil II ist ein Abbruchgrund.',
    severity: 'ko'
  },
  {
    id: 'fin_abgleich',
    phase: 'papiere',
    title: 'FIN an vier Stellen abgleichen',
    what: 'Die 17-stellige Fahrgestellnummer vergleichen zwischen Zulassungsbescheinigung, Sichtfenster unten in der Windschutzscheibe, der ins Blech eingeschlagenen Nummer im Wasserkasten oder am Längsträger und dem Typschild-Aufkleber im Türeinstieg beziehungsweise in der Reserveradmulde unter der Bodenmatte. Auf dem Typschild stehen auch Lackcode und Ausstattungsnummern.',
    good: 'Alle vier Stellen identisch, Aufkleber unbeschädigt, die eingeschlagenen Ziffern gleichmäßig und ohne Schleifspuren.',
    bad: 'Fehlender oder überklebter Aufkleber, ungleichmäßige Schlagzahlen, Schleifspuren, frische Farbe rund um die Nummer. Sofort und ohne Diskussion gehen.',
    severity: 'ko'
  },
  {
    id: 'serviceheft_km',
    phase: 'papiere',
    title: 'Serviceheft und Kilometerstände',
    what: 'Alle Kilometerstände in der Historie chronologisch prüfen und mit dem Tacho vergleichen, dann die Jahresfahrleistung ausrechnen. Bei digitalem Serviceheft den Ausdruck des Markenpartners verlangen, den der Verkäufer über die FIN kostenlos ziehen kann.',
    good: {
      base: 'Gleichmäßig 15.000 bis 25.000 km im Jahr, immer dieselbe Werkstatt.',
      petrol: 'Ölwechsel spätestens alle 15.000 km oder jährlich, das ist bei Kettenmotoren die wichtigste einzelne Wartungsposition überhaupt.',
      diesel: 'Ölwechsel spätestens alle 15.000 km oder jährlich, dazu Belege über den Kraftstofffilter und bei Zahnriemenmotoren über den Riemenwechsel.'
    },
    bad: {
      base: 'Eine Lücke von drei Jahren, ein Sprung von 40.000 km in einem Jahr und danach Stillstand, handschriftliche Stempel ohne Rechnung.',
      petrol: 'Longlife-Intervalle von 30.000 km sind bei Motoren mit Steuerkette und bekannter Ölverbrauchsthematik ein klares Minus.',
      diesel: 'Longlife-Intervalle von 30.000 km sind bei Kurzstreckenbetrieb ein klares Minus, weil abgebrochene Regenerationen das Öl mit Kraftstoff verdünnen.'
    },
    severity: 'hinweis'
  },
  {
    id: 'reparaturbelege',
    phase: 'papiere',
    title: 'Belege für teure Reparaturen',
    what: {
      base: 'Den Rechnungsordner gezielt nach den teuren Positionen durchsuchen: Getriebeölwechsel, Kupplung, Zylinderkopfdichtung, Fahrwerk und Klimakompressor. Nur Rechnungen mit Teilenummern zählen.',
      petrol: 'Beim Ottomotor gezielt nach Steuerkette und Kettenspanner mit Teilenummer, Kolben- und Kolbenring-Instandsetzung, Ölverbrauchsmessung, Zündspulen und einer Reinigung der Einlassventile suchen.',
      diesel: 'Beim Diesel gezielt nach Zahnriemensatz, Injektoren mit Einspritzmengenanpassung, Partikelfilter, Abgasrückführventil, Ansaugbrücke und Zweimassenschwungrad suchen.',
      turbo: 'Bei Aufladung zusätzlich nach Turbolader, Ladedrucksteller und Ladeluftkühler suchen.',
      sauger: 'Beim Saugmotor zusätzlich nach Nockenwellenverstellern, Drosselklappe und Saugrohrklappen suchen.'
    },
    good: 'Rechnungen mit Datum, Kilometerstand und Teilenummern liegen vor.',
    bad: 'Mündliche Zusicherung, es sei alles gemacht worden, ohne Papier. Ein instandgesetzter Motor ohne Rechnung ist kein instandgesetzter Motor, und genau diese Reparaturen sind vierstellig.',
    severity: 'teuer'
  },
  {
    id: 'hu_berichte',
    phase: 'papiere',
    title: 'HU-Berichte der letzten Prüfungen',
    what: 'Nicht nur die Plakette ansehen, sondern die Prüfberichte der letzten zwei bis drei Hauptuntersuchungen verlangen. Dort stehen die geringen Mängel, die nicht zur Nachprüfung führten, und dort steht auch der damalige Kilometerstand.',
    good: 'Ohne Mängel oder nur Beleuchtung, und die Kilometerstände passen zur Historie.',
    bad: 'Zweimal in Folge Ölverlust an Motor oder Getriebe, beginnende Korrosion an tragenden Teilen oder eine beschädigte Achsmanschette. Korrosion an tragenden Teilen im letzten Bericht ist ein Abbruchgrund.',
    severity: 'hinweis'
  },
  {
    id: 'schluessel_bordmappe',
    phase: 'papiere',
    title: 'Beide Schlüssel und Bordmappe',
    what: 'Beide Schlüssel in die Hand nehmen und beide testen, Funkfernbedienung und Notschlüssel. Bordmappe, Radiocode, Wagenheber, Bordwerkzeug, Warndreieck und Reifenreparaturset oder Reserverad kontrollieren.',
    good: 'Zwei funktionierende Schlüssel und vollständige Bordausstattung.',
    bad: 'Nur ein Schlüssel. Ein Ersatzschlüssel mit Anlernen kostet 250 bis 450 EUR, und ein fehlender Zweitschlüssel kann bedeuten, dass ein verlorener Schlüssel im Umlauf ist.',
    severity: 'hinweis',
    cost: '250-450 EUR'
  },
  {
    id: 'tachostand_verschleiss',
    phase: 'papiere',
    title: 'Tachostand gegen Verschleißbild',
    what: 'Den Lenkradkranz bei 9 und 3 Uhr auf Glanz und abgeriebene Naht prüfen, die Pedalgummis auf mittige Abnutzung, das Leder am Schaltknauf, die linke Seitenwange des Fahrersitzes, die Innenseite der Türgriffe und die Blende um den Dreh-Drücksteller.',
    good: 'Der Verschleiß passt zur Laufleistung, bei 100.000 km leichter Glanz, bei 250.000 km deutlich blanke Griffzonen.',
    bad: 'Blank poliertes Lenkrad und durchgescheuerte Sitzwange bei angeblich 90.000 km. Genauso verdächtig sind nagelneue Pedalgummis, ein neuer Lenkradbezug oder frische Bezüge in einem zwölf Jahre alten Auto. Ein Widerspruch zwischen Verschleiß, Serviceheft und HU-Bericht ist ein Abbruchgrund.',
    severity: 'ko'
  },
  {
    id: 'spaltmasse',
    phase: 'karosserie',
    title: 'Spaltmaße vergleichen',
    what: 'In die Hocke gehen und vom vorderen Radlauf an der Fahrzeugseite entlangblicken. Die Spalte an Motorhaube zu Kotflügel, Kotflügel zu Tür, Tür zu Tür, Heckklappe zu Seitenteil und Scheinwerfer zu Kotflügel vergleichen, immer links gegen rechts. Der Finger als Abstandslehre reicht.',
    good: 'Alle Spalte sind über die ganze Länge gleich breit und parallel, links wie rechts, die Scheinwerfer stehen auf gleicher Höhe.',
    bad: 'Ein Spalt vorn 3 mm und hinten 7 mm, eine schief sitzende Motorhaube. Kotflügel und Türen richten kostet 400 bis 1.500 EUR, steckt Blechverzug dahinter, ist es nach oben offen. Ungleiche Spaltmaße zusammen mit erhöhter Lackdicke am selben Bereich sind ein Abbruchgrund.',
    severity: 'teuer',
    cost: '400-1.500 EUR'
  },
  {
    id: 'lackdicke_messen',
    phase: 'karosserie',
    title: 'Lackschichtdicke flächendeckend messen',
    what: 'Das Messgerät an jedem Blechteil an drei Punkten ansetzen: beide vorderen Kotflügel, alle vier Türen, beide hinteren Seitenteile, Motorhaube, Dach und Heckklappe. Alle Werte notieren. An jeder auffälligen Stelle zusätzlich den in Stoff gewickelten Magneten ansetzen. Das Fahrzeug muss trocken sein und bei Tageslicht stehen, auf nassem oder frisch poliertem Lack sieht man nichts.',
    good: '80 bis 150 Mikrometer, gleichmäßig über alle Teile, eine Streuung von 20 bis 30 Mikrometern ist normal. Dach und Motorhaube liegen oft etwas niedriger.',
    bad: '150 bis 250 Mikrometer bedeuten nachlackiert, 200 bis 400 eine deutliche Nachlackierung, über 300 Spachtel plus Lack, über 500 großflächige Spachtelarbeit nach Unfall. Über 300 Mikrometer an Dach, Säule, Seitenteil oder Endspitze ist ein Abbruchgrund.',
    severity: 'teuer',
    cost: '300-800 EUR',
    tool: 'Lackschichtmessgerät mit FE- und NFE-Umschaltung'
  },
  {
    id: 'rost_falze_radlaeufe',
    phase: 'karosserie',
    title: 'Rost an Falzen und Radläufen',
    what: 'Mit Taschenlampe und Handschuh abfahren: Radlaufkanten hinten und vor allem der Übergang von Radlauf zu Schweller von innen im Radhaus, alle vier Türunterkanten von unten fotografieren, Schweller unter der Zierleiste, Wagenheberaufnahmen sowie die vorderen Kotflügel an der Kante zur Tür und an der Schraubkante unter der Haube.',
    good: 'Nur oberflächlicher Flugrost an Auspuff, Bremsscheibenrändern und Schraubköpfen, die Falze sind sauber.',
    bad: 'Blasen im Lack bedeuten immer Rost darunter, nicht darauf. Aufgeplatzte Falze oder Rost, der beim Draufdrücken nachgibt. Instandsetzung 600 bis 1.500 EUR pro Seite, mit Lackierung 1.200 bis 2.500 EUR. Durchrostung an Schweller, Radlaufansatz, Längsträger oder Federbeindom ist ein Abbruchgrund.',
    severity: 'ko',
    cost: '600-2.500 EUR',
    tool: 'Starke Taschenlampe'
  },
  {
    id: 'rost_heckklappe',
    phase: 'karosserie',
    title: 'Heckklappe von innen',
    what: 'Die Heckklappe öffnen und die Innenkante mit dem Finger abfahren, besonders am unteren Rand, an der Kennzeichenmulde und rund um die Griffleiste. Beim A4 B8 rostet die Klappe vor allem unter den Dichtungen der Rückleuchten von innen nach außen. Die Rückleuchten sind gesteckt, wenn der Verkäufer es erlaubt, eine ausbauen.',
    good: 'Trockene, blanke Kanten und keine Kondenswasserspuren in der Klappe.',
    bad: 'Kondenswasser in der Klappe ist der Vorbote, der Rost wird spät sichtbar, weil er von innen kommt. Eine gebrauchte Heckklappe mit Lackierung kostet 500 bis 900 EUR, ein Kotflügel je Seite 400 bis 700 EUR.',
    severity: 'teuer',
    cost: '400-900 EUR'
  },
  {
    id: 'reserveradmulde',
    phase: 'karosserie',
    title: 'Reserveradmulde und Endspitzen',
    what: 'Bodenmatte und Styroporeinsatz aus dem Kofferraum nehmen und mit der Taschenlampe in die Mulde und die seitlichen Fächer leuchten. Den Boden auf Faltenwurf, Schweißperlen und frische Unterbodenwachsflecken prüfen und dabei auf Wasserränder achten.',
    good: 'Staubtrockener, gleichmäßiger Werksboden ohne Schweißspuren.',
    bad: 'Faltenwurf oder frische Schweißnähte bedeuten einen Heckschaden. Ein Wasserrand oder feuchte Dämmung bedeutet Wassereintritt und führt direkt zur Elektrikprüfung im Innenraum.',
    severity: 'ko',
    tool: 'Starke Taschenlampe'
  },
  {
    id: 'scheiben_datumscode',
    phase: 'karosserie',
    title: 'Scheiben als Unfallindiz',
    what: 'Bei allen Scheiben unten in der Ecke auf Herstellerkennung und Datumscode schauen, also Windschutzscheibe, alle vier Seitenscheiben, Heckscheibe und gegebenenfalls Schiebedach. Praktisch reicht die Regel: alle Scheiben sollten denselben Hersteller und denselben Jahrgang haben.',
    good: 'Alle Scheiben von einem Hersteller und aus einem Jahrgang, oder nur die Windschutzscheibe getauscht, was durch Steinschlag völlig normal ist.',
    bad: 'Eine einzelne Seiten- oder Heckscheibe von anderem Hersteller oder Jahrgang deutet auf Einbruch oder Unfall in diesem Bereich. Dann dort gezielt Lackdicke, Spaltmaß und Türverkleidung nachprüfen.',
    severity: 'hinweis'
  },
  {
    id: 'unterboden_radhaeuser',
    phase: 'karosserie',
    title: 'Unterboden und Radhäuser',
    what: {
      base: 'Mit der Taschenlampe flach hinlegen oder das Handy mit Selfie-Kamera unter das Auto halten. Die Unterbodenverkleidung auf Vollständigkeit prüfen, die Motorschutzplatte auf Schleifspuren sowie vordere Haubenkante, Spiegelkappen und A-Säulen auf Steinschlag.',
      turbo: 'Bei Aufladung zusätzlich den Ladeluftkühler hinter dem Stoßfänger auf Steinschlag, verbogene Lamellen und Ölspuren an den Rohren ansehen.',
      sauger: 'Beim Saugmotor sitzt an derselben Stelle nur das Kühlerpaket, dessen Lamellen ebenso auf Steinschlag und Verstopfung zu prüfen sind.',
      diesel: 'Beim Diesel zusätzlich Partikelfilter und das Rohr der Abgasrückführung auf feuchten Ruß, Risse und provisorische Reparaturen ansehen.'
    },
    good: 'Gleichmäßig gealterter, trockener Unterbodenschutz und vollständige Verkleidung.',
    bad: 'Frischer, dick aufgetragener schwarzer Unterbodenschutz auf kleiner Fläche deckt etwas zu. Fehlende Verkleidung kostet 80 bis 250 EUR. Eine aufgerissene Motorschutzplatte mit Riefen am Träger bedeutet einen Aufsetzer. Frischer Unterbodenschutz über sichtbaren Schweißnähten ist ein Abbruchgrund.',
    severity: 'teuer',
    cost: '80-250 EUR',
    tool: 'Starke Taschenlampe und Unterlage'
  },
  {
    id: 'nahtabdichtung',
    phase: 'karosserie',
    title: 'Türdichtungen und Nahtabdichtung',
    what: 'Alle vier Türen, die Heckklappe und die Motorhaube öffnen, die Gummidichtung an einer Ecke abziehen und dahinter schauen. Die werkseitige Nahtabdichtung ansehen und mit den anderen Seiten vergleichen.',
    good: 'Eine gleichmäßig aufgetragene, glatte Raupe, überall identisch, und Gummis ohne Farbschleier.',
    bad: 'Nachträglich mit dem Finger verstrichene Dichtmasse, Überlackierung auf der Dichtung, Lacknebel in den Radhäusern oder auf Schrauben. Nachgezogene Nahtabdichtung an Säule oder Schweller ist ein Abbruchgrund.',
    severity: 'ko'
  },
  {
    id: 'oelstand_zustand',
    phase: 'motorraum',
    title: 'Ölstand und Ölzustand',
    what: 'Den Peilstab ziehen, mit einem Papiertuch abwischen, erneut stecken und ablesen. Etwas Öl zwischen Daumen und Zeigefinger reiben und auf das Tuch tropfen lassen. Bei Fahrzeugen ohne Peilstab den Ölstand über das Bordmenü anzeigen lassen. Das Auto muss dafür waagerecht stehen und der Motor kalt sein.',
    good: {
      base: 'Stand zwischen Minimum und Maximum, keine Metallpartikel im Öl und kein süßlicher Geruch.',
      petrol: 'Die Farbe reicht von honigbraun bis dunkelbraun, das Öl fühlt sich glatt an.',
      diesel: 'Die Farbe ist schon kurz nach dem Ölwechsel tiefschwarz, das ist beim Diesel normal, solange das Öl flüssig bleibt und nicht nach Kraftstoff riecht.'
    },
    bad: {
      base: 'Metallglitzer im Öl bedeutet Lagerschaden und ist ein Abbruchgrund. Zäh-schwarzes, teerartiges Öl bedeutet massiv überzogene Wechselintervalle.',
      petrol: 'Ein Stand auf Minimum deutet beim Direkteinspritzer auf Ölverbrauch über Kolbenringe und Ventilschaftdichtungen hin, die Instandsetzung kostet 1.500 bis 3.500 EUR.',
      diesel: 'Ein Stand über Maximum ist beim Diesel ein eigener Befund und wird im nächsten Prüfpunkt behandelt.',
      turbo: 'Ein niedriger Stand ist bei Aufladung besonders ernst, der Lader hängt am Öldruck und stirbt als erstes.'
    },
    severity: 'ko',
    cost: '1.500-3.500 EUR'
  },
  {
    id: 'oelstand_ueber_max',
    phase: 'motorraum',
    title: 'Ölstand über Maximum beim Diesel',
    what: 'Beim Diesel gezielt prüfen, ob der Ölstand über der Maximum-Markierung steht, und am Peilstab riechen, ob es nach Kraftstoff riecht.',
    good: 'Der Stand liegt im Bereich und es riecht nur nach Motoröl.',
    bad: 'Stand über Maximum zusammen mit Kraftstoffgeruch bedeutet Ölverdünnung durch abgebrochene Regenerationen des Partikelfilters bei Kurzstreckenbetrieb. Der Filter ist dann meist ebenfalls am Ende, 800 bis 2.500 EUR, im Extremfall folgt ein Lagerschaden.',
    severity: 'ko',
    cost: '800-2.500 EUR',
    appliesTo: { fuel: 'diesel' }
  },
  {
    id: 'oeleinfuelldeckel',
    phase: 'motorraum',
    title: 'Öleinfülldeckel und Entlüftung',
    what: 'Den Öleinfülldeckel abschrauben, die Unterseite und den sichtbaren Bereich im Ventildeckel ansehen und daran riechen.',
    good: {
      base: 'Ein dunkler, sauberer Ölfilm ohne Klumpen.',
      petrol: 'Etwas hellbrauner Belag nur am äußersten Deckelrand ist bei reinem Winter-Kurzstreckenbetrieb noch tolerierbar.',
      diesel: 'Ein tiefschwarzer, glatter Ölfilm ist normal, Ruß im Öl gehört beim Diesel dazu.'
    },
    bad: {
      base: 'Großflächige cremig-hellbeige Emulsion bedeutet Wasser im Öl durch Zylinderkopfdichtung oder Ölkühler, 1.500 bis 3.000 EUR. Das ist ein Abbruchgrund.',
      diesel: 'Zäher, hellbrauner Schlamm im Ventildeckel deutet beim Kurzstreckendiesel zusätzlich auf Kondenswasser und verdünntes Öl hin.'
    },
    severity: 'ko',
    cost: '1.500-3.000 EUR'
  },
  {
    id: 'kuehlmittel_kalt',
    phase: 'motorraum',
    title: 'Kühlmittel im kalten Zustand',
    what: 'Am kalten Motor den Ausgleichsbehälter ablesen, den Deckel öffnen, mit der Taschenlampe hineinleuchten, die Innenseite des Deckels mit dem Finger abstreifen und die Behälterwand von innen ansehen.',
    good: 'Stand zwischen Minimum und Maximum, das Kühlmittel klar und geruchlos, rosa bis violett oder je nach Historie grün-blau.',
    bad: 'Ölfilm oder brauner Schleim auf der Flüssigkeit oder am Deckel bedeutet Zylinderkopfdichtung oder Ölkühler und ist ein Abbruchgrund. Bräunlich-rostige Brühe bedeutet falsches Mittel oder nachgekipptes Wasser.',
    severity: 'ko'
  },
  {
    id: 'kuehlmittelkrusten',
    phase: 'motorraum',
    title: 'Kühlmittelkrusten suchen',
    what: 'Mit der Taschenlampe Thermostatgehäuse, Wasserpumpe, Schlauchschellen und das Rohr am Zylinderkopf absuchen. Bei Motoren mit Kunststoff-Thermostatgehäuse und geschalteter Wasserpumpe liegt die feuchte Stelle meist rechts vorn am Motor im Bereich der Riemenscheiben.',
    good: 'Trockene, gleichmäßig verstaubte Gehäuse ohne Ablagerungen.',
    bad: 'Weiß-rosa oder kalkig-weiße Krusten sind eingetrocknetes Kühlmittel und damit ein Leck, typisch zwischen 50.000 und 120.000 km. Pumpe und Thermostatgehäuse als Einheit kosten 400 bis 800 EUR frei und 1.000 bis 1.200 EUR beim Markenhändler. Ein Ausgleichsbehälter unter Minimum oder nur mit Wasser aufgefüllt ist ein Alarmsignal.',
    severity: 'teuer',
    cost: '400-1.200 EUR',
    tool: 'Starke Taschenlampe'
  },
  {
    id: 'bremsfluessigkeit_servo',
    phase: 'motorraum',
    title: 'Bremsflüssigkeit und Servoöl',
    what: 'Stand und Farbe der Bremsflüssigkeit ablesen und das Wechseldatum im Serviceheft suchen, fällig ist alle zwei Jahre. Einen Servoölbehälter gibt es nur bei hydraulischer Lenkung, bei elektromechanischer Lenkung fehlt er.',
    good: 'Bremsflüssigkeit hellgelb bis bernsteinfarben, Stand knapp unter Maximum, Servoöl rotbraun und sauber.',
    bad: 'Dunkelbraun bis schwarz bedeutet überaltert, der Wechsel kostet 60 bis 100 EUR. Ein Stand nahe Minimum bedeutet Beläge fast runter oder ein Leck. Schwarzes oder schaumiges Servoöl mit feuchten Schläuchen deutet auf das Lenkgetriebe, 700 bis 1.600 EUR.',
    severity: 'hinweis',
    cost: '60-1.600 EUR'
  },
  {
    id: 'leckagen_motorraum',
    phase: 'motorraum',
    title: 'Leckagen von oben suchen',
    what: {
      base: 'Mit der Taschenlampe systematisch absuchen: Ventildeckeldichtung rundum, Kurbelwellensimmerring vorn hinter dem Riemen, Ölfiltergehäuse, Ölwannenkante und Getriebeglocke von unten.',
      turbo: 'Bei Aufladung zusätzlich Ölzulauf und Ölrücklauf des Turboladers sowie das Ladergehäuse selbst abtasten, dort beginnt jeder Laderschaden.',
      sauger: 'Beim Saugmotor zusätzlich die Gehäuse der Nockenwellenversteller und den Kettenkastendeckel ansehen, dort sitzen die typischen Undichtigkeiten.',
      diesel: 'Beim Diesel zusätzlich Hochdruckpumpe, die Rücklaufleitungen der Injektoren und die Vakuumpumpe auf Nässe prüfen.',
      petrol: 'Beim Ottomotor zusätzlich in die Zündkerzenschächte leuchten, Öl darin bedeutet undichte Kerzenschachtdichtungen.'
    },
    good: 'Trockene bis leicht ölfeuchte Flächen ohne Tropfenbildung und gleichmäßig gealterter Staub.',
    bad: {
      base: 'Nasse, glänzende Stellen mit anhaftendem Staub oder Tropfen am Boden. Ventildeckeldichtung 250 bis 500 EUR, hinterer Kurbelwellensimmerring mit Getriebeausbau 700 bis 1.400 EUR. Aktiv tropfendes Öl an der Getriebeglocke ist ein Abbruchgrund.',
      turbo: 'Ein ölnasser Ölrücklauf am Lader ist der Vorbote für dessen Wellendichtung, Ersatz 1.200 bis 2.500 EUR.'
    },
    severity: 'teuer',
    cost: '250-1.400 EUR',
    tool: 'Starke Taschenlampe'
  },
  {
    id: 'injektorenschaechte',
    phase: 'motorraum',
    title: 'Injektorenschächte prüfen',
    what: 'Beim Diesel die Motorabdeckung abnehmen und mit der Taschenlampe in die Schächte der Einspritzdüsen leuchten. Auf einen schwarzen Ring um einen Injektor achten.',
    good: 'Alle Schächte sind sauber und trocken.',
    bad: 'Ein schwarzer Rußring um einen Injektor bedeutet eine undichte Kupferdichtung, 300 bis 700 EUR. Festsitzende Injektoren treiben den Preis deutlich höher.',
    severity: 'teuer',
    cost: '300-700 EUR',
    appliesTo: { fuel: 'diesel' },
    tool: 'Starke Taschenlampe'
  },
  {
    id: 'motorwaesche',
    phase: 'motorraum',
    title: 'Motorwäsche als Verdachtsmoment',
    what: {
      base: 'Auf Kontraste achten: blitzsauberer Motorblock, aber verstaubter Wasserkasten und schmutzige Radhäuser. Nach Wassertropfen in Steckern, aufgequollenen Kabelbindern und auffällig sauberen Stellen genau dort suchen, wo Öl austritt.',
      petrol: 'Beim Ottomotor besonders in die Zündspulenschächte leuchten, dort steht Wasser nach einer Wäsche am längsten und führt später zu Zündaussetzern.',
      diesel: 'Beim Diesel besonders die Stecker der Glühkerzen und der Injektoren ansehen, dort steht Wasser nach einer Wäsche am längsten.'
    },
    good: 'Ein gleichmäßig gealterter, überall gleich verstaubter Motorraum.',
    bad: 'Ein frisch gewaschener Motorraum in einem zwölf Jahre alten Auto verdeckt genau die Leckagespuren, die du suchst. Dann muss nach der Probefahrt zwingend noch einmal von unten kontrolliert werden.',
    severity: 'hinweis'
  },
  {
    id: 'riemen_schlaeuche',
    phase: 'motorraum',
    title: 'Riemen und Kühlerschläuche',
    what: 'Den Keilrippenriemen auf Querrisse in den Rippen, ausgefranste Kanten und Glanz ansehen. Die Kühlerschläuche im kalten Zustand mit der Hand drücken.',
    good: 'Riemen ohne Querrisse, Schläuche elastisch, Schellen fest und original.',
    bad: 'Ein Riemen mit Rissen kostet mit Spanner 120 bis 250 EUR, aufgequollene und harte Schläuche 150 bis 400 EUR.',
    severity: 'hinweis',
    cost: '120-400 EUR'
  },
  {
    id: 'ladeluftschlaeuche',
    phase: 'motorraum',
    title: 'Ladeluftschläuche auf Öl',
    what: {
      base: 'Die Verbindungen der Ladeluftschläuche am Lader und am Ladeluftkühler abtasten und ansehen. Wenn möglich eine Schelle lösen und in den Schlauch schauen. Dabei auf gerissene Gummimuffen und lose Schellen achten, sie kosten Ladedruck.',
      diesel: 'Beim Diesel mischt sich austretendes Öl mit dem Ruß aus der Abgasrückführung zu einem zähen schwarzen Schlamm, der Ladeluftstrecke und Saugrohrklappen zusetzt.',
      petrol: 'Beim Ottomotor mit Direkteinspritzung landet dasselbe Öl an den Einlassventilen und verkokt dort, weil kein Kraftstoff die Ventile spült.'
    },
    good: 'Trockene, staubige Verbindungen ohne Ölfilm.',
    bad: 'Ölnasse Ladeluftschläuche deuten auf die Wellendichtung des Turboladers hin, Ersatz 1.200 bis 2.500 EUR. Zusätzlich verklebt das Öl den Ladeluftkühler von innen.',
    severity: 'teuer',
    cost: '1.200-2.500 EUR',
    appliesTo: { aspiration: 'turbo' }
  },
  {
    id: 'batterie',
    phase: 'motorraum',
    title: 'Batterie und Pole',
    what: {
      base: 'Das Herstellungsdatum auf Aufkleber oder Prägung suchen und den Batterietyp bestimmen, bei Start-Stopp muss es eine AGM-Batterie sein. Die Pole auf grün-weiße Sulfatkrusten und den Halter auf Korrosion prüfen.',
      diesel: 'Der Diesel braucht deutlich mehr Startstrom und zieht zusätzlich über die Glühkerzen, eine müde Batterie fällt hier zuerst auf.'
    },
    good: 'Batterie jünger als fünf Jahre, saubere Pole, Start-Stopp arbeitet nach kurzer Fahrt.',
    bad: 'Eine sieben Jahre alte oder billige Baumarktbatterie ohne Anlernen im Steuergerät, dann bleibt Start-Stopp inaktiv und die neue Batterie altert vorzeitig. AGM-Batterie mit Einbau und Codierung 200 bis 350 EUR.',
    severity: 'hinweis',
    cost: '200-350 EUR'
  },
  {
    id: 'marderschaden',
    phase: 'motorraum',
    title: 'Marderspuren suchen',
    what: {
      base: 'Die Motorabdeckung abnehmen und mit der Taschenlampe die Dämmmatte der Motorhaube, die Kabelbäume, die Faltenbälge der Achsmanschetten sowie Kühlwasser- und Unterdruckschläuche absuchen.',
      turbo: 'Bei Aufladung gehören die Ladeluftschläuche dazu, ein Biss darin kostet sofort Ladedruck und setzt eine Fehlermeldung.',
      diesel: 'Beim Diesel sind zusätzlich die Unterdruckschläuche und die Leitungen der Abgasrückführung beliebte Ziele.',
      petrol: 'Beim Ottomotor sind zusätzlich Zündkabel und die Stecker der Zündspulen beliebte Ziele.'
    },
    good: 'Keine Bissspuren, Dämmmatte intakt, keine Nussschalen oder Kot auf dem Motor.',
    bad: 'Angebissene Kabelisolierung kostet 200 bis 1.500 EUR Kabelbaumreparatur, eine angebissene Achsmanschette 150 bis 350 EUR pro Seite plus Folgeschaden am Gelenk.',
    severity: 'teuer',
    cost: '200-1.500 EUR',
    tool: 'Starke Taschenlampe'
  },
  {
    id: 'wasserkasten',
    phase: 'motorraum',
    title: 'Wasserkasten und Abläufe',
    what: 'Den Bereich unter der Windschutzscheibe im Scheibenwischerbereich ansehen, die Abdeckung prüfen und wenn zugänglich das Ablaufsieb kontrollieren. Auf Laub, Modder und stehendes Wasser achten. Moos in den Abläufen bedeutet lange Standzeit unter Bäumen.',
    good: 'Sauber, trocken, Sieb frei.',
    bad: 'Zugesetzte Abläufe lassen Wasser über die A-Säule in den Innenraum laufen, dann korrodieren die Steuergeräte im Fußraum. Die Reinigung kostet 80 bis 150 EUR, ein nasses Bordnetz- oder Komfortsteuergerät 600 bis 1.200 EUR plus Fehlersuche. Macht die Fußraumprüfung zur Pflicht.',
    severity: 'teuer',
    cost: '80-1.200 EUR',
    tool: 'Starke Taschenlampe'
  },
  {
    id: 'zuendung_selbsttest',
    phase: 'kaltstart',
    title: 'Kontrollleuchten-Selbsttest',
    what: {
      base: 'Die Zündung einschalten, den Motor ausdrücklich nicht starten. Beobachten, welche Leuchten kurz aufleuchten: Airbag, ABS, ESP, Motorkontrolle, Öldruck, Ladekontrolle, Bremse und Reifendruck.',
      diesel: 'Beim Diesel muss zusätzlich die Vorglühwendel erscheinen, je nach Fahrzeug auch die Anzeige für Partikelfilter und AdBlue.',
      petrol: 'Beim Ottomotor gibt es keine Vorglühanzeige, dafür muss die Motorkontrollleuchte sauber kommen und wieder verlöschen.'
    },
    good: 'Alle Leuchten kommen beim Einschalten der Zündung kurz und gehen nach dem Start bis auf die Handbremskontrolle wieder aus. Bleibt die Öldruckleuchte nach dem Start an, sofort abstellen.',
    bad: {
      base: 'Eine Lampe leuchtet gar nicht auf, dann wurde die Birne gezogen oder das Signal per Software abgeschaltet. Das ist der klassischste Gebrauchtwagenbetrug überhaupt und bei Airbag oder Motorkontrolle ein sofortiger Abbruchgrund.',
      diesel: 'Fehlt die Vorglühanzeige vollständig, ist entweder die Lampe gezogen oder das Glühsteuergerät stillgelegt.'
    },
    severity: 'ko'
  },
  {
    id: 'obd_fehlerspeicher_vorher',
    phase: 'kaltstart',
    title: 'Fehlerspeicher vor dem Start',
    what: 'Den OBD-Adapter stecken, Zündung an, Motor aus, und alle Steuergeräte scannen. Zu jedem Code den Freeze-Frame abfotografieren, denn dort steht, bei welcher Temperatur, Last und Drehzahl der Fehler auftrat. Den Speicher weder selbst löschen noch löschen lassen.',
    good: 'Keine gespeicherten Codes, höchstens ein harmloser sporadischer Eintrag wie Unterspannung. Auch Airbag, ABS, Getriebe und Klima sind leer.',
    bad: {
      base: 'Airbag-Codes bedeuten Unfallverdacht, Getriebecodes P17Dx die Mechatronik. Wer beim Termin löschen will, vernichtet Beweise.',
      petrol: 'Achte auf Zündaussetzer P0300 bis P0304, Gemischfehler P0171 oder P0174, Klopfsensor P0325 und Katalysatorwirkungsgrad P0420.',
      diesel: 'Achte auf Glühkerzen P0670 bis P0674, Partikelfilter P2002 oder P244A, NOx P229F, Abgasrückführung P0401 oder P0402 und Raildruck P0087.',
      turbo: 'Achte zusätzlich auf Ladedruckfehler P0234 oder P0299 und auf Codes des Ladedruckstellers, sie kommen selten allein.',
      sauger: 'Ohne Aufladung entfallen die Ladedruckcodes, dafür sind Nockenwellenverstellung P0011 oder P0014 und Drosselklappe P2135 die typischen Einträge.'
    },
    severity: 'hinweis',
    tool: 'OBD2-Adapter mit App'
  },
  {
    id: 'obd_readiness',
    phase: 'kaltstart',
    title: 'Readiness und Löschnachweis',
    what: 'In der App die Bereitschaftstests aufrufen und zählen, wie viele unterstützte Monitore noch nicht bereit sind. Zusätzlich die Werte Strecke seit Löschen der Fehlercodes, Zeit seit Löschen und Warmläufe seit Löschen ablesen und fotografieren.',
    good: {
      base: 'Kein oder höchstens ein Monitor nicht bereit. Strecke seit Löschung hoch bis am Anschlag, mehr als 40 Warmläufe.',
      petrol: 'Nicht bereit ist erfahrungsgemäß am ehesten die Tankentlüftung, das allein ist unkritisch.',
      diesel: 'Der Diesel hat weniger Monitore, dafür gehören Partikelfilter, NOx-Nachbehandlung und Abgasrückführung dazu, eine Tankentlüftung gibt es nicht.'
    },
    bad: 'Zwei oder mehr Monitore nicht bereit bedeuten, dass der Fehlerspeicher kürzlich gelöscht wurde. Eine Strecke unter 100 km, eine Zeit unter 2.000 Minuten oder weniger als fünf Warmläufe bedeuten gelöscht, vermutlich heute morgen. Dann so behandeln, als stünde die Motorkontrollleuchte an.',
    severity: 'hinweis',
    tool: 'OBD2-Adapter mit App'
  },
  {
    id: 'kaltstart_vorbereitung',
    phase: 'kaltstart',
    title: 'Kaltstart vorbereiten',
    what: {
      base: 'Die Fenster aller Türen herunterlassen, die Motorhaube geöffnet lassen, die Begleitperson ans Endrohr stellen, Radio und Gebläse aus. Ein Handy-Video vom Start aufnehmen, damit man es später in Ruhe anhören kann. Erst dann starten lassen.',
      diesel: 'Beim Diesel die Zündung einschalten, das Erlöschen der Vorglühwendel abwarten und erst dann starten lassen, damit Vorglühzeit und Startdauer getrennt beurteilbar sind.',
      petrol: 'Beim Ottomotor direkt durchstarten lassen, langes Stehenlassen auf Zündung verwischt das Bild nur.'
    },
    good: 'Ruhige Umgebung, laufende Aufzeichnung, jemand steht hinten am Endrohr.',
    bad: 'Wer während des Starts das Radio laufen lässt oder die Haube zu hat, verliert die einmalige Gelegenheit. Diesen Test gibt es pro Termin genau einmal.',
    severity: 'hinweis'
  },
  {
    id: 'kaltstart_kettenrasseln',
    phase: 'kaltstart',
    title: 'Erste drei Sekunden abhören',
    what: {
      base: 'Seitlich am getriebeseitigen Ende des Motors stehen und die ersten Sekunden nach dem Anspringen genau abhören.',
      petrol: 'Beim Ottomotor auf ein kurzes metallisches Rasseln achten, es klingt wie eine kurz geschüttelte Fahrradkette und kommt vom nachgebenden Kettenspanner.',
      diesel: 'Beim Diesel gehört ein hartes Nageln der ersten Sekunden dazu. Davon zu trennen ist ein metallisches Rasseln aus dem Steuertrieb, denn auch viele Dieselmotoren haben eine Steuerkette.'
    },
    good: {
      base: 'Der Motor springt in ein bis zwei Umdrehungen an und läuft sofort gleichmäßig.',
      petrol: 'Kein metallisches Geräusch, nur das gleichmäßige Laufgeräusch.',
      diesel: 'Das Nageln ist von Anfang an gleichmäßig und wird binnen 20 bis 30 Sekunden weicher, ohne metallisches Rasseln darunter.'
    },
    bad: {
      base: 'Metallisches Rasseln für ein bis drei Sekunden nach dem Kaltstart bedeutet Kettenspanner und gelängte Steuerkette. Kompletter Steuertrieb 1.200 bis 2.500 EUR frei und 2.500 bis 3.500 EUR beim Markenhändler, ein Kettensprung mit Ventilkontakt 4.000 bis 8.000 EUR. Ohne belegte Instandsetzung ist das ein Abbruchgrund.',
      petrol: 'Beim aufgeladenen Direkteinspritzer tritt das typisch ab 80.000 bis 150.000 km auf und ist die häufigste vierstellige Motorreparatur dieser Bauart.',
      diesel: 'Sitzt die Kette am Getriebeflansch, muss der Motor heraus, allein die Arbeit treibt die Rechnung auf 1.500 bis 3.000 EUR.'
    },
    severity: 'ko',
    cost: '1.200-3.500 EUR'
  },
  {
    id: 'kaltstart_rauch',
    phase: 'kaltstart',
    title: 'Auspuffrauch in den ersten 30 Sekunden',
    what: {
      base: 'Die Begleitperson beobachtet das Endrohr, danach kurz auf etwa 2.500 Umdrehungen Gas geben und wieder loslassen. Farbe und Geruch des Rauchs beurteilen.',
      diesel: 'Beim Diesel ist die entscheidende Frage, ob der Rauch schwarz, blau oder weiß ist und ob er nach dem Warmwerden verschwindet.',
      petrol: 'Beim Ottomotor ist die entscheidende Frage, ob beim Gaswegnehmen und beim erneuten Gasgeben ein blauer Schleier kommt.'
    },
    good: {
      base: 'Weißer Wasserdampf, der sich sofort auflöst und geruchlos ist, nach ein bis zwei Minuten kommt nichts mehr.',
      diesel: 'Eine kurze dunkle Wolke beim ersten kräftigen Gasstoß aus dem kalten Motor ist unkritisch, solange sie sofort wieder verschwindet.',
      petrol: 'Das Endrohr bleibt beim Gasstoß sichtbar frei, es kommt kein blauer Schleier.'
    },
    bad: {
      base: 'Dauerhaft dicker weißer Rauch mit süßlichem Geruch bedeutet Kühlwasser im Brennraum und ist ein Abbruchgrund.',
      petrol: 'Blaugrauer Rauch mit Ölgeruch, besonders beim Gaswegnehmen, bedeutet Ventilschaftdichtungen oder Kolbenringe, 1.500 bis 3.500 EUR, und ist ein Abbruchgrund.',
      diesel: 'Anhaltend schwarzer Rauch unter Last bedeutet zu fettes Gemisch durch Injektoren, Luftmassenmesser oder zugesetzte Ladeluftstrecke. Blauer Rauch beim Gaswegnehmen deutet beim Diesel zuerst auf die Wellendichtung des Turboladers hin.',
      turbo: 'Blauer Rauch direkt nach einer Schubphase kommt bei aufgeladenen Motoren fast immer aus dem Lader, Ersatz 1.200 bis 2.500 EUR.'
    },
    severity: 'ko',
    cost: '1.200-3.500 EUR'
  },
  {
    id: 'kaltstart_startverhalten',
    phase: 'kaltstart',
    title: 'Startverhalten und Rundlauf',
    what: {
      base: 'Mitzählen, wie lange der Anlasser dreht, und auf den Rundlauf im Leerlauf achten.',
      diesel: 'Darauf hören, ob das Nageln nach etwa 20 bis 30 Sekunden weicher wird, und darauf achten, ob der Motor vor dem Start sichtbar vorglüht.',
      petrol: 'Darauf achten, ob der Motor sofort sauber durchzündet oder in den ersten Sekunden stolpert und der Leerlauf schwankt.'
    },
    good: {
      base: 'Ruhiger Leerlauf ohne Schwanken der Drehzahl.',
      petrol: 'Der Ottomotor zündet nach 0,5 bis 1,5 Sekunden.',
      diesel: 'Der Diesel springt nach dem Vorglühen in 1,0 bis 2,0 Sekunden an, das Nageln wird binnen einer halben Minute deutlich weicher.'
    },
    bad: {
      base: 'Ein schwankender Leerlauf im kalten Zustand ist immer ein Befund und gehört im OBD-Log nachgeprüft.',
      petrol: 'Über 2,5 Sekunden Orgeln sind auffällig. Unrunder Lauf deutet auf Zündspulen oder verschlissene Zündkerzen, ein Satz Spulen kostet 200 bis 400 EUR.',
      diesel: 'Über 3 Sekunden Orgeln sind auffällig. Langes Orgeln deutet auf Glühkerzen für 200 bis 450 EUR oder auf zu langsamen Raildruckaufbau und zu hohe Injektor-Rücklaufmengen.'
    },
    severity: 'teuer',
    cost: '200-450 EUR'
  },
  {
    id: 'zms_rasseln',
    phase: 'kaltstart',
    title: 'Rasseln im Leerlauf prüfen',
    what: {
      base: 'Bei laufendem Motor im Leerlauf auf ein Rasseln aus dem Getriebebereich hören, einmal mit getretener und einmal mit losgelassener Kupplung.',
      diesel: 'Beim Diesel ist das Zweimassenschwungrad das übliche Verschleißteil, weil die Drehungleichförmigkeit hoch ist, Auffälligkeiten häufen sich ab etwa 150.000 km.',
      petrol: 'Beim Ottomotor hält das Zweimassenschwungrad meist länger, aufgeladene Vierzylinder mit viel Drehmoment aus dem Drehzahlkeller sind aber ebenfalls betroffen.'
    },
    good: 'Kein Unterschied im Geräusch zwischen getretener und losgelassener Kupplung.',
    bad: 'Rasseln, das beim Treten der Kupplung verschwindet, deutet auf das Zweimassenschwungrad hin. Ersatz zusammen mit der Kupplung 900 bis 1.800 EUR.',
    severity: 'teuer',
    cost: '900-1.800 EUR',
    appliesTo: { gearbox: ['manuell'] }
  },
  {
    id: 'leuchten_nach_start',
    phase: 'kaltstart',
    title: 'Kontrollleuchten nach dem Start',
    what: {
      base: 'Nach dem Start prüfen, welche Lampen erlöschen: Öldruck, Ladekontrolle, ABS, ESP, Airbag und Motorkontrolle.',
      diesel: 'Die Vorglühanzeige muss nach dem Start ausgehen, ein Blinken der Vorglühlampe im Betrieb ist eine Fehlermeldung des Motorsteuergeräts.',
      petrol: 'Eine Vorglühanzeige gibt es nicht, dafür ist ein Blinken der Motorkontrollleuchte hier besonders ernst.'
    },
    good: 'Alle genannten Lampen sind aus, höchstens die Reifendruckwarnung steht noch nach einem Reifenwechsel.',
    bad: 'Die Motorkontrolle bleibt an oder blinkt. Blinken bedeutet Verbrennungsaussetzer mit Gefahr für den Katalysator, dann sofort Motor aus. Ein Abbruchgrund.',
    severity: 'ko'
  },
  {
    id: 'verbraucher_durchschalten',
    phase: 'innenraum',
    title: 'Alle Verbraucher durchschalten',
    what: 'In einem Durchgang testen: Abblend-, Fern-, Stand- und Nebellicht, Blinker beidseitig, Warnblinker, Bremslicht inklusive dritter Leuchte, Rückfahrlicht, Kennzeichenbeleuchtung, alle Innenleuchten, jeden Fensterheber einzeln und über die Sammelbedienung, Schiebedach ganz auf und zu, Spiegelverstellung und Spiegelheizung, elektrische Sitzverstellung mit Memory, Sitz- und Lenkradheizung, Heckscheibenheizung, Gebläse in allen Stufen, beide Wischerstufen mit Intervall und Heckwischer sowie alle Waschdüsen.',
    good: 'Alles funktioniert beim ersten Versuch, das Gebläse läuft in allen Stufen ohne Rattern, die Sitzheizung ist nach zwei Minuten spürbar warm.',
    bad: 'Ein toter Fensterheber kostet 200 bis 450 EUR, eine defekte Sitzheizung 350 bis 700 EUR, ein Gebläse nur auf höchster Stufe 100 bis 250 EUR, ein klemmendes Schiebedach 600 bis 1.500 EUR. Drei tote Verbraucher heißen vernachlässigt.',
    severity: 'teuer',
    cost: '200-1.500 EUR'
  },
  {
    id: 'klimaanlage',
    phase: 'innenraum',
    title: 'Klimaanlage mit Thermometer',
    what: {
      base: 'Bei laufendem Motor die Klimaanlage auf die niedrigste Temperatur stellen, Umluft an, Gebläse Stufe 3, mittlere Düsen. Fünf Minuten laufen lassen und dann ein Thermometer in die mittlere Düse halten. Danach auf Maximaltemperatur stellen.',
      diesel: 'Beim Diesel besonders darauf achten, ob die Heizung im Stand wirklich heiß wird, moderne Diesel geben wenig Abwärme ab und haben dafür einen elektrischen Zuheizer.'
    },
    good: '4 bis 8 Grad Ausblastemperatur bei etwa 20 Grad Außentemperatur, hörbares Zuschalten des Kompressors, getrennte Temperaturen links und rechts funktionieren, die Heizung wird binnen ein bis zwei Minuten spürbar heiß.',
    bad: {
      base: 'Nur 15 bis 20 Grad bedeuten einen schwachen Kompressor oder Kältemittelmangel. Klimaservice 100 bis 180 EUR, Kondensator 400 bis 700 EUR, Kompressor 900 bis 1.800 EUR. Muffiger Geruch deutet auf Verdampfer oder Filter, Rattern beim Zuschalten auf das Kompressorlager.',
      diesel: 'Bleibt die Heizung im Stand nur lauwarm, ist meist der elektrische Zuheizer defekt, 250 bis 600 EUR, und das fällt erst im Winter auf.'
    },
    severity: 'teuer',
    cost: '900-1.800 EUR',
    tool: 'Digitalthermometer'
  },
  {
    id: 'infotainment_sensoren',
    phase: 'innenraum',
    title: 'Infotainment und Sensoren',
    what: 'Das Menü vollständig durchklicken: Radio mit allen Lautsprechern einzeln über Fader und Balance, Bluetooth koppeln, Navigation und Kartenstand, Rückfahrkamera, Parksensoren vorn und hinten durch langsames Annähern der Hand, Assistenzsysteme im Menü, Digitaltacho auf Pixelfehler.',
    good: 'Schnelles Booten, kein Neustart im Betrieb, alle Sensoren melden sich, klares Kamerabild.',
    bad: 'Ein ständig neustartendes System kostet 600 bis 2.000 EUR, ausgefallene Parksensoren 90 bis 200 EUR je Sensor, eine beschlagene Rückfahrkamera 200 bis 450 EUR.',
    severity: 'teuer',
    cost: '90-2.000 EUR'
  },
  {
    id: 'wassereintritt_fussraum',
    phase: 'innenraum',
    title: 'Fußraum auf Feuchtigkeit',
    what: 'Die Fußmatten herausnehmen und die flache Hand fest auf den Teppich drücken, vorn links, besonders vorn rechts und hinten. Unter die Sitze fassen, im Kofferraum Bodenmatte und Styropor herausnehmen und in die Mulde und die Seitenfächer greifen. Beim Einsteigen zuerst riechen.',
    good: 'Trockener Teppich, trockene Dämmung, kein Modergeruch, staubtrockene Mulde.',
    bad: 'Feuchter Teppich, ein Wasserrand in der Mulde, Rost an Sitzschienen oder Schraubpunkten, von innen beschlagene Scheiben. Ursachen sind verstopfte Wasserkastenabläufe, Schiebedachabläufe, eine undichte Frontscheibe, der Klimakondensatablauf oder Türfolien. Trocknen und Dichten 300 bis 900 EUR, Steuergerät mit Kabelbaum 800 bis 2.500 EUR. Feuchteschäden im Kabelbaum sind nie sauber zu reparieren, nasser Fußraum plus Elektrikfehler ist ein Abbruchgrund.',
    severity: 'ko',
    cost: '300-2.500 EUR'
  },
  {
    id: 'wipptest',
    phase: 'fahrwerk',
    title: 'Stoßdämpfer-Wipptest',
    what: 'An jeder Ecke kräftig auf Kotflügel oder Heck drücken, das Auto zwei- bis dreimal einfedern und dann abrupt loslassen. Zusätzlich mit der Taschenlampe die Kolbenstangen der Dämpfer auf Ölfilm prüfen.',
    good: 'Das Auto schwingt höchstens ein- bis zweimal aus und steht dann.',
    bad: 'Mehr als zwei Nachschwinger oder unterschiedliches Verhalten links und rechts. Stoßdämpfer paarweise 400 bis 900 EUR je Achse, geregelte Dämpfer 1.400 bis 2.500 EUR je Achse.',
    severity: 'teuer',
    cost: '400-2.500 EUR'
  },
  {
    id: 'federbruch',
    phase: 'fahrwerk',
    title: 'Federn auf Bruch prüfen',
    what: 'Mit der Taschenlampe an allen vier Rädern die unterste Federwindung ansehen, denn dort sitzt der Bruch fast immer und ist oft nur wenige Zentimeter lang. Das Fahrzeug von vorn und hinten auf gleiche Höhe links und rechts betrachten.',
    good: 'Federenden vollständig, gleichmäßige Fahrzeughöhe.',
    bad: 'Ein abgebrochenes Federende kann den Reifen aufschlitzen, das Fahrzeug hängt dann einseitig. Federn paarweise 250 bis 450 EUR. Beim A4 ist der Federbruch das häufigste TÜV-Thema, siebenjährige Fahrzeuge fallen bei der dritten Hauptuntersuchung vierfach überdurchschnittlich auf.',
    severity: 'teuer',
    cost: '250-450 EUR',
    tool: 'Starke Taschenlampe'
  },
  {
    id: 'lager_gelenke',
    phase: 'fahrwerk',
    title: 'Lager, Gelenke und Manschetten',
    what: 'Das Lenkrad voll einschlagen und das Radhaus ausleuchten, Achs- und Spurstangenmanschetten auf Risse und Fettschleuder prüfen. Am Rad oben und unten bei 12 und 6 Uhr rütteln für Radlager und Traggelenk, seitlich bei 9 und 3 Uhr für die Spurstange.',
    good: 'Kein spürbares Spiel, Manschetten geschlossen und außen fettfrei.',
    bad: 'Deutliches Spiel, Fettspritzer im Radhaus, eine gerissene Manschette. Querlenkersatz 350 bis 850 EUR je Achse inklusive Vermessung, Radlager 250 bis 450 EUR je Seite, Antriebswelle 400 bis 700 EUR. Mehrere gerissene Manschetten plus Spiel sind auch HU-relevant und ein Abbruchgrund.',
    severity: 'teuer',
    cost: '350-1.200 EUR'
  },
  {
    id: 'bremsscheiben_belaege',
    phase: 'fahrwerk',
    title: 'Bremsscheiben und Beläge',
    what: 'Durch die Felge schauen oder das Handy hineinhalten. Mit dem Fingernagel über den äußeren Scheibenrand ziehen, um den Verschleißgrat zu spüren. Das Mindestmaß steht auf der Scheibe eingeprägt. Die Belagstärke ohne Trägerblech abschätzen.',
    good: 'Glatte, gleichmäßig graue Reibfläche, Grat unter etwa 1 mm, Beläge über 5 mm.',
    bad: 'Ein Grat über 1,5 mm, tiefe Riefen, Haarrisse, blaue Anlauffarben durch Überhitzung, Belag unter 3 mm oder ungleiche Belagstärke innen und außen bei festem Sattel. Bremsen vorn komplett 350 bis 600 EUR, hinten 300 bis 550 EUR, ein Sattel 250 bis 450 EUR.',
    severity: 'teuer',
    cost: '700-1.100 EUR'
  },
  {
    id: 'reifen_messen',
    phase: 'fahrwerk',
    title: 'Reifen messen und datieren',
    what: 'Das Profil an drei Stellen je Reifen messen, an Außenschulter, Mitte und Innenschulter. Die vierstellige DOT-Nummer ablesen, 3421 bedeutet Kalenderwoche 34 des Jahres 2021. Marke, Typ und Größe aller vier Reifen vergleichen und die Flanken auf Beulen und Risse prüfen.',
    good: 'Über 4 mm Profil, alle vier Reifen gleiche Marke und gleicher Typ, jünger als sechs Jahre, gleichmäßiger Abrieb über die Breite.',
    bad: 'Eine abgefahrene Innenschulter bei voller Außenschulter bedeutet verstellte Spur oder verstellten Sturz, die Achsvermessung kostet 90 bis 150 EUR, die Ursache kann ein verzogener Lenker sein. Sägezahnbildung deutet auf Dämpfer oder Lager. Vier verschiedene Marken zeigen eine Sparfuchs-Historie. Reifensatz 500 bis 900 EUR.',
    severity: 'teuer',
    cost: '500-900 EUR',
    tool: 'Reifenprofilmesser'
  },
  {
    id: 'fahrwerk_umbauten',
    phase: 'fahrwerk',
    title: 'Nicht eingetragene Fahrwerksumbauten',
    what: 'Prüfen, ob Fahrwerk, Felgen oder Spurverbreiterungen vom Serienstand abweichen, und die Eintragungen im Fahrzeugschein unter Feld 22 dagegenhalten. Beim A4 Avant gibt es ab Werk kein Luftfahrwerk, auch der allroad fährt auf Stahlfedern, es gibt nur adaptive Dämpfer.',
    good: 'Serienzustand oder Umbau mit Teilegutachten und Eintragung.',
    bad: 'Ein Luftfahrwerk in einem Fahrzeug, das es ab Werk nie damit gab — beim A4 Avant etwa, auch beim allroad —, ist immer nachgerüstet und ohne Papiere ein Abbruchgrund. Dazu kommen Kompressor- und Balgverschleiß sowie Wertminderung.',
    severity: 'ko'
  },
  {
    id: 'lenkung_rangieren',
    phase: 'probefahrt',
    title: 'Lenkung und Rangieren',
    what: 'Auf dem Parkplatz das Lenkrad im Stand und beim langsamen Rollen zweimal von Anschlag zu Anschlag drehen, danach rückwärts einen Kreis fahren. Fenster offen, Radio aus.',
    good: 'Gleichmäßiger Kraftbedarf über den ganzen Lenkbereich, kein Knacken.',
    bad: 'Knacken bei Volleinschlag deutet auf Antriebs- oder Traggelenke, Schlagen im Lenkrad auf die Spurstange. Knarzen beim langsamen Lenken und eine kalt schwergängige Lenkung deuten auf das elektromechanische Lenkgetriebe, 1.200 bis 2.200 EUR, bei Servoausfall ein Abbruchgrund.',
    severity: 'teuer',
    cost: '1.200-2.200 EUR'
  },
  {
    id: 'getriebe_handschalter',
    phase: 'probefahrt',
    title: 'Handschalter durchprüfen',
    what: {
      base: 'Alle Gänge inklusive Rückwärtsgang durchschalten, im dritten Gang bei etwa 2.000 Umdrehungen voll Gas geben und am Berg anfahren. Zusätzlich im fünften oder sechsten Gang bei 60 km/h Vollgas geben.',
      diesel: 'Beim Diesel ist der Test aus niedriger Drehzahl der aussagekräftigste: das hohe Drehmoment aus dem Drehzahlkeller bringt eine müde Kupplung sofort zum Rutschen.',
      sauger: 'Beim Saugmotor greift der Rutschtest schwächer, weil das Drehmoment im Drehzahlkeller fehlt — hier zählt der Vollgastest im hohen Gang mehr als der aus niedriger Drehzahl.',
      turbo: 'Bei Aufladung den Test im vollen Ladedruck fahren, genau dort gibt eine verschlissene Kupplung nach.'
    },
    good: 'Sauber definierte Gassen, kein Kratzen im zweiten Gang, die Kupplung greift im unteren Drittel des Pedalwegs und die Drehzahl läuft unter Vollgas nicht davon.',
    bad: {
      base: 'Steigt die Drehzahl ohne Beschleunigung, rutscht die Kupplung, Ersatz mit Zweimassenschwungrad 900 bis 1.800 EUR. Kratzen im zweiten Gang bedeutet einen Synchronring, ein quietschendes oder hängendes Kupplungspedal einen Nehmerzylinder für 250 bis 500 EUR.',
      diesel: 'Ein Rasseln, das beim Treten der Kupplung verschwindet, ist beim Diesel fast immer das Zweimassenschwungrad und wird zusammen mit der Kupplung ersetzt.'
    },
    severity: 'teuer',
    cost: '900-1.800 EUR',
    appliesTo: { gearbox: ['manuell'] }
  },
  {
    id: 'getriebe_cvt',
    phase: 'probefahrt',
    title: 'Stufenloses CVT hart prüfen',
    what: 'Zehnmal aus dem Stand anfahren, mal sanft und mal beherzt, im Schritttempo wie im Stau rollen lassen, rückwärts an einer leichten Steigung anfahren, dann bei 60 bis 80 km/h konstant fahren und leicht Gas geben. Unbedingt kalt und nach 20 Minuten noch einmal warm fahren.',
    good: 'Sanftes, stufenloses Anfahren ohne Ruck, die Drehzahl folgt der Last gleichmäßig.',
    bad: 'Ruckeln beim Anfahren, Rupfen im Schritttempo, Vibration im Stand mit eingelegter Fahrstufe, Drehzahl steigt ohne Vortrieb, Aufheulen oder Notlauf nach 30 bis 40 Minuten Autobahn. Instandsetzung 2.500 bis 3.500 EUR, Austauschgetriebe bis 6.800 EUR. Sofortiger Abbruchgrund.',
    severity: 'ko',
    cost: '2.500-6.800 EUR',
    appliesTo: { gearbox: ['cvt'] }
  },
  {
    id: 'getriebe_dkg',
    phase: 'probefahrt',
    title: 'Doppelkupplungsgetriebe prüfen',
    what: 'Kalt losfahren und die ersten fünf Schaltvorgänge bewerten, aus dem Stand kriechen lassen, an einer Steigung ohne Gas nur von der Bremse gehen, Fahrstufe D nach R und zurück einlegen und die Zeit bis zum Kraftschluss zählen, danach bewusst mit 20 bis 40 km/h dahinrollen.',
    good: 'Schaltungen schnell und nur leicht spürbar, Kraftschluss nach dem Einlegen in unter einer Sekunde, gleichmäßiges Kriechen ohne Rupfen.',
    bad: 'Rupfen beim Anfahren und im Schleichbetrieb, Verzögerung vor dem Kraftaufbau, Drehzahl steigt ohne Geschwindigkeit, Notlauf. Auffälligkeiten typisch ab 120.000 bis 180.000 km. Kupplungspaket 2.600 bis 3.800 EUR, komplette Instandsetzung 3.700 bis 5.700 EUR. Ohne belegten Ölservice alle 60.000 km 1.500 bis 2.000 EUR Rücklage einplanen.',
    severity: 'ko',
    cost: '2.600-5.700 EUR',
    appliesTo: { gearbox: ['dkg'] }
  },
  {
    id: 'getriebe_wandler',
    phase: 'probefahrt',
    title: 'Wandlerautomatik prüfen',
    what: 'Manuell durch alle Gänge schalten, aus 60 km/h einen Kickdown auslösen und bei 50 bis 70 km/h in der Überbrückungsphase auf Ruckeln achten.',
    good: 'Weiche, aber definierte Gangwechsel, Kickdown-Reaktion unter einer Sekunde, kein Nachrutschen. Ein leichtes Anfahrzögern ist bei manchen Baureihen konstruktionsbedingt.',
    bad: 'Harte Schläge, Wandlerbrummen bei 1.200 bis 1.500 Umdrehungen unter Last, langes Hochdrehen zwischen den Gängen. Instandsetzung 2.000 bis 3.500 EUR. Schläge zusammen mit Notlauf sind ein Abbruchgrund. Der Ölwechsel gehört trotz Lifetime-Angabe alle 80.000 bis 100.000 km dazu.',
    severity: 'ko',
    cost: '2.000-3.500 EUR',
    appliesTo: { gearbox: ['wandler'] }
  },
  {
    id: 'leistungsentfaltung',
    phase: 'probefahrt',
    title: 'Leistungsentfaltung und Lader',
    what: {
      base: 'Auf der Landstraße zweimal im dritten oder vierten Gang von 1.500 Umdrehungen bis zur Nenndrehzahl voll durchziehen und danach das Gas wegnehmen. Vorher muss der Motor warm sein.',
      turbo: 'Bei Aufladung darauf achten, wann der Ladedruck einsetzt, ob der Schub bis oben anliegt und ob beim Lastwechsel etwas zischt oder pfeift.',
      sauger: 'Beim Saugmotor auf einen linearen Anstieg ohne Loch bei mittlerer Drehzahl achten, genau dort arbeitet die Nockenwellenverstellung und genau dort fällt ihr Ausfall auf.'
    },
    good: {
      base: 'Gleichmäßiger, druckvoller Schub ohne Loch, kein Ruckeln, kein Leistungseinbruch.',
      turbo: 'Der Ladedruck setzt sauber ein und der Schub bleibt bis zur Nenndrehzahl erhalten, ohne Pfeifen und ohne Zischen.',
      sauger: 'Die Leistung steigt linear mit der Drehzahl, der Übergang der Nockenwellenverstellung ist allenfalls als sanfte Stufe hörbar.'
    },
    bad: {
      base: 'Notlauf mit Begrenzung auf etwa 3.000 Umdrehungen ist ein sofortiger Abbruchgrund.',
      turbo: 'Pfeifen oder Sirren, das mit dem Ladedruck ansteigt, deutet auf den Turbolader, 1.200 bis 2.500 EUR. Zischen beim Lastwechsel bedeutet undichte Ladeluftschläuche für 150 bis 400 EUR. Ein Leistungsloch mit plötzlich einsetzendem Schub deutet auf ein verkoktes Wastegate oder eine klemmende Ladedruckregelung, 400 bis 900 EUR.',
      sauger: 'Ein Loch bei mittlerer Drehzahl deutet auf die Nockenwellenverstellung, 400 bis 900 EUR. Ruckelnde Gasannahme deutet auf eine verschmutzte Drosselklappe oder defekte Saugrohrklappen, 250 bis 600 EUR.',
      diesel: 'Ein Leistungseinbruch mit sichtbarer Rußwolke deutet auf Luftmassenmesser oder zugesetzte Abgasrückführung, 200 bis 600 EUR.'
    },
    severity: 'ko',
    cost: '400-2.500 EUR'
  },
  {
    id: 'konstantfahrt_vibration',
    phase: 'probefahrt',
    title: 'Konstantfahrt und Vibrationen',
    what: 'Auf der Autobahn 80, 100, 120 und 140 km/h je 30 Sekunden halten, die Hände locker am Lenkrad. Danach das Gas wegnehmen und ausrollen lassen.',
    good: 'Kein Lenkradflattern, keine Sitzvibration, kein Dröhnen, das mit der Geschwindigkeit steigt.',
    bad: 'Lenkradvibration bei 100 bis 120 km/h deutet auf Unwucht oder eine verzogene Bremsscheibe. Vibration in Sitz und Boden deutet auf das Kardanwellen-Mittellager bei Allradfahrzeugen, 300 bis 700 EUR, oder auf eine Antriebswelle. Dröhnen, das beim Lenken die Seite wechselt, ist ein Radlager, 250 bis 450 EUR.',
    severity: 'teuer',
    cost: '250-700 EUR'
  },
  {
    id: 'spurhalten_bremsen',
    phase: 'probefahrt',
    title: 'Spurhalten und Vollbremsung',
    what: 'Auf gerader, ebener Straße bei 60 km/h kurz die Hände vom Lenkrad nehmen. Danach aus 60 km/h sanft bremsen und anschließend auf freier Strecke mit Blick in den Rückspiegel aus 80 km/h eine Vollbremsung bis zum Eingriff des ABS.',
    good: 'Das Auto zieht nicht zur Seite, das Lenkrad steht bei Geradeausfahrt gerade, die Bremse packt gleichmäßig, das ABS regelt hör- und spürbar, das Pedal bleibt fest.',
    bad: 'Ziehen zur Seite deutet auf Spur oder festen Sattel, Rubbeln in Pedal und Lenkrad bei 80 bis 120 km/h auf verzogene Scheiben für 350 bis 600 EUR. Ein schwammiges oder absackendes Pedal, Ziehen unter Bremsung oder fehlende ABS-Regelung sind Abbruchgründe.',
    severity: 'teuer',
    cost: '350-600 EUR'
  },
  {
    id: 'schlechte_strasse',
    phase: 'probefahrt',
    title: 'Schlechte Straße abfahren',
    what: 'Fenster auf, Radio aus, mit 30 bis 50 km/h über Kopfsteinpflaster, Kanaldeckel und Bodenwellen fahren, auch einmal einseitig über eine Kante.',
    good: 'Satter, ruhiger Aufbau, pro Kante ein einzelner dumpfer Schlag.',
    bad: 'Poltern und Klackern vorn über Querfugen deuten auf Koppelstangen, Domlager oder die Gummibuchsen der unteren Querlenker, typisch ab 80.000 bis 120.000 km, 300 bis 1.200 EUR. Schlagen beim Einfedern bedeutet durchgeschlagene Dämpfer, Klackern beim Überfahren einer Kante mit Lenkeinschlag ein Trag- oder Antriebsgelenk.',
    severity: 'teuer',
    cost: '300-1.200 EUR'
  },
  {
    id: 'obd_mitloggen',
    phase: 'probefahrt',
    title: 'OBD während der Fahrt mitloggen',
    what: {
      base: 'Den Adapter die ganze Fahrt mitloggen lassen und dabei Kühlmitteltemperatur, Motorlast, Leerlaufdrehzahl und die GPS-Geschwindigkeit gegen den Tacho aufzeichnen.',
      petrol: 'Zusätzlich die kurz- und langfristigen Gemischkorrekturen und den Zündwinkel unter Volllast aufzeichnen, dort zeigt sich die Klopfregelung.',
      diesel: 'Zusätzlich Raildruck Soll und Ist, die Rate der Abgasrückführung, den Differenzdruck des Partikelfilters, die berechnete Rußbeladung und die Kilometer seit der letzten Regeneration aufzeichnen.',
      turbo: 'Zusätzlich Ladedruck Soll und Ist sowie die Ladelufttemperatur aufzeichnen.',
      sauger: 'Zusätzlich Saugrohrdruck sowie Soll- und Istwert der Nockenwellenverstellung aufzeichnen.'
    },
    good: {
      base: 'Kühlmitteltemperatur nach 10 bis 15 Minuten stabil bei 85 bis 98 Grad, OBD-Geschwindigkeit 2 bis 5 Prozent über GPS.',
      petrol: 'Gemischkorrekturen innerhalb von plus minus 8 Prozent, Zündwinkel unter Volllast bei plus 5 bis plus 15 Grad.',
      diesel: 'Der Raildruck folgt dem Sollwert ohne Abweichung, der Differenzdruck des Partikelfilters bleibt im Leerlauf niedrig und die Rußbeladung liegt deutlich unter der Regenerationsschwelle.',
      turbo: 'Der Ladedruck folgt dem Sollwert über den ganzen Drehzahlbereich, die Ladelufttemperatur fällt nach der Volllast schnell wieder ab.'
    },
    bad: {
      base: 'Bleibt die Temperatur bei 70 bis 82 Grad hängen, klemmt das Thermostat offen, 150 bis 350 EUR, Fehlercode P0128. Über 105 Grad bedeutet Kühlleistung am Limit und ist ein Abbruchgrund. Mehr als 8 Prozent Abweichung zwischen Tacho und GPS bedeuten eine falsche Reifengröße oder getauschte Räder.',
      petrol: 'Gemischkorrektur über plus 20 Prozent bedeutet Falschluft oder einen defekten Luftmassenmesser, ein stark zurückgenommener Zündwinkel bedeutet dauerhafte Klopfregelung.',
      diesel: 'Eine Rußbeladung über 80 Prozent oder eine Regeneration alle 150 bis 250 km bedeuten einen Partikelfilter nahe dem Ende, 1.200 bis 2.500 EUR. Ein Raildruck, der den Sollwert nicht hält, deutet auf Hochdruckpumpe oder Injektoren.',
      turbo: 'Erreicht der Ladedruck den Sollwert nicht oder überschwingt er deutlich, sind Ladedrucksteller, Wastegate oder undichte Ladeluftschläuche die Ursache, 400 bis 900 EUR.'
    },
    severity: 'hinweis',
    cost: '150-350 EUR',
    tool: 'OBD2-Adapter mit App'
  },
  {
    id: 'dpf_regeneration',
    phase: 'probefahrt',
    title: 'Regeneration erkennen und ausfahren',
    what: {
      base: 'Während der Fahrt auf mehrere gleichzeitige Anzeichen einer Filterregeneration achten: erhöhte Leerlaufdrehzahl, dauerhaft laufender Kühlerlüfter, deutlich erhöhter Momentanverbrauch im Leerlauf und eine Abgastemperatur, die auch im Schub oben bleibt.',
      diesel: 'Beim Diesel steigt die Abgastemperatur auf 550 bis 650 Grad, die Leerlaufdrehzahl auf 850 bis 950, der Leerlaufverbrauch von etwa 0,6 auf 1,2 bis 1,8 Liter je Stunde, und die angesteuerte Abgasrückführung fällt auf 0 Prozent.',
      petrol: 'Ottomotoren haben erst seit etwa Modelljahr 2018 einen Partikelfilter, er regeneriert überwiegend passiv im Schub und fällt im Betrieb kaum auf. Bei älteren Ottomotoren entfällt dieser Punkt.'
    },
    good: 'Keine Regeneration während der Probefahrt, die Abgastemperatur fällt im Schub deutlich ab.',
    bad: {
      base: 'Läuft eine Regeneration, den Motor auf keinen Fall abstellen. Stattdessen 10 bis 20 Minuten mit 60 bis 100 km/h und 1.800 bis 2.500 Umdrehungen weiterfahren. Alle Messwerte während einer Regeneration sind ungültig.',
      diesel: 'Wird die Regeneration abgebrochen, gelangt unverbrannter Diesel ins Motoröl. Wer ausgerechnet bei einer 25-Minuten-Probefahrt regeneriert, regeneriert sehr häufig, das deutet auf ein Kurzstreckenprofil oder einen Filter nahe dem Ende hin, Ersatz 1.200 bis 2.500 EUR.',
      petrol: 'Ein Ottopartikelfilter, der aktiv regeneriert oder bereits eine Warnung anzeigt, ist ungewöhnlich und deutet auf Ölverbrauch, Ersatz 900 bis 1.800 EUR.'
    },
    severity: 'hinweis',
    tool: 'OBD2-Adapter mit App'
  },
  {
    id: 'unter_das_auto',
    phase: 'danach',
    title: 'Sofort unter das warme Auto',
    what: {
      base: 'Das Fahrzeug auf denselben Platz zurückstellen und mit der Taschenlampe flach darunter schauen: Motorunterseite, Getriebeglocke, Ölwanne, Kühlerschläuche, Achsschenkel und Auspuffflansche. Nach fünf Minuten Pappe unterlegen und noch einmal nachsehen.',
      turbo: 'Bei Aufladung zusätzlich den Ölrücklauf des Turboladers und die Ladeluftrohre unter dem Motor ansehen, dort zeigt sich eine müde Wellendichtung als frischer Ölfilm.',
      diesel: 'Beim Diesel zusätzlich die Flansche von Abgasrückführung und Partikelfilter auf feuchte, schwarze Rußfahnen prüfen, sie zeigen undichte Verbindungen.'
    },
    good: 'Trocken, keine frischen Tropfen auf der Pappe.',
    bad: 'Jeder frische Tropfen ist im warmen Zustand ein echter Befund und keine Ölfeuchte. Hellbraun oder schwarz ist Motoröl, rot Getriebeöl, grün oder rosa Kühlmittel, klar-ölig Bremsflüssigkeit. Kühlmittel- oder Bremsflüssigkeitstropfen sind ein Abbruchgrund.',
    severity: 'hinweis',
    tool: 'Starke Taschenlampe und Pappe'
  },
  {
    id: 'luefterlauf',
    phase: 'danach',
    title: 'Lüfterlauf prüfen',
    what: 'Den Motor im Stand weiterlaufen lassen und die Klimaanlage auf maximale Kühlung stellen, dann warten, bis der Kühlerlüfter anspringt. Danach den Motor abstellen und zuhören, ob der Lüfter nachläuft.',
    good: 'Der Lüfter schaltet hörbar in Stufen zu, die Kühlmitteltemperatur fällt danach messbar, ein kurzer Nachlauf ist normal.',
    bad: 'Läuft der Lüfter trotz über 105 Grad gar nicht, sind Lüfter, Regelung oder Sicherung defekt, 300 bis 700 EUR, und im Sommerstau folgt die Kopfdichtung. Dauerhaft volle Stufe deutet auf einen Sensor, ein verschmutztes Kühlerpaket oder Kühlmittelmangel.',
    severity: 'teuer',
    cost: '300-700 EUR'
  },
  {
    id: 'ausgleichsbehaelter_heiss',
    phase: 'danach',
    title: 'Ausgleichsbehälter heiß beobachten',
    what: 'Den Deckel des Kühlmittelbehälters am heißen Motor auf keinen Fall öffnen. Von außen beobachten, ob die Flüssigkeit stark steigt und ob sichtbar oder hörbar Blasen aufsteigen.',
    good: 'Ruhiger Flüssigkeitsstand, allenfalls leichtes Ausdehnen ohne Blasenbildung.',
    bad: 'Aufsteigende Blasen bei laufendem warmem Motor bedeuten Verbrennungsgase im Kühlkreis und damit die Zylinderkopfdichtung, 1.500 bis 3.000 EUR. Ein Abbruchgrund, absichern lässt sich das mit einem CO2-Test in der Werkstatt.',
    severity: 'ko',
    cost: '1.500-3.000 EUR'
  },
  {
    id: 'blowby_test',
    phase: 'danach',
    title: 'Blow-by am Einfüllstutzen',
    what: 'Den Motor abstellen, fünf Minuten warten und den Ölstand warm messen. Danach den Motor starten und den Öleinfülldeckel nur lose auflegen, nicht festhalten und nicht in bewegliche Teile fassen.',
    good: 'Ölstand im Bereich, aus dem offenen Stutzen kommt allenfalls ein leichter Hauch.',
    bad: {
      base: 'Der Deckel wird durch Druck angehoben, es kommt deutlicher weißer Nebel oder ein pulsierender Druckstoß. Das bedeutet Blow-by durch Kolbenringe oder eine defekte Kurbelgehäuseentlüftung. Ölabscheider 250 bis 600 EUR.',
      petrol: 'Beim aufgeladenen Direkteinspritzer ist genau das die Vorstufe zum bekannten Ölverbrauch, Kolbenringe bei ausgebautem Motor etwa 3.000 EUR frei und 5.000 bis 6.000 EUR beim Markenhändler.',
      diesel: 'Beim Diesel kommt starker Blow-by meist zusammen mit einer verschlissenen Turboladerwelle und hohem Ölverbrauch, dann gehört der Lader mit auf die Rechnung.',
      turbo: 'Bei Aufladung drückt ein verstopfter Ölabscheider das Öl in die Ladeluftstrecke, dann ist auch der Ladeluftkühler von innen verölt.'
    },
    severity: 'ko',
    cost: '250-6.000 EUR'
  },
  {
    id: 'oelverbrauch_indizien',
    phase: 'danach',
    title: 'Indizien für Ölverbrauch sammeln',
    what: {
      base: 'Kofferraum und Ablagen nach einem mitgeführten Ölkanister absuchen und das Serviceheft nach den Stichworten Ölverbrauchsmessung und Instandsetzung durchsehen.',
      petrol: 'Zusätzlich die Zündkerzen ansprechen, falls sie zugänglich sind, ölverschmierte Kerzen sind ein direkter Beweis. Beim aufgeladenen Direkteinspritzer ist diese Prüfung Pflicht.',
      diesel: 'Zusätzlich die Ladeluftstrecke ansehen und den warmen Ölstand gegenprüfen, beim Diesel kommt Ölverbrauch meist vom Turbolader, während ein steigender Ölstand für Kraftstoffeintrag spricht.'
    },
    good: 'Kein Nachfüllkanister, dokumentierter Ölverbrauch unter 0,1 Liter je 1.000 km, keine Auffälligkeiten im Serviceheft.',
    bad: {
      base: 'Ein Ölkanister im Kofferraum mit dem Satz, den brauche ich immer dabei, ist ein direkter Beweis. Zulässig sind bis 0,5 Liter je 1.000 km, praktisch ist alles über 0,3 Liter bereits auffällig, denn per OBD ist Ölverbrauch nicht messbar.',
      petrol: 'Bei den betroffenen Motorgenerationen ohne belegte Kolbenring-Instandsetzung ist das ein Abbruchgrund, die Reparatur liegt bei 3.000 bis 6.000 EUR.',
      diesel: 'Ölverbrauch ohne sichtbares Leck deutet auf den Turbolader, 1.200 bis 2.500 EUR, im schlimmsten Fall auf Kolbenringe.'
    },
    severity: 'ko',
    cost: '1.200-6.000 EUR'
  },
  {
    id: 'geruch_endrohr',
    phase: 'danach',
    title: 'Geruchsprobe und Endrohr',
    what: 'Am Motorraum und am Endrohr riechen und das Endrohr innen mit einem Papiertuch auswischen.',
    good: {
      base: 'Ein wenig warmer Öl- und Gummigeruch ist normal, das Endrohr ist innen trocken.',
      diesel: 'Trockener grauer bis schwarzer Ruß am Tuch ist beim Diesel normal.',
      petrol: 'Ein hellgrauer, trockener Belag am Tuch ist beim Ottomotor normal.'
    },
    bad: {
      base: 'Ein öliger, schmieriger schwarzer Film am Tuch bedeutet Ölverbrauch und ist zusammen mit niedrigem Ölstand ein Abbruchgrund. Scharfer Geruch nach heißem Öl deutet auf ein Leck am Krümmer, süßlicher Geruch auf Kühlmittel im Brennraum.',
      petrol: 'Beißender Schwefelgeruch deutet auf einen geschädigten Katalysator, Ersatz 500 bis 1.200 EUR.',
      diesel: 'Stechender Geruch nach unverbranntem Diesel deutet auf undichte Injektoren oder eine unvollständige Verbrennung.'
    },
    severity: 'hinweis'
  },
  {
    id: 'bremsscheiben_nach_fahrt',
    phase: 'danach',
    title: 'Bremsscheiben nach der Fahrt',
    what: 'Die Reibfläche der Bremsscheiben nach der Probefahrt noch einmal ansehen und prüfen, ob der Rostfilm weggebremst ist. Zusätzlich mit der Hand die Nähe der Felgensterne vergleichen, ob ein Rad deutlich wärmer ist.',
    good: 'Nach etwa 20 km ist der Flugrost auf der Reibfläche verschwunden und alle Räder sind ähnlich warm.',
    bad: 'Stehenbleibende Rostinseln oder ein tief narbiger Rand bedeuten, dass die Scheiben hin sind. Ein deutlich wärmeres Rad bedeutet einen schleifenden Sattel. Stark angerostete Scheiben bei geringer Laufleistung sind ein Standschaden.',
    severity: 'teuer',
    cost: '350-600 EUR'
  },
  {
    id: 'fehlerspeicher_nachher',
    phase: 'danach',
    title: 'Zweiter Fehlerspeicher-Scan',
    what: 'Alle Steuergeräte ein zweites Mal scannen und das Ergebnis mit den Fotos vom Standcheck vergleichen. Auch die Readiness-Monitore erneut ansehen. Anschließend den Adapter abziehen, denn billige Adapter halten das Steuergerät wach und entladen die Batterie.',
    good: 'Keine neuen Einträge, die Monitore unverändert oder inzwischen bereit.',
    bad: {
      base: 'Ein Code, der jetzt neu drinsteht, ist die härteste Erkenntnis des Termins und lässt sich nicht wegdiskutieren, weil der Vorher-Zustand fotografiert ist. Springt ein vorher nicht bereiter Monitor direkt auf Fehler, war das Löschen genau deswegen passiert. Neue Einträge zu Getriebe, Verbrennungsaussetzern oder Airbag sind ein Abbruchgrund.',
      turbo: 'Ein neuer Ladedruckcode nach der Vollgasfahrt ist der klassische Befund und bedeutet Lader, Wastegate oder undichte Ladeluftstrecke.',
      diesel: 'Neue Einträge zu Abgasrückführung, Partikelfilter oder Raildruck nach der Fahrt sind besonders teuer.',
      petrol: 'Neue Einträge zu Zündaussetzern oder Klopfregelung nach der Vollgasfahrt sind besonders ernst.'
    },
    severity: 'hinweis',
    tool: 'OBD2-Adapter mit App'
  },
  {
    id: 'befunde_bewerten',
    phase: 'danach',
    title: 'Befunde in Geld umrechnen',
    what: {
      base: 'Alle Befunde mit ihren Kostenspannen zusammenrechnen: Reifen 500 bis 900 EUR, Bremsen rundum 700 bis 1.100 EUR, Batterie 250 bis 350 EUR, Klimakompressor 900 bis 1.800 EUR, Stoßdämpfer je Achse 400 bis 900 EUR, Querlenker 600 bis 1.200 EUR, zweiter Schlüssel 250 bis 400 EUR.',
      petrol: 'Dazu beim Ottomotor Steuerkette ohne Beleg 1.500 bis 2.200 EUR, Zündspulen und Kerzen 250 bis 500 EUR und die Reinigung verkokter Einlassventile 400 bis 900 EUR.',
      diesel: 'Dazu beim Diesel Zahnriemen 700 bis 1.000 EUR, ein Injektor 300 bis 700 EUR, Abgasrückführventil 400 bis 800 EUR und Partikelfilter 1.200 bis 2.500 EUR.',
      turbo: 'Dazu bei Aufladung der Turbolader mit 1.200 bis 2.500 EUR.',
      manuell: 'Dazu beim Handschalter Kupplung mit Zweimassenschwungrad 900 bis 1.800 EUR.',
      dkg: 'Dazu beim Doppelkupplungsgetriebe der Ölservice 350 bis 500 EUR und das Kupplungspaket 2.600 bis 3.800 EUR.',
      wandler: 'Dazu bei der Wandlerautomatik der überfällige Ölwechsel mit 350 bis 550 EUR.',
      cvt: 'Dazu beim stufenlosen Getriebe die Instandsetzung mit 2.500 bis 3.500 EUR, die oft über dem Restwert liegt.'
    },
    good: 'Alles unter 1.000 EUR ist normale Verhandlungsmasse und lässt sich beziffern.',
    bad: 'Zwei oder drei Positionen über 1.000 EUR gleichzeitig heißen fast immer, dass entweder der Preis nicht stimmt oder das Auto nicht stimmt.',
    severity: 'hinweis'
  },
  {
    id: 'werkstattcheck_bedingung',
    phase: 'danach',
    title: 'Werkstattcheck zur Bedingung machen',
    what: {
      base: 'Bei einem ernsthaften Kandidaten einen kostenpflichtigen Gebrauchtwagencheck auf der Bühne bei einer freien Werkstatt oder einer Prüforganisation vereinbaren, 80 bis 200 EUR. Nur dort lassen sich Rost am Unterboden, Kompression und Fahrwerkszustand wirklich beurteilen.',
      turbo: 'Zusätzlich das Axial- und Radialspiel der Turboladerwelle prüfen lassen, das geht nur bei abgenommenem Ansaugschlauch.',
      sauger: 'Zusätzlich die Nockenwellenverstellung über den Stellglieddiagnosetest ansteuern lassen und die Drosselklappe auf Verschmutzung ansehen.',
      diesel: 'Zusätzlich die Injektor-Rücklaufmengen messen und die Rußbeladung des Partikelfilters auslesen lassen.',
      petrol: 'Zusätzlich einen Druckverlusttest machen lassen, er zeigt Kolbenringe und Ventile deutlicher als eine reine Kompressionsmessung.'
    },
    good: 'Der Verkäufer stimmt zu und nennt einen Termin.',
    bad: 'Wer einen unabhängigen Check ablehnt, hat einen Grund. Das OBD-Protokoll ist ein sehr guter Ausschlussfilter, aber es ersetzt die Bühne nicht.',
    severity: 'hinweis',
    cost: '80-200 EUR'
  },
  {
    id: 'kaufvertrag',
    phase: 'danach',
    title: 'Kaufvertrag richtig ausfüllen',
    what: {
      base: 'Einen Musterkaufvertrag verwenden und hineinschreiben: Zusicherung unfallfrei, abgelesener Kilometerstand, Zusicherung kein Tuning sowie jede vereinbarte Nachbesserung mit Termin.',
      diesel: 'Beim Diesel zusätzlich hineinschreiben, dass alle Rückrufe und das Abgasupdate durchgeführt sind und dass Partikelfilter und Abgasrückführung im Serienzustand arbeiten.',
      petrol: 'Beim Ottomotor zusätzlich hineinschreiben, dass Katalysator und, sofern ab Werk verbaut, der Ottopartikelfilter unverändert vorhanden sind.'
    },
    good: 'Alle Zusicherungen stehen schriftlich im Vertrag, beide Parteien unterschreiben dasselbe Exemplar.',
    bad: 'Beim Privatkauf wird die Gewährleistung ausgeschlossen. Zugesicherte Eigenschaften gelten trotzdem, aber nur wenn sie im Vertrag stehen. Mündliche Zusagen sind später wertlos.',
    severity: 'hinweis'
  },
  {
    id: 'abbruchkriterien',
    phase: 'danach',
    title: 'Abbruchkriterien durchgehen',
    what: {
      base: 'Vor der Zusage die Abbruchliste durchgehen: warm angelieferter Motor mit Ausrede, FIN-Abweichung, fehlender Fahrzeugbrief, Emulsion am Öldeckel, Öl im Kühlmittel, Blasen im Ausgleichsbehälter, Motor- oder Getriebenotlauf, fehlende Airbag- oder Motorkontrollleuchte im Selbsttest, Lackdicke über 300 Mikrometer an tragenden Teilen, Durchrostung an Schweller, Längsträger oder Federbeindom, nasser Fußraum mit Elektrikfehlern und ein widersprüchlicher Tachostand.',
      petrol: 'Dazu beim Ottomotor Kettenrasseln beim Kaltstart ohne Beleg über den Steuertrieb sowie Blaurauch zusammen mit Ölverbrauch ohne belegte Instandsetzung.',
      diesel: 'Dazu beim Diesel ein Ölstand über Maximum mit Kraftstoffgeruch, ein entfernter Partikelfilter oder eine stillgelegte Abgasrückführung und ein offenes Abgasupdate mit Stilllegungsrisiko.',
      turbo: 'Dazu bei Aufladung ein Notlauf mit Ladedruckfehler sowie ölnasse Ladeluftschläuche zusammen mit Blaurauch.',
      manuell: 'Dazu beim Handschalter eine rutschende Kupplung zusammen mit Rasseln des Zweimassenschwungrads.',
      dkg: 'Dazu beim Doppelkupplungsgetriebe Rupfen im Schleichbetrieb zusammen mit fehlendem Ölservice.',
      wandler: 'Dazu bei der Wandlerautomatik harte Schläge zusammen mit Notlauf.',
      cvt: 'Dazu beim stufenlosen Getriebe Rupfen, Aufheulen oder Notlauf ohne lückenlose Ölwechselbelege.'
    },
    good: 'Kein einziger Punkt der Liste trifft zu.',
    bad: 'Trifft auch nur ein Punkt zu, kommentarlos gehen. Ebenso, wenn der Verkäufer Kaltstart, Probefahrt, OBD-Auslesen oder Papiereinsicht verweigert.',
    severity: 'hinweis'
  }
];

const MEASURE_PLAN = [
  {
    id: 'vorbereitung_abend',
    order: 1,
    title: 'Vorbereitung am Abend vorher',
    duration: 'ca. 15 min',
    instruction: {
      base: 'Zu Hause in Car Scanner ein Fahrzeugprofil anlegen und das Verbindungsprofil auf VAG beziehungsweise die passende Marke stellen, nicht auf Generic OBD2 lassen, sonst fehlen Öltemperatur, Ladedruck-Soll, DPF-Werte und Getriebe. Zwei Sensor-Sets anlegen: Kaltstart mit sechs PIDs und Fahrt mit zwölf bis vierzehn PIDs. In den Einstellungen alle angezeigten Sensoren aufzeichnen und die GPS-Aufzeichnung einschalten, Einheiten metrisch, App-Sprache Englisch wegen des Punkts als Dezimaltrennzeichen. Multi-PID-Request einschalten und Adaptive Timing auf AT2 stellen. Den Adapter an einem beliebigen Fahrzeug probeweise verbinden, Handy laden und Powerbank einpacken.',
      petrol: 'Set Kaltstart beim Ottomotor: Kühlmittel, Ansaugluft, Drehzahl, Steuergerätespannung, Kraftstoffsystemstatus 0103 und Zündwinkel 010E. Set Fahrt zusätzlich: Luftmasse 0110, Saugrohrdruck 010B, Lambda beziehungsweise Sondenspannung vor und nach Kat, Kurzzeit- und Langzeitkorrektur 0106 und 0107, Absolutlast 0104 und Katalysatortemperatur 013C. Vorab prüfen, ob die Gemischkorrekturen und die Sonde nach Kat im Profil überhaupt antworten, ohne sie ist die halbe Auswertung tot.',
      diesel: 'Set Kaltstart beim Diesel: Kühlmittel, Ansaugluft, Drehzahl, Steuergerätespannung, Raildruck und, falls das Markenprofil ihn liefert, Vorglühdauer oder Glühkerzenstatus. Set Fahrt zusätzlich: Luftmasse 0110, Absolutlast 0104, angesteuerte und tatsächliche Abgasrückführung, Abgastemperatur und Öltemperatur. Die drei VAG-Custom-PIDs für den Partikelfilter anlegen, aber ausgeschaltet lassen, sie werden nur einmal im Stand abgerufen. Zündwinkel-PIDs gehören hier nicht ins Set. Der Lambdawert dagegen ist brauchbar: er liegt beim Diesel je nach Last zwischen etwa 1,2 und 3,5 und bildet die Abgasrückführrate und die Rauchbegrenzung ab.',
      turbo: 'Ladedruck-Ist und Ladedruck-Soll gehören zwingend ins Fahrt-Set, dazu die Ladelufttemperatur. Prüfen, ob das Profil mehr liefert als den Standard-PID 010B, der bei 255 kPa gedeckelt ist, und den markeneigenen Erweiterungswert vorab suchen.',
      sauger: 'Ohne Aufladung gibt es keinen Ladedruck und keine Ladelufttemperatur. Statt Ladedruck-Ist und -Soll den Saugrohrdruck 010B als Lastsignal ins Fahrt-Set nehmen, dazu Drosselklappenstellung 0111 und Ansauglufttemperatur 010F.'
    },
    reveals: {
      base: ['ob der Adapter die CAN-Verbindung überhaupt stabil hält', 'ob Öltemperatur und Getriebewerte verfügbar sind', 'ob die CSV später sauber importierbar ist'],
      petrol: ['ob Gemischkorrekturen, Kraftstoffsystemstatus und Zündwinkel im Profil antworten'],
      diesel: ['ob Raildruck, Abgasrückführung und die DPF-Custom-PIDs im Profil antworten']
    },
    goodIf: {
      base: 'Die Verbindung steht in unter 30 Sekunden, beide Sets sind in drei Sekunden umschaltbar, Multi-PID bringt bis zu sechs Standard-PIDs pro Anfrage und damit Faktor 3 bis 4 auf die Abtastrate.',
      petrol: 'Kurzzeit- und Langzeitkorrektur, Kraftstoffsystemstatus und Zündwinkel liefern beim Probelauf plausible Werte statt Striche.',
      diesel: 'Raildruck und Abgasrückführung liefern beim Probelauf plausible Werte, und die Custom-PIDs 22114F, 221156 und 22115E antworten überhaupt.'
    },
    badIf: {
      base: 'Billige ELM327-Clones verlieren bei VAG gern die CAN-Verbindung. Wer beim Termin noch Profile anlegt, verliert den Kaltstart, und den gibt es nur einmal.',
      diesel: 'Antworten die DPF-Custom-PIDs erst beim Termin nicht, fehlt der wichtigste Kostenblock des Diesels komplett und lässt sich nicht nachholen.'
    }
  },
  {
    id: 'stand_zuendung_an',
    order: 2,
    title: 'Zündung an, Motor aus',
    duration: 'ca. 5 min',
    instruction: {
      base: 'Adapter einstecken, Zündung in Stufe 2 einschalten, Motor ausdrücklich nicht starten. Verbindung aufbauen und die Aufzeichnung sofort starten. Den Lampentest beobachten. Dann einen erweiterten Scan über alle Module fahren und zu jedem Code den Freeze-Frame abfotografieren. Anschließend die Bereitschaftstests aufrufen sowie die PIDs Distance travelled since codes cleared 0131, Time since trouble codes cleared 014E, Warm-ups since codes cleared 0130 und Distance travelled with MIL on 0121 ablesen. Zuletzt die Steuergerätespannung 0142 einmal ohne und einmal zehn Sekunden mit Licht und Gebläse ablesen. Den Fehlerspeicher nicht löschen.',
      petrol: 'Beim Ottomotor umfasst die Readiness-Liste Katalysator, Sauerstoffsonden, Sondenheizung, Sekundärluft, Tankentlüftung und Abgasrückführung. Eine Vorglühkontrolle gibt es nicht, dafür muss die Motorkontrollleuchte im Lampentest sichtbar aufleuchten und nach dem Test wieder ausgehen.',
      diesel: 'Beim Diesel muss die Vorglühkontrolle aufleuchten und bei kaltem Motor 1 bis 3 Sekunden stehen bleiben, das ist der einzige Zeitpunkt des Termins, an dem sie sichtbar ist. Die Readiness-Liste umfasst NMHC-Katalysator, NOx-Nachbehandlung, Ladedrucksystem, Abgassensoren und Partikelfilter, während Sekundärluft und Tankentlüftung prinzipbedingt leer bleiben und kein Befund sind.'
    },
    reveals: {
      base: ['gespeicherte und sporadische Fehlercodes in allen Steuergeräten', 'ob und wann der Fehlerspeicher gelöscht wurde', 'bei welcher Temperatur und Last ein Fehler aufgetreten ist', 'Zustand von Batterie und Bordnetz vor dem Start'],
      petrol: ['ob Katalysator- und Sondenmonitore je durchgelaufen sind'],
      diesel: ['ob die Vorglühanlage funktioniert', 'ob die Monitore für Partikelfilter und NOx je durchgelaufen sind']
    },
    goodIf: {
      base: 'Keine Codes, höchstens ein Monitor nicht bereit, Strecke seit Löschung hoch bis zum Anschlag von 65535 km, über 40 Warmläufe, Spannung 12,4 bis 12,7 V ohne Verbraucher und über 12,0 V mit Verbrauchern. Run time since engine start 011F muss 0 sein.',
      petrol: 'Katalysator- und Sondenmonitor stehen auf bereit, kein Pending Code aus dem Gemischbereich. Der Sekundärluftmonitor meldet bei Motoren ohne Sekundärluftsystem „nicht unterstützt“ — das ist kein Befund.',
      diesel: 'Die Vorglühkontrolle erlischt nach 1 bis 3 Sekunden, DPF- und NOx-Monitor stehen auf bereit.'
    },
    badIf: {
      base: 'Zwei oder mehr Monitore nicht bereit, Strecke seit Löschung unter 100 km, Zeit unter 2.000 Minuten oder weniger als fünf Warmläufe bedeuten frisch gelöscht. Spannung unter 12,2 V bedeutet eine alte Batterie, unter 11,8 V mit Verbrauchern eine Batterie am Ende. Ist die Laufzeit seit Motorstart nicht 0, lief der Motor gerade noch.',
      petrol: 'Ein nicht bereiter Katalysatormonitor zusammen mit frisch gelöschtem Speicher ist der Klassiker vor einem anstehenden Kat- oder Sondenschaden, 400 bis 1.200 EUR.',
      diesel: 'Blinkt die Vorglühkontrolle oder bleibt sie dunkel, liegt ein Fehler in Glühkerzen oder Glühzeitsteuergerät vor. Ein nicht bereiter DPF-Monitor bei frisch gelöschtem Speicher deutet darauf, dass genau dort etwas verschwinden sollte.'
    },
    critical: true
  },
  {
    id: 'dpf_standwerte',
    order: 3,
    title: 'DPF-Standwerte ablesen',
    duration: 'ca. 2 min',
    instruction: 'Beim Diesel vor dem Start die VAG-Custom-PIDs 22114F Rußmasse berechnet, 221156 Strecke seit letzter Regeneration und 22115E Motorlaufzeit seit letzter Regeneration einmal aufrufen, ablesen und abfotografieren. Danach wieder deaktivieren, weil jeder Custom-PID die Gesamtabtastrate um etwa 15 Prozent senkt und sich die Werte in 25 Minuten ohnehin kaum ändern.',
    reveals: ['Beladungszustand des Partikelfilters', 'wie oft das Fahrzeug regeneriert und damit sein Streckenprofil', 'Hinweise auf einen stillgelegten Filter'],
    goodIf: 'Rußmasse unter 24 g, Strecke seit der letzten Regeneration 300 bis 800 km, Differenzdruck im warmen Leerlauf später 0 bis 15 mbar.',
    badIf: 'Rußmasse über 40 g lässt nur noch eine Fahrregeneration zu, über 45 g muss der Filter getauscht werden. Wiederholt unter 100 bis 200 km seit der letzten Regeneration bedeutet ein Regenerationsproblem durch Injektor, Abgasrückführung, Differenzdrucksensor oder Ölverdünnung. Fehlende Werte zusammen mit einem Differenzdruck von 0 mbar in allen Lastzuständen deuten auf einen stillgelegten Filter, und das ist ein Kaufabbruch.',
    fuel: 'diesel'
  },
  {
    id: 'kaltstart_leerlauf',
    order: 4,
    title: 'Kaltstart mit 120 s Leerlauf',
    duration: 'ca. 4 min',
    instruction: {
      base: 'Das ist der wichtigste Punkt des gesamten Termins und es gibt ihn genau einmal, ein verpatzter Kaltstart ist für diesen Termin verloren. Zum Verkäufer sagen: bitte noch nicht starten, ich sage Bescheid. Sensor-Set Kaltstart wählen, die Aufzeichnung läuft bereits seit dem Standcheck. Dann starten lassen und den Motor genau zwei Minuten im Leerlauf laufen lassen, kein Gas, Klima aus, Gebläse aus, Lenkrad nicht bewegen. Gleichzeitig mit den Ohren und den Augen mitprüfen: Startgeräusch, Laufruhe und Rauchfarbe am Endrohr.',
      petrol: 'Auf Kettenrasseln in den ersten zwei bis drei Sekunden achten, das ist der teuerste hörbare Befund des Ottomotors. Die Katheizphase läuft in den ersten 20 bis 60 Sekunden: erhöhte Leerlaufdrehzahl und stark nach spät verstellter Zündwinkel. Klima und Gebläse müssen deshalb aus bleiben, sonst bricht das Steuergerät die Katheizung ab und die Messung ist entwertet. Blauer Rauch beim ersten Gasstoß deutet auf Ventilschaftdichtungen.',
      diesel: 'Zündung an und warten, bis die Vorglühkontrolle erlischt, erst dann starten lassen und die Vorglühdauer mitstoppen. Auf Nageln achten, das nach 20 Sekunden nicht leiser wird, und auf einzelne unrunde Zylinder im Standgas. Weißer Rauch länger als 30 Sekunden deutet auf Glühkerzen oder Injektoren, blauer auf Öl, schwarzer auf ein Gemischproblem.',
      turbo: 'Nach dem Start die ersten 30 Sekunden konsequent kein Gas geben, der Lader läuft in dieser Zeit ohne Öldruckreserve. Ein Pfeifen oder Sirren, das mit der Drehzahl steigt, gehört ins Protokoll.'
    },
    reveals: {
      base: ['ob es überhaupt ein echter Kaltstart ist', 'Startdauer und Spannungseinbruch beim Anlassen', 'Leerlaufdrehzahl-Verlauf und Drehzahlstreuung als Maß für die Laufruhe'],
      petrol: ['Katheizphase, Einlaufen der Lambdaregelung und den gespeicherten Adaptionswert der Gemischkorrektur'],
      diesel: ['Vorglühdauer und damit den Zustand der Glühanlage', 'Raildruckaufbau und Druckstabilität im kalten Leerlauf']
    },
    goodIf: {
      base: 'Kühlmittel, Ansaugluft und Umgebung liegen weniger als 3 bis 5 Kelvin auseinander. Drehzahlstreuung in den ersten 60 s unter 40 pro Minute, danach ruhiger werdend.',
      petrol: 'Der Motor zündet in 0,5 bis 1,5 s, Spannungsminimum mindestens 10,0 V. Startüberhöhung auf 1100 bis 1400 pro Minute und Rückgang binnen 120 s auf 700 bis 800. Der Kraftstoffsystemstatus springt binnen 30 bis 90 s von Open Loop auf Closed Loop, der Zündwinkel liegt in den ersten 20 bis 60 s bei minus 5 bis plus 8 Grad, die Langzeitkorrektur zwischen minus 8 und plus 8 Prozent, die Luftmasse im kalten Leerlauf bei 3,0 bis 4,5 g/s.',
      diesel: 'Der Motor zündet in 1,0 bis 2,0 s, Spannungsminimum mindestens 9,5 V, Vorglühdauer bei 5 bis 15 Grad Umgebung 2 bis 6 s. Startdrehzahl 850 bis 1000 pro Minute mit Rückgang auf 780 bis 830. Der Raildruck steigt in unter 2 s auf 250 bis 350 bar und steht danach ruhig, Schwankung unter 30 bar. Der Zündwinkel ist hier ohne Aussage; der Lambdawert zeigt im Leerlauf Werte um 3 und fällt unter Last, das ist normal.'
    },
    badIf: {
      base: 'Kühlmittel von 35 bis 60 Grad bedeutet, der Motor lief vor 30 bis 90 Minuten, über 70 Grad bedeutet vorgewärmt und der Kaltstart ist verloren. Fehlende Startüberhöhung, Sägen um mehr als 80 pro Minute, Absacken unter 550 oder dauerhaft über 1000 nach zwei Minuten. Drehzahlstreuung über 70 pro Minute.',
      petrol: 'Orgeln über 2,5 s, Spannungsminimum unter 9,0 V. Nach über 120 s immer noch Open Loop bedeutet Lambdasonde oder Sondenheizung, 250 bis 500 EUR. Langzeitkorrektur über plus 20 Prozent bedeutet Falschluft oder Luftmassenmesser, unter minus 20 Prozent ein tropfendes Einspritzventil oder eine defekte Kurbelgehäuseentlüftung. Steht der Zündwinkel sofort auf früh und die Drehzahl schon nach 5 s bei 700, fehlt die Katheizung und der Kat altert entsprechend.',
      diesel: 'Orgeln über 3 s, Spannungsminimum unter 9,0 V. Vorglühen über 15 s, gar kein Vorglühen oder eine blinkende Kontrolle bedeutet Glühkerzen oder Glühzeitsteuergerät, 150 bis 600 EUR. Steigt der Raildruck langsam an, erreicht er die 250 bar nicht oder schwankt er im Leerlauf um mehr als 50 bar, deutet das auf Hochdruckpumpe, Druckregelventil oder Injektor-Rücklauf, 600 bis 2.500 EUR.'
    },
    critical: true
  },
  {
    id: 'warmlauffahrt',
    order: 5,
    title: 'Warmlauffahrt bis Betriebstemperatur',
    duration: 'ca. 4 min',
    instruction: {
      base: 'Das Sensor-Set auf Fahrt umschalten und losfahren. Ortsdurchfahrt und Landstraße, 50 bis 80 km/h, Drehzahl unter 2.500, kein Vollgas und keine Volllast. Ziel ist Kühlmittel stabil über 88 Grad und Öl über 80 Grad. Nebenbei die Lenkung auf gerader Strecke kurz loslassen, einmal auf freier Strecke von 60 auf 0 fest bremsen und mit offenem Fenster auf Radlagergeräusche hören.',
      petrol: 'Strecke etwa 4 bis 6 km, der Ottomotor ist damit sicher warm.',
      diesel: 'Strecke eher 6 bis 8 km und mehr Landstraße als Ortsdurchfahrt, weil der Diesel in Teillast kaum Abwärme erzeugt. Startet in dieser Phase eine Regeneration, erkennbar an Abgastemperaturen über 500 Grad, erhöhtem Leerlauf und abgeschalteter Abgasrückführung, den Volllastteil verschieben, bis sie beendet ist, sonst sind alle Folgewerte verfälscht.'
    },
    reveals: {
      base: ['Thermostat- und Wasserpumpenverhalten über die Aufheizkurve', 'ob das Fahrzeug später überhaupt gültige Volllastwerte liefern kann', 'erste Hinweise auf Spur, Bremse und Radlager'],
      petrol: ['ob die Lambdaregelung nach dem Warmlauf sauber im geschlossenen Regelkreis bleibt'],
      diesel: ['ob gerade eine Regeneration läuft und damit der ganze Messplan verschoben werden muss']
    },
    goodIf: {
      base: 'Die Kühlmitteltemperatur steigt monoton und flacht dann ab. Die nominale Öffnungstemperatur liegt je nach Motor zwischen 85 und 95 Grad, ein Kennfeldthermostat darf im Sparbetrieb bis 100 bis 105 Grad regeln und bei Last auf 85 bis 90 senken, das ist normal.',
      petrol: 'Das Kühlmittel erreicht 85 Grad in 4 bis 7 Minuten.',
      diesel: 'Das Kühlmittel erreicht 85 Grad in 6 bis 10 Minuten, die Abgastemperatur bleibt in Teillast unter 400 Grad, die angesteuerte Abgasrückführung arbeitet bereits.',
      turbo: 'Ansauglufttemperatur nach dem Ladeluftkühler im Stadtbetrieb Umgebung plus 15 bis 30 Kelvin.',
      sauger: 'Ansauglufttemperatur im Stadtbetrieb Umgebung plus 15 bis 35 Kelvin, im Stand nach der Fahrt auch kurz mehr, weil ohne Ladeluftkühler direkt die Motorraumwärme angesaugt wird.'
    },
    badIf: {
      base: 'Über 12 Minuten bis 85 Grad oder eine Endtemperatur, die bei 70 bis 82 Grad stehen bleibt, bedeutet ein offen hängendes Thermostat, Fehlercode P0128 oder P2181, Reparatur 150 bis 350 EUR. Ein Sägezahnverlauf zwischen 80 und 95 Grad bedeutet unkontrolliertes Öffnen und Schließen.',
      petrol: 'Ein zu kalt laufender Ottomotor bedeutet Mehrverbrauch, Kraftstoffeintrag ins Öl und eine dauerhaft angefettete Warmlaufphase.',
      diesel: 'Ein zu kalt laufender Diesel regeneriert häufiger, verdünnt das Öl und beladet den Filter schneller. Bleibt die Innenraumheizung dabei lau, ist zusätzlich der Zuheizer defekt.',
      turbo: 'Ansaugluft dauerhaft über Umgebung plus 40 Kelvin schon bei Landstraßentempo deutet auf Ladeluftkühler oder Luftführung.'
    }
  },
  {
    id: 'konstantfahrt',
    order: 6,
    title: 'Konstantfahrt in vier Stufen',
    duration: 'ca. 5 min',
    instruction: {
      base: 'Landstraße oder Autobahn, höchster sinnvoller Gang, wenn vorhanden Tempomat. Vier Stufen mit 50, 80, 100 und 120 km/h, jede Stufe 60 bis 90 Sekunden wirklich konstant halten und zwischen den Stufen sanft beschleunigen, nicht ruckartig. Die Strecke muss eben und möglichst windstill sein, sonst sind die Lastwerte nicht vergleichbar.',
      petrol: 'Zusätzlich am Ende einer Stufe kurz auf den Leerlauf zurückgehen und die Langzeitkorrektur notieren, der Vergleich Leerlauf gegen 100 km/h trennt Falschluft von einem driftenden Luftmassenmesser.',
      diesel: 'Auf die angesteuerte und die tatsächliche Abgasrückführung achten, beide Kurven müssen in jeder Stufe eng beieinanderliegen.',
      cvt: 'Ohne feste Gangstufen liegt die Drehzahl in allen vier Stufen fast gleich. Nicht die Drehzahl, sondern die Absolutlast und den Verbrauch je Geschwindigkeitsstufe vergleichen.'
    },
    reveals: {
      base: ['Rollwiderstand und damit schleifende Bremsen oder festgegangene Radlager', 'realen Verbrauch gegen die Werksangabe', 'Tachovorlauf im Vergleich zu GPS'],
      petrol: ['die Trennung von Falschluft und driftendem Luftmassenmesser', 'ob die Klopfregelung schon in Teillast eingreift'],
      diesel: ['die Regelgüte der Abgasrückführung']
    },
    goodIf: {
      base: 'OBD-Geschwindigkeit 2 bis 5 Prozent über GPS. Die Absolutlast ist bei gleicher Geschwindigkeit in Hin- und Rückrichtung nahezu identisch.',
      petrol: 'Absolutlast bei 100 km/h eben beim 2.0 TFSI 22 bis 30 Prozent, Verbrauch 5,0 bis 6,5 l/h. Zündwinkel bei 2.000 pro Minute 25 bis 40 Grad. Langzeitkorrektur zwischen minus 8 und plus 8 Prozent, Kurzzeitkorrektur pendelt eng um null.',
      diesel: 'Absolutlast bei 100 km/h eben beim 2.0 TDI 25 bis 32 Prozent, Verbrauch 3,5 bis 4,5 l/h. Angesteuerte Abgasrückführung 15 bis 40 Prozent mit einer Regelabweichung unter plus minus 10 Prozent, Abgastemperatur 250 bis 400 Grad.',
      turbo: 'Ladelufttemperatur Umgebung plus 5 bis 15 Kelvin, Ladedruck-Ist folgt dem Soll in jeder Stufe ohne bleibende Abweichung.',
      sauger: 'Saugrohrdruck als Lastmaß bei 100 km/h eben 35 bis 55 kPa absolut, bei 120 km/h entsprechend höher, und in jeder Stufe stabil.'
    },
    badIf: {
      base: 'Absolutlast bei 100 km/h über 40 Prozent bei Windstille und ebener Strecke bedeutet einen schleifenden Sattel, ein festes Radlager oder einen platten Reifen, danach ist der Felgenstern warm. Verbrauch mehr als 25 Prozent über Werk. Tachoabweichung über 8 Prozent bedeutet eine falsche Reifengröße.',
      petrol: 'Langzeitkorrektur im Leerlauf stark positiv und bei 100 km/h nahe null bedeutet Falschluft, umgekehrt ein driftender Luftmassenmesser. Zündwinkel dauerhaft unter 18 Grad bedeutet Klopfregelung schon in Teillast.',
      diesel: 'Regelabweichung der Abgasrückführung über plus minus 20 Prozent bedeutet ein verkoktes Ventil, 400 bis 900 EUR. Eine angesteuerte Rate von dauerhaft 0 Prozent bei warmem Motor bedeutet entweder eine laufende Regeneration oder ein stillgelegtes System.',
      turbo: 'Ladelufttemperatur über Umgebung plus 25 Kelvin bei 120 km/h bedeutet einen verschmutzten oder innen ölverklebten Ladeluftkühler. Eine bleibende Soll-Ist-Abweichung schon in Teillast deutet auf Undichtigkeit im Ladeluftweg.',
      sauger: 'Erreicht der Motor eine Geschwindigkeitsstufe nur noch mit deutlich höherer Last als die Stufe darunter erwarten lässt, oder liegt der Saugrohrdruck bei 100 km/h spürbar über dem Wert vergleichbarer Fahrzeuge, deutet das auf einen zugesetzten Abgasstrang oder einen verstopften Luftfilter.'
    }
  },
  {
    id: 'volllastzuege',
    order: 7,
    title: 'Drei bis vier Volllastzüge',
    duration: 'ca. 5 min',
    instruction: {
      base: 'Nur auf einer Autobahnauffahrt oder freier Kraftfahrstraße bei trockener Fahrbahn und guter Sicht, und nur nach Rücksprache mit dem Verkäufer. Der Fahrer schaut nach vorn, die Begleitperson bedient das Handy. Der Motor muss warm sein, Öl über 80 Grad. Das Gaspedal in einer Bewegung auf 100 Prozent und dann halten, nicht modulieren, je Zug 8 bis 15 Sekunden. Mindestens drei gewertete Züge, dazwischen jeweils 2 bis 3 Minuten Konstantfahrt bei 80 bis 100 km/h zum Zurückkühlen. Vor jedem Zug drei Sekunden mit dem Fuß vom Gas fahren, das ergibt eine sichtbare Lastsenke als Trennzeichen im Log, und die Uhrzeit in eine Handynotiz schreiben.',
      petrol: 'Zugbereich etwa 2.000 bis 6.000 pro Minute, bei einem drehfreudigen Motor bis 6.500 oder bis kurz vor den Begrenzer. Der obere Bereich ab 5.000 ist der wichtigste, dort zeigt sich die Klopfregelung am deutlichsten.',
      diesel: 'Zugbereich etwa 1.500 bis 4.200 pro Minute. Oberhalb von etwa 4.000 bis 4.200 nimmt die Einspritzmenge ohnehin ab, wer bis 6.000 zieht, misst nur die Abregelung und verfälscht den Vergleich der Züge untereinander.',
      manuell: 'Dritter Gang, während des gesamten Zugs nicht schalten und nicht auskuppeln.',
      wandler: 'Wählhebel in S oder in die manuelle Gasse und Gang 3 fest vorwählen, sonst schaltet der Kickdown mitten im Zug hoch und der Zug ist unbrauchbar. Falls die Automatik trotzdem hochschaltet, den Zug verwerfen statt ihn zu werten.',
      dkg: 'Manueller Modus über Paddles oder Gasse, Gang 3 fest. Viele Doppelkupplungsgetriebe schalten am Begrenzer trotzdem selbsttätig hoch, deshalb den Zug lieber 200 bis 300 pro Minute vor dem Begrenzer beenden.',
      cvt: 'Ein stufenloses Getriebe hält keinen Gang: Bei Volllast springt die Drehzahl auf den Leistungspunkt und bleibt dort, während die Geschwindigkeit steigt. Statt eines Drehzahlbands werden hier die Konstanz dieser Drehzahl und der Geschwindigkeitszuwachs über die Zeit bewertet. Falls simulierte Stufen vorhanden sind, diese nutzen.'
    },
    reveals: {
      base: ['Reproduzierbarkeit der Leistung über mehrere Züge', 'Wärmehaushalt von Kühlmittel und Öl sowie eingreifenden Bauteilschutz'],
      petrol: ['ob die Klopfregelung eingreift und ob sie von Zug zu Zug stärker wird', 'ob die Volllastanfettung noch aktiv ist'],
      diesel: ['ob die Abgasrückführung unter Volllast sauber schließt', 'Abgastemperaturniveau und Rauchbegrenzung'],
      turbo: ['Ladedruckaufbau und Verlaufsform des Laders', 'Wärmehaushalt der Ladeluft']
    },
    goodIf: {
      base: 'Absolutlast im Peak über alle Züge mit unter 5 Prozent Streuung reproduzierbar, Kühlmittel bleibt bei 88 bis 98 Grad, Öltemperatur unter 125 Grad, kein Drehmomentrücknahme-Eintrag im Log.',
      petrol: 'Zündwinkel bei 3.000 bis 4.500 pro Minute plus 5 bis plus 15 Grad, Zug 3 innerhalb von 2 Grad von Zug 1. Lambda unter Volllast 0,80 bis 0,88. Luftmasse im Peak beim 2.0 TFSI 110 bis 150 g/s.',
      diesel: 'Angesteuerte Abgasrückführung 0 Prozent, Luftmasse im Peak beim 2.0 TDI 55 bis 85 g/s, Abgastemperatur am Zugende 650 bis 780 Grad, Raildruck folgt dem Soll bis 1.600 bis 1.800 bar ohne bleibende Abweichung.',
      turbo: 'Ladedruck absolut beim 2.0 TFSI etwa 200 bis 225 kPa, beim 2.0 TDI etwa 220 bis 250 kPa, sauberer Anstieg und dann Plateau, Soll-Ist-Abweichung unter 100 mbar. Absolutlast im Peak 150 bis 190 Prozent. Ladelufttemperatur am Zugende Umgebung plus 15 bis 30 Kelvin und Rückkühlung auf plus 10 Kelvin binnen 30 bis 60 Sekunden.',
      sauger: 'Es gibt keinen Ladedruck. Der Saugrohrdruck geht bei Volllast auf 95 bis 100 kPa, also nahe Umgebungsdruck, und bleibt über den gesamten Zug oben. Die Absolutlast erreicht 90 bis 100 Prozent statt der 150 bis 190 Prozent eines aufgeladenen Motors, das ist der Normalfall und kein Leistungsmangel.'
    },
    badIf: {
      base: 'Fällt die Absolutlast von Zug 1 zu Zug 3 systematisch, greift der Bauteilschutz. Kühlmittel über 105 Grad oder Öltemperatur über 130 Grad im Zug bedeutet ein Kühlungsproblem, dann abbrechen.',
      petrol: 'Zündwinkel um oder unter 0 Grad über mehrere Züge bedeutet starke Klopfregelung, die Ursachen reichen von falschem Sprit über verkokte Einlassventile bis zum Kolbenschaden. Ist Zug 3 systematisch 3 bis 6 Grad später als Zug 1, liegt ein Wärmeproblem vor. Lambda um 1,00 unter Volllast bedeutet eine deaktivierte Anfettung durch Chiptuning oder eine defekte Sonde.',
      diesel: 'Angesteuerte Abgasrückführung über 5 Prozent bei Volllast bedeutet ein hängendes Ventil. Abgastemperatur über 800 Grad, sichtbarer Rußstoß am Endrohr oder ein Raildruck, der dem Soll um mehr als 100 bar hinterherhinkt, deuten auf Injektoren, Hochdruckpumpe oder eine überforderte Rauchbegrenzung. Ein Leistungseinbruch mit steigendem Abgasgegendruck deutet auf einen zugesetzten Partikelfilter.',
      turbo: 'Ladedruck mehr als 15 Prozent unter Erwartung bedeutet Lader, verstellbare Turbinengeometrie oder Undichtigkeit, 1.200 bis 2.500 EUR. Der Standard-PID 010B ist bei 255 kPa gedeckelt, starke Motoren brauchen den markeneigenen Erweiterungswert. Ein Einbruch bei mittlerer Drehzahl deutet auf die Ladedruckregelung, Zacken auf einen aufplatzenden Ladeluftschlauch. Ladelufttemperatur über Umgebung plus 40 Kelvin.',
      sauger: 'Bleibt der Saugrohrdruck bei Volllast unter 90 kPa, öffnet die Drosselklappe nicht ganz oder der Luftfilter ist zu. Fällt er mit steigender Drehzahl wieder ab und bricht die Absolutlast oberhalb von 4.000 pro Minute ein, deutet das auf einen zugesetzten Katalysator.'
    }
  },
  {
    id: 'schubphasen',
    order: 8,
    title: 'Schubphasen nach jedem Zug',
    duration: 'ca. 2 min',
    instruction: {
      base: 'Direkt nach jedem Volllastzug das Gas vollständig wegnehmen, im Gang bleiben, nicht auskuppeln und nicht bremsen, und 10 bis 15 Sekunden ausrollen lassen. Danach sanft wieder Gas geben. Mindestens dreimal, jeweils im Anschluss an einen Volllastzug, damit gleichzeitig die Abkühlpause abgedeckt ist.',
      petrol: 'Bis etwa 1.500 pro Minute ausrollen lassen. Der Schub ist beim Ottomotor die schärfste Falschluftprüfung des ganzen Termins, weil das Saugrohrvakuum jede Nebenluft sofort sichtbar macht. Die Wiedereinsetzdrehzahl liegt bei etwa 1.100 bis 1.300 pro Minute, dort springt der Verbrauch von 0,0 weg.',
      diesel: 'Bis etwa 1.200 bis 1.500 pro Minute ausrollen lassen. Eine Vakuumprüfung über den Saugrohrdruck gibt es hier nicht, der Diesel läuft ungedrosselt. Stattdessen die Abgastemperatur beim Ausrollen beobachten, sie verrät eine laufende Regeneration.',
      manuell: 'Im dritten Gang bleiben und die Kupplung durchgehend geschlossen halten, jedes Auskuppeln beendet die Schubabschaltung sofort.',
      wandler: 'In der manuellen Gasse bleiben, sonst schaltet das Getriebe im Schub hoch, die Drehzahl fällt schlagartig und die Phase bricht ab. Öffnet dabei die Wandlerüberbrückung, endet die Schubabschaltung ebenfalls.',
      dkg: 'In der manuellen Gasse bleiben, sonst schaltet das Getriebe im Schub hoch und die Phase bricht ab.',
      cvt: 'Der Variator verstellt im Schub laufend, eine feste Drehzahlgrenze gibt es nicht. Die Schubphase deshalb über die Zeit von 10 bis 15 Sekunden abgrenzen und die Auswertung allein auf Verbrauch und Last stützen.'
    },
    reveals: {
      base: ['ob die Schubabschaltung arbeitet', 'innere Reibung, schleifende Bremse oder hängende Drosselklappe', 'ob beim Wiedereinsetzen Aussetzer auftreten'],
      petrol: ['Falschluft über das Saugrohrvakuum, empfindlicher als jede Gemischkorrektur'],
      diesel: ['eine laufende Regeneration über die Abgastemperatur im Schub']
    },
    goodIf: {
      base: 'Der Verbrauch fällt binnen 1 bis 2 Sekunden auf 0,0 l/h. Die Absolutlast fällt unter 12 bis 15 Prozent. Der Drehmomentaufbau beim Wiedereinsetzen ist ruckfrei und die Verzögerungsrate über mehrere Schubphasen konsistent.',
      petrol: 'Der Saugrohrdruck fällt auf 20 bis 35 kPa absolut, also starkes Vakuum, und bleibt dort stabil, solange geschoben wird. Die Gemischkorrekturen wandern im Schub nicht.',
      diesel: 'Der Saugrohrdruck fällt nur auf Umgebungsdruck von 95 bis 101 kPa, weil der Motor ungedrosselt läuft, das ist normal und kein Defekt. Die Abgastemperatur fällt binnen 20 bis 40 Sekunden unter 300 Grad.'
    },
    badIf: {
      base: 'Bleibt der Verbrauch über 0,3 l/h, greift die Schubabschaltung nicht. Absolutlast bleibt über 25 Prozent, dann bremst etwas mit.',
      petrol: 'Bleibt der Saugrohrdruck über 45 kPa, bedeutet das Falschluft, eine hängende Drosselklappe oder eine undichte Kurbelgehäuseentlüftung. Aussetzer beim Wiedereinsetzen deuten auf Zündspulen oder Zündkerzen, 150 bis 600 EUR.',
      diesel: 'Bleibt die Abgastemperatur bei 550 bis 650 Grad und der Verbrauch im Schub deutlich über 0,0 l/h, läuft eine Regeneration, und dann sind Rußmasse und Verbrauchswerte dieses Termins nicht vergleichbar. Ruckeln beim Wiedereinsetzen deutet auf Injektoren oder auf Spiel im Antriebsstrang.'
    }
  },
  {
    id: 'uebersetzungstest',
    order: 9,
    title: 'Übersetzungstest für das Getriebe',
    duration: 'ca. 3 min',
    instruction: {
      base: 'Je Gangstufe eine kurze Konstantfahrt und zusätzlich eine Beschleunigung unter Last fahren, damit das Verhältnis von Drehzahl zu Geschwindigkeit im Log eindeutig bestimmbar ist. Die Daten des Volllastzugs im dritten Gang liefern den Test gratis mit.',
      manuell: 'Alle Gänge von 1 bis 5 oder 6 einzeln durchfahren, jeweils 10 bis 15 Sekunden konstant. Zusätzlich im höchsten Gang aus etwa 1.500 pro Minute voll durchbeschleunigen, das ist die eigentliche Kupplungsprüfung. Beim Lastwechsel auf Rupfen und auf Klackern aus dem Zweimassenschwungrad achten.',
      wandler: 'Zusätzlich 100 km/h im höchsten Gang mit geschlossener Wandlerüberbrückung bei konstantem Pedal halten. Die Überbrückung schließt meist ab etwa 60 km/h bei leichter Last, davor ist eine Drehzahldifferenz von 100 bis 300 pro Minute normal und kein Befund.',
      dkg: 'Zusätzlich zweimal aus dem Stand sanft anfahren und einmal bei 5 bis 15 km/h kriechen lassen. Rupfen, Ruckeln oder Kupplungsgeruch sind hier teurer als jeder Messwert, eine Mechatronik oder ein Kupplungspaket liegt bei 1.500 bis 3.500 EUR. Die Schaltzeiten im Log prüfen, sie liegen unter 0,5 Sekunden.',
      cvt: 'Ein stufenloses Getriebe hat kein festes Verhältnis, es gibt hier nichts je Gang zu vermessen. Stattdessen prüfen, ob die Drehzahl bei konstantem Pedal ruhig steht und beim Beschleunigen ohne Sprung auf einen Wert hochläuft und dort bleibt. Zusätzlich aus 40 km/h halb durchtreten und die Verstellung beobachten.'
    },
    reveals: {
      base: ['ob der Kraftschluss im Antriebsstrang intakt ist', 'ob das Verhältnis von Drehzahl zu Geschwindigkeit unter Last wegdriftet'],
      manuell: ['Kupplungsschlupf und Zustand des Zweimassenschwungrads'],
      wandler: ['Wandlerschlupf und den Zustand der Überbrückungskupplung'],
      dkg: ['Anfahrverhalten und Schaltzeiten der Doppelkupplung'],
      cvt: ['ob der Variator ruhig oder unruhig regelt']
    },
    goodIf: {
      base: 'Das Verhältnis von Drehzahl zu Geschwindigkeit bleibt je Stufe konstant, auch unter Volllast.',
      petrol: 'Beim Ottomotor mit fester Übersetzung liegt der höchste Gang bei 100 km/h grob bei 2.200 bis 2.700 pro Minute — die schnelle Plausibilitätsprüfung der Achsübersetzung. Beim stufenlosen Getriebe entfällt sie.',
      diesel: 'Beim Diesel mit fester Übersetzung liegt der höchste Gang bei 100 km/h grob bei 1.700 bis 2.100 pro Minute — die schnelle Plausibilitätsprüfung der Achsübersetzung. Beim stufenlosen Getriebe entfällt sie.',
      manuell: 'Beim Durchbeschleunigen im höchsten Gang steigen Drehzahl und Geschwindigkeit im festen Verhältnis, kein Hochlaufen der Drehzahl ohne Tempozuwachs.',
      wandler: 'Bei geschlossener Wandlerüberbrückung folgt die Drehzahl exakt dem Übersetzungsverhältnis, Wandern unter 60 pro Minute.',
      dkg: 'Anfahren ohne Rupfen, Schaltvorgänge kurz und mit sauberem Drehzahlsprung auf den rechnerisch passenden Wert.',
      cvt: 'Die Drehzahl steht bei konstantem Pedal ruhig und verstellt bei Lastwechsel gleichmäßig statt sprunghaft.'
    },
    badIf: {
      base: 'Steigt das Verhältnis unter Last an, klettert also die Drehzahl und das Tempo nicht, bedeutet das Schlupf im Antriebsstrang.',
      manuell: 'Ein Hochlaufen der Drehzahl beim Durchbeschleunigen im höchsten Gang bedeutet eine rutschende Kupplung, 800 bis 1.800 EUR mit Zweimassenschwungrad. Schlagen oder Klackern im Leerlauf bei getretener Kupplung deutet auf Ausrücklager oder Schwungrad.',
      wandler: 'Ein Wandern der Drehzahl um mehr als 60 bis 80 pro Minute bei konstantem Tempo und geschlossener Überbrückung ist ein Zeichen für eine rutschende Überbrückungskupplung, und der abgeriebene Belag wandert durch das gesamte Getriebe.',
      dkg: 'Rupfen beim Anfahren, Schaltzeiten über 1 Sekunde oder ein Drehzahlsprung ohne passenden Tempozuwachs bedeuten Kupplungspaket oder Mechatronik. Ein Springen des Verhältnisses bei konstantem Gaspedal bedeutet, dass die Kupplung nicht sauber schließt.',
      cvt: 'Springt das Verhältnis bei konstantem Gaspedal oder ruckt die Drehzahl bei der Verstellung, regelt der Variator unruhig; Schub- oder Kettenverschleiß bedeutet in der Regel Getriebetausch.'
    }
  },
  {
    id: 'heisser_leerlauf',
    order: 10,
    title: 'Heißer Leerlauf im Stand',
    duration: 'ca. 4 min',
    instruction: {
      base: 'Zurück am Ausgangspunkt den Motor auf keinen Fall abstellen. Getriebe in N oder P, Handbremse anziehen, die Aufzeichnung läuft weiter. 90 Sekunden ruhig laufen lassen mit Klima aus, Gebläse aus und ohne das Lenkrad zu bewegen. Danach 30 Sekunden mit eingeschalteter Klima. Anschließend Licht, Gebläse auf höchster Stufe, Heckscheibenheizung und Sitzheizung zuschalten und die Spannung beobachten. Dabei auf den Kühlerlüfter warten.',
      petrol: 'Beim Zuschalten der Klima auf den Drehzahleinbruch und auf die Reaktion des Zündwinkels achten, beides zeigt, wie gut die Leerlaufregelung noch arbeitet.',
      diesel: 'Läuft laut Abgastemperatur und erhöhtem Leerlauf gerade eine Regeneration, den Motor auf keinen Fall abstellen und den Verkäufer darauf hinweisen; ein Abbruch belastet den Filter zusätzlich. Die DPF-Werte aus dem Standcheck jetzt nicht erneut abrufen, das kommt beim zweiten Scan.',
      turbo: 'Vor dem späteren Abstellen den Motor mindestens eine Minute im Leerlauf nachlaufen lassen, damit der Lader zurückkühlt.'
    },
    reveals: {
      base: ['Laufruhe im warmen Zustand als einziger generischer Zugang zu Aussetzern und Kompressionsunterschieden', 'mechanische Schwergängigkeit über die Absolutlast im Leerlauf', 'Zustand von Generator und Bordnetz unter Last', 'ob der Kühlerlüfter anläuft', 'ob die Warmfahrt überhaupt echt war'],
      petrol: ['Zündwinkelruhe und Gemischkorrekturen im warmen Leerlauf'],
      diesel: ['ungleiche Injektormengen und Raildruckstabilität im warmen Leerlauf', 'ob eine Regeneration läuft']
    },
    goodIf: {
      base: 'Kühlmittel stabil 85 bis 98 Grad, ein kurzer Anstieg auf 100 bis 107 Grad nach Lastende ist normal. Drehzahlstreuung unter 20 pro Minute. Absolutlast 18 bis 26 Prozent beim Vierzylinder mit Klima aus, mit Klima plus 4 bis 8 Prozentpunkte. Spannung 13,8 bis 14,6 V und unter voller Bordnetzlast über 13,3 V. Öltemperatur 95 bis 110 Grad. Der Lüfter läuft hörbar an und die Temperatur fällt danach.',
      petrol: 'Leerlauf 680 bis 780 pro Minute, Zündwinkel 5 bis 15 Grad und ruhig, Luftmasse 2,5 bis 4,0 g/s, Verbrauch 0,7 bis 1,1 l/h, Kurzzeitkorrektur pendelt innerhalb von plus minus 5 Prozent, Sonde nach Kat liegt ruhig bei 0,6 bis 0,8 V.',
      diesel: 'Leerlauf 750 bis 830 pro Minute, Luftmasse 4,5 bis 7,0 g/s, Verbrauch 0,5 bis 0,8 l/h, Raildruck stabil bei 250 bis 350 bar mit Schwankung unter 30 bar, Abgastemperatur unter 300 Grad.'
    },
    badIf: {
      base: 'Pendelt die Temperatur zwischen 75 und 95 Grad, ist es das Thermostat, steigt sie über 112 Grad weiter, ist es die Kühlung. Drehzahlabweichung über 100 pro Minute, Streuung über 40 pro Minute, und eine deutlich schlechtere Laufruhe heiß als kalt deutet auf Kompression, Ventilspiel oder Einspritzung. Absolutlast über 32 Prozent bedeutet mechanische Schwergängigkeit, ein Nebenaggregat oder verkokte Einlasskanäle, ein Sprung über 15 Punkte beim Zuschalten der Klima einen schwergängigen Kompressor. Spannung dauerhaft unter 13,0 V unter Last bedeutet einen müden Generator oder einen rutschenden Riemen. Öltemperatur über 125 Grad bedeutet Überhitzung, unter 80 Grad war es keine echte Warmfahrt und alle Volllastwerte sind nur eingeschränkt gültig. Läuft der Lüfter trotz 105 Grad nicht, ist das ein Befund.',
      petrol: 'Ein unruhig springender Zündwinkel, eine im warmen Leerlauf davonlaufende Kurzzeitkorrektur oder eine träge Sonde nach Kat deuten auf Zündung, Falschluft oder Katalysator. Luftmasse deutlich unter 2,0 g/s bei normaler Drehzahl deutet auf einen driftenden Luftmassenmesser.',
      diesel: 'Luftmasse über 9 g/s im Leerlauf bedeutet, die Abgasrückführung schließt nicht oder ist stillgelegt. Verbrauch über 1,2 l/h zusammen mit Abgastemperaturen über 500 Grad bedeutet eine laufende Regeneration. Ein um mehr als 50 bar schwankender Raildruck oder ein hörbar ungleichmäßiger Lauf deutet auf Injektoren, 300 bis 500 EUR pro Stück.'
    }
  },
  {
    id: 'zweiter_scan_export',
    order: 11,
    title: 'Zweiter Scan und Log-Export',
    duration: 'ca. 4 min',
    instruction: {
      base: 'Alle Module erneut scannen und das Ergebnis mit den Fotos vom Standcheck vergleichen. Die Readiness-Monitore erneut ablesen. Danach die Aufzeichnung beenden, das Log nach Fahrzeug, Motorisierung, Baujahr und Ort benennen und die CSV sofort exportieren. Zum Schluss den Adapter abziehen, denn er hält sonst das Steuergerät wach und entlädt die Batterie des fremden Fahrzeugs. Den Fehlerspeicher nicht löschen.',
      petrol: 'Besonders auf neue Codes aus Zündung, Gemisch und Katalysator achten, das sind die Bereiche, die der Kaltstart und die Volllastzüge gerade belastet haben.',
      diesel: 'Vor dem Beenden die drei DPF-Custom-PIDs noch einmal aktivieren und Rußmasse sowie Strecke seit der letzten Regeneration mit den Standwerten vergleichen. Besonders auf neue Codes aus Ladedruckregelung, Abgasrückführung, Raildruck und Partikelfilter achten.'
    },
    reveals: {
      base: ['Fehler, die erst durch Kaltstart, Volllast und Schubabschaltung entstanden sind', 'ob ein vorher nicht bereiter Monitor jetzt direkt auf Fehler springt', 'die vollständige Datengrundlage für die spätere Auswertung'],
      petrol: ['ob Zündaussetzer oder Gemischfehler durch die Volllast erst ausgelöst wurden'],
      diesel: ['ob während der Fahrt regeneriert wurde und wie viel Ruß dabei abgebaut wurde']
    },
    goodIf: {
      base: 'Keine neuen Codes gegenüber dem ersten Scan, vorher nicht bereite Monitore sind jetzt bereit, und ein durchgehendes Log über die gesamte Session ist exportiert.',
      diesel: 'Rußmasse und Strecke seit der letzten Regeneration liegen plausibel nah an den Standwerten, oder es hat sichtbar sauber regeneriert.'
    },
    badIf: {
      base: 'Ein Code, der jetzt neu drinsteht, ist die härteste Erkenntnis des Termins und nicht bestreitbar, weil der Vorher-Zustand fotografiert wurde. Springt ein Monitor direkt auf Fehler oder auf einen Pending Code, wurde genau deswegen gelöscht. Fünf Log-Fragmente statt eines Logs machen den Zusammenhang zwischen Kaltstart und Volllast unauswertbar.',
      petrol: 'Neue Aussetzerzähler oder ein neuer Katalysatorcode nach den Volllastzügen sind ein direkter Preisfaktor.',
      diesel: 'Ist die Rußmasse während der kurzen Fahrt deutlich gestiegen oder steht sie unverändert bei 0,0 g, passt die Sensorik nicht zum Fahrprofil und der Verdacht auf einen stillgelegten Filter bleibt.'
    }
  }
];

const PID_SETS = {
  petrol: [
    { name: 'Engine RPM', prio: 'pflicht', why: 'Leerlaufverlauf und Drehzahlstreuung beim Kaltstart, Basis für den Übersetzungstest' },
    { name: 'Vehicle speed', prio: 'pflicht', why: 'Tachoabgleich gegen GPS und Übersetzungsverhältnis je Gang' },
    { name: 'Engine coolant temperature', prio: 'pflicht', why: 'Kaltstartnachweis, Warmlaufkurve und Thermostatbewertung' },
    { name: 'Intake air temperature', prio: 'pflicht', why: 'Ladelufttemperatur im Volllastzug und Rückkühlverhalten danach' },
    { name: 'Absolute load value', prio: 'pflicht', why: 'Rollwiderstand, Leerlauflast, Volllast-Peak und Schubbetrieb' },
    { name: 'Intake manifold absolute pressure', prio: 'pflicht', why: 'Ladedruck bei Volllast und Saugrohrvakuum im Schub als empfindlichste Falschluftprüfung' },
    { name: 'Long term fuel trim Bank 1', prio: 'pflicht', why: 'Langzeitgedächtnis des Gemischs, trennt Falschluft von driftendem Luftmassenmesser' },
    { name: 'Timing advance', prio: 'pflicht', why: 'Katheizphase im Kaltstart und Klopfregelung unter Volllast' },
    { name: 'Ambient air temperature', prio: 'wichtig', why: 'Referenz für alle Delta-Bewertungen, ohne ihn sind halbe Analysen wertlos' },
    { name: 'Control module voltage', prio: 'wichtig', why: 'Batteriezustand, Startspannungseinbruch und Generatorleistung' },
    { name: 'Short term fuel trim Bank 1', prio: 'wichtig', why: 'Regelverhalten und Dynamik der Lambdasonde' },
    { name: 'Long term fuel trim Bank 2', prio: 'wichtig', why: 'Bankabgleich, nur bei V-Motoren sinnvoll' },
    { name: 'MAF air flow rate', prio: 'wichtig', why: 'Plausibilität von Falschluft und Luftdurchsatz, Leistungsabschätzung' },
    { name: 'Engine fuel rate', prio: 'wichtig', why: 'Verbrauch gegen Werk und Nachweis der Schubabschaltung' },
    { name: 'Fuel system status', prio: 'optional', why: 'Übergang von Open Loop auf Closed Loop und damit Zustand der Lambdaregelung' },
    { name: 'Commanded equivalence ratio', prio: 'optional', why: 'Volllastanfettung, deckt eine per Chiptuning deaktivierte Anfettung auf' },
    { name: 'Engine oil temperature', prio: 'optional', why: 'belegt, ob es wirklich eine echte Warmfahrt war' },
    { name: 'Barometric pressure', prio: 'optional', why: 'Drift des Umgebungsdrucksensors, der Ladedruckregelung und Gemisch verfälscht' },
    { name: 'Absolute pedal position D', prio: 'optional', why: 'sauberes Abgrenzen der Volllastzüge im Log' },
    { name: 'Catalyst temperature Bank 1 Sensor 1', prio: 'optional', why: 'indirekter Hinweis auf den Zustand des Katalysators' },
    { name: 'Distance travelled since codes cleared', prio: 'optional', why: 'Löschnachweis, nur einmal im Stand ablesen und nicht dauerhaft mitloggen' },
    { name: 'Time since trouble codes cleared', prio: 'optional', why: 'Löschnachweis in Minuten, ebenfalls nur einmal im Stand ablesen' }
  ],
  diesel: [
    { name: 'Engine RPM', prio: 'pflicht', why: 'Leerlaufverlauf und Drehzahlstreuung als Ersatz für die Laufruheregelung, Basis für den Übersetzungstest' },
    { name: 'Vehicle speed', prio: 'pflicht', why: 'Tachoabgleich gegen GPS und Übersetzungsverhältnis je Gang' },
    { name: 'Engine coolant temperature', prio: 'pflicht', why: 'Kaltstartnachweis, Warmlaufkurve und Thermostatbewertung' },
    { name: 'Intake air temperature', prio: 'pflicht', why: 'Ladelufttemperatur im Volllastzug und Rückkühlverhalten danach' },
    { name: 'Intake manifold absolute pressure', prio: 'pflicht', why: 'Ladedruck bei Volllast und Bewertung der verstellbaren Turbinengeometrie' },
    { name: 'Absolute load value', prio: 'pflicht', why: 'Rollwiderstand, Leerlauflast und Schubbetrieb' },
    { name: 'MAF air flow rate', prio: 'pflicht', why: 'zeigt im Leerlauf, ob die Abgasrückführung wirklich öffnet oder stillgelegt ist' },
    { name: 'Fuel rail gauge pressure', prio: 'pflicht', why: 'Raildruckaufbau beim Start und Regelgüte von Pumpe und Injektoren' },
    { name: 'Commanded EGR', prio: 'pflicht', why: 'Ansteuerung der Abgasrückführung in Teillast und bei Volllast' },
    { name: 'Ambient air temperature', prio: 'wichtig', why: 'Referenz für alle Delta-Bewertungen von Ansaugluft und Kaltstart' },
    { name: 'EGR error', prio: 'wichtig', why: 'Regelabweichung deckt ein verkoktes oder hängendes Ventil auf' },
    { name: 'Exhaust gas temperature Bank 1 Sensor 1', prio: 'wichtig', why: 'wichtigster Diesel-Zusatzwert, erkennt eine laufende Regeneration des Partikelfilters' },
    { name: 'Control module voltage', prio: 'wichtig', why: 'Batteriezustand, Startspannungseinbruch und Generatorleistung' },
    { name: 'Engine fuel rate', prio: 'wichtig', why: 'Verbrauch gegen Werk, Schubabschaltung und Erkennung einer Regeneration' },
    { name: '22114F', prio: 'wichtig', why: 'VAG-Custom-PID für die berechnete Rußmasse, einmal im Stand ablesen und wieder deaktivieren' },
    { name: '221156', prio: 'wichtig', why: 'VAG-Custom-PID für die Strecke seit der letzten Regeneration, einmal im Stand ablesen' },
    { name: '22115E', prio: 'optional', why: 'VAG-Custom-PID für die Motorlaufzeit seit der letzten Regeneration' },
    { name: 'DPF differential pressure Bank 1', prio: 'optional', why: 'Differenzdruck über den Partikelfilter in Leerlauf, Teillast und Volllast' },
    { name: 'DPF temperature', prio: 'optional', why: 'Temperatur am Partikelfilter während einer Regeneration' },
    { name: 'Boost pressure control', prio: 'optional', why: 'Ansteuerung der Ladedruckregelung' },
    { name: 'Turbocharger RPM', prio: 'optional', why: 'Drehzahl des Laders, wenn das Fahrzeug den Wert bereitstellt' },
    { name: 'NOx sensor', prio: 'optional', why: 'NOx nach SCR bei Euro-6-Fahrzeugen mit AdBlue, Zielwert unter 40 bis 60 ppm' },
    { name: 'Engine oil temperature', prio: 'optional', why: 'belegt, ob es wirklich eine echte Warmfahrt war' },
    { name: 'Barometric pressure', prio: 'optional', why: 'Drift des Umgebungsdrucksensors, der die Ladedruckregelung verfälscht' }
  ]
};

const PID_LIMIT_NOTE = 'Ein einfacher ELM327-Clone schafft insgesamt nur 6 bis 10 Abfragen je Sekunde, ein guter STN-Adapter mit Multi-PID-Request bündelt bis zu sechs Standard-PIDs pro CAN-Anfrage und kommt auf 30 bis 80 Abfragen je Sekunde. Weil sich diese Gesamtrate auf alle aktiven Sensoren aufteilt, liegt die sinnvolle Obergrenze bei etwa 10 PIDs mit dem billigen und 14 bis 16 PIDs mit dem guten Adapter: darunter fällt die Rate je PID unter die 2 Hz, die Drehzahl, Last und Zündwinkel brauchen, und Startüberhöhung wie Klopfeingriff verschwinden zwischen den Messpunkten. Deshalb zwei getrennte Sets nutzen, ein schmales Kaltstart-Set mit sechs PIDs und ein breiteres Fahrt-Set, und VAG-Custom-PIDs sparsam einsetzen, weil sie sich nicht bündeln lassen und jeder von ihnen die Gesamtrate um etwa 15 Prozent senkt.';