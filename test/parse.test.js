'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, longCsv } = require('./harness');
const c = load();

test('Long-Format mit Semikolon, Anführungszeichen und Tages-Sekunden', async () => {
  const p = await c.parseCSV(longCsv([[1, 'Engine RPM', 800, 'rpm'], [2, 'Engine RPM', 900, 'rpm']]), () => {});
  assert.equal(p.meta.format, 'long');
  const s = p.series.get('Engine RPM');
  assert.equal(s.n, 2);
  assert.deepEqual(Array.from(s.v), [800, 900]);
  assert.equal(p.meta.skipped, 0);
});

test('Mitternachtsübergang wird entfaltet statt sortiert', async () => {
  const rows = [86395, 86397, 86399, 1, 3, 5].map(t => [t, 'Engine RPM', 800 + t % 7, 'rpm']);
  const p = await c.parseCSV(longCsv(rows), () => {});
  assert.deepEqual(Array.from(p.series.get('Engine RPM').t), [86395, 86397, 86399, 86401, 86403, 86405]);
  assert.ok(p.meta.tMax - p.meta.tMin < 20, 'Dauer muss ~10 s sein, nicht 24 h');
});

test('kurze Zeile erbt keine Werte der Vorzeile', async () => {
  const txt = '"SECONDS";"PID";"VALUE";"UNITS"\n"1";"Engine RPM";"800";"rpm"\n"2";"Boost"\n"3";"Engine RPM";"900";"rpm"\n';
  const p = await c.parseCSV(txt, () => {});
  assert.ok(!p.series.has('Boost'), 'Boost darf nicht mit dem Wert 800 erfunden werden');
  assert.equal(p.meta.skipped, 1);
});

test('Dezimalkomma in einer Punkt-Datei wird als Komma gelesen, nicht entfernt', async () => {
  const rows = [[1, 'Lambda', '14,7', ''], [2, 'Lambda', '1.02', ''], [3, 'Lambda', '0.98', ''], [4, 'Lambda', '1.01', '']];
  const p = await c.parseCSV(longCsv(rows), () => {});
  assert.deepEqual(Array.from(p.series.get('Lambda').v), [14.7, 1.02, 0.98, 1.01]);
});

test('Infinity ist kein Messwert', async () => {
  const p = await c.parseCSV(longCsv([[1, 'X', 5, ''], [2, 'X', '1e999', ''], [3, 'X', 7, '']]), () => {});
  assert.deepEqual(Array.from(p.series.get('X').v), [5, 7]);
});

test('deutsches Datum mit Tag <= 12 ist kein US-Datum', async () => {
  const txt = '"SECONDS";"PID";"VALUE";"UNITS"\n"03.04.2026 10:00:00";"X";"1";""\n"03.04.2026 10:00:10";"X";"2";""\n';
  const p = await c.parseCSV(txt, () => {});
  const d = new Date(p.series.get('X').t[0] * 1000);
  assert.equal(d.getUTCMonth(), 3, 'April, nicht März');
  assert.equal(d.getUTCDate(), 3);
});

test('Wide-Format: gleicher Basisname mit zwei Einheiten bleibt zwei Serien', async () => {
  const p = await c.parseCSV('Time,Speed (km/h),Speed (mph)\n1,100,62\n2,102,63\n', () => {});
  assert.equal(p.meta.format, 'wide');
  assert.equal(Array.from(p.series.keys()).length, 2);
  for (const s of p.series.values()) assert.equal(s.n, 2);
});

test('GPS wird je Quell-PID gesammelt und nur bei Positionswechsel gezählt', async () => {
  const rows = [];
  for (let t = 0; t < 10; t++) {
    rows.push([t, 'Altitude (GPS)', 10, 'm', 52.5 + t * 1e-4, 13.4]);
    rows.push([t, 'Engine RPM', 800, 'rpm', 52.5, 13.4]);
  }
  const p = await c.parseCSV(longCsv(rows), () => {});
  assert.equal(p.gps.source, 'Altitude (GPS)');
  assert.equal(p.gps.n, 10);
});

test('BOM und CRLF stören nicht', async () => {
  const p = await c.parseCSV(longCsv([[1, 'Engine RPM', 800, 'rpm']], { bom: true, crlf: true }), () => {});
  assert.equal(p.series.get('Engine RPM').n, 1);
});
