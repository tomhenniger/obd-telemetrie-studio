const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const ctx = load();
const g = name => ctx.get(name);

test('maxspeed-Werte: Zahl, mph, none, walk, implizite Länderwerte, Zonen', () => {
  const p = g('parseMaxspeedValue');
  assert.equal(p('50').kmh, 50); assert.equal(p('50').kind, null);
  assert.equal(p('30 mph').kmh, 48);
  assert.equal(p('none').kmh, Infinity); assert.equal(p('none').kind, 'none');
  assert.equal(p('walk').kmh, 7);
  assert.deepEqual([p('DE:urban').kmh, p('DE:urban').kind], [50, 'urban']);
  assert.deepEqual([p('DE:rural').kmh, p('DE:rural').kind], [100, 'rural']);
  assert.equal(p('DE:motorway').kmh, Infinity);
  assert.deepEqual([p('DE:zone30').kmh, p('DE:zone30').kind], [30, 'sign']);
  assert.deepEqual([p('DE:zone:30').kmh, p('CH:rural').kmh], [30, 80]);
  assert.equal(p('signals').kind, 'unknown');
  assert.equal(p(''), null);
});

test('wayLimit: Herkunft aus Typ, Heuristik ohne Typ, Richtung', () => {
  const w = g('wayLimit');
  assert.deepEqual([w({ maxspeed: '100' }).kmh, w({ maxspeed: '100' }).kind, w({ maxspeed: '100' }).heuristic], [100, 'rural', true]);
  assert.equal(w({ maxspeed: '50' }).kind, 'urban');
  assert.equal(w({ maxspeed: '70' }).kind, 'sign');
  assert.equal(w({ maxspeed: '100', 'maxspeed:type': 'sign' }).kind, 'sign');
  assert.equal(w({ maxspeed: '50', 'source:maxspeed': 'DE:urban' }).kind, 'urban');
  assert.equal(w({ maxspeed: '100', 'source:maxspeed': 'DE:rural' }).heuristic, false);
  assert.deepEqual([w({ 'maxspeed:type': 'DE:urban' }).kmh, w({ 'maxspeed:type': 'DE:urban' }).kind], [50, 'urban']);
  assert.equal(w({ highway: 'living_street' }).kmh, 7);
  assert.equal(w({ highway: 'motorway' }).kmh, Infinity);
  assert.equal(w({ highway: 'residential' }).kmh, null);
  const t = { maxspeed: '70', 'maxspeed:forward': '50', 'maxspeed:backward': '70' };
  assert.equal(w(t, true).kmh, 50); assert.equal(w(t, false).kmh, 70); assert.equal(w(t, null).kmh, 70);
});

test('bedingte Limits: Wochentag, Uhrzeit, Nacht über Mitternacht, unbekannte Bedingungen', () => {
  const pc = g('parseConditional'), ap = g('condApplies');
  const c = pc('30 @ (Mo-Fr 07:00-17:00); 50 @ (22:00-06:00)');
  assert.equal(c.length, 2);
  assert.equal(c[0].kmh, 30); assert.deepEqual(Array.from(c[0].cond.days).sort(), [0, 1, 2, 3, 4]);
  const tue10 = { date: new Date(2026, 8, 1, 10, 0), dayKnown: true, timeKnown: true };   // Dienstag
  const sat10 = { date: new Date(2026, 8, 5, 10, 0), dayKnown: true, timeKnown: true };   // Samstag
  const tue23 = { date: new Date(2026, 8, 1, 23, 30), dayKnown: true, timeKnown: true };
  assert.equal(ap(c[0].cond, tue10), true);
  assert.equal(ap(c[0].cond, sat10), false);
  assert.equal(ap(c[0].cond, tue23), false);
  assert.equal(ap(c[1].cond, tue23), true);
  assert.equal(ap(c[1].cond, tue10), false);
  assert.equal(ap(c[0].cond, { date: new Date(2026, 8, 1, 12), dayKnown: true, timeKnown: false }), null, 'Uhrzeit unbekannt');
  assert.equal(ap(c[0].cond, { date: null }), null, 'Datum unbekannt');
  assert.equal(ap(pc('30 @ wet')[0].cond, tue10), null, 'Nässe nicht prüfbar');
  assert.equal(ap(pc('30 @ (Mo-Fr 07:00-17:00; PH off)')[0].cond, tue10), null, 'Feiertage nicht prüfbar');
  assert.equal(ap(pc('30 @ (Sa,Su)')[0].cond, sat10), true);
});

