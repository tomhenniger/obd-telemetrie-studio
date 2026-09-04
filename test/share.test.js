const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const ctx = load();
const g = name => ctx.get(name);

test('Teilen: Zusammenfassung enthält Kennzahlen und Befunde, keine Route', () => {
  const ds = { t0: 1000, duration: 1800, trip: { dist: 29.28, movingTime: 900, speedAvgMoving: 61, speedMax: 156, consAvg: 13.4, fuelUsed: 3.93, co2: 9.32 },
    stats: { rpm: { max: 6319 }, coolant: { max: 95 } }, events: { stops: [1, 2] } };
  const diag = { results: [{ id: 'coolant_operating', status: 'ok', value: 93, unit: '°C', dec: 0 }, { id: 'ltft_b1', status: 'warn', value: 6.2, unit: '%', dec: 1 },
    { id: 'oil_temp', status: 'missing' }], tally: { ok: 19, warn: 1, crit: 0 } };
  const s = g('shareSummary')(ds, diag, { id: 'p', name: 'Audi 3.0 TFSI' }, { gears: [{ label: '3', kmhPer1000: 32.4 }] }, 'fahrt.csv');
  assert.equal(s.v, 1); assert.equal(s.k.dist, 29.28); assert.equal(s.k.rpmMax, 6319); assert.equal(s.k.stops, 2);
  assert.equal(s.f.length, 2, 'nur bewertete Befunde');
  assert.equal(JSON.stringify(Array.from(s.ta)), '[19,1,0]');
  const json = JSON.stringify(s);
  assert.ok(!/lat|lon|53\.|10\./.test(json), 'keine Koordinaten in der Zusammenfassung');
});

test('Teilen: kodieren und wieder lesen, Adresse enthält den Code', async () => {
  const obj = { v: 1, d: 'x.csv', k: { dist: 12.3 }, f: [['a', 'o', 1, '%']] };
  const code = await g('encodeShare')(obj);
  assert.ok(/^[rz][A-Za-z0-9_-]+$/.test(code), 'base64url mit Kennzeichen: ' + code.slice(0, 12));
  const back = await g('decodeShare')(code);
  assert.equal(back.k.dist, 12.3); assert.equal(back.f[0][0], 'a');
  const url = g('shareUrl')(code, 'https://example.org/app/');
  assert.equal(url, 'https://example.org/app/#s=' + code);
  await assert.rejects(() => g('decodeShare')('zNOTBASE64!!'), /.*/);
});

test('CSV-Teile zusammenführen: gleiche Kopfzeile, Reihenfolge nach Zeit', () => {
  const head = '"SECONDS";"PID";"VALUE";"UNITS"';
  const a = head + '\n"0";"Engine RPM";"800";"rpm"\n"1";"Engine RPM";"900";"rpm"\n';
  const b = head + '\n"120";"Engine RPM";"2000";"rpm"\n"121";"Engine RPM";"2100";"rpm"\n';
  const m = g('mergeCsvParts')([b, a]);
  const lines = m.text.trim().split('\n');
  assert.equal(lines[0], head);
  assert.equal(lines[1], '"0";"Engine RPM";"800";"rpm"', 'früherer Teil zuerst');
  assert.equal(lines.length, 5); assert.equal(m.parts, 2);
  assert.throws(() => g('mergeCsvParts')([a, '"ZEIT";"X"\n"0";"1"\n']), /verschiedene Spalten/);
  assert.throws(() => g('mergeCsvParts')([a]), /mindestens zwei/);
});

test('GPX: Punkte lesen und als Long-Zeilen anhängen', () => {
  const gpx = '<gpx><trk><trkseg>' +
    '<trkpt lat="53.1234567" lon="10.7654321"><ele>25.4</ele><time>2026-08-30T09:00:00Z</time></trkpt>' +
    '<trkpt lon="10.7655000" lat="53.1235000"><time>2026-08-30T09:00:01Z</time></trkpt>' +
    '</trkseg></trk></gpx>';
  const pts = g('parseGpx')(gpx);
  assert.equal(pts.length, 2);
  assert.equal(pts[0].lat, 53.1234567); assert.equal(pts[1].lon, 10.7655);
  assert.equal(pts[0].alt, 25.4);
  const t0 = Date.parse('2026-08-30T09:00:00Z') / 1000;
  const rows = g('gpxToLongRows')(pts, t0);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /^"0\.00";"Altitude \(GPS\)";"25\.4";"m";"53\.1234567";"10\.7654321";$/);
  assert.match(rows[1], /^"1\.00";/);
});