test('wirksames Limit und Bewertung: grün, rot bei Schild/Ort, gelb bei implizit, blau bei Unsicherheit', () => {
  const eff = g('effectiveLimit'), vd = g('limitVerdict'), w = g('wayLimit');
  const urban = eff(w({ maxspeed: '50', 'source:maxspeed': 'DE:urban' }), null);
  assert.equal(vd(50, urban).cat, 'ok');
  assert.equal(vd(59, urban).cat, 'sign'); assert.equal(vd(59, urban).excess, 9);
  const signed = eff(w({ maxspeed: '70', 'maxspeed:type': 'sign' }), null);
  assert.equal(vd(100, signed).cat, 'sign'); assert.equal(vd(100, signed).excess, 30);
  const rural = eff(w({ maxspeed: '100', 'source:maxspeed': 'DE:rural' }), null);
  assert.equal(vd(112, rural).cat, 'implicit'); assert.equal(vd(98, rural).cat, 'ok');
  const none = eff(w({ maxspeed: 'none' }), null);
  assert.equal(vd(180, none).cat, 'ok');
  assert.equal(vd(60, eff(w({ highway: 'residential' }), null)).cat, 'unsure');
  /* Zeitzone ohne bekannten Tag: zwischen den Limits blau, darunter grün, darüber rot */
  const zone = w({ maxspeed: '50', 'maxspeed:conditional': '30 @ (Mo-Fr 07:00-17:00)' });
  const unknown = eff(zone, { date: null, dayKnown: false, timeKnown: false });
  assert.equal(unknown.sure, false);
  assert.equal(vd(28, unknown).cat, 'ok');
  assert.equal(vd(40, unknown).cat, 'unsure');
  assert.equal(vd(55, unknown).cat, 'sign');
  /* Mit Datum entscheidet die Bedingung */
  const inZone = eff(zone, { date: new Date(2026, 8, 1, 8, 0), dayKnown: true, timeKnown: true });
  assert.equal(inZone.kmh, 30); assert.equal(vd(40, inZone).cat, 'sign');
  const offZone = eff(zone, { date: new Date(2026, 8, 5, 8, 0), dayKnown: true, timeKnown: true });
  assert.equal(offZone.kmh, 50); assert.equal(vd(40, offZone).cat, 'ok');
});

test('Zuordnung: Punkte entlang einer Straße, Bewertung je Abschnitt, Summen und Verstoßliste', () => {
  const match = g('matchTrackLimits');
  /* Zwei Straßen: Ortsdurchfahrt (50, urban) von Süd nach Nord, dann Landstraße (100 implizit) */
  const ways = [
    { id: 1, tags: { highway: 'residential', maxspeed: '50', 'source:maxspeed': 'DE:urban', name: 'Dorfstraße' },
      geom: [[53.0000, 10.0000], [53.0090, 10.0000]] },
    { id: 2, tags: { highway: 'secondary', maxspeed: '100', 'source:maxspeed': 'DE:rural', name: 'L 231' },
      geom: [[53.0090, 10.0000], [53.0270, 10.0000]] }
  ];
  const n = 60;
  const tr = { n, t: new Float64Array(n), lat: new Float64Array(n), lon: new Float64Array(n), dist: new Float64Array(n), gaps: [] };
  for (let i = 0; i < n; i++) {
    tr.t[i] = i * 2; tr.lat[i] = 53.0 + i * 0.00045; tr.lon[i] = 10.0 + (i % 2 ? 0.00004 : -0.00004);   // ~50 m Schritte, ±3 m Rauschen
    tr.dist[i] = i * 50;
  }
  /* Ort (Punkte 0–19): 45 km/h, ab Punkt 10 mal 62 km/h; Landstraße (20–59): 95, ab 40 dann 118 */
  const speed = i => i < 10 ? 45 : i < 20 ? 62 : i < 40 ? 95 : 118;
  const res = match(tr, ways, speed, () => ({ date: null, dayKnown: false, timeKnown: false }));
  const names = Array.from(res.cat).map(c => g('LIMIT_CAT_NAME')[c]);
  assert.equal(names[5], 'ok'); assert.equal(names[15], 'sign'); assert.equal(names[30], 'ok'); assert.equal(names[50], 'implicit');
  assert.equal(res.lim[5], 50); assert.equal(res.lim[50], 100);
  assert.equal(res.dist.noroad, 0, 'jeder Punkt findet seine Straße');
  assert.ok(res.dist.sign > 400 && res.dist.sign < 600, 'rot ≈ 500 m: ' + res.dist.sign);
  assert.ok(res.dist.implicit > 900 && res.dist.implicit < 1100, 'gelb ≈ 1000 m: ' + res.dist.implicit);
  assert.equal(res.segments.length, 2);
  assert.equal(res.segments[0].cat, 'implicit'); assert.equal(res.segments[0].exMax, 18); assert.equal(res.segments[0].name, 'L 231');
  assert.equal(res.segments[1].cat, 'sign'); assert.equal(res.segments[1].exMax, 12); assert.equal(res.segments[1].name, 'Dorfstraße');
  /* Punkt weit weg von jeder Straße */
  const far = { n: 2, t: [0, 2], lat: [53.5, 53.5001], lon: [10.5, 10.5], dist: [0, 11], gaps: [] };
  const r2 = match(far, ways, () => 80, null);
  assert.equal(g('LIMIT_CAT_NAME')[r2.cat[0]], 'noroad');
});

test('Abfrage: Route wird ausgedünnt, Overpass-Text enthält Polylinie und Straßenfilter', () => {
  const thin = g('limitsThinTrack'), q = g('limitsOverpassQuery');
  const n = 2000;
  const tr = { n, lat: new Float64Array(n), lon: new Float64Array(n) };
  for (let i = 0; i < n; i++) { tr.lat[i] = 53 + i * 0.00009; tr.lon[i] = 10; }   // 10 m Schritte, 20 km
  const pts = thin(tr);
  assert.ok(pts.length <= 650 && pts.length > 200, 'Punkte: ' + pts.length);
  const s = q(pts.slice(0, 3), 25);
  assert.match(s, /^\[out:json\]\[timeout:90\];way\(around:25,53\.00000,10\.00000,/);
  assert.match(s, /\["highway"\]\["highway"!~"\^\(footway\|/);
  assert.match(s, /out tags geom;$/);
});
